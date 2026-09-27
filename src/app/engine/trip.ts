import { FIXED, PLACES } from '../../data/places'
import { CROSSINGS, type Crossing } from '../../data/costs'
import { ALL_HIGHLIGHTS } from '../../lib/scoring'
import { legKey, type Waypoint } from '../../lib/legs'
import { addDays } from '../../lib/plan'
import { SLOVENIA, type Dir } from './curated'
import {
  DEFAULT_SETTINGS,
  ELIGIBLE,
  heartCounts,
  jaccard,
  PEOPLE,
  Planner,
  portOf,
  roadNights,
  dayLegKey,
  type Ctx,
  type DayEval,
  type Person,
  type PathResult,
  type PlannerState,
  type Stop,
} from './planner'

// Whole trips: generating options, suggesting a stop, and laying the plan out day by day.

export function ctxFor(st: PlannerState, _dir: Dir, other: PathResult | null): Ctx {
  return {
    hearts: heartCounts(st.hearts),
    otherPlaces: new Set(other?.places ?? []),
    otherHighlights: other?.covered ?? new Set(),
    prefs: st.days,
    settings: st.settings,
  }
}

export function emptyState(startDate = '2027-05-03'): PlannerState {
  return {
    v: 2,
    startDate,
    out: { crossing: 'tunnel', stops: [] },
    ret: { crossing: 'tunnel', stops: [] },
    sloveniaNights: 4,
    days: {},
    hearts: { liam: [], tatiana: [] },
    who: 'liam',
    settings: { ...DEFAULT_SETTINGS },
  }
}

export const allHearts = (st: PlannerState) => [...new Set(PEOPLE.flatMap((p) => st.hearts[p]))]

export interface TripOption {
  id: string
  out: PathResult
  ret: PathResult
  score: number
  name: string
  tagline: string
  covered: string[]
  missed: string[]
  driveMin: number
  km: number
}

function signature(p: PathResult): string[] {
  // the two most valuable highlights on a direction, for naming the option
  const ids = [...p.covered].filter((id) => ALL_HIGHLIGHTS[id])
  ids.sort((a, b) => ALL_HIGHLIGHTS[b].scenic - ALL_HIGHLIGHTS[a].scenic || a.localeCompare(b))
  return ids.slice(0, 2).map((id) => ALL_HIGHLIGHTS[id].name.replace(/\s*\(.*\)/, ''))
}

function stopsFrom(p: PathResult, firm: Stop[] = []): Stop[] {
  return p.places.map((place) => ({ place, nights: 1, firm: firm.some((f) => f.place === place && f.firm) || undefined }))
}

/** 2–3 complete, different trips built around your hearts. */
export function tripOptions(pl: Planner, st: PlannerState, n = 3): TripOption[] {
  pl.reset()
  const outs = pl.alternatives('out', st.out.crossing, 6, ctxFor(st, 'out', null))
  const rets = pl.alternatives('ret', st.ret.crossing, 6, ctxFor(st, 'ret', null))
  const hearts = allHearts(st)
  const combos: TripOption[] = []
  for (const o of outs) for (const r of rets) {
    const sharedPlaces = o.places.filter((p) => r.places.includes(p)).length
    let sharedValue = 0
    for (const id of o.covered) if (r.covered.has(id)) sharedValue += 8
    const covered = hearts.filter((h) => o.covered.has(h) || r.covered.has(h))
    const doubleHearts = hearts.filter((h) => o.covered.has(h) && r.covered.has(h)).length
    const score = o.score + r.score - sharedPlaces * 30 - sharedValue - doubleHearts * 30
    const days = [...o.days, ...r.days]
    const [o1, o2] = signature(o)
    const [r1] = signature(r).filter((x) => x !== o1 && x !== o2)
    combos.push({
      id: `${o.places.join('.')}|${r.places.join('.')}`,
      out: o,
      ret: r,
      score,
      name: [o1, r1].filter(Boolean).join(' & '),
      tagline: `Out via ${[o1, o2].filter(Boolean).join(' and ')}; back via ${signature(r).join(' and ')}.`,
      covered,
      missed: hearts.filter((h) => !covered.includes(h)),
      driveMin: days.reduce((a, d) => a + d.min, 0),
      km: days.reduce((a, d) => a + d.km, 0),
    })
  }
  combos.sort((a, b) => b.score - a.score)
  const picked: TripOption[] = []
  for (const c of combos) {
    if (picked.every((p) => jaccard([...c.out.places, ...c.ret.places], [...p.out.places, ...p.ret.places]) < 0.4)) picked.push(c)
    if (picked.length >= n) break
  }
  return picked
}

export function applyOption(st: PlannerState, o: TripOption): PlannerState {
  return { ...st, out: { ...st.out, stops: stopsFrom(o.out) }, ret: { ...st.ret, stops: stopsFrom(o.ret) } }
}

/** Paths for the current state (both directions, each aware of the other). */
export function currentPaths(pl: Planner, st: PlannerState): { out: PathResult; ret: PathResult } {
  pl.reset()
  const outPlaces = expand(st.out.stops)
  const retPlaces = expand(st.ret.stops)
  const out0 = pl.scorePath('out', st.out.crossing, outPlaces, ctxFor(st, 'out', null))
  const ret = pl.scorePath('ret', st.ret.crossing, retPlaces, ctxFor(st, 'ret', out0))
  pl.reset()
  const out = pl.scorePath('out', st.out.crossing, outPlaces, ctxFor(st, 'out', ret))
  pl.reset()
  return { out, ret }
}

/** Distinct places in order (a 2-night stop is one place). */
const expand = (stops: Stop[]) => stops.map((s) => s.place)

export interface Suggestion {
  place: string
  score: number
  day: DayEval
  completion: PathResult
  lost: string[]
  gained: string[]
  reenter: string | null
  long: boolean
}

/**
 * Candidates for stop `slot` of a direction. Earlier stops stay; firm later stops stay; the rest of the
 * direction is re-planned around each candidate so you can see what it does to the whole trip.
 */
export function suggest(pl: Planner, st: PlannerState, dir: Dir, slot: number): { list: Suggestion[]; baseline: PathResult } {
  const plan = dir === 'out' ? st.out : st.ret
  const paths = currentPaths(pl, st)
  const other = dir === 'out' ? paths.ret : paths.out
  const ctx = ctxFor(st, dir, other)
  pl.reset()
  const baseline = dir === 'out' ? paths.out : paths.ret
  const fixedBase = plan.stops.map((s, i) => (i < slot || s.firm ? s.place : null))
  const prefix = plan.stops.slice(0, slot).map((s) => s.place)
  const start = dir === 'out' ? portOf(plan.crossing) : SLOVENIA
  const end = dir === 'out' ? SLOVENIA : portOf(plan.crossing)
  const prev = slot === 0 ? start : prefix[prefix.length - 1]
  const hearts = allHearts(st)
  const baseHearts = new Set(hearts.filter((h) => baseline.covered.has(h) || other.covered.has(h)))
  const behind = Planner.leftBehind([start, ...prefix])
  const list: Suggestion[] = []
  const limit = st.settings.maxDriveH * 60
  for (const b of ELIGIBLE) {
    if (prefix.includes(b)) continue
    if (fixedBase.some((f, i) => f === b && i !== slot)) continue
    if (!pl.progress(prev, b, end)) continue
    const m = pl.graph.min(`p:${prev}`, `p:${b}`)
    if (m < 25 || m > limit + 120) continue
    const fixed = [...fixedBase]
    fixed[slot] = b
    const [best] = pl.complete(dir, plan.crossing, fixed, ctx, 1, 36)
    if (!best) continue
    const covered = new Set(hearts.filter((h) => best.covered.has(h) || other.covered.has(h)))
    const day = best.days[slot]
    list.push({
      place: b,
      score: best.score,
      day,
      completion: best,
      lost: [...baseHearts].filter((h) => !covered.has(h)),
      gained: [...covered].filter((h) => !baseHearts.has(h)),
      reenter: st.settings.countryRule && behind.has(PLACES[b].country) ? PLACES[b].country : null,
      long: day.min > day.limit,
    })
  }
  list.sort((a, b) => b.score - a.score)
  return { list, baseline }
}

/** Choose a stop: keep the prefix and firm stops, re-plan the rest around it. */
export function chooseStop(pl: Planner, st: PlannerState, dir: Dir, slot: number, place: string, s?: Suggestion): PlannerState {
  const plan = dir === 'out' ? st.out : st.ret
  const completion = s?.completion
  let places: string[]
  if (completion && completion.places[slot] === place) places = completion.places
  else {
    const paths = currentPaths(pl, st)
    const other = dir === 'out' ? paths.ret : paths.out
    const fixed = plan.stops.map((x, i) => (i < slot || x.firm ? x.place : null))
    fixed[slot] = place
    places = pl.complete(dir, plan.crossing, fixed, ctxFor(st, dir, other), 1)[0]?.places ?? plan.stops.map((x) => x.place)
  }
  const stops = places.map((p, i) => ({ place: p, nights: plan.stops[i]?.place === p ? plan.stops[i].nights : 1, firm: plan.stops[i]?.place === p ? plan.stops[i].firm : undefined }))
  return { ...st, [dir]: { ...plan, stops } }
}

/** Change the crossing; the number of road nights changes with an overnight ferry. */
export function setCrossing(pl: Planner, st: PlannerState, dir: Dir, c: 'tunnel' | 'ferry'): PlannerState {
  const plan = dir === 'out' ? st.out : st.ret
  const want = roadNights(c)
  const fixed: (string | null)[] = plan.stops.slice(0, want).map((s) => (s.firm ? s.place : null))
  while (fixed.length < want) fixed.push(null)
  const next = { ...st, [dir]: { ...plan, crossing: c } } as PlannerState
  const paths = currentPaths(pl, st)
  const [best] = pl.complete(dir, c, fixed, ctxFor(next, dir, dir === 'out' ? paths.ret : paths.out), 1)
  return { ...next, [dir]: { crossing: c, stops: best ? stopsFrom(best, plan.stops) : plan.stops.slice(0, want) } }
}

// ——— the day-by-day plan

export type DayKind = 'drive' | 'rest' | 'base' | 'ferry-night' | 'ferry-arrival'
export interface TripSegment {
  kind: 'drive' | 'crossing'
  key?: string
  waypoints?: Waypoint[]
  crossing?: Crossing
}
export interface TripDay {
  n: number
  date: string
  dir: Dir | 'base'
  kind: DayKind
  from: string
  to: string
  e?: DayEval
  segments: TripSegment[]
  sleep: string
  /** index of the stop this day ends at, in its direction */
  stop?: number
  title: string
}

export interface Trip {
  days: TripDay[]
  out: PathResult
  ret: PathResult
  nights: number
  endDate: string
}

const seg = (a: { name: string; lat: number; lon: number }, b: { name: string; lat: number; lon: number }): TripSegment => {
  const waypoints = [a, b].map((p) => ({ name: p.name, lat: p.lat, lon: p.lon }))
  return { kind: 'drive', key: legKey(waypoints), waypoints }
}

export function buildTrip(pl: Planner, st: PlannerState): Trip {
  const { out, ret } = currentPaths(pl, st)
  const days: TripDay[] = []
  let date = st.startDate
  const push = (d: Omit<TripDay, 'n' | 'date'>) => {
    days.push({ ...d, n: days.length + 1, date })
    date = addDays(date, 1)
  }
  const home = FIXED.home
  const xo = CROSSINGS[st.out.crossing], xr = CROSSINGS[st.ret.crossing]
  const title = (e: DayEval) => (e.way.kind === 'curated' ? e.way.label : `${PLACES[e.from].name.replace(/ \(.*\)/, '')} to ${PLACES[e.to].name.replace(/ \(.*\)/, '')}`)
  const driveSeg = (e: DayEval): TripSegment => {
    const { key, waypoints } = dayLegKey(e)
    return { kind: 'drive', key, waypoints }
  }

  // outbound
  if (xo.overnight) {
    push({ dir: 'out', kind: 'ferry-night', from: home.id, to: xo.to, segments: [seg(home, PLACES[xo.from]), { kind: 'crossing', crossing: xo }], sleep: 'ferry', title: 'Overnight ferry to Normandy' })
  }
  out.days.forEach((e, i) => {
    const segments: TripSegment[] = []
    if (i === 0 && !xo.overnight) segments.push(seg(home, PLACES[xo.from]), { kind: 'crossing', crossing: xo })
    segments.push(driveSeg(e))
    const last = i === out.days.length - 1
    push({ dir: 'out', kind: 'drive', from: i === 0 && !xo.overnight ? home.id : e.from, to: e.to, e, segments, sleep: e.to, stop: last ? undefined : i, title: title(e) })
    const nights = last ? 1 : st.out.stops[i]?.nights ?? 1
    for (let r = 1; r < nights; r++) push({ dir: 'out', kind: 'rest', from: e.to, to: e.to, segments: [], sleep: e.to, stop: i, title: `A second night in ${PLACES[e.to].name}` })
  })
  for (let i = 1; i < st.sloveniaNights; i++) push({ dir: 'base', kind: 'base', from: SLOVENIA, to: SLOVENIA, segments: [], sleep: SLOVENIA, title: 'In Slovenia' })
  // return
  ret.days.forEach((e, i) => {
    const last = i === ret.days.length - 1
    const segments: TripSegment[] = [driveSeg(e)]
    if (last && !xr.overnight) segments.push({ kind: 'crossing', crossing: xr }, seg(PLACES[xr.from], home))
    if (last && xr.overnight) segments.push({ kind: 'crossing', crossing: xr })
    push({ dir: 'ret', kind: 'drive', from: e.from, to: last && !xr.overnight ? home.id : e.to, e, segments, sleep: last ? (xr.overnight ? 'ferry' : 'home') : e.to, stop: last ? undefined : i, title: title(e) })
    const nights = last ? 1 : st.ret.stops[i]?.nights ?? 1
    for (let r = 1; r < nights; r++) push({ dir: 'ret', kind: 'rest', from: e.to, to: e.to, segments: [], sleep: e.to, stop: i, title: `A second night in ${PLACES[e.to].name}` })
  })
  if (xr.overnight) push({ dir: 'ret', kind: 'ferry-arrival', from: xr.from, to: home.id, segments: [seg(PLACES[xr.from], home)], sleep: 'home', title: 'Portsmouth and home' })
  const nights = days.filter((d) => d.sleep !== 'home').length
  return { days, out, ret, nights, endDate: days[days.length - 1]?.date ?? st.startDate }
}

/** Who hearted what, and which are covered by the trip. */
export function heartReport(st: PlannerState, trip: Trip) {
  const covered = new Set([...trip.out.covered, ...trip.ret.covered])
  const rows = allHearts(st).map((id) => {
    const who = PEOPLE.filter((p) => st.hearts[p].includes(id)) as Person[]
    return { id, who, covered: covered.has(id), both: who.length === 2 }
  })
  return rows
}

// ——— small edits from the day card

export function setDayPrefs(st: PlannerState, key: string, patch: Partial<{ way: string; include: string[]; skip: string[] }>): PlannerState {
  const cur = st.days[key] ?? {}
  return { ...st, days: { ...st.days, [key]: { ...cur, ...patch } } }
}

export function toggleFirm(st: PlannerState, dir: Dir, idx: number): PlannerState {
  const plan = dir === 'out' ? st.out : st.ret
  const stops = plan.stops.map((s, i) => (i === idx ? { ...s, firm: s.firm ? undefined : true } : s))
  return { ...st, [dir]: { ...plan, stops } }
}

/** Two nights somewhere means one fewer stop in that direction: re-plan the rest around it. */
export function setNights(pl: Planner, st: PlannerState, dir: Dir, idx: number, nights: number): PlannerState {
  const plan = dir === 'out' ? st.out : st.ret
  const want = roadNights(plan.crossing)
  const withN = plan.stops.map((s, i) => (i === idx ? { ...s, nights } : s))
  const extra = withN.reduce((a, s) => a + s.nights - 1, 0)
  const slots = Math.max(1, want - extra)
  const fixed: (string | null)[] = []
  for (let i = 0; i < slots; i++) {
    const s = withN[i]
    fixed.push(s && (i <= idx || s.firm) ? s.place : null)
  }
  const paths = currentPaths(pl, st)
  const [best] = pl.complete(dir, plan.crossing, fixed, ctxFor(st, dir, dir === 'out' ? paths.ret : paths.out), 1)
  const places = best?.places ?? fixed.filter(Boolean) as string[]
  const stops = places.map((p) => {
    const old = withN.find((s) => s.place === p)
    return { place: p, nights: old?.nights ?? 1, ...(old?.firm ? { firm: true } : {}) }
  })
  return { ...st, [dir]: { ...plan, stops } }
}

/** What would it take to fit a must-see in? Re-plan with it strongly preferred and compare. */
export function whatIfHeart(pl: Planner, st: PlannerState, id: string): { st: PlannerState; extraMin: number; lost: string[]; dir: Dir } | null {
  const trip = currentPaths(pl, st)
  const before = new Set([...trip.out.covered, ...trip.ret.covered])
  const hearts = allHearts(st)
  let best: { st: PlannerState; extraMin: number; lost: string[]; dir: Dir; score: number } | null = null
  for (const dir of ['out', 'ret'] as Dir[]) {
    const plan = dir === 'out' ? st.out : st.ret
    const other = dir === 'out' ? trip.ret : trip.out
    const ctx = ctxFor(st, dir, other)
    // a big nudge for the wished-for place, as if both of you had hearted it several times
    ctx.hearts = new Map(ctx.hearts)
    ctx.hearts.set(id, 12)
    pl.reset()
    const fixed = plan.stops.map((s) => (s.firm ? s.place : null))
    const [p] = pl.complete(dir, plan.crossing, fixed, ctx, 1)
    pl.reset()
    if (!p || !p.covered.has(id)) continue
    const nextSt = { ...st, [dir]: { ...plan, stops: p.places.map((place) => ({ place, nights: 1 })) } } as PlannerState
    const after = currentPaths(pl, nextSt)
    const cov = new Set([...after.out.covered, ...after.ret.covered])
    const lost = hearts.filter((h) => h !== id && before.has(h) && !cov.has(h))
    const minBefore = [...trip.out.days, ...trip.ret.days].reduce((a, d) => a + d.min, 0)
    const minAfter = [...after.out.days, ...after.ret.days].reduce((a, d) => a + d.min, 0)
    const score = -lost.length * 100 - (minAfter - minBefore)
    if (!best || score > best.score) best = { st: nextSt, extraMin: minAfter - minBefore, lost, dir, score }
  }
  pl.reset()
  return best ? { st: best.st, extraMin: best.extraMin, lost: best.lost, dir: best.dir } : null
}
