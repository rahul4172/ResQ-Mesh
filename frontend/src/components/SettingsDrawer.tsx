import React, { useState } from 'react';
import {
  X,
  Settings,
  Usb,
  RefreshCw,
  Play,
  Square,
  Trash2,
  Cpu,
  Info,
  ShieldAlert,
  Radio,
  Volume2,
} from 'lucide-react';
import { useResQ } from '../context/ResQContext';

interface SettingsDrawerProps {
  onClose: () => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({ onClose }) => {
  const {
    connection,
    ports,
    refreshPorts,
    connectPort,
    disconnectPort,
    startSimulation,
    stopSimulation,
    clearLocalHistory,
    clearLogs,
  } = useResQ();

  const [selectedPort, setSelectedPort] = useState<string>(connection.port || (ports[0]?.port || ''));
  const [baudRate, setBaudRate] = useState<number>(connection.baud_rate || 115200);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [clearingHistory, setClearingHistory] = useState<boolean>(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshPorts();
    setIsRefreshing(false);
  };

  const handleConnectToggle = () => {
    if (connection.is_connected && !connection.is_simulated) {
      disconnectPort();
    } else if (selectedPort) {
      connectPort(selectedPort, baudRate);
    }
  };

  const handleSimulationToggle = () => {
    if (connection.is_simulated) {
      stopSimulation();
    } else {
      startSimulation();
    }
  };

  const handlePurgeHistory = async () => {
    if (window.confirm('Are you sure you want to purge all stored GPS and event history from local SQLite?')) {
      setClearingHistory(true);
      await clearLocalHistory();
      setClearingHistory(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-2xl bg-[#0E151A] border border-[#26343A] rounded-lg shadow-2xl flex flex-col font-mono text-xs overflow-hidden hud-panel relative">
        {/* HEADER */}
        <div className="px-5 py-3 bg-[#10161B] border-b border-[#26343A] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Settings className="w-4 h-4 text-[#48D8D0]" />
            <span className="font-bold text-sm tracking-wide text-[#E5ECF0]">
              SYSTEM & LINK CONFIGURATION
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded text-[#87949A] hover:text-[#E5ECF0] hover:bg-[#202B33] transition-colors"
            title="Close Settings (ESC)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* CONTENT */}
        <div className="p-5 space-y-5 overflow-y-auto max-h-[75vh] custom-scrollbar">
          {/* SECTION 1: SERIAL PORT SETUP */}
          <div className="space-y-3 bg-[#10161B] border border-[#26343A] p-4 rounded">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#E5ECF0] tracking-wider flex items-center space-x-2">
                <Usb className="w-3.5 h-3.5 text-[#48D8D0]" />
                <span>USB SERIAL TRANSCEIVER LINK</span>
              </span>
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center space-x-1 px-2 py-0.5 rounded bg-[#151D23] hover:bg-[#202B33] text-[#87949A] hover:text-[#48D8D0] border border-[#26343A] text-[10px]"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>SCAN PORTS</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-[#58666B] uppercase block mb-1">
                  Serial COM Port
                </label>
                <select
                  value={selectedPort}
                  onChange={(e) => setSelectedPort(e.target.value)}
                  disabled={connection.is_connected}
                  className="w-full bg-[#0B1015] border border-[#26343A] text-[#E5ECF0] text-xs p-2 rounded focus:border-[#48D8D0] focus:outline-none"
                >
                  {ports.length === 0 && <option value="">No COM Ports Detected</option>}
                  {ports.map((p) => (
                    <option key={p.port} value={p.port}>
                      {p.port} - {p.description || 'USB Serial'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-[#58666B] uppercase block mb-1">
                  Baud Rate (RX Fixed)
                </label>
                <select
                  value={baudRate}
                  onChange={(e) => setBaudRate(Number(e.target.value))}
                  disabled={connection.is_connected}
                  className="w-full bg-[#0B1015] border border-[#26343A] text-[#E5ECF0] text-xs p-2 rounded focus:border-[#48D8D0] focus:outline-none"
                >
                  <option value={115200}>115200 Baud (Immutable RX Firmware)</option>
                  <option value={9600}>9600 Baud</option>
                  <option value={57600}>57600 Baud</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <div className="text-[11px] text-[#87949A]">
                Status:{' '}
                <span
                  className={
                    connection.is_connected && !connection.is_simulated
                      ? 'text-[#35C98A] font-bold'
                      : 'text-[#87949A]'
                  }
                >
                  {connection.is_connected && !connection.is_simulated
                    ? `CONNECTED TO ${connection.port}`
                    : 'DISCONNECTED'}
                </span>
              </div>

              <button
                onClick={handleConnectToggle}
                disabled={!selectedPort && !connection.is_connected}
                className={`px-4 py-1.5 rounded font-bold transition-colors flex items-center space-x-1.5 ${
                  connection.is_connected && !connection.is_simulated
                    ? 'bg-[#F06464]/20 text-[#F06464] border border-[#F06464]/40 hover:bg-[#F06464]/30'
                    : 'bg-[#48D8D0]/20 text-[#48D8D0] border border-[#48D8D0]/40 hover:bg-[#48D8D0]/30'
                }`}
              >
                {connection.is_connected && !connection.is_simulated ? (
                  <>
                    <Square className="w-3.5 h-3.5" />
                    <span>DISCONNECT SERIAL</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>CONNECT SERIAL</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* SECTION 2: OPERATING MODE & SIMULATION */}
          <div className="space-y-3 bg-[#10161B] border border-[#26343A] p-4 rounded">
            <span className="text-[11px] font-bold text-[#E5ECF0] tracking-wider flex items-center space-x-2">
              <Radio className="w-3.5 h-3.5 text-[#19A88F]" />
              <span>OFFLINE MOCK SIMULATION ENGINE</span>
            </span>

            <p className="text-[11px] text-[#87949A] leading-relaxed">
              When hardware receiver is not connected, the simulation engine generates realistic synthetic SAR telemetry (search grid GPS trail, 10s beacon intervals, Codec2 voice bursts, and 5s RX status reports) matching the immutable firmware protocol.
            </p>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px]">
                Active Mode:{' '}
                <span
                  className={
                    connection.is_simulated
                      ? 'text-[#E6B84D] font-bold'
                      : 'text-[#35C98A] font-bold'
                  }
                >
                  {connection.is_simulated ? 'SIMULATED TELEMETRY' : 'LIVE HARDWARE READY'}
                </span>
              </span>

              <button
                onClick={handleSimulationToggle}
                className={`px-4 py-1.5 rounded font-bold transition-colors flex items-center space-x-1.5 ${
                  connection.is_simulated
                    ? 'bg-[#E6B84D]/20 text-[#E6B84D] border border-[#E6B84D]/40 hover:bg-[#E6B84D]/30'
                    : 'bg-[#19A88F]/20 text-[#19A88F] border border-[#19A88F]/40 hover:bg-[#19A88F]/30'
                }`}
              >
                {connection.is_simulated ? (
                  <>
                    <Square className="w-3.5 h-3.5" />
                    <span>HALT SIMULATION</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>START SIMULATION</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* SECTION 3: LOCAL DATABASE & CACHE */}
          <div className="space-y-3 bg-[#10161B] border border-[#26343A] p-4 rounded">
            <span className="text-[11px] font-bold text-[#E5ECF0] tracking-wider flex items-center space-x-2">
              <Trash2 className="w-3.5 h-3.5 text-[#F06464]" />
              <span>LOCAL PERSISTENCE & HISTORY PURGE</span>
            </span>

            <p className="text-[11px] text-[#87949A] leading-relaxed">
              Telemetry and raw serial lines are persisted to local SQLite (<code className="text-[#48D8D0]">backend/data/resq_mesh.db</code>). You can purge stored mission history or clear the active in-memory log buffer.
            </p>

            <div className="flex items-center space-x-3 pt-1">
              <button
                onClick={handlePurgeHistory}
                disabled={clearingHistory}
                className="px-3 py-1.5 rounded bg-[#F06464]/15 hover:bg-[#F06464]/25 text-[#F06464] border border-[#F06464]/30 font-bold transition-colors flex items-center space-x-1.5"
              >
                <Trash2 className="w-3 h-3" />
                <span>PURGE SQLITE DATABASE</span>
              </button>

              <button
                onClick={clearLogs}
                className="px-3 py-1.5 rounded bg-[#151D23] hover:bg-[#202B33] text-[#87949A] hover:text-[#E5ECF0] border border-[#26343A] font-medium transition-colors"
              >
                CLEAR CONSOLE BUFFER
              </button>
            </div>
          </div>

          {/* SECTION 4: IMMUTABLE RX FIRMWARE SPECIFICATION */}
          <div className="p-3 bg-[#0B1015] border border-[#19A88F]/30 rounded space-y-2 text-[10px] leading-relaxed">
            <div className="flex items-center space-x-2 text-[#19A88F] font-bold">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>HARDWARE RESTRAINTS & PROTOCOL TRUTH</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-[#87949A]">
              <li><strong className="text-[#E5ECF0]">Firmware Immutability:</strong> The RX ESP32 firmware is never altered, reflashed, or reconfigured.</li>
              <li><strong className="text-[#E5ECF0]">RF Link:</strong> SX1278 LoRa @ 433.0 MHz, SF7, BW 125 kHz, CR 4/5.</li>
              <li><strong className="text-[#E5ECF0]">Voice Synthesis:</strong> Codec2 1600 bps decoded on ESP32 Core 1.</li>
              <li><strong className="text-[#E5ECF0]">Hardware DAC:</strong> MAX98357A I2S on GPIO 25 (LRC), 26 (BCLK), 27 (DIN).</li>
              <li><strong className="text-[#E5ECF0]">Zero USB Audio:</strong> Serial stream emits ASCII telemetry only; no PCM/Codec2 frames exist on USB.</li>
            </ul>
          </div>
        </div>

        {/* FOOTER */}
        <div className="px-5 py-2.5 bg-[#10161B] border-t border-[#26343A] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1 rounded bg-[#151D23] hover:bg-[#202B33] border border-[#26343A] text-[#E5ECF0] font-semibold transition-colors"
          >
            DISMISS
          </button>
        </div>
      </div>
    </div>
  );
};
