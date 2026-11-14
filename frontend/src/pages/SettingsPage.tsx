import React, { useState } from 'react';
import {
  Settings,
  RefreshCw,
  Usb,
  Play,
  Square,
  Trash2,
  Download,
  ShieldAlert,
  Check,
  AlertCircle,
  FileText,
  Sliders,
  HardDrive,
} from 'lucide-react';
import { useResQ } from '../context/ResQContext';
import { Card } from '../components/Common/Card';
import { Badge } from '../components/Common/Badge';

export const SettingsPage: React.FC = () => {
  const {
    connection,
    ports,
    refreshPorts,
    connectPort,
    disconnectPort,
    startSimulation,
    stopSimulation,
    clearLocalHistory,
  } = useResQ();

  const [selectedPort, setSelectedPort] = useState<string>(connection.port || (ports[0]?.port || ''));
  const [baudRate, setBaudRate] = useState<number>(connection.baud_rate || 115200);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshPorts();
    setIsRefreshing(false);
  };

  const handleConnect = async () => {
    setActionError(null);
    setActionMessage(null);
    if (!selectedPort) {
      setActionError('Please select a valid COM port.');
      return;
    }
    try {
      await connectPort(selectedPort, baudRate);
      setActionMessage(`Connected to ${selectedPort} at ${baudRate} baud.`);
    } catch (err: any) {
      setActionError(err.message || 'Failed to connect to port.');
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectPort();
      setActionMessage('Disconnected from serial port.');
    } catch (err: any) {
      setActionError(err.message || 'Failed to disconnect.');
    }
  };

  const handleClearDb = async () => {
    if (window.confirm('Are you sure you want to clear all stored GPS paths, packet stats, and raw serial logs?')) {
      await clearLocalHistory();
      setActionMessage('Local SQLite database cleared successfully.');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Alert Notices */}
      {actionMessage && (
        <div className="p-3 bg-tactical-emerald/10 border border-tactical-emerald/30 rounded-xl text-xs font-mono text-tactical-emerald flex items-center gap-2">
          <Check className="w-4 h-4" /> {actionMessage}
        </div>
      )}
      {actionError && (
        <div className="p-3 bg-tactical-rose/10 border border-tactical-rose/30 rounded-xl text-xs font-mono text-tactical-rose flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {actionError}
        </div>
      )}

      {/* Grid: Serial Hardware Bridge & Simulation Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: USB Serial Hardware Port Bridge */}
        <Card
          title="USB SERIAL BRIDGE CONFIGURATION"
          subtitle="Connect to the physical ESP32 LoRa Receiver"
          icon={<Usb className="w-4 h-4" />}
          action={
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-1.5 bg-charcoal-800 hover:bg-charcoal-750 text-slate-300 rounded border border-charcoal-700 transition-colors"
              title="Refresh available COM ports"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-tactical-cyan' : ''}`} />
            </button>
          }
        >
          <div className="space-y-4 font-mono text-xs">
            {/* Port Selector */}
            <div>
              <label className="text-slate-400 block mb-1.5">DETECTED COM PORT</label>
              <select
                value={selectedPort}
                onChange={(e) => setSelectedPort(e.target.value)}
                disabled={connection.is_connected && !connection.is_simulated}
                className="w-full bg-charcoal-950 border border-charcoal-750 rounded-lg p-2.5 text-slate-200 outline-none focus:border-tactical-cyan"
              >
                {ports.length > 0 ? (
                  ports.map((p) => (
                    <option key={p.port} value={p.port}>
                      {p.port} — {p.description}
                    </option>
                  ))
                ) : (
                  <option value="">No hardware COM ports detected</option>
                )}
              </select>
            </div>

            {/* Baud Rate Selector */}
            <div>
              <label className="text-slate-400 block mb-1.5">BAUD RATE (RX FIRMWARE: 115200)</label>
              <select
                value={baudRate}
                onChange={(e) => setBaudRate(parseInt(e.target.value))}
                disabled={connection.is_connected && !connection.is_simulated}
                className="w-full bg-charcoal-950 border border-charcoal-750 rounded-lg p-2.5 text-slate-200 outline-none focus:border-tactical-cyan"
              >
                <option value={115200}>115200 baud (Standard ResQ-Mesh RX)</option>
                <option value={57600}>57600 baud</option>
                <option value={9600}>9600 baud</option>
              </select>
            </div>

            {/* Connection Actions */}
            <div className="pt-2 flex items-center gap-3">
              {connection.is_connected && !connection.is_simulated ? (
                <button
                  onClick={handleDisconnect}
                  className="w-full py-2.5 bg-tactical-rose/20 text-tactical-rose border border-tactical-rose/40 hover:bg-tactical-rose/30 rounded-lg font-bold transition-colors"
                >
                  DISCONNECT PORT
                </button>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={!selectedPort}
                  className="w-full py-2.5 bg-tactical-cyan/20 text-tactical-cyan border border-tactical-cyan/40 hover:bg-tactical-cyan/30 disabled:opacity-50 rounded-lg font-bold transition-colors"
                >
                  CONNECT RECEIVER
                </button>
              )}
            </div>

            <div className="text-[11px] text-slate-500 pt-1">
              Status: {connection.is_connected ? (
                <span className="text-tactical-emerald font-semibold">
                  CONNECTED ({connection.port} @ {connection.baud_rate})
                </span>
              ) : (
                <span>DISCONNECTED</span>
              )}
            </div>
          </div>
        </Card>

        {/* Card 2: Offline Mock Telemetry Simulation */}
        <Card
          title="OFFLINE HARDWARE SIMULATOR"
          subtitle="Generate realistic verified protocol lines for testing"
          icon={<Sliders className="w-4 h-4" />}
        >
          <div className="space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between p-3 bg-charcoal-950 rounded-lg border border-charcoal-800">
              <div>
                <div className="font-semibold text-slate-200">MOCK TELEMETRY ENGINE</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Emits GPS beacons (10s), voice stream bursts, and 5s RX status blocks.
                </div>
              </div>
              <Badge variant={connection.is_simulated ? 'amber' : 'slate'} size="sm" dot={connection.is_simulated}>
                {connection.is_simulated ? 'RUNNING' : 'STOPPED'}
              </Badge>
            </div>

            <div className="p-3 bg-charcoal-950/60 rounded-lg border border-charcoal-800 text-[11px] text-slate-400 space-y-1">
              <p>
                Strictly separated from real hardware telemetry. All simulated records are stored and displayed with explicit <code>SIMULATED</code> badges.
              </p>
            </div>

            <div className="pt-2">
              {connection.is_simulated ? (
                <button
                  onClick={stopSimulation}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-tactical-amber/20 hover:bg-tactical-amber/30 text-tactical-amber border border-tactical-amber/40 rounded-lg font-bold transition-colors"
                >
                  <Square className="w-4 h-4 fill-tactical-amber" />
                  <span>HALT SIMULATION</span>
                </button>
              ) : (
                <button
                  onClick={startSimulation}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-charcoal-800 hover:bg-charcoal-750 text-slate-200 border border-charcoal-700 rounded-lg font-bold transition-colors"
                >
                  <Play className="w-4 h-4 text-tactical-cyan" />
                  <span>START OFFLINE SIMULATION</span>
                </button>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Card 3: Storage & Local Database Management */}
      <Card
        title="LOCAL SQLITE STORAGE & DATA EXPORT"
        subtitle="Local-first persistence for offline disaster coordination"
        icon={<HardDrive className="w-4 h-4" />}
      >
        <div className="space-y-4 font-mono text-xs">
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-charcoal-950 rounded-lg border border-charcoal-800">
            <div>
              <div className="font-bold text-slate-200">LOCAL SQLITE TELEMETRY DATABASE</div>
              <div className="text-slate-500 text-[11px] mt-0.5">
                Path: <code>backend/data/resq_mesh.db</code> (Stores GPS fixes, packet loss history, and raw serial logs)
              </div>
            </div>
            <button
              onClick={handleClearDb}
              className="flex items-center gap-2 px-3 py-2 bg-tactical-rose/10 hover:bg-tactical-rose/20 text-tactical-rose border border-tactical-rose/30 rounded-lg transition-colors font-bold"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>CLEAR DATABASE</span>
            </button>
          </div>
        </div>
      </Card>

      {/* Card 4: Protocol Reference Drawer */}
      <Card
        title="VERIFIED RX SERIAL PROTOCOL REFERENCE"
        subtitle="Summary from RX_SERIAL_PROTOCOL.md"
        icon={<FileText className="w-4 h-4" />}
      >
        <div className="bg-charcoal-950 p-4 rounded-lg border border-charcoal-800 font-mono text-xs text-slate-300 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <span className="text-slate-500 block text-[10px]">VERIFIED BAUD RATE</span>
              <strong className="text-tactical-cyan">115200 (8-N-1)</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">TRANSMISSION ENCODING</span>
              <strong className="text-slate-200">Human-readable ASCII text lines</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">GPS BEACON LINE</span>
              <code className="text-slate-300 text-[11px] block mt-1">
                [GPS] lat, lon | alt m | km/h | course | sats | hdop | UTC | RSSI
              </code>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">AUDIO CONSTRAINTS</span>
              <span className="text-slate-300 text-[11px] block mt-1">
                Raw PCM audio is synthesized directly to MAX98357A I2S DAC; stream lifecycle & VU peak level are exposed via Serial.
              </span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};
