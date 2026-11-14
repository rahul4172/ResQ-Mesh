import React from 'react';
import {
  MapPin,
  Radio,
  Activity,
  Cpu,
  ExternalLink,
  ShieldAlert,
  ArrowUpRight,
  Volume2,
  VolumeX,
  Gauge,
  Wifi,
} from 'lucide-react';
import { useResQ } from '../context/ResQContext';
import { Card } from '../components/Common/Card';
import { Badge } from '../components/Common/Badge';

interface OverviewPageProps {
  onNavigate: (tab: string) => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({ onNavigate }) => {
  const { connection, latestGps, latestAudio, latestStats, rawLogs } = useResQ();

  const isLiveGps = latestGps && Date.now() / 1000 - latestGps.timestamp < 30;
  const gpsAgeSec = latestGps ? Math.max(0, Math.floor(Date.now() / 1000 - latestGps.timestamp)) : null;

  // Normalized VU percentage (peak 0-32767)
  const vuPeak = latestAudio?.peak_level || latestStats?.decoded_peak_level || 0;
  const vuPercent = Math.min(100, Math.round((vuPeak / 20000) * 100));

  return (
    <div className="space-y-6">
      {/* Simulation Banner if simulated */}
      {connection.is_simulated && (
        <div className="p-4 bg-tactical-amber/10 border border-tactical-amber/30 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-lg bg-tactical-amber/20 text-tactical-amber font-mono font-bold text-xs">
              MOCK MODE
            </span>
            <div>
              <h4 className="text-sm font-semibold text-slate-100 font-mono">
                RUNNING OFFLINE HARDWARE SIMULATION
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Emitting verified ResQ-Mesh RX serial protocol strings for evaluation without physical ESP32 hardware attached.
              </p>
            </div>
          </div>
          <Badge variant="amber" dot>
            SIMULATED
          </Badge>
        </div>
      )}

      {/* Top Mission Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Metric 1: Radio Link */}
        <Card className="hover:border-charcoal-600 transition-colors">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>RF TELEMETRY LINK</span>
            <Badge variant={connection.is_connected ? 'emerald' : 'rose'} size="sm" dot>
              {connection.is_connected ? 'ACTIVE' : 'OFFLINE'}
            </Badge>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-slate-100">
              {latestStats?.last_rssi_dbm ? `${latestStats.last_rssi_dbm} dBm` : latestGps?.rssi_dbm ? `${latestGps.rssi_dbm} dBm` : '--'}
            </span>
            <span className="text-xs font-mono text-tactical-cyan">
              SNR {latestStats?.last_snr_db ?? '--'} dB
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between font-mono">
            <span>433 MHz SX1278</span>
            <span>SF7 / BW 125k</span>
          </div>
        </Card>

        {/* Metric 2: GPS Position */}
        <Card className="hover:border-charcoal-600 transition-colors">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>VICTIM COORDINATES</span>
            {latestGps ? (
              <Badge variant={isLiveGps ? 'cyan' : 'amber'} size="sm" dot>
                {isLiveGps ? 'LIVE' : `STALE (${gpsAgeSec}s)`}
              </Badge>
            ) : (
              <Badge variant="slate" size="sm">WAITING</Badge>
            )}
          </div>
          <div className="mt-3">
            {latestGps ? (
              <div className="text-lg font-bold font-mono text-slate-100 tracking-tight">
                {latestGps.latitude.toFixed(5)}, {latestGps.longitude.toFixed(5)}
              </div>
            ) : (
              <div className="text-xl font-bold font-mono text-slate-500">
                NO FIX ACQUIRED
              </div>
            )}
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between font-mono">
            <span>{latestGps ? `${latestGps.satellites} Sats (HDOP ${latestGps.hdop})` : 'Searching satellites...'}</span>
            <span>{latestGps ? `${latestGps.speed_kmh} km/h` : ''}</span>
          </div>
        </Card>

        {/* Metric 3: Packet Loss */}
        <Card className="hover:border-charcoal-600 transition-colors">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>PACKET INTEGRITY</span>
            <span className="text-[10px] font-mono text-slate-500">5S WINDOW</span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-slate-100">
              {latestStats ? `${latestStats.packet_loss_pct.toFixed(1)}%` : '0.0%'}
            </span>
            <span className="text-xs font-mono text-tactical-emerald">
              {latestStats?.voice_packets_received ?? 0} RECV
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between font-mono">
            <span>Lost: {latestStats?.voice_packets_lost ?? 0} pkts</span>
            <span>DIO0 IRQ: {latestStats?.dio0_interrupts ?? 0}</span>
          </div>
        </Card>

        {/* Metric 4: Audio Status */}
        <Card className="hover:border-charcoal-600 transition-colors">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>AUDIO STREAM</span>
            <Badge
              variant={latestAudio?.state === 'STREAMING' ? 'rose' : latestAudio?.state === 'ERROR' ? 'amber' : 'slate'}
              size="sm"
              dot={latestAudio?.state === 'STREAMING'}
            >
              {latestAudio?.state || 'IDLE'}
            </Badge>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="text-2xl font-bold font-mono text-slate-100 flex items-center gap-2">
              {latestAudio?.state === 'STREAMING' ? (
                <>
                  <Volume2 className="w-5 h-5 text-tactical-rose animate-bounce" />
                  <span className="text-tactical-rose text-lg">SPEAKING</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-5 h-5 text-slate-500" />
                  <span className="text-slate-400 text-lg">STANDBY</span>
                </>
              )}
            </div>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between font-mono">
            <span>Peak Level: {vuPeak}</span>
            <span>MAX98357A I2S</span>
          </div>
        </Card>
      </div>

      {/* Middle Grid: Tactical Map Overview & Live Audio Monitor */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Live Location Snapshot */}
        <Card
          title="TACTICAL LOCALIZATION (LIVE BEACON)"
          subtitle="Real-time geographic location of the victim transmitter node"
          icon={<MapPin className="w-4 h-4" />}
          action={
            <button
              onClick={() => onNavigate('tracking')}
              className="text-xs font-mono text-tactical-cyan hover:underline flex items-center gap-1"
            >
              OPEN FULL MAP <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          }
          className="lg:col-span-2"
        >
          <div className="space-y-4">
            {latestGps ? (
              <div className="bg-charcoal-950 p-4 rounded-lg border border-charcoal-800 font-mono space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 block">LATITUDE</span>
                    <span className="text-slate-200 text-sm font-semibold">{latestGps.latitude.toFixed(6)}°</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">LONGITUDE</span>
                    <span className="text-slate-200 text-sm font-semibold">{latestGps.longitude.toFixed(6)}°</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">ALTITUDE</span>
                    <span className="text-slate-200 text-sm font-semibold">{latestGps.altitude_m} m</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">GROUND SPEED</span>
                    <span className="text-slate-200 text-sm font-semibold">{latestGps.speed_kmh.toFixed(1)} km/h</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between pt-2 border-t border-charcoal-800 text-xs text-slate-400">
                  <div className="flex items-center gap-4">
                    <span>UTC: <strong className="text-slate-300">{latestGps.utc_time}</strong></span>
                    <span>Heading: <strong className="text-slate-300">{latestGps.course_deg}°</strong></span>
                    <span>HDOP: <strong className="text-slate-300">{latestGps.hdop}</strong></span>
                  </div>
                  {latestGps.google_maps_url && (
                    <a
                      href={latestGps.google_maps_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-tactical-cyan hover:text-tactical-cyan/80 font-bold transition-colors"
                    >
                      Google Maps <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-32 flex flex-col items-center justify-center bg-charcoal-950/60 rounded-lg border border-dashed border-charcoal-800 text-slate-500 text-xs font-mono">
                <MapPin className="w-6 h-6 mb-2 text-slate-600 animate-bounce" />
                <span>WAITING FOR FIRST GPS TELEMETRY BEACON [PKT_GPS 0xA2]</span>
              </div>
            )}

            {/* Quick Action Buttons */}
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">
                Beacon Protocol: 19-byte packed payload broadcast every 10s
              </span>
              <button
                onClick={() => onNavigate('tracking')}
                className="px-3 py-1.5 bg-charcoal-800 hover:bg-charcoal-750 text-slate-200 rounded-lg border border-charcoal-700 transition-colors"
              >
                View Movement Trail
              </button>
            </div>
          </div>
        </Card>

        {/* Right Col: Audio Monitoring & Physical Speaker Note */}
        <Card
          title="ACOUSTIC MONITORING"
          subtitle="Real-time speech amplitude & DAC status"
          icon={<Radio className="w-4 h-4" />}
          action={
            <button
              onClick={() => onNavigate('voice')}
              className="text-xs font-mono text-tactical-cyan hover:underline flex items-center gap-1"
            >
              DETAILS <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          }
        >
          <div className="space-y-4">
            {/* Real Hardware Limitation Notice */}
            <div className="p-3 bg-charcoal-950 rounded-lg border border-charcoal-800 text-xs font-mono space-y-1.5">
              <div className="text-slate-300 font-semibold flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-tactical-cyan" /> PHYSICAL HARDWARE OUTPUT
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                The ESP32 receiver synthesizes Codec2 audio directly to its attached <strong>MAX98357A I2S Class-D DAC</strong> driving a physical 3W speaker.
              </p>
            </div>

            {/* VU Meter Visualizer */}
            <div>
              <div className="flex justify-between text-xs font-mono text-slate-400 mb-1.5">
                <span>SPEECH PEAK VU METER</span>
                <span className="font-semibold text-slate-200">{vuPeak} / 32767</span>
              </div>
              <div className="h-4 bg-charcoal-950 rounded-md border border-charcoal-800 p-0.5 overflow-hidden">
                <div
                  className={`h-full rounded-sm transition-all duration-300 ${
                    vuPercent > 70
                      ? 'bg-gradient-to-r from-tactical-emerald via-tactical-amber to-tactical-rose'
                      : vuPercent > 30
                      ? 'bg-gradient-to-r from-tactical-emerald to-tactical-amber'
                      : 'bg-tactical-emerald'
                  }`}
                  style={{ width: `${Math.max(4, vuPercent)}%` }}
                />
              </div>
            </div>

            {/* Codec Performance Pill */}
            <div className="grid grid-cols-2 gap-3 pt-2 text-xs font-mono">
              <div className="bg-charcoal-850 p-2.5 rounded-lg border border-charcoal-750">
                <span className="text-slate-500 block text-[10px]">DECODE LATENCY</span>
                <span className="text-slate-200 font-bold">
                  {latestStats?.slowest_decode_ms ? `${latestStats.slowest_decode_ms} ms` : '3.8 ms'}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Budget: 40 ms</span>
              </div>
              <div className="bg-charcoal-850 p-2.5 rounded-lg border border-charcoal-750">
                <span className="text-slate-500 block text-[10px]">SQUELCHED</span>
                <span className="text-slate-200 font-bold">
                  {latestStats?.muted_frames ?? 0} frames
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Peak &lt; 30 muted</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Bottom: Live Raw Serial Activity Feed */}
      <Card
        title="LIVE SERIAL EVENT STREAM"
        subtitle="Unfiltered real-time ASCII telemetry lines from the ESP32 USB Serial bridge"
        icon={<Activity className="w-4 h-4" />}
        action={
          <button
            onClick={() => onNavigate('packets')}
            className="text-xs font-mono text-tactical-cyan hover:underline flex items-center gap-1"
          >
            TERMINAL CONSOLE <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        }
      >
        <div className="bg-charcoal-950 rounded-lg p-3 border border-charcoal-800 font-mono text-xs max-h-48 overflow-y-auto space-y-1">
          {rawLogs.length > 0 ? (
            rawLogs.slice(0, 8).map((log, idx) => (
              <div key={idx} className="flex items-start gap-3 hover:bg-charcoal-900/60 p-1 rounded transition-colors">
                <span className="text-slate-600 text-[11px] select-none whitespace-nowrap">
                  {new Date(log.timestamp * 1000).toISOString().slice(11, 19)}
                </span>
                <span
                  className={`truncate flex-1 ${
                    log.line.includes('[GPS]')
                      ? 'text-tactical-cyan font-medium'
                      : log.line.includes('[PLAYBACK]')
                      ? 'text-tactical-rose font-medium'
                      : log.line.includes('RX STATUS')
                      ? 'text-tactical-emerald'
                      : log.is_unknown
                      ? 'text-slate-400 italic'
                      : 'text-slate-300'
                  }`}
                >
                  {log.line}
                </span>
              </div>
            ))
          ) : (
            <div className="text-slate-500 py-4 text-center">
              No serial lines received yet. Connect a COM port or start the simulator in Settings.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
