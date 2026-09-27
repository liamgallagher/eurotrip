import { FIXED, PLACES } from '../data/places'
import { ROUTE_BY_ID } from '../data/routes'
import { EXCLUSIONS } from '../data/exclusions'
import { CROSSINGS, type Crossing } from '../data/costs'
import type { DayDef, Place, Via } from '../data/types'
import { haversine } from './geo'
import { legKey, type Waypoint } from './legs'
import { optionOn, type Direction, type TripState } from './state'

export type Segment =
  | { kind: 'drive'; waypoints: Waypoint[]; key: string }
  | { kind: 'crossing'; crossing: Crossing }

export interface DayHighlight {
  id: string
  optional: boolean
}

export interface PlanDay {
  n: number
  date: string
  dir: Direction | 'base'
  kind: 'drive' | 'rest' | 'base' | 'ferry-night' | 'ferry-arrival'
  routeId?: string
  /** indices into the route definition's days (Channel→Slovenia order) covered by this day */
  defDays: number[]
  title: string
  from: Place
  to: Place
  segments: Segment[]
  highlights: DayHighlight[]
  notes: string[]
  sleep: Place | 'ferry' | 'home'
}

export interface Night {
  date: string
  place: Place | null
  label: string
  cc: string
  kind: 'road-out' | 'road-ret' | 'base' | 'ferry'
}

export interface Warning {
  level: 'info' | 'warn' | 'error'
  text: string
}

export interface Plan {
  days: PlanDay[]
  nights: Night[]
  warnings: Warning[]
  outNights: number
  retNights: number
  ferryNights: number
  totalNights: number
  endDate: string
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const wp = (p: Place | Via): Waypoint => ({ name: p.name, lat: p.lat, lon: p.lon })

function dayVias(state: TripState, routeId: string, dayIdx: number, def: DayDef): Via[] {
  const vias = def.vias.filter((v) => {
    if (v.opt && !optionOn(state, routeId, dayIdx, v.opt)) return false
    if (v.unlessOpt && optionOn(state, routeId, dayIdx, v.unlessOpt)) return false
    return true
  })
  return vias
}

function dayHighlights(state: TripState, routeId: string, dayIdx: number, def: DayDef): DayHighlight[] {
  const out: DayHighlight[] = def.highlights.map((id) => ({ id, optional: false }))
  for (const o of def.options ?? []) {
    if (optionOn(state, routeId, dayIdx, o.id)) out.push(...o.highlights.map((id) => ({ id, optional: true })))
  }
  return out
}

/** Insert a via where it adds the least straight-line detour. */
function insertCheapest(chain: Waypoint[], via: Waypoint): Waypoint[] {
  let best = 1
  let bestCost = Infinity
  for (let i = 1; i < chain.length; i++) {
    const a = chain[i - 1], b = chain[i]
    const cost = haversine([a.lon, a.lat], [via.lon, via.lat]) + haversine([via.lon, via.lat], [b.lon, b.lat]) - haversine([a.lon, a.lat], [b.lon, b.lat])
    if (cost < bestCost) {
      bestCost = cost
      best = i
    }
  }
  return [...chain.slice(0, best), via, ...chain.slice(best)]
}

/** Remove vias that sit on top of their neighbour (e.g. a swapped stop that is also a via). */
function dropNear(chain: Waypoint[]): Waypoint[] {
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

function dedupeHighlights(list: DayHighlight[]): DayHighlight[] {
  const seen = new Map<string, DayHighlight>()
  for (const h of list) {
    const e = seen.get(h.id)
    if (!e) seen.set(h.id, h)
    else if (!h.optional) e.optional = false
  }
  return [...seen.values()]
}

interface DirectionDays {
  days: Omit<PlanDay, 'n' | 'date'>[]
}

function buildDirection(state: TripState, dir: Direction): DirectionDays {
  const cfg = dir === 'out' ? state.out : state.ret
  const route = ROUTE_BY_ID[cfg.route]
  const crossing = CROSSINGS[cfg.crossing]
  const port = PLACES[crossing.to] // continental port (Calais / Caen)
  const lj = FIXED.ljubljana
  const stops = cfg.stops.map((id) => PLACES[id])
  // Nodes in Channel→Slovenia order: port, stops…, Ljubljana. Def day i connects node i → i+1.
  const nodes: Place[] = [port, ...stops, lj]
  const nightsAt = (nodeIdx: number) => (nodeIdx >= 1 && nodeIdx <= 5 ? cfg.nights[nodeIdx - 1] ?? 1 : 1)

  const reinstated = EXCLUSIONS.filter((x) => x.reinstate && state.reinstated.includes(x.id) && x.reinstate.routeId === route.id)

  // Build per-def-day pieces in outbound orientation.
  const pieces = route.days.map((def, i) => {
    let vias = dayVias(state, route.id, i, def).map(wp)
    let hl = dayHighlights(state, route.id, i, def)
    const notes = [...(def.notes ?? [])]
    for (const x of reinstated.filter((r) => r.reinstate!.dayIndex === i)) {
      const from = wp(nodes[i]), to = wp(nodes[i + 1])
      vias = insertCheapest([from, ...vias, to], wp(x.reinstate!.via)).slice(1, -1)
      if (x.reinstate!.highlight) hl = [...hl, { id: x.reinstate!.highlight, optional: true }]
      notes.push(`⚠ ${x.name} reinstated: ${x.reinstate!.warning}`)
    }
    return { def, i, vias, hl, notes }
  })

  // Orientation for this direction
  const order = dir === 'out' ? pieces : [...pieces].reverse().map((p) => ({ ...p, vias: [...p.vias].reverse() }))
  const nodeSeq = dir === 'out' ? nodes : [...nodes].reverse()
  const nightsSeq = dir === 'out' ? nodes.map((_, k) => nightsAt(k)) : nodes.map((_, k) => nightsAt(k)).reverse()

  const days: Omit<PlanDay, 'n' | 'date'>[] = []
  let start = 0
  let accVias: Waypoint[] = []
  let accHl: DayHighlight[] = []
  let accNotes: string[] = []
  let accDefs: number[] = []
  let accTitles: string[] = []
  for (let k = 0; k < order.length; k++) {
    const p = order[k]
    accVias.push(...p.vias)
    accHl.push(...p.hl)
    accNotes.push(...p.notes)
    accDefs.push(p.i)
    accTitles.push(p.def.title)
    const nextIdx = k + 1
    const next = nodeSeq[nextIdx]
    const isEnd = nextIdx === nodeSeq.length - 1
    const nights = nightsSeq[nextIdx]
    if (!isEnd && nights < 1) {
      // pass straight through this stop
      accVias.push(wp(next))
      accHl.push(...next.highlights.map((id) => ({ id, optional: false })))
      accNotes.push(`Passing through ${next.name} without an overnight stop.`)
      continue
    }
    const from = nodeSeq[start]
    const waypoints = dropNear([wp(from), ...accVias, wp(next)])
    const segs: Segment[] = [{ kind: 'drive', waypoints, key: legKey(waypoints) }]
    const destHl = isEnd ? [] : next.highlights.map((id) => ({ id, optional: false }))
    days.push({
      dir,
      kind: 'drive',
      routeId: route.id,
      defDays: accDefs,
      title: accTitles.filter(Boolean).join(' · '),
      from,
      to: next,
      segments: segs,
      highlights: dedupeHighlights([...accHl, ...destHl]),
      notes: [...accNotes, ...(next.notes ?? []), ...(next.charging ? [next.charging] : [])],
      sleep: next,
    })
    for (let r = 1; r < nights && !isEnd; r++) {
      days.push({
        dir,
        kind: 'rest',
        routeId: route.id,
        defDays: [],
        title: `A second night in ${next.name}`,
        from: next,
        to: next,
        segments: [],
        highlights: next.highlights.map((id) => ({ id, optional: false })),
        notes: ['No driving — explore on foot.'],
        sleep: next,
      })
    }
    start = nextIdx
    accVias = []
    accHl = []
    accNotes = []
    accDefs = []
    accTitles = []
  }
  return { days }
}

export function buildPlan(state: TripState): Plan {
  const home = FIXED.home
  const warnings: Warning[] = []
  const out = buildDirection(state, 'out')
  const ret = buildDirection(state, 'ret')
  const outX = CROSSINGS[state.out.crossing]
  const retX = CROSSINGS[state.ret.crossing]

  const days: PlanDay[] = []
  let date = state.startDate
  let n = 1
  const push = (d: Omit<PlanDay, 'n' | 'date'>) => {
    days.push({ ...d, n: n++, date })
    date = addDays(date, 1)
  }

  // Outbound
  const homeToPort = (x: Crossing): Segment => {
    const wps = [wp(home), wp(PLACES[x.from])]
    return { kind: 'drive', waypoints: wps, key: legKey(wps) }
  }
  const portToHome = (x: Crossing): Segment => {
    const wps = [wp(PLACES[x.from]), wp(home)]
    return { kind: 'drive', waypoints: wps, key: legKey(wps) }
  }

  if (outX.overnight) {
    push({
      dir: 'out', kind: 'ferry-night', defDays: [], title: 'Overnight ferry to Normandy', from: home, to: PLACES[outX.to],
      segments: [homeToPort(outX), { kind: 'crossing', crossing: outX }], highlights: [],
      notes: ['Evening departure (~23:00) from Portsmouth; arrive Caen 06:45–07:30. Book a cabin.'], sleep: 'ferry',
    })
  }
  out.days.forEach((d, i) => {
    if (i === 0 && !outX.overnight) {
      push({ ...d, segments: [homeToPort(outX), { kind: 'crossing', crossing: outX }, ...d.segments], from: home, notes: ['Allow 1–2 h at Folkestone: check-in closes 1 h before departure. Clocks go forward 1 h in France.', ...d.notes] })
    } else push(d)
  })

  // Slovenia base
  const lj = FIXED.ljubljana
  for (let i = 1; i < state.sloveniaNights; i++) {
    push({ dir: 'base', kind: 'base', defDays: [], title: 'Slovenia day', from: lj, to: lj, segments: [], highlights: [], notes: [], sleep: lj })
  }

  // Return
  ret.days.forEach((d, i) => {
    const last = i === ret.days.length - 1
    if (last && !retX.overnight) {
      push({ ...d, segments: [...d.segments, { kind: 'crossing', crossing: retX }, portToHome(retX)], to: home, sleep: 'home', notes: [...d.notes, 'Eurotunnel check-in closes 1 h before departure; you gain an hour back in the UK.'] })
    } else if (last && retX.overnight) {
      push({ ...d, segments: [...d.segments, { kind: 'crossing', crossing: retX }], sleep: 'ferry', notes: [...d.notes, 'Overnight ferry from Caen (~23:00). Cabin needed.'] })
      push({ dir: 'ret', kind: 'ferry-arrival', defDays: [], title: 'Portsmouth and home', from: PLACES[retX.from], to: home, segments: [portToHome(retX)], highlights: [], notes: ['Early arrival in Portsmouth — 30 min home.'], sleep: 'home' })
    } else push(d)
  })

  // Nights
  const nights: Night[] = []
  for (const d of days) {
    if (d.sleep === 'home') continue
    if (d.sleep === 'ferry') nights.push({ date: d.date, place: null, label: 'On board ferry', cc: 'FR', kind: 'ferry' })
    else nights.push({ date: d.date, place: d.sleep, label: d.sleep.name, cc: d.sleep.country, kind: d.dir === 'base' || d.sleep.id === 'ljubljana' ? 'base' : d.dir === 'out' ? 'road-out' : 'road-ret' })
  }
  const outNights = state.out.nights.reduce((a, b) => a + b, 0)
  const retNights = state.ret.nights.reduce((a, b) => a + b, 0)
  const ferryNights = (outX.overnight ? 1 : 0) + (retX.overnight ? 1 : 0)
  const totalNights = nights.length

  if (totalNights !== 14) {
    warnings.push({ level: 'warn', text: `Plan is ${totalNights} nights, not 14 (${outNights} out + ${state.sloveniaNights} Slovenia + ${retNights} return${ferryNights ? ` + ${ferryNights} on the ferry` : ''}).` })
  }
  if (state.out.route === state.ret.route) warnings.push({ level: 'warn', text: 'Outbound and return use the same route — you asked for different routes each way.' })
  const outIds = new Set(days.filter((d) => d.dir === 'out' && d.sleep !== 'ferry' && d.sleep !== 'home').map((d) => (d.sleep as Place).id))
  const repeats = days.filter((d) => d.dir === 'ret' && typeof d.sleep === 'object' && outIds.has(d.sleep.id)).map((d) => (d.sleep as Place).name)
  if (repeats.length) warnings.push({ level: 'warn', text: `Repeated overnight stop: ${[...new Set(repeats)].join(', ')}. Swap one in the builder.` })
  // near-duplicates (< 25 km)
  const outPlaces = days.filter((d) => d.dir === 'out' && typeof d.sleep === 'object').map((d) => d.sleep as Place)
  const retPlaces = days.filter((d) => d.dir === 'ret' && typeof d.sleep === 'object' && d.sleep.id !== 'southampton').map((d) => d.sleep as Place)
  for (const a of outPlaces) for (const b of retPlaces) {
    if (a.id !== b.id && a.id !== 'ljubljana' && haversine([a.lon, a.lat], [b.lon, b.lat]) < 25000) warnings.push({ level: 'info', text: `${a.name} (out) and ${b.name} (back) are within 25 km of each other.` })
  }
  if (ROUTE_BY_ID[state.out.route].directions === 'return-only') warnings.push({ level: 'error', text: `${ROUTE_BY_ID[state.out.route].name} is designed as a return route only.` })
  for (const id of state.reinstated) {
    const x = EXCLUSIONS.find((e) => e.id === id)
    if (x?.reinstate) warnings.push({ level: 'warn', text: `${x.name} reinstated: ${x.reinstate.warning}` })
  }

  const endDate = days[days.length - 1]?.date ?? state.startDate
  return { days, nights, warnings, outNights, retNights, ferryNights, totalNights, endDate }
}
