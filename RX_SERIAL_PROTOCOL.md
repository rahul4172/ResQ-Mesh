# ResQ-Mesh RX Serial Protocol Specification

This document details the exact Serial protocol, baud rate, and data formats exposed by the immutable `resq_mesh_rx` firmware running on the ESP32 receiver.

---

## 1. Physical & Serial Parameters

| Parameter | Specification | Verification Source |
| :--- | :--- | :--- |
| **Baud Rate** | `115200` | `Serial.begin(115200);` in `rx::begin()` |
| **Data Bits** | `8` | Standard ESP32 UART configuration |
| **Parity** | `None` (`N`) | Standard ESP32 UART configuration |
| **Stop Bits** | `1` | Standard ESP32 UART configuration |
| **Flow Control** | `None` | Standard USB-to-UART bridge (CP2102 / CH340) |
| **Encoding** | Human-readable ASCII / UTF-8 | Line-buffered strings (`\r\n` or `\n`) |
| **Transmission Type** | **Strictly Text-Based** | No binary frames, SLIP, or COBS are transmitted |

---

## 2. Boot & Setup Sequence

Upon boot or reset, the receiver initializes its subsystems and prints diagnostic telemetry:

```text
====================================
        RESQ-MESH RECEIVER v3
====================================
Reset reason: <Power-on | Software reset | PANIC | Brownout | External reset pin>
Free heap at boot: <bytes>
[CODEC] Initializing decoder
[CODEC] Samples/frame: 320, bytes/frame: 8
[CODEC] Expected voice packet = 34 bytes = 160 ms of audio
[SELFTEST] Decode time must be shorter than the frame period:
  run 1: <ms> ms (frame period 40 ms)
  run 2: <ms> ms (frame period 40 ms)
  run 3: <ms> ms (frame period 40 ms)
[AUDIO] Initializing MAX98357A
[AUDIO] MAX98357A initialized: 8000 Hz, 16-bit stereo
[LORA] Initializing SX1278
[LORA] Initialized: 433 MHz, SF7, BW125k, CR4/5, preamble 12, sync 0x34
[SYSTEM] Creating tasks...
[PLAYBACK TASK] Started
[LORA TASK] Started
[LORA TASK] Continuous receive, DIO0 interrupt on GPIO34
====================================
  RECEIVER READY - WAITING FOR AUDIO
====================================
```

*Note: If OLED initialization fails, the firmware prints `[OLED] Not found, continuing without display` but continues normal execution.*

---

## 3. GPS Telemetry Events

When a LoRa packet of type `PKT_GPS` (`0xA2`) arrives and unpacks a new GPS fix, the receiver outputs two consecutive lines:

### Format
```text
[GPS] <lat>, <lon> | alt <alt> m | <speed> km/h | course <course> | sats <sats> | hdop <hdop> | UTC <hh:mm:ss> | RSSI <rssi> dBm
[GPS] Map: https://maps.google.com/?q=<lat>,<lon>
```

### Verified Fields & Regular Expression
**Regex**: `^\[GPS\]\s+([-+]?\d+\.\d+),\s*([-+]?\d+\.\d+)\s*\|\s*alt\s+(-?\d+)\s*m\s*\|\s*([\d\.]+)\s*km\/h\s*\|\s*course\s*([\d\.]+)\s*\|\s*sats\s*(\d+)\s*\|\s*hdop\s*([\d\.]+)\s*\|\s*UTC\s*(\d{2}:\d{2}:\d{2})\s*\|\s*RSSI\s*(-?\d+)\s*dBm`

| Captured Group | Parameter | Unit / Format | Description |
| :--- | :--- | :--- | :--- |
| `1` | `latitude` | Decimal degrees (`%.6f`) | Geographic latitude |
| `2` | `longitude` | Decimal degrees (`%.6f`) | Geographic longitude |
| `3` | `altitude` | Meters (`%d`) | Altitude above sea level |
| `4` | `speed` | km/h (`%.1f`) | Ground velocity |
| `5` | `course` | Degrees (`%.1f`) | Heading angle ($0^\circ$ to $360^\circ$) |
| `6` | `sats` | Integer (`%u`) | Tracked satellites |
| `7` | `hdop` | Floating-point (`%.1f`) | Horizontal Dilution of Precision |
| `8` | `utc_time` | `HH:MM:SS` | UTC timestamp from GPS constellation |
| `9` | `rssi` | dBm (`%d`) | Received Signal Strength Indicator of the packet |

---

## 4. Audio & Voice Streaming: Availability & Limitations

### Verified Hardware Architecture
1. **Physical Audio Routing**:
   - The ESP32 decodes Codec2 frames directly into 16-bit 8000 Hz PCM audio using FreeRTOS Task `AudioPlayback` on Core 1.
   - Decoded samples are streamed directly via **I2S DMA** (`SPK_I2S_PORT = I2S_NUM_1`) to the **MAX98357A Class-D Amplifier DAC** connected to a physical 3W speaker.
2. **Serial Audio Exposure (Crucial Limitation)**:
   - **NO raw audio PCM bytes are output over USB Serial.**
   - **NO Codec2 bitstream frames are output over USB Serial.**
   - USB Serial bandwidth (115200 baud) is intentionally reserved for diagnostics and telemetry so as not to starve or block the I2S audio task.

### Verifiable Audio Serial Events
- **Stream Start**: `[PLAYBACK] Stream started` (emitted when jitter buffer reaches `JITTER_PACKETS >= 3`).
- **Stream End**: `[PLAYBACK] Stream ended, waiting for audio` (emitted on timeout after transmission halts).
- **Audio Driver Error**: `[AUDIO] Playback error`
- **Volume / Peak VU Metric**: Emitted in the periodic status report as `Decoded peak level: <peak>` (where peak is between `0` and `32767`).
- **Codec Decode Latency**: Emitted in the periodic report as `slowest decode: <ms> ms (frame period 40 ms)`.
- **Mute Statistics**: Emitted in the periodic report as `muted (silent): <count>`.

*Dashboard Implementation Rule: In real hardware mode, the Voice Monitor displays live stream state, hardware amplifier status, VU audio peak meter, and decode latency. It explicitly informs the operator that audio output is rendered via the physical MAX98357A speaker. In simulation/demo mode, a mock audio test fixture is provided with full player controls, clearly badged as simulated.*

---

## 5. Periodic Diagnostics Report (Emitted every 5,000 ms)

Every 5 seconds, `rx::run()` outputs a structured status block:

```text
========== RX STATUS ==========
Voice packets: 1420 | lost: 8 (0.6%)
GPS packets received: 24
Radio: DIO0 interrupts 1448 | CRC/empty 0 | found by poll only 0
Decoded frames: 5680 | muted (silent): 380
Invalid packets: 0 | queue-full drops: 0 | skipped (latency cap): 0 | audio errors: 0
Last voice packet: 120 ms ago, RSSI -68 dBm, SNR 8.5 dB
Decoded peak level: 12400 | slowest decode: 3.8 ms (frame period 40 ms)
Queue waiting: 3
Stack min free bytes: lora=6144 playback=24180 loop=28400
Heap: 184512
===============================
```

*(Note: When no voice packets have arrived yet, line 7 prints `No voice packets received yet` instead).*

### Verified Status Report Fields:
- `voice_packets`: Total valid voice packets received.
- `lost_packets`: Total lost voice packets detected via sequence gaps.
- `loss_pct`: Packet loss percentage.
- `gps_packets`: Total valid GPS packets received.
- `dio0_interrupts`: Radio interrupt trigger count.
- `crc_or_empty`: Corrupt or zero-length radio triggers.
- `polled_catches`: Packets recovered by safety polling when DIO0 failed.
- `decoded_frames`: Codec2 frame decoding count.
- `muted_frames`: Low-amplitude frames suppressed by noise squelch.
- `invalid_packets`: Packets failing length/type checks.
- `dropped_packets`: Packets dropped due to queue congestion.
- `skipped_packets`: Packets discarded to prevent latency buildup (> 7 packets).
- `audio_errors`: I2S DMA transmission errors.
- `last_voice_ms`: Milliseconds elapsed since the last voice packet.
- `last_rssi`: RSSI in dBm.
- `last_snr`: SNR in dB.
- `decoded_peak`: Peak PCM amplitude ($0$ to $32767$).
- `slowest_decode_ms`: Maximum execution time for a Codec2 frame decode.
- `queue_waiting`: Current depth of the `audioQueue`.
- `stack_watermark_lora`: Free stack watermark on the LoRa task (bytes).
- `stack_watermark_playback`: Free stack watermark on the Audio task (bytes).
- `stack_watermark_loop`: Free stack watermark on the Arduino loop task (bytes).
- `heap_free`: Current available ESP32 free heap memory (bytes).

---

## 6. Radio & Diagnostic Warnings

- `[LORA] WARNING: packet found by polling, DIO0 interrupt did not fire. Check the DIO0 wire to GPIO34`
  - *Triggered when packet was captured via safety polling rather than the hardware interrupt line.*

---

## 7. Packet Sequence Information Availability

- **Per-packet individual sequence numbers (`packet.data[1]`) are processed internally by `playbackTask`** on the ESP32 to calculate sequence gaps and synthesize silence frames.
- **Individual packet sequence numbers are NOT output to USB Serial on every single packet arrival**, as doing so would overload the serial UART buffer during active 160 ms voice streaming.
- **Sequence metrics are aggregated and exposed in the 5-second `RX STATUS` report** as `Voice packets: <ok> | lost: <lost> (<pct>%)`.

---

## 8. Summary of What Can and Cannot Be Verified Over USB Serial

| Feature | Exposed Over USB Serial? | Verification Status |
| :--- | :---: | :--- |
| **GPS Position (Lat, Lon, Alt)** | **YES** | Verified (Emitted on every new GPS fix) |
| **GPS Speed, Course, Sats, HDOP** | **YES** | Verified (Emitted in `[GPS]` telemetry line) |
| **GPS UTC Timestamp** | **YES** | Verified (Emitted as `UTC HH:MM:SS`) |
| **Google Maps URL** | **YES** | Verified (Emitted as `[GPS] Map: https://...`) |
| **RF Signal Strength (RSSI & SNR)** | **YES** | Verified (Emitted in GPS and Status lines) |
| **Audio Stream Lifecycle (Start/End)** | **YES** | Verified (`[PLAYBACK] Stream started/ended`) |
| **Audio Peak Level (VU Meter)** | **YES** | Verified (`Decoded peak level: <peak>`) |
| **Audio Decode Latency** | **YES** | Verified (`slowest decode: <ms> ms`) |
| **Packet Counts & Loss %** | **YES** | Verified (`Voice packets: X \| lost: Y`) |
| **ESP32 Health (Heap, Stacks)** | **YES** | Verified (`Heap: X`, `Stack min free: ...`) |
| **Raw PCM Audio Samples** | **NO** | Verified NOT exposed (Routed solely to MAX98357A I2S DAC) |
| **Raw Codec2 Frames** | **NO** | Verified NOT exposed (Decoded locally on ESP32) |
| **Per-packet Sequence Numbers** | **NO** | Verified NOT exposed (Aggregated in 5s status report) |
