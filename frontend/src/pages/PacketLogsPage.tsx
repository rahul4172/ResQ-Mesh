import React, { useState, useMemo } from 'react';
import {
  Activity,
  Terminal,
  Filter,
  Search,
  Download,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  Radio,
  Satellite,
  Volume2,
} from 'lucide-react';
import { useResQ } from '../context/ResQContext';
import { Card } from '../components/Common/Card';
import { Badge } from '../components/Common/Badge';

export const PacketLogsPage: React.FC = () => {
  const { latestStats, rawLogs, clearLogs } = useResQ();
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  // Filter raw log lines
  const filteredLogs = useMemo(() => {
    return rawLogs.filter((log) => {
      // Category filter
      if (filterType === 'gps' && !log.line.includes('[GPS]')) return false;
      if (filterType === 'audio' && !log.line.includes('[PLAYBACK]') && !log.line.includes('[AUDIO]')) return false;
      if (filterType === 'status' && !log.line.includes('STATUS') && !log.line.includes('packets:')) return false;
      if (filterType === 'unknown' && !log.is_unknown) return false;
      if (filterType === 'warning' && !log.line.includes('WARNING') && !log.line.includes('ERROR')) return false;

      // Keyword query
      if (searchQuery.trim()) {
        return log.line.toLowerCase().includes(searchQuery.toLowerCase());
      }
      return true;
    });
  }, [rawLogs, filterType, searchQuery]);

  const copyToClipboard = () => {
    const text = filteredLogs.map((l) => `${new Date(l.timestamp * 1000).toISOString()} | ${l.line}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const exportToFile = () => {
    const text = filteredLogs.map((l) => `${new Date(l.timestamp * 1000).toISOString()} | ${l.line}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resq_mesh_serial_logs_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono">
        <div className="bg-charcoal-900 border border-charcoal-800 rounded-xl p-4">
          <div className="text-[10px] text-slate-500 uppercase">VOICE PACKETS</div>
          <div className="text-xl font-bold text-slate-100 mt-1">
            {latestStats?.voice_packets_received ?? 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Lost: {latestStats?.voice_packets_lost ?? 0} ({latestStats?.packet_loss_pct.toFixed(1) ?? '0.0'}%)
          </div>
        </div>

        <div className="bg-charcoal-900 border border-charcoal-800 rounded-xl p-4">
          <div className="text-[10px] text-slate-500 uppercase">GPS PACKETS</div>
          <div className="text-xl font-bold text-tactical-cyan mt-1">
            {latestStats?.gps_packets_received ?? 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Interval: 10s fix beacon
          </div>
        </div>

        <div className="bg-charcoal-900 border border-charcoal-800 rounded-xl p-4">
          <div className="text-[10px] text-slate-500 uppercase">DIO0 INTERRUPTS</div>
          <div className="text-xl font-bold text-tactical-emerald mt-1">
            {latestStats?.dio0_interrupts ?? 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Polled catches: {latestStats?.polled_catches ?? 0}
          </div>
        </div>

        <div className="bg-charcoal-900 border border-charcoal-800 rounded-xl p-4">
          <div className="text-[10px] text-slate-500 uppercase">PACKET DROPS / ERRORS</div>
          <div className="text-xl font-bold text-tactical-rose mt-1">
            {(latestStats?.invalid_packets ?? 0) + (latestStats?.queue_drops ?? 0) + (latestStats?.skipped_packets ?? 0)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Latency skips: {latestStats?.skipped_packets ?? 0}
          </div>
        </div>
      </div>

      {/* Terminal Log Console */}
      <Card
        title="SERIAL PACKET TERMINAL CONSOLE"
        subtitle="Live inspection stream of USB Serial output from the receiver"
        icon={<Terminal className="w-4 h-4" />}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={copyToClipboard}
              className="px-2.5 py-1 bg-charcoal-800 hover:bg-charcoal-750 text-slate-300 rounded border border-charcoal-700 text-xs font-mono flex items-center gap-1 transition-colors"
              title="Copy to clipboard"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-tactical-emerald" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={exportToFile}
              className="px-2.5 py-1 bg-charcoal-800 hover:bg-charcoal-750 text-slate-300 rounded border border-charcoal-700 text-xs font-mono flex items-center gap-1 transition-colors"
              title="Export to text file"
            >
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            <button
              onClick={clearLogs}
              className="px-2.5 py-1 bg-charcoal-800 hover:bg-charcoal-750 text-tactical-rose rounded border border-charcoal-700 text-xs font-mono flex items-center gap-1 transition-colors"
              title="Clear log display"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-2 bg-charcoal-950 rounded-lg border border-charcoal-800 font-mono text-xs">
            {/* Category tabs */}
            <div className="flex items-center gap-1">
              {[
                { id: 'all', label: 'All Records' },
                { id: 'gps', label: 'GPS Telemetry' },
                { id: 'audio', label: 'Voice Events' },
                { id: 'status', label: 'Status Blocks' },
                { id: 'warning', label: 'Warnings' },
                { id: 'unknown', label: 'Unknown' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilterType(tab.id)}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    filterType === tab.id
                      ? 'bg-charcoal-800 text-tactical-cyan font-bold border border-tactical-cyan/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="flex items-center gap-2 bg-charcoal-900 px-2.5 py-1 rounded border border-charcoal-750">
              <Search className="w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Filter keyword..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent text-slate-200 placeholder-slate-500 outline-none w-36 text-xs font-mono"
              />
            </div>
          </div>

          {/* Log Window */}
          <div className="bg-charcoal-950 rounded-lg p-4 border border-charcoal-800 font-mono text-xs h-[420px] overflow-y-auto space-y-1.5 shadow-inner">
            {filteredLogs.length > 0 ? (
              filteredLogs.map((log, idx) => (
                <div
                  key={idx}
                  className={`p-1.5 rounded flex items-start gap-3 hover:bg-charcoal-900/80 transition-colors ${
                    log.is_unknown ? 'border-l-2 border-slate-600 bg-slate-900/20' : ''
                  }`}
                >
                  <span className="text-slate-600 select-none text-[11px] whitespace-nowrap">
                    {new Date(log.timestamp * 1000).toISOString().slice(11, 23)}
                  </span>
                  <span
                    className={`flex-1 break-all ${
                      log.line.includes('[GPS]')
                        ? 'text-tactical-cyan'
                        : log.line.includes('[PLAYBACK]')
                        ? 'text-tactical-rose'
                        : log.line.includes('RX STATUS')
                        ? 'text-tactical-emerald font-semibold'
                        : log.line.includes('WARNING')
                        ? 'text-tactical-amber font-semibold'
                        : log.is_unknown
                        ? 'text-slate-400 italic'
                        : 'text-slate-300'
                    }`}
                  >
                    {log.line}
                  </span>
                  {log.is_unknown && (
                    <Badge variant="slate" size="sm">
                      UNKNOWN
                    </Badge>
                  )}
                </div>
              ))
            ) : (
              <div className="text-slate-500 text-center py-12">
                No matching serial log records found.
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};
