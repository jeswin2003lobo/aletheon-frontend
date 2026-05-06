import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApiData } from '../hooks/useApiData';
import { getMapMeters, getMapFeeders } from '../api/client';
import { ErrorState } from '../components/ErrorState';
import { getPriorityColor, getBandColor, truncateHash, displayValue } from '../utils/formatters';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

function MapResizer() {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100);
  }, [map]);
  return null;
}

export default function MapView() {
  const [searchParams] = useSearchParams();
  const highlightMeter = searchParams.get('meter');
  const [zoneFilter, setZoneFilter] = useState('');
  const [localityFilter, setLocalityFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [showMeters, setShowMeters] = useState(true);
  const [showFeeders, setShowFeeders] = useState(true);

  const { data: meters, loading: mLoading, error: mError, retry: mRetry } = useApiData(getMapMeters);
  const { data: feeders, loading: fLoading, error: fError, retry: fRetry } = useApiData(getMapFeeders);

  // Derive filter options from data
  const zones = useMemo(() => meters ? [...new Set(meters.map(m => m.zone).filter(Boolean))] : [], [meters]);
  const localities = useMemo(() => meters ? [...new Set(meters.map(m => m.locality).filter(Boolean))] : [], [meters]);

  // Filter meters
  const filteredMeters = useMemo(() => {
    if (!meters) return [];
    return meters.filter(m => {
      if (zoneFilter && m.zone !== zoneFilter) return false;
      if (localityFilter && m.locality !== localityFilter) return false;
      if (priorityFilter && m.priority !== priorityFilter) return false;
      return true;
    });
  }, [meters, zoneFilter, localityFilter, priorityFilter]);

  const p1Count = filteredMeters.filter(m => m.priority === 'P1').length;
  const redFeeders = feeders ? feeders.filter(f => f.grid_risk_band === 'RED').length : 0;

  const loading = mLoading || fLoading;
  const error = mError || fError;

  return (
    <div className="h-[calc(100vh-112px)] md:h-[calc(100vh-112px)] relative animate-fadeIn" data-testid="map-view">
      {error && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-[#000000]/80">
          <ErrorState message={error} onRetry={mError ? mRetry : fRetry} />
        </div>
      )}

      {/* Overlay Controls */}
      <div className="absolute top-3 left-3 md:top-4 md:left-4 z-[1000] space-y-2" data-testid="map-controls">
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] p-2 md:p-3 space-y-2">
          <select
            value={zoneFilter}
            onChange={(e) => setZoneFilter(e.target.value)}
            className="block w-full bg-[#000000] border border-[#1A1A1A] text-xs text-[#FAFAFA] px-2 py-1 outline-none"
          >
            <option value="">All Zones</option>
            {zones.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
          <select
            value={localityFilter}
            onChange={(e) => setLocalityFilter(e.target.value)}
            className="block w-full bg-[#000000] border border-[#1A1A1A] text-xs text-[#FAFAFA] px-2 py-1 outline-none"
          >
            <option value="">All Localities</option>
            {localities.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="block w-full bg-[#000000] border border-[#1A1A1A] text-xs text-[#FAFAFA] px-2 py-1 outline-none"
          >
            <option value="">All Priority</option>
            <option value="P1">P1</option>
            <option value="P2">P2</option>
            <option value="P3">P3</option>
          </select>
          <div className="flex gap-3 pt-1 text-xs text-[#737373]">
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={showMeters} onChange={(e) => setShowMeters(e.target.checked)} className="accent-white w-3 h-3" />
              Meters
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={showFeeders} onChange={(e) => setShowFeeders(e.target.checked)} className="accent-white w-3 h-3" />
              Feeders
            </label>
          </div>
        </div>
      </div>

      {/* Bottom Stats */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-[#000000]/80 border border-[#1A1A1A] px-4 py-2 text-xs text-white font-mono">
        {filteredMeters.length} meters &middot; {p1Count} P1 alerts &middot; {redFeeders} RED feeders
      </div>

      {/* Map */}
      {loading ? (
        <div className="h-full bg-[#0A0A0A] flex items-center justify-center">
          <div className="animate-pulse text-[#525252] text-sm">Loading map data...</div>
        </div>
      ) : (
        <MapContainer
          center={[12.97, 77.59]}
          zoom={12}
          className="h-full w-full"
          style={{ background: '#000000' }}
          zoomControl={false}
        >
          <MapResizer />
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          />

          {/* Meter markers */}
          {showMeters && filteredMeters.map((m, i) => {
            if (!m.latitude_grid || !m.longitude_grid) return null;
            const color = getPriorityColor(m.priority);
            const radius = m.priority === 'P1' ? 7 : m.priority === 'P2' ? 6 : m.priority === 'P3' ? 5 : 3;
            const isHighlighted = highlightMeter && m.meter_id_hash === highlightMeter;
            return (
              <CircleMarker
                key={`m-${i}`}
                center={[m.latitude_grid, m.longitude_grid]}
                radius={isHighlighted ? 10 : radius}
                pathOptions={{
                  color: isHighlighted ? '#FFFFFF' : color,
                  fillColor: color,
                  fillOpacity: 0.7,
                  weight: isHighlighted ? 2 : 1,
                }}
              >
                <Popup>
                  <div className="text-xs space-y-1 text-[#FAFAFA]">
                    <p className="font-mono font-bold">{truncateHash(m.meter_id_hash, 12)}</p>
                    <p>Priority: {m.priority || 'None'}</p>
                    <p>Risk: {displayValue(m.risk_score)}</p>
                    <p>Locality: {displayValue(m.locality)}</p>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

          {/* Feeder markers */}
          {showFeeders && feeders && feeders.map((f, i) => {
            if (!f.latitude_grid || !f.longitude_grid) return null;
            const color = getBandColor(f.grid_risk_band);
            return (
              <CircleMarker
                key={`f-${i}`}
                center={[f.latitude_grid, f.longitude_grid]}
                radius={9}
                pathOptions={{
                  color: color,
                  fillColor: color,
                  fillOpacity: 0.5,
                  weight: 2,
                }}
              >
                <Popup>
                  <div className="text-xs space-y-1 text-[#FAFAFA]">
                    <p className="font-mono font-bold">{truncateHash(f.feeder_id_hash, 12)}</p>
                    <p>Band: {f.grid_risk_band}</p>
                    <p>Peak: {f.peak_load_pct ? `${f.peak_load_pct}%` : '\u2014'}</p>
                    <p>Locality: {displayValue(f.locality)}</p>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      )}
    </div>
  );
}
