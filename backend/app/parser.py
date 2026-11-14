"""
Parser for the immutable ResQ-Mesh RX ESP32 Serial Protocol.
Implements zero-assumption, strictly-verified regex matching.
"""
import re
import time
from typing import Optional, Dict, Any, Tuple, List
from .schemas import (
    GpsEvent,
    AudioLifecycleEvent,
    AudioStreamState,
    PacketStatsEvent,
    RawLogEvent,
    WarningEvent,
    EventType,
)


class RxSerialParser:
    """
    Parses incoming lines from the ResQ-Mesh RX ESP32.
    Stateful to assemble multi-line status reports.
    """

    # [GPS] 22.572645, 88.363892 | alt 18 m | 0.0 km/h | course 124.5 | sats 9 | hdop 1.2 | UTC 14:22:05 | RSSI -68 dBm
    GPS_REGEX = re.compile(
        r"^\[GPS\]\s+([-+]?\d+\.\d+),\s*([-+]?\d+\.\d+)\s*\|\s*alt\s+(-?\d+)\s*m\s*\|\s*([\d\.]+)\s*km\/h\s*\|\s*course\s*([\d\.]+)\s*\|\s*sats\s*(\d+)\s*\|\s*hdop\s*([\d\.]+)\s*\|\s*UTC\s*(\d{2}:\d{2}:\d{2})\s*\|\s*RSSI\s*(-?\d+)\s*dBm"
    )

    # [GPS] Map: https://maps.google.com/?q=22.572645,88.363892
    GPS_MAP_REGEX = re.compile(r"^\[GPS\]\s+Map:\s+(https?:\/\/\S+)")

    # Playback Stream Started / Ended
    PLAYBACK_START_REGEX = re.compile(r"^\[PLAYBACK\]\s+Stream started")
    PLAYBACK_END_REGEX = re.compile(r"^\[PLAYBACK\]\s+Stream ended,\s*waiting for audio")
    AUDIO_ERROR_REGEX = re.compile(r"^\[AUDIO\]\s+Playback error")

    # Status Report Block delimiters
    STATUS_START_REGEX = re.compile(r"^={5,}\s*RX STATUS\s*={5,}")
    STATUS_END_REGEX = re.compile(r"^={20,}")

    # Status Block individual lines
    STAT_VOICE_REGEX = re.compile(r"Voice packets:\s*(\d+)\s*\|\s*lost:\s*(\d+)\s*\(([\d\.]+)%\)")
    STAT_GPS_REGEX = re.compile(r"GPS packets received:\s*(\d+)")
    STAT_RADIO_REGEX = re.compile(r"Radio:\s*DIO0 interrupts\s*(\d+)\s*\|\s*CRC\/empty\s*(\d+)\s*\|\s*found by poll only\s*(\d+)")
    STAT_FRAMES_REGEX = re.compile(r"Decoded frames:\s*(\d+)\s*\|\s*muted \(silent\):\s*(\d+)")
    STAT_DROPS_REGEX = re.compile(r"Invalid packets:\s*(\d+)\s*\|\s*queue-full drops:\s*(\d+)\s*\|\s*skipped \(latency cap\):\s*(\d+)\s*\|\s*audio errors:\s*(\d+)")
    STAT_LAST_VOICE_REGEX = re.compile(r"Last voice packet:\s*(\d+)\s*ms ago,\s*RSSI\s*(-?\d+)\s*dBm,\s*SNR\s*([-+]?[\d\.]+)\s*dB")
    STAT_NO_VOICE_REGEX = re.compile(r"No voice packets received yet")
    STAT_PEAK_REGEX = re.compile(r"Decoded peak level:\s*(\d+)\s*\|\s*slowest decode:\s*([\d\.]+)\s*ms")
    STAT_QUEUE_REGEX = re.compile(r"Queue waiting:\s*(\d+)")
    STAT_STACK_REGEX = re.compile(r"Stack min free bytes:\s*lora=(\d+)\s+playback=(\d+)\s+loop=(\d+)")
    STAT_HEAP_REGEX = re.compile(r"Heap:\s*(\d+)")

    # Warnings
    LORA_WARN_REGEX = re.compile(r"^\[LORA\]\s+WARNING:\s*(.+)")

    def __init__(self):
        self._in_status_block = False
        self._current_status_data: Dict[str, Any] = {}
        self._last_gps_event: Optional[GpsEvent] = None

    def parse_line(self, raw_line: str, is_simulated: bool = False, now: Optional[float] = None) -> List[Tuple[EventType, Any]]:
        """
        Parses a single line of serial text and returns a list of (EventType, ParsedModel) tuples.
        """
        if now is None:
            now = time.time()
        
        line = raw_line.strip()
        results: List[Tuple[EventType, Any]] = []

        if not line:
            return results

        # 1. Check for Status Report Block Start
        if self.STATUS_START_REGEX.search(line):
            self._in_status_block = True
            self._current_status_data = {}
            results.append((EventType.RAW_LOG, RawLogEvent(line=line, is_unknown=False, is_simulated=is_simulated, timestamp=now)))
            return results

        # 2. Check for Status Report Block End
        if self._in_status_block and self.STATUS_END_REGEX.search(line):
            self._in_status_block = False
            # Build PacketStatsEvent from accumulated data
            stats_event = self._build_stats_event(is_simulated, now)
            results.append((EventType.STATUS_REPORT, stats_event))
            results.append((EventType.RAW_LOG, RawLogEvent(line=line, is_unknown=False, is_simulated=is_simulated, timestamp=now)))
            return results

        # 3. If inside Status Block, match individual fields
        if self._in_status_block:
            self._parse_status_field(line)
            results.append((EventType.RAW_LOG, RawLogEvent(line=line, is_unknown=False, is_simulated=is_simulated, timestamp=now)))
            return results

        # 4. Check for GPS Telemetry Line
        m_gps = self.GPS_REGEX.match(line)
        if m_gps:
            gps_evt = GpsEvent(
                latitude=float(m_gps.group(1)),
                longitude=float(m_gps.group(2)),
                altitude_m=int(m_gps.group(3)),
                speed_kmh=float(m_gps.group(4)),
                course_deg=float(m_gps.group(5)),
                satellites=int(m_gps.group(6)),
                hdop=float(m_gps.group(7)),
                utc_time=m_gps.group(8),
                rssi_dbm=int(m_gps.group(9)),
                google_maps_url=f"https://maps.google.com/?q={m_gps.group(1)},{m_gps.group(2)}",
                is_simulated=is_simulated,
                timestamp=now,
            )
            self._last_gps_event = gps_evt
            results.append((EventType.GPS, gps_evt))
            results.append((EventType.RAW_LOG, RawLogEvent(line=line, is_unknown=False, is_simulated=is_simulated, timestamp=now)))
            return results

        # 5. Check for GPS Map URL line (companion to GPS line)
        m_map = self.GPS_MAP_REGEX.match(line)
        if m_map:
            if self._last_gps_event:
                self._last_gps_event.google_maps_url = m_map.group(1)
            results.append((EventType.RAW_LOG, RawLogEvent(line=line, is_unknown=False, is_simulated=is_simulated, timestamp=now)))
            return results

        # 6. Check Audio Playback Lifecycle
        if self.PLAYBACK_START_REGEX.search(line):
            audio_evt = AudioLifecycleEvent(
                state=AudioStreamState.STREAMING,
                message="LoRa voice stream started (buffered 3 packets)",
                is_simulated=is_simulated,
                timestamp=now,
            )
            results.append((EventType.AUDIO_LIFECYCLE, audio_evt))
            results.append((EventType.RAW_LOG, RawLogEvent(line=line, is_unknown=False, is_simulated=is_simulated, timestamp=now)))
            return results

        if self.PLAYBACK_END_REGEX.search(line):
            audio_evt = AudioLifecycleEvent(
                state=AudioStreamState.IDLE,
                message="LoRa voice stream ended, waiting for audio",
                is_simulated=is_simulated,
                timestamp=now,
            )
            results.append((EventType.AUDIO_LIFECYCLE, audio_evt))
            results.append((EventType.RAW_LOG, RawLogEvent(line=line, is_unknown=False, is_simulated=is_simulated, timestamp=now)))
            return results

        if self.AUDIO_ERROR_REGEX.search(line):
            audio_evt = AudioLifecycleEvent(
                state=AudioStreamState.ERROR,
                message="I2S Playback DMA error detected",
                is_simulated=is_simulated,
                timestamp=now,
            )
            results.append((EventType.AUDIO_LIFECYCLE, audio_evt))
            results.append((EventType.RAW_LOG, RawLogEvent(line=line, is_unknown=False, is_simulated=is_simulated, timestamp=now)))
            return results

        # 7. Check Warning Events
        m_warn = self.LORA_WARN_REGEX.match(line)
        if m_warn:
            warn_evt = WarningEvent(
                subsystem="LORA",
                message=m_warn.group(1),
                is_simulated=is_simulated,
                timestamp=now,
            )
            results.append((EventType.WARNING, warn_evt))
            results.append((EventType.RAW_LOG, RawLogEvent(line=line, is_unknown=False, is_simulated=is_simulated, timestamp=now)))
            return results

        # 8. Known Boot Messages (mark as known log)
        if (
            "RESQ-MESH RECEIVER" in line
            or "[CODEC]" in line
            or "[AUDIO]" in line
            or "[LORA]" in line
            or "[SELFTEST]" in line
            or "[SYSTEM]" in line
            or "Reset reason:" in line
            or "Free heap at boot:" in line
            or "RECEIVER READY" in line
            or line.startswith("===")
        ):
            results.append((EventType.RAW_LOG, RawLogEvent(line=line, is_unknown=False, is_simulated=is_simulated, timestamp=now)))
            return results

        # 9. Unknown record: Preserve completely for diagnostics
        results.append((EventType.RAW_LOG, RawLogEvent(line=line, is_unknown=True, is_simulated=is_simulated, timestamp=now)))
        return results

    def _parse_status_field(self, line: str):
        """Extracts status variables from individual lines inside the status block."""
        m = self.STAT_VOICE_REGEX.search(line)
        if m:
            self._current_status_data["voice_packets_received"] = int(m.group(1))
            self._current_status_data["voice_packets_lost"] = int(m.group(2))
            self._current_status_data["packet_loss_pct"] = float(m.group(3))
            return

        m = self.STAT_GPS_REGEX.search(line)
        if m:
            self._current_status_data["gps_packets_received"] = int(m.group(1))
            return

        m = self.STAT_RADIO_REGEX.search(line)
        if m:
            self._current_status_data["dio0_interrupts"] = int(m.group(1))
            self._current_status_data["crc_or_empty"] = int(m.group(2))
            self._current_status_data["polled_catches"] = int(m.group(3))
            return

        m = self.STAT_FRAMES_REGEX.search(line)
        if m:
            self._current_status_data["decoded_frames"] = int(m.group(1))
            self._current_status_data["muted_frames"] = int(m.group(2))
            return

        m = self.STAT_DROPS_REGEX.search(line)
        if m:
            self._current_status_data["invalid_packets"] = int(m.group(1))
            self._current_status_data["queue_drops"] = int(m.group(2))
            self._current_status_data["skipped_packets"] = int(m.group(3))
            self._current_status_data["audio_errors"] = int(m.group(4))
            return

        m = self.STAT_LAST_VOICE_REGEX.search(line)
        if m:
            self._current_status_data["last_voice_ms_ago"] = int(m.group(1))
            self._current_status_data["last_rssi_dbm"] = int(m.group(2))
            self._current_status_data["last_snr_db"] = float(m.group(3))
            return

        if self.STAT_NO_VOICE_REGEX.search(line):
            self._current_status_data["last_voice_ms_ago"] = None
            return

        m = self.STAT_PEAK_REGEX.search(line)
        if m:
            self._current_status_data["decoded_peak_level"] = int(m.group(1))
            self._current_status_data["slowest_decode_ms"] = float(m.group(2))
            return

        m = self.STAT_QUEUE_REGEX.search(line)
        if m:
            self._current_status_data["queue_waiting"] = int(m.group(1))
            return

        m = self.STAT_STACK_REGEX.search(line)
        if m:
            self._current_status_data["stack_watermark_lora"] = int(m.group(1))
            self._current_status_data["stack_watermark_playback"] = int(m.group(2))
            self._current_status_data["stack_watermark_loop"] = int(m.group(3))
            return

        m = self.STAT_HEAP_REGEX.search(line)
        if m:
            self._current_status_data["heap_free"] = int(m.group(1))
            return

    def _build_stats_event(self, is_simulated: bool, timestamp: float) -> PacketStatsEvent:
        """Constructs a PacketStatsEvent using accumulated status data."""
        d = self._current_status_data
        return PacketStatsEvent(
            voice_packets_received=d.get("voice_packets_received", 0),
            voice_packets_lost=d.get("voice_packets_lost", 0),
            packet_loss_pct=d.get("packet_loss_pct", 0.0),
            gps_packets_received=d.get("gps_packets_received", 0),
            dio0_interrupts=d.get("dio0_interrupts", 0),
            crc_or_empty=d.get("crc_or_empty", 0),
            polled_catches=d.get("polled_catches", 0),
            decoded_frames=d.get("decoded_frames", 0),
            muted_frames=d.get("muted_frames", 0),
            invalid_packets=d.get("invalid_packets", 0),
            queue_drops=d.get("queue_drops", 0),
            skipped_packets=d.get("skipped_packets", 0),
            audio_errors=d.get("audio_errors", 0),
            last_voice_ms_ago=d.get("last_voice_ms_ago"),
            last_rssi_dbm=d.get("last_rssi_dbm"),
            last_snr_db=d.get("last_snr_db"),
            decoded_peak_level=d.get("decoded_peak_level", 0),
            slowest_decode_ms=d.get("slowest_decode_ms", 0.0),
            queue_waiting=d.get("queue_waiting", 0),
            stack_watermark_lora=d.get("stack_watermark_lora", 0),
            stack_watermark_playback=d.get("stack_watermark_playback", 0),
            stack_watermark_loop=d.get("stack_watermark_loop", 0),
            heap_free=d.get("heap_free", 0),
            is_simulated=is_simulated,
            timestamp=timestamp,
        )
