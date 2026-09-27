import { useState } from 'react'
import { PLACES } from '../../data/places'
import { EXCLUSIONS } from '../../data/exclusions'
import { ALL_HIGHLIGHTS } from '../../lib/scoring'
import { fmtDate, fmtEur } from '../../ui/format'
import type { CostLine, DayStats, TripTotals } from '../../lib/tripStats'
import type { ChargerData, HolidayData } from '../../lib/runtime'
import { PEOPLE, PERSON, type Planner } from '../engine/planner'
import { heartReport, whatIfHeart, type Trip } from '../engine/trip'
import { useApp, type SheetTab } from '../store'
import { dur, hName, placeName } from './common'

// The trip on paper, in four tabs: days, hearts, costs, and a check before booking.

interface Props {
  pl: Planner | null
  trip: Trip
  stats: { days: DayStats[]; totals: TripTotals; costs: CostLine[]; chargers: ChargerData | null; holidays: HolidayData | null } | null
}

export function TripSheet(p: Props) {
  const tab = useApp((s) => s.sheetTab)
  const set = useApp((s) => s.ui)
  const tabs: [SheetTab, string][] = [['days', 'Days'], ['hearts', 'Hearts'], ['costs', 'Costs'], ['checks', 'Before booking']]
  return (
    <section className="panel__body sheet" aria-label="The plan">
      <div className="tabs" role="tablist">
        {tabs.map(([t, l]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'is-on' : ''} onClick={() => set({ sheetTab: t })}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'days' && <DaysList {...p} />}
      {tab === 'hearts' && <HeartsTab {...p} />}
      {tab === 'costs' && <CostsTab {...p} />}
      {tab === 'checks' && <Checks {...p} />}
    </section>
  )
}

export function DaysList({ trip, stats }: Props) {
  const set = useApp((s) => s.ui)
  return (
    <ol className="dayslist">
      {trip.days.map((d) => {
        const st = stats?.days[d.n - 1]
        const min = st?.ready && st.driveH ? st.driveH * 60 : d.e?.min
        const km = st?.ready && st.km ? st.km : d.e?.km
        return (
          <li key={d.n}>
            <button type="button" className={`drow drow--${d.dir}`} onClick={() => set({ day: d.n, panel: 'day' })}>
              <span className="drow__n">{d.n}</span>
              <span className="drow__date">{fmtDate(d.date)}</span>
              <span className="drow__t">
                <b>{d.kind === 'base' ? 'In Slovenia' : d.title}</b>
                <small>
                  {d.sleep === 'home' ? 'Home' : d.sleep === 'ferry' ? 'On the ferry' : `Sleep: ${placeName(d.sleep)}`}
                  {min ? ` · ${dur(min)} · ${Math.round(km!)} km` : ''}
                  {st?.charging?.stops.length ? ` · ${st.charging.stops.length} ⚡` : ''}
                </small>
              </span>
              {(st?.warnings.length ?? 0) > 0 && <span className="drow__warn" title={st!.warnings.join('\n')}>⚠</span>}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function HeartsTab({ pl, trip }: Props) {
  const plan = useApp((s) => s.plan)
  const setPlan = useApp((s) => s.setPlan)
  const set = useApp((s) => s.ui)
  const rows = heartReport(plan, trip)
  const [what, setWhat] = useState<Record<string, ReturnType<typeof whatIfHeart> | 'none'>>({})
  if (!rows.length) {
    return (
      <p className="lede">
        No hearts yet. Open <button type="button" className="linkbtn" onClick={() => set({ panel: 'discover' })}>Must-sees</button> and each heart the places you’d hate to miss.
      </p>
    )
  }
  const shared = rows.filter((r) => r.both)
  return (
    <div className="hearts-tab">
      <p className="lede">
        {rows.filter((r) => r.covered).length} of {rows.length} hearted places are on the trip. {shared.length ? `You both love ${shared.map((r) => hName(r.id)).join(', ')}.` : ''}
      </p>
      {PEOPLE.map((person) => (
        <div key={person} className="hearts-col">
          <h3 className="h3" style={{ color: PERSON[person].color }}>
            ♥ {PERSON[person].name}
          </h3>
          <ul className="hlist">
            {rows.filter((r) => r.who.includes(person)).map((r) => {
              const w = what[r.id]
              return (
                <li key={r.id} className={r.covered ? 'is-on' : 'is-off'}>
                  <span className="hlist__mark">{r.covered ? '✓' : '—'}</span>
                  <span className="hlist__name">
                    {hName(r.id)} {r.both && <small>(both)</small>}
                  </span>
                  {!r.covered && pl && !w && (
                    <button type="button" className="linkbtn" onClick={() => setWhat((m) => ({ ...m, [r.id]: whatIfHeart(pl, plan, r.id) ?? 'none' }))}>
                      What would it take?
                    </button>
                  )}
                  {w === 'none' && <small className="muted">Doesn’t fit with {plan.settings.maxDriveH} h days — try longer days in Settings.</small>}
                  {w && w !== 'none' && (
                    <span className="whatif">
                      {w.extraMin >= 0 ? '+' : '−'}
                      {dur(Math.abs(w.extraMin))} driving{w.lost.length ? `, loses ${w.lost.map(hName).join(', ')}` : ''}{' '}
                      <button type="button" className="btn btn--small" onClick={() => { setPlan(w.st); set({ toast: `Re-planned the ${w.dir === 'out' ? 'way out' : 'way back'} to fit ${hName(r.id)}.` }) }}>
                        Do it
                      </button>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

function CostsTab({ stats }: Props) {
  if (!stats) return <p className="muted">Working out the costs…</p>
  const groups = ['Crossings', 'Vignettes', 'Tolls', 'Charging'] as const
  const total = stats.costs.reduce((a, c) => a + c.eur, 0)
  const t = stats.totals
  return (
    <div className="costs">
      <dl className="facts">
        <div>
          <dt>Driving</dt>
          <dd>{Math.round(t.km).toLocaleString('en-GB')} km</dd>
        </div>
        <div>
          <dt>At the wheel</dt>
          <dd>{Math.round(t.driveH)} h</dd>
        </div>
        <div>
          <dt>Supercharging</dt>
          <dd>
            {t.chargeStops} stops · {Math.round(t.chargeMin)} min
          </dd>
        </div>
        <div>
          <dt>Estimate</dt>
          <dd>{fmtEur(total)}</dd>
        </div>
      </dl>
      {groups.map((g) => {
        const lines = stats.costs.filter((c) => c.group === g)
        if (!lines.length) return null
        return (
          <div key={g}>
            <h3 className="h3">{g}</h3>
            <ul className="costlines">
              {lines.map((c, i) => (
                <li key={i}>
                  <span>
                    {c.label} {c.estimate && <span className="est">est.</span>}
                    {c.detail && <small>{c.detail}</small>}
                  </span>
                  <b>{fmtEur(c.eur)}</b>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      <p className="fine">Estimates for planning, not quotes. Sources and dates are on each line in the classic planner.</p>
    </div>
  )
}

function Checks({ trip, stats }: Props) {
  const plan = useApp((s) => s.plan)
  const set = useApp((s) => s.ui)
  const rows = heartReport(plan, trip)
  const missed = rows.filter((r) => !r.covered)
  const drives = trip.days.filter((d) => d.e)
  const hardest = drives.reduce((a, d) => ((d.e?.min ?? 0) > (a?.e?.min ?? 0) ? d : a), drives[0])
  const passes = [...new Set(drives.flatMap((d) => d.e!.covered.filter((id) => ALL_HIGHLIGHTS[id]?.category === 'pass' && ALL_HIGHLIGHTS[id].may !== 'open').map((id) => `${id}|${d.n}`)))]
  const busy = (stats?.days ?? []).filter((d) => d.peaks.length || d.holidays.length)
  const gaps = (stats?.days ?? []).filter((d) => d.charging?.gaps.length || (d.charging && !d.charging.feasible))
  const stays = [...new Set(trip.days.filter((d) => d.kind === 'drive' && PLACES[d.sleep]).map((d) => d.sleep))]
  const season = stays.filter((id) => (PLACES[id].notes ?? []).some((n) => /close|season|between/i.test(n)))
  const zones = stays.filter((id) => (PLACES[id].notes ?? []).some((n) => /ZFE|Umweltzone|ZTL|LEZ|Area C|congestion/i.test(n)))
  const firm = [...plan.out.stops, ...plan.ret.stops].filter((s) => s.firm).length
  const Item = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => <li className={ok ? 'ok' : 'todo'}><span aria-hidden="true">{ok ? '✓' : '!'}</span> <span>{children}</span></li>
  return (
    <div className="checks">
      <ul className="checklist">
        <Item ok={!missed.length}>{missed.length ? `Missing hearts: ${missed.map((r) => hName(r.id)).join(', ')}.` : 'Every hearted place is on the trip.'}</Item>
        {hardest?.e && <Item ok={hardest.e.min <= plan.settings.maxDriveH * 60}>Hardest day: day {hardest.n}, {placeName(hardest.e.from)} → {placeName(hardest.e.to)}, {dur(hardest.e.min)} at the wheel.</Item>}
        <Item ok={!passes.length}>
          {passes.length ? 'Passes to check that week: ' : 'No seasonal passes on the route.'}
          {passes.map((k) => {
            const [id, n] = k.split('|')
            return (
              <button key={k} type="button" className="linkbtn" onClick={() => set({ day: Number(n), panel: 'day' })}>
                {hName(id)} (day {n}){' '}
              </button>
            )
          })}
        </Item>
        <Item ok={!busy.length}>{busy.length ? `Busy days: ${busy.map((d) => `day ${d.day.n} (${[...d.peaks, ...d.holidays.map((h) => h.name)].join('; ')})`).join(' · ')}` : 'No holiday clashes on driving days.'}</Item>
        <Item ok={!gaps.length}>{gaps.length ? `Charging gaps on day ${gaps.map((d) => d.day.n).join(', ')} — see the day cards.` : 'Superchargers within reach all the way.'}</Item>
        <Item ok={!season.length}>{season.length ? `Between-season hotels: ${season.map(placeName).join(', ')} — confirm they’re open.` : 'No between-season closures flagged.'}</Item>
        <Item ok={!zones.length}>{zones.length ? `Low-emission / ZTL zones: ${zones.map(placeName).join(', ')} — register the car or park outside.` : 'No low-emission zones at your stops.'}</Item>
        <Item ok={firm > 0}>{firm ? `${firm} night${firm > 1 ? 's' : ''} marked as booked.` : 'Nothing marked as booked yet — tap “Mark as booked” on a night once you’ve reserved it.'}</Item>
      </ul>
      <h3 className="h3">Considered but excluded</h3>
      <ul className="excluded">
        {EXCLUSIONS.map((x) => (
          <li key={x.id}>
            <b>{x.name}</b> — {x.reason} {x.typicalOpening && <small>Typically opens: {x.typicalOpening}.</small>}{' '}
            {x.sources.map((s, i) => (
              <a key={i} href={s.url} target="_blank" rel="noreferrer">
                {s.label} ↗{' '}
              </a>
            ))}
          </li>
        ))}
      </ul>
      <p className="fine">
        Data: drive-time table and curated day times from OSRM; Superchargers from supercharge.info ({stats?.chargers?.fetchedAt.slice(0, 10) ?? '…'}); public holidays from Nager.Date ({stats?.holidays?.live ? 'live' : 'saved copy'}); May pass status as researched {Object.values(ALL_HIGHLIGHTS)[0]?.lastChecked}. Full sources and the detailed tables are in the <a href="./classic.html">classic planner</a>.
      </p>
    </div>
  )
}
