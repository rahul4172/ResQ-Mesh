import React from 'react';
import {
  Terminal,
  Settings,
  MapPin,
} from 'lucide-react';
import { useResQ } from '../context/ResQContext';

interface BottomStatusBarProps {
  onOpenTerminal: () => void;
  onOpenSettings: () => void;
}

export const BottomStatusBar: React.FC<BottomStatusBarProps> = ({
  onOpenTerminal,
  onOpenSettings,
}) => {
  const {
    connection,
    latestGps,
    rawLogs,
    wsConnected,
  } = useResQ();

  const isLive = latestGps && Date.now() / 1000 - latestGps.timestamp < 30;
  const lastLog = rawLogs[0];
  const lastEventTime = lastLog
    ? new Date(lastLog.timestamp * 1000).toISOString().substring(11, 19) + ' UTC'
    : '--:--:--';

  return (
    <footer className="h-7 bg-[#080B0F] border-t border-[#26343A] px-3 flex items-center justify-between text-[10px] font-mono select-none z-20 flex-shrink-0">
      {/* LEFT: COORDINATES & LAYER READOUT */}
      <div className="flex items-center space-x-2 text-[#87949A] min-w-0">
        <MapPin className="w-3 h-3 text-[#48D8D0] shrink-0" />
        {latestGps ? (
          <span className="text-[#E5ECF0] font-medium tracking-tight truncate">
            {Math.abs(latestGps.latitude).toFixed(6)}° {latestGps.latitude >= 0 ? 'N' : 'S'},{' '}
            {Math.abs(latestGps.longitude).toFixed(6)}° {latestGps.longitude >= 0 ? 'E' : 'W'}
            {latestGps.altitude_m !== undefined && (
              <span className="text-[#58666B] ml-1.5 font-normal">
                | ALT: {latestGps.altitude_m.toFixed(1)}m
              </span>
            )}
          </span>
        ) : (
          <span className="text-[#58666B]">NO POSITION FIX</span>
        )}

        <div className="hidden md:flex items-center space-x-1 text-[9px] text-[#58666B] shrink-0">
          <span>|</span>
          <span className="text-[#87949A]">1 TARGET</span>
          <span>•</span>
          <span>433.0 MHz LoRa</span>
        </div>
      </div>

      {/* CENTER: OVERGLASS-STYLE STATUS DOT STRIP */}
      <div className="hidden xl:flex items-center space-x-3.5">
        {/* USB Link */}
        <div className="flex items-center space-x-1">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              connection.is_connected ? 'bg-[#35C98A]' : 'bg-[#F06464]'
            }`}
          />
          <span className="text-[9px] text-[#87949A]">
            USB:{' '}
            <span className={connection.is_connected ? 'text-[#E5ECF0]' : 'text-[#F06464]'}>
              {connection.is_connected ? 'LINK OK' : 'DISCONNECTED'}
            </span>
          </span>
        </div>

        {/* Serial Activity */}
        <div className="flex items-center space-x-1">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              connection.is_connected ? 'bg-[#48D8D0] animate-pulse' : 'bg-[#58666B]'
            }`}
          />
          <span className="text-[9px] text-[#87949A]">
            SERIAL:{' '}
            <span className={connection.is_connected ? 'text-[#48D8D0]' : 'text-[#58666B]'}>
              {connection.lines_read > 0 ? `${connection.lines_read} L` : 'IDLE'}
            </span>
          </span>
        </div>

        {/* GPS Status */}
        <div className="flex items-center space-x-1">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              latestGps
                ? isLive
                  ? 'bg-[#35C98A] animate-pulse'
                  : 'bg-[#E6B84D]'
                : 'bg-[#58666B]'
            }`}
          />
          <span className="text-[9px] text-[#87949A]">
            GPS:{' '}
            <span
              className={
                latestGps
                  ? isLive
                    ? 'text-[#35C98A]'
                    : 'text-[#E6B84D]'
                  : 'text-[#58666B]'
              }
            >
              {latestGps ? (isLive ? 'LIVE' : 'STALE') : 'NO FIX'}
            </span>
          </span>
        </div>

        {/* Audio Mode */}
        <div className="flex items-center space-x-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#19A88F]" />
          <span className="text-[9px] text-[#87949A]">
            AUDIO: <span className="text-[#19A88F]">HW I2S ONLY</span>
          </span>
        </div>

        {/* Bridge Health */}
        <div className="flex items-center space-x-1">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              wsConnected ? 'bg-[#35C98A]' : 'bg-[#F06464]'
            }`}
          />
          <span className="text-[9px] text-[#87949A]">
            BRIDGE:{' '}
            <span className={wsConnected ? 'text-[#E5ECF0]' : 'text-[#F06464]'}>
              {wsConnected ? 'ONLINE' : 'OFFLINE'}
            </span>
          </span>
        </div>
      </div>

      {/* RIGHT: LAST EVENT TIMESTAMP & DRAWER TOGGLES */}
      <div className="flex items-center space-x-2 shrink-0">
        <div className="hidden sm:flex items-center space-x-1 text-[9px] text-[#58666B]">
          <span>LAST EVENT:</span>
          <span className="text-[#9CB3C9]">{lastEventTime}</span>
        </div>

        {/* Simulation / Hardware Mode Tag */}
        {connection.is_simulated ? (
          <span className="px-1.5 py-0.2 rounded bg-[#E6B84D]/15 border border-[#E6B84D]/30 text-[#E6B84D] text-[9px] font-bold tracking-wider">
            MOCK MODE
          </span>
        ) : (
          <span className="px-1.5 py-0.2 rounded bg-[#35C98A]/15 border border-[#35C98A]/30 text-[#35C98A] text-[9px] font-bold tracking-wider">
            HARDWARE
          </span>
        )}

        {/* Terminal Toggle Button */}
        <button
          onClick={onOpenTerminal}
          className="flex items-center space-x-1 px-2 py-0.5 rounded bg-[#10161B] hover:bg-[#1C262C] border border-[#26343A] text-[#87949A] hover:text-[#48D8D0] transition-colors"
          title="Open Raw Serial Terminal"
        >
          <Terminal className="w-3 h-3 text-[#48D8D0]" />
          <span className="text-[9px] font-semibold">CONSOLE</span>
        </button>

        {/* Settings Toggle Button */}
        <button
          onClick={onOpenSettings}
          className="flex items-center space-x-1 px-2 py-0.5 rounded bg-[#10161B] hover:bg-[#1C262C] border border-[#26343A] text-[#87949A] hover:text-[#48D8D0] transition-colors"
          title="Open Link & System Configuration"
        >
          <Settings className="w-3 h-3 text-[#87949A]" />
          <span className="text-[9px] font-semibold">CONFIG</span>
        </button>
      </div>
    </footer>
  );
};
