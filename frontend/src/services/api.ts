import {
  SerialPortInfo,
  SystemStatusResponse,
  GpsEvent,
  PacketStatsEvent,
  RawLogEvent,
} from '../types';

const BASE_URL = '/api';

export const apiService = {
  async getPorts(): Promise<SerialPortInfo[]> {
    const res = await fetch(`${BASE_URL}/ports`);
    if (!res.ok) throw new Error('Failed to fetch serial ports');
    return res.json();
  },

  async getSystemStatus(): Promise<SystemStatusResponse> {
    const res = await fetch(`${BASE_URL}/status`);
    if (!res.ok) throw new Error('Failed to fetch system status');
    return res.json();
  },

  async connectPort(port: string, baudRate: number = 115200): Promise<any> {
    const res = await fetch(`${BASE_URL}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port, baud_rate: baudRate }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to connect' }));
      throw new Error(err.detail || 'Connection failed');
    }
    return res.json();
  },

  async disconnectPort(): Promise<any> {
    const res = await fetch(`${BASE_URL}/disconnect`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to disconnect');
    return res.json();
  },

  async startSimulation(): Promise<any> {
    const res = await fetch(`${BASE_URL}/simulation/start`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to start simulation');
    return res.json();
  },

  async stopSimulation(): Promise<any> {
    const res = await fetch(`${BASE_URL}/simulation/stop`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to stop simulation');
    return res.json();
  },

  async getGpsHistory(limit: number = 500): Promise<GpsEvent[]> {
    const res = await fetch(`${BASE_URL}/gps/history?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch GPS history');
    return res.json();
  },

  async getPacketStatsHistory(limit: number = 100): Promise<PacketStatsEvent[]> {
    const res = await fetch(`${BASE_URL}/packets/history?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch packet stats history');
    return res.json();
  },

  async getRawLogs(limit: number = 200, onlyUnknown: boolean = false): Promise<RawLogEvent[]> {
    const res = await fetch(`${BASE_URL}/logs/raw?limit=${limit}&only_unknown=${onlyUnknown}`);
    if (!res.ok) throw new Error('Failed to fetch raw logs');
    return res.json();
  },

  async clearStorage(): Promise<any> {
    const res = await fetch(`${BASE_URL}/storage/clear`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to clear database');
    return res.json();
  },
};
