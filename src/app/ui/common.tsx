import { useMemo } from 'react'
import { PLACES } from '../../data/places'
import { ALL_HIGHLIGHTS } from '../../lib/scoring'
import { FLAGS } from '../../lib/countries'
import { PEOPLE, PERSON, type Person, type Planner, type PlannerState } from '../engine/planner'
import { suggest, type Suggestion } from '../engine/trip'
import type { PathResult } from '../engine/planner'
import { useApp } from '../store'

export const OUT = '#ff8a5c'
export const RET = '#5ee7ff'
export const GOLD = '#ffcf5a'
export const OPTION_COLORS = ['#ffd166', '#f472b6', '#34d399']

export const placeName = (id: string) => (PLACES[id]?.name ?? id).replace(/ \((.*)\)/, '')
export const shortName = (id: string) => placeName(id).split(/ \/ | im | am | ob der /)[0]
export const flag = (cc: string) => FLAGS[cc] ?? ''
export const hName = (id: string) => ALL_HIGHLIGHTS[id]?.name ?? id

export const clock = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
export const dur = (min: number) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60)
  return h ? `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}` : `${m} min`
}

/** Photo id for a place: its first highlight with a photo. */
export const placePhoto = (id: string) => PLACES[id]?.highlights[0]

/** Two-tone heart: who loves this place. */
export function Hearts({ id, size = 'md' }: { id: string; size?: 'sm' | 'md' | 'lg' }) {
  const plan = useApp((s) => s.plan)
  const toggle = useApp((s) => s.toggleHeart)
  return (
    <span className={`hearts hearts--${size}`} role="group" aria-label={`Hearts for ${hName(id)}`}>
      {PEOPLE.map((p) => {
        const on = plan.hearts[p].includes(id)
        return (
          <button key={p} type="button" className={`heart heart--${p} ${on ? 'is-on' : ''}`} aria-pressed={on} title={`${PERSON[p].name}${on ? ' loves this' : ': tap to heart'}`} aria-label={`${PERSON[p].name} ${on ? 'unheart' : 'heart'} ${hName(id)}`} onClick={(e) => { e.stopPropagation(); toggle(id, p) }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3.2 4.5 7 4.5c2.1 0 3.8 1.2 5 3 1.2-1.8 2.9-3 5-3 3.8 0 6.1 3.8 4.6 7.2C19.5 16.4 12 21 12 21z" /></svg>
            <span className="heart__who">{PERSON[p].name[0]}</span>
          </button>
        )
      })}
    </span>
  )
}

export function whoLoves(plan: PlannerState, id: string): Person[] {
  return PEOPLE.filter((p) => plan.hearts[p].includes(id))
}

// ——— suggestions, shared by the cards panel and the map pins

const cache = new WeakMap<PlannerState, Map<string, { list: Suggestion[]; baseline: PathResult }>>()
export function useSuggestions(pl: Planner | null) {
  const plan = useApp((s) => s.plan)
  const cand = useApp((s) => s.cand)
  return useMemo(() => {
    if (!pl || !cand) return null
    let m = cache.get(plan)
    if (!m) {
      m = new Map()
      cache.set(plan, m)
    }
    const k = `${cand.dir}:${cand.slot}`
    let r = m.get(k)
    if (!r) {
      r = suggest(pl, plan, cand.dir, cand.slot)
      m.set(k, r)
    }
    return r
  }, [pl, plan, cand])
}

export function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

export const ICONS = {
  close: 'M6 6l12 12M18 6 6 18',
  sun: 'M12 4V2M12 22v-2M4.9 4.9 3.5 3.5M20.5 20.5l-1.4-1.4M4 12H2M22 12h-2M4.9 19.1l-1.4 1.4M20.5 3.5l-1.4 1.4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  share: 'M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
  cube: 'M12 2 3 7v10l9 5 9-5V7l-9-5zM3 7l9 5 9-5M12 12v10',
  play: 'M7 4v16l13-8z',
  pause: 'M7 4h4v16H7zM13 4h4v16h-4z',
  heart: 'M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3.2 4.5 7 4.5c2.1 0 3.8 1.2 5 3 1.2-1.8 2.9-3 5-3 3.8 0 6.1 3.8 4.6 7.2C19.5 16.4 12 21 12 21z',
  bolt: 'M13 2 3 14h8l-1 8 10-12h-8z',
  swap: 'M7 7h13l-4-4M17 17H4l4 4',
  chevL: 'M15 18l-6-6 6-6',
  chevR: 'M9 18l6-6-6-6',
  pin: 'M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4',
  camera: 'M3 7h4l2-3h6l2 3h4v13H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  route: 'M6 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 13V9a4 4 0 0 1 4-4h5M18 11v4a4 4 0 0 1-4 4H9',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  unlock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 7.5-2',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12l5 5L20 7',
  today: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4M8 14h3v3H8z',
}
