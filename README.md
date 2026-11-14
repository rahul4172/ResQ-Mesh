<div align="center">

<img src="./assets/logo.svg" width="130" alt="ResQ-Mesh Logo" />

# ResQ-Mesh

**Infrastructure-Independent Disaster Communication & Rescue Coordination System**

[![Platform](https://img.shields.io/badge/Platform-ESP32-E7352C?style=flat-square&logo=espressif&logoColor=white)](https://www.espressif.com/en/products/socs/esp32)
[![RF Transceiver](https://img.shields.io/badge/Radio-SX1278%20LoRa%20(433%20MHz)-0088CC?style=flat-square)](https://www.semtech.com/products/wireless-rf/lora-core/sx1278)
[![Voice Compression](https://img.shields.io/badge/Codec-Codec2%20(1600%20bps)-2EA44F?style=flat-square)](https://www.rowetel.com/?page_id=452)
[![RTOS](https://img.shields.io/badge/RTOS-FreeRTOS%20(Dual--Core)-168AFE?style=flat-square)](https://www.freertos.org/)
[![GPS](https://img.shields.io/badge/GPS-u--blox%20NEO--6M-FF6F00?style=flat-square)](https://www.u-blox.com/)
[![Audio I/O](https://img.shields.io/badge/Audio-I2S%20DMA-8A2BE2?style=flat-square)](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/peripherals/i2s.html)

[Overview](#overview) • [Key Features](#key-features) • [System Architecture](#system-architecture) • [Hardware Specifications](#hardware-specifications) • [Wiring & Pinouts](#wiring--pinouts) • [Packet Protocol](#packet-protocol) • [Getting Started](#getting-started) • [Configuration](#configuration) • [Diagnostics & Telemetry](#diagnostics--telemetry) • [Troubleshooting](#troubleshooting)

</div>

---

## Overview

When natural disasters strike—earthquakes, severe floods, hurricanes, or landslides—terrestrial telecommunications infrastructure (cellular base stations, fiber optic trunks, and power grids) frequently collapses. This creates communication blackouts where disaster victims cannot request aid and search-and-rescue teams operate without real-time situational intelligence.

**ResQ-Mesh** is a self-contained, off-grid emergency communication system designed to bridge this critical operational gap. Built on low-cost **ESP32** microcontrollers and **Semtech SX1278 LoRa transceivers**, ResQ-Mesh captures victim voice input, compresses it using the open-source **Codec2** speech synthesis algorithm down to **1600 bps**, bundles it with high-precision GPS positioning, and transmits real-time audio and telemetry over long-range Sub-1 GHz RF links without relying on cellular networks or internet access.

> [!IMPORTANT]
> Standard LoRa modulation provides extremely narrow channel bandwidth (typically 125 kHz), making raw uncompressed digital audio transmission impossible. ResQ-Mesh overcomes this fundamental physics constraint by combining Codec2 voice compression (1600 bps) with an optimized 4-frame radio aggregation scheme (160 ms of audio per 34-byte packet). This yields a time-on-air of approximately 72 ms at Spreading Factor 7 (SF7), maintaining a sustainable ~45% duty cycle that supports real-time continuous voice streaming.

---

## Key Features

- **Ultra-Low-Bitrate Voice Streaming**: Utilizes Codec2 (`CODEC2_MODE_1600`) to compress 160 ms of voice audio into 32 bytes of payload data, enabling continuous voice over narrow-band LoRa.
- **Hardware-Timed Digital Audio Pipeline**: 24-bit I2S DMA input via the INMP441 MEMS microphone with on-chip DSP preprocessing: 150 Hz high-pass biquad filtering (DC/rumble removal), 6th-order Butterworth low-pass anti-aliasing filtering at 3.4 kHz, and 16 kHz to 8 kHz decimation.
- **Autonomous GPS Telemetry**: Integrates u-blox NEO-6M receivers on dedicated FreeRTOS tasks to broadcast packed coordinate telemetry (latitude, longitude, altitude, speed, course, satellite count, and HDOP) every 10 seconds.
- **Interrupt-Driven Continuous Reception**: The receiver radio operates in continuous reception mode with SX1278 DIO0 hardware interrupts (`GPIO34`), eliminating deaf polling windows and preventing packet drops.
- **Adaptive Jitter Buffer & Packet Loss Concealment (PLC)**: Absorbs RF packet arrival jitter, caps queue latency, and synthesizes interpolated silence frames for missing sequence packets (up to 6 packets) to prevent audio underrun.
- **Hardware-Controlled Idle Mute**: Automatically toggles the MAX98357A amplifier shutdown (`SD`) pin to eliminate idle circuit hiss and preserve battery life during standby periods.
- **Self-Healing Radio Watchdog**: Actively monitors radio queue health and transmission timeouts, automatically executing hardware resets and FreeRTOS task recoveries if an SPI hang or bus lockup is detected.
- **Mission Status OLED Dashboard**: Live 128x64 display rendering link viability, RSSI, SNR, packet loss percentage, GPS fix age, coordinates, and a real-time audio volume VU meter.

---

## System Architecture

```
                      TRANSMITTER NODE (Victim / Field Unit)
  +------------------+      I2S DMA (16 kHz, 32-bit)
  | INMP441 MEMS Mic | ----------------------------------+
  +------------------+                                  |
                                                        v
  +------------------+    UART2 (9600 baud)      +--------------+
  | NEO-6M GPS       | ------------------------> | ESP32 Core 1 | -- DSP (HPF + LPF + Gain)
  +------------------+                           +--------------+ -- Decimation (16k -> 8k)
                                                        |         -- Codec2 1600 bps Encode
                                                        v
                                                 +--------------+
                                                 | ESP32 Core 0 | -- FreeRTOS Packet Queue
                                                 +--------------+ -- Radio Watchdog Monitor
                                                        |
                                                        | SPI Bus (18/19/23/5/4/34)
                                                        v
                                                 +--------------+
                                                 | SX1278 LoRa  | (433 MHz, SF7, BW125k, 17 dBm)
                                                 +--------------+
                                                        |
                                                ((( Long-Range RF )))
                                                        |
                                                        v
                       RECEIVER NODE (Base Station / Rescuer)
                                                 +--------------+
                                                 | SX1278 LoRa  | (Continuous RX Mode)
                                                 +--------------+
                                                        |
                                                        | DIO0 Hardware Interrupt (GPIO34)
                                                        v
                                                 +--------------+
                                                 | ESP32 Core 0 | -- Zero-Deaf-Gap ISR
                                                 +--------------+ -- Packet Classification (0xA1/0xA2)
                                                        |
                                       +----------------+----------------+
                                       | Voice Packets                   | GPS Packets
                                       v                                 v
                                +--------------+                  +--------------+
                                | ESP32 Core 1 |                  | Thread-Safe  |
                                +--------------+                  | GPS Storage  |
                                 -- Jitter Buffer (3 pkts)        +--------------+
                                 -- PLC Silence Insertion                |
                                 -- Codec2 Decode (8 kHz)                +--------+
                                 -- Amp SD Power Toggle                           |
                                       |                                          |
                        +--------------+--------------+                           |
                        | I2S DMA                     | I2C (21/22)               |
                        v                             v                           v
              +-------------------+         +-------------------+        +-----------------+
              | MAX98357A Amp/DAC |         | SSD1306 OLED      |        | Serial Console  |
              +-------------------+         | (Telemetry & VU)  |        | (Google Maps)   |
                        |                   +-------------------+        +-----------------+
                        v
              +-------------------+
              | 3W 4-8 Ohm Spk    |
              +-------------------+
```

---

## Hardware Specifications

### Bill of Materials (BOM)

| Component | Specification | Role | Node |
| :--- | :--- | :--- | :--- |
| **ESP32 NodeMCU** | ESP-WROOM-32 (Dual-Core 240 MHz, 4MB Flash) | Main application processor & DSP | TX & RX |
| **SX1278 / Ra-02** | 433 MHz LoRa transceiver (Semtech SX1278) | Long-range point-to-point wireless RF | TX & RX |
| **INMP441** | Omnidirectional MEMS microphone (I2S digital) | High-fidelity voice capture | TX Only |
| **u-blox NEO-6M** | GPS/GNSS receiver module with ceramic antenna | Victim positioning and timestamping | TX Only |
| **MAX98357A** | 3.2W mono Class-D amplifier with I2S DAC | Digital-to-analog audio amplification | RX Only |
| **SSD1306** | 0.96" monochrome I2C OLED display (128x64) | Visual telemetry & field diagnostics | RX Only |
| **Speaker** | 4 Ohm / 8 Ohm (2W - 3W) | Acoustic voice reproduction | RX Only |
| **Antenna** | 433 MHz tuned helical or whip antenna | RF radiation and sensitivity | TX & RX |

> [!WARNING]
> Never power or transmit on the SX1278 LoRa module without its 433 MHz antenna securely attached. Operating the transmitter into an open circuit can permanently damage the radio's RF power amplifier.

---

## Wiring & Pinouts

### Transmitter Node (TX)

The transmitter combines the SX1278 SPI transceiver, INMP441 I2S microphone, and NEO-6M UART GPS module on a single ESP32.

| Module | Module Pin | ESP32 GPIO | Electrical Function | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **SX1278** | SCK | `GPIO 18` | VSPI SCK | SPI Clock |
| | MISO | `GPIO 19` | VSPI MISO | SPI Master In Slave Out |
| | MOSI | `GPIO 23` | VSPI MOSI | SPI Master Out Slave In |
| | NSS / CS | `GPIO 5` | VSPI SS | Chip Select |
| | RESET | `GPIO 4` | GPIO Output | Hardware Reset |
| | DIO0 | `GPIO 34` | GPI Input | TxDone Interrupt |
| | VCC / GND | `3V3 / GND` | Power | **Must use 3.3V power only** |
| **INMP441** | SCK / BCLK | `GPIO 32` | I2S0 BCLK | Bit Clock |
| | WS / LRC | `GPIO 33` | I2S0 WS | Word Select / LR Clock |
| | SD | `GPIO 35` | I2S0 DIN | Serial Data In (Input Only Pin) |
| | L/R | `GND` | Ground | Selects Left Channel |
| | VDD / GND | `3V3 / GND` | Power | Clean 3.3V rail |
| **NEO-6M GPS** | TX | `GPIO 16` | UART2 RX | GPS Data Output -> ESP32 Input |
| | RX | `GPIO 17` | UART2 TX | ESP32 Output -> GPS Data Input |
| | VCC / GND | `3V3 / GND` | Power | Connect to 3.3V or 5V (module dependent) |

### Receiver Node (RX)

The receiver connects the SX1278 SPI transceiver, MAX98357A I2S amplifier, and SSD1306 I2C OLED display.

| Module | Module Pin | ESP32 GPIO | Electrical Function | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **SX1278** | SCK | `GPIO 18` | VSPI SCK | SPI Clock |
| | MISO | `GPIO 19` | VSPI MISO | SPI Master In Slave Out |
| | MOSI | `GPIO 23` | VSPI MOSI | SPI Master Out Slave In |
| | NSS / CS | `GPIO 5` | VSPI SS | Chip Select |
| | RESET | `GPIO 4` | GPIO Output | Hardware Reset |
| | DIO0 | `GPIO 34` | GPI Input | **Mandatory** for continuous Rx IRQ |
| | VCC / GND | `3V3 / GND` | Power | **Must use 3.3V power only** |
| **MAX98357A** | BCLK | `GPIO 26` | I2S1 BCLK | Bit Clock |
| | LRC | `GPIO 25` | I2S1 WS | Left/Right Word Clock |
| | DIN | `GPIO 27` | I2S1 DOUT | Serial Data Out |
| | SD_MODE | `GPIO 13` | GPIO Output | HIGH = Active, LOW = Mute / Standby |
| | VIN / GND | `5V / GND` | Power | Connect to 5V (VBUS) for full 3.2W output |
| **SSD1306** | SDA | `GPIO 21` | I2C SDA | Data line |
| | SCL | `GPIO 22` | I2C SCL | Clock line (400 kHz) |
| | VCC / GND | `3V3 / GND` | Power | 3.3V logic rail |

> [!NOTE]
> `GPIO 34` and `GPIO 35` on the ESP32 are input-only pins without internal pull-up/pull-down resistors. They are ideal for radio interrupt lines (`DIO0`) and I2S microphone data inputs (`SD`).

---

## Packet Protocol

ResQ-Mesh uses a lightweight binary packet structure with explicit 2-byte headers followed by fixed payloads.

```
       0                   1                   2                   3
       0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
      +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
      |  Packet Type  |  Sequence No  |        Payload Data...        |
      +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

### 1. Voice Packet (`0xA1`)

- **Identifier**: `0xA1`
- **Total Length**: 34 bytes (2-byte header + 32-byte Codec2 payload)
- **Audio Duration**: 160 ms (4 frames @ 40 ms/frame)
- **Structure**:
  - `data[0]`: Packet Type (`0xA1`)
  - `data[1]`: 8-bit wrap-around sequence number (`0x00` – `0xFF`)
  - `data[2..33]`: 4 concatenated Codec2 frames (8 bytes per frame)

### 2. GPS Telemetry Packet (`0xA2`)

- **Identifier**: `0xA2`
- **Total Length**: 21 bytes (2-byte header + 19-byte `GpsPayload`)
- **Broadcast Frequency**: Every 10 seconds (transmitted only when voice queue $\le 1$)
- **Payload Layout (`struct GpsPayload`)**:

| Byte Offset | Field | Type | Scale / Format | Description |
| :--- | :--- | :--- | :--- | :--- |
| `0..3` | `latE6` | `int32_t` | $10^{-6}$ degrees | Latitude (micro-degrees) |
| `4..7` | `lonE6` | `int32_t` | $10^{-6}$ degrees | Longitude (micro-degrees) |
| `8..9` | `altM` | `int16_t` | Meters | GPS Altitude |
| `10..11` | `speedKmhX10` | `uint16_t` | $0.1\text{ km/h}$ | Ground speed |
| `12..13` | `courseX10` | `uint16_t` | $0.1^\circ$ | Heading angle |
| `14` | `sats` | `uint8_t` | Integer | Tracked satellites |
| `15` | `hdopX10` | `uint8_t` | $0.1$ | Horizontal Dilution of Precision |
| `16..18` | `hour`, `min`, `sec`| `uint8_t[3]` | UTC time | Time of fix |

---

## Getting Started

### Prerequisites

1. **Arduino IDE 2.x** or **VS Code with PlatformIO**.
2. **ESP32 Arduino Core** (version 2.0.14 or later recommended).
   - Board URL: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`

### Required Libraries

Install the following libraries via the Arduino Library Manager or PlatformIO Registry:

| Library Name | Author | Version Tested |
| :--- | :--- | :--- |
| **LoRa** | Sandeep Mistry | `^0.8.0` |
| **codec2** | David Rowe / ESP32 Codec2 | `^1.0.0` |
| **TinyGPSPlus** | Mikal Hart | `^1.0.3` |
| **Adafruit SSD1306** | Adafruit | `^2.5.9` |
| **Adafruit GFX Library** | Adafruit | `^1.11.9` |

### Board & Compiler Configuration

Before compiling either sketch, select the following options in the Arduino IDE **Tools** menu:

- **Board**: `ESP32 Dev Module`
- **CPU Frequency**: `240 MHz (WiFi/BT)`
- **Flash Frequency**: `80 MHz`
- **Flash Mode**: `QIO`
- **Partition Scheme**: `Huge APP (3MB No OTA/1MB SPIFFS)`
- **Upload Speed**: `921600`

> [!IMPORTANT]
> Initializing the Codec2 synthesis model (`codec2_create`) requires significant memory allocation. Both sketches explicitly invoke `SET_LOOP_TASK_STACK_SIZE(32 * 1024)` to expand the root FreeRTOS loop stack. If using custom platform configurations, ensure task stacks for Codec2 routines are allocated at $\ge 32\text{ KB}$.

### Flashing Instructions

1. **Transmitter Node**:
   - Open [code/resq_mesh_tx/resq_mesh_tx.ino](file:///c:/Users/rahul/Desktop/ResQ-Mesh/code/resq_mesh_tx/resq_mesh_tx.ino).
   - Connect the TX ESP32 module via USB.
   - Select the assigned COM port and click **Upload**.
   - Open Serial Monitor at **115200 baud** to confirm initialization.
2. **Receiver Node**:
   - Open [code/resq_mesh_rx/resq_mesh_rx.ino](file:///c:/Users/rahul/Desktop/ResQ-Mesh/code/resq_mesh_rx/resq_mesh_rx.ino).
   - Connect the RX ESP32 module via USB.
   - Select the assigned COM port and click **Upload**.
   - Observe the OLED display: it will initialize to `LORA VOICE RX - Listening...`.

---

## Configuration

Both nodes contain tuned configuration parameters at the top of their respective `.ino` files.

### 1. RF Frequency & ISM Regulations

Adjust the carrier frequency according to your local regional regulations:

```cpp
// Frequency in Hertz
#define LORA_FREQ      433E6    // 433 MHz (ITU Region 1 / Asia / Europe)
// #define LORA_FREQ   868E6    // 868 MHz (Europe)
// #define LORA_FREQ   915E6    // 915 MHz (Americas / Australia)
```

Ensure `LORA_FREQ`, `LORA_SF`, `LORA_BW`, `LORA_CR`, and `LORA_SYNC` match identically across both sketches.

### 2. Audio Front-End Tuning (Transmitter)

```cpp
#define MIC_GAIN            6.0f     // Digital multiplier for INMP441 audio
#define HPF_HZ              150.0f   // High-pass cutoff (eliminates rumble and DC)
#define LPF_HZ              3400.0f  // Low-pass anti-aliasing cutoff before 8 kHz decimation
#define NOISE_GATE          0        // 0 = Always streaming (default); 1 = Enable gate
#define GATE_OPEN_RMS       250.0f   // RMS threshold to open gate
#define GATE_CLOSE_RMS      150.0f   // RMS threshold to close gate
```

> [!TIP]
> Keep `NOISE_GATE` disabled (`0`) during bench testing. A noise gate set too strictly in a quiet room can suppress faint speech, mimicking a hardware failure. Once voice clarity is confirmed, enable the gate to conserve RF airtime between transmissions.

### 3. Jitter Buffer & Output Tuning (Receiver)

```cpp
#define JITTER_PACKETS      3        // Packets buffered before playback starts (480 ms)
#define MAX_BUFFERED        7        // Latency cap: oldest audio dropped above this threshold
#define MAX_FILL_GAP        6        // Missing packets filled with silence (up to ~960 ms)
#define SPK_GAIN            1.0f     // Software gain multiplier (1.0 = unity)
#define RX_MUTE_PEAK        30       // Clamps background noise floor to true silence
#define AMP_SD_CONTROL      1        // 1 = Mute amplifier during radio silence (no hiss)
```

---

## Diagnostics & Telemetry

### OLED Display Layout (Receiver)

The SSD1306 OLED screen updates every 250 ms to display real-time mission status:

```
+-----------------------------------+
| LORA VOICE RX                     |
| >> LINK OK          [or LINK LOST]|
| RSSI: -68 dBm       SNR: 8.5 dB   |
| OK: 1420   Lost: 8    (0.6%)      |
| GPS 9sat  2s ago                  |
| Lat: 22.572645                    |
| Lon: 88.363892                    |
| Vol [|||||||||||||||............] |
+-----------------------------------+
```

### Serial Diagnostic Reports

Both nodes print comprehensive telemetry reports every 5 seconds to the Serial Monitor (**115200 baud**).

#### Transmitter Diagnostic Output:
```text
========== TX STATUS ==========
Mic frame RMS: quietest 14 (noise floor), loudest 840 (speech)
Slowest encode: 4.8 ms (frame period 40 ms)
Slowest LoRa transmit: 74 ms
Voice packets sent: 1580 | GPS packets sent: 32 (dropped 0)
Dropped PCM frames: 0 | dropped voice packets: 0
Mic errors: 0 | LoRa errors: 0 | radio resets: 0
GPS: FIX | sats 9 | chars 14208 | bad checksums 0
GPS position: 22.572645, 88.363892 | alt 18 m | 0.0 km/h
Stack min free bytes: mic=5120 codec=24180 lora=6144 gps=2890 loop=28400
Heap: 184512
===============================
```

#### Receiver Diagnostic Output:
```text
========== RX STATUS ==========
Voice packets: 1580 | lost: 8 (0.5%)
GPS packets received: 32
Radio: DIO0 interrupts 1612 | CRC/empty 0 | found by poll only 0
Decoded frames: 6320 | muted (silent): 412
Invalid packets: 0 | queue-full drops: 0 | skipped (latency cap): 0 | audio errors: 0
Last voice packet: 140 ms ago, RSSI -68 dBm, SNR 8.5 dB
Decoded peak level: 12450 | slowest decode: 3.9 ms (frame period 40 ms)
Queue waiting: 3
[GPS] 22.572645, 88.363892 | alt 18 m | 0.0 km/h | sats 9 | RSSI -68 dBm
[GPS] Map: https://maps.google.com/?q=22.572645,88.363892
===============================
```

---

## Live Rescue Monitoring Dashboard (Local-First)

The repository includes a dedicated, mission-grade emergency response command center dashboard designed for field search-and-rescue (SAR) operators. The dashboard connects locally to the ESP32 receiver over USB Serial without requiring internet or cloud infrastructure.

```
+-----------------------------------------------------------------------------------------+
|                                    RESQ-MESH DASHBOARD                                  |
|                                                                                         |
|  [ESP32 Receiver] ---> (USB Serial @ 115200) ---> [FastAPI / PySerial Bridge]           |
|                                                          |                              |
|                                          +---------------+---------------+              |
|                                          |                               |              |
|                                    (WebSockets)                     (SQLite DB)         |
|                                          |                               |              |
|                                          v                               v              |
|                             [React + Vite Frontend] <-------- [Historical Replay]       |
|                             (Leaflet / OpenStreetMap)                                   |
+-----------------------------------------------------------------------------------------+
```

### Dashboard Architecture & Stack

- **Frontend**: React 18, Vite 5, TypeScript, Tailwind CSS, Leaflet + OpenStreetMap, Lucide Icons.
- **Backend Bridge**: Python 3.10+, FastAPI, PySerial, WebSockets, Pydantic v2.
- **Local Persistence**: Thread-safe SQLite database (`backend/data/resq_mesh.db`) recording GPS trajectories, packet loss history, and raw serial logs.
- **Design System**: Premium emergency response command-center dark mode (charcoal/navy palette `#070a12` / `#0b0f19`, restrained cyan `#06b6d4`, emerald, amber, and rose status accents).

### Quickstart & Installation

#### 1. Backend Setup

```bash
# Navigate to the backend directory
cd backend

# Install dependencies
pip install -r requirements.txt

# Run the backend server (starts on http://127.0.0.1:8000)
python run.py
```

#### 2. Frontend Setup (Development Mode)

```bash
# In a new terminal, navigate to the frontend directory
cd frontend

# Install dependencies
npm install

# Start the Vite development server (starts on http://localhost:5173)
npm run dev
```

> [!TIP]
> The backend automatically serves the production frontend build. You can build the frontend with `npm run build` inside `frontend/`, and then run only `python backend/run.py` to access the full application directly at `http://localhost:8000/`.

### Operating Modes & COM Port Configuration

- **Hardware Mode**: Connect the ESP32 receiver via USB. Open the **Settings** tab in the dashboard, click the **Refresh** button, select the assigned COM port (e.g. `COM3` on Windows or `/dev/ttyUSB0` on Linux), confirm the baud rate is set to **115200**, and click **Connect Receiver**.
- **Offline Simulation Mode**: If an ESP32 receiver is not physically attached, click **Start Offline Simulation** in the navigation bar or Settings page. The simulator emits verified protocol strings matching the immutable receiver firmware, generating realistic SAR search-grid movements and voice stream events for test and evaluation. All simulated telemetry is clearly labeled with `[SIMULATED]` badges.

### Audio Protocol & Physical Speaker Notice

> [!NOTE]
> In accordance with the immutable firmware protocol documented in [RX_SERIAL_PROTOCOL.md](file:///c:/Users/rahul/Desktop/ResQ-Mesh/RX_SERIAL_PROTOCOL.md), raw PCM audio samples and Codec2 bitstream frames are **not transmitted across USB Serial**. The receiver's dual-core FreeRTOS pipeline routes audio directly over I2S to the on-board **MAX98357A Class-D DAC and 3W speaker**. The dashboard displays real-time speech activity, peak VU amplitude meters, Codec2 decode latency, and jitter buffer health, while providing an in-browser audio test fixture for operator verification.

### Test Procedures

Run the automated backend test suite:

```bash
# Run verified parser and API unit tests
python -m pytest backend/tests -v
```

Run frontend typecheck and production build:

```bash
cd frontend
npm run build
```

---

## Troubleshooting

| Symptom | Probable Cause | Corrective Action |
| :--- | :--- | :--- |
| **`LORA INIT ERROR`** | SPI wiring error or unpowered SX1278 module. | Check pins `18 (SCK)`, `19 (MISO)`, `23 (MOSI)`, `5 (NSS)`, and `4 (RST)`. Verify SX1278 is supplied with stable 3.3V. |
| **`CODEC INIT ERROR`** | Insufficient FreeRTOS task stack size. | Ensure `SET_LOOP_TASK_STACK_SIZE(32 * 1024)` is present and the partition scheme provides sufficient RAM. |
| **`packet found by polling, DIO0 did not fire`** | DIO0 pin disconnected on RX node. | Solder a jumper wire from the SX1278 `DIO0` pin directly to ESP32 `GPIO 34`. Interrupt-driven RX is required for zero-gap audio. |
| **Silent or crackling mic audio (`Mic RMS < 3`)** | INMP441 wiring fault or floating L/R pin. | Ensure `L/R` is tied to **GND** (Left channel). Verify `SCK -> GPIO 32`, `WS -> GPIO 33`, and `SD -> GPIO 35`. |
| **Loud idle hiss on speaker** | MAX98357A amplifier left unmuted during standby. | Connect MAX98357A `SD_MODE` pin to ESP32 `GPIO 13` and verify `AMP_SD_CONTROL 1` is enabled in firmware. |
| **GPS displays `searching for satellites`** | Indoor testing or weak satellite reception. | Move the GPS antenna near an exterior window or outdoors. Confirm `GPS_TX -> GPIO 16` and `GPS_RX -> GPIO 17`. |
| **ESP32 Brownout Reset (`BROWNOUT`)** | LoRa 17 dBm power bursts exceeding USB current capacity. | Connect a $470\,\mu\text{F} - 1000\,\mu\text{F}$ electrolytic capacitor across the ESP32 `3V3` and `GND` rails, or use an external 5V 2A power supply. |
