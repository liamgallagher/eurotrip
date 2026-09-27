import { PLACES } from '../../data/places'
import { ALL_HIGHLIGHTS } from '../../lib/scoring'
import { COUNTRY_NAMES } from '../../lib/countries'
import { CatIcon, CAT_COLOR, MayBadge, Photo } from '../../ui/bits'
import { fmtDateLong } from '../../ui/format'
import { gmapsUrl, splitChain } from '../../lib/export'
import { addDays } from '../../lib/plan'
import type { DayStats } from '../../lib/tripStats'
import { sunTimes } from '../scene/sun'
import { arrivalMin, dayKey, estCharges, type Planner } from '../engine/planner'
import { setDayPrefs, setNights, toggleFirm, type Trip } from '../engine/trip'
import { useApp } from '../store'
import { clock, dur, flag, Hearts, hName, Icon, ICONS, placeName, placePhoto } from './common'

// One day, in full: the drive, the breaks, the sights, the fallback and tonight's bed.

export const breakName = (clockMin: number) => (clockMin >= 11 * 60 + 30 && clockMin <= 14 * 60 + 30 ? 'Lunch' : 'Coffee')

export function bookingUrl(place: string, date: string) {
  const p = PLACES[place]
  const q = new URLSearchParams({ ss: `${p.name.replace(/ \(.*\)/, '')}, ${COUNTRY_NAMES[p.country] ?? ''}`, checkin: date, checkout: addDays(date, 1), group_adults: '2', no_rooms: '1' })
  return `https://www.booking.com/searchresults.en-gb.html?${q}`
}

export function DayCard({ pl, trip, stats }: { pl: Planner | null; trip: Trip; stats: DayStats[] | null }) {
  const n = useApp((s) => s.day)
  const plan = useApp((s) => s.plan)
  const setPlan = useApp((s) => s.setPlan)
  const set = useApp((s) => s.ui)
  if (n == null) return null
  const d = trip.days[n - 1]
  if (!d) return null
  const st = stats?.[n - 1]
  const e = d.e
  const tonight = PLACES[d.sleep]
  const sun = tonight ? sunTimes(d.date, tonight.lat, tonight.lon) : null
  const arrive = e ? arrivalMin(e, plan.settings, d.dir === 'out' && plan.out.crossing === 'ferry' && d.n === 2) : null
  const key = e ? dayKey(e.dir, e.from, e.to) : ''
  const prefs = plan.days[key] ?? {}
  const ways = e && pl ? pl.ways(e.dir, e.from, e.to) : []
  const dirPlan = d.dir === 'out' ? plan.out : plan.ret
  const stop = d.stop != null ? dirPlan.stops[d.stop] : null
  const onPass = e ? e.covered.filter((id) => ALL_HIGHLIGHTS[id]?.category === 'pass' && ALL_HIGHLIGHTS[id].may !== 'open') : []
  const direct = ways.find((w) => w.id === 'direct')
  const driveH = st?.ready && st.driveH ? st.driveH * 60 : e?.min ?? 0
  const km = st?.ready && st.km ? st.km : e?.km ?? 0
  const charges = st?.charging?.stops ?? []

  if (d.kind === 'base') {
    return (
      <section className="panel__body daycard" aria-labelledby="day-h">
        <p className="kicker">Days {trip.days.filter((x) => x.kind === 'base')[0].n}–{trip.days.filter((x) => x.kind === 'base').at(-1)!.n} · {fmtDateLong(d.date)}</p>
        <h2 id="day-h">In Slovenia</h2>
        <p className="lede">Four nights, plans still to be decided — no driving scheduled. (The drive in and out is measured to central Ljubljana.)</p>
      </section>
    )
  }

  const title = d.kind === 'rest' ? d.title : e ? `${placeName(e.from)} → ${placeName(e.to)}` : d.title
  const links = d.segments.filter((s) => s.kind === 'drive').flatMap((s) => splitChain(s.waypoints!).map((c) => gmapsUrl(c)))

  return (
    <section className="panel__body daycard" aria-labelledby="day-h">
      <div className="daycard__hero">
        {tonight && placePhoto(tonight.id) && <Photo id={placePhoto(tonight.id)!} alt={tonight.name} hd eager sizes="440px" />}
        <div className="daycard__heroText">
          <p className="kicker">
            Day {d.n} · {fmtDateLong(d.date)} · {d.dir === 'out' ? 'Outbound' : 'Homeward'}
          </p>
          <h2 id="day-h">{title}</h2>
          {e?.way.kind === 'curated' && <p className="daycard__way">{e.way.label}</p>}
        </div>
      </div>

      {e && (
        <dl className="facts">
          <div>
            <dt>At the wheel</dt>
            <dd>{dur(driveH)}</dd>
          </div>
          <div>
            <dt>Distance</dt>
            <dd>{Math.round(km)} km</dd>
          </div>
          <div>
            <dt>Arrive</dt>
            <dd title="Leaving at your usual time, with stops at the sights, charging and lunch (estimate)">~{clock(arrive!)}</dd>
          </div>
          {sun && (
            <div>
              <dt>Sunset</dt>
              <dd>{clock(sun.sunset)}</dd>
            </div>
          )}
        </dl>
      )}
      {st?.warnings.map((w, i) => <p key={i} className="warn">⚠ {w}</p>)}
      {st?.peaks.map((p, i) => <p key={i} className="warn warn--soft">🚗 {p}</p>)}
      {st?.holidays.map((h, i) => <p key={i} className="warn warn--soft">🎌 {h.name} ({h.cc}) — shops shut, roads busy</p>)}

      {e && ways.length > 1 && (
        <div className="ways" role="radiogroup" aria-label="Which way">
          {ways.map((w) => {
            const on = e.way.id === w.id
            return (
              <button key={w.id} type="button" role="radio" aria-checked={on} className={`way ${on ? 'is-on' : ''}`} onClick={() => setPlan((p) => setDayPrefs(p, key, { way: w.id }))}>
                <span className="way__t">{w.kind === 'curated' ? `Scenic: ${w.label}` : 'Most direct'}</span>
                <span className="way__m">{dur(w.min)}</span>
              </button>
            )
          })}
        </div>
      )}

      {e && (
        <>
          <h3 className="h3">Breaks</h3>
          {charges.length ? (
            <ul className="breaks">
              {charges.map((c, i) => {
                const at = plan.settings.departMin + (c.charger.km / Math.max(1, km)) * driveH + i * 25
                return (
                  <li key={i}>
                    <Icon d={ICONS.bolt} size={16} />
                    <span>
                      <b>{breakName(at)}</b> at {c.charger.n.replace(/, [A-Z]{2}$/, '')} · ~{Math.round(c.minutes)} min <small>({Math.round(c.arriveSoc)}% → {Math.round(c.departSoc)}%, around {clock(at)})</small>
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="muted">{st?.ready ? 'No charging needed — plug in at the hotel tonight.' : `≈ ${estCharges(e.km, e.way.ascent)} charging stop${estCharges(e.km, e.way.ascent) === 1 ? '' : 's'} (estimate until the road is modelled)`}</p>
          )}

          <h3 className="h3">On the way</h3>
          <ul className="sights">
            {e.covered.filter((id) => ALL_HIGHLIGHTS[id] && !tonight?.highlights.includes(id)).map((id) => {
              const h = ALL_HIGHLIGHTS[id]
              const detour = e.detoursTaken.includes(id)
              return (
                <li key={id} className="sight" onMouseEnter={() => set({ hoverHighlight: id })} onMouseLeave={() => set({ hoverHighlight: null })}>
                  <div className="sight__img">
                    <Photo id={id} alt="" category={h.category} sizes="120px" />
                  </div>
                  <div className="sight__body">
                    <p className="sight__name">
                      <span style={{ color: CAT_COLOR[h.category] }}>
                        <CatIcon c={h.category} />
                      </span>{' '}
                      {h.name} {detour && <span className="tag">detour</span>}
                    </p>
                    <p className="sight__desc">{h.desc}</p>
                    <div className="sight__meta">
                      <MayBadge may={h.may} title={h.mayNote} />
                      <Hearts id={id} size="sm" />
                      <button type="button" className="linkbtn" onClick={() => setPlan((p) => setDayPrefs(p, key, detour ? { include: (prefs.include ?? []).filter((x) => x !== id) } : { skip: [...(prefs.skip ?? []), id] }))}>
                        {detour ? 'Drop detour' : 'Skip'}
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
          {(prefs.skip?.length ?? 0) > 0 && (
            <p className="muted">
              Skipped: {prefs.skip!.map(hName).join(', ')}{' '}
              <button type="button" className="linkbtn" onClick={() => setPlan((p) => setDayPrefs(p, key, { skip: [] }))}>
                bring back
              </button>
            </p>
          )}

          {e.way.detours.length > 0 && (
            <>
              <h3 className="h3">Worth a detour</h3>
              <ul className="detours">
                {e.way.detours
                  .filter((x) => !e.covered.includes(x.id) && ALL_HIGHLIGHTS[x.id])
                  .slice(0, 5)
                  .map((x) => (
                    <li key={x.id}>
                      <span className="detour__name">{hName(x.id)}</span>
                      <span className="detour__cost">+{dur(x.extra)}</span>
                      <Hearts id={x.id} size="sm" />
                      <button type="button" className="btn btn--small" onClick={() => setPlan((p) => setDayPrefs(p, key, { include: [...(prefs.include ?? []), x.id] }))}>
                        <Icon d={ICONS.plus} size={14} /> Add
                      </button>
                    </li>
                  ))}
              </ul>
            </>
          )}

          {onPass.length > 0 && direct && e.way.id !== 'direct' && (
            <div className="planb">
              <h3 className="h3">Plan B</h3>
              <p>
                If {onPass.map(hName).join(' or ')} {onPass.length > 1 ? 'are' : 'is'} shut that morning, take the most direct road instead: {dur(direct.min)} ({direct.min >= e.way.min ? '+' : '−'}
                {dur(Math.abs(direct.min - e.way.min))}).
              </p>
              <p className="muted">
                Check the pass status the evening before:{' '}
                {onPass.map((id) => {
                  const src = ALL_HIGHLIGHTS[id].sources.find((s) => !/wikipedia/i.test(s.label)) ?? ALL_HIGHLIGHTS[id].sources[0]
                  return (
                    <a key={id} href={src.url} target="_blank" rel="noreferrer">
                      {hName(id)} ↗{' '}
                    </a>
                  )
                })}
              </p>
            </div>
          )}
        </>
      )}

      {tonight && d.sleep !== 'ljubljana' && (
        <div className="tonight">
          <h3 className="h3">
            Tonight: {tonight.name} {flag(tonight.country)}
          </h3>
          <p>{tonight.blurb}</p>
          {tonight.highlights.map((id) => (
            <p key={id} className="tonight__hl">
              <b>{hName(id)}</b> <Hearts id={id} size="sm" />
            </p>
          ))}
          {[...(tonight.notes ?? []), ...(tonight.charging ? [tonight.charging] : [])].map((x, i) => (
            <p key={i} className="muted">
              · {x}
            </p>
          ))}
          <div className="tonight__actions">
            {d.stop != null && d.kind === 'drive' && (
              <button type="button" className="btn btn--primary" onClick={() => set({ panel: 'candidates', cand: { dir: d.dir as 'out' | 'ret', slot: d.stop! }, focusCand: null })}>
                <Icon d={ICONS.swap} size={16} /> Change tonight’s stop
              </button>
            )}
            {stop && d.stop != null && (
              <>
                <button type="button" className={`btn ${stop.firm ? 'btn--on' : 'btn--ghost'}`} aria-pressed={!!stop.firm} onClick={() => setPlan((p) => toggleFirm(p, d.dir as 'out' | 'ret', d.stop!))} title="Booked stops never move when you re-plan">
                  <Icon d={stop.firm ? ICONS.lock : ICONS.unlock} size={16} /> {stop.firm ? 'Booked' : 'Mark as booked'}
                </button>
                {pl && (
                  <button type="button" className="btn btn--ghost" onClick={() => setPlan((p) => setNights(pl, p, d.dir as 'out' | 'ret', d.stop!, stop.nights > 1 ? 1 : 2))}>
                    {stop.nights > 1 ? 'Just one night' : 'Stay two nights'}
                  </button>
                )}
              </>
            )}
            <a className="btn btn--ghost" href={bookingUrl(tonight.id, d.date)} target="_blank" rel="noreferrer">
              Hotels on Booking.com ↗
            </a>
          </div>
        </div>
      )}
      {links.length > 0 && (
        <p className="muted">
          Open the drive in Google Maps:{' '}
          {links.map((u, i) => (
            <a key={i} href={u} target="_blank" rel="noreferrer">
              {links.length > 1 ? `part ${i + 1} ↗ ` : 'directions ↗'}
            </a>
          ))}
        </p>
      )}
    </section>
  )
}
