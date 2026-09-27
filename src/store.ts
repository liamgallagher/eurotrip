import { create } from 'zustand'
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { ROUTE_BY_ID } from './data/routes'
import { PLACES } from './data/places'
import { EXCLUSIONS } from './data/exclusions'
import { DEFAULT_STATE, defaultStops, optKey, optionOn, type CrossingId, type Direction, type TripState, type Weights } from './lib/state'
import type { Category } from './data/types'

const LS_KEY = 'eurotrip:v1'
const HOME_KEY = 'eurotrip:home'

function sanitize(s: Partial<TripState>): TripState {
  const st: TripState = { ...DEFAULT_STATE, ...s, weights: { ...DEFAULT_STATE.weights, ...(s.weights ?? {}) } }
  for (const dir of ['out', 'ret'] as const) {
    const c = { ...DEFAULT_STATE[dir], ...(s[dir] ?? {}) }
    const r = ROUTE_BY_ID[c.route] ? c.route : DEFAULT_STATE[dir].route
    const slots = ROUTE_BY_ID[r].stops
    const stops = slots.map((slot, i) => {
      const want = c.stops?.[i]
      return want && (want === slot.default || slot.swaps.includes(want)) && PLACES[want] ? want : slot.default
    })
    const nights = slots.map((_, i) => Math.max(0, Math.min(3, Math.round(c.nights?.[i] ?? 1))))
    st[dir] = { route: r, stops, nights, crossing: c.crossing === 'ferry' ? 'ferry' : 'tunnel' }
  }
  st.sloveniaNights = Math.max(1, Math.min(10, Math.round(st.sloveniaNights)))
  st.compare = (st.compare ?? []).filter((id) => ROUTE_BY_ID[id]).slice(0, 3)
  if (st.compare.length < 2) st.compare = DEFAULT_STATE.compare
  st.reinstated = (st.reinstated ?? []).filter((id) => EXCLUSIONS.some((x) => x.id === id))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(st.startDate)) st.startDate = DEFAULT_STATE.startDate
  return st
}

export function encodeState(s: TripState): string {
  return compressToEncodedURIComponent(JSON.stringify(s))
}

export function decodeState(str: string): TripState | null {
  try {
    const json = decompressFromEncodedURIComponent(str)
    if (!json) return null
    return sanitize(JSON.parse(json))
  } catch {
    return null
  }
}

function initial(): { state: TripState; fromUrl: boolean } {
  if (typeof window !== 'undefined') {
    const m = window.location.hash.match(/[#&]p=([^&]+)/)
    if (m) {
      const s = decodeState(m[1])
      if (s) return { state: s, fromUrl: true }
    }
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) return { state: sanitize(JSON.parse(raw)), fromUrl: false }
    } catch { /* ignore */ }
  }
  return { state: DEFAULT_STATE, fromUrl: false }
}

interface Actions {
  set: (patch: Partial<TripState>) => void
  setRoute: (dir: Direction, routeId: string) => void
  setStop: (dir: Direction, slot: number, placeId: string) => void
  setStopNights: (dir: Direction, slot: number, nights: number) => void
  adjustNights: (dir: Direction, delta: number) => void
  setCrossing: (dir: Direction, c: CrossingId) => void
  toggleOption: (routeId: string, day: number, opt: string) => void
  toggleStar: (id: string) => void
  toggleCompare: (id: string) => void
  setWeight: (k: keyof Weights, v: number) => void
  toggleCategory: (c: Category) => void
  toggleReinstate: (id: string) => void
  reset: () => void
}

const init = initial()
export const openedFromShare = init.fromUrl

export const useTrip = create<TripState & Actions>()((set) => ({
  ...init.state,
  set: (patch) => set(patch),
  setRoute: (dir, routeId) =>
    set((s) => ({ [dir]: { ...s[dir], route: routeId, stops: defaultStops(routeId), nights: [1, 1, 1, 1, 1] } }) as Partial<TripState>),
  setStop: (dir, slot, placeId) =>
    set((s) => {
      const stops = [...s[dir].stops]
      stops[slot] = placeId
      return { [dir]: { ...s[dir], stops } } as Partial<TripState>
    }),
  setStopNights: (dir, slot, nights) =>
    set((s) => {
      const n = [...s[dir].nights]
      n[slot] = Math.max(0, Math.min(3, nights))
      return { [dir]: { ...s[dir], nights: n } } as Partial<TripState>
    }),
  adjustNights: (dir, delta) =>
    set((s) => {
      const cfg = s[dir]
      const n = [...cfg.nights]
      const ev = cfg.stops.map((id) => PLACES[id].evening)
      if (delta > 0) {
        // give an extra night to the best evening town that has the fewest nights
        let best = -1
        for (let i = 0; i < n.length; i++) if (n[i] < 3 && (best < 0 || n[i] < n[best] || (n[i] === n[best] && ev[i] > ev[best]))) best = i
        if (best >= 0) n[best]++
      } else {
        // remove a night from the weakest evening stop that has the most nights
        let worst = -1
        for (let i = 0; i < n.length; i++) if (n[i] > 0 && (worst < 0 || n[i] > n[worst] || (n[i] === n[worst] && ev[i] < ev[worst]))) worst = i
        if (worst >= 0) n[worst]--
      }
      return { [dir]: { ...cfg, nights: n } } as Partial<TripState>
    }),
  setCrossing: (dir, c) => set((s) => ({ [dir]: { ...s[dir], crossing: c } }) as Partial<TripState>),
  toggleOption: (routeId, day, opt) =>
    set((s) => ({ options: { ...s.options, [optKey(routeId, day, opt)]: !optionOn(s, routeId, day, opt) } })),
  toggleStar: (id) => set((s) => ({ stars: s.stars.includes(id) ? s.stars.filter((x) => x !== id) : [...s.stars, id] })),
  toggleCompare: (id) =>
    set((s) => {
      if (s.compare.includes(id)) return s.compare.length > 2 ? { compare: s.compare.filter((x) => x !== id) } : {}
      return { compare: s.compare.length >= 3 ? [...s.compare.slice(1), id] : [...s.compare, id] }
    }),
  setWeight: (k, v) => set((s) => ({ weights: { ...s.weights, [k]: v } })),
  toggleCategory: (c) => set((s) => ({ categories: s.categories.includes(c) ? s.categories.filter((x) => x !== c) : [...s.categories, c] })),
  toggleReinstate: (id) => set((s) => ({ reinstated: s.reinstated.includes(id) ? s.reinstated.filter((x) => x !== id) : [...s.reinstated, id] })),
  reset: () => set({ ...DEFAULT_STATE }),
}))

export function pickState(s: TripState & Actions): TripState {
  const { startDate, out, ret, sloveniaNights, options, reinstated, weights, stars, compare, cruiseKmh, minArrivalPct, categories } = s
  return { startDate, out, ret, sloveniaNights, options, reinstated, weights, stars, compare, cruiseKmh, minArrivalPct, categories }
}

// Persist locally + keep the URL shareable
let t: ReturnType<typeof setTimeout> | undefined
useTrip.subscribe((s) => {
  clearTimeout(t)
  t = setTimeout(() => {
    const st = pickState(s)
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(st))
    } catch { /* ignore */ }
    const url = `${window.location.pathname}${window.location.search}#p=${encodeState(st)}`
    window.history.replaceState(null, '', url)
  }, 250)
})

export function shareUrl(): string {
  return `${window.location.origin}${window.location.pathname}#p=${encodeState(pickState(useTrip.getState()))}`
}

export function getHome(): string {
  try {
    return localStorage.getItem(HOME_KEY) ?? ''
  } catch {
    return ''
  }
}
export function setHome(v: string) {
  try {
    if (v) localStorage.setItem(HOME_KEY, v)
    else localStorage.removeItem(HOME_KEY)
  } catch { /* ignore */ }
}

// Transient UI state (not persisted)
interface UiState {
  day: number | null
  hoverKm: number | null
  playing: boolean
  flying: boolean
  setDay: (d: number | null) => void
  setHoverKm: (k: number | null) => void
  setPlaying: (p: boolean) => void
  setFlying: (p: boolean) => void
}
export const useUi = create<UiState>()((set) => ({
  day: null,
  hoverKm: null,
  playing: false,
  flying: false,
  setDay: (day) => set({ day, hoverKm: null }),
  setHoverKm: (hoverKm) => set({ hoverKm }),
  setPlaying: (playing) => set({ playing }),
  setFlying: (flying) => set({ flying }),
}))
