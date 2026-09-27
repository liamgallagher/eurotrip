import { HIGHLIGHTS } from '../data/highlights'
import { EXCLUDED_HIGHLIGHTS, EXCLUSIONS } from '../data/exclusions'
import { PLACES } from '../data/places'
import { ROUTES } from '../data/routes'
import type { Category, Highlight, MayStatus, RouteDef } from '../data/types'
import type { Weights } from './state'

export const ALL_HIGHLIGHTS: Record<string, Highlight> = {
  ...HIGHLIGHTS,
  ...Object.fromEntries(EXCLUDED_HIGHLIGHTS.map((h) => [h.id, h])),
}

export const CATEGORIES: { id: Category; label: string; plural: string }[] = [
  { id: 'scenic-road', label: 'Scenic road', plural: 'Scenic roads' },
  { id: 'pass', label: 'Mountain pass', plural: 'Mountain passes' },
  { id: 'lake', label: 'Lake', plural: 'Lakes' },
  { id: 'town', label: 'Town / city', plural: 'Towns & cities' },
  { id: 'landmark', label: 'Landmark', plural: 'Landmarks' },
  { id: 'food-wine', label: 'Food & wine', plural: 'Food & wine' },
  { id: 'history', label: 'History', plural: 'History' },
]

export const MAY_LABEL: Record<MayStatus, string> = {
  open: 'Open in May',
  likely: 'Normally open',
  check: 'Check dates',
  closed: 'Usually shut',
}
const MAY_VALUE: Record<MayStatus, number> = { open: 1, likely: 0.85, check: 0.55, closed: 0 }

export interface RouteHighlight {
  id: string
  optional: boolean
  day: number | null // def day index, null = overnight stop
}

/** Highlights on a route definition with default stops (plus optional detours, flagged). */
export function routeHighlights(r: RouteDef, stopOverrides?: string[]): RouteHighlight[] {
  const seen = new Map<string, RouteHighlight>()
  const add = (h: RouteHighlight) => {
    const e = seen.get(h.id)
    if (!e) seen.set(h.id, h)
    else if (!h.optional) e.optional = false
  }
  r.days.forEach((d, i) => {
    d.highlights.forEach((id) => add({ id, optional: false, day: i }))
    d.options?.forEach((o) => o.highlights.forEach((id) => add({ id, optional: !o.defaultOn, day: i })))
  })
  const stops = stopOverrides ?? r.stops.map((s) => s.default)
  stops.forEach((pid) => PLACES[pid].highlights.forEach((id) => add({ id, optional: false, day: null })))
  return [...seen.values()].filter((h) => ALL_HIGHLIGHTS[h.id])
}

export interface RouteMetrics {
  km: number
  hours: number
  ascent: number
  maxEle: number
  longestDayKm: number
  maxGapKm: number
  stopsWithoutSc: number
  chargeStops: number
}

export interface RouteScore {
  route: RouteDef
  scenery: number
  evenings: number
  charging: number
  may: number
  total: number
  stars: number
  final: number
  highlights: RouteHighlight[]
}

const SCENIC_WEIGHT: Record<Category, number> = {
  'scenic-road': 1, pass: 1, lake: 1, landmark: 0.8, town: 0.45, 'food-wine': 0.5, history: 0.35,
}

export function chargingScore(m: RouteMetrics | undefined, r: RouteDef): number {
  if (!m) {
    // fallback: count "no Supercharger" flags
    const flags = r.flags.filter((f) => /Supercharger/i.test(f)).length
    return Math.max(40, 90 - flags * 15)
  }
  let s = 100
  s -= Math.max(0, m.maxGapKm - 120) / 3
  s -= m.stopsWithoutSc * 8
  s -= m.chargeStops * 2
  return Math.max(0, Math.min(100, Math.round(s)))
}

export function scoreRoutes(weights: Weights, stars: string[], metrics: Record<string, RouteMetrics | undefined>, reinstated: string[] = []): RouteScore[] {
  const rows = ROUTES.map((r) => {
    const extra = EXCLUSIONS.filter((x) => reinstated.includes(x.id) && x.reinstate?.routeId === r.id && x.reinstate.highlight)
      .map((x) => ({ id: x.reinstate!.highlight!, optional: false, day: x.reinstate!.dayIndex }))
    const withExtra = [...routeHighlights(r), ...extra]
    const hl = withExtra.filter((h) => !h.optional)
    const scenicRaw = hl.reduce((a, h) => {
      const x = ALL_HIGHLIGHTS[h.id]
      return a + x.scenic * SCENIC_WEIGHT[x.category] * (x.may === 'closed' ? 0.2 : 1)
    }, 0)
    const evenings = (r.stops.reduce((a, s) => a + PLACES[s.default].evening, 0) / r.stops.length) * 10
    const wsum = hl.reduce((a, h) => a + ALL_HIGHLIGHTS[h.id].scenic, 0) || 1
    const may = (hl.reduce((a, h) => a + MAY_VALUE[ALL_HIGHLIGHTS[h.id].may] * ALL_HIGHLIGHTS[h.id].scenic, 0) / wsum) * 100
    const all = withExtra.map((h) => h.id)
    const starCount = stars.filter((s) => all.includes(s)).length
    return { route: r, scenicRaw, evenings, charging: chargingScore(metrics[r.id], r), may, stars: starCount, highlights: withExtra }
  })
  const maxScenic = Math.max(...rows.map((r) => r.scenicRaw)) || 1
  const wTotal = weights.scenery + weights.evenings + weights.charging + weights.may || 1
  return rows
    .map((r) => {
      const scenery = (r.scenicRaw / maxScenic) * 100
      const total = (scenery * weights.scenery + r.evenings * weights.evenings + r.charging * weights.charging + r.may * weights.may) / wTotal
      return {
        route: r.route,
        scenery: Math.round(scenery),
        evenings: Math.round(r.evenings),
        charging: Math.round(r.charging),
        may: Math.round(r.may),
        total: Math.round(total),
        stars: r.stars,
        final: total + r.stars * 6,
        highlights: r.highlights,
      }
    })
    .sort((a, b) => b.final - a.final)
}
