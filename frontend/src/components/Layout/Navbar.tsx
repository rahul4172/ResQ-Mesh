import React, { useState, useEffect } from 'react';
import {
  Satellite,
  Signal,
  Play,
  Square,
  Clock,
  Radio,
  Server,
} from 'lucide-react';
import { useResQ } from '../../context/ResQContext';
import { Badge } from '../Common/Badge';

export const Navbar: React.FC = () => {
  const { connection, latestGps, latestStats, latestAudio, wsConnected, startSimulation, stopSimulation } = useResQ();
  const [utcTime, setUtcTime] = useState<string>('');

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setUtcTime(now.toUTCString().slice(17, 25) + ' UTC');
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const isLiveGps = latestGps && (Date.now() / 1000 - latestGps.timestamp < 30);

  return (
    <header className="h-16 bg-charcoal-900 border-b border-charcoal-800 px-6 flex items-center justify-between sticky top-0 z-20 backdrop-blur-md">
      {/* Left: Tactical Mission Sector & Clock */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-tactical-cyan animate-pulse" />
          <span className="font-mono text-xs uppercase tracking-wider text-slate-300 font-semibold">
            SECTOR BRAVO-01
          </span>
          <span className="text-slate-600">|</span>
          <span className="font-mono text-xs text-slate-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            {utcTime || '00:00:00 UTC'}
          </span>
        </div>

        {/* Global Warning Banner if any */}
        {latestAudio?.state === 'STREAMING' && (
          <div className="flex items-center gap-2 px-3 py-1 bg-tactical-rose/10 border border-tactical-rose/30 rounded-full animate-pulse">
            <Radio className="w-3.5 h-3.5 text-tactical-rose" />
            <span className="font-mono text-[11px] font-bold text-tactical-rose uppercase tracking-wider">
              VOICE TRANSMISSION ACTIVE
            </span>
          </div>
        )}
      </div>

      {/* Right: Telemetry Quick Pills & Simulation Toggle */}
      <div className="flex items-center gap-4">
        {/* GPS Satellite Lock Status */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-charcoal-850 rounded-lg border border-charcoal-750">
          <Satellite className={`w-4 h-4 ${isLiveGps ? 'text-tactical-emerald' : 'text-slate-500'}`} />
          <div className="text-left font-mono leading-none">
            <div className="text-[10px] text-slate-400">GPS FIX</div>
            <div className="text-xs font-bold text-slate-200">
              {latestGps ? `${latestGps.satellites} SATS` : 'NO FIX'}
            </div>
          </div>
        </div>

        {/* RF Signal Quality */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-charcoal-850 rounded-lg border border-charcoal-750">
          <Signal className="w-4 h-4 text-tactical-cyan" />
          <div className="text-left font-mono leading-none">
            <div className="text-[10px] text-slate-400">RSSI / SNR</div>
            <div className="text-xs font-bold text-slate-200">
              {latestStats?.last_rssi_dbm ? `${latestStats.last_rssi_dbm} dBm` : latestGps?.rssi_dbm ? `${latestGps.rssi_dbm} dBm` : '--'}
              <span className="text-slate-500 font-normal ml-1">
                {latestStats?.last_snr_db ? `${latestStats.last_snr_db} dB` : ''}
              </span>
            </div>
          </div>
        </div>

        {/* WebSocket Backend Bridge Health */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-charcoal-850 rounded-lg border border-charcoal-750">
          <Server className={`w-3.5 h-3.5 ${wsConnected ? 'text-tactical-emerald' : 'text-tactical-rose'}`} />
          <span className="font-mono text-[11px] text-slate-300">
            {wsConnected ? 'WS LIVE' : 'WS OFFLINE'}
          </span>
        </div>

        {/* Hardware Mode / Mock Simulation Switch */}
        {connection.is_simulated ? (
          <button
            onClick={() => stopSimulation()}
            className="flex items-center gap-2 px-3 py-1.5 bg-tactical-amber/20 hover:bg-tactical-amber/30 text-tactical-amber border border-tactical-amber/40 rounded-lg font-mono text-xs font-bold transition-all shadow-sm"
            title="Stop offline simulated telemetry"
          >
            <Square className="w-3.5 h-3.5 fill-tactical-amber" />
            <span>STOP SIMULATION</span>
          </button>
        ) : (
          <button
            onClick={() => startSimulation()}
            className="flex items-center gap-2 px-3 py-1.5 bg-charcoal-800 hover:bg-charcoal-750 text-slate-300 hover:text-tactical-cyan border border-charcoal-700 rounded-lg font-mono text-xs font-medium transition-all"
            title="Run simulated hardware telemetry generator for testing"
          >
            <Play className="w-3.5 h-3.5 text-tactical-cyan" />
            <span>TEST SIMULATION</span>
          </button>
        )}
      </div>
    </header>
  );
};
