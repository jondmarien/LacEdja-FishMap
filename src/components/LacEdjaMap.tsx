import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { logger } from '../lib/logger'

export interface MapMarker {
  id: string
  lat: number
  lng: number
  species: string
  date?: string
  time?: string
  length_cm?: number
  weight_kg?: number
  count?: number
  bait?: string
  reporter?: string
  photo_urls?: string[]
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// A teardrop map pin (tip at bottom-center) with a fish glyph.
const PIN_SVG = `
<svg width="30" height="40" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 20 12 20s12-11 12-20C24 5.37 18.63 0 12 0Z" fill="#16a34a" stroke="#ffffff" stroke-width="2"/>
  <path d="M16.5 11.8c-2.6-2.9-6.7-2.9-8.9-.6.7.6.7 1.7 0 2.3 2.2 2.3 6.3 2.3 8.9-.6l1.6 1.4v-3.9l-1.6 1.4Z" fill="#ffffff"/>
</svg>`

function popupHtml(marker: MapMarker): string {
  const stats: string[] = []
  if (marker.length_cm) stats.push(`${marker.length_cm} cm`)
  if (marker.weight_kg) stats.push(`${marker.weight_kg} kg`)
  if (marker.count && marker.count > 1) stats.push(`${marker.count} fish`)
  const when = [marker.date, marker.time].filter(Boolean).join(' · ')
  const photo = marker.photo_urls?.[0]
  const photoUrl = photo ? encodeURI(photo) : ''

  return `
    <div class="edja-popup">
      ${
        photoUrl
          ? `<a class="edja-popup-photo" href="${photoUrl}" target="_blank" rel="noopener noreferrer" title="Open photo">
               <img src="${photoUrl}" alt="${escapeHtml(marker.species || 'catch')} photo" loading="lazy" />
             </a>`
          : ''
      }
      <div class="edja-popup-title">${escapeHtml(marker.species || 'Catch')}</div>
      ${when ? `<div class="edja-popup-meta">${escapeHtml(when)}</div>` : ''}
      ${stats.length ? `<div class="edja-popup-stats">${escapeHtml(stats.join(' · '))}</div>` : ''}
      ${marker.bait ? `<div class="edja-popup-bait">on ${escapeHtml(marker.bait)}</div>` : ''}
      ${marker.reporter ? `<div class="edja-popup-by">by ${escapeHtml(marker.reporter)}</div>` : ''}
    </div>`
}

interface LacEdjaMapProps {
  center?: [number, number]
  zoom?: number
  onMapClick?: (lat: number, lng: number) => void
  onMarkerClick?: (id: string) => void
  markers?: MapMarker[]
  /** When true, enable 3D terrain (off by default). */
  terrain3d?: boolean
}

// Free, no-key global elevation tiles (AWS Open Data, Terrarium encoding).
const TERRAIN_SOURCE_ID = 'edja-terrarium'
const TERRAIN_TILES = ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png']

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
  onMarkerClick,
  markers = [],
  terrain3d = false,
}: LacEdjaMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markerRefs = useRef<maplibregl.Marker[]>([])
  const terrain3dRef = useRef(terrain3d)

  // Keep the latest handlers in refs so the init effect can run once without
  // tearing down and rebuilding the map on every parent re-render.
  const onMapClickRef = useRef(onMapClick)
  const onMarkerClickRef = useRef(onMarkerClick)
  useEffect(() => {
    onMapClickRef.current = onMapClick
    onMarkerClickRef.current = onMarkerClick
  }, [onMapClick, onMarkerClick])

  // Enable/disable 3D terrain. Tiles are only fetched while terrain is on.
  const applyTerrain = (on: boolean) => {
    const m = map.current
    if (!m || !m.isStyleLoaded() || !m.getSource(TERRAIN_SOURCE_ID)) return
    if (on) {
      m.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: 1.5 })
      m.setSky({
        'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 8, 0],
      })
      m.easeTo({ pitch: 65, duration: 800 })
    } else {
      m.setTerrain(null)
      m.easeTo({ pitch: 0, duration: 600 })
    }
  }

  useEffect(() => {
    terrain3dRef.current = terrain3d
    applyTerrain(terrain3d)
    // applyTerrain only reads refs/constants; safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrain3d])

  // Initialize the map exactly once.
  useEffect(() => {
    if (map.current || !mapContainer.current) return

    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: SATELLITE_STYLE,
        center,
        zoom,
        maxPitch: 85,
        attributionControl: { compact: true },
      })

      map.current.on('load', () => {
        logger.info('Map loaded successfully')
        // Add the elevation source up front (no tiles fetched until terrain is
        // enabled), then apply the current 3D state.
        if (!map.current!.getSource(TERRAIN_SOURCE_ID)) {
          map.current!.addSource(TERRAIN_SOURCE_ID, {
            type: 'raster-dem',
            tiles: TERRAIN_TILES,
            tileSize: 256,
            encoding: 'terrarium',
            maxzoom: 15,
            attribution: 'Elevation © AWS Open Data Terrain Tiles',
          })
        }
        applyTerrain(terrain3dRef.current)
      })

      map.current.on('error', (e) => {
        logger.error('Map error', { error: e.error?.message || 'Unknown map error' })
      })

      map.current.addControl(new maplibregl.NavigationControl(), 'top-right')

      // Optional "focus on me" — asks for permission and centers on the user.
      map.current.addControl(
        new maplibregl.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: true,
          showUserLocation: true,
        }),
        'top-right',
      )

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

  // Sync markers whenever the report list changes, and keep catches in frame.
  useEffect(() => {
    const m = map.current
    if (!m) return

    markerRefs.current.forEach((marker) => marker.remove())
    markerRefs.current = []

    const valid = markers.filter(
      (mk) => Number.isFinite(mk.lat) && Number.isFinite(mk.lng),
    )

    for (const marker of valid) {
      const el = document.createElement('div')
      el.className = 'edja-pin'
      el.innerHTML = PIN_SVG
      el.setAttribute('role', 'button')
      el.setAttribute('tabindex', '0')
      el.setAttribute('aria-label', `Catch: ${marker.species}`)

      // Hover preview (desktop) — a quick map-anchored peek.
      const popup = new maplibregl.Popup({
        offset: 30,
        closeButton: false,
        className: 'edja-popup-wrap',
      }).setHTML(popupHtml(marker))

      const placed = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([marker.lng, marker.lat])
        .setPopup(popup)
        .addTo(m)

      el.addEventListener('mouseenter', () => {
        if (!popup.isOpen()) placed.togglePopup()
      })
      el.addEventListener('mouseleave', () => {
        if (popup.isOpen()) popup.remove()
      })

      // Click/tap opens the full detail widget — and must NOT fall through to
      // the map's click handler (which would start a new report).
      el.addEventListener('click', (ev) => {
        ev.stopPropagation()
        if (popup.isOpen()) popup.remove()
        onMarkerClickRef.current?.(marker.id)
      })

      markerRefs.current.push(placed)
    }

    // Keep the lake AND the season's catches in frame (anchor on the lake so
    // the view never wanders off to a single far-away point).
    if (valid.length > 0) {
      const bounds = new maplibregl.LngLatBounds()
      bounds.extend(DEFAULT_CENTER)
      valid.forEach((mk) => bounds.extend([mk.lng, mk.lat]))
      m.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 600 })
    }
  }, [markers])

  return <div ref={mapContainer} className="h-full w-full" />
}
