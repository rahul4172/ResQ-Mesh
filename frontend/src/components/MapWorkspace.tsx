import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Layers,
  Crosshair,
  Maximize2,
  ExternalLink,
  Satellite,
  Compass,
  Gauge,
  MapPin,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from 'lucide-react';
import { useResQ } from '../context/ResQContext';

export const MapWorkspace: React.FC = () => {
  const { latestGps, gpsTrail, clearLocalHistory } = useResQ();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Layer Toggles (Floating Panel)
  const [layersOpen, setLayersOpen] = useState<boolean>(true);
  const [showVictimMarker, setShowVictimMarker] = useState<boolean>(true);
  const [showTrail, setShowTrail] = useState<boolean>(true);
  const [showAccuracy, setShowAccuracy] = useState<boolean>(true);
  const [mapStyle, setMapStyle] = useState<'dark' | 'sat' | 'street'>('dark');

  // Fix Freshness State
  const isLive = latestGps && Date.now() / 1000 - latestGps.timestamp < 30;
  const fixAgeSec = latestGps ? Math.max(0, Math.floor(Date.now() / 1000 - latestGps.timestamp)) : null;

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const initialLat = latestGps?.latitude ?? 22.185200;
    const initialLon = latestGps?.longitude ?? 88.528400;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLon],
      zoom: 15,
      zoomControl: false,
      attributionControl: true,
    });

    // Dark Basemap by default (CartoDB Dark Matter)
    const darkTile = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    tileLayerRef.current = darkTile;

    // Polyline for Movement Trail
    const polyline = L.polyline([], {
      color: '#48D8D0',
      weight: 2.5,
      opacity: 0.75,
      dashArray: '3, 6',
    }).addTo(map);

    // Accuracy Circle
    const accuracyCircle = L.circle([initialLat, initialLon], {
      radius: 20,
      color: '#1D8F82',
      fillColor: '#19A88F',
      fillOpacity: 0.1,
      weight: 1,
    }).addTo(map);

    mapInstanceRef.current = map;
    polylineRef.current = polyline;
    accuracyCircleRef.current = accuracyCircle;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Map Layer Style
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    let url = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    let attr = '&copy; OpenStreetMap &copy; CARTO';

    if (mapStyle === 'sat') {
      url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      attr = '&copy; Esri, Maxar, Earthstar Geographics';
    } else if (mapStyle === 'street') {
      url = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      attr = '&copy; OpenStreetMap contributors';
    }

    tileLayerRef.current = L.tileLayer(url, { attribution: attr, maxZoom: 19 }).addTo(map);
  }, [mapStyle]);

  // Update Victim Marker and Trail on GPS telemetry updates
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Update trail polyline
    if (polylineRef.current) {
      if (showTrail && gpsTrail.length > 0) {
        const latLngs = gpsTrail.map((g) => [g.latitude, g.longitude] as [number, number]);
        polylineRef.current.setLatLngs(latLngs);
      } else {
        polylineRef.current.setLatLngs([]);
      }
    }

    if (latestGps && showVictimMarker) {
      const pos: [number, number] = [latestGps.latitude, latestGps.longitude];

      // Update Accuracy Circle (radius approximated from HDOP * 5 meters)
      if (accuracyCircleRef.current) {
        if (showAccuracy) {
          const radiusM = Math.max(10, (latestGps.hdop || 1.5) * 6);
          accuracyCircleRef.current.setLatLng(pos);
          accuracyCircleRef.current.setRadius(radiusM);
          accuracyCircleRef.current.setStyle({
            color: isLive ? '#1D8F82' : '#E6B84D',
            fillColor: isLive ? '#19A88F' : '#E6B84D',
          });
        } else {
          accuracyCircleRef.current.setRadius(0);
        }
      }

      // Tactical Custom Radar Beacon DivIcon
      const beaconIcon = L.divIcon({
        className: 'custom-tactical-beacon',
        html: `
          <div class="relative w-8 h-8 flex items-center justify-center pointer-events-none">
            ${isLive ? '<div class="absolute w-8 h-8 rounded-full border border-accent-cyan animate-ping opacity-60"></div>' : ''}
            <div class="w-3.5 h-3.5 rounded-full ${isLive ? 'bg-accent-cyan border border-white' : 'bg-status-warning border border-black'} shadow-lg z-20"></div>
            ${latestGps.course_deg ? `<div class="absolute w-6 h-6 border-t-2 border-accent-teal rounded-full" style="transform: rotate(${latestGps.course_deg}deg);"></div>` : ''}
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      if (!markerRef.current) {
        const marker = L.marker(pos, { icon: beaconIcon }).addTo(map);
        marker.bindPopup(`
          <div style="font-family: monospace; font-size: 11px; color: #080B0F; padding: 2px;">
            <strong style="color: #19A88F;">RESQ-MESH VICTIM BEACON</strong><br/>
            Lat: ${latestGps.latitude.toFixed(6)}<br/>
            Lon: ${latestGps.longitude.toFixed(6)}<br/>
            Fix: ${isLive ? 'LIVE UPDATE' : `STALE (${fixAgeSec}s)`}<br/>
            Sats: ${latestGps.satellites} | Speed: ${latestGps.speed_kmh} km/h<br/>
            UTC: ${latestGps.utc_time} | RSSI: ${latestGps.rssi_dbm} dBm
          </div>
        `);
        markerRef.current = marker;
      } else {
        markerRef.current.setLatLng(pos);
        markerRef.current.setIcon(beaconIcon);
      }
    } else if (markerRef.current && !showVictimMarker) {
      markerRef.current.remove();
      markerRef.current = null;
    }
  }, [latestGps, gpsTrail, isLive, showVictimMarker, showTrail, showAccuracy, fixAgeSec]);

  const recenterOnVictim = () => {
    if (mapInstanceRef.current && latestGps) {
      mapInstanceRef.current.setView([latestGps.latitude, latestGps.longitude], 16, { animate: true });
    }
  };

  const fitToTrail = () => {
    if (mapInstanceRef.current && gpsTrail.length > 0) {
      const bounds = L.latLngBounds(gpsTrail.map((g) => [g.latitude, g.longitude]));
      mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], animate: true });
    }
  };

  return (
    <div className="flex-1 relative h-[calc(100vh-3.5rem-1.75rem)] bg-bg-app overflow-hidden">
      {/* Central Leaflet Map Container */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Floating Layers Panel (Upper Left, inspired by Overglass) */}
      <div className="absolute top-4 left-4 z-[400] w-64 bg-bg-panel/95 border border-border-subtle rounded shadow-2xl backdrop-blur-md select-none font-mono text-xs">
        <div
          onClick={() => setLayersOpen(!layersOpen)}
          className="p-2.5 bg-bg-panel-raised border-b border-border-subtle flex items-center justify-between cursor-pointer hover:text-accent-cyan transition-colors"
        >
          <span className="flex items-center gap-2 text-2xs uppercase tracking-tactical font-bold text-tactext-primary">
            <Layers className="w-3.5 h-3.5 text-accent-cyan" />
            TACTICAL LAYERS
          </span>
          {layersOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>

        {layersOpen && (
          <div className="p-3 space-y-2.5 text-2xs">
            <label className="flex items-center justify-between text-tactext-secondary hover:text-tactext-primary cursor-pointer">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent-cyan" />
                Victim Beacon [0xA2]
              </span>
              <input
                type="checkbox"
                checked={showVictimMarker}
                onChange={(e) => setShowVictimMarker(e.target.checked)}
                className="accent-accent-cyan rounded"
              />
            </label>

            <label className="flex items-center justify-between text-tactext-secondary hover:text-tactext-primary cursor-pointer">
              <span className="flex items-center gap-2">
                <span className="w-2 h-0.5 bg-accent-teal" />
                Movement Trail ({gpsTrail.length} pts)
              </span>
              <input
                type="checkbox"
                checked={showTrail}
                onChange={(e) => setShowTrail(e.target.checked)}
                className="accent-accent-cyan rounded"
              />
            </label>

            <label className="flex items-center justify-between text-tactext-secondary hover:text-tactext-primary cursor-pointer">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full border border-accent-teal" />
                Accuracy Radius (HDOP)
              </span>
              <input
                type="checkbox"
                checked={showAccuracy}
                onChange={(e) => setShowAccuracy(e.target.checked)}
                className="accent-accent-cyan rounded"
              />
            </label>

            <div className="pt-2 border-t border-border-subtle flex items-center justify-between text-3xs text-tactext-muted">
              <span>Trail Points: <strong>{gpsTrail.length}</strong></span>
              {gpsTrail.length > 0 && (
                <button
                  onClick={() => clearLocalHistory()}
                  className="hover:text-status-critical flex items-center gap-1 transition-colors"
                >
                  <RotateCcw className="w-2.5 h-2.5" /> Clear Trail
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Floating Active Target Coordinates HUD (Top-Center) */}
      {latestGps && (
        <div className="absolute top-4 left-72 right-72 mx-auto max-w-xl z-[400] bg-bg-panel/95 border border-border-subtle rounded px-4 py-2 flex items-center justify-between backdrop-blur-md shadow-2xl font-mono text-xs select-none">
          <div className="flex items-center gap-3">
            <span
              className={`w-2 h-2 rounded-full ${
                isLive ? 'bg-status-success animate-pulse' : 'bg-status-warning'
              }`}
            />
            <div>
              <div className="text-3xs text-tactext-secondary uppercase">
                {isLive ? 'LIVE FIX' : `LAST KNOWN LOCATION (${fixAgeSec}s ago)`}
              </div>
              <div className="text-xs font-bold text-tactext-primary">
                {latestGps.latitude.toFixed(6)}° N, {latestGps.longitude.toFixed(6)}° E
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-3xs text-tactext-secondary border-l border-border-subtle pl-4">
            <div>
              <span>ALT:</span> <strong className="text-tactext-primary">{latestGps.altitude_m}m</strong>
            </div>
            <div>
              <span>SPD:</span> <strong className="text-tactext-primary">{latestGps.speed_kmh.toFixed(1)} km/h</strong>
            </div>
            <div>
              <span>SATS:</span> <strong className="text-accent-teal">{latestGps.satellites}</strong>
            </div>
          </div>

          {latestGps.google_maps_url && (
            <a
              href={latestGps.google_maps_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-1 bg-bg-panel-raised hover:bg-border-subtle text-accent-cyan border border-border-active/40 rounded text-3xs flex items-center gap-1 transition-colors"
            >
              Maps <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>
      )}

      {/* No GPS Fix Floating Warning if absent */}
      {!latestGps && (
        <div className="absolute top-4 left-72 right-72 mx-auto max-w-md z-[400] bg-bg-panel/95 border border-status-warning/40 rounded px-4 py-2.5 flex items-center gap-3 backdrop-blur-md shadow-2xl font-mono text-xs">
          <span className="w-2 h-2 rounded-full bg-status-warning animate-pulse" />
          <div className="leading-tight">
            <div className="text-2xs font-bold text-status-warning uppercase">NO VALID GPS FIX ACQUIRED</div>
            <div className="text-3xs text-tactext-muted mt-0.5">Awaiting 0xA2 telemetry packet from victim transmitter</div>
          </div>
        </div>
      )}

      {/* Floating Map Controls (Bottom Left, inspired by Overglass MAP/SAT/2D/3D switcher) */}
      <div className="absolute bottom-4 left-4 z-[400] flex items-center gap-2 font-mono text-2xs select-none">
        {/* Style Switcher */}
        <div className="bg-bg-panel/95 border border-border-subtle rounded p-0.5 flex items-center gap-0.5 backdrop-blur-md shadow-lg">
          {(['dark', 'sat', 'street'] as const).map((style) => (
            <button
              key={style}
              onClick={() => setMapStyle(style)}
              className={`px-2 py-1 rounded uppercase tracking-wider font-bold transition-colors ${
                mapStyle === style
                  ? 'bg-border-active/30 text-accent-cyan border border-border-active'
                  : 'text-tactext-muted hover:text-tactext-secondary'
              }`}
            >
              {style === 'dark' ? 'DARK' : style === 'sat' ? 'SAT' : 'MAP'}
            </button>
          ))}
        </div>

        {/* Tactical Recenter & Fit Buttons */}
        <div className="bg-bg-panel/95 border border-border-subtle rounded p-0.5 flex items-center gap-0.5 backdrop-blur-md shadow-lg">
          <button
            onClick={recenterOnVictim}
            className="p-1 rounded text-tactext-secondary hover:text-accent-cyan hover:bg-bg-panel-raised transition-colors"
            title="Center map on victim beacon"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={fitToTrail}
            className="p-1 rounded text-tactext-secondary hover:text-accent-cyan hover:bg-bg-panel-raised transition-colors"
            title="Fit view to movement trail"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
