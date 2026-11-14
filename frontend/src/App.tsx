import React, { useState } from 'react';
import { ResQProvider } from './context/ResQContext';
import { Sidebar } from './components/Layout/Sidebar';
import { Navbar } from './components/Layout/Navbar';
import { OverviewPage } from './pages/OverviewPage';
import { LiveTrackingPage } from './pages/LiveTrackingPage';
import { VoiceMonitorPage } from './pages/VoiceMonitorPage';
import { PacketLogsPage } from './pages/PacketLogsPage';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { SettingsPage } from './pages/SettingsPage';

export const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('overview');

  const renderActivePage = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewPage onNavigate={setActiveTab} />;
      case 'tracking':
        return <LiveTrackingPage />;
      case 'voice':
        return <VoiceMonitorPage />;
      case 'packets':
        return <PacketLogsPage />;
      case 'diagnostics':
        return <DiagnosticsPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <OverviewPage onNavigate={setActiveTab} />;
    }
  };

  return (
    <div className="flex bg-charcoal-950 min-h-screen text-slate-100 font-sans">
      {/* Fixed Left Tactical Sidebar */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Area */}
      <div className="flex-1 ml-64 flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
          {renderActivePage()}
        </main>
      </div>
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
