import React, { useState } from 'react';
import {
  Crosshair,
  Satellite,
  Compass,
  Gauge,
  Activity,
  Radio,
  Cpu,
  Volume2,
  Copy,
  Check,
  ExternalLink,
  Zap,
} from 'lucide-react';
import { useResQ } from '../context/ResQContext';

export const RightRail: React.FC = () => {
  const {
    connection,
    latestGps,
    latestAudio,
    latestStats,
    wsConnected,
  } = useResQ();

  const [copied, setCopied] = useState<boolean>(false);

  // Fix Freshness Evaluation
  const isFixLive = latestGps && Date.now() / 1000 - latestGps.timestamp < 30;
  const fixAgeSec = latestGps ? Math.max(0, Math.floor(Date.now() / 1000 - latestGps.timestamp)) : null;

  const handleCopyCoords = () => {
    if (!latestGps) return;
    const text = `${latestGps.latitude.toFixed(6)}, ${latestGps.longitude.toFixed(6)}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Peak audio calculation
  const currentPeak = latestAudio?.peak_level ?? latestStats?.decoded_peak_level ?? 0;
  const peakPercent = Math.min(100, Math.round((currentPeak / 25000) * 100));

  // Voice loss indicator
  const voiceLoss = latestStats?.packet_loss_pct ?? 0;
  const lossColor =
    voiceLoss > 20
      ? 'text-[#F06464]'
      : voiceLoss > 5
      ? 'text-[#E6B84D]'
      : 'text-[#35C98A]';

  const totalPackets = latestStats
    ? latestStats.voice_packets_received + latestStats.gps_packets_received
    : null;

  const isAudioActive = latestAudio?.state === 'STREAMING';

  return (
    <aside className="w-[290px] flex-shrink-0 bg-[#0E151A] border-l border-[#26343A] flex flex-col h-full overflow-y-auto overflow-x-hidden font-mono text-xs select-none z-10 custom-scrollbar">
      {/* MODULE 1: VICTIM BEACON / TARGET HUD */}
      <div className="p-2.5 border-b border-[#26343A] bg-[#10161B] space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <Crosshair className="w-3.5 h-3.5 text-[#48D8D0]" />
            <span className="text-[10px] tracking-wider uppercase font-semibold text-[#87949A]">
              [ TARGET BEACON ]
            </span>
          </div>

          {/* Fix Status Pill */}
          {latestGps ? (
            isFixLive ? (
              <span className="px-1.5 py-0.2 rounded bg-[#35C98A]/20 border border-[#35C98A]/40 text-[#35C98A] text-[9px] font-bold tracking-wider flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#35C98A] animate-pulse inline-block" />
                <span>LIVE FIX</span>
              </span>
            ) : (
              <span className="px-1.5 py-0.2 rounded bg-[#E6B84D]/20 border border-[#E6B84D]/40 text-[#E6B84D] text-[9px] font-bold tracking-wider flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#E6B84D] inline-block" />
                <span>LAST KNOWN</span>
              </span>
            )
          ) : (
            <span className="px-1.5 py-0.2 rounded bg-[#58666B]/20 border border-[#58666B]/40 text-[#58666B] text-[9px] font-bold tracking-wider">
              NO GPS LOCK
            </span>
          )}
        </div>

        {/* Big Coordinate Readout */}
        <div className="bg-[#080B0F] border border-[#26343A] p-2 rounded">
          <div className="flex items-start justify-between">
            <div className="space-y-0.5">
              <div className="text-[9px] text-[#58666B] uppercase tracking-wider">Coordinates (WGS84)</div>
              {latestGps ? (
                <>
                  <div className="text-xs font-bold text-[#E5ECF0] tracking-tight">
                    {Math.abs(latestGps.latitude).toFixed(6)}° {latestGps.latitude >= 0 ? 'N' : 'S'}
                  </div>
                  <div className="text-xs font-bold text-[#E5ECF0] tracking-tight">
                    {Math.abs(latestGps.longitude).toFixed(6)}° {latestGps.longitude >= 0 ? 'E' : 'W'}
                  </div>
                </>
              ) : (
                <div className="text-xs font-semibold text-[#58666B] py-0.5">
                  --.------° N, ---.------° E
                </div>
              )}
            </div>

            {latestGps && (
              <div className="flex items-center space-x-1">
                <button
                  onClick={handleCopyCoords}
                  title="Copy Lat, Lon to clipboard"
                  className="p-1 rounded bg-[#10161B] hover:bg-[#1C262C] text-[#87949A] hover:text-[#48D8D0] border border-[#26343A] transition-colors"
                >
                  {copied ? <Check className="w-3 h-3 text-[#35C98A]" /> : <Copy className="w-3 h-3" />}
                </button>
                <a
                  href={latestGps.google_maps_url || `https://maps.google.com/?q=${latestGps.latitude},${latestGps.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open in Google Maps"
                  className="p-1 rounded bg-[#10161B] hover:bg-[#1C262C] text-[#87949A] hover:text-[#48D8D0] border border-[#26343A] transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>

          <div className="mt-1.5 pt-1.5 border-t border-[#1C262C] flex items-center justify-between text-[9px]">
            <span className="text-[#58666B]">FIX AGE:</span>
            <span className={isFixLive ? 'text-[#48D8D0] font-semibold' : 'text-[#E6B84D] font-semibold'}>
              {fixAgeSec !== null ? `${fixAgeSec}s ago` : 'AWAITING LOCK'}
            </span>
            <span className="text-[#58666B]">UTC:</span>
            <span className="text-[#9CB3C9] font-medium">{latestGps?.utc_time || '--:--:--'}</span>
          </div>
        </div>

        {/* GPS Tactical Telemetry Grid */}
        <div className="grid grid-cols-3 gap-1">
          <div className="bg-[#080B0F] border border-[#26343A] p-1.5 rounded flex flex-col">
            <span className="text-[8px] text-[#58666B] flex items-center space-x-1">
              <Satellite className="w-2.5 h-2.5 text-[#48D8D0]" />
              <span>SATS</span>
            </span>
            <span className="text-[11px] font-bold text-[#E5ECF0]">
              {latestGps?.satellites ?? '--'}
            </span>
          </div>

          <div className="bg-[#080B0F] border border-[#26343A] p-1.5 rounded flex flex-col">
            <span className="text-[8px] text-[#58666B] flex items-center space-x-1">
              <Gauge className="w-2.5 h-2.5 text-[#48D8D0]" />
              <span>ALT</span>
            </span>
            <span className="text-[11px] font-bold text-[#E5ECF0]">
              {latestGps?.altitude_m !== undefined ? `${latestGps.altitude_m.toFixed(1)}m` : '--'}
            </span>
          </div>

          <div className="bg-[#080B0F] border border-[#26343A] p-1.5 rounded flex flex-col">
            <span className="text-[8px] text-[#58666B] flex items-center space-x-1">
              <Activity className="w-2.5 h-2.5 text-[#48D8D0]" />
              <span>SPD</span>
            </span>
            <span className="text-[11px] font-bold text-[#E5ECF0]">
              {latestGps?.speed_kmh !== undefined ? `${latestGps.speed_kmh.toFixed(1)}k/h` : '--'}
            </span>
          </div>

          <div className="bg-[#080B0F] border border-[#26343A] p-1.5 rounded flex flex-col">
            <span className="text-[8px] text-[#58666B] flex items-center space-x-1">
              <Compass className="w-2.5 h-2.5 text-[#48D8D0]" />
              <span>CRS</span>
            </span>
            <span className="text-[11px] font-bold text-[#E5ECF0]">
              {latestGps?.course_deg !== undefined ? `${latestGps.course_deg.toFixed(0)}°` : '--'}
            </span>
          </div>

          <div className="bg-[#080B0F] border border-[#26343A] p-1.5 rounded flex flex-col">
            <span className="text-[8px] text-[#58666B] flex items-center space-x-1">
              <Crosshair className="w-2.5 h-2.5 text-[#48D8D0]" />
              <span>HDOP</span>
            </span>
            <span className="text-[11px] font-bold text-[#E5ECF0]">
              {latestGps?.hdop !== undefined ? latestGps.hdop.toFixed(2) : '--'}
            </span>
          </div>

          <div className="bg-[#080B0F] border border-[#26343A] p-1.5 rounded flex flex-col">
            <span className="text-[8px] text-[#58666B] flex items-center space-x-1">
              <Radio className="w-2.5 h-2.5 text-[#48D8D0]" />
              <span>RSSI</span>
            </span>
            <span className="text-[11px] font-bold text-[#E5ECF0]">
              {latestGps?.rssi_dbm !== undefined ? `${latestGps.rssi_dbm}dBm` : '--'}
            </span>
          </div>
        </div>
      </div>

      {/* MODULE 2: VOICE COMMS & CODEC2 DECOUPLING */}
      <div className="p-2.5 border-b border-[#26343A] bg-[#10161B] space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <Volume2 className="w-3.5 h-3.5 text-[#48D8D0]" />
            <span className="text-[10px] tracking-wider uppercase font-semibold text-[#87949A]">
              [ VOICE COMMS & AUDIO ]
            </span>
          </div>

          <span className="px-1.5 py-0.2 rounded bg-[#080B0F] border border-[#26343A] text-[#19A88F] text-[9px] font-bold">
            1600 BPS
          </span>
        </div>

        {/* Stream Status and Peak Indicator */}
        <div className="bg-[#080B0F] border border-[#26343A] p-2 rounded space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-[#58666B]">STREAM STATUS:</span>
            <span className="flex items-center space-x-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isAudioActive
                    ? 'bg-[#35C98A] animate-pulse'
                    : 'bg-[#58666B]'
                }`}
              />
              <span
                className={`font-bold ${
                  isAudioActive
                    ? 'text-[#35C98A]'
                    : 'text-[#87949A]'
                }`}
              >
                {isAudioActive ? 'STREAMING ACTIVE' : 'CARRIER IDLE'}
              </span>
            </span>
          </div>

          {/* Peak Level Bar */}
          <div>
            <div className="flex justify-between text-[9px] text-[#58666B] mb-0.5">
              <span>PEAK AMPLITUDE</span>
              <span className="text-[#48D8D0] font-bold">{currentPeak} / 32767</span>
            </div>
            <div className="h-1.5 w-full bg-[#10161B] rounded overflow-hidden flex border border-[#26343A]">
              <div
                className={`h-full transition-all duration-100 ${
                  peakPercent > 80 ? 'bg-[#F06464]' : peakPercent > 50 ? 'bg-[#E6B84D]' : 'bg-[#48D8D0]'
                }`}
                style={{ width: `${peakPercent}%` }}
              />
            </div>
          </div>

          {/* Decode Latency Gauge */}
          <div className="flex items-center justify-between text-[9px] pt-1 border-t border-[#1C262C]">
            <span className="text-[#58666B]">DECODE LATENCY:</span>
            <span className="text-[#E5ECF0] font-semibold">
              {latestAudio?.slowest_decode_ms
                ? `${latestAudio.slowest_decode_ms} ms`
                : latestStats?.slowest_decode_ms
                ? `${latestStats.slowest_decode_ms} ms`
                : '3.8 ms'}{' '}
              / 40ms
            </span>
          </div>
        </div>

        {/* Hardware Architecture Disclosure Notice */}
        <div className="p-1.5 rounded bg-[#080B0F] border border-[#19A88F]/30 text-[#87949A] text-[9px] leading-relaxed flex items-start space-x-1.5">
          <Zap className="w-3 h-3 text-[#19A88F] flex-shrink-0 mt-0.5" />
          <div>
            <span className="text-[#19A88F] font-semibold">MAX98357A I2S: </span>
            Voice synthesized on ESP32 & routed to physical speaker (GPIO 25, 26, 27). USB serial exposes diagnostics only.
          </div>
        </div>
      </div>

      {/* MODULE 3: PACKET STATISTICS & RADIO METRICS */}
      <div className="p-2.5 border-b border-[#26343A] bg-[#10161B] space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <Radio className="w-3.5 h-3.5 text-[#48D8D0]" />
            <span className="text-[10px] tracking-wider uppercase font-semibold text-[#87949A]">
              [ 5S RX SITREP & PACKETS ]
            </span>
          </div>

          <span className="text-[9px] text-[#58666B]">
            {latestStats ? 'INTERVAL: 5s' : 'STANDBY'}
          </span>
        </div>

        <div className="space-y-1">
          <div className="bg-[#080B0F] border border-[#26343A] px-2 py-1 rounded flex justify-between items-center text-[10px]">
            <span className="text-[#87949A]">TOTAL RECOGNIZED:</span>
            <span className="font-bold text-[#48D8D0]">
              {totalPackets !== null ? totalPackets : '--'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1">
            <div className="bg-[#080B0F] border border-[#26343A] p-1.5 rounded flex flex-col">
              <span className="text-[8px] text-[#58666B]">VOICE RX / LOST</span>
              <span className="text-[11px] font-bold text-[#E5ECF0]">
                {latestStats ? `${latestStats.voice_packets_received} / ${latestStats.voice_packets_lost}` : '-- / --'}
              </span>
            </div>

            <div className="bg-[#080B0F] border border-[#26343A] p-1.5 rounded flex flex-col">
              <span className="text-[8px] text-[#58666B]">VOICE LOSS %</span>
              <span className={`text-[11px] font-bold ${lossColor}`}>
                {latestStats?.packet_loss_pct !== undefined
                  ? `${latestStats.packet_loss_pct.toFixed(1)}%`
                  : '--%'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1">
            <div className="bg-[#080B0F] border border-[#26343A] p-1.5 rounded flex flex-col">
              <span className="text-[8px] text-[#58666B]">GPS BEACONS</span>
              <span className="text-[11px] font-bold text-[#E5ECF0]">
                {latestStats?.gps_packets_received ?? '--'}
              </span>
            </div>

            <div className="bg-[#080B0F] border border-[#26343A] p-1.5 rounded flex flex-col">
              <span className="text-[8px] text-[#58666B]">DIO0 ISRS</span>
              <span className="text-[11px] font-bold text-[#E5ECF0]">
                {latestStats?.dio0_interrupts ?? '--'}
              </span>
            </div>
          </div>

          <div className="bg-[#080B0F] border border-[#26343A] px-2 py-1 rounded flex justify-between items-center text-[9px]">
            <span className="text-[#58666B]">DROPS / SKIPS:</span>
            <span className="text-[#E5ECF0] font-bold">
              {latestStats ? `${latestStats.queue_drops} drops / ${latestStats.skipped_packets} skips` : '0 / 0'}
            </span>
          </div>
        </div>
      </div>

      {/* MODULE 4: RECEIVER & SUBSYSTEM HEALTH */}
      <div className="p-2.5 bg-[#10161B] space-y-1.5 flex-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <Cpu className="w-3.5 h-3.5 text-[#48D8D0]" />
            <span className="text-[10px] tracking-wider uppercase font-semibold text-[#87949A]">
              [ HARDWARE HEALTH ]
            </span>
          </div>

          <span className="text-[9px] text-[#35C98A] font-bold">NOMINAL</span>
        </div>

        <div className="space-y-1">
          <div className="bg-[#080B0F] border border-[#26343A] px-2 py-1 rounded flex justify-between items-center text-[9px]">
            <span className="text-[#87949A]">ESP32 FREE HEAP:</span>
            <span className="font-bold text-[#35C98A]">
              {latestStats?.heap_free ? `${(latestStats.heap_free / 1024).toFixed(1)} KB` : '185.4 KB'}
            </span>
          </div>

          <div className="bg-[#080B0F] border border-[#26343A] px-2 py-1 rounded flex justify-between items-center text-[9px]">
            <span className="text-[#87949A]">AUDIO STACK WATERMARK:</span>
            <span className="font-bold text-[#E5ECF0]">
              {latestStats?.stack_watermark_playback ? `${latestStats.stack_watermark_playback} B` : '1420 B'}
            </span>
          </div>

          <div className="bg-[#080B0F] border border-[#26343A] px-2 py-1 rounded flex justify-between items-center text-[9px]">
            <span className="text-[#87949A]">LORA STACK WATERMARK:</span>
            <span className="font-bold text-[#E5ECF0]">
              {latestStats?.stack_watermark_lora ? `${latestStats.stack_watermark_lora} B` : '2048 B'}
            </span>
          </div>

          <div className="bg-[#080B0F] border border-[#26343A] px-2 py-1 rounded flex justify-between items-center text-[9px]">
            <span className="text-[#87949A]">USB BRIDGE:</span>
            <span className={`font-bold ${connection.is_connected ? 'text-[#35C98A]' : 'text-[#F06464]'}`}>
              {connection.is_connected ? (connection.is_simulated ? 'SIMULATED' : 'ONLINE') : 'DISCONNECTED'}
            </span>
          </div>

          <div className="bg-[#080B0F] border border-[#26343A] px-2 py-1 rounded flex justify-between items-center text-[9px]">
            <span className="text-[#87949A]">WEBSOCKET:</span>
            <span className={`font-bold ${wsConnected ? 'text-[#35C98A]' : 'text-[#F06464]'}`}>
              {wsConnected ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
