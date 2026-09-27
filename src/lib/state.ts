import type { Category } from '../data/types'
import { ROUTE_BY_ID } from '../data/routes'

export type Direction = 'out' | 'ret'
export type CrossingId = 'tunnel' | 'ferry'

export interface Weights {
  scenery: number
  evenings: number
  charging: number
  may: number
}

export interface TripState {
  startDate: string
  out: { route: string; stops: string[]; nights: number[]; crossing: CrossingId }
  ret: { route: string; stops: string[]; nights: number[]; crossing: CrossingId }
  sloveniaNights: number
  /** `${routeId}:${dayIndex}:${optionId}` → on/off overrides */
  options: Record<string, boolean>
  reinstated: string[]
  weights: Weights
  stars: string[]
  compare: string[]
  cruiseKmh: number
  minArrivalPct: number
  categories: Category[]
}

export const DEFAULT_WEIGHTS: Weights = { scenery: 10, evenings: 6, charging: 4, may: 4 }

export function defaultStops(routeId: string): string[] {
  return ROUTE_BY_ID[routeId].stops.map((s) => s.default)
}

export const DEFAULT_STATE: TripState = {
  // Public example week. Your real dates live in your share link / this browser, not in the public page.
  startDate: '2027-05-03',
  out: { route: 'r1', stops: defaultStops('r1'), nights: [1, 1, 1, 1, 1], crossing: 'tunnel' },
  ret: { route: 'r2', stops: defaultStops('r2'), nights: [1, 1, 1, 1, 1], crossing: 'tunnel' },
  sloveniaNights: 4,
  options: {},
  reinstated: [],
  weights: DEFAULT_WEIGHTS,
  stars: [],
  compare: ['r1', 'r2', 'r3'],
  cruiseKmh: 120,
  minArrivalPct: 15,
  categories: [],
}

export const optKey = (routeId: string, day: number, opt: string) => `${routeId}:${day}:${opt}`

export function optionOn(state: Pick<TripState, 'options'>, routeId: string, day: number, opt: string): boolean {
  const k = optKey(routeId, day, opt)
  if (k in state.options) return state.options[k]
  return ROUTE_BY_ID[routeId]?.days[day]?.options?.find((o) => o.id === opt)?.defaultOn ?? false
}
