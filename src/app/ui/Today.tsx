import { useEffect, useMemo, useState } from 'react'
import { PLACES } from '../../data/places'
import { ALL_HIGHLIGHTS } from '../../lib/scoring'
import { COUNTRY_NAMES } from '../../lib/countries'
import { gmapsUrl, splitChain } from '../../lib/export'
import type { Leg } from '../../lib/legs'
import type { DayStats } from '../../lib/tripStats'
import { fmtDateLong } from '../../ui/format'
import { Photo } from '../../ui/bits'
import { sunTimes } from '../scene/sun'
import { arrivalMin, type Planner } from '../engine/planner'
import type { Trip } from '../engine/trip'
import { useApp } from '../store'
import { bookingUrl, breakName } from './DayCard'
import { clock, dur, placeName } from './common'

// Today: the flat, offline, one-thumb view for the road. No 3D, no map tiles — just what you need now.

const HOTELS = 'eurotrip:hotels'
function useHotels() {
  const [h, setH] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(HOTELS) ?? '{}')
    } catch {
      return {}
    }
  })
  const put = (k: string, v: string) => {
    const n = { ...h, [k]: v }
    setH(n)
    try {
      localStorage.setItem(HOTELS, JSON.stringify(n))
    } catch { /* ignore */ }
  }
  return [h, put] as const
}

function MiniRoute({ legs }: { legs: Leg[] }) {
  const pts = legs.flatMap((l) => l.coords)
  if (pts.length < 2) return null
  let minX = 180, maxX = -180, minY = 90, maxY = -90
  for (const [x, y] of pts) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  const k = Math.cos((((minY + maxY) / 2) * Math.PI) / 180)
  const w = (maxX - minX) * k || 1e-3, h = maxY - minY || 1e-3
  const s = Math.min(300 / w, 150 / h)
  const P = (x: number, y: number) => `${((x - minX) * k * s + 10).toFixed(1)},${((maxY - y) * s + 10).toFixed(1)}`
  const d = pts.filter((_, i) => i % 3 === 0 || i === pts.length - 1).map(([x, y], i) => `${i ? 'L' : 'M'}${P(x, y)}`).join('')
  const [sx, sy] = pts[0], [ex, ey] = pts[pts.length - 1]
  return (
    <svg className="today__mini" viewBox={`0 0 ${w * s + 20} ${h * s + 20}`} role="img" aria-label="Today's route shape">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={P(sx, sy).split(',')[0]} cy={P(sx, sy).split(',')[1]} r="5" fill="#fff" />
      <circle cx={P(ex, ey).split(',')[0]} cy={P(ex, ey).split(',')[1]} r="7" fill="#ffb347" />
    </svg>
  )
}

export default function Today({ pl, trip, stats, legs }: { pl: Planner | null; trip: Trip | null; stats: DayStats[] | null; legs: Record<string, Leg> }) {
  const plan = useApp((s) => s.plan)
  const [hotels, putHotel] = useHotels()
  const todayIso = new Date().toISOString().slice(0, 10)
  const initial = useMemo(() => {
    if (!trip) return 1
    const i = trip.days.findIndex((d) => d.date === todayIso)
    return i >= 0 ? i + 1 : 1
  }, [trip, todayIso])
  const [n, setN] = useState(initial)
  useEffect(() => setN(initial), [initial])
  const [wx, setWx] = useState<string | null>(null)

  const d = trip?.days[n - 1]
  const st = stats?.[n - 1]
  const tonight = d ? PLACES[d.sleep] : undefined
  useEffect(() => {
    setWx(null)
    if (!tonight || !navigator.onLine || !d) return
    // Open-Meteo: free, no key; only when there's signal
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${tonight.lat}&longitude=${tonight.lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&start_date=${d.date}&end_date=${d.date}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const dd = j?.daily
        if (dd?.temperature_2m_max?.[0] != null) setWx(`${Math.round(dd.temperature_2m_min[0])}–${Math.round(dd.temperature_2m_max[0])} °C · ${dd.precipitation_probability_max[0]}% chance of rain`)
      })
      .catch(() => undefined)
  }, [tonight, d])

  if (!trip || !d) {
    return (
      <main className="today">
        <p>{pl ? 'Choose a trip in the planner first.' : 'Loading…'}</p>
        <a href="#" className="btn btn--primary">Open the planner</a>
      </main>
    )
  }
  const dayLegs = d.segments.filter((s) => s.kind === 'drive').map((s) => legs[s.key!]).filter(Boolean)
  const links = d.segments.filter((s) => s.kind === 'drive').flatMap((s) => splitChain(s.waypoints!).map((c) => gmapsUrl(c)))
  const sun = tonight ? sunTimes(d.date, tonight.lat, tonight.lon) : null
  const drive = st?.ready && st.driveH ? st.driveH * 60 : d.e?.min ?? 0
  const km = st?.ready && st.km ? st.km : d.e?.km ?? 0
  const sights = (d.e?.covered ?? []).filter((id) => ALL_HIGHLIGHTS[id])
  const hotelKey = `${d.date}:${d.sleep}`

  return (
    <main className="today">
      <header className="today__top">
        <a href="#" className="today__back">← Planner</a>
        <div className="today__nav">
          <button type="button" onClick={() => setN(Math.max(1, n - 1))} aria-label="Previous day" disabled={n <= 1}>‹</button>
          <span>Day {n}</span>
          <button type="button" onClick={() => setN(Math.min(trip.days.length, n + 1))} aria-label="Next day" disabled={n >= trip.days.length}>›</button>
        </div>
      </header>
      <p className="kicker">{fmtDateLong(d.date)}{d.date === todayIso ? ' · today' : ''}</p>
      <h1 className="today__h">{d.kind === 'base' ? 'In Slovenia' : d.e ? `${placeName(d.e.from)} → ${placeName(d.e.to)}` : d.title}</h1>
      {d.e && (
        <>
          <p className="today__facts">
            {dur(drive)} · {Math.round(km)} km · arrive ~{clock(arrivalMin(d.e, plan.settings))}
            {sun ? ` · sunset ${clock(sun.sunset)}` : ''}
          </p>
          {links.map((u, i) => (
            <a key={i} className="today__go" href={u} target="_blank" rel="noreferrer">
              Open in Google Maps{links.length > 1 ? ` (part ${i + 1})` : ''} →
            </a>
          ))}
          <MiniRoute legs={dayLegs} />
        </>
      )}
      {st?.charging?.stops.length ? (
        <section className="today__card">
          <h2>Charging</h2>
          <ul>
            {st.charging.stops.map((c, i) => {
              const at = plan.settings.departMin + (c.charger.km / Math.max(1, km)) * drive + i * 25
              return (
                <li key={i}>
                  <b>{breakName(at)} ~{clock(at)}</b> · {c.charger.n} · {Math.round(c.minutes)} min ({Math.round(c.arriveSoc)}% → {Math.round(c.departSoc)}%){' '}
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${c.charger.lat},${c.charger.lon}`} target="_blank" rel="noreferrer">
                    go ↗
                  </a>
                </li>
              )
            })}
          </ul>
        </section>
      ) : d.e ? (
        <section className="today__card">
          <h2>Charging</h2>
          <p>No stop needed — plug in at the hotel.</p>
        </section>
      ) : null}
      {sights.length > 0 && (
        <section className="today__card">
          <h2>Today’s must-sees</h2>
          <ul className="today__sights">
            {sights.map((id) => (
              <li key={id}>
                <Photo id={id} alt="" category={ALL_HIGHLIGHTS[id].category} sizes="96px" />
                <div>
                  <b>{ALL_HIGHLIGHTS[id].name}</b>
                  {ALL_HIGHLIGHTS[id].tip && <small>{ALL_HIGHLIGHTS[id].tip}</small>}
                  <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ALL_HIGHLIGHTS[id].name} ${COUNTRY_NAMES[ALL_HIGHLIGHTS[id].country] ?? ''}`)}`} target="_blank" rel="noreferrer">
                    map ↗
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {tonight && (
        <section className="today__card">
          <h2>Tonight: {tonight.name}</h2>
          {wx && <p>{wx}</p>}
          <label className="field">
            <span>Our hotel (saved on this phone)</span>
            <input value={hotels[hotelKey] ?? ''} onChange={(e) => putHotel(hotelKey, e.target.value)} placeholder="Hotel name or address" />
          </label>
          {hotels[hotelKey] ? (
            <a className="today__go today__go--2" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(hotels[hotelKey])}`} target="_blank" rel="noreferrer">
              Navigate to the hotel →
            </a>
          ) : (
            <a href={bookingUrl(tonight.id, d.date)} target="_blank" rel="noreferrer">
              Find a hotel ↗
            </a>
          )}
          {[...(tonight.notes ?? []), ...(tonight.charging ? [tonight.charging] : [])].map((x, i) => (
            <p key={i} className="muted">· {x}</p>
          ))}
        </section>
      )}
    </main>
  )
}
