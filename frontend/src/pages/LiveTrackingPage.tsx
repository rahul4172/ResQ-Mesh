import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  MapPin,
  Compass,
  Satellite,
  Gauge,
  ExternalLink,
  Layers,
  Crosshair,
  Clock,
  Radio,
  History,
} from 'lucide-react';
import { useResQ } from '../context/ResQContext';
import { Card } from '../components/Common/Card';
import { Badge } from '../components/Common/Badge';

export const LiveTrackingPage: React.FC = () => {
  const { latestGps, gpsTrail } = useResQ();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const [autoCenter, setAutoCenter] = useState<boolean>(true);

  const isLive = latestGps && Date.now() / 1000 - latestGps.timestamp < 30;
  const ageSeconds = latestGps ? Math.max(0, Math.floor(Date.now() / 1000 - latestGps.timestamp)) : null;

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Default center: current GPS fix or default emergency locus (Kolkata/Sundarbans emergency sector)
    const initialLat = latestGps ? latestGps.latitude : 22.572645;
    const initialLon = latestGps ? latestGps.longitude : 88.363892;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLon],
      zoom: 15,
      zoomControl: false,
    });

    // Dark OpenStreetMap CartoDB Dark Matter style
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Breadcrumb trail polyline
    const polyline = L.polyline([], {
      color: '#06b6d4',
      weight: 3,
      opacity: 0.7,
      dashArray: '4, 6',
    }).addTo(map);

    mapInstanceRef.current = map;
    polylineRef.current = polyline;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Marker & Breadcrumb Polyline when GPS data arrives
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Update trail polyline
    if (polylineRef.current && gpsTrail.length > 0) {
      const latLngs = gpsTrail.map((g) => [g.latitude, g.longitude] as [number, number]);
      polylineRef.current.setLatLngs(latLngs);
    }

    if (latestGps) {
      const pos: [number, number] = [latestGps.latitude, latestGps.longitude];

      // Custom Tactical Radar Marker Icon
      const customIcon = L.divIcon({
        className: 'custom-radar-icon',
        html: `
          <div class="relative w-8 h-8 flex items-center justify-center">
            <div class="absolute w-8 h-8 rounded-full ${isLive ? 'bg-tactical-cyan/30 animate-ping' : 'bg-tactical-amber/30'}"></div>
            <div class="w-4 h-4 rounded-full ${isLive ? 'bg-tactical-cyan border-2 border-white' : 'bg-tactical-amber border-2 border-white'} shadow-lg z-10"></div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      if (!markerRef.current) {
        const marker = L.marker(pos, { icon: customIcon }).addTo(map);
        marker.bindPopup(`
          <div style="font-family: monospace; font-size: 12px; color: #1e293b; padding: 4px;">
            <strong>RESQ-MESH VICTIM BEACON</strong><br/>
            Lat: ${latestGps.latitude.toFixed(6)}<br/>
            Lon: ${latestGps.longitude.toFixed(6)}<br/>
            Sats: ${latestGps.satellites} | Speed: ${latestGps.speed_kmh} km/h<br/>
            UTC: ${latestGps.utc_time}
          </div>
        `);
        markerRef.current = marker;
      } else {
        markerRef.current.setLatLng(pos);
        markerRef.current.setIcon(customIcon);
      }

      if (autoCenter) {
        map.panTo(pos, { animate: true });
      }
    }
  }, [latestGps, gpsTrail, isLive, autoCenter]);

  const recenterMap = () => {
    if (mapInstanceRef.current && latestGps) {
      mapInstanceRef.current.setView([latestGps.latitude, latestGps.longitude], 16, { animate: true });
      setAutoCenter(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Telemetry HUD */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Fix State */}
        <div className="bg-charcoal-900 border border-charcoal-800 rounded-xl p-3.5 font-mono">
          <div className="text-[10px] text-slate-500 uppercase">GPS FIX STATE</div>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant={isLive ? 'emerald' : latestGps ? 'amber' : 'rose'} size="sm" dot={isLive}>
              {isLive ? 'LIVE FIX' : latestGps ? `STALE (${ageSeconds}s)` : 'NO FIX'}
            </Badge>
          </div>
        </div>

        {/* Satellites */}
        <div className="bg-charcoal-900 border border-charcoal-800 rounded-xl p-3.5 font-mono">
          <div className="text-[10px] text-slate-500 uppercase flex items-center gap-1">
            <Satellite className="w-3 h-3 text-slate-400" /> SATELLITES
          </div>
          <div className="mt-1 text-lg font-bold text-slate-100">
            {latestGps ? `${latestGps.satellites} SATS` : '--'}
          </div>
          <div className="text-[10px] text-slate-500">HDOP: {latestGps?.hdop ?? '--'}</div>
        </div>

        {/* Speed */}
        <div className="bg-charcoal-900 border border-charcoal-800 rounded-xl p-3.5 font-mono">
          <div className="text-[10px] text-slate-500 uppercase flex items-center gap-1">
            <Gauge className="w-3 h-3 text-slate-400" /> GROUND SPEED
          </div>
          <div className="mt-1 text-lg font-bold text-slate-100">
            {latestGps ? `${latestGps.speed_kmh.toFixed(1)} km/h` : '--'}
          </div>
          <div className="text-[10px] text-slate-500">
            {latestGps ? `${(latestGps.speed_kmh * 0.277778).toFixed(1)} m/s` : '--'}
          </div>
        </div>

        {/* Altitude */}
        <div className="bg-charcoal-900 border border-charcoal-800 rounded-xl p-3.5 font-mono">
          <div className="text-[10px] text-slate-500 uppercase">ALTITUDE (MSL)</div>
          <div className="mt-1 text-lg font-bold text-slate-100">
            {latestGps ? `${latestGps.altitude_m} m` : '--'}
          </div>
          <div className="text-[10px] text-slate-500">
            {latestGps ? `${Math.round(latestGps.altitude_m * 3.28084)} ft` : '--'}
          </div>
        </div>

        {/* Heading */}
        <div className="bg-charcoal-900 border border-charcoal-800 rounded-xl p-3.5 font-mono">
          <div className="text-[10px] text-slate-500 uppercase flex items-center gap-1">
            <Compass className="w-3 h-3 text-slate-400" /> BEARING
          </div>
          <div className="mt-1 text-lg font-bold text-slate-100">
            {latestGps ? `${latestGps.course_deg.toFixed(1)}°` : '--'}
          </div>
          <div className="text-[10px] text-slate-500">Compass heading</div>
        </div>

        {/* UTC Time */}
        <div className="bg-charcoal-900 border border-charcoal-800 rounded-xl p-3.5 font-mono">
          <div className="text-[10px] text-slate-500 uppercase flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-400" /> UTC TIMESTAMP
          </div>
          <div className="mt-1 text-base font-bold text-slate-100 truncate">
            {latestGps ? latestGps.utc_time : '--:--:--'}
          </div>
          <div className="text-[10px] text-slate-500">
            RSSI: {latestGps?.rssi_dbm ? `${latestGps.rssi_dbm} dBm` : '--'}
          </div>
        </div>
      </div>

      {/* Main Map Container Card */}
      <Card
        title="GEOSPATIAL LIVE TRACKING MAP"
        subtitle="Tactical OpenStreetMap overlay with victim breadcrumb movement trail"
        icon={<MapPin className="w-4 h-4" />}
        action={
          <div className="flex items-center gap-3">
            {latestGps?.google_maps_url && (
              <a
                href={latestGps.google_maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1 bg-charcoal-800 hover:bg-charcoal-750 text-tactical-cyan border border-charcoal-700 rounded-lg text-xs font-mono font-semibold transition-colors"
              >
                Google Maps <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <button
              onClick={recenterMap}
              className="inline-flex items-center gap-1 px-3 py-1 bg-charcoal-800 hover:bg-charcoal-750 text-slate-200 border border-charcoal-700 rounded-lg text-xs font-mono font-medium transition-colors"
              title="Recenter view on victim beacon"
            >
              <Crosshair className="w-3.5 h-3.5 text-tactical-cyan" />
              Recenter
            </button>
          </div>
        }
      >
        <div className="relative">
          {/* Map canvas */}
          <div
            ref={mapContainerRef}
            className="w-full h-[540px] rounded-lg overflow-hidden border border-charcoal-800 relative z-0"
          />

          {/* Floating Map HUD overlay */}
          <div className="absolute top-4 left-4 z-[400] bg-charcoal-900/90 border border-charcoal-750 backdrop-blur-md rounded-lg p-3 font-mono text-xs max-w-sm space-y-1.5 shadow-2xl">
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-400">BEACON LAT/LON</span>
              {latestGps?.is_simulated && (
                <Badge variant="amber" size="sm">
                  SIMULATED
                </Badge>
              )}
            </div>
            <div className="text-sm font-bold text-slate-100">
              {latestGps
                ? `${latestGps.latitude.toFixed(6)}, ${latestGps.longitude.toFixed(6)}`
                : 'Searching for GPS signal...'}
            </div>
            <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-charcoal-800">
              <span>Trail Points: <strong>{gpsTrail.length}</strong></span>
              <span>Interval: <strong>10s</strong></span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};
