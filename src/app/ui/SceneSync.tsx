import { useEffect, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { PLACES } from '../../data/places'
import { CROSSINGS } from '../../data/costs'
import { ALL_HIGHLIGHTS } from '../../lib/scoring'
import type { Leg } from '../../lib/legs'
import type { DayStats } from '../../lib/tripStats'
import { useDio, viewFor } from './Stage'
import { legPoints, straightPoints } from '../scene/tracks'
import type { Track, TrackPoint } from '../scene/ribbons'
import { localDate } from '../scene/sun'
import { arrivalMin, dayLegKey, type DayEval } from '../engine/planner'
import type { Trip, TripOption } from '../engine/trip'
import { useApp } from '../store'
import { GOLD, OPTION_COLORS, OUT, RET, useSuggestions } from './common'
import type { Planner } from '../engine/planner'

// Keeps the diorama in step with the plan: ribbons, pass gates, the sun and the camera.

interface Props {
  pl: Planner | null
  trip: Trip | null
  legs: Record<string, Leg>
  stats: DayStats[] | null
  options: TripOption[] | null
  optionLegs: Record<string, Leg>
  driven?: (lon: number, lat: number) => boolean
  drivenVersion?: number
}

const OVERVIEW = { lon: 7.4, lat: 47.6, dist: 2350, tilt: 36, heading: 0 }

function dayPoints(e: DayEval, legs: Record<string, Leg>, heightAt: (lon: number, lat: number) => number, stats?: DayStats | null, driven?: Props['driven']): TrackPoint[] {
  const { key, waypoints } = dayLegKey(e)
  const leg = legs[key]
  return leg ? legPoints([leg], stats, driven) : straightPoints(waypoints, heightAt)
}

export function SceneSync({ pl, trip, legs, stats, options, optionLegs, driven, drivenVersion }: Props) {
  const dio = useDio()
  const ui = useApp(useShallow((s) => ({ panel: s.panel, day: s.day, cand: s.cand, focusCand: s.focusCand, hoverOption: s.hoverOption, ribbon: s.ribbon, sunMin: s.sunMin, settings: s.plan.settings, startDate: s.plan.startDate })))
  const sugg = useSuggestions(pl)
  const heightAt = (lon: number, lat: number) => dio?.heightAt(lon, lat) ?? 0

  // ——— ribbons
  const tracks = useMemo<Track[]>(() => {
    if (!dio) return []
    const out: Track[] = []
    if (ui.panel === 'options' && options?.length) {
      options.forEach((o, i) => {
        const hot = !ui.hoverOption || ui.hoverOption === o.id
        let off = 0
        for (const p of [o.out, o.ret]) {
          for (const e of p.days) {
            const pts = dayPoints(e, optionLegs, heightAt)
            out.push({ id: `o${i}:${e.dir}:${e.from}>${e.to}`, points: pts, color: OPTION_COLORS[i], width: hot ? 4.5 : 2.5, opacity: hot ? 1 : 0.35, kmOffset: off })
            off += pts[pts.length - 1]?.km ?? 0
          }
        }
      })
      return out
    }
    if (!trip) return out
    let off = 0
    for (const d of trip.days) {
      if (d.kind === 'base' || d.kind === 'rest') continue
      const segs: Leg[] = []
      const pts: TrackPoint[] = []
      let pending = false
      for (const s of d.segments) {
        if (s.kind === 'drive') {
          const leg = legs[s.key!]
          if (leg) segs.push(leg)
          else pending = true
        }
      }
      if (!pending) pts.push(...legPoints(segs, stats?.[d.n - 1], driven))
      else for (const s of d.segments) if (s.kind === 'drive') {
        const base = pts.length ? pts[pts.length - 1].km : 0
        for (const p of straightPoints(s.waypoints!, heightAt)) pts.push({ ...p, km: p.km + base })
      }
      if (pts.length < 2) continue
      const sel = ui.day === d.n
      const dim = ui.day != null && !sel
      out.push({ id: `d${d.n}`, points: pts, color: d.dir === 'out' ? OUT : RET, width: sel ? 6 : 3.6, opacity: dim ? 0.45 : 1, kmOffset: off })
      // the Channel crossing as a dashed hop
      const x = d.segments.find((s) => s.kind === 'crossing')?.crossing
      if (x) {
        const a = PLACES[x.from], b = PLACES[x.to]
        const [p, q] = d.dir === 'out' ? [a, b] : [b, a]
        out.push({ id: `x${d.n}`, points: straightPoints([p, q], () => 0).map((t) => ({ ...t, ele: 0 })), color: d.dir === 'out' ? OUT : RET, width: 2.5, opacity: 0.8, kmOffset: off })
      }
      off += pts[pts.length - 1].km
    }
    // preview of a candidate stop: the two days it would change, dashed until chosen
    if (ui.panel === 'candidates' && sugg && ui.focusCand && ui.cand) {
      const s = sugg.list.find((x) => x.place === ui.focusCand)
      if (s) {
        const days = s.completion.days.slice(ui.cand.slot, ui.cand.slot + 2)
        days.forEach((e, i) => {
          const { key, waypoints } = dayLegKey(e)
          const leg = legs[key] ?? optionLegs[key]
          const pts = leg ? legPoints([leg]).map((p) => ({ ...p, tunnel: true })) : straightPoints(waypoints, heightAt)
          out.push({ id: `c${i}:${key}`, points: pts, color: '#ffffff', width: 5, opacity: 0.95 })
        })
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dio, trip, legs, stats, options, optionLegs, ui.panel, ui.day, ui.hoverOption, ui.focusCand, ui.cand, sugg, drivenVersion])

  useEffect(() => {
    dio?.ready.then(() => dio.setTracks(tracks))
  }, [dio, tracks])

  useEffect(() => {
    dio?.setRibbonMode(ui.ribbon)
  }, [dio, ui.ribbon])

  // a glow runs along the day you pick
  useEffect(() => {
    if (!dio || ui.day == null) return
    const t = tracks.find((x) => x.id === `d${ui.day}`)
    if (!t || t.points.length < 2) return
    const a = t.kmOffset ?? 0
    const id = setTimeout(() => dio.sweep(a, a + t.points[t.points.length - 1].km, 2600), 1500)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dio, ui.day])

  // ——— pass gates: every Alpine pass we know, lit by its usual May status
  useEffect(() => {
    if (!dio) return
    dio.ready.then(() =>
      dio.setGates(
        Object.values(ALL_HIGHLIGHTS)
          .filter((h) => h.category === 'pass')
          .map((h) => ({ id: h.id, lon: h.lon, lat: h.lat, status: h.may })),
      ),
    )
  }, [dio])

  // ——— the sun follows the day: arrival time at tonight's stop
  const sunTarget = useMemo(() => {
    const d = ui.day != null ? trip?.days[ui.day - 1] : null
    if (ui.panel === 'candidates' && sugg && ui.focusCand) {
      const s = sugg.list.find((x) => x.place === ui.focusCand)
      const p = PLACES[ui.focusCand]
      const date = d?.date ?? ui.startDate
      if (s) return { date, min: Math.min(21 * 60 + 20, arrivalMin(s.day, ui.settings)), lon: p.lon, lat: p.lat }
    }
    if (d) {
      const dest = PLACES[d.sleep] ?? PLACES[d.to]
      const min = d.e ? Math.min(21 * 60 + 20, arrivalMin(d.e, ui.settings, d.segments.some((s) => s.kind === 'crossing' && CROSSINGS[s.crossing!.id].overnight) && d.dir === 'out')) : 13 * 60
      return { date: d.date, min, lon: dest?.lon ?? 10, lat: dest?.lat ?? 47 }
    }
    return { date: ui.startDate, min: 17 * 60 + 50, lon: 10, lat: 47 }
  }, [ui.day, ui.panel, ui.focusCand, ui.startDate, ui.settings, trip, sugg])

  const sunNow = useRef<number | null>(null)
  useEffect(() => {
    if (!dio) return
    const want = ui.sunMin ?? sunTarget.min
    // first time: a time-lapse from the small hours (city lights) into the afternoon
    const first = sunNow.current == null && !matchMedia('(prefers-reduced-motion: reduce)').matches
    const from = sunNow.current ?? (first ? 3 * 60 + 40 : want)
    const ms = first ? 6500 : 1400
    const t0 = performance.now()
    let raf = 0
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const step = () => {
      const t = reduce ? 1 : Math.min(1, (performance.now() - t0) / ms)
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
      const m = from + (want - from) * e
      sunNow.current = m
      dio.setSun(localDate(sunTarget.date, m), { lon: sunTarget.lon, lat: sunTarget.lat })
      if (t < 1) raf = requestAnimationFrame(step)
    }
    dio.ready.then(step)
    return () => cancelAnimationFrame(raf)
  }, [dio, sunTarget, ui.sunMin])

  // ——— camera
  const introDone = useRef(false)
  useEffect(() => {
    if (!dio) return
    const aspect = dio.canvas.clientWidth / Math.max(1, dio.canvas.clientHeight)
    const narrow = dio.canvas.clientWidth < 900
    const panelEl = document.querySelector('.panel') as HTMLElement | null
    const left = !narrow && panelEl ? Math.min(0.5, (panelEl.getBoundingClientRect().right + 10) / dio.canvas.clientWidth) : 0
    const H = dio.canvas.clientHeight
    const bottom = narrow ? Math.min(0.7, (panelEl ? H - panelEl.getBoundingClientRect().top : 90) / H) : 0.08
    const tripPts = () => {
      const pts: { lon: number; lat: number }[] = []
      for (const d of trip?.days ?? []) if (d.e) pts.push(PLACES[d.e.from], PLACES[d.e.to])
      return pts
    }
    const run = async () => {
      await dio.ready
      if (!introDone.current) {
        introDone.current = true
        dio.setView({ ...OVERVIEW, dist: 3100, tilt: 18 })
        const km = tracks.reduce((a, t) => Math.max(a, (t.kmOffset ?? 0) + (t.points[t.points.length - 1]?.km ?? 0)), 0)
        if (km > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches) dio.drawOn(km, 5200)
        await dio.flyTo(narrow && trip ? viewFor(tripPts(), aspect, { tilt: 30, pad: 1.1, bottom }) : OVERVIEW, 4200)
        return
      }
      if (ui.panel === 'options' || (!trip && ui.day == null)) {
        const pts = options?.flatMap((o) => [...o.out.days, ...o.ret.days].map((d) => PLACES[d.to])) ?? []
        await dio.flyTo(pts.length ? viewFor(pts, aspect, { tilt: 38, pad: 1.15, left, bottom, min: 600 }) : narrow ? { ...OVERVIEW, lat: OVERVIEW.lat - 3.5, dist: 3000 } : OVERVIEW, 1800)
        return
      }
      if (ui.panel === 'candidates' && ui.cand && sugg) {
        const pts = sugg.list.slice(0, 10).map((s) => PLACES[s.place])
        const prev = sugg.baseline.days[ui.cand.slot]
        if (prev) pts.push(PLACES[prev.from])
        if (pts.length) await dio.flyTo(viewFor(pts, aspect, { tilt: 44, pad: narrow ? 1.3 : 1.3, min: 120, left, bottom }), 1600)
        return
      }
      if (ui.day != null && trip) {
        const d = trip.days[ui.day - 1]
        const pts: { lon: number; lat: number }[] = []
        for (const s of d?.segments ?? []) if (s.kind === 'drive') {
          const leg = legs[s.key!]
          if (leg) for (let i = 0; i < leg.samples.length; i += 8) pts.push(leg.samples[i])
          else pts.push(...s.waypoints!)
        }
        if (!pts.length && d) pts.push(PLACES[d.sleep] ?? PLACES[d.to])
        if (pts.length) await dio.flyTo(viewFor(pts, aspect, { tilt: 52, pad: narrow ? 1.25 : 1.15, min: 40, left, bottom }), 1700)
        return
      }
      if (trip && ui.panel == null) await dio.flyTo(narrow ? viewFor(tripPts(), aspect, { tilt: 30, pad: 1.1, bottom }) : OVERVIEW, 1600)
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dio, ui.panel, ui.day, ui.cand, !!trip, !!sugg, !!options])

  // focus: quiet the land away from where you're choosing
  useEffect(() => {
    if (!dio) return
    if (ui.panel === 'candidates' && ui.cand && sugg) {
      const prev = sugg.baseline.days[ui.cand.slot]
      const p = prev ? PLACES[prev.from] : null
      if (p) dio.setFocus({ lon: p.lon, lat: p.lat, radiusKm: ui.settings.maxDriveH * 95 })
    } else dio.setFocus(null)
  }, [dio, ui.panel, ui.cand, sugg, ui.settings.maxDriveH])

  void GOLD
  return null
}
