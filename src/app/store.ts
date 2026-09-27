import { create } from 'zustand'
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { PLACES } from '../data/places'
import { ALL_HIGHLIGHTS } from '../lib/scoring'
import { emptyState } from './engine/trip'
import { DEFAULT_SETTINGS, ELIGIBLE, type Person, type PlannerState, type Stop } from './engine/planner'
import type { Dir } from './engine/curated'

// App state: the plan (saved in this browser and in share links) and the view state (never saved).

const KEY = 'eurotrip:v2'
const CLASSIC_KEY = 'eurotrip:v1'

export type Panel = 'options' | 'day' | 'candidates' | 'discover' | 'sheet' | 'journal' | 'settings' | null
export type SheetTab = 'days' | 'hearts' | 'costs' | 'checks'
export type ViewMode = '3d' | '2d' | 'list'

export interface UIState {
  panel: Panel
  day: number | null
  cand: { dir: Dir; slot: number } | null
  focusCand: string | null
  sheetTab: SheetTab
  view: ViewMode
  ribbon: 0 | 1 | 2
  /** minutes after midnight; null = follow the selected day */
  sunMin: number | null
  hoverOption: string | null
  hoverHighlight: string | null
  toast: string | null
}

function clean(s: Partial<PlannerState>): PlannerState {
  const base = emptyState()
  const st: PlannerState = { ...base, ...s, v: 2, settings: { ...DEFAULT_SETTINGS, ...(s.settings ?? {}) } }
  const okStops = (xs: Stop[] | undefined) => (xs ?? []).filter((x) => x && ELIGIBLE.includes(x.place)).map((x) => ({ place: x.place, nights: Math.max(1, Math.min(3, Math.round(x.nights || 1))), ...(x.firm ? { firm: true } : {}) }))
  for (const d of ['out', 'ret'] as const) st[d] = { crossing: s[d]?.crossing === 'ferry' ? 'ferry' : 'tunnel', stops: okStops(s[d]?.stops) }
  st.hearts = { liam: (s.hearts?.liam ?? []).filter((id) => ALL_HIGHLIGHTS[id]), tatiana: (s.hearts?.tatiana ?? []).filter((id) => ALL_HIGHLIGHTS[id]) }
  st.who = s.who === 'tatiana' ? 'tatiana' : 'liam'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(st.startDate)) st.startDate = base.startDate
  st.sloveniaNights = Math.max(1, Math.min(10, Math.round(st.sloveniaNights || 4)))
  st.days = typeof s.days === 'object' && s.days ? s.days : {}
  return st
}

/** Bring over dates, stops and shortlisted places from the classic planner (stars were Liam's). */
function fromClassic(raw: string): PlannerState | null {
  try {
    const c = JSON.parse(raw) as { startDate?: string; stars?: string[]; out?: { stops?: string[]; crossing?: string }; ret?: { stops?: string[]; crossing?: string } }
    const st = emptyState(c.startDate)
    st.hearts.liam = (c.stars ?? []).filter((id) => ALL_HIGHLIGHTS[id])
    const conv = (xs?: string[], rev = false) => {
      const list = (xs ?? []).filter((p) => PLACES[p] && ELIGIBLE.includes(p)).map((place) => ({ place, nights: 1 }))
      return rev ? list.reverse() : list
    }
    st.out = { crossing: c.out?.crossing === 'ferry' ? 'ferry' : 'tunnel', stops: conv(c.out?.stops) }
    // classic stored every route Channel → Slovenia; the return runs the other way
    st.ret = { crossing: c.ret?.crossing === 'ferry' ? 'ferry' : 'tunnel', stops: conv(c.ret?.stops, true) }
    return clean(st)
  } catch {
    return null
  }
}

export function encodePlan(s: PlannerState) {
  return compressToEncodedURIComponent(JSON.stringify(s))
}

function initial(): { plan: PlannerState; fromLink: boolean; fresh: boolean } {
  if (typeof window !== 'undefined') {
    const m = location.hash.match(/[#&]t=([^&]+)/)
    if (m) {
      try {
        const j = decompressFromEncodedURIComponent(m[1])
        if (j) return { plan: clean(JSON.parse(j)), fromLink: true, fresh: false }
      } catch { /* ignore */ }
    }
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) return { plan: clean(JSON.parse(raw)), fromLink: false, fresh: false }
      const classic = localStorage.getItem(CLASSIC_KEY)
      if (classic) {
        const c = fromClassic(classic)
        if (c) return { plan: c, fromLink: false, fresh: !c.out.stops.length }
      }
    } catch { /* private mode */ }
  }
  return { plan: emptyState(), fromLink: false, fresh: true }
}

const init = initial()
export const openedFromLink = init.fromLink

interface Store extends UIState {
  plan: PlannerState
  fresh: boolean
  setPlan: (p: PlannerState | ((p: PlannerState) => PlannerState)) => void
  ui: (patch: Partial<UIState>) => void
  toggleHeart: (id: string, who?: Person) => void
  setWho: (p: Person) => void
}

export const useApp = create<Store>((set, get) => ({
  plan: init.plan,
  fresh: init.fresh,
  panel: init.fresh ? 'options' : null,
  day: null,
  cand: null,
  focusCand: null,
  sheetTab: 'days',
  view: '3d',
  ribbon: 0,
  sunMin: null,
  hoverOption: null,
  hoverHighlight: null,
  toast: null,
  setPlan: (p) => set((s) => ({ plan: typeof p === 'function' ? p(s.plan) : p, fresh: false })),
  ui: (patch) => set(patch),
  toggleHeart: (id, who) => {
    const w = who ?? get().plan.who
    set((s) => {
      const list = s.plan.hearts[w]
      const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
      return { plan: { ...s.plan, hearts: { ...s.plan.hearts, [w]: next } } }
    })
  },
  setWho: (p) => set((s) => ({ plan: { ...s.plan, who: p } })),
}))

// persist the plan (debounced) — share links are made on demand
let t: ReturnType<typeof setTimeout> | undefined
useApp.subscribe((s, prev) => {
  if (s.plan === prev.plan) return
  clearTimeout(t)
  t = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s.plan))
    } catch { /* private mode */ }
    if (location.hash.includes('t=')) history.replaceState(null, '', location.pathname + location.search)
  }, 300)
})

export function shareUrl(): string {
  const url = new URL(location.href)
  url.hash = `t=${encodePlan(useApp.getState().plan)}`
  return url.toString()
}
