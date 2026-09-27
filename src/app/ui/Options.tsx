import { useEffect, useState } from 'react'
import { PLACES } from '../../data/places'
import { Photo } from '../../ui/bits'
import { PEOPLE, PERSON, type Planner } from '../engine/planner'
import { applyOption, allHearts, tripOptions, type TripOption } from '../engine/trip'
import { useApp } from '../store'
import { dur, hName, OPTION_COLORS, placePhoto, shortName } from './common'

// Step one: a few complete trips to compare, each built around both sets of hearts.

export function useTripOptions(pl: Planner | null, enabled: boolean) {
  const plan = useApp((s) => s.plan)
  const [opts, setOpts] = useState<TripOption[] | null>(null)
  const heartsKey = JSON.stringify([plan.hearts, plan.settings, plan.out.crossing, plan.ret.crossing])
  useEffect(() => {
    if (!pl || !enabled) return
    let alive = true
    // let the panel paint first — the search takes a moment
    const id = setTimeout(() => {
      if (alive) setOpts(tripOptions(pl, useApp.getState().plan, 3))
    }, 30)
    return () => {
      alive = false
      clearTimeout(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pl, enabled, heartsKey])
  return opts
}

export function Options({ options }: { options: TripOption[] | null }) {
  const plan = useApp((s) => s.plan)
  const setPlan = useApp((s) => s.setPlan)
  const set = useApp((s) => s.ui)
  const hover = useApp((s) => s.hoverOption)
  const hearts = allHearts(plan)
  const hasPlan = plan.out.stops.length > 0
  return (
    <section className="panel__body options" aria-labelledby="opt-h">
      <p className="kicker">Step 1 · The big picture</p>
      <h2 id="opt-h">Three ways to do it</h2>
      <p className="lede">
        {hearts.length
          ? `Each is a complete 14-night trip that tries to fit in everything you’ve hearted (${hearts.length}). Hover to see it on the map.`
          : 'Each is a complete 14-night trip: five nights out, four in Slovenia, five back. Heart a few must-sees first and these will bend around them.'}
      </p>
      {!hearts.length && (
        <button type="button" className="btn btn--ghost" onClick={() => set({ panel: 'discover' })}>
          ♥ Heart your must-sees first (2 min)
        </button>
      )}
      {!options && <div className="skeleton-cards" aria-busy="true">Working out the best trips…</div>}
      <ol className="optlist">
        {options?.map((o, i) => {
          const lead = placePhoto(o.out.places[Math.min(2, o.out.places.length - 1)])
          return (
            <li key={o.id} className={`opt ${hover === o.id ? 'is-hover' : ''}`} style={{ ['--c' as string]: OPTION_COLORS[i] }} onMouseEnter={() => set({ hoverOption: o.id })} onMouseLeave={() => set({ hoverOption: null })} onFocus={() => set({ hoverOption: o.id })}>
              <div className="opt__media">{lead && <Photo id={lead} alt="" sizes="360px" />}</div>
              <div className="opt__body">
                <p className="opt__n">Option {String.fromCharCode(65 + i)}</p>
                <h3 className="opt__name">{o.name || 'A classic line'}</h3>
                <p className="opt__tag">{o.tagline}</p>
                <p className="opt__stats">
                  {Math.round(o.km).toLocaleString('en-GB')} km · {dur(o.driveMin)} at the wheel · longest day {dur(Math.max(...[...o.out.days, ...o.ret.days].map((d) => d.min)))}
                </p>
                <div className="opt__route">
                  <span className="opt__dir opt__dir--out">Out</span> {o.out.places.map(shortName).join(' · ')}
                </div>
                <div className="opt__route">
                  <span className="opt__dir opt__dir--ret">Back</span> {o.ret.places.map(shortName).join(' · ')}
                </div>
                {hearts.length > 0 && (
                  <p className="opt__hearts">
                    {PEOPLE.map((p) => {
                      const mine = plan.hearts[p]
                      if (!mine.length) return null
                      const got = mine.filter((h) => o.covered.includes(h)).length
                      return (
                        <span key={p} className="opt__who" style={{ ['--c' as string]: PERSON[p].color }}>
                          ♥ {PERSON[p].name} {got}/{mine.length}
                        </span>
                      )
                    })}
                    {o.missed.length > 0 && <span className="opt__missed">misses {o.missed.map(hName).join(', ')}</span>}
                  </p>
                )}
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => {
                    if (hasPlan && plan.out.stops.some((s) => s.firm) && !confirm('This replaces your current stops, including ones marked as booked. Carry on?')) return
                    setPlan((p) => applyOption(p, o))
                    set({ panel: null, day: null, hoverOption: null, toast: `Trip set: out via ${o.out.places.map((x) => PLACES[x].name.split(' ')[0]).join(', ')}.` })
                  }}
                >
                  Choose this trip
                </button>
              </div>
            </li>
          )
        })}
      </ol>
      <p className="fine">Built from curated scenic days (exact OSRM road times) and direct drives between them (OSRM drive-time table). Days aim for ≤ {plan.settings.maxDriveH} h at the wheel; change that in Settings. Afterwards, tap any night on the map to swap it.</p>
    </section>
  )
}
