import { useMemo, useRef, useState } from 'react'
import type { Leg } from '../../lib/legs'
import { fmtDateLong } from '../../ui/format'
import { localDate } from '../scene/sun'
import type { Trip } from '../engine/trip'
import { markAt, tripPath, type DayMark } from '../tripPath'
import { useApp } from '../store'
import { useDio } from './Stage'
import { clock, Icon, ICONS, OUT, RET, placeName } from './common'

// Fly the whole trip: the camera chases the route from Southampton to Slovenia and home again, the sun
// moving through each day, with a caption for the day you're on.

const SPEEDS = [0.5, 1, 2, 4]
/** seconds for the whole trip at 1× */
const BASE_SECONDS = 200

export function TripFlight({ trip, legs }: { trip: Trip; legs: Record<string, Leg> }) {
  const dio = useDio()
  const set = useApp((s) => s.ui)
  const flying = useApp((s) => s.tripFlight)
  const [speed, setSpeed] = useState(1)
  const [now, setNow] = useState<{ mark: DayMark; km: number; min: number; total: number; slovenia: boolean } | null>(null)
  const data = useRef<ReturnType<typeof tripPath> | null>(null)

  const settings = useApp((s) => s.plan.settings)
  const planned = useMemo(() => tripPath(trip, legs, settings), [trip, legs, settings])
  const route = () => planned
  const ready = planned.path.length > 1

  const start = async () => {
    if (!dio) return
    const r = route()
    if (r.path.length < 2) return
    data.current = r
    const total = r.path[r.path.length - 1].km
    set({ panel: null, day: null, cand: null, focusCand: null, tripFlight: true })
    let lastUi = 0
    await dio.flyAlong(r.path, {
      kmPerSec: (total / BASE_SECONDS) * speed,
      dist: 45,
      onKm: (km) => {
        const m = markAt(r.marks, km)
        const f = Math.min(1, (km - m.km) / Math.max(1, m.endKm - m.km))
        const min = m.dep + (m.arr - m.dep) * f
        dio.setSun(localDate(m.date, min), { lon: m.lon, lat: m.lat })
        const t = performance.now()
        if (t - lastUi > 120) {
          lastUi = t
          // the first stretch of the way home follows four nights in Slovenia
          setNow({ mark: m, km, min, total, slovenia: m.dir === 'ret' && m.km === r.marks.find((x) => x.dir === 'ret')?.km && km - m.km < 25 })
        }
      },
    })
    setNow(null)
    set({ tripFlight: false, sunKick: useApp.getState().sunKick + 1 })
  }

  const jump = (k: number) => {
    const r = data.current
    const km = dio?.flyKm
    if (!r || km == null) return
    const i = r.marks.indexOf(markAt(r.marks, km))
    const target = r.marks[Math.max(0, Math.min(r.marks.length - 1, i + k))]
    // "previous" from well into a day goes back to its start
    dio?.setFlyKm(k < 0 && km - r.marks[i].km > 15 ? r.marks[i].km : target.km)
  }

  const changeSpeed = (s: number) => {
    setSpeed(s)
    const r = data.current
    if (r && dio?.flying) dio.setFlySpeed((r.path[r.path.length - 1].km / BASE_SECONDS) * s)
  }

  if (!dio) return null
  if (!flying) {
    return (
      <button type="button" className="btn btn--primary tripfly__go" onClick={start} disabled={!ready} title={planned.missing ? 'Some roads are still loading — those days fly in a straight line for now' : 'Fly the whole route, day by day'}>
        <Icon d={ICONS.play} size={15} /> Fly the whole trip
      </button>
    )
  }
  const m = now?.mark
  return (
    <div className="tripfly" role="region" aria-label="Flying the whole trip" aria-live="polite">
      {m && (
        <div className="tripfly__cap" style={{ ['--c' as string]: m.dir === 'out' ? OUT : RET }}>
          <p className="tripfly__day">
            Day {m.n} · {fmtDateLong(m.date)} · {clock(now!.min)}
          </p>
          <p className="tripfly__t">{now!.slovenia ? 'After four nights in Slovenia, heading home' : `${placeName(m.from)} → ${placeName(m.to)}`}</p>
          <p className="tripfly__sub">{m.title}</p>
          <div className="tripfly__bar" aria-hidden="true">
            <span style={{ width: `${(100 * now!.km) / now!.total}%` }} />
          </div>
        </div>
      )}
      <div className="tripfly__ctl">
        <button type="button" className="iconbtn" onClick={() => jump(-1)} aria-label="Previous day">
          <Icon d={ICONS.chevL} />
        </button>
        <span className="seg seg--small" role="radiogroup" aria-label="Speed">
          {SPEEDS.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={speed === s} className={speed === s ? 'is-on' : ''} onClick={() => changeSpeed(s)}>
              {s}×
            </button>
          ))}
        </span>
        <button type="button" className="iconbtn" onClick={() => jump(1)} aria-label="Next day">
          <Icon d={ICONS.chevR} />
        </button>
        <button type="button" className="btn btn--small" onClick={() => dio.stopFly()}>
          <Icon d={ICONS.pause} size={14} /> Stop
        </button>
      </div>
      <p className="tripfly__hint">Scroll or pinch to move closer or further back.</p>
    </div>
  )
}
