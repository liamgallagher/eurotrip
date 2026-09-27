import { FIXED, PLACES } from '../../data/places'
import { ROUTE_BY_ID } from '../../data/routes'
import { CROSSINGS } from '../../data/costs'
import type { Category, MayStatus, Via } from '../../data/types'
import { haversine } from '../../lib/geo'
import { ALL_HIGHLIGHTS } from '../../lib/scoring'
import { legKey, type Waypoint } from '../../lib/legs'
import { curatedDay, dropNear, SLOVENIA, type Dir } from './curated'
import type { CuratedRow, Graph } from './graph'

// The planner: every day is a "way" between two overnight stops — a curated scenic day from the seven
// researched routes when one exists, or the direct road — plus the highlights on or near it. Paths are
// scored on scenery, evenings, your hearts and sensible driving days, and searched with a small beam.

export type Person = 'liam' | 'tatiana'
export const PEOPLE: Person[] = ['liam', 'tatiana']
export const PERSON: Record<Person, { name: string; color: string }> = {
  liam: { name: 'Liam', color: '#2dd4bf' },
  tatiana: { name: 'Tatiana', color: '#fb7185' },
}

export interface Stop {
  place: string
  nights: number
  /** booked / fixed: re-planning never moves it */
  firm?: boolean
}
export type CrossingId = 'tunnel' | 'ferry'
export interface DirPlan {
  crossing: CrossingId
  stops: Stop[]
}
export interface DayPrefs {
  way?: string
  include?: string[]
  skip?: string[]
}
export interface Settings {
  maxDriveH: number
  departMin: number
  cruiseKmh: number
  minArrivalPct: number
  countryRule: boolean
}
export interface PlannerState {
  v: 2
  startDate: string
  out: DirPlan
  ret: DirPlan
  sloveniaNights: number
  days: Record<string, DayPrefs>
  hearts: Record<Person, string[]>
  who: Person
  settings: Settings
}

export const DEFAULT_SETTINGS: Settings = { maxDriveH: 5.5, departMin: 9 * 60 + 30, cruiseKmh: 120, minArrivalPct: 15, countryRule: true }

export const dayKey = (dir: Dir, from: string, to: string) => `${dir}:${from}>${to}`

export interface Detour {
  id: string
  /** extra minutes of driving */
  extra: number
}

export interface Way {
  id: string
  kind: 'curated' | 'direct'
  label: string
  routeId?: string
  dayIdx?: number
  min: number
  km: number
  /** OSRM-exact for this way (curated snapshot) or the matrix estimate */
  exact: boolean
  highlights: string[]
  detours: Detour[]
  vias: Waypoint[]
  maxEle?: number
  ascent?: number
}

export interface DayEval {
  dir: Dir
  from: string
  to: string
  way: Way
  /** driving minutes including chosen detours */
  min: number
  km: number
  covered: string[]
  detoursTaken: string[]
  limit: number
  score: number
  flags: string[]
}

const CATW: Record<Category, number> = { 'scenic-road': 1, pass: 1, lake: 1, landmark: 0.85, town: 0.6, 'food-wine': 0.55, history: 0.45 }
const MAYV: Record<MayStatus, number> = { open: 1, likely: 0.9, check: 0.6, closed: 0 }
/** Minutes you'd typically stop at a highlight of each kind. */
export const STOP_MIN: Record<Category, number> = { 'scenic-road': 0, pass: 15, lake: 30, landmark: 45, town: 60, 'food-wine': 45, history: 45 }

export const value = (id: string) => {
  const h = ALL_HIGHLIGHTS[id]
  return h ? h.scenic * CATW[h.category] * MAYV[h.may] : 0
}

const FIXED_IDS = new Set(Object.values(FIXED).map((p) => p.id))
export const ELIGIBLE = Object.values(PLACES).filter((p) => !FIXED_IDS.has(p.id)).map((p) => p.id)
const HIGHLIGHT_IDS = Object.keys(ALL_HIGHLIGHTS).filter((id) => ALL_HIGHLIGHTS[id].may !== 'closed')

export const portOf = (c: CrossingId) => CROSSINGS[c].to
export const roadNights = (c: CrossingId) => (CROSSINGS[c].overnight ? 4 : 5)

const P = (id: string) => `p:${id}`
const H = (id: string) => `h:${id}`
const wp = (p: { name: string; lat: number; lon: number }): Waypoint => ({ name: p.name, lat: p.lat, lon: p.lon })

export interface Ctx {
  hearts: Map<string, number>
  /** places and highlights used by the other direction (variety) */
  otherPlaces: Set<string>
  otherHighlights: Set<string>
  prefs: Record<string, DayPrefs>
  settings: Settings
}

export function heartCounts(h: Record<Person, string[]>): Map<string, number> {
  const m = new Map<string, number>()
  for (const p of PEOPLE) for (const id of h[p]) m.set(id, (m.get(id) ?? 0) + 1)
  return m
}

export interface PathResult {
  dir: Dir
  places: string[]
  days: DayEval[]
  score: number
  covered: Set<string>
  flags: string[]
}

export class Planner {
  private g: Graph
  private curated = new Map<string, CuratedRow[]>()
  private waysCache = new Map<string, Way[]>()
  private evalCache = new Map<string, DayEval | null>()

  constructor(g: Graph, rows: CuratedRow[]) {
    this.g = g
    for (const r of rows) {
      const k = `${r.dir}:${r.from}>${r.to}`
      const list = this.curated.get(k) ?? []
      list.push(r)
      this.curated.set(k, list)
    }
  }

  get graph() {
    return this.g
  }

  /** Clear cached evaluations (hearts / preferences changed). */
  reset() {
    this.evalCache.clear()
  }

  // ——— ways
  /** Highlights on the way (≤ 10 min extra) and worth-a-detour (≤ 75 min) for a straight A→B drive. */
  private nearby(a: string, b: string, exclude: Set<string>): { on: string[]; detours: Detour[] } {
    const base = this.g.min(P(a), P(b))
    const on: string[] = []
    const detours: Detour[] = []
    const pa = PLACES[a], pb = PLACES[b]
    const span = haversine([pa.lon, pa.lat], [pb.lon, pb.lat])
    for (const id of HIGHLIGHT_IDS) {
      if (exclude.has(id)) continue
      const h = ALL_HIGHLIGHTS[id]
      // quick ellipse test before the matrix
      const d = haversine([pa.lon, pa.lat], [h.lon, h.lat]) + haversine([h.lon, h.lat], [pb.lon, pb.lat])
      if (d > span + 110000) continue
      const extra = this.g.min(P(a), H(id)) + this.g.min(H(id), P(b)) - base
      if (extra <= 10) on.push(id)
      else if (extra <= 75) detours.push({ id, extra })
    }
    detours.sort((x, y) => x.extra - y.extra)
    return { on, detours }
  }

  ways(dir: Dir, from: string, to: string): Way[] {
    const k = `${dir}:${from}>${to}`
    const hit = this.waysCache.get(k)
    if (hit) return hit
    const list: Way[] = []
    const rows = this.curated.get(k) ?? []
    const direct = this.nearby(from, to, new Set())
    for (const r of rows) {
      const route = ROUTE_BY_ID[r.r]
      const cd = curatedDay(route, r.d, dir, from, to)
      const own = new Set([...cd.highlights])
      const onWay = direct.on.filter((id) => !own.has(id))
      list.push({
        id: `${r.r}:${r.d}`,
        kind: 'curated',
        label: route.days[r.d].title,
        routeId: r.r,
        dayIdx: r.d,
        min: r.min,
        km: r.km,
        exact: true,
        highlights: [...cd.highlights, ...onWay],
        detours: [
          ...cd.optional.map((id) => ({ id, extra: this.detourCost(from, to, id) })),
          ...direct.detours.filter((d) => !own.has(d.id) && !cd.optional.includes(d.id)),
        ],
        vias: cd.waypoints.slice(1, -1),
        maxEle: r.maxEle,
        ascent: r.ascent,
      })
    }
    // the same curated day can appear from several routes: keep the fastest of identical titles
    const seen = new Map<string, Way>()
    for (const w of list) {
      const s = seen.get(w.label)
      if (!s || w.min < s.min) seen.set(w.label, w)
    }
    const out = [...seen.values()]
    out.push({
      id: 'direct',
      kind: 'direct',
      label: 'Most direct road',
      min: this.g.min(P(from), P(to)),
      km: this.g.kmBetween(P(from), P(to)),
      exact: false,
      highlights: direct.on,
      detours: direct.detours,
      vias: [],
    })
    this.waysCache.set(k, out)
    return out
  }

  detourCost(from: string, to: string, id: string) {
    return Math.max(0, this.g.min(P(from), H(id)) + this.g.min(H(id), P(to)) - this.g.min(P(from), P(to)))
  }

  /** Driving budget (minutes) for a day, allowing for the UK run to the tunnel. */
  limitFor(dir: Dir, from: string, to: string, crossing: CrossingId, s: Settings) {
    let L = s.maxDriveH * 60
    const port = portOf(crossing)
    if (crossing === 'tunnel' && ((dir === 'out' && from === port) || (dir === 'ret' && to === port))) L -= 120
    return L
  }

  /** Best way for a day and its (path-independent) score. */
  evalDay(dir: Dir, from: string, to: string, crossing: CrossingId, ctx: Ctx, already?: Set<string>): DayEval | null {
    const ck = already ? '' : `${dir}:${from}>${to}:${crossing}`
    if (ck) {
      const hit = this.evalCache.get(ck)
      if (hit !== undefined) return hit
    }
    const L = this.limitFor(dir, from, to, crossing, ctx.settings)
    const prefs = ctx.prefs[dayKey(dir, from, to)] ?? {}
    let ways = this.ways(dir, from, to)
    if (prefs.way) {
      const w = ways.filter((x) => x.id === prefs.way)
      if (w.length) ways = w
    }
    const skip = new Set(prefs.skip ?? [])
    const isStop = to !== SLOVENIA && !PORT_IDS.has(to)
    let best: DayEval | null = null
    for (const w of ways) {
      const covered = new Set(w.highlights.filter((id) => !skip.has(id)))
      if (isStop) for (const id of PLACES[to].highlights) covered.add(id)
      let min = w.min
      const taken: string[] = []
      for (const id of prefs.include ?? []) {
        if (covered.has(id)) continue
        const d = w.detours.find((x) => x.id === id)
        min += d ? d.extra : this.detourCost(from, to, id)
        taken.push(id)
        covered.add(id)
      }
      // hearted detours come along automatically while the day stays within budget
      for (const d of w.detours) {
        if (covered.has(d.id) || skip.has(d.id) || already?.has(d.id) || !ctx.hearts.get(d.id)) continue
        if (min + d.extra <= L) {
          min += d.extra
          taken.push(d.id)
          covered.add(d.id)
        }
      }
      let score = 0
      for (const id of covered) {
        if (already?.has(id)) continue
        const v = value(id)
        score += v + 30 * (ctx.hearts.get(id) ?? 0)
        if (ctx.otherHighlights.has(id)) score -= v * 0.45
      }
      if (isStop) {
        score += PLACES[to].evening * 2.2
        if (ctx.otherPlaces.has(to)) score -= 18
      }
      const flags: string[] = []
      score -= min * 0.02
      if (min > L) {
        score -= (min - L) * 0.6
        flags.push('long')
      }
      if (min < 75) score -= (75 - min) * 0.06
      if (min > L + 100) continue
      if (!best || score > best.score) best = { dir, from, to, way: w, min, km: w.km, covered: [...covered], detoursTaken: taken, limit: L, score, flags }
    }
    if (ck) this.evalCache.set(ck, best)
    return best
  }

  // ——— paths
  private endpoints(dir: Dir, crossing: CrossingId) {
    const port = portOf(crossing)
    return dir === 'out' ? { start: port, end: SLOVENIA } : { start: SLOVENIA, end: port }
  }

  /** Is b a sensible next stop after a (making progress toward the end)? */
  progress(a: string, b: string, end: string) {
    return this.g.min(P(b), P(end)) <= this.g.min(P(a), P(end)) - 20
  }

  /** Countries left behind so far (for "don't go back into France"). */
  static leftBehind(seq: string[]): Set<string> {
    const cs = seq.map((id) => PLACES[id].country)
    const out = new Set<string>()
    for (let i = 0; i < cs.length - 1; i++) if (cs[i] !== cs[cs.length - 1]) out.add(cs[i])
    // a country is only "left" if we're currently somewhere else
    return new Set([...out].filter((c) => c !== cs[cs.length - 1]))
  }

  /**
   * Best completions of a direction. `fixed[i]` pins slot i to a place (firm stops, the prefix you have chosen);
   * null slots are chosen by the search.
   */
  complete(dir: Dir, crossing: CrossingId, fixed: (string | null)[], ctx: Ctx, k = 1, beam = 60): PathResult[] {
    const { start, end } = this.endpoints(dir, crossing)
    interface S { nodes: string[]; score: number; flags: string[] }
    let states: S[] = [{ nodes: [start], score: 0, flags: [] }]
    const slots = fixed.length
    for (let i = 0; i < slots; i++) {
      const next: S[] = []
      for (const s of states) {
        const a = s.nodes[s.nodes.length - 1]
        const cands = fixed[i] ? [fixed[i]!] : ELIGIBLE
        const behind = Planner.leftBehind(s.nodes)
        for (const b of cands) {
          if (s.nodes.includes(b)) continue
          if (!fixed[i]) {
            if (!this.progress(a, b, end)) continue
            // leave room to reach the end in the remaining days
            const left = slots - i
            if (this.g.min(P(b), P(end)) > left * (ctx.settings.maxDriveH * 60 + 90)) continue
            const m = this.g.min(P(a), P(b))
            if (m < 25 || m > ctx.settings.maxDriveH * 60 + 100) continue
          }
          const e = this.evalDay(dir, a, b, crossing, ctx)
          if (!e) continue
          let sc = s.score + e.score
          const flags = [...s.flags]
          if (ctx.settings.countryRule && behind.has(PLACES[b].country)) {
            sc -= 45
            flags.push(`reenter:${PLACES[b].country}:${b}`)
          }
          next.push({ nodes: [...s.nodes, b], score: sc, flags })
        }
      }
      // keep the best few per last node, then the beam
      next.sort((x, y) => y.score - x.score)
      const perLast = new Map<string, number>()
      states = []
      for (const s of next) {
        const last = s.nodes[s.nodes.length - 1]
        const c = perLast.get(last) ?? 0
        if (c >= 3) continue
        perLast.set(last, c + 1)
        states.push(s)
        if (states.length >= beam) break
      }
      if (!states.length) return []
    }
    const finals: S[] = []
    for (const s of states) {
      const a = s.nodes[s.nodes.length - 1]
      const e = this.evalDay(dir, a, end, crossing, ctx)
      if (!e) continue
      finals.push({ ...s, nodes: [...s.nodes, end], score: s.score + e.score })
    }
    finals.sort((x, y) => y.score - x.score)
    // exact re-score (no double counting of highlights) for the leaders
    const exact = finals.slice(0, Math.max(k * 4, 12)).map((s) => this.scorePath(dir, crossing, s.nodes.slice(1, -1), ctx, s.flags))
    exact.sort((x, y) => y.score - x.score)
    return exact.slice(0, k)
  }

  /** Exact score of a given sequence of stops. */
  scorePath(dir: Dir, crossing: CrossingId, places: string[], ctx: Ctx, flags: string[] = []): PathResult {
    const { start, end } = this.endpoints(dir, crossing)
    const nodes = [start, ...places, end]
    const covered = new Set<string>()
    const days: DayEval[] = []
    let score = 0
    const fl = [...flags]
    for (let i = 1; i < nodes.length; i++) {
      const e = this.evalDay(dir, nodes[i - 1], nodes[i], crossing, ctx, covered) ?? this.fallbackDay(dir, nodes[i - 1], nodes[i], crossing, ctx)
      days.push(e)
      score += e.score
      for (const id of e.covered) covered.add(id)
      if (i < nodes.length - 1 && ctx.settings.countryRule) {
        const behind = Planner.leftBehind(nodes.slice(0, i))
        if (behind.has(PLACES[nodes[i]].country) && !fl.some((f) => f.endsWith(`:${nodes[i]}`))) {
          score -= 45
          fl.push(`reenter:${PLACES[nodes[i]].country}:${nodes[i]}`)
        }
      }
    }
    return { dir, places, days, score, covered, flags: fl }
  }

  /** A day that the budget rules would reject still needs showing if you chose it. */
  private fallbackDay(dir: Dir, from: string, to: string, crossing: CrossingId, ctx: Ctx): DayEval {
    const w = this.ways(dir, from, to)
    const way = w[0]
    return { dir, from, to, way, min: way.min, km: way.km, covered: [...way.highlights], detoursTaken: [], limit: this.limitFor(dir, from, to, crossing, ctx.settings), score: -200, flags: ['long'] }
  }

  // ——— diverse alternatives
  alternatives(dir: Dir, crossing: CrossingId, n: number, ctx: Ctx, fixed?: (string | null)[]): PathResult[] {
    const slots = fixed ?? new Array(roadNights(crossing)).fill(null)
    const pool = this.complete(dir, crossing, slots, ctx, 40, 140)
    const picked: PathResult[] = []
    for (const p of pool) {
      if (picked.every((q) => jaccard(p.places, q.places) < 0.34)) picked.push(p)
      if (picked.length >= n) break
    }
    return picked
  }
}

const PORT_IDS = new Set(['calais', 'caen'])

export function jaccard(a: string[], b: string[]) {
  const A = new Set(a), B = new Set(b)
  let i = 0
  for (const x of A) if (B.has(x)) i++
  return i / (A.size + B.size - i || 1)
}

// ——— helpers used by the UI

export function waypointsFor(e: DayEval, detourPoints: Via[] = []): Waypoint[] {
  const from = PLACES[e.from], to = PLACES[e.to]
  let chain: Waypoint[] = [wp(from), ...e.way.vias, wp(to)]
  for (const v of detourPoints) chain = insertCheapest(chain, wp(v))
  return dropNear(chain)
}

export function insertCheapest(chain: Waypoint[], via: Waypoint): Waypoint[] {
  let best = 1
  let bestCost = Infinity
  for (let i = 1; i < chain.length; i++) {
    const a = chain[i - 1], b = chain[i]
    const cost = haversine([a.lon, a.lat], [via.lon, via.lat]) + haversine([via.lon, via.lat], [b.lon, b.lat]) - haversine([a.lon, a.lat], [b.lon, b.lat])
    if (cost < bestCost) {
      bestCost = cost
      best = i
    }
  }
  return [...chain.slice(0, best), via, ...chain.slice(best)]
}

export function dayLegKey(e: DayEval): { key: string; waypoints: Waypoint[] } {
  const pts = e.detoursTaken.map((id) => ALL_HIGHLIGHTS[id]).filter(Boolean)
  const waypoints = waypointsFor(e, pts.map((h) => ({ name: h.name, lat: h.lat, lon: h.lon })))
  return { key: legKey(waypoints), waypoints }
}

/** ≈ number of Supercharger stops for a day (estimate before the route is modelled). */
export function estCharges(km: number, ascentM = 0) {
  const kwh = km * 0.165 + ascentM * 0.0045
  const first = 57.5 * 0.83
  return kwh <= first ? 0 : Math.ceil((kwh - first) / (57.5 * 0.68))
}

/** Clock time (minutes after midnight) you'd arrive, allowing for stops. */
export function arrivalMin(e: DayEval, s: Settings, ferryMorning = false) {
  const stops = e.covered.reduce((a, id) => a + (ALL_HIGHLIGHTS[id] ? STOP_MIN[ALL_HIGHLIGHTS[id].category] : 0), 0)
  const charges = estCharges(e.km, e.way.ascent) * 25
  const lunch = e.min > 180 ? 60 : 0
  const depart = ferryMorning ? 8 * 60 : s.departMin
  return depart + e.min + Math.min(stops, 150) + charges + lunch
}
