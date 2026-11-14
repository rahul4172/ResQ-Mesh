import React, { useState, useMemo } from 'react';
import {
  Usb,
  Activity,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useResQ } from '../context/ResQContext';

export const LeftRail: React.FC = () => {
  const {
    connection,
    ports,
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

  // Filter raw events for the intercept feed
  const filteredFeed = useMemo(() => {
    return rawLogs.filter((log) => {
      if (feedFilter === 'ALL') return true;
      if (feedFilter === 'GPS') return log.line.includes('[GPS]');
      if (feedFilter === 'AUD') return log.line.includes('[PLAYBACK]') || log.line.includes('[AUDIO]');
      if (feedFilter === 'PKT') return log.line.includes('RX STATUS') || log.line.includes('packets:');
      if (feedFilter === 'SYS') return log.line.includes('[LORA]') || log.line.includes('[CODEC]') || log.line.includes('Reset reason') || log.line.includes('Heap:');
      if (feedFilter === 'ERR') return log.line.includes('WARNING') || log.line.includes('ERROR') || log.is_unknown;
      return true;
    }).slice(0, 100);
  }, [rawLogs, feedFilter]);

  const lastActivitySec = connection.last_activity
    ? Math.max(0, Math.floor(Date.now() / 1000 - connection.last_activity))
    : null;

  return (
    <aside className="w-[280px] bg-[#0E151A] border-r border-[#26343A] flex flex-col h-full shrink-0 select-none overflow-hidden text-xs font-mono z-10">
      {/* Module 1: Receiver Connection Panel (Compact, Non-Collapsing) */}
      <div className="p-3 border-b border-[#26343A] bg-[#10161B] space-y-2 flex-shrink-0">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-[#87949A] font-bold">
          <span className="flex items-center gap-1.5 text-[#E5ECF0]">
            <Usb className="w-3.5 h-3.5 text-[#48D8D0]" />
            RECEIVER CONNECTION
          </span>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="text-[#87949A] hover:text-[#48D8D0] transition-colors"
            title="Refresh COM Ports"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-[#48D8D0]' : ''}`} />
          </button>
        </div>

        {/* Port dropdown and connect button */}
        <div className="flex items-center gap-1.5">
          <select
            value={selectedPort}
            onChange={(e) => setSelectedPort(e.target.value)}
            disabled={connection.is_connected && !connection.is_simulated}
            className="flex-1 bg-[#080B0F] border border-[#26343A] rounded px-2 py-1 text-[11px] text-[#E5ECF0] outline-none focus:border-[#48D8D0] truncate"
          >
            {ports.length > 0 ? (
              ports.map((p) => (
                <option key={p.port} value={p.port}>
                  {p.port} {p.description ? `(${p.description.slice(0, 14)}...)` : ''}
                </option>
              ))
            ) : (
              <option value="">No hardware ports detected</option>
            )}
          </select>

          <button
            onClick={handleConnectToggle}
            disabled={!selectedPort && !connection.is_connected}
            className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all shrink-0 ${
              connection.is_connected && !connection.is_simulated
                ? 'bg-[#F06464]/15 text-[#F06464] border border-[#F06464]/40 hover:bg-[#F06464]/25'
                : 'bg-[#19A88F]/15 text-[#19A88F] border border-[#19A88F]/40 hover:bg-[#19A88F]/25'
            }`}
          >
            {connection.is_connected && !connection.is_simulated ? 'DISCONN' : 'CONNECT'}
          </button>
        </div>

        {/* Compact Status Indicators */}
        <div className="grid grid-cols-2 gap-1.5 text-[9px] text-[#87949A] pt-1 border-t border-[#1C262C]">
          <div className="flex items-center justify-between">
            <span>USB LINK:</span>
            <span className={`font-bold ${connection.is_connected ? 'text-[#35C98A]' : 'text-[#87949A]'}`}>
              {connection.is_connected ? 'OPEN' : 'CLOSED'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>SERIAL:</span>
            <span className={`font-bold ${connection.lines_read > 0 ? 'text-[#48D8D0]' : 'text-[#87949A]'}`}>
              {connection.lines_read > 0 ? 'ACTIVE' : 'IDLE'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>LINES RX:</span>
            <span className="text-[#E5ECF0] font-bold">{connection.lines_read}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>ACTIVITY:</span>
            <span className="text-[#E5ECF0] font-bold">
              {lastActivitySec !== null ? `${lastActivitySec}s ago` : '--'}
            </span>
          </div>
        </div>
      </div>

      {/* Module 2: Intercept / Event Feed (Takes All Remaining Height) */}
      <div className="flex-1 flex flex-col min-h-0 bg-[#0E151A] overflow-hidden">
        {/* Feed Header & Category Filters */}
        <div className="p-2.5 bg-[#10161B] border-b border-[#26343A] flex flex-col gap-1.5 flex-shrink-0">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-[#87949A] font-bold">
            <span className="flex items-center gap-1.5 text-[#E5ECF0]">
              <Activity className="w-3.5 h-3.5 text-[#48D8D0]" />
              INTERCEPT FEED
            </span>
            <span className="text-[9px] text-[#58666B]">
              {filteredFeed.length} EVENTS
            </span>
          </div>

          {/* Compact filter buttons */}
          <div className="flex items-center gap-1 text-[9px]">
            {['ALL', 'GPS', 'AUD', 'PKT', 'SYS', 'ERR'].map((f) => (
              <button
                key={f}
                onClick={() => setFeedFilter(f)}
                className={`px-1.5 py-0.5 rounded transition-colors ${
                  feedFilter === f
                    ? 'bg-[#48D8D0]/20 text-[#48D8D0] border border-[#48D8D0]/40 font-bold'
                    : 'text-[#87949A] hover:text-[#E5ECF0] hover:bg-[#151D23]'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Event List with Custom Scrollbar */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar min-h-0">
          {filteredFeed.length > 0 ? (
            filteredFeed.map((item, idx) => {
              const isExpanded = expandedLogIdx === idx;
              let dotColor = 'bg-[#48D8D0]';
              let catTag = 'SYS';

              if (item.line.includes('[GPS]')) {
                dotColor = 'bg-[#19A88F]';
                catTag = 'GPS';
              } else if (item.line.includes('[PLAYBACK]') || item.line.includes('[AUDIO]')) {
                dotColor = 'bg-[#4B91E8]';
                catTag = 'AUD';
              } else if (item.line.includes('RX STATUS') || item.line.includes('packets:')) {
                dotColor = 'bg-[#35C98A]';
                catTag = 'PKT';
              } else if (item.line.includes('WARNING') || item.line.includes('ERROR')) {
                dotColor = 'bg-[#E6B84D]';
                catTag = 'WRN';
              } else if (item.is_unknown) {
                dotColor = 'bg-[#87949A]';
                catTag = 'UNK';
              }

              return (
                <div
                  key={idx}
                  onClick={() => setExpandedLogIdx(isExpanded ? null : idx)}
                  className="p-1.5 rounded bg-[#10161B]/80 hover:bg-[#151D23] border border-[#26343A] cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
                    <span className="text-[9px] text-[#58666B] shrink-0 font-mono">
                      {new Date(item.timestamp * 1000).toISOString().slice(11, 19)}
                    </span>
                    <span className="text-[9px] px-1 py-0.2 bg-[#080B0F] border border-[#26343A] rounded text-[#87949A] shrink-0 font-bold">
                      {catTag}
                    </span>
                    <span className="text-[10px] text-[#E5ECF0] truncate flex-1 font-mono">
                      {item.line}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-3 h-3 text-[#58666B] shrink-0" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-[#58666B] shrink-0" />
                    )}
                  </div>
                  {isExpanded && (
                    <div className="mt-1.5 pt-1.5 border-t border-[#1C262C] text-[10px] text-[#87949A] break-all bg-[#080B0F] p-1.5 rounded font-mono">
                      <div className="text-[#58666B] text-[9px] mb-0.5">RAW SERIAL TELEMETRY:</div>
                      {item.line}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center py-12 text-[#58666B] text-[11px]">
              No events recorded yet. Connect to receiver or start simulation.
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
