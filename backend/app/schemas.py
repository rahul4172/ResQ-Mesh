"""
Data models and schemas for ResQ-Mesh Serial events and REST APIs.
"""
from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field
from enum import Enum


class EventType(str, Enum):
    GPS = "gps"
    AUDIO_LIFECYCLE = "audio_lifecycle"
    STATUS_REPORT = "status_report"
    RAW_LOG = "raw_log"
    WARNING = "warning"
    BOOT = "boot"
    CONNECTION_STATE = "connection_state"


class AudioStreamState(str, Enum):
    IDLE = "IDLE"
    STREAMING = "STREAMING"
    ERROR = "ERROR"


class GpsEvent(BaseModel):
    latitude: float = Field(..., description="Latitude in decimal degrees")
    longitude: float = Field(..., description="Longitude in decimal degrees")
    altitude_m: int = Field(0, description="Altitude in meters")
    speed_kmh: float = Field(0.0, description="Speed in km/h")
    course_deg: float = Field(0.0, description="Heading course in degrees")
    satellites: int = Field(0, description="Tracked satellites")
    hdop: float = Field(99.0, description="Horizontal Dilution of Precision")
    utc_time: str = Field("00:00:00", description="GPS UTC time HH:MM:SS")
    rssi_dbm: int = Field(0, description="Packet RSSI in dBm")
    google_maps_url: Optional[str] = None
    is_simulated: bool = False
    timestamp: float = Field(..., description="Unix timestamp of reception")


class AudioLifecycleEvent(BaseModel):
    state: AudioStreamState
    message: str
    peak_level: Optional[int] = Field(None, description="Decoded PCM peak amplitude 0-32767")
    slowest_decode_ms: Optional[float] = None
    muted_frames: Optional[int] = None
    decoded_frames: Optional[int] = None
    is_simulated: bool = False
    timestamp: float


class PacketStatsEvent(BaseModel):
    voice_packets_received: int = 0
    voice_packets_lost: int = 0
    packet_loss_pct: float = 0.0
    gps_packets_received: int = 0
    dio0_interrupts: int = 0
    crc_or_empty: int = 0
    polled_catches: int = 0
    decoded_frames: int = 0
    muted_frames: int = 0
    invalid_packets: int = 0
    queue_drops: int = 0
    skipped_packets: int = 0
    audio_errors: int = 0
    last_voice_ms_ago: Optional[int] = None
    last_rssi_dbm: Optional[int] = None
    last_snr_db: Optional[float] = None
    decoded_peak_level: int = 0
    slowest_decode_ms: float = 0.0
    queue_waiting: int = 0
    stack_watermark_lora: int = 0
    stack_watermark_playback: int = 0
    stack_watermark_loop: int = 0
    heap_free: int = 0
    is_simulated: bool = False
    timestamp: float


class RawLogEvent(BaseModel):
    line: str
    is_unknown: bool = False
    is_simulated: bool = False
    timestamp: float


class WarningEvent(BaseModel):
    subsystem: str
    message: str
    is_simulated: bool = False
    timestamp: float


class SerialPortInfo(BaseModel):
    port: str
    description: str
    hwid: str


class ConnectionState(BaseModel):
    is_connected: bool = False
    is_simulated: bool = False
    port: Optional[str] = None
    baud_rate: int = 115200
    bytes_read: int = 0
    lines_read: int = 0
    last_activity: Optional[float] = None
    error: Optional[str] = None


class ConnectRequest(BaseModel):
    port: str
    baud_rate: int = 115200


class ConnectResponse(BaseModel):
    success: bool
    message: str
    state: ConnectionState


class SimulationToggleRequest(BaseModel):
    enable: bool
    interval_s: float = 1.0


class SystemStatusResponse(BaseModel):
    connection: ConnectionState
    latest_gps: Optional[GpsEvent] = None
    latest_audio: Optional[AudioLifecycleEvent] = None
    latest_stats: Optional[PacketStatsEvent] = None
    active_warnings: List[WarningEvent] = []
    database_records_count: int = 0
