"""
Local SQLite database storage for ResQ-Mesh.
Stores telemetry, GPS paths, packet stats, warnings, and raw logs.
Thread-safe and local-first.
"""
import sqlite3
import os
import threading
import time
from typing import List, Dict, Any, Optional
from .schemas import GpsEvent, PacketStatsEvent, WarningEvent, RawLogEvent


class StorageManager:
    def __init__(self, db_path: str = "backend/data/resq_mesh.db"):
        self.db_path = db_path
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._lock = threading.Lock()
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._lock:
            conn = self._get_connection()
            cur = conn.cursor()
            cur.execute("""
                CREATE TABLE IF NOT EXISTS gps_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp REAL,
                    latitude REAL,
                    longitude REAL,
                    altitude_m INTEGER,
                    speed_kmh REAL,
                    course_deg REAL,
                    satellites INTEGER,
                    hdop REAL,
                    utc_time TEXT,
                    rssi_dbm INTEGER,
                    google_maps_url TEXT,
                    is_simulated INTEGER
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS packet_stats (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp REAL,
                    voice_packets_received INTEGER,
                    voice_packets_lost INTEGER,
                    packet_loss_pct REAL,
                    gps_packets_received INTEGER,
                    dio0_interrupts INTEGER,
                    crc_or_empty INTEGER,
                    polled_catches INTEGER,
                    decoded_frames INTEGER,
                    muted_frames INTEGER,
                    invalid_packets INTEGER,
                    queue_drops INTEGER,
                    skipped_packets INTEGER,
                    audio_errors INTEGER,
                    last_voice_ms_ago INTEGER,
                    last_rssi_dbm INTEGER,
                    last_snr_db REAL,
                    decoded_peak_level INTEGER,
                    slowest_decode_ms REAL,
                    queue_waiting INTEGER,
                    heap_free INTEGER,
                    is_simulated INTEGER
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS raw_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp REAL,
                    line TEXT,
                    is_unknown INTEGER,
                    is_simulated INTEGER
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS warnings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp REAL,
                    subsystem TEXT,
                    message TEXT,
                    is_simulated INTEGER
                )
            """)
            # Create indices for quick time-range queries
            cur.execute("CREATE INDEX IF NOT EXISTS idx_gps_time ON gps_history (timestamp)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_stats_time ON packet_stats (timestamp)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_logs_time ON raw_logs (timestamp)")
            conn.commit()
            conn.close()

    def save_gps(self, event: GpsEvent):
        with self._lock:
            conn = self._get_connection()
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO gps_history (
                    timestamp, latitude, longitude, altitude_m, speed_kmh, course_deg,
                    satellites, hdop, utc_time, rssi_dbm, google_maps_url, is_simulated
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                event.timestamp, event.latitude, event.longitude, event.altitude_m,
                event.speed_kmh, event.course_deg, event.satellites, event.hdop,
                event.utc_time, event.rssi_dbm, event.google_maps_url, 1 if event.is_simulated else 0
            ))
            conn.commit()
            conn.close()

    def save_packet_stats(self, event: PacketStatsEvent):
        with self._lock:
            conn = self._get_connection()
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO packet_stats (
                    timestamp, voice_packets_received, voice_packets_lost, packet_loss_pct,
                    gps_packets_received, dio0_interrupts, crc_or_empty, polled_catches,
                    decoded_frames, muted_frames, invalid_packets, queue_drops,
                    skipped_packets, audio_errors, last_voice_ms_ago, last_rssi_dbm,
                    last_snr_db, decoded_peak_level, slowest_decode_ms, queue_waiting,
                    heap_free, is_simulated
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                event.timestamp, event.voice_packets_received, event.voice_packets_lost,
                event.packet_loss_pct, event.gps_packets_received, event.dio0_interrupts,
                event.crc_or_empty, event.polled_catches, event.decoded_frames,
                event.muted_frames, event.invalid_packets, event.queue_drops,
                event.skipped_packets, event.audio_errors, event.last_voice_ms_ago,
                event.last_rssi_dbm, event.last_snr_db, event.decoded_peak_level,
                event.slowest_decode_ms, event.queue_waiting, event.heap_free,
                1 if event.is_simulated else 0
            ))
            conn.commit()
            conn.close()

    def save_raw_log(self, event: RawLogEvent):
        with self._lock:
            conn = self._get_connection()
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO raw_logs (timestamp, line, is_unknown, is_simulated)
                VALUES (?, ?, ?, ?)
            """, (event.timestamp, event.line, 1 if event.is_unknown else 0, 1 if event.is_simulated else 0))
            conn.commit()
            conn.close()

    def save_warning(self, event: WarningEvent):
        with self._lock:
            conn = self._get_connection()
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO warnings (timestamp, subsystem, message, is_simulated)
                VALUES (?, ?, ?, ?)
            """, (event.timestamp, event.subsystem, event.message, 1 if event.is_simulated else 0))
            conn.commit()
            conn.close()

    def get_gps_history(self, limit: int = 500) -> List[Dict[str, Any]]:
        with self._lock:
            conn = self._get_connection()
            cur = conn.cursor()
            cur.execute("""
                SELECT * FROM gps_history ORDER BY timestamp ASC LIMIT ?
            """, (limit,))
            rows = [dict(r) for r in cur.fetchall()]
            conn.close()
            return rows

    def get_packet_stats_history(self, limit: int = 100) -> List[Dict[str, Any]]:
        with self._lock:
            conn = self._get_connection()
            cur = conn.cursor()
            cur.execute("""
                SELECT * FROM packet_stats ORDER BY timestamp DESC LIMIT ?
            """, (limit,))
            rows = [dict(r) for r in cur.fetchall()]
            conn.close()
            return rows

    def get_raw_logs(self, limit: int = 200, only_unknown: bool = False) -> List[Dict[str, Any]]:
        with self._lock:
            conn = self._get_connection()
            cur = conn.cursor()
            if only_unknown:
                cur.execute("""
                    SELECT * FROM raw_logs WHERE is_unknown = 1 ORDER BY timestamp DESC LIMIT ?
                """, (limit,))
            else:
                cur.execute("""
                    SELECT * FROM raw_logs ORDER BY timestamp DESC LIMIT ?
                """, (limit,))
            rows = [dict(r) for r in cur.fetchall()]
            conn.close()
            return rows

    def get_total_records_count(self) -> int:
        with self._lock:
            conn = self._get_connection()
            cur = conn.cursor()
            cur.execute("SELECT (SELECT COUNT(*) FROM gps_history) + (SELECT COUNT(*) FROM packet_stats) + (SELECT COUNT(*) FROM raw_logs)")
            total = cur.fetchone()[0]
            conn.close()
            return total

    def clear_database(self):
        with self._lock:
            conn = self._get_connection()
            cur = conn.cursor()
            cur.execute("DELETE FROM gps_history")
            cur.execute("DELETE FROM packet_stats")
            cur.execute("DELETE FROM raw_logs")
            cur.execute("DELETE FROM warnings")
            conn.commit()
            conn.close()
