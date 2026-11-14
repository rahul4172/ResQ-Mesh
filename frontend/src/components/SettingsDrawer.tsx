import React, { useState } from 'react';
import {
  X,
  Settings,
  Usb,
  RefreshCw,
  Play,
  Square,
  Trash2,
  ShieldAlert,
  Radio,
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-2xl max-h-[88vh] bg-[#0C1216] border border-[#26343A] rounded-lg shadow-2xl flex flex-col font-mono text-xs overflow-hidden relative">
        {/* HEADER */}
        <div className="px-4 py-2.5 bg-[#10161B] border-b border-[#26343A] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-2">
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
        <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar flex-1 min-h-0">
          {/* SECTION 1: SERIAL PORT SETUP */}
          <div className="space-y-2.5 bg-[#10161B] border border-[#26343A] p-3 rounded">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#E5ECF0] tracking-wider flex items-center space-x-1.5">
                <Usb className="w-3.5 h-3.5 text-[#48D8D0]" />
                <span>USB SERIAL TRANSCEIVER LINK</span>
              </span>
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center space-x-1 px-2 py-0.5 rounded bg-[#151D23] hover:bg-[#202B33] text-[#87949A] hover:text-[#48D8D0] border border-[#26343A] text-[9px]"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>SCAN PORTS</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[9px] text-[#58666B] uppercase block mb-1">
                  Serial COM Port
                </label>
                <select
                  value={selectedPort}
                  onChange={(e) => setSelectedPort(e.target.value)}
                  disabled={connection.is_connected}
                  className="w-full bg-[#080B0F] border border-[#26343A] text-[#E5ECF0] text-xs p-1.5 rounded focus:border-[#48D8D0] focus:outline-none"
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
                <label className="text-[9px] text-[#58666B] uppercase block mb-1">
                  Baud Rate (RX Fixed)
                </label>
                <select
                  value={baudRate}
                  onChange={(e) => setBaudRate(Number(e.target.value))}
                  disabled={connection.is_connected}
                  className="w-full bg-[#080B0F] border border-[#26343A] text-[#E5ECF0] text-xs p-1.5 rounded focus:border-[#48D8D0] focus:outline-none"
                >
                  <option value={115200}>115200 Baud (Immutable RX Firmware)</option>
                  <option value={9600}>9600 Baud</option>
                  <option value={57600}>57600 Baud</option>
                </select>
              </div>
            </div>

            <div className="pt-1.5 flex items-center justify-between border-t border-[#1C262C]">
              <div className="text-[10px] text-[#87949A]">
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
                className={`px-3 py-1 rounded font-bold transition-colors text-[10px] flex items-center space-x-1 ${
                  connection.is_connected && !connection.is_simulated
                    ? 'bg-[#F06464]/20 text-[#F06464] border border-[#F06464]/40 hover:bg-[#F06464]/30'
                    : 'bg-[#48D8D0]/20 text-[#48D8D0] border border-[#48D8D0]/40 hover:bg-[#48D8D0]/30'
                }`}
              >
                {connection.is_connected && !connection.is_simulated ? (
                  <>
                    <Square className="w-3 h-3" />
                    <span>DISCONNECT</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3" />
                    <span>CONNECT</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* SECTION 2: OPERATING MODE & SIMULATION */}
          <div className="space-y-2 bg-[#10161B] border border-[#26343A] p-3 rounded">
            <span className="text-[10px] font-bold text-[#E5ECF0] tracking-wider flex items-center space-x-1.5">
              <Radio className="w-3.5 h-3.5 text-[#19A88F]" />
              <span>OFFLINE MOCK SIMULATION ENGINE</span>
            </span>

            <p className="text-[10px] text-[#87949A] leading-relaxed">
              When hardware receiver is not connected, the simulation engine generates realistic synthetic SAR telemetry (search grid GPS trail, 10s beacon intervals, Codec2 voice bursts, and 5s RX status reports) matching the immutable firmware protocol.
            </p>

            <div className="flex items-center justify-between pt-1 border-t border-[#1C262C]">
              <span className="text-[10px]">
                Mode:{' '}
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
                className={`px-3 py-1 rounded font-bold transition-colors text-[10px] flex items-center space-x-1 ${
                  connection.is_simulated
                    ? 'bg-[#E6B84D]/20 text-[#E6B84D] border border-[#E6B84D]/40 hover:bg-[#E6B84D]/30'
                    : 'bg-[#19A88F]/20 text-[#19A88F] border border-[#19A88F]/40 hover:bg-[#19A88F]/30'
                }`}
              >
                {connection.is_simulated ? (
                  <>
                    <Square className="w-3 h-3" />
                    <span>HALT SIMULATION</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3" />
                    <span>START SIMULATION</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* SECTION 3: LOCAL DATABASE & CACHE */}
          <div className="space-y-2 bg-[#10161B] border border-[#26343A] p-3 rounded">
            <span className="text-[10px] font-bold text-[#E5ECF0] tracking-wider flex items-center space-x-1.5">
              <Trash2 className="w-3.5 h-3.5 text-[#F06464]" />
              <span>LOCAL PERSISTENCE & HISTORY PURGE</span>
            </span>

            <p className="text-[10px] text-[#87949A] leading-relaxed">
              Telemetry and raw serial lines are persisted to local SQLite (<code className="text-[#48D8D0]">backend/data/resq_mesh.db</code>).
            </p>

            <div className="flex items-center space-x-2 pt-1 border-t border-[#1C262C]">
              <button
                onClick={handlePurgeHistory}
                disabled={clearingHistory}
                className="px-2.5 py-1 rounded bg-[#F06464]/15 hover:bg-[#F06464]/25 text-[#F06464] border border-[#F06464]/30 font-bold transition-colors flex items-center space-x-1 text-[10px]"
              >
                <Trash2 className="w-3 h-3" />
                <span>PURGE SQLITE DATABASE</span>
              </button>

              <button
                onClick={clearLogs}
                className="px-2.5 py-1 rounded bg-[#151D23] hover:bg-[#202B33] text-[#87949A] hover:text-[#E5ECF0] border border-[#26343A] font-medium transition-colors text-[10px]"
              >
                CLEAR CONSOLE BUFFER
              </button>
            </div>
          </div>

          {/* SECTION 4: IMMUTABLE RX FIRMWARE SPECIFICATION */}
          <div className="p-2.5 bg-[#080B0F] border border-[#19A88F]/30 rounded space-y-1 text-[9px] leading-relaxed">
            <div className="flex items-center space-x-1.5 text-[#19A88F] font-bold text-[10px]">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>HARDWARE CONSTRAINTS & PROTOCOL TRUTH</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-[#87949A]">
              <li><strong className="text-[#E5ECF0]">Firmware Immutability:</strong> The RX ESP32 firmware is never altered, reflashed, or reconfigured.</li>
              <li><strong className="text-[#E5ECF0]">RF Link:</strong> SX1278 LoRa @ 433.0 MHz, SF7, BW 125 kHz, CR 4/5.</li>
              <li><strong className="text-[#E5ECF0]">Voice Synthesis:</strong> Codec2 1600 bps decoded on ESP32 Core 1.</li>
              <li><strong className="text-[#E5ECF0]">Hardware DAC:</strong> MAX98357A I2S on GPIO 25 (LRC), 26 (BCLK), 27 (DIN).</li>
              <li><strong className="text-[#E5ECF0]">Zero USB Audio:</strong> Serial stream emits ASCII telemetry only; no PCM/Codec2 frames exist on USB.</li>
            </ul>
          </div>
        </div>

        {/* FOOTER */}
        <div className="px-4 py-2 bg-[#10161B] border-t border-[#26343A] flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-[#151D23] hover:bg-[#202B33] border border-[#26343A] text-[#E5ECF0] font-semibold transition-colors text-[10px]"
          >
            DISMISS
          </button>
        </div>
      </div>
    </div>
  );
};
