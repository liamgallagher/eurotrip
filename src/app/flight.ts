import { create } from 'zustand'
import type { Diorama } from './scene/Diorama'
import { localDate } from './scene/sun'
import { markAt, type TripPath } from './tripPath'
import { useApp } from './store'

// One chase flight at a time (the whole trip, or a single day), shared by the controls and the overlay.

interface FlightState {
  active: boolean
  kind: 'trip' | 'day'
  data: TripPath | null
  km: number
  speed: number
  /** clock minutes shown for the sun */
  min: number
}

export const useFlight = create<FlightState>(() => ({ active: false, kind: 'trip', data: null, km: 0, speed: 1, min: 0 }))

let dio: Diorama | null = null
let seconds = 200

const total = (d: TripPath) => d.path[d.path.length - 1].km

export async function startFlight(d: Diorama, data: TripPath, opts: { kind: 'trip' | 'day'; seconds: number; dist: number }) {
  if (data.path.length < 2) return
  dio = d
  seconds = opts.seconds
  const speed = useFlight.getState().speed
  useFlight.setState({ active: true, kind: opts.kind, data, km: data.path[0].km, min: data.marks[0]?.dep ?? 0 })
  // a day flight goes back to its day card afterwards
  const before = useApp.getState()
  const restore = opts.kind === 'day' ? { panel: before.panel, day: before.day } : {}
  useApp.getState().ui({ panel: null, cand: null, focusCand: null, tripFlight: true })
  let last = 0
  await d.flyAlong(data.path, {
    kmPerSec: (total(data) / seconds) * speed,
    dist: opts.dist,
    onKm: (km) => {
      const m = markAt(data.marks, km)
      const f = Math.min(1, (km - m.km) / Math.max(1, m.endKm - m.km))
      const min = m.dep + (m.arr - m.dep) * f
      d.setSun(localDate(m.date, min), { lon: m.lon, lat: m.lat })
      const t = performance.now()
      if (t - last > 100) {
        last = t
        useFlight.setState({ km, min })
      }
    },
  })
  useFlight.setState({ active: false, data: null })
  const app = useApp.getState()
  app.ui({ tripFlight: false, sunKick: app.sunKick + 1, ...restore })
}

export function stopFlight() {
  dio?.stopFly()
}

export function setFlightSpeed(s: number) {
  useFlight.setState({ speed: s })
  const data = useFlight.getState().data
  if (data && dio?.flying) dio.setFlySpeed((total(data) / seconds) * s)
}

export function jumpTo(km: number) {
  dio?.setFlyKm(km)
}

/** Previous / next day; "previous" from well into a day goes back to its start. */
export function jumpDay(k: number) {
  const { data } = useFlight.getState()
  const km = dio?.flyKm
  if (!data || km == null) return
  const i = data.marks.indexOf(markAt(data.marks, km))
  const target = data.marks[Math.max(0, Math.min(data.marks.length - 1, i + k))]
  dio?.setFlyKm(k < 0 && km - data.marks[i].km > 15 ? data.marks[i].km : target.km)
}
