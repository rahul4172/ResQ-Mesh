import React, { useState } from 'react';
import { ResQProvider } from './context/ResQContext';
import { TopHeader } from './components/TopHeader';
import { LeftRail } from './components/LeftRail';
import { MapWorkspace } from './components/MapWorkspace';
import { RightRail } from './components/RightRail';
import { BottomStatusBar } from './components/BottomStatusBar';
import { TerminalDrawer } from './components/TerminalDrawer';
import { SettingsDrawer } from './components/SettingsDrawer';

export const AppContent: React.FC = () => {
  const [showTerminal, setShowTerminal] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#080B0F] text-[#9CB3C9] select-none overflow-hidden font-sans">
      {/* 1. TOP HEADER & VERIFIED ALERT TICKER */}
      <TopHeader
        onOpenTerminal={() => setShowTerminal(true)}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* 2. THREE-COLUMN OPERATIONAL WORKSPACE */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Persistent Left Rail: Connection, Intercept Feed, Voice Activity */}
        <LeftRail />

        {/* Dominant Central Map Workspace */}
        <main className="flex-1 h-full relative overflow-hidden">
          <MapWorkspace />
        </main>

        {/* Persistent Right Rail: Victim HUD, GPS Grid, Audio Decoupling, Packets, Health */}
        <RightRail />
      </div>

      {/* 3. BOTTOM STATUS STRIP */}
      <BottomStatusBar
        onOpenTerminal={() => setShowTerminal(true)}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* 4. FLOATING DRAWERS */}
      {showTerminal && <TerminalDrawer onClose={() => setShowTerminal(false)} />}
      {showSettings && <SettingsDrawer onClose={() => setShowSettings(false)} />}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ResQProvider>
      <AppContent />
    </ResQProvider>
  );
};

export default App;
