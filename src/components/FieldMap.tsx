"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { gibsTileUrl, type GibsLayer } from "@/data/gibs";
import { LOCATIONS } from "@/data/locations";

export type MapPoint = { lat: number; lon: number; name: string };

type Props = {
  /** Selected demo location id, or null when a custom point is selected. */
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** A point the farmer searched for or tapped. */
  customPoint: MapPoint | null;
  onMapClick: (lat: number, lon: number) => void;
  layer: GibsLayer | null;
};

function ClickHandler({ onMapClick }: { onMapClick: Props["onMapClick"] }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** Moves the map to the selected point. */
function Focus({ lat, lon, zoom }: { lat: number; lon: number; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) map.setView([lat, lon], Math.max(map.getZoom(), zoom));
    else map.flyTo([lat, lon], Math.max(map.getZoom(), zoom), { duration: 0.8 });
  }, [map, lat, lon, zoom]);
  return null;
}

export default function FieldMap({ selectedId, onSelect, customPoint, onMapClick, layer }: Props) {
  const demo = LOCATIONS.find((l) => l.id === selectedId);
  return (
    <MapContainer
      center={[-13.4, 28.3]}
      zoom={6}
      minZoom={5}
      maxZoom={12}
      scrollWheelZoom={false}
      className="h-full w-full cursor-crosshair"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {layer && (
        <TileLayer
          key={layer.id}
          url={gibsTileUrl(layer)}
          maxNativeZoom={layer.maxNativeZoom}
          opacity={0.7}
          attribution='Imagery: <a href="https://earthdata.nasa.gov/gibs">NASA GIBS</a>'
        />
      )}
      <ClickHandler onMapClick={onMapClick} />
      {customPoint && <Focus lat={customPoint.lat} lon={customPoint.lon} zoom={8} />}
      {demo && <Focus lat={demo.lat} lon={demo.lon} zoom={6} />}

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
                onSelect(loc.id);
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

      {customPoint && (
        <CircleMarker
          center={[customPoint.lat, customPoint.lon]}
          radius={11}
          pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#d99a1e", fillOpacity: 1 }}
          bubblingMouseEvents={false}
        >
          <Tooltip permanent direction="right" offset={[10, 0]}>
            {customPoint.name}
          </Tooltip>
        </CircleMarker>
      )}
    </MapContainer>
  );
}
