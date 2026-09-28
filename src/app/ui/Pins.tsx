import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { PLACES, FIXED } from '../../data/places'
import { ALL_HIGHLIGHTS } from '../../lib/scoring'
import { CAT_COLOR, CatIcon } from '../../ui/bits'
import type { DayStats } from '../../lib/tripStats'
import { Anchor } from './Stage'
import { PERSON, PEOPLE, type Planner } from '../engine/planner'
import type { Trip } from '../engine/trip'
import { useApp } from '../store'
import { OUT, RET, shortName, useSuggestions, whoLoves, dur, clock } from './common'
import { breakName } from './DayCard'
import { photoUrl, useJournal, type Note } from '../journal'

// HTML pins pinned to the terrain: tonight's stops, candidate stops, highlights, charging breaks.

export function Pins({ pl, trip, stats }: { pl: Planner | null; trip: Trip | null; stats: DayStats[] | null }) {
  const ui = useApp(useShallow((s) => ({ panel: s.panel, day: s.day, cand: s.cand, focusCand: s.focusCand, hoverHighlight: s.hoverHighlight })))
  const plan = useApp((s) => s.plan)
  const set = useApp((s) => s.ui)
  const sugg = useSuggestions(pl)

  const stops = useMemo(() => {
    if (!trip) return []
    const list: { id: string; place: string; n: string; dir: 'out' | 'ret'; day: number }[] = []
    let o = 0, r = 0
    for (const d of trip.days) {
      if (d.kind !== 'drive' || d.stop == null) continue
      if (d.dir === 'out') list.push({ id: `s-out-${d.stop}`, place: d.sleep, n: String(++o), dir: 'out', day: d.n })
      else list.push({ id: `s-ret-${d.stop}`, place: d.sleep, n: String(++r), dir: 'ret', day: d.n })
    }
    return list
  }, [trip])

  const highlights = useMemo(() => {
    const ids = new Set<string>()
    if (trip) {
      const d = ui.day != null ? trip.days[ui.day - 1] : null
      if (d?.e) {
        for (const id of d.e.covered) ids.add(id)
        for (const x of d.e.way.detours.slice(0, 8)) ids.add(x.id)
      } else if (ui.panel !== 'options') {
        for (const id of trip.out.covered) ids.add(id)
        for (const id of trip.ret.covered) ids.add(id)
      }
    }
    for (const p of PEOPLE) for (const id of plan.hearts[p]) ids.add(id)
    // a place's own highlight is shown by the stop pin
    const stopHl = new Set(stops.flatMap((s) => PLACES[s.place].highlights))
    return [...ids].filter((id) => ALL_HIGHLIGHTS[id] && !stopHl.has(id))
  }, [trip, ui.day, ui.panel, plan.hearts, stops])

  const covered = useMemo(() => new Set([...(trip?.out.covered ?? []), ...(trip?.ret.covered ?? [])]), [trip])
  const selDay = ui.day != null && trip ? trip.days[ui.day - 1] : null
  const selStats = selDay && stats ? stats[selDay.n - 1] : null
  const charges = selStats?.charging?.stops ?? []
  const breakAt = (km: number, i: number) => plan.settings.departMin + (km / Math.max(1, selStats?.km ?? 1)) * (selStats?.driveH ?? 0) * 60 + i * 25

  const journal = useJournal()

  return (
    <>
      {ui.panel !== 'options' && journal.notes.map((n) => <NotePin key={n.id} n={n} />)}
      {ui.panel !== 'options' &&
        stops
          .filter((s) => ui.panel !== 'candidates' || s.dir === ui.cand?.dir)
          .map((s) => {
          const p = PLACES[s.place]
          const active = ui.day === s.day
          return (
            <Anchor key={s.id} id={s.id} lon={p.lon} lat={p.lat} lift={40} priority={ui.panel === 'candidates' ? 4 : active ? 12 : 10}>
              <button type="button" className={`pin pin--stop pin--${s.dir} ${active ? 'is-active' : ''}`} style={{ ['--c' as string]: s.dir === 'out' ? OUT : RET }} onClick={() => set({ day: s.day, panel: 'day' })} aria-label={`Night ${s.n} ${s.dir === 'out' ? 'out' : 'back'}: ${p.name}`}>
                <span className="pin__n">{s.n}</span>
                <span className="pin__label">{shortName(s.place)}</span>
              </button>
            </Anchor>
          )
        })}
      {trip && ui.panel !== 'options' && (
        <Anchor id="slovenia" lon={FIXED.ljubljana.lon} lat={FIXED.ljubljana.lat} lift={40} priority={9}>
          <div className="pin pin--base">
            <span className="pin__label">Slovenia · {plan.sloveniaNights} nights</span>
          </div>
        </Anchor>
      )}
      {ui.panel === 'candidates' &&
        sugg?.list
          .filter((s) => !s.reenter)
          .slice(0, 14)
          .map((s, i) => {
            const p = PLACES[s.place]
            const focus = ui.focusCand === s.place
            return (
              <Anchor key={`c-${s.place}`} id={`c-${s.place}`} lon={p.lon} lat={p.lat} lift={60} priority={focus ? 20 : 9 - i * 0.2}>
                <button type="button" className={`pin pin--cand ${focus ? 'is-focus' : ''} ${s.lost.length ? 'has-loss' : ''}`} onClick={() => set({ focusCand: s.place })} aria-label={`Option ${i + 1}: ${p.name}, ${dur(s.day.min)}`}>
                  <span className="pin__n">{i + 1}</span>
                  <span className="pin__label">
                    {shortName(s.place)} <small>{dur(s.day.min)}</small>
                  </span>
                </button>
              </Anchor>
            )
          })}
      {ui.panel !== 'candidates' &&
        highlights.map((id) => {
          const h = ALL_HIGHLIGHTS[id]
          const who = whoLoves(plan, id)
          const on = covered.has(id)
          return (
            <Anchor key={`h-${id}`} id={`h-${id}`} lon={h.lon} lat={h.lat} lift={20} maxDist={who.length ? 4000 : on ? 1300 : 500} priority={ui.hoverHighlight === id ? 15 : who.length ? 5 : 2}>
              <button
                type="button"
                className={`pin pin--hl ${on ? 'is-on' : 'is-off'} ${ui.hoverHighlight === id ? 'is-hover' : ''}`}
                style={{ ['--c' as string]: CAT_COLOR[h.category], ['--ring' as string]: who.length === 2 ? `conic-gradient(${PERSON.liam.color} 0 50%, ${PERSON.tatiana.color} 0 100%)` : who.length ? PERSON[who[0]].color : 'transparent' }}
                onClick={() => set({ panel: 'discover', hoverHighlight: id })}
                aria-label={`${h.name}${on ? ' (on your route)' : ''}${who.length ? `, loved by ${who.map((w) => PERSON[w].name).join(' and ')}` : ''}`}
              >
                <span className="pin__dot">
                  <CatIcon c={h.category} size={11} />
                </span>
                <span className="pin__label">{h.name.replace(/\s*\(.*\)/, '')}</span>
              </button>
            </Anchor>
          )
        })}
      {charges.map((c, i) => (
        <Anchor key={`ch-${c.charger.id}-${i}`} id={`ch-${c.charger.id}-${i}`} lon={c.charger.lon} lat={c.charger.lat} lift={20} priority={7}>
          <div className="pin pin--charge" title={`${c.charger.n}: ${Math.round(c.arriveSoc)}% → ${Math.round(c.departSoc)}%`}>
            <span className="pin__dot">⚡</span>
            <span className="pin__label">
              {breakName(breakAt(c.charger.km, i))} ~{clock(breakAt(c.charger.km, i))} · {Math.round(c.minutes)} min
            </span>
          </div>
        </Anchor>
      ))}
    </>
  )
}

function NotePin({ n }: { n: Note }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (n.photo) photoUrl(n.photo).then(setUrl)
  }, [n.photo])
  return (
    <Anchor id={`note-${n.id}`} lon={n.lon} lat={n.lat} lift={30} priority={6} maxDist={1500}>
      <div className={`pin pin--note ${url ? 'has-photo' : ''}`} title={n.text}>
        {url ? <img src={url} alt="" /> : <span className="pin__dot">✎</span>}
        {n.text && <span className="pin__label">{n.text.slice(0, 40)}</span>}
      </div>
    </Anchor>
  )
}
