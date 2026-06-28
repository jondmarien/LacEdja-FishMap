import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

interface LacEdjaMapProps {
  center?: [number, number];
  zoom?: number;
  onMapClick?: (lat: number, lng: number) => void;
}

export default function LacEdjaMap({
  center = [-76.01, 46.18],
  zoom = 13,
  onMapClick,
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
      attributionControl: false,
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    if (onMapClick) {
      map.current.on('click', (e) => {
        const { lat, lng } = e.lngLat;
        onMapClick(lat, lng);
      });
    }

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [center, zoom, onMapClick]);

  return (
    <div 
      ref={mapContainer} 
      className="w-full h-full min-h-[620px]"
    />
  );
}
