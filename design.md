# RESQ-MESH — Interface Design Specification
**Document**: `design.md`  
**Version**: 1.0  
**Design direction**: Tactical intelligence / emergency operations command centre  
**Reference**: User-provided Overglass Fusion Intelligence Center screenshot  
**Product**: ResQ-Mesh Live Rescue Monitoring Dashboard  

---

## 1. Design Vision

ResQ-Mesh is designed as a high-density, dark operational command centre inspired by tactical intelligence and emergency-response workstations. The interface prioritizes glanceability, low glare, and situational awareness through a map-centric, information-dense composition.

### Defining Visual Characteristics
- **Dominant Central Map**: Occupies the core workspace ($\ge 55\%$ of screen area).
- **Persistent Left & Right Information Rails**: Slim, structured sidebars organizing operational controls, event feeds, and telemetry.
- **Layered Floating Overlays**: Floating layer toggles, HUD coordinate readouts, and map style controls positioned cleanly over the map.
- **Top Alert Ticker & Prominent Digital Clock**: High-visibility real-time clock (Local + Zulu UTC) and rotating alerts generated from verified application events.
- **Restrained Tactical Color Palette**: Near-black charcoal/navy base (`#080B0F` to `#151D23`) with high-contrast cyan (`#48D8D0`), teal (`#19A88F`), and semantic status indicators (emerald, amber, rose).
- **Fine 1px Borders & Technical HUD Framing**: Subtle corner brackets (`[ ... ]`), monospace telemetry typography, and compact uppercase section labeling.
- **Persistent Bottom Status Strip**: Real-time hardware and software health indicators (`USB`, `SERIAL`, `GPS`, `AUDIO`, `BRIDGE`, `WS`).

---

## 2. Product Goals & Operator Tasks

The dashboard provides immediate clarity for the 8 core operational questions:
1. **Is the RX ESP32 connected to the laptop over USB?**  
   *Answered by the Left Rail connection badge, Header ticker, and Bottom status strip.*
2. **Is serial data arriving?**  
   *Answered by the Serial Activity indicator and live line/byte throughput counters.*
3. **Is the receiver reporting a valid victim GPS position?**  
   *Answered by the GPS fix pill (`LIVE FIX`, `LAST KNOWN`, `NO VALID FIX`) and pulsing radar marker.*
4. **When was the last valid location received?**  
   *Answered by explicit age readouts (e.g., `4m 12s ago`) and stale position alerts.*
5. **Are voice-related packets visible in the RX serial output?**  
   *Answered by the Voice stream state, packet counters, and intercept event feed.*
6. **Can the available audio data actually be reconstructed and played?**  
   *Truthfully answered: The current RX firmware streams audio directly to the physical MAX98357A I2S speaker attached to the ESP32. Serial exposes stream lifecycle and VU peak metrics.*
7. **Are packets arriving, duplicated, missing, malformed, or unclassified?**  
   *Answered by the Packet Statistics panel tracking recognized packets, sequence loss %, and drops.*
8. **Is the local bridge and dashboard operating correctly?**  
   *Answered by the Receiver / Service Health panel tracking Python bridge, WebSocket, and parser states.*

---

## 3. Non-Negotiable Hardware & Data Constraints

- **Firmware Immutability**: The existing RX ESP32 firmware is immutable. No GPIO assignments, LoRa frequencies, Codec2 parameters, or I2S DAC connections may be modified.
- **Data Grounding**: The application reads strictly data exposed over USB Serial. No internal ESP32 memory or I2S digital audio lines are assumed to be accessible via USB.
- **Honest Audio State**: Displays *"Audio data unavailable from current RX serial output (routed to MAX98357A I2S DAC on ESP32)"*. No fake audio waveforms or deceptive playback controls for unavailable live audio.
- **Stale Fix Transparency**: Stale GPS positions ($>30\text{ s}$) are explicitly marked `LAST KNOWN` with calculated age.
- **Simulation Separation**: All simulated telemetry is clearly and permanently badged as `SIMULATION` / `MOCK MODE` and never mixed with real hardware data.

---

## 4. Overall Screen Composition

Designed primarily for 1440–1920 px operator workstations, scaling responsively to laptop widths (1024–1439 px):

```
+--------------------------------------------------------------------------------------------------------------------+
| TOP HEADER (58px): [Logo + RESQ-MESH] | [Alert Ticker: Verified System Events] | [05:15:07 PM Local / 2315Z] [MODE] |
+--------------------------------------------------------------------------------------------------------------------+
| LEFT RAIL (270px)    | CENTRAL MAP WORKSPACE (Dominant >= 55% Viewport)                    | RIGHT RAIL (280px)            |
| - Connection Panel   | - Dark CartoDB / Satellite Tactical Map                             | - Victim / GPS Status HUD     |
| - Intercept / Event  | - Floating Layer Selector (Victim, Trail, Audio loc, Accuracy)      | - Voice Comm & Codec2 Latency |
|   Feed (Categorized) | - Tactical Radar Victim Marker (Live Fix vs Last Known)             | - Packet Statistics & Loss %  |
| - Recent Voice       | - Location History Breadcrumb Trail                                 | - Subsystem & Service Health  |
|   Activity & VU Peak | - Floating Map HUD (Coordinates, Heading, Recenter, Style)          |   (CPU/Heap/Stacks/Watchdog)  |
+--------------------------------------------------------------------------------------------------------------------+
| BOTTOM STATUS STRIP (28px): USB: OK | SERIAL: ACT | GPS: FIX | AUDIO: HW I2S | BRIDGE: OK | WS: OK | LAT/LON | MODE    |
+--------------------------------------------------------------------------------------------------------------------+
```

---

## 5. Visual Design System

### 5.1 Color Palette
```css
--bg-app:          #080B0F; /* Main application background */
--bg-panel:        #10161B; /* Primary panels */
--bg-panel-raised: #151D23; /* Floating panels and cards */
--bg-panel-muted:  #0C1217; /* Secondary surfaces */
--border-subtle:   #26343A; /* Panel and card 1px borders */
--border-active:   #1D8F82; /* Selected/active panel accents */
--text-primary:    #DCE7E8; /* Main telemetry and headers */
--text-secondary:  #8B9A9E; /* Supporting labels */
--text-muted:      #58666B; /* Tertiary and disabled text */
--accent-cyan:     #48D8D0; /* Primary highlights and live markers */
--accent-teal:     #19A88F; /* Active and healthy states */
--accent-blue:     #4B91E8; /* Informational accents */
--status-success:  #35C98A; /* Healthy / Valid fix */
--status-warning:  #E6B84D; /* Stale / Degraded / Warning */
--status-critical: #F06464; /* Hardware failure / Packet drop */
--status-neutral:  #87949A; /* Unknown / Inactive */
```

### 5.2 Typography
- **UI & Interface**: Inter / system-ui, condensed, tracking `0.08em` to `0.12em` on section labels.
- **Telemetry & Numbers**: JetBrains Mono / Consolas for coordinates, timestamps, hex, and packet metrics.
- **Section Headers**: 10–11 px uppercase with tactical corner bracket accents `[ ... ]`.
- **Clock**: 20–24 px monospace high-visibility cyan digital display.

---

## 6. Component Specification

### 6.1 Top Header
- **Brand Block**: Vector shield mark + `RESQ-MESH` + `RESCUE COMMUNICATIONS CONSOLE`.
- **Alert Ticker**: Cycles real application notifications (e.g., `[RX USB CONNECTED]`, `[GPS FIX ACQUIRED: 22.185200, 88.528400]`, `[AUDIO: PHYSICAL I2S DAC ACTIVE]`, `[5S STATUS REPORT RECEIVED]`).
- **Clock**: Prominent cyan local time, Zulu UTC time, and compact date.
- **Mode Badge**: Unambiguous `LIVE HARDWARE`, `SIMULATION`, or `OFFLINE` indicator.

### 6.2 Left Rail
- **Receiver Connection Panel**: COM port dropdown, baud rate (115200), Connect/Disconnect, USB state, Serial throughput counter, and Reconnect button.
- **Intercept Feed**: Filterable by `ALL`, `SYS`, `SER`, `GPS`, `AUD`, `PKT`, `ERR`, with timestamps, severity dots, and expandable raw log lines.
- **Recent Voice Activity**: Audio stream state (`IDLE` / `STREAMING`), VU peak bar, Codec2 frame latency, and verified hardware speaker disclosure.

### 6.3 Central Map Workspace
- **Tactical Dark Map**: CartoDB Dark Matter tiles with sub-layer satellite switcher.
- **Victim Marker**: Pulsing radar beacon for live updates; visually muted amber icon with age counter for stale updates.
- **Movement Trail**: Subdued teal/cyan polyline linking verified historical fixes.
- **Floating Overlays**:
  - *Data Sources / Layers*: Checkbox toggles for Victim Marker, Location Trail, Range Rings, Event Markers.
  - *Map Controls*: Zoom in/out, Recenter on victim, Fit to trail, Map baselayer switcher.
  - *Active Beacon HUD*: Floating coordinates, heading compass, and satellite count.

### 6.4 Right Telemetry Rail
- **Victim / GPS Status**: Coordinate readout (6 decimals), Altitude, Ground Speed, Heading, Satellites, HDOP, Last Update age.
- **Voice Communication**: Audio state, Codec2 1600 bps mode, decode latency gauge ($3.8\text{ ms} / 40\text{ ms}$ budget), squelched frames count.
- **Packet Statistics**: Recognized packets, GPS beacons, Voice frames, sequence loss %, radio DIO0 interrupts, drops/skips.
- **Receiver / Service Health**: Status dots for USB Serial, Serial Activity, Python Bridge, WebSockets, Free Heap ($~185\text{ KB}$), and FreeRTOS task stacks.

### 6.5 Bottom Status Strip
- Persistent status pills: `USB`, `SERIAL`, `GPS`, `AUDIO`, `BRIDGE`, `WS`, current latitude/longitude readout, last event time, and mode pill.
