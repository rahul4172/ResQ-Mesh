#include <Arduino.h>
#include <SPI.h>
#include <Wire.h>
#include <LoRa.h>
#include <driver/i2s.h>
#include <esp_system.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <codec2.h>

// setup() calls codec2_create(), which needs far more than the default 8 KB stack
SET_LOOP_TASK_STACK_SIZE(32 * 1024);

// ==================================================
// RESQ-MESH - AUDIO RECEIVER  (v3: reliability build)
// ESP32 + SX1278 + MAX98357A + SSD1306 OLED
//
// Main fix: the radio now stays in CONTINUOUS receive mode and wakes the
// LoRa task through the DIO0 interrupt. The old code used the library's
// polling parsePacket(), which re-arms a short single-receive window and
// leaves small deaf gaps between windows.
// ==================================================

// ---------------- SX1278 PINS ----------------
#define LORA_SCK       18
#define LORA_MISO      19
#define LORA_MOSI      23
#define LORA_SS        5
#define LORA_RST       4
#define LORA_DIO0      34     // DIO0 MUST be wired for interrupt mode

// 1 = continuous receive + DIO0 interrupt (recommended)
// 0 = old polling method (use only if you cannot wire DIO0)
#define RX_USE_DIO0_IRQ 1

// ---------------- MAX98357A PINS -------------
#define SPK_BCLK       26
#define SPK_LRC        25
#define SPK_DIN        27
#define SPK_I2S_PORT   I2S_NUM_1
#define AMP_SD_PIN     13     // amp SD pin: HIGH = on, LOW = shutdown
#define AMP_SD_CONTROL 1      // 1 = mute the amp between transmissions, 0 = leave SD unconnected

// ---------------- OLED -----------------------
#define OLED_SDA       21
#define OLED_SCL       22
#define OLED_ADDR      0x3C

// ---------------- LORA (must match TX) -------
#define LORA_FREQ      433E6
#define LORA_SF        7
#define LORA_BW        125E3
#define LORA_CR        5
#define LORA_SYNC      0x34
#define LORA_PREAMBLE  12

// ---------------- CODEC2 (must match TX) -----
#define CODEC_MODE          CODEC2_MODE_1600
#define FRAMES_PER_PACKET   4
#define MAX_PACKET_SIZE     200
#define MAX_CODEC_SAMPLES   640

// ---------------- Packet types (must match TX)
#define PKT_VOICE      0xA1
#define PKT_GPS        0xA2

// ---------------- AUDIO ----------------------
#define AUDIO_RATE          8000
#define AUDIO_CHUNK_SIZE    160
#define JITTER_PACKETS      3        // packets buffered before playback starts (3 x 160 ms)
#define MAX_BUFFERED        (JITTER_PACKETS + 4)   // above this, old audio is skipped to cut latency
#define MAX_FILL_GAP        6        // lost packets replaced by silence (up to ~1 s)
#define SPK_GAIN            1.0f
#define RX_MUTE_PEAK        30       // decoded frames quieter than this are muted

#define PACKET_QUEUE_LENGTH 16
#define GPS_STALE_SECONDS   30       // GPS arrives every 10 s, so stale = 3 missed packets
#define LINK_LOST_MS        2000     // no voice packet for this long = link lost
#define RUN_SELFTEST        1

namespace rx {

// ==================================================
// DATA STRUCTURES
// ==================================================
struct RadioPacket {
  uint8_t length;
  uint8_t data[MAX_PACKET_SIZE];
};

struct __attribute__((packed)) GpsPayload {
  int32_t  latE6;
  int32_t  lonE6;
  int16_t  altM;
  uint16_t speedKmhX10;
  uint16_t courseX10;
  uint8_t  sats;
  uint8_t  hdopX10;
  uint8_t  hour, minute, second;
};

// ==================================================
// GLOBALS
// ==================================================
Adafruit_SSD1306 display(128, 64, &Wire, -1);
bool oledOk = false;

QueueHandle_t audioQueue = nullptr;
TaskHandle_t hLora = nullptr, hPlay = nullptr;

CODEC2 *decoder = nullptr;
int samplesPerFrame = 0;
int codecBytesPerFrame = 0;

volatile uint32_t receivedPackets = 0;     // voice packets
volatile uint32_t lostPackets = 0;
volatile uint32_t decodedFrames = 0;
volatile uint32_t mutedFrames = 0;
volatile uint32_t invalidPackets = 0;
volatile uint32_t droppedPackets = 0;
volatile uint32_t skippedPackets = 0;
volatile uint32_t audioErrors = 0;
volatile uint32_t lastVoiceMs = 0;
volatile uint32_t decodeUsMax = 0;
volatile uint32_t dio0Count = 0;           // radio interrupts seen
volatile uint32_t crcOrEmpty = 0;          // interrupt fired but packet was corrupt (CRC) or empty
volatile uint32_t polledCatches = 0;       // packets found only by the safety poll (DIO0 problem!)
volatile int lastRssi = 0;
volatile float lastSnr = 0;
volatile int audioPeak = 0;
volatile int level = 0;

portMUX_TYPE gpsMux = portMUX_INITIALIZER_UNLOCKED;
GpsPayload gpsData;
uint32_t gpsLastMs = 0;
uint32_t gpsCount = 0;

// ==================================================
// HELPERS
// ==================================================
void showMessage(const char *l1, const char *l2 = "") {
  if (!oledOk) return;
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);   display.println("LORA VOICE RX");
  display.setCursor(0, 24);  display.println(l1);
  display.setCursor(0, 36);  display.println(l2);
  display.display();
}

void halt(const char *msg) {
  Serial.println(msg);
  showMessage("ERROR:", msg);
  while (true) delay(1000);
}

const char *resetReasonText() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON:   return "Power-on";
    case ESP_RST_SW:        return "Software reset";
    case ESP_RST_PANIC:     return "PANIC (crash / stack overflow)";
    case ESP_RST_INT_WDT:   return "Interrupt watchdog";
    case ESP_RST_TASK_WDT:  return "Task watchdog";
    case ESP_RST_WDT:       return "Other watchdog";
    case ESP_RST_BROWNOUT:  return "BROWNOUT (power problem)";
    case ESP_RST_EXT:       return "External reset pin";
    default:                return "Other";
  }
}

bool getGps(GpsPayload &g, uint32_t &lastMs, uint32_t &count) {
  portENTER_CRITICAL(&gpsMux);
  g = gpsData;
  lastMs = gpsLastMs;
  count = gpsCount;
  portEXIT_CRITICAL(&gpsMux);
  return count > 0;
}

// ==================================================
// INITIALIZATION
// ==================================================
bool initializeCodec() {
  Serial.println("[CODEC] Initializing decoder");

  decoder = codec2_create(CODEC_MODE);
  if (decoder == nullptr) { Serial.println("[CODEC] Decoder initialization failed"); return false; }

  samplesPerFrame = codec2_samples_per_frame(decoder);
  codecBytesPerFrame = codec2_bytes_per_frame(decoder);
  Serial.printf("[CODEC] Samples/frame: %d, bytes/frame: %d\n", samplesPerFrame, codecBytesPerFrame);

  if (samplesPerFrame <= 0 || samplesPerFrame > MAX_CODEC_SAMPLES || codecBytesPerFrame <= 0) {
    Serial.println("[CODEC] Invalid configuration");
    return false;
  }
  int packetLength = 2 + FRAMES_PER_PACKET * codecBytesPerFrame;
  if (packetLength > MAX_PACKET_SIZE) { Serial.println("[CODEC] Packet exceeds buffer"); return false; }

  Serial.printf("[CODEC] Expected voice packet = %d bytes = %d ms of audio\n",
                packetLength, FRAMES_PER_PACKET * (samplesPerFrame / 8));
  return true;
}

void codecSelfTest() {
  uint8_t *bits = (uint8_t *)calloc(codecBytesPerFrame, 1);
  int16_t *pcm  = (int16_t *)malloc(samplesPerFrame * sizeof(int16_t));
  if (!bits || !pcm) halt("Self-test malloc failed");

  Serial.println("[SELFTEST] Decode time must be shorter than the frame period:");
  for (int run = 0; run < 3; run++) {
    uint32_t t0 = micros();
    codec2_decode(decoder, pcm, bits);
    Serial.printf("  run %d: %.1f ms (frame period %d ms)\n",
                  run + 1, (micros() - t0) / 1000.0f, samplesPerFrame / 8);
  }
  free(bits);
  free(pcm);
}

bool initializeSpeaker() {
  Serial.println("[AUDIO] Initializing MAX98357A");

#if AMP_SD_CONTROL
  pinMode(AMP_SD_PIN, OUTPUT);
  digitalWrite(AMP_SD_PIN, LOW);            // amp starts muted
#endif

  i2s_config_t config = {};
  config.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX);
  config.sample_rate = AUDIO_RATE;
  config.bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT;
  config.channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT;
  config.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  config.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
  config.dma_buf_count = 8;
  config.dma_buf_len = 256;
  config.use_apll = false;
  config.tx_desc_auto_clear = true;
  config.fixed_mclk = 0;

  i2s_pin_config_t pins = {};
  pins.mck_io_num = I2S_PIN_NO_CHANGE;
  pins.bck_io_num = SPK_BCLK;
  pins.ws_io_num = SPK_LRC;
  pins.data_out_num = SPK_DIN;
  pins.data_in_num = I2S_PIN_NO_CHANGE;

  esp_err_t result = i2s_driver_install(SPK_I2S_PORT, &config, 0, NULL);
  if (result != ESP_OK) { Serial.printf("[AUDIO] I2S driver error: %d\n", (int)result); return false; }

  result = i2s_set_pin(SPK_I2S_PORT, &pins);
  if (result != ESP_OK) { Serial.printf("[AUDIO] Pin configuration error: %d\n", (int)result); return false; }

  i2s_zero_dma_buffer(SPK_I2S_PORT);
  Serial.println("[AUDIO] MAX98357A initialized: 8000 Hz, 16-bit stereo");
  return true;
}

bool initializeLoRa() {
  Serial.println("[LORA] Initializing SX1278");

  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);

  if (!LoRa.begin(LORA_FREQ)) { Serial.println("[LORA] Initialization failed"); return false; }

  LoRa.setSpreadingFactor(LORA_SF);
  LoRa.setSignalBandwidth(LORA_BW);
  LoRa.setCodingRate4(LORA_CR);
  LoRa.setPreambleLength(LORA_PREAMBLE);
  LoRa.setSyncWord(LORA_SYNC);
  LoRa.enableCrc();

  Serial.printf("[LORA] Initialized: 433 MHz, SF%d, BW125k, CR4/%d, preamble %d, sync 0x%02X\n",
                LORA_SF, LORA_CR, LORA_PREAMBLE, LORA_SYNC);
  return true;
}

// ==================================================
// AUDIO OUTPUT (playback task only)
// ==================================================
bool playPCM(const int16_t *samples, int sampleCount) {
  static int16_t stereoBuffer[AUDIO_CHUNK_SIZE * 2];
  int offset = 0;

  while (offset < sampleCount) {
    int count = min(AUDIO_CHUNK_SIZE, sampleCount - offset);

    for (int i = 0; i < count; i++) {
      float s = samples[offset + i] * SPK_GAIN;
      if (s > 32767.0f) s = 32767.0f;
      if (s < -32768.0f) s = -32768.0f;
      stereoBuffer[i * 2] = (int16_t)s;
      stereoBuffer[i * 2 + 1] = (int16_t)s;
    }

    size_t bytesWritten = 0;
    esp_err_t result = i2s_write(SPK_I2S_PORT, stereoBuffer, count * 2 * sizeof(int16_t),
                                 &bytesWritten, portMAX_DELAY);
    if (result != ESP_OK || bytesWritten != count * 2 * sizeof(int16_t)) {
      audioErrors = audioErrors + 1;
      return false;
    }
    offset += count;
  }
  return true;
}

void playSilence(int frames) {
  static int16_t zeros[MAX_CODEC_SAMPLES] = {0};
  for (int i = 0; i < frames; i++) playPCM(zeros, samplesPerFrame);
}

// ==================================================
// RADIO INTERRUPT: only wakes the LoRa task, no SPI inside the ISR
// ==================================================
#if RX_USE_DIO0_IRQ
void IRAM_ATTR dio0Isr() {
  dio0Count = dio0Count + 1;
  BaseType_t woken = pdFALSE;
  if (hLora) vTaskNotifyGiveFromISR(hLora, &woken);
  if (woken) portYIELD_FROM_ISR();
}
#endif

// ==================================================
// TASK 1: LORA RECEPTION (voice -> queue, GPS -> stored)
// ==================================================
void loraReceiveTask(void *parameter) {
  static RadioPacket packet;
  const int voiceLength = 2 + FRAMES_PER_PACKET * codecBytesPerFrame;
  const int gpsLength = 2 + (int)sizeof(GpsPayload);
  uint32_t lastActivity = millis();

  Serial.println("[LORA TASK] Started");

#if RX_USE_DIO0_IRQ
  pinMode(LORA_DIO0, INPUT);
  LoRa.receive();                                   // continuous receive, no deaf gaps
  attachInterrupt(digitalPinToInterrupt(LORA_DIO0), dio0Isr, RISING);
  Serial.println("[LORA TASK] Continuous receive, DIO0 interrupt on GPIO34");
#else
  Serial.println("[LORA TASK] Polling mode");
#endif

  while (true) {
    bool viaIrq = false;

#if RX_USE_DIO0_IRQ
    viaIrq = ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(500)) > 0;
    if (viaIrq) {
      lastActivity = millis();
    } else {
      // Safety poll, at most once per 2 s and only after 2 s of silence.
      // If this ever finds a packet, the DIO0 wire or pin is the problem.
      if (millis() - lastActivity < 2000) continue;
      lastActivity = millis();
    }
#else
    vTaskDelay(pdMS_TO_TICKS(1));
#endif

    int packetSize = LoRa.parsePacket();

    if (packetSize <= 0) {
#if RX_USE_DIO0_IRQ
      LoRa.receive();                               // parsePacket leaves continuous mode: re-arm
      if (viaIrq) crcOrEmpty = crcOrEmpty + 1;
#endif
      continue;
    }

    if (!viaIrq && RX_USE_DIO0_IRQ) {
      polledCatches = polledCatches + 1;
      Serial.println("[LORA] WARNING: packet found by polling, DIO0 interrupt did not fire. Check the DIO0 wire to GPIO34");
    }

    if (packetSize > MAX_PACKET_SIZE) {
      while (LoRa.available()) LoRa.read();
#if RX_USE_DIO0_IRQ
      LoRa.receive();
#endif
      invalidPackets = invalidPackets + 1;
      continue;
    }

    int rssi = LoRa.packetRssi();
    float snr = LoRa.packetSnr();

    packet.length = 0;
    while (LoRa.available() && packet.length < MAX_PACKET_SIZE) {
      int value = LoRa.read();
      if (value >= 0) packet.data[packet.length++] = (uint8_t)value;
    }

#if RX_USE_DIO0_IRQ
    LoRa.receive();                                 // listening again within ~1 ms
#endif

    if (packet.length != packetSize || packet.length < 2) {
      invalidPackets = invalidPackets + 1;
      continue;
    }

    uint8_t type = packet.data[0];

    if (type == PKT_VOICE && packet.length == voiceLength) {
      lastRssi = rssi;
      lastSnr = snr;
      lastVoiceMs = millis();
      receivedPackets = receivedPackets + 1;
      if (xQueueSend(audioQueue, &packet, 0) != pdTRUE) droppedPackets = droppedPackets + 1;

    } else if (type == PKT_GPS && packet.length == gpsLength) {
      lastRssi = rssi;
      lastSnr = snr;
      portENTER_CRITICAL(&gpsMux);
      memcpy(&gpsData, &packet.data[2], sizeof(GpsPayload));
      gpsLastMs = millis();
      gpsCount++;
      portEXIT_CRITICAL(&gpsMux);

    } else {
      invalidPackets = invalidPackets + 1;
    }
  }
}

// ==================================================
// TASK 2: JITTER BUFFER, CODEC2 DECODE, PLAYBACK
// ==================================================
void playbackTask(void *parameter) {
  static RadioPacket packet;
  static int16_t decodedSamples[MAX_CODEC_SAMPLES];

  bool playing = false;
  int lastSeq = -1;
  const int packetMs = FRAMES_PER_PACKET * (samplesPerFrame / 8);

  Serial.println("[PLAYBACK TASK] Started");

  while (true) {

    if (!playing) {
      if (uxQueueMessagesWaiting(audioQueue) >= JITTER_PACKETS) {
        playing = true;
        lastSeq = -1;
#if AMP_SD_CONTROL
        digitalWrite(AMP_SD_PIN, HIGH);             // wake the amp
        vTaskDelay(pdMS_TO_TICKS(15));
#endif
        Serial.println("[PLAYBACK] Stream started");
      } else {
        vTaskDelay(pdMS_TO_TICKS(10));
        continue;
      }
    }

    if (xQueueReceive(audioQueue, &packet, pdMS_TO_TICKS(packetMs * 4)) != pdTRUE) {
      playing = false;
      lastSeq = -1;
      i2s_zero_dma_buffer(SPK_I2S_PORT);
#if AMP_SD_CONTROL
      vTaskDelay(pdMS_TO_TICKS(60));
      digitalWrite(AMP_SD_PIN, LOW);                // mute the amp: no idle hiss
#endif
      Serial.println("[PLAYBACK] Stream ended, waiting for audio");
      continue;
    }

    // Keep latency bounded: if too much audio piled up, skip the oldest
    bool skipped = false;
    while (uxQueueMessagesWaiting(audioQueue) > MAX_BUFFERED) {
      if (xQueueReceive(audioQueue, &packet, 0) != pdTRUE) break;
      skippedPackets = skippedPackets + 1;
      skipped = true;
    }
    if (skipped) lastSeq = -1;

    // Lost packets are replaced by silence so playback timing stays correct
    uint8_t seq = packet.data[1];
    if (lastSeq >= 0) {
      uint8_t gap = (uint8_t)(seq - lastSeq - 1);
      if (gap > 0 && gap <= MAX_FILL_GAP) {
        lostPackets = lostPackets + gap;
        playSilence(gap * FRAMES_PER_PACKET);
      } else if (gap > MAX_FILL_GAP) {
        lostPackets = lostPackets + gap;
      }
    }
    lastSeq = seq;

    for (int frame = 0; frame < FRAMES_PER_PACKET; frame++) {
      const uint8_t *source = &packet.data[2 + frame * codecBytesPerFrame];

      uint32_t t0 = micros();
      codec2_decode(decoder, decodedSamples, source);
      uint32_t dt = micros() - t0;
      if (dt > decodeUsMax) decodeUsMax = dt;
      decodedFrames = decodedFrames + 1;

      int peak = 0;
      for (int i = 0; i < samplesPerFrame; i++) {
        int a = abs((int)decodedSamples[i]);
        if (a > peak) peak = a;
      }
      if (peak > audioPeak) audioPeak = peak;
      if (peak > level) level = peak;

      if (peak < RX_MUTE_PEAK) {
        memset(decodedSamples, 0, samplesPerFrame * sizeof(int16_t));
        mutedFrames = mutedFrames + 1;
      }

      if (!playPCM(decodedSamples, samplesPerFrame)) {
        Serial.println("[AUDIO] Playback error");
        break;
      }
    }
  }
}

// ==================================================
// OLED STATUS SCREEN
// ==================================================
void drawStatus() {
  static float dispLevel = 0;
  uint32_t now = millis();

  uint32_t lastV = lastVoiceMs;
  uint32_t sinceVoice = lastV ? (now - lastV) : 0;

  int lv = level;
  level = 0;
  dispLevel = max((float)lv, dispLevel * 0.6f);

  uint32_t total = receivedPackets + lostPackets;
  float lossPct = total ? (100.0f * lostPackets / total) : 0.0f;

  GpsPayload g;
  uint32_t gLast, gCnt;
  bool haveGps = getGps(g, gLast, gCnt);
  uint32_t gAge = haveGps ? (now - gLast) / 1000 : 0;

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  display.setCursor(0, 0);
  display.print("LORA VOICE RX");

  display.setCursor(0, 8);
  if (!lastV)                         display.print("Listening...");
  else if (sinceVoice < LINK_LOST_MS) display.print(">> LINK OK");
  else                                display.printf("LINK LOST %lus", (unsigned long)(sinceVoice / 1000));

  display.setCursor(0, 16);
  if (lastV || haveGps) display.printf("RSSI:%d SNR:%.1f", (int)lastRssi, (float)lastSnr);
  else                  display.print("RSSI:-- SNR:--");

  display.setCursor(0, 24);
  display.printf("OK:%lu Lost:%lu %.0f%%", (unsigned long)receivedPackets,
                 (unsigned long)lostPackets, lossPct);

  display.setCursor(0, 32);
  if (!haveGps)                         display.print("GPS: no data yet");
  else if (gAge > GPS_STALE_SECONDS)    display.printf("GPS stale %lus", (unsigned long)gAge);
  else                                  display.printf("GPS %usat %lus ago", (unsigned)g.sats, (unsigned long)gAge);

  display.setCursor(0, 40);
  if (haveGps) display.printf("Lat:%.6f", g.latE6 / 1e6);
  else         display.print("Lat: --");

  display.setCursor(0, 48);
  if (haveGps) display.printf("Lon:%.6f", g.lonE6 / 1e6);
  else         display.print("Lon: --");

  display.setCursor(0, 56);
  display.print("Vol");
  display.drawRect(20, 56, 108, 8, SSD1306_WHITE);
  int w = (int)(dispLevel * 104.0f / 10000.0f);
  if (w > 104) w = 104;
  if (w > 0) display.fillRect(22, 58, w, 4, SSD1306_WHITE);

  display.display();
}

// ==================================================
// SETUP (called from the global setup())
// ==================================================
void begin() {
  Serial.begin(115200);
  delay(1500);

  Serial.println();
  Serial.println("====================================");
  Serial.println("        RESQ-MESH RECEIVER v3");
  Serial.println("====================================");
  Serial.printf("Reset reason: %s\n", resetReasonText());
  Serial.printf("Free heap at boot: %u\n", (unsigned)ESP.getFreeHeap());

  Wire.begin(OLED_SDA, OLED_SCL);
  Wire.setClock(400000);                    // use 100000 if the display shows garbage
  oledOk = display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
  if (!oledOk) Serial.println("[OLED] Not found, continuing without display");
  showMessage("Starting...");

  if (!initializeCodec()) halt("CODEC INIT ERROR");

#if RUN_SELFTEST
  codecSelfTest();
#endif

  if (!initializeSpeaker()) halt("SPEAKER INIT ERROR");

  audioQueue = xQueueCreate(PACKET_QUEUE_LENGTH, sizeof(RadioPacket));
  if (audioQueue == nullptr) halt("QUEUE CREATE FAILED");

  if (!initializeLoRa()) halt("LORA INIT ERROR");

  Serial.println("[SYSTEM] Creating tasks...");

  if (xTaskCreatePinnedToCore(playbackTask, "AudioPlayback", 32768, NULL, 3, &hPlay, 1) != pdPASS)
    halt("PLAYBACK TASK FAILED");

  if (xTaskCreatePinnedToCore(loraReceiveTask, "LoRaReceive", 8192, NULL, 2, &hLora, 0) != pdPASS)
    halt("LORA TASK FAILED");

  Serial.println("====================================");
  Serial.println("  RECEIVER READY - WAITING FOR AUDIO");
  Serial.println("====================================");
  showMessage("RX READY", "Waiting for TX...");
}

// ==================================================
// MAIN LOOP (called from the global loop())
// ==================================================
void run() {
  static uint32_t lastDraw = 0, lastReport = 0, lastGpsCount = 0;

  if (oledOk && millis() - lastDraw > 250) {
    lastDraw = millis();
    drawStatus();
  }

  GpsPayload g;
  uint32_t gLast, gCnt;
  if (getGps(g, gLast, gCnt) && gCnt != lastGpsCount) {
    lastGpsCount = gCnt;
    Serial.printf("[GPS] %.6f, %.6f | alt %d m | %.1f km/h | course %.1f | sats %u | hdop %.1f | UTC %02u:%02u:%02u | RSSI %d dBm\n",
                  g.latE6 / 1e6, g.lonE6 / 1e6, (int)g.altM, g.speedKmhX10 / 10.0,
                  g.courseX10 / 10.0, (unsigned)g.sats, g.hdopX10 / 10.0,
                  (unsigned)g.hour, (unsigned)g.minute, (unsigned)g.second, (int)lastRssi);
    Serial.printf("[GPS] Map: https://maps.google.com/?q=%.6f,%.6f\n", g.latE6 / 1e6, g.lonE6 / 1e6);
  }

  if (millis() - lastReport >= 5000) {
    lastReport = millis();

    int peak = audioPeak;
    audioPeak = 0;
    uint32_t dmax = decodeUsMax;
    decodeUsMax = 0;

    uint32_t total = receivedPackets + lostPackets;
    float lossPct = total ? (100.0f * lostPackets / total) : 0.0f;

    Serial.println();
    Serial.println("========== RX STATUS ==========");
    Serial.printf("Voice packets: %lu | lost: %lu (%.1f%%)\n",
                  (unsigned long)receivedPackets, (unsigned long)lostPackets, lossPct);
    Serial.printf("GPS packets received: %lu\n", (unsigned long)gCnt);
    Serial.printf("Radio: DIO0 interrupts %lu | CRC/empty %lu | found by poll only %lu\n",
                  (unsigned long)dio0Count, (unsigned long)crcOrEmpty, (unsigned long)polledCatches);
    Serial.printf("Decoded frames: %lu | muted (silent): %lu\n",
                  (unsigned long)decodedFrames, (unsigned long)mutedFrames);
    Serial.printf("Invalid packets: %lu | queue-full drops: %lu | skipped (latency cap): %lu | audio errors: %lu\n",
                  (unsigned long)invalidPackets, (unsigned long)droppedPackets,
                  (unsigned long)skippedPackets, (unsigned long)audioErrors);
    if (lastVoiceMs)
      Serial.printf("Last voice packet: %lu ms ago, RSSI %d dBm, SNR %.1f dB\n",
                    (unsigned long)(millis() - lastVoiceMs), (int)lastRssi, (float)lastSnr);
    else
      Serial.println("No voice packets received yet");
    Serial.printf("Decoded peak level: %d | slowest decode: %.1f ms (frame period %d ms)\n",
                  peak, dmax / 1000.0f, samplesPerFrame / 8);
    Serial.printf("Queue waiting: %u\n", (unsigned)uxQueueMessagesWaiting(audioQueue));
    Serial.printf("Stack min free bytes: lora=%u playback=%u loop=%u\n",
                  (unsigned)uxTaskGetStackHighWaterMark(hLora),
                  (unsigned)uxTaskGetStackHighWaterMark(hPlay),
                  (unsigned)uxTaskGetStackHighWaterMark(NULL));
    Serial.printf("Heap: %u\n", (unsigned)ESP.getFreeHeap());
    Serial.println("===============================");
  }

  delay(20);
}

}  // namespace rx

// Arduino entry points
void setup() { rx::begin(); }
void loop()  { rx::run(); }
