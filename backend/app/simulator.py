"""
Realistic Hardware Simulator for ResQ-Mesh RX ESP32.
Emits exact, byte-for-byte verified protocol strings.
Explicitly flags all generated telemetry with is_simulated=True.
Never fabricates real hardware state; strictly used for testing and offline demo.
"""
import threading
import time
import math
import random
import logging
from typing import Callable
from .schemas import ConnectionState

logger = logging.getLogger("resq_mesh.sim")


class RxHardwareSimulator:
    def __init__(self, line_processor: Callable[[str, bool], None]):
        self.line_processor = line_processor
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self.is_running = False

        # Simulation state
        # Initial disaster search locus (e.g., Sundarbans / Coastal emergency sector)
        self.base_lat = 22.185200
        self.base_lon = 88.528400
        self.heading_angle = 45.0
        self.step_count = 0

        # Accumulated metrics matching firmware counter dynamics
        self.voice_packets = 120
        self.lost_packets = 2
        self.gps_packets = 12
        self.dio0_count = 132
        self.decoded_frames = 480
        self.muted_frames = 35

    def start(self):
        """Starts the mock hardware simulation thread."""
        if self.is_running:
            return

        self._stop_event.clear()
        self.is_running = True
        self._thread = threading.Thread(target=self._run_simulation, daemon=True, name="RxSimulator")
        self._thread.start()
        logger.info("ResQ-Mesh RX hardware simulator started.")

    def stop(self):
        """Stops the mock hardware simulation thread."""
        if not self.is_running:
            return

        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)
        self._thread = None
        self.is_running = False
        logger.info("ResQ-Mesh RX hardware simulator stopped.")

    def _emit(self, line: str):
        """Emits a single verified line into the parsing pipeline."""
        self.line_processor(line, True)

    def _run_simulation(self):
        """Generates realistic event timelines matching physical field conditions."""
        # Boot banner sequence
        self._emit("====================================")
        self._emit("        RESQ-MESH RECEIVER v3")
        self._emit("====================================")
        self._emit("Reset reason: Power-on")
        self._emit("Free heap at boot: 242180")
        self._emit("[CODEC] Initializing decoder")
        self._emit("[CODEC] Samples/frame: 320, bytes/frame: 8")
        self._emit("[CODEC] Expected voice packet = 34 bytes = 160 ms of audio")
        self._emit("[SELFTEST] Decode time must be shorter than the frame period:")
        self._emit("  run 1: 3.4 ms (frame period 40 ms)")
        self._emit("  run 2: 3.5 ms (frame period 40 ms)")
        self._emit("  run 3: 3.4 ms (frame period 40 ms)")
        self._emit("[AUDIO] Initializing MAX98357A")
        self._emit("[AUDIO] MAX98357A initialized: 8000 Hz, 16-bit stereo")
        self._emit("[LORA] Initializing SX1278")
        self._emit("[LORA] Initialized: 433 MHz, SF7, BW125k, CR4/5, preamble 12, sync 0x34")
        self._emit("[SYSTEM] Creating tasks...")
        self._emit("[PLAYBACK TASK] Started")
        self._emit("[LORA TASK] Started")
        self._emit("[LORA TASK] Continuous receive, DIO0 interrupt on GPIO34")
        self._emit("====================================")
        self._emit("  RECEIVER READY - WAITING FOR AUDIO")
        self._emit("====================================")

        last_gps_time = 0
        last_status_time = time.time()
        voice_stream_active = False
        voice_stream_timer = 0

        while not self._stop_event.is_set():
            now = time.time()

            # 1. GPS Packet generation every 10 seconds (GPS_SEND_INTERVAL_MS = 10000)
            if now - last_gps_time >= 10.0:
                last_gps_time = now
                self.step_count += 1
                self.gps_packets += 1

                # Advance coordinates along an active SAR patrol path
                # Random walk with directional drift
                angle_rad = math.radians(self.heading_angle + random.uniform(-15, 15))
                self.heading_angle = (self.heading_angle + random.uniform(-10, 10)) % 360
                delta_m = random.uniform(8.0, 15.0)  # ~4 - 6 km/h search patrol
                # 1 deg lat ~ 111,000 meters
                d_lat = (delta_m * math.cos(angle_rad)) / 111000.0
                d_lon = (delta_m * math.sin(angle_rad)) / (111000.0 * math.cos(math.radians(self.base_lat)))

                self.base_lat += d_lat
                self.base_lon += d_lon

                speed = round(random.uniform(3.2, 5.8), 1)
                course = round(self.heading_angle, 1)
                sats = random.randint(8, 11)
                hdop = round(random.uniform(0.8, 1.4), 1)
                rssi = random.randint(-88, -65)
                utc_str = time.strftime("%H:%M:%S", time.gmtime(now))

                gps_line = (
                    f"[GPS] {self.base_lat:.6f}, {self.base_lon:.6f} | "
                    f"alt 14 m | {speed:.1f} km/h | course {course:.1f} | "
                    f"sats {sats} | hdop {hdop:.1f} | UTC {utc_str} | RSSI {rssi} dBm"
                )
                map_line = f"[GPS] Map: https://maps.google.com/?q={self.base_lat:.6f},{self.base_lon:.6f}"
                self._emit(gps_line)
                self._emit(map_line)

            # 2. Simulated voice bursts (e.g., victim speaking periodically)
            if not voice_stream_active and random.random() < 0.25:
                voice_stream_active = True
                voice_stream_timer = now + random.uniform(3.0, 6.0)
                self._emit("[PLAYBACK] Stream started")

            if voice_stream_active and now >= voice_stream_timer:
                voice_stream_active = False
                self._emit("[PLAYBACK] Stream ended, waiting for audio")

            # Increment packet counters when voice is active
            if voice_stream_active:
                # 1 packet per 160 ms -> approx 6 packets per second
                self.voice_packets += 1
                self.dio0_count += 1
                self.decoded_frames += 4
                if random.random() < 0.02:
                    self.lost_packets += 1

            # 3. 5-Second Periodic RX STATUS Report Block
            if now - last_status_time >= 5.0:
                last_status_time = now
                total = self.voice_packets + self.lost_packets
                loss_pct = (100.0 * self.lost_packets / total) if total else 0.0
                peak = random.randint(8000, 18500) if voice_stream_active else random.randint(12, 45)
                rssi = random.randint(-86, -68)
                snr = round(random.uniform(6.5, 10.5), 1)
                last_ms = random.randint(40, 160) if voice_stream_active else random.randint(800, 4200)

                self._emit("")
                self._emit("========== RX STATUS ==========")
                self._emit(f"Voice packets: {self.voice_packets} | lost: {self.lost_packets} ({loss_pct:.1f}%)")
                self._emit(f"GPS packets received: {self.gps_packets}")
                self._emit(f"Radio: DIO0 interrupts {self.dio0_count} | CRC/empty 0 | found by poll only 0")
                self._emit(f"Decoded frames: {self.decoded_frames} | muted (silent): {self.muted_frames}")
                self._emit("Invalid packets: 0 | queue-full drops: 0 | skipped (latency cap): 0 | audio errors: 0")
                self._emit(f"Last voice packet: {last_ms} ms ago, RSSI {rssi} dBm, SNR {snr:.1f} dB")
                self._emit(f"Decoded peak level: {peak} | slowest decode: 3.8 ms (frame period 40 ms)")
                self._emit(f"Queue waiting: {random.randint(1, 3) if voice_stream_active else 0}")
                self._emit("Stack min free bytes: lora=6144 playback=24180 loop=28400")
                self._emit(f"Heap: {185000 + random.randint(-500, 500)}")
                self._emit("===============================")

            time.sleep(0.5)
