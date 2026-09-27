import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { PLACES } from '../../data/places'
import type { Leg } from '../../lib/legs'
import type { Trip } from '../engine/trip'
import { useApp } from '../store'
import { OUT, RET, shortName } from './common'

// The flat fallback: a plain street map with the trip on it (light on battery, fine on any device).

maplibregl.setWorkerUrl(new URL(`${import.meta.env.BASE_URL}vendor/maplibre/maplibre-gl-worker.mjs`, window.location.href).href)

export default function Map2D({ trip, legs }: { trip: Trip | null; legs: Record<string, Leg> }) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markers = useRef<maplibregl.Marker[]>([])
  const day = useApp((s) => s.day)
  const set = useApp((s) => s.ui)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const m = new maplibregl.Map({ container: box.current!, style: 'https://tiles.openfreemap.org/styles/liberty', center: [8.5, 48.2], zoom: 4.6, attributionControl: { compact: true } })
    map.current = m
    m.on('load', () => {
      m.addSource('trip', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      m.addLayer({ id: 'trip-casing', type: 'line', source: 'trip', paint: { 'line-color': '#0b1020', 'line-width': ['case', ['get', 'sel'], 8, 5], 'line-opacity': 0.5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } })
      m.addLayer({ id: 'trip', type: 'line', source: 'trip', paint: { 'line-color': ['get', 'c'], 'line-width': ['case', ['get', 'sel'], 5, 3] }, layout: { 'line-cap': 'round', 'line-join': 'round' } })
      m.on('click', 'trip', (e) => {
        const n = e.features?.[0]?.properties?.n
        if (n) set({ day: Number(n), panel: 'day' })
      })
      setLoaded(true)
    })
    return () => m.remove()
  }, [set])

  useEffect(() => {
    const m = map.current
    if (!m || !trip || !loaded) return
    {
      const src = m.getSource('trip') as maplibregl.GeoJSONSource | undefined
      if (!src) return
      const features: GeoJSON.Feature[] = []
      const bounds = new maplibregl.LngLatBounds()
      for (const d of trip.days) {
        const coords: [number, number][] = []
        for (const s of d.segments) if (s.kind === 'drive' && legs[s.key!]) coords.push(...legs[s.key!].coords)
        if (coords.length < 2) continue
        if (day == null || day === d.n) for (const c of coords) bounds.extend(c)
        features.push({ type: 'Feature', properties: { n: d.n, c: d.dir === 'out' ? OUT : RET, sel: day === d.n }, geometry: { type: 'LineString', coordinates: coords } })
      }
      src.setData({ type: 'FeatureCollection', features })
      markers.current.forEach((x) => x.remove())
      markers.current = trip.days
        .filter((d) => d.kind === 'drive' && PLACES[d.sleep])
        .map((d) => {
          const el = document.createElement('button')
          el.className = `m2d-pin m2d-pin--${d.dir}`
          el.textContent = d.sleep === 'ljubljana' ? 'Slovenia' : shortName(d.sleep)
          el.onclick = () => set({ day: d.n, panel: 'day' })
          return new maplibregl.Marker({ element: el }).setLngLat([PLACES[d.sleep].lon, PLACES[d.sleep].lat]).addTo(m)
        })
      if (!bounds.isEmpty()) m.fitBounds(bounds, { padding: 60, duration: 800 })
    }
  }, [trip, legs, day, set, loaded])

  return <div className="map2d" ref={box} />
}
