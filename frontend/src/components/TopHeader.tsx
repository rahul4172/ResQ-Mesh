import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Terminal,
  Sliders,
  Play,
  Square,
  Radio,
  Wifi,
} from 'lucide-react';
import { useResQ } from '../context/ResQContext';

interface TopHeaderProps {
  onOpenTerminal: () => void;
  onOpenSettings: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ onOpenTerminal, onOpenSettings }) => {
  const { connection, latestGps, latestAudio, latestStats, startSimulation, stopSimulation } = useResQ();

  const [localTime, setLocalTime] = useState<string>('');
  const [zuluTime, setZuluTime] = useState<string>('');
  const [dateStr, setDateStr] = useState<string>('');
  const [tickerIndex, setTickerIndex] = useState<number>(0);

  // Digital clock updating every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      // Local 12h time format: 05:15:07 PM
      setLocalTime(now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' }).toUpperCase());
      // Zulu UTC time format: 2315Z
      const utcH = String(now.getUTCHours()).padStart(2, '0');
      const utcM = String(now.getUTCMinutes()).padStart(2, '0');
      setZuluTime(`${utcH}${utcM}Z`);
      // Date format: SAT 14 NOV
      const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      setDateStr(`${days[now.getUTCDay()]} ${now.getUTCDate()} ${months[now.getUTCMonth()]}`);
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Alert ticker messages generated exclusively from verified application state
  const alerts: string[] = [];
  if (connection.is_connected && !connection.is_simulated) {
    alerts.push(`RX USB CONNECTED • Link online on ${connection.port} @ ${connection.baud_rate} baud`);
  } else if (connection.is_simulated) {
    alerts.push(`SIMULATION ACTIVE • Offline mock hardware telemetry generator running`);
  } else {
    alerts.push(`RECEIVER OFFLINE • No USB serial link detected (Standby)`);
  }

  if (latestGps) {
    const age = Math.max(0, Math.floor(Date.now() / 1000 - latestGps.timestamp));
    if (age < 30) {
      alerts.push(`GPS FIX ACQUIRED • Coordinates: ${latestGps.latitude.toFixed(6)}, ${latestGps.longitude.toFixed(6)} (${latestGps.satellites} Sats, HDOP ${latestGps.hdop})`);
    } else {
      alerts.push(`GPS SIGNAL STALE • Last fix received ${age}s ago (Transmitter beacon delayed)`);
    }
  } else {
    alerts.push(`GPS FIX PENDING • Awaiting first 0xA2 telemetry beacon from field transmitter`);
  }

  if (latestAudio?.state === 'STREAMING') {
    alerts.push(`AUDIO STREAM ACTIVE • Voice packet arriving, routed to MAX98357A I2S hardware speaker`);
  } else {
    alerts.push(`AUDIO DATA STATE • No raw audio over USB Serial; physical speaker connected via I2S on RX ESP32`);
  }

  if (latestStats) {
    alerts.push(`PACKET TELEMETRY • Received: ${latestStats.voice_packets_received} pkts | Loss: ${latestStats.packet_loss_pct.toFixed(1)}% | RSSI: ${latestStats.last_rssi_dbm ?? '--'} dBm`);
  }

  // Rotate alert ticker every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTickerIndex((prev) => (prev + 1) % alerts.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [alerts.length]);

  return (
    <header className="h-14 bg-bg-panel border-b border-border-subtle px-4 flex items-center justify-between z-30 select-none">
      {/* Left: Product Identity */}
      <div className="flex items-center gap-3 w-72 shrink-0">
        <img src="/logo.svg" alt="ResQ-Mesh" className="w-7 h-7 drop-shadow-md" />
        <div className="leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-bold tracking-widest text-sm text-text-primary">
              RESQ-MESH
            </span>
            <span className="text-3xs font-mono px-1 py-0.2 bg-border-subtle text-accent-cyan rounded border border-border-active/40">
              v1.0
            </span>
          </div>
          <span className="block text-2xs font-mono tracking-tactical text-tactext-secondary uppercase">
            RESCUE COMMUNICATIONS CONSOLE
          </span>
        </div>
      </div>

      {/* Center: Real-Time Verified Alert Ticker */}
      <div className="flex-1 mx-6 overflow-hidden flex items-center gap-3 bg-bg-app/80 border border-border-subtle rounded px-3 py-1.5 h-8">
        <div className="flex items-center gap-1.5 text-2xs font-mono font-bold text-accent-cyan shrink-0 uppercase tracking-tactical">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-pulse" />
          <span>ALERTS</span>
          <span className="text-border-subtle">|</span>
        </div>
        <div className="truncate font-mono text-xs text-tactext-primary flex-1">
          {alerts[tickerIndex] || alerts[0]}
        </div>
        <div className="text-3xs font-mono text-tactext-muted shrink-0">
          [{tickerIndex + 1}/{alerts.length}]
        </div>
      </div>

      {/* Right: Digital Clock & Mode Controls */}
      <div className="flex items-center gap-5 shrink-0">
        {/* Monospaced Tactical Clock */}
        <div className="text-right font-mono flex items-baseline gap-2">
          <span className="text-3xs text-tactext-secondary tracking-widest">
            {dateStr}
          </span>
          <span className="text-base font-bold text-accent-cyan tracking-wider">
            {localTime}
          </span>
          <span className="text-2xs text-tactext-muted">
            {zuluTime}
          </span>
        </div>

        {/* Operating Mode Indicator */}
        <div>
          {connection.is_simulated ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-mono font-bold tracking-wider bg-status-warning/15 text-status-warning border border-status-warning/40">
              <span className="w-1.5 h-1.5 rounded-full bg-status-warning animate-pulse" />
              SIMULATION
            </span>
          ) : connection.is_connected ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-mono font-bold tracking-wider bg-status-success/15 text-status-success border border-status-success/40">
              <span className="w-1.5 h-1.5 rounded-full bg-status-success" />
              LIVE HARDWARE
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-mono font-bold tracking-wider bg-bg-panel-muted text-tactext-muted border border-border-subtle">
              <span className="w-1.5 h-1.5 rounded-full bg-status-neutral" />
              OFFLINE
            </span>
          )}
        </div>

        {/* Quick Drawer Buttons */}
        <div className="flex items-center gap-1 border-l border-border-subtle pl-3">
          <button
            onClick={onOpenTerminal}
            className="p-1.5 rounded bg-bg-panel hover:bg-bg-panel-raised text-tactext-secondary hover:text-accent-cyan border border-border-subtle transition-colors"
            title="Open Serial Terminal Inspector"
          >
            <Terminal className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded bg-bg-panel hover:bg-bg-panel-raised text-tactext-secondary hover:text-accent-cyan border border-border-subtle transition-colors"
            title="Open System & Port Settings"
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
