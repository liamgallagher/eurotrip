import { useTrip } from '../store'
import type { TripModel } from '../hooks'
import { ROUTES, ROUTE_BY_ID } from '../data/routes'
import { PLACES } from '../data/places'
import { CROSSINGS } from '../data/costs'
import { optionOn, type Direction } from '../lib/state'
import { SectionHead, Stepper, Estimate } from '../ui/bits'
import { fmtDate, fmtEur, fmtH, fmtKm } from '../ui/format'
import { COUNTRY_NAMES, FLAGS } from '../lib/countries'
import { Fragment } from 'react'

export function Builder({ model }: { model: TripModel }) {
  const { state, plan, totals, costs, legStatus, days } = model
  const a = useTrip.getState()
  const tollEur = costs.filter((c) => c.group !== 'Charging' && c.group !== 'Crossings').reduce((x, c) => x + c.eur, 0)
  const sources = Object.values(legStatus.sources)
  const nLive = sources.filter((s) => s === 'live').length
  const nCache = sources.filter((s) => s === 'cache').length
  const allWarnings = [
    ...plan.warnings,
    ...days.flatMap((d) => d.warnings.filter((w) => /Long day|could not/.test(w)).map((w) => ({ level: 'warn' as const, text: `Day ${d.day.n} (${fmtDate(d.day.date)}): ${w}` }))),
  ]
  const ok = plan.totalNights === 14

  return (
    <section className="builder" id="plan" aria-labelledby="plan-title">
      <div className="wrap">
        <SectionHead kicker="Step 2 · Build it" title="Route builder" id="plan-title">
          <p>Swap overnight stops, toggle detours and change nights. Distances and times are real road routing (OSRM), not guesses, and everything below updates live.</p>
        </SectionHead>

        <div className="stats" role="status" aria-live="polite">
          <Stat label="Total driving" value={totals.ready ? fmtKm(totals.km) : '…'} />
          <Stat label="At the wheel" value={totals.ready ? fmtH(totals.driveH) : '…'} sub={totals.chargeMin ? `+ ${fmtH(totals.chargeMin / 60)} charging` : undefined} />
          <Stat label="Longest day" value={totals.longest ? fmtKm(totals.longest.km) : '…'} sub={totals.longest ? `${fmtDate(totals.longest.day.date)} · ${fmtH(totals.longest.driveH)}` : undefined} />
          <Stat label="Supercharger stops" value={String(totals.chargeStops)} sub={<Estimate>modelled</Estimate>} />
          <Stat label="Tolls & vignettes" value={fmtEur(tollEur)} sub={<Estimate />} />
          <Stat label="Climbing" value={`${Math.round(totals.ascent / 1000).toLocaleString()} km`} sub="total ascent" />
          <div className="stat stat--countries">
            <span className="stat__label">Nights per country</span>
            <span className="stat__value stat__flags">
              {Object.entries(totals.nightsByCountry).sort((x, y) => y[1] - x[1]).map(([cc, n]) => (
                <span key={cc} title={COUNTRY_NAMES[cc]}>{FLAGS[cc]}<small>{n}</small></span>
              ))}
            </span>
          </div>
        </div>
        {legStatus.pending > 0 && <p className="loading">Routing {legStatus.pending} leg{legStatus.pending > 1 ? 's' : ''} with OSRM…</p>}
        {Object.keys(legStatus.errors).length > 0 && (
          <p className="warn-line">⚠ {Object.keys(legStatus.errors).length} leg(s) could not be routed: {Object.values(legStatus.errors)[0]}</p>
        )}

        <div className="builder__top">
          <label className="field">
            <span>Departure date</span>
            <input type="date" value={state.startDate} onChange={(e) => e.target.value && a.set({ startDate: e.target.value })} />
          </label>
          <div className="field">
            <span>Nights on the road out</span>
            <Stepper label="outbound nights" value={plan.outNights} min={1} max={12} onChange={(v) => a.adjustNights('out', v - plan.outNights)} />
          </div>
          <div className="field">
            <span>Nights in Slovenia</span>
            <Stepper label="Slovenia nights" value={state.sloveniaNights} min={1} max={10} onChange={(v) => a.set({ sloveniaNights: v })} />
          </div>
          <div className="field">
            <span>Nights on the road back</span>
            <Stepper label="return nights" value={plan.retNights} min={1} max={12} onChange={(v) => a.adjustNights('ret', v - plan.retNights)} />
          </div>
          <div className={`total ${ok ? 'is-ok' : 'is-warn'}`} aria-live="polite">
            <span className="total__n">{plan.totalNights}</span>
            <span className="total__l">nights{plan.ferryNights ? ` (incl. ${plan.ferryNights} on the ferry)` : ''}<br />{ok ? 'Exactly 14 ✓' : 'Target is 14'}</span>
          </div>
        </div>

        {allWarnings.length > 0 && (
          <ul className="warnings">
            {allWarnings.map((w, i) => (
              <li key={i} className={`warning warning--${w.level}`}>{w.text}</li>
            ))}
          </ul>
        )}

        <div className="builder__cols">
          <DirectionPanel dir="out" model={model} />
          <DirectionPanel dir="ret" model={model} />
        </div>

        <p className="fine">
          Routing: {sources.length - nLive - nCache} legs from the snapshot{nCache ? `, ${nCache} cached on this device` : ''}{nLive ? `, ${nLive} routed live` : ''}. OSRM times assume free-flowing traffic, so add breaks. Drives into and out of Slovenia are measured to central Ljubljana, since where you're staying isn't decided yet.{' '}
          <button type="button" className="linkbtn" onClick={legStatus.refresh}>Recalculate all legs live now</button>
        </p>
      </div>
    </section>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
      {sub && <span className="stat__sub">{sub}</span>}
    </div>
  )
}

function DirectionPanel({ dir, model }: { dir: Direction; model: TripModel }) {
  const { state, plan, days } = model
  const a = useTrip.getState()
  const cfg = state[dir]
  const route = ROUTE_BY_ID[cfg.route]
  // def-day indices in travel order
  const order = dir === 'out' ? route.days.map((_, i) => i) : route.days.map((_, i) => route.days.length - 1 - i)
  // stop slot reached at the end of def-day i (outbound): slot i (0..4); day 5 ends in Ljubljana.
  const slotAfter = (defIdx: number) => (dir === 'out' ? (defIdx <= 4 ? defIdx : null) : defIdx >= 1 ? defIdx - 1 : null)
  const nightDate = (placeId: string) => plan.days.find((d) => d.dir === dir && typeof d.sleep === 'object' && d.sleep.id === placeId && d.kind === 'drive')?.date
  const dayOf = (defIdx: number) => days.find((d) => d.day.dir === dir && d.day.defDays.includes(defIdx) && d.day.kind === 'drive')

  return (
    <div className={`dirpanel dirpanel--${dir}`}>
      <div className="dirpanel__head">
        <span className={`dir dir--${dir}`}>{dir === 'out' ? 'Outbound' : 'Return'}</span>
        <select value={cfg.route} onChange={(e) => a.setRoute(dir, e.target.value)} aria-label={`${dir === 'out' ? 'Outbound' : 'Return'} route`}>
          {ROUTES.map((r) => (
            <option key={r.id} value={r.id} disabled={dir === 'out' && r.directions === 'return-only'}>
              R{r.num} · {r.name}{r.directions === 'return-only' ? ' (return only)' : ''}{(dir === 'out' ? state.ret.route : state.out.route) === r.id ? ' — used the other way' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="seg seg--small" role="radiogroup" aria-label="Channel crossing">
        {(['tunnel', 'ferry'] as const).map((c) => (
          <button key={c} type="button" role="radio" aria-checked={cfg.crossing === c} className={cfg.crossing === c ? 'is-on' : ''} onClick={() => a.setCrossing(dir, c)}>
            {c === 'tunnel' ? 'Eurotunnel' : 'Ferry Portsmouth–Caen'}
          </button>
        ))}
      </div>
      {route.bestCrossing === 'ferry' && cfg.crossing !== 'ferry' && <p className="hint">This route suits the overnight ferry to Caen (you start 30 min from home).</p>}
      <p className="fine">{CROSSINGS[cfg.crossing].note}</p>

      <ol className="legs">
        {dir === 'ret' && <li className="legs__node legs__node--fixed">Slovenia</li>}
        {dir === 'out' && <li className="legs__node legs__node--fixed">{cfg.crossing === 'ferry' ? 'Southampton → Portsmouth → Caen' : 'Southampton → Folkestone → Calais'}</li>}
        {order.map((defIdx) => {
          const def = route.days[defIdx]
          const ds = dayOf(defIdx)
          const slot = slotAfter(defIdx)
          const place = slot != null ? PLACES[cfg.stops[slot]] : null
          const nights = slot != null ? cfg.nights[slot] : 0
          return (
            <Fragment key={defIdx}>
              <li className="legs__day">
                <div className="legs__title">
                  <span>{def.title}</span>
                  {ds?.ready && ds.day.defDays[0] === defIdx && (
                    <span className="legs__nums">
                      {fmtKm(ds.km)} · {fmtH(ds.driveH)}
                      {ds.maxEle > 1500 && <span className="alt">▲{Math.round(ds.maxEle)} m</span>}
                    </span>
                  )}
                </div>
                {def.options?.map((o) => {
                  const on = optionOn(state, route.id, defIdx, o.id)
                  return (
                    <label key={o.id} className="opt">
                      <input type="checkbox" checked={on} onChange={() => a.toggleOption(route.id, defIdx, o.id)} />
                      <span className="opt__switch" aria-hidden="true" />
                      <span>
                        <b>{o.label}</b> <span className="muted">{o.detail}</span>
                      </span>
                    </label>
                  )
                })}
              </li>
              {place && slot != null && (
                <li className={`legs__node ${nights === 0 ? 'is-skipped' : ''}`}>
                  <div className="stop">
                    <span className="stop__date">{nights > 0 ? fmtDate(nightDate(place.id) ?? state.startDate) : 'pass through'}</span>
                    <select value={cfg.stops[slot]} onChange={(e) => a.setStop(dir, slot, e.target.value)} aria-label={`${dir === "out" ? "Outbound" : "Return"} overnight stop ${slot + 1}`}>
                      {[route.stops[slot].default, ...route.stops[slot].swaps].map((id) => (
                        <option key={id} value={id}>
                          {PLACES[id].name}{id === route.stops[slot].default ? '' : ' (swap)'} · evenings {PLACES[id].evening}/10
                        </option>
                      ))}
                    </select>
                    <Stepper label={`nights in ${place.name}`} value={nights} min={0} max={3} onChange={(v) => a.setStopNights(dir, slot, v)} />
                  </div>
                  <p className="stop__blurb">{place.blurb}</p>
                </li>
              )}
            </Fragment>
          )
        })}
        {dir === 'out' && <li className="legs__node legs__node--fixed">Slovenia · {state.sloveniaNights} nights</li>}
        {dir === 'ret' && <li className="legs__node legs__node--fixed">{cfg.crossing === 'ferry' ? 'Caen → Portsmouth → home' : 'Calais → Folkestone → home'}</li>}
      </ol>
    </div>
  )
}
