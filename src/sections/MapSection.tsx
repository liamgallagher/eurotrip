import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MLMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { AnimatePresence, motion } from 'motion/react'
import { useUi } from '../store'
import { useReducedMotion, type TripModel } from '../hooks'
import { TERRARIUM_URL } from '../lib/dem'
import { bearing, cumulative, pointAt, type LngLat } from '../lib/geo'
import { ALL_HIGHLIGHTS } from '../lib/scoring'
import { fastDist } from '../lib/geo'
import { CAT_COLOR, MayBadge, Photo, SectionHead } from '../ui/bits'
import { fmtDate, fmtH, fmtKm } from '../ui/format'
import { ElevationProfile } from './ElevationProfile'
import { OUT_COLOR, RET_COLOR } from '../ui/colors'
import type { DayStats } from '../lib/tripStats'

maplibregl.setWorkerUrl(new URL(`${import.meta.env.BASE_URL}vendor/maplibre/maplibre-gl-worker.mjs`, window.location.href).href)

const STYLE = (import.meta.env.VITE_MAP_STYLE as string | undefined) || 'https://tiles.openfreemap.org/styles/liberty'

const emptyFC = (): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features: [] })

function dayCoords(d: DayStats, model: TripModel): LngLat[] {
  const out: LngLat[] = []
  for (const s of d.day.segments) {
    if (s.kind !== 'drive') continue
    const leg = model.legStatus.legs[s.key]
    if (leg) out.push(...leg.coords)
  }
  return out
}

function gradient(color: string, p: number): maplibregl.ExpressionSpecification {
  if (p >= 0.999) return ['literal', color] as unknown as maplibregl.ExpressionSpecification
  const q = Math.max(0.0001, p)
  return ['step', ['line-progress'], color, q, 'rgba(0,0,0,0)'] as maplibregl.ExpressionSpecification
}

interface FlyStop {
  km: number
  id: string
}

export function MapSection({ model }: { model: TripModel }) {
  const { days, chargers } = model
  const reduced = useReducedMotion()
  const { day: selDay, setDay, hoverKm, setHoverKm } = useUi()
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const [ready, setReady] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const carRef = useRef<maplibregl.Marker | null>(null)
  const flyCarRef = useRef<maplibregl.Marker | null>(null)
  const animRef = useRef<number | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const [showChargers, setShowChargers] = useState(true)
  const [terrain, setTerrain] = useState(true)
  const [fly, setFly] = useState<{ running: boolean; paused: boolean; card: string | null; dayIdx: number } | null>(null)
  const [flySpeed, setFlySpeed] = useState(1)
  const flyRef = useRef({
    run: 0, dist: 0, coords: [] as LngLat[], cum: [] as number[], geomLen: 0, samplesKm: 0, stops: [] as FlyStop[], next: 0,
    pauseUntil: 0, last: 0, lastUi: 0, bearing: 0, cam: [0, 0] as LngLat, zoom: 11.3, zoomTarget: 11.3, lastZoom: 11.3,
    dayIdx: 0, paused: false, auto: true, speed: 1, cardShown: false,
  })

  const driveDays = useMemo(() => days.filter((d) => d.samples.length && d.day.kind !== 'ferry-arrival'), [days])
  const selected = selDay != null ? days.find((d) => d.day.n === selDay) ?? null : null

  const dirCoords = useMemo(() => {
    const out: LngLat[] = [], ret: LngLat[] = []
    for (const d of days) {
      const c = dayCoords(d, model)
      if (d.day.dir === 'out') out.push(...c)
      else if (d.day.dir === 'ret') ret.push(...c)
    }
    return { out, ret }
  }, [days, model])
  const routeSig = useMemo(() => `${dirCoords.out.length}:${dirCoords.ret.length}:${model.plan.days.map((d) => d.segments.map((s) => (s.kind === 'drive' ? s.key : 'x')).join(',')).join('|')}`, [dirCoords, model.plan])

  // ——— init map
  useEffect(() => {
    if (!box.current || mapRef.current) return
    let map: MLMap
    try {
      map = new maplibregl.Map({
        container: box.current,
        style: STYLE,
        center: [8.5, 48.2],
        zoom: 4.6,
        pitch: 40,
        maxPitch: 78,
        attributionControl: { compact: true },
        cooperativeGestures: matchMedia('(pointer: coarse)').matches,
      })
    } catch (e) {
      setMapError((e as Error).message)
      return
    }
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    map.addControl(new maplibregl.FullscreenControl(), 'top-right')
    map.on('error', (e) => console.warn('map error', e.error?.message))
    const zoomClass = () => box.current?.parentElement?.classList.toggle('z-low', map.getZoom() < 6)
    map.on('zoomend', zoomClass)
    zoomClass()
    map.on('load', () => {
      const firstSymbol = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id
      const dem = { type: 'raster-dem' as const, tiles: [TERRARIUM_URL], tileSize: 256, encoding: 'terrarium' as const, maxzoom: 14, attribution: '<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank">Terrain: AWS Terrain Tiles</a>' }
      map.addSource('dem', dem)
      map.addSource('dem-hs', dem)
      map.addLayer({ id: 'hillshade', type: 'hillshade', source: 'dem-hs', paint: { 'hillshade-exaggeration': 0.45, 'hillshade-shadow-color': '#5b4a36', 'hillshade-highlight-color': '#fffaf0' } }, firstSymbol)
      map.setTerrain({ source: 'dem', exaggeration: 1.35 })
      try {
        map.setSky({ 'sky-color': '#cfe3f3', 'horizon-color': '#f4ead8', 'fog-color': '#f4ead8', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.4 } as never)
      } catch { /* older style spec */ }
      for (const [id, color] of [['route-ret', RET_COLOR], ['route-out', OUT_COLOR]] as const) {
        map.addSource(id, { type: 'geojson', data: emptyFC(), lineMetrics: true })
        map.addLayer({ id: `${id}-casing`, type: 'line', source: id, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 4, 10, 9], 'line-opacity': 0.9, 'line-gradient': gradient('#ffffff', 0) } })
        map.addLayer({ id, type: 'line', source: id, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 2.2, 10, 5], 'line-gradient': gradient(color, 0) } })
      }
      map.addSource('day', { type: 'geojson', data: emptyFC() })
      map.addLayer({ id: 'day-glow', type: 'line', source: 'day', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#f2c14e', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 8, 10, 16], 'line-opacity': 0.85, 'line-blur': 1.5 } }, 'route-ret-casing')
      map.addSource('chargers', { type: 'geojson', data: emptyFC() })
      map.addLayer({
        id: 'chargers', type: 'circle', source: 'chargers',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, ['case', ['get', 'near'], 3.5, 1.5], 10, ['+', 5, ['/', ['coalesce', ['get', 'st'], 4], 3]]],
          'circle-color': ['case', ['get', 'stop'], '#e8384f', ['get', 'near'], '#cc0000', '#9a948a'],
          'circle-opacity': ['case', ['get', 'near'], 0.95, 0.45],
          'circle-stroke-color': '#fff', 'circle-stroke-width': ['case', ['get', 'near'], 1.5, 0.5],
        },
      })
      map.addSource('hover', { type: 'geojson', data: emptyFC() })
      map.addLayer({ id: 'hover', type: 'circle', source: 'hover', paint: { 'circle-radius': 7, 'circle-color': '#111', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 } })
      map.on('click', 'chargers', (e) => {
        const f = e.features?.[0]
        if (!f) return
        const p = f.properties as Record<string, string | number | boolean>
        new maplibregl.Popup({ closeButton: true, maxWidth: '260px' })
          .setLngLat((f.geometry as GeoJSON.Point).coordinates as LngLat)
          .setHTML(`<strong>⚡ ${p.n}</strong><br>${p.st ?? '?'} stalls · ${p.kw ?? '?'} kW${p.s !== 'OPEN' ? ` · ${String(p.s).toLowerCase()}` : ''}<br><small>supercharge.info</small>`)
          .addTo(map)
      })
      map.on('mouseenter', 'chargers', () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', 'chargers', () => (map.getCanvas().style.cursor = ''))
      setReady(true)
    })
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ——— route data + draw animation
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const mk = (c: LngLat[]): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features: c.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c } }] : [] })
    ;(map.getSource('route-out') as GeoJSONSource).setData(mk(dirCoords.out))
    ;(map.getSource('route-ret') as GeoJSONSource).setData(mk(dirCoords.ret))
    const all = [...dirCoords.out, ...dirCoords.ret]
    if (!all.length) return
    if (selDay == null) {
      const b = all.reduce((bb, c) => bb.extend(c), new maplibregl.LngLatBounds(all[0], all[0]))
      map.fitBounds(b, { padding: { top: 60, bottom: 60, left: 40, right: 40 }, duration: reduced ? 0 : 1200, pitch: 30 })
    }
    return drawAnimation(dirCoords)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSig, ready])

  const drawAnimation = useCallback(
    (dc: { out: LngLat[]; ret: LngLat[] }) => {
      const map = mapRef.current
      if (!map) return
      if (animRef.current) cancelAnimationFrame(animRef.current)
      const set = (id: string, color: string, p: number) => {
        map.setPaintProperty(id, 'line-gradient', gradient(color, p))
        map.setPaintProperty(`${id}-casing`, 'line-gradient', gradient('#ffffff', p))
      }
      if (reduced) {
        set('route-out', OUT_COLOR, 1)
        set('route-ret', RET_COLOR, 1)
        carRef.current?.remove()
        return
      }
      const car = carRef.current ?? new maplibregl.Marker({ element: carEl(), rotationAlignment: 'map', pitchAlignment: 'map' })
      carRef.current = car
      const cumO = cumulative(dc.out), cumR = cumulative(dc.ret)
      const T = 3200
      const t0 = performance.now()
      set('route-out', OUT_COLOR, 0)
      set('route-ret', RET_COLOR, 0)
      const tick = (now: number) => {
        const t = (now - t0) / T
        const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2)
        const po = Math.min(1, ease(Math.min(1, t)))
        const pr = Math.min(1, ease(Math.max(0, Math.min(1, t - 1))))
        set('route-out', OUT_COLOR, po)
        set('route-ret', RET_COLOR, pr)
        const [coords, cum, p] = t < 1 ? [dc.out, cumO, po] : [dc.ret, cumR, pr]
        if (coords.length > 1) {
          const L = cum[cum.length - 1]
          const a = pointAt(coords, cum, p * L)
          const b = pointAt(coords, cum, Math.min(L, p * L + 2000))
          car.setLngLat(a).setRotation(bearing(a, b))
          if (!car.getElement().isConnected) car.addTo(map)
        }
        if (t < 2) animRef.current = requestAnimationFrame(tick)
        else {
          animRef.current = null
          car.remove()
        }
      }
      animRef.current = requestAnimationFrame(tick)
      return () => {
        if (animRef.current) cancelAnimationFrame(animRef.current)
      }
    },
    [reduced],
  )

  // ——— chargers
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !chargers) return
    const nearIds = new Set<number>()
    const stopIds = new Set<number>()
    for (const d of days) {
      d.charging?.near.forEach((c) => nearIds.add(c.id))
      d.charging?.stops.forEach((s) => stopIds.add(s.charger.id))
    }
    ;(map.getSource('chargers') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: showChargers
        ? chargers.sites.filter((c) => c.s === 'OPEN' || c.s === 'EXPANDING').map((c) => ({ type: 'Feature', properties: { ...c, near: nearIds.has(c.id), stop: stopIds.has(c.id) }, geometry: { type: 'Point', coordinates: [c.lon, c.lat] } }))
        : [],
    })
  }, [chargers, days, ready, showChargers])

  // ——— overnight + highlight markers
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []
    const nightMarkers = new Map<string, { lat: number; lon: number; name: string; nights: number[]; dir: string }>()
    model.plan.nights.forEach((n, i) => {
      if (!n.place) return
      const e = nightMarkers.get(n.place.id)
      if (e) e.nights.push(i + 1)
      else nightMarkers.set(n.place.id, { lat: n.place.lat, lon: n.place.lon, name: n.place.name, nights: [i + 1], dir: n.kind })
    })
    for (const m of nightMarkers.values()) {
      const el = document.createElement('div')
      el.className = `mk-night mk-night--${m.dir}`
      el.innerHTML = `<span>${m.nights.length > 1 ? `${m.nights[0]}–${m.nights[m.nights.length - 1]}` : m.nights[0]}</span><em>${m.name.replace(/ \(.*\)/, '')}</em>`
      el.setAttribute('aria-label', `Night ${m.nights.join(', ')}: ${m.name}`)
      markersRef.current.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([m.lon, m.lat]).addTo(map))
    }
    const seen = new Set<string>()
    for (const d of model.plan.days) for (const h of d.highlights) {
      if (seen.has(h.id)) continue
      seen.add(h.id)
      const x = ALL_HIGHLIGHTS[h.id]
      if (!x) continue
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'mk-hl'
      el.style.setProperty('--c', CAT_COLOR[x.category])
      el.setAttribute('aria-label', x.name)
      el.title = x.name
      const popup = new maplibregl.Popup({ offset: 12, maxWidth: '280px' }).setHTML(
        `<div class="pop"><strong>${x.name}</strong><p>${x.desc}</p></div>`,
      )
      markersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat([x.lon, x.lat]).setPopup(popup).addTo(map))
    }
  }, [model.plan, ready])

  // ——— selected day
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const src = map.getSource('day') as GeoJSONSource
    if (!selected) {
      src.setData(emptyFC())
      return
    }
    const c = dayCoords(selected, model)
    src.setData({ type: 'FeatureCollection', features: c.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c } }] : [] })
    if (c.length > 1 && !fly?.running) {
      const b = c.reduce((bb, x) => bb.extend(x), new maplibregl.LngLatBounds(c[0], c[0]))
      map.fitBounds(b, { padding: { top: 80, bottom: 200, left: 40, right: 40 }, pitch: 50, duration: reduced ? 0 : 1400 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.day.n, ready, selected?.samples.length])

  // ——— hover sync (profile → map)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const src = map.getSource('hover') as GeoJSONSource
    if (hoverKm == null || !selected?.samples.length || fly?.running) {
      src.setData(emptyFC())
      return
    }
    const s = selected.samples.reduce((a, b) => (Math.abs(b.km - hoverKm) < Math.abs(a.km - hoverKm) ? b : a))
    src.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [s.lon, s.lat] } }] })
  }, [hoverKm, selected, ready, fly?.running])

  // map → profile hover
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !selected?.samples.length) return
    const onMove = (e: maplibregl.MapMouseEvent) => {
      const p: LngLat = [e.lngLat.lng, e.lngLat.lat]
      let best = Infinity, km = 0
      for (const s of selected.samples) {
        const d = fastDist([s.lon, s.lat], p)
        if (d < best) { best = d; km = s.km }
      }
      const mpp = (40075016 * Math.cos((p[1] * Math.PI) / 180)) / (512 * 2 ** map.getZoom())
      if (best < mpp * 14) setHoverKm(km)
    }
    map.on('mousemove', onMove)
    return () => {
      map.off('mousemove', onMove)
    }
  }, [selected, ready, setHoverKm])

  // terrain toggle
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.setTerrain(terrain ? { source: 'dem', exaggeration: 1.35 } : null)
  }, [terrain, ready])

  // ——— fly-through
  // The camera follows the actual road geometry (not the 500 m profile samples), eases its centre and
  // heading, and leaves zoom and tilt to you: pinch, scroll, the +/− buttons or the map controls all work.
  const startFly = (dayIdx: number) => {
    const d = driveDays[dayIdx]
    const map = mapRef.current
    if (!d || !map) return
    setDay(d.day.n)
    const coords = dayCoords(d, model)
    if (coords.length < 2) return
    const cum = cumulative(coords)
    const geomLen = cum[cum.length - 1]
    const stops: FlyStop[] = []
    for (const h of d.day.highlights) {
      const x = ALL_HIGHLIGHTS[h.id]
      if (!x) continue
      let best = Infinity, at = 0
      for (let i = 0; i < coords.length; i += 2) {
        const dd = fastDist(coords[i], [x.lon, x.lat])
        if (dd < best) { best = dd; at = cum[i] }
      }
      if (best < 6000) stops.push({ km: at, id: x.id })
    }
    stops.sort((a, b) => a.km - b.km)
    const f = flyRef.current
    const run = ++f.run
    const start = coords[0]
    Object.assign(f, {
      dist: 0, coords, cum, geomLen, samplesKm: d.samples[d.samples.length - 1].km, stops, next: 0, pauseUntil: 0,
      last: performance.now(), lastUi: 0, dayIdx, paused: false,
      bearing: bearing(start, pointAt(coords, cum, 1500)), cam: start, zoom: 11.3, zoomTarget: 11.3,
    })
    setFly({ running: true, paused: false, card: null, dayIdx })
    if (reduced) {
      // no continuous camera motion: step between highlights instead
      jumpToDist(stops[0]?.km ?? 0)
      setFly({ running: true, paused: true, card: stops[0]?.id ?? null, dayIdx })
      return
    }
    map.dragPan.disable()
    // stop the route-drawing animation so the two don't fight over the view
    if (animRef.current) cancelAnimationFrame(animRef.current)
    animRef.current = null
    carRef.current?.remove()
    for (const [id, color] of [['route-out', OUT_COLOR], ['route-ret', RET_COLOR]] as const) {
      map.setPaintProperty(id, 'line-gradient', gradient(color, 1))
      map.setPaintProperty(`${id}-casing`, 'line-gradient', gradient('#ffffff', 1))
    }
    const car = flyCarRef.current ?? new maplibregl.Marker({ element: carEl(), rotationAlignment: 'map', pitchAlignment: 'map' })
    flyCarRef.current = car
    car.setLngLat(start).addTo(map)
    map.flyTo({ center: start, zoom: f.zoom, pitch: 62, bearing: f.bearing, duration: 1400, essential: true })
    map.once('moveend', () => {
      if (flyRef.current.run !== run) return
      f.last = performance.now()
      f.lastZoom = map.getZoom()
      requestAnimationFrame((t) => flyTick(t, run))
    })
  }
  const jumpToDist = (dist: number) => {
    const map = mapRef.current!
    const f = flyRef.current
    const p = pointAt(f.coords, f.cum, dist)
    map.jumpTo({ center: p, zoom: 11.5, pitch: 60 })
    setHoverKm((dist / (f.geomLen || 1)) * f.samplesKm)
  }
  const flyTick = (now: number, run: number) => {
    const f = flyRef.current
    const map = mapRef.current
    const d = driveDays[f.dayIdx]
    if (!map || !d || f.run !== run) return
    const dt = Math.min(0.05, (now - f.last) / 1000)
    f.last = now
    const next = () => requestAnimationFrame((t) => flyTick(t, run))
    if (f.paused || now < f.pauseUntil) return next()
    if (f.cardShown) {
      f.cardShown = false
      setFly((s) => (s && s.card ? { ...s, card: null } : s))
    }
    const mps = Math.max(4000, f.geomLen / 50) * f.speed
    f.dist = Math.min(f.geomLen, f.dist + mps * dt)
    const pos = pointAt(f.coords, f.cum, f.dist)
    const ahead = pointAt(f.coords, f.cum, Math.min(f.geomLen, f.dist + 1800))
    const targetB = f.dist >= f.geomLen - 5 ? f.bearing : bearing(pos, ahead)
    const diff = ((targetB - f.bearing + 540) % 360) - 180
    f.bearing = (f.bearing + diff * Math.min(1, dt * 1.4) + 360) % 360
    // ease the camera centre towards the car so small geometry kinks never jolt the view
    const k = Math.min(1, dt * 6)
    f.cam = [f.cam[0] + (pos[0] - f.cam[0]) * k, f.cam[1] + (pos[1] - f.cam[1]) * k]
    flyCarRef.current?.setLngLat(pos).setRotation(bearing(pos, pointAt(f.coords, f.cum, Math.min(f.geomLen, f.dist + 300))))
    if (!map.isZooming()) {
      // respect zoom changes made by pinch / scroll / map buttons since the last frame
      const z = map.getZoom()
      if (Math.abs(z - f.lastZoom) > 0.005) f.zoom = f.zoomTarget = z
      f.zoom += (f.zoomTarget - f.zoom) * Math.min(1, dt * 5)
      map.jumpTo({ center: f.cam, bearing: f.bearing, zoom: f.zoom })
      f.lastZoom = map.getZoom()
    }
    if (now - f.lastUi > 250) {
      f.lastUi = now
      useUi.getState().setHoverKm((f.dist / (f.geomLen || 1)) * f.samplesKm)
    }
    const nx = f.stops[f.next]
    if (nx && f.dist >= nx.km) {
      f.next++
      f.pauseUntil = now + 3600
      f.cardShown = true
      setFly((s) => (s ? { ...s, card: nx.id } : s))
    }
    if (f.dist >= f.geomLen) {
      const nextDay = f.dayIdx + 1
      if (f.auto && nextDay < driveDays.length) setTimeout(() => flyRef.current.run === run && startFly(nextDay), 900)
      else endFly()
      return
    }
    if (useUi.getState().day !== d.day.n) return endFly()
    next()
  }
  const endFly = () => {
    flyRef.current.run++
    flyCarRef.current?.remove()
    mapRef.current?.dragPan.enable()
    setFly(null)
  }
  const stopFly = endFly
  const togglePause = () => {
    flyRef.current.paused = !flyRef.current.paused
    setFly((s) => (s ? { ...s, paused: flyRef.current.paused } : s))
  }
  const zoomBy = (dz: number) => {
    const f = flyRef.current
    f.zoomTarget = Math.max(6, Math.min(15, f.zoomTarget + dz))
  }
  const setSpeed = (v: number) => {
    flyRef.current.speed = v
    setFlySpeed(v)
  }
  const stepHighlight = (dir: 1 | -1) => {
    const f = flyRef.current
    const n = Math.max(0, Math.min(f.stops.length - 1, f.next + dir))
    f.next = n
    const st = f.stops[n]
    if (st) {
      jumpToDist(st.km)
      setFly((s) => (s ? { ...s, card: st.id } : s))
    }
  }

  const selIdx = selected ? driveDays.indexOf(selected) : -1
  const color = selected?.day.dir === 'ret' ? RET_COLOR : OUT_COLOR
  const card = fly?.card ? ALL_HIGHLIGHTS[fly.card] : null

  return (
    <section className="mapsec" id="map" aria-labelledby="map-title">
      <div className="wrap">
        <SectionHead kicker="Step 3 · See it" title="The map" id="map-title">
          <p>
            3D terrain with every leg drawn on the real road geometry: <span className="dir dir--out">outbound</span> <span className="dir dir--ret">return</span>. Superchargers near the route are in red. Pick a day to see its elevation profile, or fly it.
          </p>
        </SectionHead>
      </div>
      <div className="mapbox">
        <div ref={box} className="map" aria-label="Interactive map of the trip" role="region" />
        {mapError && <p className="map__error">Map could not start (WebGL unavailable?): {mapError}</p>}
        <div className="map__panel">
          <div className="daychips" role="tablist" aria-label="Choose a day">
            <button type="button" role="tab" aria-selected={selDay == null} className={selDay == null ? 'is-on' : ''} onClick={() => { stopFly(); setDay(null) }}>
              Whole trip
            </button>
            {driveDays.map((d) => (
              <button key={d.day.n} type="button" role="tab" aria-selected={selDay === d.day.n} className={`dc dc--${d.day.dir} ${selDay === d.day.n ? 'is-on' : ''}`} onClick={() => { stopFly(); setDay(d.day.n) }} title={`${fmtDate(d.day.date)} · ${d.day.from.name} → ${d.day.to.name}`}>
                D{d.day.n}
              </button>
            ))}
          </div>
          <div className="map__tools">
            <button type="button" className="btn btn--small" onClick={() => drawAnimation(dirCoords)} disabled={reduced} title={reduced ? 'Animation off: reduced motion' : undefined}>
              ↻ Redraw route
            </button>
            {!fly ? (
              <button type="button" className="btn btn--small btn--primary" onClick={() => startFly(selIdx >= 0 ? selIdx : 0)} disabled={!driveDays.length}>
                ▶ {reduced ? 'Step through' : 'Fly'} {selIdx >= 0 ? `day ${selected!.day.n}` : 'the trip'}
              </button>
            ) : (
              <>
                {reduced ? (
                  <>
                    <button type="button" className="btn btn--small" onClick={() => stepHighlight(-1)}>‹ Prev</button>
                    <button type="button" className="btn btn--small" onClick={() => stepHighlight(1)}>Next ›</button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn btn--small" onClick={togglePause}>{fly.paused ? '▶ Resume' : '❚❚ Pause'}</button>
                    <span className="seg seg--small seg--tight" role="group" aria-label="Zoom while flying">
                      <button type="button" onClick={() => zoomBy(-1)} aria-label="Zoom out">−</button>
                      <button type="button" onClick={() => zoomBy(1)} aria-label="Zoom in">+</button>
                    </span>
                    <span className="seg seg--small seg--tight" role="radiogroup" aria-label="Fly-through speed">
                      {[0.5, 1, 2].map((v) => (
                        <button key={v} type="button" role="radio" aria-checked={flySpeed === v} className={flySpeed === v ? 'is-on' : ''} onClick={() => setSpeed(v)}>
                          {v}×
                        </button>
                      ))}
                    </span>
                  </>
                )}
                <button type="button" className="btn btn--small" onClick={stopFly}>■ Stop</button>
              </>
            )}
            <label className="toggle"><input type="checkbox" checked={showChargers} onChange={(e) => setShowChargers(e.target.checked)} /> Superchargers</label>
            <label className="toggle"><input type="checkbox" checked={terrain} onChange={(e) => setTerrain(e.target.checked)} /> 3D terrain</label>
          </div>
        </div>

        <AnimatePresence>
          {card && (
            <motion.aside key={card.id} className="flycard" initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} aria-live="polite">
              <Photo id={card.id} alt={card.name} category={card.category} sizes="300px" />
              <div className="flycard__body">
                <h3>{card.name}</h3>
                <p>{card.desc}</p>
                <MayBadge may={card.may} title={card.mayNote} />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {selected && selected.samples.length > 0 && (
          <div className="map__profile">
            <div className="map__profile-head">
              <strong>
                Day {selected.day.n} · {fmtDate(selected.day.date)} · {selected.day.from.name} → {selected.day.to.name}
              </strong>
              <span>
                {fmtKm(selected.km)} · {fmtH(selected.driveH)} · ▲ {selected.ascent.toLocaleString()} m · top {Math.round(selected.maxEle).toLocaleString()} m
              </span>
            </div>
            <ElevationProfile
              samples={selected.samples}
              hoverKm={hoverKm}
              onHover={setHoverKm}
              color={color}
              stops={selected.charging?.stops ?? []}
              title={`Day ${selected.day.n}`}
              height={130}
              marks={selected.day.highlights.flatMap((h) => {
                const x = ALL_HIGHLIGHTS[h.id]
                if (!x) return []
                let best = Infinity, km = 0
                for (const s of selected.samples) {
                  const dd = fastDist([s.lon, s.lat], [x.lon, x.lat])
                  if (dd < best) { best = dd; km = s.km }
                }
                return best < 6000 ? [{ km, label: x.name }] : []
              })}
            />
          </div>
        )}
      </div>
    </section>
  )
}

function carEl(): HTMLElement {
  const el = document.createElement('div')
  el.className = 'car'
  el.innerHTML = `<svg width="22" height="34" viewBox="0 0 22 34" aria-hidden="true"><rect x="2" y="2" width="18" height="30" rx="8" fill="#e8384f" stroke="#fff" stroke-width="2"/><rect x="5" y="7" width="12" height="7" rx="3" fill="#1b1a17" opacity=".85"/><rect x="5" y="21" width="12" height="6" rx="3" fill="#1b1a17" opacity=".7"/></svg>`
  return el
}
