import { useEffect, useRef, useState } from 'react'
import { PLACES } from '../../data/places'
import { COUNTRY_NAMES } from '../../lib/countries'
import { Photo } from '../../ui/bits'
import { arrivalMin, estCharges, type Planner } from '../engine/planner'
import { chooseStop } from '../engine/trip'
import { useApp } from '../store'
import { clock, dur, flag, hName, Icon, ICONS, placeName, placePhoto, shortName, useSuggestions } from './common'
import type { Suggestion } from '../engine/trip'

// "Where next?" — every sensible stop for one night, as cards you can swipe, synced with pins on the
// map. Each card shows what choosing it does to the rest of the trip before you choose.

export function Candidates({ pl }: { pl: Planner | null }) {
  const cand = useApp((s) => s.cand)
  const focus = useApp((s) => s.focusCand)
  const plan = useApp((s) => s.plan)
  const set = useApp((s) => s.ui)
  const setPlan = useApp((s) => s.setPlan)
  const sugg = useSuggestions(pl)
  const [showHidden, setShowHidden] = useState(false)
  const rail = useRef<HTMLOListElement>(null)

  const list = sugg?.list ?? []
  const visible = list.filter((s) => showHidden || !s.reenter)
  const hidden = list.filter((s) => s.reenter)
  const current = cand ? (cand.dir === 'out' ? plan.out : plan.ret).stops[cand.slot]?.place : null

  // keep the focused card and the map pin in step
  useEffect(() => {
    if (!focus && visible[0]) set({ focusCand: visible[0].place })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sugg])
  useEffect(() => {
    const el = rail.current?.querySelector(`[data-place="${focus}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [focus])

  if (!cand) return null
  const prevDay = sugg?.baseline.days[cand.slot]
  const prev = prevDay?.from
  const behindCountry = hidden[0]?.reenter
  const step = (k: number) => {
    const i = visible.findIndex((s) => s.place === focus)
    const next = visible[Math.max(0, Math.min(visible.length - 1, i + k))]
    if (next) set({ focusCand: next.place })
  }
  const choose = (s: Suggestion) => {
    if (!pl) return
    setPlan((p) => chooseStop(pl, p, cand.dir, cand.slot, s.place, s))
    set({ panel: 'day', focusCand: null, cand: null, toast: `${placeName(s.place)} it is — the rest of the ${cand.dir === 'out' ? 'way out' : 'way home'} has been re-planned around it.` })
  }

  return (
    <section className="panel__body cands" aria-labelledby="cand-h" onKeyDown={(e) => {
      if (e.key === 'ArrowRight') step(1)
      if (e.key === 'ArrowLeft') step(-1)
    }}>
      <p className="kicker">
        Night {cand.slot + 1} {cand.dir === 'out' ? 'on the way out' : 'on the way home'}
      </p>
      <h2 id="cand-h">After {prev ? placeName(prev) : '…'}, where next?</h2>
      <p className="lede">
        Sorted by how good the whole {cand.dir === 'out' ? 'way out' : 'way back'} becomes. Later nights re-plan around your choice{(cand.dir === 'out' ? plan.out : plan.ret).stops.some((s) => s.firm) ? ' (booked ones stay put)' : ''}.
      </p>
      {!sugg && <div className="skeleton-cards" aria-busy="true">Weighing up every stop…</div>}
      <div className="cands__nav">
        <button type="button" className="iconbtn" onClick={() => step(-1)} aria-label="Previous option">
          <Icon d={ICONS.chevL} />
        </button>
        <span className="muted">
          {visible.findIndex((s) => s.place === focus) + 1} of {visible.length}
        </span>
        <button type="button" className="iconbtn" onClick={() => step(1)} aria-label="Next option">
          <Icon d={ICONS.chevR} />
        </button>
      </div>
      <ol className="rail" ref={rail}>
        {visible.map((s, i) => {
          const p = PLACES[s.place]
          const ph = placePhoto(s.place)
          const on = focus === s.place
          const then = s.completion.places.slice(cand.slot + 1)
          return (
            <li key={s.place} data-place={s.place} className={`ccard ${on ? 'is-focus' : ''} ${current === s.place ? 'is-current' : ''}`} onMouseEnter={() => set({ focusCand: s.place })} onClick={() => set({ focusCand: s.place })}>
              <div className="ccard__media">
                {ph && <Photo id={ph} alt={p.name} hd={on} sizes="340px" />}
                <span className="ccard__rank">{i + 1}</span>
                {current === s.place && <span className="ccard__now">tonight now</span>}
              </div>
              <div className="ccard__body">
                <h3 className="ccard__name">
                  {placeName(s.place)} <span title={COUNTRY_NAMES[p.country]}>{flag(p.country)}</span>
                </h3>
                <p className="ccard__facts">
                  {dur(s.day.min)} · {Math.round(s.day.km)} km · ≈{estCharges(s.day.km, s.day.way.ascent)} ⚡ · arrive ~{clock(arrivalMin(s.day, plan.settings))}
                </p>
                <p className="ccard__blurb">{p.blurb}</p>
                <ul className="chips">
                  {s.day.way.kind === 'curated' && <li className="chip chip--good">via {s.day.way.label}</li>}
                  {s.gained.map((h) => <li key={h} className="chip chip--good">♥ fits in {hName(h)}</li>)}
                  {s.lost.map((h) => <li key={h} className="chip chip--bad">♥ {hName(h)} no longer fits</li>)}
                  {s.long && <li className="chip chip--warn">long day ({dur(s.day.min)})</li>}
                  {s.reenter && <li className="chip chip--warn">back into {COUNTRY_NAMES[s.reenter]}</li>}
                </ul>
                <p className="ccard__then">
                  then {then.map(shortName).join(' → ')} → {cand.dir === 'out' ? 'Slovenia' : 'home'}
                </p>
                <button type="button" className="btn btn--primary" onClick={(ev) => { ev.stopPropagation(); choose(s) }} disabled={current === s.place}>
                  {current === s.place ? 'Current choice' : `Choose ${shortName(s.place)}`}
                </button>
              </div>
            </li>
          )
        })}
      </ol>
      {hidden.length > 0 && !showHidden && (
        <p className="muted">
          {hidden.length} more would take you back into {COUNTRY_NAMES[behindCountry!] ?? 'a country you’ve left'}.{' '}
          <button type="button" className="linkbtn" onClick={() => setShowHidden(true)}>
            Show them anyway
          </button>
        </p>
      )}
      <p className="fine">Times from the OSRM drive-time table; curated scenic days use exact routed times. Charging counts are estimates until you choose.</p>
    </section>
  )
}
