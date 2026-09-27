import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { PLACES } from '../data/places'
import { loadChargers, loadHolidays, loadLeg, type ChargerData, type HolidayData } from '../lib/runtime'
import type { Leg } from '../lib/legs'
import type { Plan, PlanDay } from '../lib/plan'
import type { TripState } from '../lib/state'
import { computeDay, costs as classicCosts, totals as classicTotals, type DayStats } from '../lib/tripStats'
import { Graph, type CuratedRow, type MatrixFile } from './engine/graph'
import { Planner, type PlannerState } from './engine/planner'
import { buildTrip, type Trip, type TripDay } from './engine/trip'
import { useApp } from './store'

// Data hooks: the planner (drive-time matrix + curated days), the trip, its routed legs and day statistics.

const BASE = import.meta.env.BASE_URL

let plannerP: Promise<Planner> | null = null
export function loadPlanner(): Promise<Planner> {
  plannerP ??= Promise.all([
    fetch(`${BASE}data/matrix.json`).then((r) => r.json() as Promise<MatrixFile>),
    fetch(`${BASE}data/curated.json`).then((r) => r.json() as Promise<{ days: CuratedRow[] }>),
  ]).then(([m, c]) => new Planner(new Graph(m), c.days))
  return plannerP
}

export function usePlanner(): Planner | null {
  const [p, setP] = useState<Planner | null>(null)
  useEffect(() => {
    loadPlanner().then(setP)
  }, [])
  return p
}

export function usePlan(): PlannerState {
  return useApp((s) => s.plan)
}

export function useTripPlan(pl: Planner | null): Trip | null {
  const plan = usePlan()
  return useMemo(() => (pl && plan.out.stops.length && plan.ret.stops.length ? buildTrip(pl, plan) : null), [pl, plan])
}

export function useChargers(): ChargerData | null {
  const [c, setC] = useState<ChargerData | null>(null)
  useEffect(() => {
    loadChargers().then(setC).catch(() => setC(null))
  }, [])
  return c
}

export function useHolidays(year: number): HolidayData | null {
  const [h, setH] = useState<HolidayData | null>(null)
  useEffect(() => {
    loadHolidays(year, ['GB', 'FR', 'BE', 'NL', 'LU', 'DE', 'CH', 'LI', 'AT', 'IT', 'SI', 'CZ'])
      .then(setH)
      .catch(() => setH(null))
  }, [year])
  return h
}

export interface LegReq {
  key: string
  waypoints: { name: string; lat: number; lon: number }[]
}

/** Loads (snapshot → cache → live OSRM) a set of legs. */
export function useLegSet(wanted: LegReq[]) {
  const [legs, setLegs] = useState<Record<string, Leg>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  useEffect(() => {
    let alive = true
    for (const w of wanted) {
      if (legs[w.key] || errors[w.key]) continue
      loadLeg(w.key, w.waypoints)
        .then((r) => alive && setLegs((l) => ({ ...l, [w.key]: r.leg })))
        .catch((e: Error) => alive && setErrors((x) => ({ ...x, [w.key]: e.message })))
    }
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted])
  const pending = wanted.filter((w) => !legs[w.key] && !errors[w.key]).length
  return { legs, errors, pending }
}

/** Every drive segment of the trip. */
export function useLegs(trip: Trip | null) {
  const wanted = useMemo(() => {
    const m = new Map<string, LegReq>()
    for (const d of trip?.days ?? []) for (const s of d.segments) if (s.kind === 'drive' && s.key && s.waypoints) m.set(s.key, { key: s.key, waypoints: s.waypoints })
    return [...m.values()]
  }, [trip])
  return useLegSet(wanted)
}

// ——— bridge to the classic statistics (charging, tolls, vignettes, holidays)

function classicDay(d: TripDay): PlanDay {
  const sleep = d.sleep === 'ferry' || d.sleep === 'home' ? d.sleep : PLACES[d.sleep]
  return {
    n: d.n,
    date: d.date,
    dir: d.dir,
    kind: d.kind,
    defDays: [],
    title: d.title,
    from: PLACES[d.from],
    to: PLACES[d.to],
    segments: d.segments.map((s) => (s.kind === 'drive' ? { kind: 'drive' as const, waypoints: s.waypoints!, key: s.key! } : { kind: 'crossing' as const, crossing: s.crossing! })),
    highlights: [],
    notes: [],
    sleep: sleep as PlanDay['sleep'],
  }
}

function classicState(p: PlannerState): TripState {
  return {
    startDate: p.startDate,
    out: { route: 'r1', stops: [], nights: [], crossing: p.out.crossing },
    ret: { route: 'r2', stops: [], nights: [], crossing: p.ret.crossing },
    sloveniaNights: p.sloveniaNights,
    options: {},
    reinstated: [],
    weights: { scenery: 10, evenings: 6, charging: 4, may: 4 },
    stars: [],
    compare: [],
    cruiseKmh: p.settings.cruiseKmh,
    minArrivalPct: p.settings.minArrivalPct,
    categories: [],
  }
}

export function useDayStats(trip: Trip | null, legs: Record<string, Leg>) {
  const plan = usePlan()
  const chargers = useChargers()
  const holidays = useHolidays(Number(plan.startDate.slice(0, 4)))
  const { cruise, arrival } = useApp(useShallow((s) => ({ cruise: s.plan.settings.cruiseKmh, arrival: s.plan.settings.minArrivalPct })))
  return useMemo(() => {
    if (!trip) return null
    const cs = classicState(plan)
    const days = trip.days.map((d) => computeDay(classicDay(d), legs, chargers?.sites ?? null, cs, holidays))
    const pseudo: Plan = {
      days: days.map((d) => d.day),
      nights: trip.days.filter((d) => d.sleep !== 'home').map((d) => ({ date: d.date, place: d.sleep === 'ferry' ? null : PLACES[d.sleep], label: '', cc: d.sleep === 'ferry' ? 'FR' : PLACES[d.sleep].country, kind: d.sleep === 'ferry' ? ('ferry' as const) : ('road-out' as const) })),
      warnings: [],
      outNights: 0,
      retNights: 0,
      ferryNights: 0,
      totalNights: trip.nights,
      endDate: trip.endDate,
    }
    return { days, totals: classicTotals(pseudo, days), costs: classicCosts(pseudo, days, cs), chargers, holidays }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip, legs, chargers, holidays, cruise, arrival])
}

export type { DayStats }
