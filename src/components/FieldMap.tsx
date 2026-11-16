"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { gibsTileUrl, type GibsLayer } from "@/data/gibs";
import { LOCATIONS } from "@/data/locations";
import type { LatLon } from "@/lib/geo";
import { HLS_MAX_ZOOM, hlsTileUrl, type HlsImage } from "@/lib/hls";

export type MapPoint = { lat: number; lon: number; name: string };
export type BaseMap = "map" | "satellite";
/**
 * A request to move the map. `n` changes for every new request. `zoom` is a
 * minimum (the map never zooms out) unless `exact` is set.
 */
export type FocusRequest = { lat: number; lon: number; zoom: number; n: number; bounds?: LatLon[]; exact?: boolean };

type Props = {
  /** Selected demo location id, or null when a custom point is selected. */
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** A point the farmer searched for, typed, tapped or dragged. */
  customPoint: MapPoint | null;
  onMapClick: (lat: number, lon: number) => void;
  onPinMove: (lat: number, lon: number) => void;
  layer: GibsLayer | null;
  base: BaseMap;
  hls: HlsImage | null;
  focus: FocusRequest | null;
  /** While drawing, taps add corners to `draft` instead of moving the pin. */
  drawing: boolean;
  draft: LatLon[];
  field: LatLon[] | null;
};

function ClickHandler({ onMapClick }: { onMapClick: Props["onMapClick"] }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** Moves the map whenever a new focus request arrives. */
function Focus({ focus }: { focus: FocusRequest }) {
  const map = useMap();
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (focus.bounds && focus.bounds.length > 1) {
      const b = L.latLngBounds(focus.bounds.map((p) => [p.lat, p.lon] as [number, number]));
      const opts = { padding: [40, 40] as [number, number], maxZoom: focus.zoom };
      if (reduce) map.fitBounds(b, opts);
      else map.flyToBounds(b, { ...opts, duration: 1.5 });
      return;
    }
    const zoom = focus.exact ? focus.zoom : Math.max(map.getZoom(), focus.zoom);
    // A long zoom-in "from space" reads better when it takes a little longer.
    const duration = zoom - map.getZoom() > 6 ? 2.5 : 0.8;
    if (reduce) map.setView([focus.lat, focus.lon], zoom);
    else map.flyTo([focus.lat, focus.lon], zoom, { duration });
    // Only a new request (focus.n) should move the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, focus.n]);
  return null;
}

const PIN_HTML = `
<svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M17 43s15-14.6 15-26A15 15 0 0 0 2 17c0 11.4 15 26 15 26z" fill="#d99a1e" stroke="#ffffff" stroke-width="3"/>
  <circle cx="17" cy="17" r="5.5" fill="#ffffff"/>
</svg>`;

export default function FieldMap({
  selectedId,
  onSelect,
  customPoint,
  onMapClick,
  onPinMove,
  layer,
  base,
  hls,
  focus,
  drawing,
  draft,
  field,
}: Props) {
  const pinIcon = useMemo(
    () => L.divIcon({ html: PIN_HTML, className: "limeni-pin", iconSize: [34, 44], iconAnchor: [17, 43], tooltipAnchor: [14, -26] }),
    [],
  );
  const satellite = base === "satellite";
  const fieldColor = satellite ? "#ffd166" : "#1f6b3a";

  return (
    <MapContainer
      center={[-13.4, 28.3]}
      zoom={6}
      minZoom={5}
      maxZoom={19}
      scrollWheelZoom={false}
      className={`h-full w-full ${drawing ? "cursor-crosshair" : ""}`}
    >
      {satellite ? (
        <>
          <TileLayer
            key="sat"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxNativeZoom={17}
            maxZoom={19}
            attribution="Satellite imagery: Esri, Maxar, Earthstar Geographics"
          />
          <TileLayer
            key="sat-labels"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
            maxNativeZoom={17}
            maxZoom={19}
          />
        </>
      ) : (
        <TileLayer
          key="osm"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxNativeZoom={19}
          maxZoom={19}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
      )}
      {hls && (
        <TileLayer
          key={`${hls.source.layer}-${hls.date}`}
          url={hlsTileUrl(hls)}
          maxNativeZoom={HLS_MAX_ZOOM}
          maxZoom={19}
          attribution='NASA HLS imagery: <a href="https://earthdata.nasa.gov/gibs">NASA GIBS</a>'
        />
      )}
      {layer && (
        <TileLayer
          key={layer.id}
          url={gibsTileUrl(layer)}
          maxNativeZoom={layer.maxNativeZoom}
          maxZoom={19}
          opacity={0.7}
          attribution='Imagery: <a href="https://earthdata.nasa.gov/gibs">NASA GIBS</a>'
        />
      )}
      <ClickHandler onMapClick={onMapClick} />
      {focus && <Focus focus={focus} />}

      {LOCATIONS.map((loc) => {
        const selected = loc.id === selectedId;
        return (
          <CircleMarker
            key={loc.id}
            center={[loc.lat, loc.lon]}
            radius={selected ? 11 : 8}
            pathOptions={{ color: "#ffffff", weight: 2, fillColor: selected ? "#d99a1e" : "#1f6b3a", fillOpacity: 1 }}
            eventHandlers={{
              click: (e) => {
                e.originalEvent.stopPropagation();
                if (!drawing) onSelect(loc.id);
              },
            }}
            bubblingMouseEvents={false}
          >
            <Tooltip permanent direction="right" offset={[10, 0]}>
              {loc.name}
            </Tooltip>
          </CircleMarker>
        );
      })}

      {field && field.length >= 3 && (
        <Polygon
          positions={field.map((p) => [p.lat, p.lon] as [number, number])}
          pathOptions={{ color: fieldColor, weight: 3, fillColor: fieldColor, fillOpacity: 0.2 }}
          interactive={false}
        />
      )}

      {drawing && draft.length > 0 && (
        <>
          <Polyline
            positions={[...draft, ...(draft.length >= 3 ? [draft[0]] : [])].map((p) => [p.lat, p.lon] as [number, number])}
            pathOptions={{ color: "#ffd166", weight: 3, dashArray: "6 6" }}
            interactive={false}
          />
          {draft.map((p, i) => (
            <CircleMarker
              key={`${p.lat}-${p.lon}-${i}`}
              center={[p.lat, p.lon]}
              radius={6}
              pathOptions={{ color: "#1d1d1b", weight: 2, fillColor: "#ffd166", fillOpacity: 1 }}
              interactive={false}
            />
          ))}
        </>
      )}

      {customPoint && !drawing && (
        <Marker
          position={[customPoint.lat, customPoint.lon]}
          icon={pinIcon}
          draggable
          autoPan
          title="Your spot. Drag to move it."
          eventHandlers={{
            dragend: (e) => {
              const ll = (e.target as L.Marker).getLatLng();
              onPinMove(ll.lat, ll.lng);
            },
          }}
        >
          <Tooltip permanent direction="right">
            {customPoint.name}
          </Tooltip>
        </Marker>
      )}
    </MapContainer>
  );
}
