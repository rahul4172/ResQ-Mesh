import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import {
  GpsEvent,
  AudioLifecycleEvent,
  PacketStatsEvent,
  WarningEvent,
  RawLogEvent,
  ConnectionState,
  SerialPortInfo,
} from '../types';
import { apiService } from '../services/api';

interface ResQContextType {
  connection: ConnectionState;
  latestGps: GpsEvent | null;
  gpsTrail: GpsEvent[];
  latestAudio: AudioLifecycleEvent | null;
  audioPeakHistory: number[];
  latestStats: PacketStatsEvent | null;
  statsHistory: PacketStatsEvent[];
  activeWarnings: WarningEvent[];
  rawLogs: RawLogEvent[];
  ports: SerialPortInfo[];
  wsConnected: boolean;
  refreshPorts: () => Promise<void>;
  connectPort: (port: string, baud?: number) => Promise<void>;
  disconnectPort: () => Promise<void>;
  startSimulation: () => Promise<void>;
  stopSimulation: () => Promise<void>;
  clearLocalHistory: () => Promise<void>;
  clearLogs: () => void;
}

const ResQContext = createContext<ResQContextType | undefined>(undefined);

export const ResQProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [connection, setConnection] = useState<ConnectionState>({
    is_connected: false,
    is_simulated: false,
    baud_rate: 115200,
    bytes_read: 0,
    lines_read: 0,
  });

  const [latestGps, setLatestGps] = useState<GpsEvent | null>(null);
  const [gpsTrail, setGpsTrail] = useState<GpsEvent[]>([]);
  const [latestAudio, setLatestAudio] = useState<AudioLifecycleEvent | null>(null);
  const [audioPeakHistory, setAudioPeakHistory] = useState<number[]>([]);
  const [latestStats, setLatestStats] = useState<PacketStatsEvent | null>(null);
  const [statsHistory, setStatsHistory] = useState<PacketStatsEvent[]>([]);
  const [activeWarnings, setActiveWarnings] = useState<WarningEvent[]>([]);
  const [rawLogs, setRawLogs] = useState<RawLogEvent[]>([]);
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [wsConnected, setWsConnected] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);

  const refreshPorts = useCallback(async () => {
    try {
      const portList = await apiService.getPorts();
      setPorts(portList);
    } catch (err) {
      console.error('Failed to load ports:', err);
    }
  }, []);

  const loadInitialState = useCallback(async () => {
    try {
      const status = await apiService.getSystemStatus();
      setConnection(status.connection);
      if (status.latest_gps) setLatestGps(status.latest_gps);
      if (status.latest_audio) setLatestAudio(status.latest_audio);
      if (status.latest_stats) setLatestStats(status.latest_stats);
      if (status.active_warnings) setActiveWarnings(status.active_warnings);

      // Load initial GPS history for trail
      const history = await apiService.getGpsHistory(200);
      setGpsTrail(history);

      // Load initial raw logs
      const logs = await apiService.getRawLogs(100);
      setRawLogs(logs);

      // Load packet stats history
      const statsHist = await apiService.getPacketStatsHistory(50);
      setStatsHistory(statsHist.reverse());
    } catch (err) {
      console.warn('Initial state fetch error:', err);
    }
  }, []);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host || 'localhost:8000';
    // If dev server on 5173, point directly or rely on Vite proxy
    const wsUrl = `${protocol}//${host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      console.log('[WS] Connected to ResQ-Mesh event stream');
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const { type, payload } = data;

        if (type === 'init') {
          setConnection(payload.connection);
          if (payload.latest_gps) setLatestGps(payload.latest_gps);
          if (payload.latest_audio) setLatestAudio(payload.latest_audio);
          if (payload.latest_stats) setLatestStats(payload.latest_stats);
          if (payload.active_warnings) setActiveWarnings(payload.active_warnings);
        } else if (type === 'gps') {
          setLatestGps(payload);
          setGpsTrail((prev) => [...prev.slice(-300), payload]);
        } else if (type === 'audio_lifecycle') {
          setLatestAudio(payload);
          if (payload.peak_level !== undefined) {
            setAudioPeakHistory((prev) => [...prev.slice(-50), payload.peak_level]);
          }
        } else if (type === 'status_report') {
          setLatestStats(payload);
          setStatsHistory((prev) => [...prev.slice(-60), payload]);
          if (payload.decoded_peak_level !== undefined) {
            setAudioPeakHistory((prev) => [...prev.slice(-50), payload.decoded_peak_level]);
          }
        } else if (type === 'raw_log') {
          setRawLogs((prev) => [payload, ...prev.slice(0, 400)]);
        } else if (type === 'warning') {
          setActiveWarnings((prev) => [payload, ...prev.slice(0, 10)]);
        } else if (type === 'connection_state') {
          setConnection(payload);
        }
      } catch (err) {
        console.error('Error handling WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      wsRef.current = null;
      console.warn('[WS] Connection closed, scheduling reconnect in 2s...');
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, 2000);
    };

    ws.onerror = (err) => {
      console.error('[WS] WebSocket error:', err);
      ws.close();
    };
  }, []);

  useEffect(() => {
    refreshPorts();
    loadInitialState();
    connectWebSocket();

    const interval = setInterval(async () => {
      // Periodically refresh system connection status
      try {
        const status = await apiService.getSystemStatus();
        setConnection(status.connection);
      } catch {}
    }, 4000);

    return () => {
      clearInterval(interval);
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [refreshPorts, loadInitialState, connectWebSocket]);

  const connectPort = async (port: string, baud: number = 115200) => {
    const res = await apiService.connectPort(port, baud);
    setConnection(res.state);
  };

  const disconnectPort = async () => {
    const res = await apiService.disconnectPort();
    setConnection(res.state);
  };

  const startSimulation = async () => {
    await apiService.startSimulation();
    setConnection((prev) => ({
      ...prev,
      is_connected: true,
      is_simulated: true,
      port: 'VIRTUAL_SIM_COM',
    }));
  };

  const stopSimulation = async () => {
    await apiService.stopSimulation();
    setConnection((prev) => ({
      ...prev,
      is_connected: false,
      is_simulated: false,
      port: undefined,
    }));
  };

  const clearLocalHistory = async () => {
    await apiService.clearStorage();
    setGpsTrail([]);
    setRawLogs([]);
    setStatsHistory([]);
  };

  const clearLogs = () => {
    setRawLogs([]);
  };

  return (
    <ResQContext.Provider
      value={{
        connection,
        latestGps,
        gpsTrail,
        latestAudio,
        audioPeakHistory,
        latestStats,
        statsHistory,
        activeWarnings,
        rawLogs,
        ports,
        wsConnected,
        refreshPorts,
        connectPort,
        disconnectPort,
        startSimulation,
        stopSimulation,
        clearLocalHistory,
        clearLogs,
      }}
    >
      {children}
    </ResQContext.Provider>
  );
};

export const useResQ = () => {
  const context = useContext(ResQContext);
  if (!context) {
    throw new Error('useResQ must be used within a ResQProvider');
  }
  return context;
};
