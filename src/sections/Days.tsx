import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { getHome, setHome, useUi } from '../store'
import type { TripModel } from '../hooks'
import { ALL_HIGHLIGHTS } from '../lib/scoring'
import { dayLinks, overviewLinks, toGpx, toKml, download, GMAPS_MAX_WAYPOINTS } from '../lib/export'
import { Photo, SectionHead, Estimate } from '../ui/bits'
import { fmtDateLong, fmtH, fmtKm } from '../ui/format'
import { FLAGS, COUNTRY_NAMES } from '../lib/countries'
import { SocSpark } from './Charging'

export function Days({ model }: { model: TripModel }) {
  const { days, plan, legStatus } = model
  const setDay = useUi((s) => s.setDay)
  const [home, setHomeState] = useState(getHome())
  const [mobileLinks, setMobileLinks] = useState(false)
  const max = mobileLinks ? 3 : GMAPS_MAX_WAYPOINTS
  const overview = useMemo(() => overviewLinks(plan, { home: home || undefined }), [plan, home])

  return (
    <section className="days" id="days" aria-labelledby="days-title">
      <div className="wrap">
        <SectionHead kicker="Step 4 · Live it" title="Day by day" id="days-title">
          <p>The whole fortnight with dates, driving times (including modelled charging), highlights, where you sleep and practical notes. Public holidays and traffic peaks are flagged on driving days.</p>
        </SectionHead>

        <div className="export">
          <div className="export__row">
            <button type="button" className="btn" onClick={() => download(`soton-ljubljana-${plan.days[0]?.date}.gpx`, toGpx(plan, legStatus.legs), 'application/gpx+xml')}>
              ⤓ GPX (whole trip)
            </button>
            <button type="button" className="btn" onClick={() => download(`soton-ljubljana-${plan.days[0]?.date}.kml`, toKml(plan, legStatus.legs), 'application/vnd.google-earth.kml+xml')}>
              ⤓ KML (Google My Maps / Earth)
            </button>
            {overview.map((l) => (
              <a key={l.url} className="btn btn--g" href={l.url} target="_blank" rel="noreferrer">
                {l.label} in Google Maps ↗
              </a>
            ))}
          </div>
          <div className="export__row export__row--small">
            <label className="field field--inline">
              <span>Start/finish address for Google Maps links (saved only on this device)</span>
              <input type="text" value={home} placeholder="Southampton" autoComplete="street-address" onChange={(e) => { setHomeState(e.target.value); setHome(e.target.value) }} />
            </label>
            <label className="toggle">
              <input type="checkbox" checked={mobileLinks} onChange={(e) => setMobileLinks(e.target.checked)} /> Phone-friendly links (≤3 waypoints each)
            </label>
          </div>
          <p className="fine">Day links include the via points that force the scenic roads (e.g. over the Grossglockner rather than the tunnel), split into parts to respect Google's waypoint limit ({GMAPS_MAX_WAYPOINTS} per link in a browser). The overview links use overnight stops only, so Google chooses the roads between them.</p>
        </div>

        <ol className="timeline">
          {days.map((d, i) => {
            const dy = d.day
            const isBase = dy.kind === 'base'
            const links = dayLinks(dy, { home: home || undefined, max })
            const totalH = d.driveH + d.crossingH + (d.charging?.chargeMinutes ?? 0) / 60
            const dirClass = dy.dir === 'base' ? 'base' : dy.dir
            return (
              <motion.li key={dy.n} className={`tday tday--${dirClass} tday--${dy.kind}`} initial={{ opacity: 0.4, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.05 }} transition={{ duration: 0.4, delay: Math.min(0.15, (i % 4) * 0.04) }}>
                <div className="tday__date">
                  <span className="tday__n">Day {dy.n}</span>
                  <span className="tday__d">{fmtDateLong(dy.date)}</span>
                  {(d.holidays.length > 0 || d.peaks.length > 0) && dy.kind !== 'base' && dy.kind !== 'rest' && <span className="flag-hol" title="Holiday or traffic peak">⚠ traffic</span>}
                </div>
                <div className="tday__body">
                  <h3 className="tday__title">
                    {isBase ? 'In Slovenia' : dy.kind === 'rest' ? dy.title : `${dy.from.name.replace(/ \(.*\)/, '')} → ${dy.to.name.replace(/ \(.*\)/, '')}`}
                  </h3>
                  {!isBase && dy.kind === 'drive' && dy.title && <p className="tday__sub">{dy.title}</p>}
                  {dy.kind === 'ferry-night' && <p className="tday__sub">{dy.title}</p>}

                  {d.samples.length > 0 && (
                    <ul className="tday__stats">
                      <li><b>{fmtKm(d.km)}</b></li>
                      <li><b>{fmtH(d.driveH)}</b> driving</li>
                      {d.charging && d.charging.stops.length > 0 && <li>+ <b>{fmtH(d.charging.chargeMinutes / 60)}</b> charging ({d.charging.stops.length}) <Estimate>est.</Estimate></li>}
                      {d.crossingH > 0 && <li>+ {fmtH(d.crossingH)} crossing</li>}
                      <li className="tday__total">≈ {fmtH(totalH)} door to door</li>
                      {d.maxEle > 1200 && <li>▲ top {Math.round(d.maxEle).toLocaleString()} m</li>}
                      <li className="tday__flags">{d.countries.map((c) => <span key={c} title={COUNTRY_NAMES[c]}>{FLAGS[c] ?? c}</span>)}</li>
                    </ul>
                  )}
                  {!d.ready && dy.segments.some((s) => s.kind === 'drive') && <p className="loading">Routing…</p>}

                  {!isBase && dy.highlights.length > 0 && (
                    <ul className="thl">
                      {dy.highlights.map((h) => {
                        const x = ALL_HIGHLIGHTS[h.id]
                        if (!x) return null
                        return (
                          <li key={h.id} className="thl__i">
                            <Photo id={x.id} alt={x.name} category={x.category} sizes="120px" />
                            <span>{x.name}{h.optional && <small> (detour)</small>}</span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  {isBase && <p className="tday__note">Staying in Ljubljana. No driving planned.</p>}

                  {d.charging && d.samples.length > 0 && <SocSpark d={d} />}

                  <div className="tday__cols">
                    <div>
                      <h4>Sleep</h4>
                      <p>{dy.sleep === 'ferry' ? '🛳 On board (cabin)' : dy.sleep === 'home' ? '🏠 Home' : `🛏 ${dy.sleep.name}`}</p>
                    </div>
                    {(dy.notes.length > 0 || d.warnings.length > 0 || d.holidays.length > 0 || d.peaks.length > 0) && (
                      <div>
                        <h4>Notes</h4>
                        <ul className="notes">
                          {d.holidays.map((h, k) => <li key={`h${k}`} className="note note--hol">Public holiday in {FLAGS[h.cc]} {COUNTRY_NAMES[h.cc]}: {h.name}</li>)}
                          {d.peaks.map((p, k) => <li key={`p${k}`} className="note note--hol">{p}</li>)}
                          {d.warnings.map((w, k) => <li key={`w${k}`} className="note note--warn">{w}</li>)}
                          {dy.notes.map((n, k) => <li key={`n${k}`} className="note">{n}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>

                  {(links.length > 0 || d.samples.length > 0) && (
                    <div className="tday__actions">
                      {links.map((l) => (
                        <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="glink">
                          <span aria-hidden="true">📍</span> {l.label}
                        </a>
                      ))}
                      {d.samples.length > 0 && (
                        <a href="#map" className="glink glink--map" onClick={() => setDay(dy.n)}>
                          Show on map ↑
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </motion.li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
