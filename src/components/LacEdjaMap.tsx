import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { logger } from '../lib/logger';

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

    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: 'https://demotiles.maplibre.org/style.json',
        center,
        zoom,
        attributionControl: false,
      });

      map.current.on('load', () => {
        logger.info('Map loaded successfully');
      });

      map.current.on('error', (e) => {
        logger.error('Map error', { error: e.error?.message || 'Unknown map error' });
      });

      map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

      if (onMapClick) {
        map.current.on('click', (e) => {
          const { lat, lng } = e.lngLat;
          logger.debug('Map clicked', { lat, lng });
          onMapClick(lat, lng);
        });
      }
    } catch (error) {
      logger.error('Failed to initialize map', { error: String(error) });
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
