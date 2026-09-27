// Core data model. Every fact that can change carries sources + a lastChecked date.

export type CountryCode =
  | 'GB' | 'FR' | 'BE' | 'NL' | 'LU' | 'DE' | 'CH' | 'LI' | 'AT' | 'IT' | 'SI' | 'CZ' | 'HR'

export type Category =
  | 'scenic-road'
  | 'pass'
  | 'lake'
  | 'town'
  | 'landmark'
  | 'food-wine'
  | 'history'

/** May availability. open = reliably open all May; likely = normally open by early May;
 *  check = opens during May or has restrictions — verify nearer the time; closed = normally shut in May. */
export type MayStatus = 'open' | 'likely' | 'check' | 'closed'

export interface Source {
  label: string
  url: string
}

export interface Place {
  id: string
  name: string
  country: CountryCode
  lat: number
  lon: number
  /** 0–10: how good this is as a place to spend an evening (food, walkable old town, atmosphere). */
  evening: number
  blurb: string
  /** Highlight ids that belong to the overnight stop itself (swap the stop, swap these). */
  highlights: string[]
  /** Practical notes: parking, charging, hotel seasonality. */
  notes?: string[]
  /** Hotel destination-charging note. */
  charging?: string
}

export interface Highlight {
  id: string
  name: string
  category: Category
  country: CountryCode
  lat: number
  lon: number
  desc: string
  /** 0–10 scenic value (landscape drama, views). Towns can score here too. */
  scenic: number
  may: MayStatus
  mayNote?: string
  /** English Wikipedia title used to find a lead photo, or an explicit Commons file. */
  wiki?: string
  commons?: string
  tip?: string
  /** Fixed cost associated (e.g. toll road) – id into tolls table. */
  tollId?: string
  sources: Source[]
  lastChecked: string
}

export interface Via {
  name: string
  lat: number
  lon: number
  /** Only include this via when the named day option is switched on. */
  opt?: string
  /** Exclude this via when the named day option is switched on (for "instead of" options). */
  unlessOpt?: string
}

export interface DayOption {
  id: string
  label: string
  detail: string
  defaultOn: boolean
  highlights: string[]
}

export interface DayDef {
  /** Vias between previous overnight (or arrival port) and this day's overnight, outbound order. */
  vias: Via[]
  highlights: string[]
  /** Highlights only included when an option is on are listed in the option instead. */
  options?: DayOption[]
  notes?: string[]
  /** Short title for the day, outbound order. */
  title: string
}

export interface StopSlot {
  default: string
  swaps: string[]
}

export interface RouteDef {
  id: string
  num: number
  name: string
  short: string
  tagline: string
  /** Which directions the route can run. Definitions are always written Channel → Slovenia. */
  directions: 'both' | 'return-only'
  bestCrossing?: 'tunnel' | 'ferry'
  /** 5 stops, Channel → Slovenia order. */
  stops: StopSlot[]
  /** 6 driving days: day[0] = arrival port → stops[0] ... day[5] = stops[4] → Ljubljana */
  days: DayDef[]
  flags: string[]
  origin: 'brief' | 'research'
  sources: Source[]
}

export interface Exclusion {
  id: string
  name: string
  kind: 'pass' | 'place' | 'road' | 'crossing' | 'attraction'
  reason: string
  typicalOpening?: string
  sources: Source[]
  lastChecked: string
  /** If toggled back on, which route/day gets it as an optional via. */
  reinstate?: { routeId: string; dayIndex: number; via: Via; highlight?: string; warning: string }
  userExclusion?: boolean
}
