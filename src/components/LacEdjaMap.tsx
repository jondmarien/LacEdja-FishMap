import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { logger } from '../lib/logger'

export interface MapMarker {
  id: string
  lat: number
  lng: number
  species: string
}

interface LacEdjaMapProps {
  center?: [number, number]
  zoom?: number
  onMapClick?: (lat: number, lng: number) => void
  markers?: MapMarker[]
}

// Esri World Imagery — free satellite basemap, no API key required.
const SATELLITE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    'esri-imagery': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    },
  },
  layers: [{ id: 'esri-imagery', type: 'raster', source: 'esri-imagery' }],
}

const DEFAULT_CENTER: [number, number] = [-76.01, 46.18]

export default function LacEdjaMap({
  center = DEFAULT_CENTER,
  zoom = 13,
  onMapClick,
  markers = [],
}: LacEdjaMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markerRefs = useRef<maplibregl.Marker[]>([])

  // Keep the latest click handler in a ref so the init effect can run once
  // without tearing down and rebuilding the map on every parent re-render.
  const onMapClickRef = useRef(onMapClick)
  useEffect(() => {
    onMapClickRef.current = onMapClick
  }, [onMapClick])

  // Initialize the map exactly once.
  useEffect(() => {
    if (map.current || !mapContainer.current) return

    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: SATELLITE_STYLE,
        center,
        zoom,
        attributionControl: { compact: true },
      })

      map.current.on('load', () => {
        logger.info('Map loaded successfully')
      })

      map.current.on('error', (e) => {
        logger.error('Map error', { error: e.error?.message || 'Unknown map error' })
      })

      map.current.addControl(new maplibregl.NavigationControl(), 'top-right')

      map.current.on('click', (e) => {
        const { lat, lng } = e.lngLat
        logger.debug('Map clicked', { lat, lng })
        onMapClickRef.current?.(lat, lng)
      })
    } catch (error) {
      logger.error('Failed to initialize map', { error: String(error) })
    }

    return () => {
      markerRefs.current.forEach((m) => m.remove())
      markerRefs.current = []
      map.current?.remove()
      map.current = null
    }
    // Intentionally run once: center/zoom are initial values and the click
    // handler is read through a ref, so the map is never rebuilt on re-render.
  }, [center, zoom])

  // Sync markers whenever the report list changes.
  useEffect(() => {
    if (!map.current) return

    markerRefs.current.forEach((m) => m.remove())
    markerRefs.current = []

    for (const marker of markers) {
      if (!Number.isFinite(marker.lat) || !Number.isFinite(marker.lng)) continue

      const el = document.createElement('div')
      el.className = 'edja-marker'
      el.title = marker.species
      el.setAttribute('aria-label', `Catch: ${marker.species}`)

      const m = new maplibregl.Marker({ element: el })
        .setLngLat([marker.lng, marker.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 16, closeButton: false }).setText(
            marker.species || 'Catch',
          ),
        )
        .addTo(map.current)

      markerRefs.current.push(m)
    }
  }, [markers])

  return <div ref={mapContainer} className="h-full w-full" />
}
