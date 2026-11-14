import React, { useState, useMemo } from 'react';
import {
  Usb,
  Radio,
  Activity,
  RefreshCw,
  Volume2,
  VolumeX,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { useResQ } from '../context/ResQContext';

export const LeftRail: React.FC = () => {
  const {
    connection,
    ports,
    latestAudio,
    latestStats,
    rawLogs,
    refreshPorts,
    connectPort,
    disconnectPort,
  } = useResQ();

  const [selectedPort, setSelectedPort] = useState<string>(connection.port || (ports[0]?.port || ''));
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [feedFilter, setFeedFilter] = useState<string>('ALL');
  const [expandedLogIdx, setExpandedLogIdx] = useState<number | null>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshPorts();
    setIsRefreshing(false);
  };

  const handleConnectToggle = () => {
    if (connection.is_connected && !connection.is_simulated) {
      disconnectPort();
    } else if (selectedPort) {
      connectPort(selectedPort, 115200);
    }
  };

  // Normalized VU percentage
  const vuPeak = latestAudio?.peak_level || latestStats?.decoded_peak_level || 0;
  const vuPercent = Math.min(100, Math.round((vuPeak / 20000) * 100));

  // Filter raw events for the intercept feed
  const filteredFeed = useMemo(() => {
    return rawLogs.filter((log) => {
      if (feedFilter === 'ALL') return true;
      if (feedFilter === 'GPS') return log.line.includes('[GPS]');
      if (feedFilter === 'AUD') return log.line.includes('[PLAYBACK]') || log.line.includes('[AUDIO]');
      if (feedFilter === 'PKT') return log.line.includes('RX STATUS') || log.line.includes('packets:');
      if (feedFilter === 'SYS') return log.line.includes('[LORA]') || log.line.includes('[CODEC]') || log.line.includes('Reset reason');
      if (feedFilter === 'ERR') return log.line.includes('WARNING') || log.line.includes('ERROR') || log.is_unknown;
      return true;
    }).slice(0, 40);
  }, [rawLogs, feedFilter]);

  const lastActivitySec = connection.last_activity
    ? Math.max(0, Math.floor(Date.now() / 1000 - connection.last_activity))
    : null;

  return (
    <aside className="w-72 bg-bg-panel border-r border-border-subtle flex flex-col h-[calc(100vh-3.5rem-1.75rem)] shrink-0 select-none overflow-hidden text-xs font-mono">
      {/* Module 1: Receiver Connection Panel */}
      <div className="p-3 border-b border-border-subtle space-y-2.5 bg-bg-panel">
        <div className="flex items-center justify-between text-2xs uppercase tracking-tactical text-tactext-secondary font-bold">
          <span className="flex items-center gap-1.5">
            <Usb className="w-3.5 h-3.5 text-accent-cyan" />
            RECEIVER CONNECTION
          </span>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="text-tactext-muted hover:text-accent-cyan transition-colors"
            title="Refresh COM Ports"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-accent-cyan' : ''}`} />
          </button>
        </div>

        {/* Port dropdown */}
        <div className="flex items-center gap-2">
          <select
            value={selectedPort}
            onChange={(e) => setSelectedPort(e.target.value)}
            disabled={connection.is_connected && !connection.is_simulated}
            className="flex-1 bg-bg-app border border-border-subtle rounded px-2 py-1 text-2xs text-tactext-primary outline-none focus:border-border-active"
          >
            {ports.length > 0 ? (
              ports.map((p) => (
                <option key={p.port} value={p.port}>
                  {p.port} ({p.description.slice(0, 16)}...)
                </option>
              ))
            ) : (
              <option value="">No hardware ports detected</option>
            )}
          </select>

          <button
            onClick={handleConnectToggle}
            disabled={!selectedPort && !connection.is_connected}
            className={`px-2.5 py-1 rounded text-2xs font-bold transition-all ${
              connection.is_connected && !connection.is_simulated
                ? 'bg-status-critical/15 text-status-critical border border-status-critical/40 hover:bg-status-critical/25'
                : 'bg-accent-teal/15 text-accent-teal border border-accent-teal/40 hover:bg-accent-teal/25'
            }`}
          >
            {connection.is_connected && !connection.is_simulated ? 'DISCONN' : 'CONNECT'}
          </button>
        </div>

        {/* Status Indicators Grid */}
        <div className="grid grid-cols-2 gap-2 text-3xs text-tactext-secondary pt-1 border-t border-border-subtle/40">
          <div className="flex items-center justify-between">
            <span>USB LINK:</span>
            <span className={`font-bold ${connection.is_connected ? 'text-status-success' : 'text-status-neutral'}`}>
              {connection.is_connected ? 'OPEN' : 'CLOSED'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>SERIAL:</span>
            <span className={`font-bold ${connection.lines_read > 0 ? 'text-accent-cyan' : 'text-status-neutral'}`}>
              {connection.lines_read > 0 ? 'ACTIVE' : 'IDLE'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>LINES RX:</span>
            <span className="text-tactext-primary font-bold">{connection.lines_read}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>LAST SEEN:</span>
            <span className="text-tactext-primary font-bold">
              {lastActivitySec !== null ? `${lastActivitySec}s ago` : '--'}
            </span>
          </div>
        </div>
      </div>

      {/* Module 2: Intercept / Event Feed */}
      <div className="flex-1 flex flex-col min-h-0 border-b border-border-subtle">
        {/* Feed Header & Category Filters */}
        <div className="p-2.5 bg-bg-panel-muted border-b border-border-subtle flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-2xs uppercase tracking-tactical text-tactext-secondary font-bold">
            <span className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-accent-cyan" />
              INTERCEPT FEED
            </span>
            <span className="text-3xs text-tactext-muted">
              {filteredFeed.length} EVENTS
            </span>
          </div>

          {/* Compact filter buttons */}
          <div className="flex items-center gap-1 overflow-x-auto text-3xs">
            {['ALL', 'GPS', 'AUD', 'PKT', 'SYS', 'ERR'].map((f) => (
              <button
                key={f}
                onClick={() => setFeedFilter(f)}
                className={`px-1.5 py-0.5 rounded transition-colors ${
                  feedFilter === f
                    ? 'bg-border-active/30 text-accent-cyan border border-border-active font-bold'
                    : 'text-tactext-muted hover:text-tactext-secondary'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Event List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredFeed.length > 0 ? (
            filteredFeed.map((item, idx) => {
              const isExpanded = expandedLogIdx === idx;
              let dotColor = 'bg-accent-cyan';
              let catTag = 'SYS';

              if (item.line.includes('[GPS]')) {
                dotColor = 'bg-accent-teal';
                catTag = 'GPS';
              } else if (item.line.includes('[PLAYBACK]') || item.line.includes('[AUDIO]')) {
                dotColor = 'bg-accent-blue';
                catTag = 'AUD';
              } else if (item.line.includes('RX STATUS') || item.line.includes('packets:')) {
                dotColor = 'bg-status-success';
                catTag = 'PKT';
              } else if (item.line.includes('WARNING') || item.line.includes('ERROR')) {
                dotColor = 'bg-status-warning';
                catTag = 'WRN';
              } else if (item.is_unknown) {
                dotColor = 'bg-status-neutral';
                catTag = 'UNK';
              }

              return (
                <div
                  key={idx}
                  onClick={() => setExpandedLogIdx(isExpanded ? null : idx)}
                  className="p-1.5 rounded bg-bg-panel-raised/60 hover:bg-bg-panel-raised border border-border-subtle cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
                    <span className="text-3xs text-tactext-muted shrink-0">
                      {new Date(item.timestamp * 1000).toISOString().slice(11, 19)}
                    </span>
                    <span className="text-3xs px-1 py-0.2 bg-bg-app border border-border-subtle rounded text-tactext-secondary shrink-0 font-bold">
                      {catTag}
                    </span>
                    <span className="text-2xs text-tactext-primary truncate flex-1 font-mono">
                      {item.line}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-3 h-3 text-tactext-muted shrink-0" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-tactext-muted shrink-0" />
                    )}
                  </div>
                  {isExpanded && (
                    <div className="mt-1.5 pt-1.5 border-t border-border-subtle text-3xs text-tactext-secondary break-all bg-bg-app p-1.5 rounded">
                      <div className="text-tactext-muted mb-0.5">RAW SERIAL TELEMETRY:</div>
                      {item.line}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center py-8 text-tactext-muted text-2xs">
              No events recorded yet. Connect to receiver or start simulation.
            </div>
          )}
        </div>
      </div>

      {/* Module 3: Recent Voice Activity & Audio Intercepts */}
      <div className="p-3 bg-bg-panel space-y-2.5">
        <div className="flex items-center justify-between text-2xs uppercase tracking-tactical text-tactext-secondary font-bold">
          <span className="flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-accent-cyan" />
            VOICE COMMUNICATIONS
          </span>
          <span
            className={`text-3xs px-1.5 py-0.2 rounded border font-bold ${
              latestAudio?.state === 'STREAMING'
                ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/40 animate-pulse'
                : 'bg-border-subtle text-tactext-muted border-border-subtle'
            }`}
          >
            {latestAudio?.state || 'IDLE'}
          </span>
        </div>

        {/* Audio Availability Reality Disclosure */}
        <div className="p-2 bg-bg-app rounded border border-border-subtle text-3xs text-tactext-secondary leading-relaxed">
          <div className="flex items-center gap-1 text-accent-cyan font-bold mb-0.5">
            <Info className="w-3 h-3" /> PHYSICAL DAC OUTPUT
          </div>
          Raw audio is routed over I2S to the MAX98357A speaker on the ESP32. Live USB serial exposes speech peak levels and stream events.
        </div>

        {/* Speech VU Peak Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-3xs text-tactext-secondary">
            <span>DECODED PEAK VU</span>
            <span className="text-tactext-primary font-bold">{vuPeak} / 32767</span>
          </div>
          <div className="h-2 bg-bg-app rounded border border-border-subtle p-0.5 overflow-hidden">
            <div
              className={`h-full rounded-sm transition-all duration-200 ${
                vuPercent > 70
                  ? 'bg-status-critical'
                  : vuPercent > 30
                  ? 'bg-status-warning'
                  : 'bg-accent-teal'
              }`}
              style={{ width: `${Math.max(2, vuPercent)}%` }}
            />
          </div>
        </div>

        {/* Codec Performance Telemetry */}
        <div className="flex items-center justify-between text-3xs text-tactext-secondary pt-0.5">
          <span>CODEC2 1600:</span>
          <span className="text-accent-teal font-bold">
            {latestStats?.slowest_decode_ms ? `${latestStats.slowest_decode_ms} ms / 40 ms` : '3.8 ms (nominal)'}
          </span>
        </div>
      </div>
    </aside>
  );
};
