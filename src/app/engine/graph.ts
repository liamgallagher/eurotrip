import { haversine } from '../../lib/geo'
import { PLACES } from '../../data/places'
import { ALL_HIGHLIGHTS } from '../../lib/scoring'

// Drive times between every place and highlight (OSRM table snapshot, see scripts/build-matrix.ts).
// Node ids are 'p:<place>' and 'h:<highlight>'. Missing pairs fall back to a straight-line estimate.

export interface MatrixFile {
  builtAt: string
  source: string
  ids: string[]
  dur: number[]
  km: number[]
}

export interface CuratedRow {
  r: string
  d: number
  dir: 'out' | 'ret'
  from: string
  to: string
  key: string
  km: number
  min: number
  maxEle: number
  ascent: number
}

export class Graph {
  readonly builtAt: string
  private index = new Map<string, number>()
  private n: number
  private dur: number[]
  private km: number[]

  constructor(m: MatrixFile) {
    this.builtAt = m.builtAt
    m.ids.forEach((id, i) => this.index.set(id, i))
    this.n = m.ids.length
    this.dur = m.dur
    this.km = m.km
  }

  private coords(id: string): [number, number] | null {
    const [k, x] = [id.slice(0, 1), id.slice(2)]
    const o = k === 'p' ? PLACES[x] : ALL_HIGHLIGHTS[x]
    return o ? [o.lon, o.lat] : null
  }

  /** Minutes by road (estimate from distance when the pair is missing). */
  min(a: string, b: string): number {
    if (a === b) return 0
    const i = this.index.get(a), j = this.index.get(b)
    if (i != null && j != null) {
      const d = this.dur[i * this.n + j]
      if (d >= 0) return d
    }
    const ca = this.coords(a), cb = this.coords(b)
    if (!ca || !cb) return 9999
    return Math.round(((haversine(ca, cb) / 1000) * 1.3) / 75 * 60)
  }

  kmBetween(a: string, b: string): number {
    if (a === b) return 0
    const i = this.index.get(a), j = this.index.get(b)
    if (i != null && j != null) {
      const d = this.km[i * this.n + j]
      if (d >= 0) return d
    }
    const ca = this.coords(a), cb = this.coords(b)
    if (!ca || !cb) return 9999
    return Math.round((haversine(ca, cb) / 1000) * 1.3)
  }
}
