import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  X,
  Search,
  Download,
  Trash2,
  Terminal,
  ArrowDown,
  Pause,
} from 'lucide-react';
import { useResQ } from '../context/ResQContext';

interface TerminalDrawerProps {
  onClose: () => void;
}

export const TerminalDrawer: React.FC<TerminalDrawerProps> = ({ onClose }) => {
  const { rawLogs, connection, clearLogs } = useResQ();

  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive if autoScroll is enabled
  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [rawLogs, autoScroll]);

  // Keyboard shortcut to close on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Detect tag from raw line string
  const getLineTag = (line: string, isUnknown: boolean) => {
    if (line.includes('[GPS]')) return 'GPS';
    if (line.includes('[PLAYBACK]') || line.includes('[AUDIO]')) return 'PLAYBACK';
    if (line.includes('RX STATUS') || line.includes('packets:')) return 'RX STATUS';
    if (line.includes('WARNING') || line.includes('WARN')) return 'WARN';
    if (line.includes('ERROR') || line.includes('ERR')) return 'ERR';
    if (isUnknown) return 'UNKNOWN';
    return 'SYS';
  };

  // Filter logs based on category and search query
  const filteredLogs = useMemo(() => {
    return rawLogs.filter((log) => {
      const tag = getLineTag(log.line, log.is_unknown);

      // Category filter
      if (filterType !== 'ALL') {
        if (filterType === 'GPS' && tag !== 'GPS') return false;
        if (filterType === 'PLAYBACK' && tag !== 'PLAYBACK') return false;
        if (filterType === 'RX STATUS' && tag !== 'RX STATUS') return false;
        if (filterType === 'WARN' && tag !== 'WARN' && tag !== 'ERR') return false;
        if (filterType === 'UNKNOWN' && !log.is_unknown) return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return log.line.toLowerCase().includes(query) || tag.toLowerCase().includes(query);
      }

      return true;
    });
  }, [rawLogs, filterType, searchQuery]);

  // Download logs as text file
  const handleExport = () => {
    const content = rawLogs
      .map((l) => `[${new Date(l.timestamp * 1000).toISOString()}] [${getLineTag(l.line, l.is_unknown)}] ${l.line}`)
      .join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `resq_mesh_serial_${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getLineColor = (tag: string) => {
    if (tag === 'GPS') return 'text-[#48D8D0]';
    if (tag === 'PLAYBACK') return 'text-[#19A88F]';
    if (tag === 'RX STATUS') return 'text-[#4B91E8]';
    if (tag === 'WARN' || tag === 'ERR') return 'text-[#E6B84D]';
    return 'text-[#87949A]';
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-4xl h-[88vh] max-h-[600px] bg-[#0C1216] border border-[#26343A] rounded-lg shadow-2xl flex flex-col font-mono text-xs overflow-hidden relative">
        {/* HEADER BAR */}
        <div className="px-4 py-2.5 bg-[#10161B] border-b border-[#26343A] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-2">
            <Terminal className="w-4 h-4 text-[#48D8D0]" />
            <span className="font-bold text-sm tracking-wide text-[#E5ECF0]">
              SERIAL DIAGNOSTIC CONSOLE
            </span>
            <span className="px-2 py-0.5 rounded bg-[#151D23] border border-[#26343A] text-[10px] text-[#87949A]">
              {connection.is_connected
                ? `${connection.port} @ ${connection.baud_rate} baud`
                : 'NO PORT ATTACHED'}
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded text-[#87949A] hover:text-[#E5ECF0] hover:bg-[#202B33] transition-colors"
            title="Close Console (ESC)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* TOOLBAR */}
        <div className="px-4 py-2 bg-[#080B0F] border-b border-[#26343A] flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
          {/* Filter Pills */}
          <div className="flex items-center space-x-1">
            {['ALL', 'GPS', 'PLAYBACK', 'RX STATUS', 'WARN', 'UNKNOWN'].map((f) => (
              <button
                key={f}
                onClick={() => setFilterType(f)}
                className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
                  filterType === f
                    ? 'bg-[#48D8D0]/20 text-[#48D8D0] border border-[#48D8D0]/40'
                    : 'text-[#87949A] hover:text-[#E5ECF0] hover:bg-[#151D23]'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Search Input & Action Buttons */}
          <div className="flex items-center space-x-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#58666B] absolute left-2 top-2" />
              <input
                type="text"
                placeholder="Filter output..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-7 pr-2 py-1 bg-[#10161B] border border-[#26343A] rounded text-[11px] text-[#E5ECF0] focus:border-[#48D8D0] focus:outline-none w-32 sm:w-44 placeholder-[#58666B]"
              />
            </div>

            {/* Auto-scroll toggle */}
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`p-1.5 rounded border ${
                autoScroll
                  ? 'bg-[#19A88F]/20 border-[#19A88F]/40 text-[#19A88F]'
                  : 'bg-[#151D23] border-[#26343A] text-[#58666B]'
              }`}
              title={autoScroll ? 'Pause Auto-scroll' : 'Resume Auto-scroll'}
            >
              {autoScroll ? <ArrowDown className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            </button>

            {/* Export */}
            <button
              onClick={handleExport}
              className="p-1.5 rounded bg-[#10161B] hover:bg-[#1C262C] border border-[#26343A] text-[#87949A] hover:text-[#48D8D0] transition-colors"
              title="Export Log File"
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            {/* Clear */}
            <button
              onClick={clearLogs}
              className="p-1.5 rounded bg-[#10161B] hover:bg-[#1C262C] border border-[#26343A] text-[#87949A] hover:text-[#F06464] transition-colors"
              title="Clear Console History"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* LOG DISPLAY VIEWPORT */}
        <div className="flex-1 p-3 overflow-y-auto bg-[#070A0D] text-[11px] leading-relaxed custom-scrollbar font-mono select-text min-h-0">
          {filteredLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-[#58666B] space-y-2">
              <Terminal className="w-8 h-8 opacity-40 text-[#48D8D0]" />
              <p>No serial records matching current criteria.</p>
              <p className="text-[10px]">
                Ensure receiver is connected to USB or enable simulation mode.
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredLogs.slice().reverse().map((log, index) => {
                const time = new Date(log.timestamp * 1000).toISOString().substring(11, 23);
                const tag = getLineTag(log.line, log.is_unknown);
                return (
                  <div
                    key={index}
                    className="flex items-start space-x-2 py-0.5 px-1 hover:bg-[#10161B]/60 rounded"
                  >
                    <span className="text-[#58666B] select-none flex-shrink-0">[{time}]</span>
                    <span
                      className={`px-1 py-0.2 rounded text-[9px] font-bold select-none flex-shrink-0 ${
                        tag === 'GPS'
                          ? 'bg-[#48D8D0]/10 text-[#48D8D0]'
                          : tag === 'PLAYBACK'
                          ? 'bg-[#19A88F]/10 text-[#19A88F]'
                          : tag === 'RX STATUS'
                          ? 'bg-[#4B91E8]/10 text-[#4B91E8]'
                          : tag === 'WARN' || tag === 'ERR'
                          ? 'bg-[#E6B84D]/10 text-[#E6B84D]'
                          : 'bg-[#58666B]/10 text-[#87949A]'
                      }`}
                    >
                      {tag}
                    </span>
                    <span className={`break-all ${getLineColor(tag)}`}>
                      {log.line}
                    </span>
                  </div>
                );
              })}
              <div ref={terminalEndRef} />
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="px-4 py-1.5 bg-[#0B1015] border-t border-[#26343A] flex items-center justify-between text-[10px] text-[#58666B] flex-shrink-0">
          <span>
            SHOWING {filteredLogs.length} OF {rawLogs.length} LOGGED RECORDS
          </span>
          <span>IMMUTABLE RX FIRMWARE • USB PARSER V1.0</span>
        </div>
      </div>
    </div>
  );
};
