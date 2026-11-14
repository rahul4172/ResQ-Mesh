import React from 'react';
import {
  LayoutDashboard,
  MapPin,
  Radio,
  Activity,
  Cpu,
  Settings,
  ShieldAlert,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';
import { useResQ } from '../../context/ResQContext';
import { Badge } from '../Common/Badge';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const { connection, latestAudio } = useResQ();

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'tracking', label: 'Live Tracking', icon: MapPin },
    { id: 'voice', label: 'Voice Monitor', icon: Radio },
    { id: 'packets', label: 'Packet Logs', icon: Activity },
    { id: 'diagnostics', label: 'Diagnostics', icon: Cpu },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-charcoal-900 border-r border-charcoal-800 flex flex-col justify-between h-screen fixed left-0 top-0 z-30 select-none">
      <div>
        {/* Brand Header */}
        <div className="h-16 px-5 border-b border-charcoal-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="ResQ-Mesh" className="w-8 h-8 drop-shadow-md" />
            <div>
              <span className="font-mono font-bold tracking-widest text-lg bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">
                RESQ-MESH
              </span>
              <span className="block text-[10px] text-tactical-cyan font-mono tracking-wider -mt-1">
                DISASTER COMM
              </span>
            </div>
          </div>
          <ShieldAlert className="w-5 h-5 text-tactical-orange animate-pulse" />
        </div>

        {/* Operating Status Strip */}
        <div className="px-5 py-3 bg-charcoal-950/60 border-b border-charcoal-800/60">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-slate-400">HARDWARE LINK</span>
            {connection.is_connected ? (
              <Badge variant={connection.is_simulated ? 'amber' : 'emerald'} size="sm" dot>
                {connection.is_simulated ? 'SIMULATED' : 'ONLINE'}
              </Badge>
            ) : (
              <Badge variant="rose" size="sm" dot>
                STANDBY
              </Badge>
            )}
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>PORT</span>
            <span className="text-slate-200 truncate max-w-[120px] font-semibold">
              {connection.port || 'NONE'}
            </span>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="p-3 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-charcoal-800 text-tactical-cyan border border-tactical-cyan/30 shadow-lg shadow-tactical-cyan/5 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-charcoal-850 border border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-tactical-cyan' : 'text-slate-400'}`} />
                <span>{item.label}</span>
                {item.id === 'voice' && latestAudio?.state === 'STREAMING' && (
                  <span className="ml-auto w-2 h-2 rounded-full bg-tactical-rose animate-ping" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer System Telemetry Summary */}
      <div className="p-4 border-t border-charcoal-800 bg-charcoal-950/40">
        <div className="rounded-lg bg-charcoal-850 p-3 border border-charcoal-750">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-1.5">
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-tactical-amber" /> RF FREQ
            </span>
            <span className="text-slate-200 font-semibold">433.0 MHz</span>
          </div>
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span className="flex items-center gap-1.5">
              {connection.is_connected ? (
                <Wifi className="w-3.5 h-3.5 text-tactical-emerald" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-slate-500" />
              )}
              AIR LINK
            </span>
            <span className="text-slate-200 font-semibold">SF7 / BW125k</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
