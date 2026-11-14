import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Layers,
  Crosshair,
  Maximize2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Plus,
  Minus,
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
  const [layersOpen, setLayersOpen] = useState<boolean>(false);
  const [showVictimMarker, setShowVictimMarker] = useState<boolean>(true);
  const [showTrail, setShowTrail] = useState<boolean>(true);
  const [showAccuracy, setShowAccuracy] = useState<boolean>(true);
  const [mapStyle, setMapStyle] = useState<'dark' | 'sat' | 'street'>('dark');

  // Fix Freshness State
  const isLive = latestGps && Date.now() / 1000 - latestGps.timestamp < 30;

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

  // Update Victim Marker and Accuracy Circle when GPS coordinates change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !latestGps) return;

    const latLng: [number, number] = [latestGps.latitude, latestGps.longitude];

    if (!markerRef.current) {
      // Create custom pulsing radar icon
      const customIcon = L.divIcon({
        className: 'custom-beacon-marker',
        html: `
          <div class="relative flex items-center justify-center w-8 h-8 pointer-events-none">
            <div class="absolute w-8 h-8 rounded-full ${isLive ? 'bg-[#48D8D0]/30 animate-ping' : 'bg-[#E6B84D]/30'}"></div>
            <div class="absolute w-5 h-5 rounded-full ${isLive ? 'bg-[#48D8D0]/50' : 'bg-[#E6B84D]/50'}"></div>
            <div class="w-3.5 h-3.5 rounded-full ${isLive ? 'bg-[#48D8D0] border-2 border-white' : 'bg-[#E6B84D] border-2 border-black'} shadow-lg z-20"></div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker(latLng, { icon: customIcon }).addTo(map);
      markerRef.current = marker;

      // Pan map smoothly to the initial GPS point
      map.panTo(latLng);
    } else {
      markerRef.current.setLatLng(latLng);

      // Update pulsing radar icon appearance based on freshness
      const customIcon = L.divIcon({
        className: 'custom-beacon-marker',
        html: `
          <div class="relative flex items-center justify-center w-8 h-8 pointer-events-none">
            <div class="absolute w-8 h-8 rounded-full ${isLive ? 'bg-[#48D8D0]/30 animate-ping' : 'bg-[#E6B84D]/30'}"></div>
            <div class="absolute w-5 h-5 rounded-full ${isLive ? 'bg-[#48D8D0]/50' : 'bg-[#E6B84D]/50'}"></div>
            <div class="w-3.5 h-3.5 rounded-full ${isLive ? 'bg-[#48D8D0] border-2 border-white' : 'bg-[#E6B84D] border-2 border-black'} shadow-lg z-20"></div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      markerRef.current.setIcon(customIcon);
    }

    // Update Accuracy Radius (HDOP * nominal 5m)
    if (accuracyCircleRef.current) {
      const radius = Math.max(10, (latestGps.hdop || 1.5) * 5);
      accuracyCircleRef.current.setLatLng(latLng);
      accuracyCircleRef.current.setRadius(radius);
    }
  }, [latestGps, isLive]);

  // Update Breadcrumb Polyline Trail
  useEffect(() => {
    if (!polylineRef.current) return;
    if (showTrail && gpsTrail.length > 1) {
      const latLngs: [number, number][] = gpsTrail.map((p) => [p.latitude, p.longitude]);
      polylineRef.current.setLatLngs(latLngs);
    } else {
      polylineRef.current.setLatLngs([]);
    }
  }, [gpsTrail, showTrail]);

  // Handle Layer Visibility Toggles
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (markerRef.current) {
      if (showVictimMarker && !map.hasLayer(markerRef.current)) {
        markerRef.current.addTo(map);
      } else if (!showVictimMarker && map.hasLayer(markerRef.current)) {
        map.removeLayer(markerRef.current);
      }
    }

    if (accuracyCircleRef.current) {
      if (showAccuracy && !map.hasLayer(accuracyCircleRef.current)) {
        accuracyCircleRef.current.addTo(map);
      } else if (!showAccuracy && map.hasLayer(accuracyCircleRef.current)) {
        map.removeLayer(accuracyCircleRef.current);
      }
    }
  }, [showVictimMarker, showAccuracy]);

  // Map Controls Helpers
  const handleRecenter = () => {
    if (!mapInstanceRef.current || !latestGps) return;
    mapInstanceRef.current.panTo([latestGps.latitude, latestGps.longitude]);
  };

  const handleFitTrail = () => {
    if (!mapInstanceRef.current || gpsTrail.length === 0) return;
    const bounds = L.latLngBounds(gpsTrail.map((p) => [p.latitude, p.longitude]));
    mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40] });
  };

  const handleZoomIn = () => {
    mapInstanceRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapInstanceRef.current?.zoomOut();
  };

  return (
    <div className="w-full h-full relative bg-[#080B0F] overflow-hidden isolate select-none">
      {/* Central Leaflet Map Container */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Floating Tactical Layers Panel (Upper Left, Compact, Overglass Style) */}
      <div className="absolute top-3 left-3 z-20 w-52 bg-[#0E151A]/95 border border-[#26343A] rounded shadow-xl backdrop-blur-md select-none font-mono text-xs">
        <div
          onClick={() => setLayersOpen(!layersOpen)}
          className="p-2 bg-[#10161B] border-b border-[#26343A] flex items-center justify-between cursor-pointer hover:text-[#48D8D0] transition-colors"
        >
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-[#E5ECF0]">
            <Layers className="w-3.5 h-3.5 text-[#48D8D0]" />
            TACTICAL LAYERS
          </span>
          {layersOpen ? <ChevronUp className="w-3.5 h-3.5 text-[#87949A]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#87949A]" />}
        </div>

        {layersOpen && (
          <div className="p-2.5 space-y-2 text-[11px]">
            <label className="flex items-center justify-between text-[#87949A] hover:text-[#E5ECF0] cursor-pointer">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#48D8D0]" />
                Victim Beacon
              </span>
              <input
                type="checkbox"
                checked={showVictimMarker}
                onChange={(e) => setShowVictimMarker(e.target.checked)}
                className="accent-[#48D8D0] rounded cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between text-[#87949A] hover:text-[#E5ECF0] cursor-pointer">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-0.5 bg-[#19A88F]" />
                Movement Trail
              </span>
              <input
                type="checkbox"
                checked={showTrail}
                onChange={(e) => setShowTrail(e.target.checked)}
                className="accent-[#48D8D0] rounded cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between text-[#87949A] hover:text-[#E5ECF0] cursor-pointer">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full border border-[#19A88F]" />
                Accuracy Radius
              </span>
              <input
                type="checkbox"
                checked={showAccuracy}
                onChange={(e) => setShowAccuracy(e.target.checked)}
                className="accent-[#48D8D0] rounded cursor-pointer"
              />
            </label>

            <div className="pt-2 border-t border-[#26343A] flex items-center justify-between text-[10px] text-[#58666B]">
              <span>Trail Points: <strong className="text-[#9CB3C9]">{gpsTrail.length}</strong></span>
              {gpsTrail.length > 0 && (
                <button
                  onClick={() => clearLocalHistory()}
                  className="hover:text-[#F06464] flex items-center gap-1 transition-colors"
                  title="Purge trail from map"
                >
                  <RotateCcw className="w-2.5 h-2.5" /> Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Floating Map Controls (Bottom Left, Overglass Segmented Switcher) */}
      <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1.5 font-mono text-[10px] select-none">
        {/* Style Switcher */}
        <div className="bg-[#0E151A]/95 border border-[#26343A] rounded p-0.5 flex items-center gap-0.5 backdrop-blur-md shadow-lg">
          {(['dark', 'sat', 'street'] as const).map((style) => (
            <button
              key={style}
              onClick={() => setMapStyle(style)}
              className={`px-2 py-0.5 rounded uppercase tracking-wider font-bold transition-colors ${
                mapStyle === style
                  ? 'bg-[#48D8D0]/20 text-[#48D8D0] border border-[#48D8D0]/40'
                  : 'text-[#87949A] hover:text-[#E5ECF0]'
              }`}
            >
              {style === 'dark' ? 'DARK' : style === 'sat' ? 'SAT' : 'MAP'}
            </button>
          ))}
        </div>

        {/* Tactical Actions (Zoom & Recenter) */}
        <div className="bg-[#0E151A]/95 border border-[#26343A] rounded p-0.5 flex items-center gap-0.5 backdrop-blur-md shadow-lg">
          <button
            onClick={handleZoomIn}
            className="p-1 rounded hover:bg-[#151D23] text-[#87949A] hover:text-[#48D8D0] transition-colors"
            title="Zoom In"
          >
            <Plus className="w-3 h-3" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-1 rounded hover:bg-[#151D23] text-[#87949A] hover:text-[#48D8D0] transition-colors"
            title="Zoom Out"
          >
            <Minus className="w-3 h-3" />
          </button>
          <div className="w-[1px] h-3 bg-[#26343A] my-auto" />
          <button
            onClick={handleRecenter}
            disabled={!latestGps}
            className="p-1 rounded hover:bg-[#151D23] text-[#87949A] hover:text-[#48D8D0] disabled:opacity-40 transition-colors"
            title="Recenter On Target Beacon"
          >
            <Crosshair className="w-3 h-3" />
          </button>
          <button
            onClick={handleFitTrail}
            disabled={gpsTrail.length === 0}
            className="p-1 rounded hover:bg-[#151D23] text-[#87949A] hover:text-[#48D8D0] disabled:opacity-40 transition-colors"
            title="Fit Entire Trail in View"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
