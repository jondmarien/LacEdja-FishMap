import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

interface LacEdjaMapProps {
  center?: [number, number];
  zoom?: number;
}

export default function LacEdjaMap({
  center = [-76.01, 46.18],
  zoom = 13,
}: LacEdjaMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center,
      zoom,
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [center, zoom]);

  return (
    <div
      ref={mapContainer}
      className="w-full h-[70vh] rounded-2xl overflow-hidden border border-white/10"
    />
  );
}
