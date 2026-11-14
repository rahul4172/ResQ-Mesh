#include <Arduino.h>
#include <SPI.h>
#include <LoRa.h>
#include <driver/i2s.h>
#include <esp_system.h>
#include <math.h>
#include <TinyGPS++.h>        // "TinyGPSPlus" by Mikal Hart
#include <codec2.h>

// setup() calls codec2_create(), which needs far more than the default 8 KB stack
SET_LOOP_TASK_STACK_SIZE(32 * 1024);

// ==================================================
// RESQ-MESH TRANSMITTER  (v3: reliability build)
// ESP32 + INMP441 + SX1278 + NEO-6M GPS
//
// Changes vs v2:
//  - Smaller voice packets (4 frames = 160 ms, 34 bytes)
//  - TX power 17 dBm (was 7), longer preamble
//  - GPS packet every 10 s, only when the queue is empty, GPS_ENABLE switch
//  - Noise gate OFF by default (it can silence a quiet mic)
//  - Radio watchdog: auto-resets the SX1278 if a transmit gets stuck
// ==================================================

// ---------------- INMP441 ----------------
#define MIC_SCK       32
#define MIC_WS        33
#define MIC_SD        35
#define MIC_PORT      I2S_NUM_0
#define MIC_RATE      16000

// ---------------- SX1278 -----------------
#define LORA_SCK      18
#define LORA_MISO     19
#define LORA_MOSI     23
#define LORA_SS       5
#define LORA_RST      4
#define LORA_DIO0     34

// ---------------- NEO-6M GPS -------------
#define GPS_ENABLE            1       // 0 = GPS completely off (use this to test voice alone)
#define GPS_RX_PIN    16      // ESP32 receives here (GPS TX wire)
#define GPS_TX_PIN    17      // ESP32 sends here   (GPS RX wire)
#define GPS_BAUD      9600
#define GPS_SEND_INTERVAL_MS  10000  // one GPS packet every 10 s while there is a fix
#define GPS_MAX_AGE_MS        3000   // fix must have been updated this recently

// ---------------- LoRa (must match RX) ---
#define LORA_FREQ       433E6
#define LORA_SF         7
#define LORA_BW         125E3
#define LORA_CR         5            // 5 = 4/5
#define LORA_SYNC       0x34
#define LORA_PREAMBLE   12           // symbols (library default is 8)
#define LORA_TX_POWER   17           // dBm, 2..17 (PA_BOOST). Lower it if the boards are < 1 m apart

// ---------------- Codec2 (must match RX) -
#define CODEC_MODE          CODEC2_MODE_1600
#define FRAMES_PER_PACKET   4        // 4 x 40 ms = 160 ms of audio per packet
#define MAX_CODEC_SAMPLES   640
#define MAX_PACKET_SIZE     200

// ---------------- Packet types (must match RX)
#define PKT_VOICE     0xA1
#define PKT_GPS       0xA2

// ---------------- Audio front end --------
#define MIC_GAIN            6.0f      // multiplier on the 16-bit-scaled mic signal
#define HPF_HZ              150.0f    // removes DC and rumble
#define LPF_HZ              3400.0f   // anti-alias filter before 16k -> 8k

// ---------------- Noise gate -------------
// OFF by default: while you are debugging, a gate that is too strict sounds
// exactly like "no voice". Turn it on later once voice works.
#define NOISE_GATE          0
#define GATE_OPEN_RMS       250.0f
#define GATE_CLOSE_RMS      150.0f
#define GATE_HANG_MS        300

// ---------------- Queues -----------------
#define PCM_QUEUE_LENGTH     6
#define PACKET_QUEUE_LENGTH  10

#define RUN_SELFTEST         1

namespace tx {

// ==================================================
// DATA STRUCTURES
// ==================================================
struct PCMFrame {
  uint16_t sampleCount;
  int16_t samples[MAX_CODEC_SAMPLES];
};

// Generic radio packet: [0] = type, [1] = sequence, then payload
struct RadioPacket {
  uint8_t length;
  uint8_t data[MAX_PACKET_SIZE];
};

// GPS payload (identical struct on RX): 19 bytes
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

// Second-order IIR filter (RBJ cookbook), transposed direct form II
struct Biquad {
  float b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0, z1 = 0, z2 = 0;

  void setLowpass(float fs, float fc, float q) {
    float w0 = 2.0f * PI * fc / fs;
    float c = cosf(w0);
    float alpha = sinf(w0) / (2.0f * q);
    float a0 = 1.0f + alpha;
    b0 = ((1.0f - c) / 2.0f) / a0;
    b1 = (1.0f - c) / a0;
    b2 = b0;
    a1 = (-2.0f * c) / a0;
    a2 = (1.0f - alpha) / a0;
  }

  void setHighpass(float fs, float fc, float q) {
    float w0 = 2.0f * PI * fc / fs;
    float c = cosf(w0);
    float alpha = sinf(w0) / (2.0f * q);
    float a0 = 1.0f + alpha;
    b0 = ((1.0f + c) / 2.0f) / a0;
    b1 = -(1.0f + c) / a0;
    b2 = b0;
    a1 = (-2.0f * c) / a0;
    a2 = (1.0f - alpha) / a0;
  }

  float process(float x) {
    float y = b0 * x + z1;
    z1 = b1 * x - a1 * y + z2;
    z2 = b2 * x - a2 * y;
    return y;
  }
};

// ==================================================
// GLOBALS
// ==================================================
QueueHandle_t pcmQueue = nullptr;
QueueHandle_t packetQueue = nullptr;
TaskHandle_t hMic = nullptr, hCodec = nullptr, hLora = nullptr, hGps = nullptr;

CODEC2 *encoder = nullptr;
int samplesPerFrame = 0;
int codecBytesPerFrame = 0;
uint8_t voiceSequence = 0;
uint8_t gpsSequence = 0;

Biquad micHpf, micLpf1, micLpf2, micLpf3;
TinyGPSPlus gps;

volatile uint32_t capturedSamples = 0;
volatile uint32_t encodedFrames = 0;
volatile uint32_t voicePacketsSent = 0;
volatile uint32_t gpsPacketsSent = 0;
volatile uint32_t gpsPacketsDropped = 0;
volatile uint32_t droppedPCMFrames = 0;
volatile uint32_t droppedPackets = 0;
volatile uint32_t micErrors = 0;
volatile uint32_t loraErrors = 0;
volatile uint32_t gateOpenFrames = 0;
volatile uint32_t totalFrames = 0;
volatile uint32_t encodeUsMax = 0;
volatile uint32_t txMsMax = 0;
volatile float micRmsMin = 1e9f;
volatile float micRmsMax = 0.0f;

// Radio watchdog state
volatile uint32_t txStartMs = 0;       // non-zero while a transmit is in progress
volatile uint32_t lastTxOkMs = 0;      // last time a packet finished sending
volatile uint32_t loraRecoveries = 0;
uint32_t lastRecoveryMs = 0;

// ==================================================
// HELPERS
// ==================================================
void halt(const char *msg) {
  Serial.println(msg);
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

// Estimated LoRa time on air (explicit header, CRC on)
float loraAirtimeMs(int payloadBytes) {
  float tSym = (float)(1 << LORA_SF) / (float)LORA_BW * 1000.0f;
  float num = 8.0f * payloadBytes - 4.0f * LORA_SF + 28.0f + 16.0f;
  float payloadSyms = 8.0f + fmaxf(ceilf(num / (4.0f * LORA_SF)) * LORA_CR, 0.0f);
  return (payloadSyms + LORA_PREAMBLE + 4.25f) * tSym;
}

bool gpsHasFix() {
  return gps.location.isValid() && gps.location.age() < GPS_MAX_AGE_MS;
}

const char *gpsStateText() {
#if !GPS_ENABLE
  return "DISABLED (GPS_ENABLE 0)";
#else
  if (gps.charsProcessed() == 0) return "NO DATA (check wiring and baud rate)";
  if (gpsHasFix()) return "FIX";
  return "searching for satellites";
#endif
}

// ==================================================
// INITIALIZATION
// ==================================================
bool initializeMicrophone() {
  Serial.println("[MIC] Initializing INMP441");

  i2s_config_t config = {};
  config.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX);
  config.sample_rate = MIC_RATE;
  config.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;
  config.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT;   // L/R pin connected to GND
  config.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  config.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
  config.dma_buf_count = 8;
  config.dma_buf_len = 256;
  config.use_apll = false;
  config.tx_desc_auto_clear = false;
  config.fixed_mclk = 0;

  i2s_pin_config_t pins = {};
  pins.mck_io_num = I2S_PIN_NO_CHANGE;
  pins.bck_io_num = MIC_SCK;
  pins.ws_io_num = MIC_WS;
  pins.data_out_num = I2S_PIN_NO_CHANGE;
  pins.data_in_num = MIC_SD;

  esp_err_t result = i2s_driver_install(MIC_PORT, &config, 0, NULL);
  if (result != ESP_OK) { Serial.printf("[MIC] Driver error: %d\n", (int)result); return false; }

  result = i2s_set_pin(MIC_PORT, &pins);
  if (result != ESP_OK) { Serial.printf("[MIC] Pin error: %d\n", (int)result); return false; }

  i2s_zero_dma_buffer(MIC_PORT);
  Serial.println("[MIC] Initialized successfully");
  return true;
}

bool initializeCodec() {
  Serial.println("[CODEC] Initializing Codec2");

  encoder = codec2_create(CODEC_MODE);
  if (encoder == nullptr) { Serial.println("[CODEC] Initialization failed"); return false; }

  samplesPerFrame = codec2_samples_per_frame(encoder);
  codecBytesPerFrame = codec2_bytes_per_frame(encoder);
  Serial.printf("[CODEC] Samples/frame: %d, bytes/frame: %d\n", samplesPerFrame, codecBytesPerFrame);

  if (samplesPerFrame <= 0 || samplesPerFrame > MAX_CODEC_SAMPLES || codecBytesPerFrame <= 0) {
    Serial.println("[CODEC] Invalid frame configuration");
    return false;
  }

  int packetLength = 2 + FRAMES_PER_PACKET * codecBytesPerFrame;
  if (packetLength > MAX_PACKET_SIZE) { Serial.println("[CODEC] Packet exceeds buffer"); return false; }

  float audioMs = FRAMES_PER_PACKET * (samplesPerFrame / 8.0f);
  float airMs = loraAirtimeMs(packetLength);
  Serial.printf("[CODEC] Voice packet = %d bytes = %.0f ms of audio, airtime ~%.0f ms (%.0f%% of real time)\n",
                packetLength, audioMs, airMs, 100.0f * airMs / audioMs);
  if (airMs > audioMs * 0.85f)
    Serial.println("[CODEC] WARNING: airtime too long for real-time audio plus GPS! Use a lower-bitrate mode.");
  return true;
}

void codecSelfTest() {
  uint8_t *bits = (uint8_t *)malloc(codecBytesPerFrame);
  int16_t *pcm  = (int16_t *)malloc(samplesPerFrame * sizeof(int16_t));
  if (!bits || !pcm) halt("[SELFTEST] malloc failed");

  for (int i = 0; i < samplesPerFrame; i++)
    pcm[i] = (int16_t)(8000 * sinf(2 * PI * 300 * i / 8000.0f));

  Serial.println("[SELFTEST] Encode time must be shorter than the frame period:");
  for (int run = 0; run < 3; run++) {
    uint32_t t0 = micros();
    codec2_encode(encoder, bits, pcm);
    Serial.printf("  run %d: %.1f ms (frame period %d ms)\n",
                  run + 1, (micros() - t0) / 1000.0f, samplesPerFrame / 8);
  }
  free(bits);
  free(pcm);
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
  LoRa.setTxPower(LORA_TX_POWER);
  LoRa.idle();

  Serial.printf("[LORA] Initialized: 433 MHz, SF%d, BW125k, CR4/%d, preamble %d, %d dBm, sync 0x%02X\n",
                LORA_SF, LORA_CR, LORA_PREAMBLE, LORA_TX_POWER, LORA_SYNC);
  return true;
}

#if GPS_ENABLE
void initializeGps() {
  Serial.println("[GPS] Starting NEO-6M on UART2 (ESP32 RX=GPIO16, TX=GPIO17)");
  Serial2.setRxBufferSize(1024);
  Serial2.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.println("[GPS] Not waiting for a fix; voice starts immediately");
}
#endif

// ==================================================
// TASK 1: MICROPHONE CAPTURE, FILTER, GATE
// ==================================================
void microphoneTask(void *parameter) {
  static int32_t rawSamples[256];
  static float frameF[MAX_CODEC_SAMPLES];
  static PCMFrame frame;

  bool keepSample = false;               // keeps every 2nd sample: 16 kHz -> 8 kHz
  uint16_t idx = 0;
  bool gateOpen = false;
  int hang = 0;
  float gateGain = 1.0f;
  const int frameMs = samplesPerFrame / 8;
  int hangFrames = GATE_HANG_MS / frameMs;
  if (hangFrames < 1) hangFrames = 1;

  Serial.println("[MIC TASK] Started");

  while (true) {
    size_t bytesRead = 0;
    esp_err_t result = i2s_read(MIC_PORT, rawSamples, sizeof(rawSamples), &bytesRead, pdMS_TO_TICKS(500));
    if (result != ESP_OK || bytesRead == 0) { micErrors = micErrors + 1; continue; }

    int count = bytesRead / sizeof(int32_t);

    for (int i = 0; i < count; i++) {
      // 24-bit sample (left-justified in 32 bits) -> 16-bit scale float
      float x = (float)(rawSamples[i] >> 8) * (1.0f / 256.0f);

      x = micHpf.process(x);             // 150 Hz high-pass (also removes DC)
      x = micLpf1.process(x);            // 3.4 kHz low-pass, 6th order,
      x = micLpf2.process(x);            // applied before dropping to 8 kHz
      x = micLpf3.process(x);
      capturedSamples = capturedSamples + 1;

      keepSample = !keepSample;
      if (!keepSample) continue;

      frameF[idx++] = x * MIC_GAIN;

      if (idx >= samplesPerFrame) {
        float sum = 0;
        for (int k = 0; k < idx; k++) sum += frameF[k] * frameF[k];
        float rms = sqrtf(sum / idx);
        if (rms < micRmsMin) micRmsMin = rms;
        if (rms > micRmsMax) micRmsMax = rms;

#if NOISE_GATE
        if (rms > GATE_OPEN_RMS) {
          gateOpen = true;
          hang = hangFrames;
        } else if (gateOpen) {
          if (rms > GATE_CLOSE_RMS) hang = hangFrames;
          else if (--hang <= 0) gateOpen = false;
        }
#else
        gateOpen = true;
#endif
        totalFrames = totalFrames + 1;
        if (gateOpen) gateOpenFrames = gateOpenFrames + 1;

        float target = gateOpen ? 1.0f : 0.0f;
        for (int k = 0; k < idx; k++) {
          gateGain += (target - gateGain) * (target > gateGain ? 0.05f : 0.01f);
          float s = frameF[k] * gateGain;
          if (s > 32767.0f) s = 32767.0f;
          if (s < -32768.0f) s = -32768.0f;
          frame.samples[k] = (int16_t)s;
        }
        frame.sampleCount = idx;

        if (xQueueSend(pcmQueue, &frame, 0) != pdTRUE) droppedPCMFrames = droppedPCMFrames + 1;
        idx = 0;
      }
    }
  }
}

// ==================================================
// TASK 2: CODEC2 ENCODING -> VOICE PACKETS
// ==================================================
void codecTask(void *parameter) {
  static PCMFrame frame;
  static RadioPacket packet;
  int framesInPacket = 0;

  Serial.println("[CODEC TASK] Started");

  while (true) {
    if (xQueueReceive(pcmQueue, &frame, portMAX_DELAY) != pdTRUE) continue;
    if (frame.sampleCount != samplesPerFrame) continue;

    uint8_t *destination = &packet.data[2 + framesInPacket * codecBytesPerFrame];

    uint32_t t0 = micros();
    codec2_encode(encoder, destination, frame.samples);
    uint32_t dt = micros() - t0;
    if (dt > encodeUsMax) encodeUsMax = dt;

    encodedFrames = encodedFrames + 1;
    framesInPacket++;

    if (framesInPacket >= FRAMES_PER_PACKET) {
      packet.data[0] = PKT_VOICE;
      packet.data[1] = voiceSequence++;
      packet.length = 2 + FRAMES_PER_PACKET * codecBytesPerFrame;

      if (xQueueSend(packetQueue, &packet, 0) != pdTRUE) droppedPackets = droppedPackets + 1;
      framesInPacket = 0;
    }
  }
}

// ==================================================
// TASK 3: LORA TRANSMISSION (voice and GPS packets)
// ==================================================
void loraTask(void *parameter) {
  static RadioPacket packet;

  Serial.println("[LORA TASK] Started");

  while (true) {
    if (xQueueReceive(packetQueue, &packet, portMAX_DELAY) != pdTRUE) continue;

    uint32_t t0 = millis();
    txStartMs = t0 ? t0 : 1;              // watchdog: transmit in progress
    int ok = LoRa.beginPacket();          // returns 0 if the radio is still busy
    int result = 0;
    if (ok) {
      LoRa.write(packet.data, packet.length);
      result = LoRa.endPacket();          // blocks until sent
    }
    txStartMs = 0;

    uint32_t dt = millis() - t0;
    if (dt > txMsMax) txMsMax = dt;

    if (ok && result == 1) {
      lastTxOkMs = millis();
      if (packet.data[0] == PKT_GPS) gpsPacketsSent = gpsPacketsSent + 1;
      else voicePacketsSent = voicePacketsSent + 1;
    } else {
      loraErrors = loraErrors + 1;
    }
  }
}

// ==================================================
// TASK 4: GPS READER (core 0, never blocks voice)
// ==================================================
#if GPS_ENABLE
void gpsTask(void *parameter) {
  static RadioPacket pkt;
  uint32_t lastSend = 0;

  Serial.println("[GPS TASK] Started");

  while (true) {
    int budget = 512;
    while (Serial2.available() && budget-- > 0) gps.encode(Serial2.read());

    // GPS is sent only if: 10 s have passed, there is a fresh fix, and the
    // radio queue is (almost) empty. If voice is backed up, GPS simply waits.
    uint32_t now = millis();
    if (now - lastSend >= GPS_SEND_INTERVAL_MS &&
        gpsHasFix() &&
        uxQueueMessagesWaiting(packetQueue) <= 1) {
      lastSend = now;

      GpsPayload g;
      g.latE6 = (int32_t)lround(gps.location.lat() * 1e6);
      g.lonE6 = (int32_t)lround(gps.location.lng() * 1e6);

      long alt = gps.altitude.isValid() ? lround(gps.altitude.meters()) : 0;
      if (alt > 32767) alt = 32767;
      if (alt < -32768) alt = -32768;
      g.altM = (int16_t)alt;

      long spd = gps.speed.isValid() ? lround(gps.speed.kmph() * 10.0) : 0;
      if (spd < 0) spd = 0;
      if (spd > 65535) spd = 65535;
      g.speedKmhX10 = (uint16_t)spd;

      long crs = gps.course.isValid() ? lround(gps.course.deg() * 10.0) : 0;
      if (crs < 0) crs = 0;
      if (crs > 3600) crs = 3600;
      g.courseX10 = (uint16_t)crs;

      uint32_t sats = gps.satellites.isValid() ? gps.satellites.value() : 0;
      g.sats = (uint8_t)(sats > 255 ? 255 : sats);

      long hd = gps.hdop.isValid() ? lround(gps.hdop.hdop() * 10.0) : 0;
      if (hd < 0) hd = 0;
      if (hd > 255) hd = 255;
      g.hdopX10 = (uint8_t)hd;

      if (gps.time.isValid()) {
        g.hour = gps.time.hour();
        g.minute = gps.time.minute();
        g.second = gps.time.second();
      } else {
        g.hour = g.minute = g.second = 0;
      }

      pkt.data[0] = PKT_GPS;
      pkt.data[1] = gpsSequence++;
      memcpy(&pkt.data[2], &g, sizeof(g));
      pkt.length = 2 + sizeof(g);

      if (xQueueSend(packetQueue, &pkt, 0) != pdTRUE) gpsPacketsDropped = gpsPacketsDropped + 1;
    }

    vTaskDelay(pdMS_TO_TICKS(20));
  }
}
#endif

// ==================================================
// RADIO WATCHDOG
// If a transmit never finishes (power dip, SPI glitch), the LoRa task
// would hang forever and voice would stop. This resets the radio.
// ==================================================
void recoverRadio(const char *why) {
  Serial.printf("[WATCHDOG] %s -> resetting LoRa radio\n", why);

  if (hLora) { vTaskDelete(hLora); hLora = nullptr; }
  txStartMs = 0;

  if (!initializeLoRa()) {
    Serial.println("[WATCHDOG] LoRa re-init failed, will retry");
    return;
  }
  xQueueReset(packetQueue);
  lastTxOkMs = millis();

  if (xTaskCreatePinnedToCore(loraTask, "LoRaTransmit", 8192, NULL, 1, &hLora, 0) != pdPASS) {
    Serial.println("[WATCHDOG] could not restart LoRa task");
    hLora = nullptr;
    return;
  }
  loraRecoveries = loraRecoveries + 1;
}

void radioWatchdog() {
  uint32_t now = millis();
  if (now - lastRecoveryMs < 2000) return;

  uint32_t started = txStartMs;
  if (!hLora) {
    lastRecoveryMs = now;
    recoverRadio("LoRa task not running");
  } else if (started && now - started > 1000) {
    lastRecoveryMs = now;
    recoverRadio("transmit stuck for > 1 s");
  } else if (uxQueueMessagesWaiting(packetQueue) >= 5 && now - lastTxOkMs > 2000) {
    lastRecoveryMs = now;
    recoverRadio("packets queued but nothing sent for 2 s");
  }
}

// ==================================================
// SETUP (called from the global setup())
// ==================================================
void begin() {
  Serial.begin(115200);
  delay(1500);

  Serial.println();
  Serial.println("====================================");
  Serial.println("       RESQ-MESH TRANSMITTER v3");
  Serial.println("====================================");
  Serial.printf("Reset reason: %s\n", resetReasonText());
  Serial.printf("Free heap at boot: %u\n", (unsigned)ESP.getFreeHeap());

  if (!initializeCodec()) halt("CODEC ERROR");

#if RUN_SELFTEST
  codecSelfTest();
#endif

  if (!initializeLoRa()) halt("LORA ERROR");

#if GPS_ENABLE
  initializeGps();
#else
  Serial.println("[GPS] Disabled (GPS_ENABLE 0)");
#endif

  pcmQueue = xQueueCreate(PCM_QUEUE_LENGTH, sizeof(PCMFrame));
  packetQueue = xQueueCreate(PACKET_QUEUE_LENGTH, sizeof(RadioPacket));
  if (!pcmQueue || !packetQueue) halt("QUEUE ERROR");

  // Audio filters (fs = 16 kHz): 150 Hz high-pass, 6th-order Butterworth low-pass
  micHpf.setHighpass(MIC_RATE, HPF_HZ, 0.7071f);
  micLpf1.setLowpass(MIC_RATE, LPF_HZ, 0.5176f);
  micLpf2.setLowpass(MIC_RATE, LPF_HZ, 0.7071f);
  micLpf3.setLowpass(MIC_RATE, LPF_HZ, 1.9319f);

  if (!initializeMicrophone()) halt("MICROPHONE ERROR");

  Serial.println("[SYSTEM] Creating tasks...");
  lastTxOkMs = millis();

  if (xTaskCreatePinnedToCore(microphoneTask, "MicCapture", 8192, NULL, 3, &hMic, 1) != pdPASS)
    halt("MIC TASK CREATION FAILED");

  if (xTaskCreatePinnedToCore(codecTask, "CodecEncoder", 32768, NULL, 2, &hCodec, 1) != pdPASS)
    halt("CODEC TASK CREATION FAILED");

  if (xTaskCreatePinnedToCore(loraTask, "LoRaTransmit", 8192, NULL, 1, &hLora, 0) != pdPASS)
    halt("LORA TASK CREATION FAILED");

#if GPS_ENABLE
  if (xTaskCreatePinnedToCore(gpsTask, "GpsReader", 4096, NULL, 1, &hGps, 0) != pdPASS)
    Serial.println("GPS TASK CREATION FAILED (voice continues without GPS)");
#endif

  Serial.println("====================================");
  Serial.println("  TRANSMITTER READY - CONTINUOUS");
  Serial.println("====================================");
}

// ==================================================
// MAIN LOOP (called from the global loop(), status report)
// ==================================================
void run() {
  static uint32_t previousReport = 0;

  radioWatchdog();

  if (millis() - previousReport >= 5000) {
    previousReport = millis();

    float rmsMin = micRmsMin, rmsMax = micRmsMax;
    micRmsMin = 1e9f;
    micRmsMax = 0.0f;
    uint32_t emax = encodeUsMax, txmax = txMsMax;
    encodeUsMax = 0;
    txMsMax = 0;
    uint32_t tf = totalFrames, gf = gateOpenFrames;
    totalFrames = 0;
    gateOpenFrames = 0;

    Serial.println();
    Serial.println("========== TX STATUS ==========");
    Serial.printf("Mic frame RMS: quietest %.0f (noise floor), loudest %.0f (speech)\n",
                  rmsMin > 1e8f ? 0.0f : rmsMin, rmsMax);
    if (rmsMax < 3.0f)
      Serial.println("WARNING: mic signal is almost zero. Check INMP441 wiring: SCK, WS, SD, L/R->GND, VDD 3V3, GND");
    else if (rmsMax < 100.0f)
      Serial.println("NOTE: speech level is low. Speak closer to the mic or raise MIC_GAIN");
#if NOISE_GATE
    Serial.printf("Gate: open %lu of %lu frames (open>%.0f, close<%.0f)\n",
                  (unsigned long)gf, (unsigned long)tf, (double)GATE_OPEN_RMS, (double)GATE_CLOSE_RMS);
#else
    (void)gf; (void)tf;
    Serial.println("Gate: disabled");
#endif
    Serial.printf("Slowest encode: %.1f ms (frame period %d ms)\n", emax / 1000.0f, samplesPerFrame / 8);
    Serial.printf("Slowest LoRa transmit: %lu ms\n", (unsigned long)txmax);
    Serial.printf("Voice packets sent: %lu | GPS packets sent: %lu (dropped %lu)\n",
                  (unsigned long)voicePacketsSent, (unsigned long)gpsPacketsSent,
                  (unsigned long)gpsPacketsDropped);
    Serial.printf("Dropped PCM frames: %lu | dropped voice packets: %lu\n",
                  (unsigned long)droppedPCMFrames, (unsigned long)droppedPackets);
    Serial.printf("Mic errors: %lu | LoRa errors: %lu | radio resets: %lu\n",
                  (unsigned long)micErrors, (unsigned long)loraErrors, (unsigned long)loraRecoveries);

#if GPS_ENABLE
    Serial.printf("GPS: %s | sats %u | chars %lu | bad checksums %lu\n",
                  gpsStateText(),
                  (unsigned)(gps.satellites.isValid() ? gps.satellites.value() : 0),
                  (unsigned long)gps.charsProcessed(),
                  (unsigned long)gps.failedChecksum());
    if (gpsHasFix())
      Serial.printf("GPS position: %.6f, %.6f | alt %.0f m | %.1f km/h\n",
                    gps.location.lat(), gps.location.lng(),
                    gps.altitude.meters(), gps.speed.kmph());
#else
    Serial.printf("GPS: %s\n", gpsStateText());
#endif

    Serial.printf("Stack min free bytes: mic=%u codec=%u lora=%u gps=%u loop=%u\n",
                  (unsigned)uxTaskGetStackHighWaterMark(hMic),
                  (unsigned)uxTaskGetStackHighWaterMark(hCodec),
                  (unsigned)(hLora ? uxTaskGetStackHighWaterMark(hLora) : 0),
                  (unsigned)(hGps ? uxTaskGetStackHighWaterMark(hGps) : 0),
                  (unsigned)uxTaskGetStackHighWaterMark(NULL));
    Serial.printf("Heap: %u\n", (unsigned)ESP.getFreeHeap());
    Serial.println("===============================");
  }

  delay(50);
}

}  // namespace tx

// Arduino entry points
void setup() { tx::begin(); }
void loop()  { tx::run(); }
