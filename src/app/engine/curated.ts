import { PLACES } from '../../data/places'
import { ROUTES } from '../../data/routes'
import type { Place, RouteDef, Via } from '../../data/types'
import { haversine } from '../../lib/geo'
import { legKey, type Waypoint } from '../../lib/legs'

// Curated days from the seven researched routes, re-usable between any of the stop options they were
// written for (default + swaps), in either direction. A curated day forces the scenic road with vias.

export type Dir = 'out' | 'ret'

export interface CuratedDay {
  route: RouteDef
  day: number
  dir: Dir
  from: string
  to: string
  vias: Via[]
  highlights: string[]
  /** highlights of options that are off by default: offered as detours */
  optional: string[]
  waypoints: Waypoint[]
  key: string
}

export const PORTS = ['calais', 'caen'] as const
export const SLOVENIA = 'ljubljana'

const wp = (p: Place | Via): Waypoint => ({ name: p.name, lat: p.lat, lon: p.lon })

/** Remove vias that sit on top of a neighbour (a swapped stop that is also a via). */
export function dropNear(chain: Waypoint[]): Waypoint[] {
  const out: Waypoint[] = [chain[0]]
  for (let i = 1; i < chain.length; i++) {
    const w = chain[i]
    const prev = out[out.length - 1]
    const isLast = i === chain.length - 1
    if (haversine([prev.lon, prev.lat], [w.lon, w.lat]) < 1500) {
      if (isLast) out[out.length - 1] = w
      continue
    }
    out.push(w)
  }
  if (out.length === 1) out.push(chain[chain.length - 1])
  return out
}

/** Stop options at each end of a route's day i (outbound numbering). */
export function slotOptions(r: RouteDef, i: number): { from: string[]; to: string[] } {
  const opts = (k: number) => (k < 0 ? [...PORTS] : k >= r.stops.length ? [SLOVENIA] : [r.stops[k].default, ...r.stops[k].swaps])
  return { from: opts(i - 1), to: opts(i) }
}

export function curatedDay(r: RouteDef, i: number, dir: Dir, a: string, b: string): CuratedDay {
  // a/b are given in travel order; the definition is written outbound.
  const def = r.days[i]
  const [outFrom, outTo] = dir === 'out' ? [a, b] : [b, a]
  const vias = def.vias.filter((v) => {
    const on = (id: string) => def.options?.find((o) => o.id === id)?.defaultOn ?? false
    if (v.opt && !on(v.opt)) return false
    if (v.unlessOpt && on(v.unlessOpt)) return false
    return true
  })
  const chainOut = dropNear([wp(PLACES[outFrom]), ...vias.map(wp), wp(PLACES[outTo])])
  const waypoints = dir === 'out' ? chainOut : [...chainOut].reverse()
  const highlights = [...def.highlights, ...(def.options ?? []).filter((o) => o.defaultOn).flatMap((o) => o.highlights)]
  const optional = (def.options ?? []).filter((o) => !o.defaultOn).flatMap((o) => o.highlights)
  return {
    route: r,
    day: i,
    dir,
    from: a,
    to: b,
    vias: dir === 'out' ? vias : [...vias].reverse(),
    highlights,
    optional,
    waypoints,
    key: legKey(waypoints),
  }
}

/** Every curated day between every pair of stop options, both directions where allowed. */
export function allCuratedDays(): CuratedDay[] {
  const out: CuratedDay[] = []
  for (const r of ROUTES) {
    const dirs: Dir[] = r.directions === 'both' ? ['out', 'ret'] : ['ret']
    for (const dir of dirs) {
      r.days.forEach((_, i) => {
        const { from, to } = slotOptions(r, i)
        for (const f of from) for (const t of to) {
          if (f === t) continue
          const [a, b] = dir === 'out' ? [f, t] : [t, f]
          out.push(curatedDay(r, i, dir, a, b))
        }
      })
    }
  }
  return out
}
