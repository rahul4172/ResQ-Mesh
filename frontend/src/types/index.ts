export type AudioStreamState = 'IDLE' | 'STREAMING' | 'ERROR';

export interface GpsEvent {
  latitude: number;
  longitude: number;
  altitude_m: number;
  speed_kmh: number;
  course_deg: number;
  satellites: number;
  hdop: number;
  utc_time: string;
  rssi_dbm: number;
  google_maps_url?: string;
  is_simulated: boolean;
  timestamp: number;
}

export interface AudioLifecycleEvent {
  state: AudioStreamState;
  message: string;
  peak_level?: number;
  slowest_decode_ms?: number;
  muted_frames?: number;
  decoded_frames?: number;
  is_simulated: boolean;
  timestamp: number;
}

export interface PacketStatsEvent {
  voice_packets_received: number;
  voice_packets_lost: number;
  packet_loss_pct: number;
  gps_packets_received: number;
  dio0_interrupts: number;
  crc_or_empty: number;
  polled_catches: number;
  decoded_frames: number;
  muted_frames: number;
  invalid_packets: number;
  queue_drops: number;
  skipped_packets: number;
  audio_errors: number;
  last_voice_ms_ago?: number;
  last_rssi_dbm?: number;
  last_snr_db?: number;
  decoded_peak_level: number;
  slowest_decode_ms: number;
  queue_waiting: number;
  stack_watermark_lora: number;
  stack_watermark_playback: number;
  stack_watermark_loop: number;
  heap_free: number;
  is_simulated: boolean;
  timestamp: number;
}

export interface RawLogEvent {
  id?: number;
  line: string;
  is_unknown: boolean;
  is_simulated: boolean;
  timestamp: number;
}

export interface WarningEvent {
  subsystem: string;
  message: string;
  is_simulated: boolean;
  timestamp: number;
}

export interface SerialPortInfo {
  port: string;
  description: string;
  hwid: string;
}

export interface ConnectionState {
  is_connected: boolean;
  is_simulated: boolean;
  port?: string;
  baud_rate: number;
  bytes_read: number;
  lines_read: number;
  last_activity?: number;
  error?: string;
}

export interface SystemStatusResponse {
  connection: ConnectionState;
  latest_gps?: GpsEvent;
  latest_audio?: AudioLifecycleEvent;
  latest_stats?: PacketStatsEvent;
  active_warnings: WarningEvent[];
  database_records_count: number;
}
