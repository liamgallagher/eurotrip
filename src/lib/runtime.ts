import { get as idbGet, set as idbSet } from 'idb-keyval'
import { browserDecoder, DemSampler } from './dem'
import { CountryIndex, type CountryShape } from './countries'
import { buildLeg, hydrate, LEG_FORMAT, type Leg, type LegData, type Waypoint } from './legs'
import type { Charger } from './charging'

// Browser-side data access: static snapshot files first, then IndexedDB, then live APIs.

const BASE = import.meta.env.BASE_URL
const OSRM = (import.meta.env.VITE_OSRM_URL as string | undefined) || undefined

let countriesP: Promise<CountryIndex> | null = null
export function loadCountries(): Promise<CountryIndex> {
  countriesP ??= fetch(`${BASE}data/countries.json`).then((r) => r.json()).then((s: CountryShape[]) => new CountryIndex(s))
  return countriesP
}

export interface ChargerData {
  source: string
  fetchedAt: string
  sites: Charger[]
}
let chargersP: Promise<ChargerData> | null = null
export function loadChargers(): Promise<ChargerData> {
  chargersP ??= fetch(`${BASE}data/superchargers.json`).then((r) => r.json())
  return chargersP
}

let dem: DemSampler | null = null

export type LegSource = 'snapshot' | 'cache' | 'live'
export interface LoadedLeg {
  leg: Leg
  from: LegSource
}

const mem = new Map<string, Promise<LoadedLeg>>()

async function fromStatic(key: string): Promise<LegData | null> {
  try {
    const r = await fetch(`${BASE}data/legs/${key}.json`)
    if (!r.ok) return null
    const d = (await r.json()) as LegData
    return d.v === LEG_FORMAT ? d : null
  } catch {
    return null
  }
}

async function live(key: string, wps: Waypoint[]): Promise<LegData> {
  dem ??= new DemSampler(browserDecoder)
  const countries = await loadCountries()
  const d = await buildLeg(wps, { dem, countries, osrmUrl: OSRM })
  if (d.key !== key) d.key = key
  try {
    await idbSet(`leg:${key}`, d)
  } catch { /* private mode */ }
  return d
}

export function loadLeg(key: string, wps: Waypoint[], opts: { forceLive?: boolean } = {}): Promise<LoadedLeg> {
  if (!opts.forceLive) {
    const hit = mem.get(key)
    if (hit) return hit
  }
  const p = (async (): Promise<LoadedLeg> => {
    if (!opts.forceLive) {
      try {
        const cached = (await idbGet(`leg:${key}`)) as LegData | undefined
        if (cached && cached.v === LEG_FORMAT) return { leg: hydrate(cached), from: 'cache' }
      } catch { /* ignore */ }
      const s = await fromStatic(key)
      if (s) return { leg: hydrate(s), from: 'snapshot' }
    }
    return { leg: hydrate(await live(key, wps)), from: 'live' }
  })()
  mem.set(key, p)
  p.catch(() => mem.delete(key))
  return p
}

// ——— Holidays
export interface NagerHoliday {
  date: string
  localName: string
  name: string
  countryCode: string
  global: boolean
  counties: string[] | null
  types: string[]
}
export interface HolidayData {
  year: number
  fetchedAt: string
  live: boolean
  public: Record<string, NagerHoliday[]>
}

const holidayP = new Map<number, Promise<HolidayData>>()
export function loadHolidays(year: number, countries: string[]): Promise<HolidayData> {
  const k = year
  let p = holidayP.get(k)
  if (!p) {
    p = (async () => {
      let fallback: HolidayData | null = null
      try {
        const r = await fetch(`${BASE}data/holidays-${year}.json`)
        if (r.ok) {
          const j = await r.json()
          fallback = { year, fetchedAt: j.fetchedAt, live: false, public: j.public }
        }
      } catch { /* ignore */ }
      const pub: Record<string, NagerHoliday[]> = { ...(fallback?.public ?? {}) }
      let anyLive = false
      await Promise.all(
        countries.map(async (cc) => {
          try {
            const r = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${cc}`)
            if (r.ok) {
              pub[cc] = await r.json()
              anyLive = true
            }
          } catch { /* offline → fallback */ }
        }),
      )
      return { year, fetchedAt: anyLive ? new Date().toISOString() : fallback?.fetchedAt ?? '', live: anyLive, public: pub }
    })()
    holidayP.set(k, p)
  }
  return p
}
