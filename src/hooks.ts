import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { pickState, useTrip } from './store'
import { buildPlan, type Plan } from './lib/plan'
import { loadChargers, loadHolidays, loadLeg, type ChargerData, type HolidayData, type LegSource } from './lib/runtime'
import type { Leg } from './lib/legs'
import { computeDay, costs, totals, type DayStats } from './lib/tripStats'
import type { TripState } from './lib/state'

export function useTripState(): TripState {
  return useTrip(useShallow(pickState))
}

export function usePlan(): Plan {
  const s = useTripState()
  return useMemo(() => buildPlan(s), [s])
}

export interface LegStatus {
  legs: Record<string, Leg | undefined>
  sources: Record<string, LegSource>
  errors: Record<string, string>
  pending: number
  refresh: () => void
}

export function useLegs(plan: Plan): LegStatus {
  const wanted = useMemo(() => {
    const m = new Map<string, { key: string; waypoints: { name: string; lat: number; lon: number }[] }>()
    for (const d of plan.days) for (const s of d.segments) if (s.kind === 'drive') m.set(s.key, s)
    return [...m.values()]
  }, [plan])
  const [legs, setLegs] = useState<Record<string, Leg | undefined>>({})
  const [sources, setSources] = useState<Record<string, LegSource>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [force, setForce] = useState(0)
  useEffect(() => {
    let alive = true
    for (const w of wanted) {
      if (legs[w.key] && !force) continue
      loadLeg(w.key, w.waypoints, { forceLive: force > 0 })
        .then((r) => {
          if (!alive) return
          setLegs((l) => ({ ...l, [w.key]: r.leg }))
          setSources((s) => ({ ...s, [w.key]: r.from }))
          setErrors((e) => {
            const { [w.key]: _, ...rest } = e
            void _
            return rest
          })
        })
        .catch((e: Error) => alive && setErrors((x) => ({ ...x, [w.key]: e.message })))
    }
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, force])
  const pending = wanted.filter((w) => !legs[w.key] && !errors[w.key]).length
  return { legs, sources, errors, pending, refresh: () => setForce((f) => f + 1) }
}

export function useChargers(): ChargerData | null {
  const [d, setD] = useState<ChargerData | null>(null)
  useEffect(() => {
    loadChargers().then(setD).catch(() => setD(null))
  }, [])
  return d
}

export function useHolidays(year: number): HolidayData | null {
  const [d, setD] = useState<HolidayData | null>(null)
  useEffect(() => {
    loadHolidays(year, ['GB', 'FR', 'BE', 'NL', 'LU', 'DE', 'CH', 'LI', 'AT', 'IT', 'SI', 'CZ', 'HR']).then(setD).catch(() => setD(null))
  }, [year])
  return d
}

export function useTripModel() {
  const state = useTripState()
  const plan = useMemo(() => buildPlan(state), [state])
  const legStatus = useLegs(plan)
  const chargers = useChargers()
  const holidays = useHolidays(Number(state.startDate.slice(0, 4)))
  const days: DayStats[] = useMemo(
    () => plan.days.map((d) => computeDay(d, legStatus.legs, chargers?.sites ?? null, state, holidays)),
    [plan, legStatus.legs, chargers, state, holidays],
  )
  const tot = useMemo(() => totals(plan, days), [plan, days])
  const costLines = useMemo(() => costs(plan, days, state), [plan, days, state])
  return { state, plan, legStatus, chargers, holidays, days, totals: tot, costs: costLines }
}

export type TripModel = ReturnType<typeof useTripModel>

const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      mq?.addEventListener('change', cb)
      return () => mq?.removeEventListener('change', cb)
    },
    () => !!mq?.matches,
    () => false,
  )
}

export function useMediaQuery(q: string): boolean {
  const m = useMemo(() => (typeof window !== 'undefined' ? window.matchMedia(q) : null), [q])
  return useSyncExternalStore(
    (cb) => {
      m?.addEventListener('change', cb)
      return () => m?.removeEventListener('change', cb)
    },
    () => !!m?.matches,
    () => false,
  )
}
