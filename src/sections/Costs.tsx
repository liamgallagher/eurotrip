import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import type { TripModel } from '../hooks'
import { useTrip } from '../store'
import { CHECKLIST } from '../data/checklist'
import { EXCLUSIONS } from '../data/exclusions'
import { COSTS_CHECKED, GBP_TO_EUR } from '../data/costs'
import { COUNTRY_NAMES, FLAGS } from '../lib/countries'
import { ROUTE_BY_ID } from '../data/routes'
import { SectionHead, SourceLinks, Estimate } from '../ui/bits'
import { fmtEur } from '../ui/format'

export function Costs({ model }: { model: TripModel }) {
  const groups = ['Crossings', 'Vignettes', 'Tolls', 'Charging'] as const
  const total = model.costs.reduce((a, c) => a + c.eur, 0)
  return (
    <section className="costs" id="costs" aria-labelledby="costs-title">
      <div className="wrap">
        <SectionHead kicker="Paperwork" title="Costs, tolls & vignettes" id="costs-title">
          <p>
            Worked out from your plan: vignettes are bought only for countries where you actually use motorways, and toll roads are detected from the routed road names. Prices are 2026 rates (checked {COSTS_CHECKED}), since most 2027 prices are not published yet.
          </p>
        </SectionHead>
        <div className="costs__grid">
          <table className="ctable">
            <caption className="sr-only">Estimated costs for the selected plan</caption>
            <tbody>
              {groups.map((g) => {
                const lines = model.costs.filter((c) => c.group === g)
                if (!lines.length) return null
                return [
                  <tr key={g} className="ctable__group">
                    <th colSpan={2} scope="colgroup">{g}</th>
                  </tr>,
                  ...lines.map((c, i) => (
                    <tr key={g + i}>
                      <td>
                        <span className="ctable__label">{c.label}</span>
                        {c.estimate && <Estimate />}
                        {c.detail && <span className="ctable__detail">{c.detail}</span>}
                        <SourceLinks sources={c.sources} />
                      </td>
                      <td className="num">{fmtEur(c.eur)}</td>
                    </tr>
                  )),
                ]
              })}
              <tr className="ctable__total">
                <th scope="row">Estimated total</th>
                <td className="num">{fmtEur(total)}</td>
              </tr>
            </tbody>
          </table>
          <p className="fine">Excludes hotels, food and parking. GBP converted at ~{GBP_TO_EUR} €/£ (estimate). Italian and French motorway tolls are estimated per km on A-roads.</p>
        </div>
      </div>
    </section>
  )
}

export function Countries({ model }: { model: TripModel }) {
  const { totals } = model
  const nights = Object.entries(totals.nightsByCountry).sort((a, b) => b[1] - a[1])
  const km = Object.entries(totals.kmByCountry).filter(([, k]) => k >= 1).sort((a, b) => b[1] - a[1])
  const maxN = Math.max(1, ...nights.map(([, n]) => n))
  const maxK = Math.max(1, ...km.map(([, k]) => k))
  return (
    <section className="countries" aria-labelledby="countries-title">
      <div className="wrap">
        <SectionHead kicker="Borders" title="Country by country" id="countries-title" />
        <div className="countries__grid">
          <div>
            <h3 className="h3">Nights</h3>
            <ul className="bars">
              {nights.map(([cc, n], i) => (
                <li key={cc}>
                  <span className="bars__l">{FLAGS[cc]} {COUNTRY_NAMES[cc] ?? cc}</span>
                  <span className="bars__track">
                    <motion.span className="bars__fill" initial={{ width: 0 }} whileInView={{ width: `${(n / maxN) * 100}%` }} viewport={{ once: true }} transition={{ delay: i * 0.05, duration: 0.6 }} />
                  </span>
                  <span className="bars__v">{n}</span>
                </li>
              ))}
            </ul>
            {totals.passThrough.length > 0 && (
              <>
                <h3 className="h3">Passed through only</h3>
                <p className="passthrough">
                  {totals.passThrough.map((cc) => (
                    <span key={cc} className="pchip">{FLAGS[cc]} {COUNTRY_NAMES[cc] ?? cc} <small>{Math.round(totals.kmByCountry[cc])} km</small></span>
                  ))}
                </p>
              </>
            )}
          </div>
          <div>
            <h3 className="h3">Kilometres driven</h3>
            <ul className="bars bars--km">
              {km.map(([cc, k], i) => (
                <li key={cc}>
                  <span className="bars__l">{FLAGS[cc]} {COUNTRY_NAMES[cc] ?? cc}</span>
                  <span className="bars__track">
                    <motion.span className="bars__fill" initial={{ width: 0 }} whileInView={{ width: `${(k / maxK) * 100}%` }} viewport={{ once: true }} transition={{ delay: i * 0.05, duration: 0.6 }} />
                  </span>
                  <span className="bars__v">{Math.round(k).toLocaleString()}</span>
                </li>
              ))}
            </ul>
            <p className="fine">Borders from Natural Earth 1:50m; distances near borders are approximate (±1 km).</p>
          </div>
        </div>
      </div>
    </section>
  )
}

const CHECK_KEY = 'eurotrip:checks'

export function Checklist({ model }: { model: TripModel }) {
  const [done, setDone] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(CHECK_KEY) ?? '[]')
    } catch {
      return []
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(CHECK_KEY, JSON.stringify(done))
    } catch { /* ignore */ }
  }, [done])
  const visited = new Set([...Object.keys(model.totals.kmByCountry), ...Object.keys(model.totals.nightsByCountry)])
  const items = CHECKLIST.filter((c) => !c.countries || c.countries.some((cc) => visited.has(cc)))
  const groups = [...new Set(items.map((i) => i.group))]
  const routesInPlan = [model.state.out.route, model.state.ret.route]
  const relevant = (id: string) => {
    if (id === 'neuschwanstein') return routesInPlan.includes('r1')
    if (id === 'venice-fee') return model.plan.nights.some((n) => n.place?.id === 'venice')
    if (id === 'dolomites-hotels') return routesInPlan.some((r) => r === 'r3' || r === 'r7')
    return true
  }
  const shown = items.filter((i) => relevant(i.id))
  return (
    <section className="checklist" id="checklist" aria-labelledby="checklist-title">
      <div className="wrap">
        <SectionHead kicker="Before you go" title="Pre-trip checklist" id="checklist-title">
          <p>Filtered to the countries and bookings on your plan. Ticks are saved on this device. {done.filter((d) => shown.some((s) => s.id === d)).length}/{shown.length} done.</p>
        </SectionHead>
        <div className="checklist__grid">
          {groups.map((g) => (
            <div key={g} className="cgroup">
              <h3 className="h3">{g}</h3>
              <ul>
                {shown.filter((i) => i.group === g).map((i) => (
                  <li key={i.id}>
                    <label className="check">
                      <input type="checkbox" checked={done.includes(i.id)} onChange={(e) => setDone((d) => (e.target.checked ? [...d, i.id] : d.filter((x) => x !== i.id)))} />
                      <span>
                        <span className="check__t">{i.text}</span>
                        {i.detail && <span className="check__d">{i.detail}</span>}
                        {i.sources && <SourceLinks sources={i.sources} />}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function Excluded() {
  const reinstated = useTrip((s) => s.reinstated)
  const toggle = useTrip((s) => s.toggleReinstate)
  return (
    <section className="excluded" id="excluded" aria-labelledby="excluded-title">
      <div className="wrap">
        <SectionHead kicker="Nothing silently dropped" title="Considered but excluded" id="excluded-title">
          <p>Everything left out, and why. Where it makes sense you can put a place back on a route. It is added to that day's routing and flagged with a warning.</p>
        </SectionHead>
        <ul className="xgrid">
          {EXCLUSIONS.map((x) => {
            const on = reinstated.includes(x.id)
            return (
              <li key={x.id} className={`xcard ${on ? 'is-on' : ''}`}>
                <div className="xcard__head">
                  <span className={`xkind xkind--${x.kind}`}>{x.kind}</span>
                  {x.userExclusion && <span className="tag">your exclusion</span>}
                </div>
                <h3>{x.name}</h3>
                <p>{x.reason}</p>
                {x.typicalOpening && <p className="xcard__open"><b>Typically opens:</b> {x.typicalOpening}</p>}
                <SourceLinks sources={x.sources} checked={x.lastChecked} />
                {x.reinstate && (
                  <label className="opt opt--x">
                    <input type="checkbox" checked={on} onChange={() => toggle(x.id)} />
                    <span className="opt__switch" aria-hidden="true" />
                    <span>
                      Put back on <b>Route {ROUTE_BY_ID[x.reinstate.routeId].num}</b>, day {x.reinstate.dayIndex + 1}
                      {on && <span className="warn-inline"> ⚠ {x.reinstate.warning}</span>}
                    </span>
                  </label>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

export function Footer({ model }: { model: TripModel }) {
  const { legStatus, chargers, holidays } = model
  const reset = useTrip((s) => s.reset)
  return (
    <footer className="footer">
      <div className="wrap footer__grid">
        <div>
          <h3 className="h3">Data &amp; freshness</h3>
          <ul className="fine-list">
            <li>Road routing: <a href="https://project-osrm.org" target="_blank" rel="noreferrer">OSRM</a> on OpenStreetMap data ({Object.keys(legStatus.legs).length} legs loaded). © OpenStreetMap contributors.</li>
            <li>Map: <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a>; terrain: AWS Terrain Tiles (Mapzen); rendering: MapLibre GL.</li>
            <li>Superchargers: <a href="https://supercharge.info" target="_blank" rel="noreferrer">supercharge.info</a>, snapshot {chargers ? new Date(chargers.fetchedAt).toLocaleDateString('en-GB') : '…'}.</li>
            <li>Public holidays: <a href="https://date.nager.at" target="_blank" rel="noreferrer">Nager.Date</a> {holidays?.live ? '(live)' : holidays ? `(offline copy, ${new Date(holidays.fetchedAt).toLocaleDateString('en-GB')})` : ''}; school holidays: OpenHolidays API, kalenderpedia, BMB.</li>
            <li>Photos: Wikimedia Commons, credited on each image with its licence.</li>
            <li>Country borders: Natural Earth.</li>
          </ul>
        </div>
        <div>
          <h3 className="h3">How to read this</h3>
          <ul className="fine-list">
            <li><Estimate /> marks anything modelled or approximate. Energy, charging times, tolls per km and ferry fares are estimates.</li>
            <li>Opening dates come from 2024–2026 seasons, so re-check passes a week before you go.</li>
            <li>Scenic and evening scores are editorial judgements, meant to be argued with.</li>
          </ul>
          <button type="button" className="linkbtn" onClick={() => confirm('Reset all selections to the defaults?') && reset()}>Reset plan to defaults</button>
        </div>
      </div>
    </footer>
  )
}
