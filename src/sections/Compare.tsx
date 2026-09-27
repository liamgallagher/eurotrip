import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useTrip } from '../store'
import { useMediaQuery, useTripState } from '../hooks'
import { ROUTES, ROUTE_BY_ID } from '../data/routes'
import { PLACES } from '../data/places'
import type { RouteDef } from '../data/types'
import { ALL_HIGHLIGHTS, CATEGORIES, type RouteMetrics } from '../lib/scoring'
import { COUNTRY_NAMES } from '../lib/countries'
import { optionOn } from '../lib/state'
import { CAT_COLOR, CatIcon, MayBadge, Photo, SectionHead, googleImagesUrl, googleMapsSearchUrl } from '../ui/bits'
import { fmtH, fmtKm, fmtM } from '../ui/format'

// Photo-led comparison: pick one or two routes and scroll through every place on them in travel order,
// each shown large. No scores or sliders — just the places.

interface MetricsFile {
  builtAt: string
  routes: Record<string, { out?: RouteMetrics; ret?: RouteMetrics }>
}

export function useRouteMetrics() {
  const [m, setM] = useState<MetricsFile | null>(null)
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/route-metrics.json`).then((r) => (r.ok ? r.json() : null)).then(setM).catch(() => setM(null))
  }, [])
  return m
}

interface Stop {
  id: string
  optional: boolean
  overnight: boolean
}
interface Chapter {
  title: string
  stops: Stop[]
}

/** Highlights of a route in travel order (Channel → Slovenia), grouped by driving day. */
function chapters(r: RouteDef, options: Record<string, boolean>): Chapter[] {
  const seen = new Set<string>()
  const add = (list: Stop[], s: Stop) => {
    if (seen.has(s.id) || !ALL_HIGHLIGHTS[s.id]) return
    seen.add(s.id)
    list.push(s)
  }
  return r.days.map((d, i) => {
    const stops: Stop[] = []
    d.highlights.forEach((id) => add(stops, { id, optional: false, overnight: false }))
    d.options?.forEach((o) => {
      const on = optionOn({ options }, r.id, i, o.id)
      o.highlights.forEach((id) => add(stops, { id, optional: !on || !o.defaultOn, overnight: false }))
    })
    const stop = r.stops[i]
    if (stop) PLACES[stop.default].highlights.forEach((id) => add(stops, { id, optional: false, overnight: true }))
    const night = stop ? PLACES[stop.default].name.replace(/ \(.*\)/, '') : 'Ljubljana'
    return { title: `${d.title} → ${night}`, stops }
  })
}

export function Compare() {
  const state = useTripState()
  const { set, setRoute, toggleStar } = useTrip.getState()
  const metrics = useRouteMetrics()
  const narrow = useMediaQuery('(max-width: 900px)')
  const [uniqueOnly, setUniqueOnly] = useState(false)
  const selected = state.compare.slice(0, 2)
  const [mobileTab, setMobileTab] = useState(0)
  const shown = narrow ? [selected[Math.min(mobileTab, selected.length - 1)]] : selected

  const membership = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const r of ROUTES) for (const c of chapters(r, {})) for (const s of c.stops) m.set(s.id, [...(m.get(s.id) ?? []), r.id])
    return m
  }, [])

  const pick = (id: string) => {
    if (selected.includes(id)) {
      if (selected.length > 1) set({ compare: selected.filter((x) => x !== id) })
      return
    }
    set({ compare: selected.length >= 2 ? [selected[1], id] : [...selected, id] })
    setMobileTab(Math.min(1, selected.length))
  }

  return (
    <section className="compare" aria-labelledby="compare-title" id="compare">
      <div className="wrap">
        <SectionHead kicker="Step 1 · Where would you rather be?" title="The places on each route" id="compare-title">
          <p>Choose one or two routes and scroll through every place you'd see, in the order you'd drive it. Tap ♡ to shortlist a place, or “More photos” to see it on Google.</p>
        </SectionHead>

        <div className="routepicker" role="group" aria-label="Choose up to two routes to compare">
          {ROUTES.map((r) => {
            const on = selected.includes(r.id)
            const m = metrics?.routes[r.id]?.out ?? metrics?.routes[r.id]?.ret
            const lead = leadPhoto(r)
            const hearts = state.stars.filter((s) => (membership.get(s) ?? []).includes(r.id)).length
            return (
              <button key={r.id} type="button" className={`rpick ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => pick(r.id)}>
                <span className="rpick__img">{lead && <Photo id={lead} alt="" sizes="160px" />}</span>
                <span className="rpick__txt">
                  <span className="rpick__num">
                    Route {r.num}
                    {state.out.route === r.id && <span className="dir dir--out">Out</span>}
                    {state.ret.route === r.id && <span className="dir dir--ret">Back</span>}
                    {r.origin === 'research' && <span className="tag tag--new">new</span>}
                  </span>
                  <span className="rpick__name">{r.short}</span>
                  <span className="rpick__meta">
                    {m ? `${fmtKm(m.km)} · top ${fmtM(m.maxEle)}` : r.directions === 'return-only' ? 'return only' : ''}
                    {hearts > 0 && <span className="rpick__hearts"> · ♥ {hearts}</span>}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        {selected.length > 1 && (
          <div className="gallery__bar">
            {narrow && (
              <div className="seg" role="tablist" aria-label="Route shown">
                {selected.map((id, i) => (
                  <button key={id} type="button" role="tab" aria-selected={mobileTab === i} className={mobileTab === i ? 'is-on' : ''} onClick={() => setMobileTab(i)}>
                    R{ROUTE_BY_ID[id].num} {ROUTE_BY_ID[id].short}
                  </button>
                ))}
              </div>
            )}
            <label className="toggle">
              <input type="checkbox" checked={uniqueOnly} onChange={(e) => setUniqueOnly(e.target.checked)} /> Only places the other route doesn't have
            </label>
          </div>
        )}

        <div className="gallery" style={{ ['--cols' as string]: shown.length }}>
          {shown.map((rid) => {
            const r = ROUTE_BY_ID[rid]
            const other = selected.find((x) => x !== rid)
            const m = metrics?.routes[rid]?.out ?? metrics?.routes[rid]?.ret
            const lead = leadPhoto(r)
            return (
              <motion.div key={rid} className="gcol" layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                <header className="ghero">
                  {lead && <Photo id={lead} alt={ALL_HIGHLIGHTS[lead].name} hd eager className="ghero__img" />}
                  <div className="ghero__overlay">
                    <p className="ghero__num">Route {r.num}{r.directions === 'return-only' ? ' · return only' : ''}</p>
                    <h3 className="ghero__title">{r.name}</h3>
                    <p className="ghero__tag">{r.tagline}</p>
                    {m && (
                      <p className="ghero__stats">
                        {fmtKm(m.km)} one way · {fmtH(m.hours)} at the wheel · ▲ {fmtM(m.ascent)} climbing · top {fmtM(m.maxEle)}
                      </p>
                    )}
                    <div className="ghero__use">
                      <button type="button" className={`btn btn--out ${state.out.route === rid ? 'is-on' : ''}`} disabled={r.directions === 'return-only'} aria-pressed={state.out.route === rid} onClick={() => setRoute('out', rid)}>
                        {state.out.route === rid ? '✓ Outbound' : 'Use outbound'}
                      </button>
                      <button type="button" className={`btn btn--ret ${state.ret.route === rid ? 'is-on' : ''}`} aria-pressed={state.ret.route === rid} onClick={() => setRoute('ret', rid)}>
                        {state.ret.route === rid ? '✓ Return' : 'Use for return'}
                      </button>
                    </div>
                  </div>
                </header>

                {chapters(r, state.options).map((c, ci) => {
                  const stops = c.stops.filter((s) => !uniqueOnly || !other || !(membership.get(s.id) ?? []).includes(other))
                  if (!stops.length) return null
                  return (
                    <section key={ci} className="chapter" aria-label={c.title}>
                      <h4 className="chapter__h">
                        <span className="chapter__n">{r.directions === 'return-only' ? `Leg ${ci + 1}` : `Day ${ci + 1}`}</span> {c.title}
                      </h4>
                      <AnimatePresence initial={false}>
                        {stops.map((s) => (
                          <PlaceCard key={s.id} stop={s} starred={state.stars.includes(s.id)} onStar={() => toggleStar(s.id)} alsoOn={(membership.get(s.id) ?? []).filter((x) => x !== rid)} other={other} />
                        ))}
                      </AnimatePresence>
                    </section>
                  )
                })}
                <p className="fine">
                  {r.flags.join(' ')} {r.directions === 'return-only' ? 'Shown here Channel → Slovenia; you would drive it the other way.' : 'Shown outbound; the return runs in reverse.'}
                </p>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function leadPhoto(r: RouteDef): string | undefined {
  const all = chapters(r, {}).flatMap((c) => c.stops).filter((s) => !s.optional)
  return all.sort((a, b) => ALL_HIGHLIGHTS[b.id].scenic - ALL_HIGHLIGHTS[a.id].scenic)[0]?.id
}

function PlaceCard({ stop, starred, onStar, alsoOn }: { stop: Stop; starred: boolean; onStar: () => void; alsoOn: string[]; other?: string }) {
  const h = ALL_HIGHLIGHTS[stop.id]
  const [open, setOpen] = useState(false)
  const cat = CATEGORIES.find((c) => c.id === h.category)!
  const where = `${h.name.replace(/\(.*?\)/g, '')} ${COUNTRY_NAMES[h.country] ?? ''}`.trim()
  return (
    <motion.article className={`place ${starred ? 'is-starred' : ''}`} layout initial={{ opacity: 0.4, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} exit={{ opacity: 0 }}>
      <div className="place__media">
        <Photo id={h.id} alt={h.name} category={h.category} hd />
        <div className="place__overlay">
          <span className="place__cat" style={{ ['--c' as string]: CAT_COLOR[h.category] }}>
            <CatIcon c={h.category} /> {cat.label}
          </span>
          <h5 className="place__title">{h.name}</h5>
        </div>
        <button type="button" className="heart" aria-pressed={starred} aria-label={starred ? `Remove ${h.name} from shortlist` : `Shortlist ${h.name}`} onClick={onStar}>
          {starred ? '♥' : '♡'}
        </button>
      </div>
      <div className="place__body">
        <p className="place__desc">{h.desc}</p>
        <div className="place__meta">
          <MayBadge may={h.may} title={h.mayNote} />
          {stop.overnight && <span className="tag">overnight stop</span>}
          {stop.optional && <span className="tag">optional detour</span>}
          {alsoOn.length > 0 && <span className="also">also on {alsoOn.map((x) => `R${ROUTE_BY_ID[x].num}`).join(', ')}</span>}
        </div>
        <div className="place__actions">
          <a className="plink" href={googleImagesUrl(where)} target="_blank" rel="noreferrer">More photos ↗</a>
          <a className="plink" href={googleMapsSearchUrl(where)} target="_blank" rel="noreferrer">Google Maps ↗</a>
          {(h.mayNote || h.tip) && (
            <button type="button" className="plink" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {open ? 'Less' : 'Tips & May notes'}
            </button>
          )}
        </div>
        {open && (
          <div className="place__more">
            {h.mayNote && <p><b>In May:</b> {h.mayNote}</p>}
            {h.tip && <p><b>Tip:</b> {h.tip}</p>}
            <p className="sources">
              {h.sources.map((s, i) => <a key={i} href={s.url} target="_blank" rel="noreferrer">{s.label}</a>)}
              <span className="sources__checked">checked {h.lastChecked}</span>
            </p>
          </div>
        )}
      </div>
    </motion.article>
  )
}
