import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useTrip } from '../store'
import { useTripState } from '../hooks'
import { ROUTES, ROUTE_BY_ID } from '../data/routes'
import type { Category, RouteDef } from '../data/types'
import { ALL_HIGHLIGHTS, CATEGORIES, scoreRoutes, type RouteMetrics, type RouteScore } from '../lib/scoring'
import { CAT_COLOR, CatIcon, MayBadge, Photo, ScenicDots, SectionHead } from '../ui/bits'
import { fmtH, fmtKm, fmtM } from '../ui/format'

type View = 'all' | 'miss' | 'shared'

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

const WEIGHT_LABELS = [
  { k: 'scenery', label: 'Scenic drives & landscapes' },
  { k: 'evenings', label: 'Good towns for evenings' },
  { k: 'charging', label: 'Easy Supercharging' },
  { k: 'may', label: 'Open & reliable in May' },
] as const

export function Compare() {
  const state = useTripState()
  const { setWeight, toggleCompare, toggleCategory, set, setRoute } = useTrip.getState()
  const metrics = useRouteMetrics()
  const [view, setView] = useState<View>('all')
  const [railOpen, setRailOpen] = useState(false)

  const scores = useMemo(() => {
    const mm: Record<string, RouteMetrics | undefined> = {}
    for (const r of ROUTES) mm[r.id] = metrics?.routes[r.id]?.out ?? metrics?.routes[r.id]?.ret
    return scoreRoutes(state.weights, state.stars, mm, state.reinstated)
  }, [state.weights, state.stars, metrics, state.reinstated])

  const selected = state.compare.map((id) => scores.find((s) => s.route.id === id)!).filter(Boolean)
  const cats = state.categories.length ? CATEGORIES.filter((c) => state.categories.includes(c.id)) : CATEGORIES

  // membership across selected routes
  const membership = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const s of selected) for (const h of s.highlights) m.set(h.id, [...(m.get(h.id) ?? []), s.route.id])
    return m
  }, [selected])
  const allMembership = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const s of scores) for (const h of s.highlights) m.set(h.id, [...(m.get(h.id) ?? []), s.route.id])
    return m
  }, [scores])

  const visible = (routeId: string, id: string) => {
    const n = membership.get(id)?.length ?? 0
    if (view === 'miss') return n === 1
    if (view === 'shared') return n > 1
    void routeId
    return true
  }

  return (
    <section className="compare" aria-labelledby="compare-title" id="compare">
      <div className="wrap">
        <SectionHead kicker="Step 1 · The decision" title="Compare the highlights" id="compare-title">
          <p>
            Pick two or three routes to see side by side. Star the places you care about and the ranking re-sorts.
          </p>
        </SectionHead>

        <div className="compare__layout">
          <aside className={`rail ${railOpen ? 'is-open' : ''}`} aria-label="Priorities and filters">
            <button type="button" className="rail__toggle" aria-expanded={railOpen} onClick={() => setRailOpen((o) => !o)}>
              <span>Priorities, filters &amp; ranking</span>
              <span aria-hidden="true">{railOpen ? '▴' : '▾'}</span>
            </button>
            <div className="rail__body">
              <div className="rail__block">
                <h3 className="rail__h">Your priorities</h3>
                {WEIGHT_LABELS.map(({ k, label }) => (
                  <label key={k} className="slider">
                    <span className="slider__top">
                      <span>{label}</span>
                      <output>{state.weights[k]}</output>
                    </span>
                    <input type="range" min={0} max={10} step={1} value={state.weights[k]} onChange={(e) => setWeight(k, Number(e.target.value))} aria-label={`${label} weight`} />
                  </label>
                ))}
              </div>

              <div className="rail__block">
                <h3 className="rail__h">Show categories</h3>
                <div className="chips">
                  {CATEGORIES.map((c) => {
                    const on = state.categories.includes(c.id)
                    return (
                      <button key={c.id} type="button" className={`chip ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => toggleCategory(c.id)} style={{ ['--c' as string]: CAT_COLOR[c.id] }}>
                        <CatIcon c={c.id} /> {c.plural}
                      </button>
                    )
                  })}
                  {state.categories.length > 0 && (
                    <button type="button" className="chip chip--clear" onClick={() => set({ categories: [] })}>
                      Show all
                    </button>
                  )}
                </div>
              </div>

              <div className="rail__block">
                <h3 className="rail__h">
                  Ranking <span className="muted">· {state.stars.length} starred</span>
                </h3>
                <ol className="ranking">
                  <AnimatePresence initial={false}>
                    {scores.map((s, i) => (
                      <motion.li key={s.route.id} layout transition={{ type: 'spring', stiffness: 500, damping: 40 }} className={`rank ${state.compare.includes(s.route.id) ? 'is-selected' : ''}`}>
                        <button type="button" className="rank__btn" aria-pressed={state.compare.includes(s.route.id)} onClick={() => toggleCompare(s.route.id)} title={state.compare.includes(s.route.id) ? 'Remove from comparison' : 'Add to comparison'}>
                          <span className="rank__pos">{i + 1}</span>
                          <span className="rank__num">R{s.route.num}</span>
                          <span className="rank__name">
                            {s.route.short}
                            {s.route.origin === 'research' && <span className="tag tag--new">new</span>}
                            {s.route.directions === 'return-only' && <span className="tag">return only</span>}
                          </span>
                          <span className="rank__score">
                            <span className="rank__bar" style={{ width: `${s.total}%` }} />
                            <span className="rank__val">{s.total}</span>
                          </span>
                          {s.stars > 0 && <span className="rank__stars" aria-label={`${s.stars} starred highlights`}>★{s.stars}</span>}
                          <span className="rank__check" aria-hidden="true">{state.compare.includes(s.route.id) ? '✓' : '+'}</span>
                        </button>
                        {(state.out.route === s.route.id || state.ret.route === s.route.id) && (
                          <span className="rank__plan">
                            {state.out.route === s.route.id && <span className="dir dir--out">Out</span>}
                            {state.ret.route === s.route.id && <span className="dir dir--ret">Back</span>}
                          </span>
                        )}
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ol>
                <p className="fine">Score = weighted mix of scenery, evenings, charging and May reliability (0–100). Each starred highlight adds 6.</p>
              </div>
            </div>
          </aside>

          <div className="board">
            <div className="board__toolbar">
              <div className="seg" role="radiogroup" aria-label="Highlight view">
                {([
                  ['all', 'All highlights'],
                  ['miss', "What you'd miss"],
                  ['shared', 'Shared'],
                ] as [View, string][]).map(([v, l]) => (
                  <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? 'is-on' : ''} onClick={() => setView(v)}>
                    {l}
                  </button>
                ))}
              </div>
              <p className="board__hint">{view === 'miss' ? 'Only highlights unique to one of the selected routes.' : view === 'shared' ? 'Highlights on more than one selected route.' : `${selected.length} routes · pick up to 3 in the ranking`}</p>
            </div>

            <div className="board__grid" style={{ ['--cols' as string]: selected.length }}>
              <div className="board__corner">
                <p>Scores out of 100, weighted by your priorities.</p>
                <MayBadge may="open" /> <MayBadge may="likely" /> <MayBadge may="check" /> <MayBadge may="closed" />
              </div>
              {selected.map((s) => (
                <RouteHeader key={s.route.id} s={s} metrics={metrics?.routes[s.route.id]} onUse={(dir) => setRoute(dir, s.route.id)} planOut={state.out.route} planRet={state.ret.route} rank={scores.indexOf(s) + 1} />
              ))}

              {cats.map((c) => {
                const perRoute = selected.map((s) =>
                  s.highlights
                    .filter((h) => ALL_HIGHLIGHTS[h.id].category === c.id && visible(s.route.id, h.id))
                    .sort((a, b) => Number(state.stars.includes(b.id)) - Number(state.stars.includes(a.id)) || ALL_HIGHLIGHTS[b.id].scenic - ALL_HIGHLIGHTS[a.id].scenic),
                )
                if (perRoute.every((l) => !l.length)) return null
                return (
                  <CategoryRow key={c.id} cat={c.id} label={c.plural} counts={perRoute.map((l) => l.length)}>
                    {selected.map((s, i) => (
                      <div key={s.route.id} className="cell" data-route={s.route.num}>
                        <span className="cell__mobile-label">R{s.route.num}</span>
                        {perRoute[i].length === 0 && <p className="cell__empty">—</p>}
                        {perRoute[i].map((h) => (
                          <HighlightCard key={h.id} id={h.id} optional={h.optional} starred={state.stars.includes(h.id)} alsoOn={(allMembership.get(h.id) ?? []).filter((r) => r !== s.route.id)} uniqueInSelection={view === 'miss'} />
                        ))}
                      </div>
                    ))}
                  </CategoryRow>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function CategoryRow({ cat, label, counts, children }: { cat: Category; label: string; counts: number[]; children: React.ReactNode }) {
  return (
    <>
      <div className="rowlabel" style={{ ['--c' as string]: CAT_COLOR[cat] }}>
        <span className="rowlabel__icon"><CatIcon c={cat} size={18} /></span>
        <span className="rowlabel__text">{label}</span>
        <span className="rowlabel__counts">{counts.join(' · ')}</span>
      </div>
      {children}
    </>
  )
}

function RouteHeader({ s, metrics, onUse, planOut, planRet, rank }: { s: RouteScore; metrics?: { out?: RouteMetrics; ret?: RouteMetrics }; onUse: (d: 'out' | 'ret') => void; planOut: string; planRet: string; rank: number }) {
  const r = s.route
  const lead = [...s.highlights].filter((h) => !h.optional).sort((a, b) => ALL_HIGHLIGHTS[b.id].scenic - ALL_HIGHLIGHTS[a.id].scenic)[0]
  const m = metrics?.out ?? metrics?.ret
  return (
    <motion.article className="rhead" layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="rhead__media">
        {lead && <Photo id={lead.id} alt={ALL_HIGHLIGHTS[lead.id].name} sizes="(max-width: 700px) 50vw, 420px" eager />}
        <span className="rhead__rank">#{rank}</span>
      </div>
      <div className="rhead__body">
        <div className="rhead__top">
          <div>
            <p className="rhead__num">Route {r.num}{r.origin === 'research' && <span className="tag tag--new">suggested</span>}</p>
            <h3 className="rhead__title">{r.name}</h3>
          </div>
          <p className="rhead__total" aria-label={`Score ${s.total} out of 100`}>
            <strong>{s.total}</strong>
            <span>{s.stars ? `★${s.stars}` : ''}</span>
          </p>
        </div>
        <p className="rhead__tag">{r.tagline}</p>
        <dl className="scores">
          {([
            ['Scenery', s.scenery],
            ['Evenings', s.evenings],
            ['Charging', s.charging],
            ['May', s.may],
          ] as [string, number][]).map(([k, v]) => (
            <div key={k} className="score">
              <dt>{k}</dt>
              <dd>
                <span className="score__bar"><span style={{ width: `${v}%` }} /></span>
                <span className="score__v">{v}</span>
              </dd>
            </div>
          ))}
        </dl>
        {m && (
          <ul className="rhead__stats" aria-label="Route statistics, one way, default stops">
            <li><b>{fmtKm(m.km)}</b></li>
            <li><b>{fmtH(m.hours)}</b> driving</li>
            <li>▲ <b>{fmtM(m.ascent)}</b></li>
            <li>top <b>{fmtM(m.maxEle)}</b></li>
          </ul>
        )}
        <div className="rhead__use">
          <button type="button" className={`btn btn--out ${planOut === r.id ? 'is-on' : ''}`} disabled={r.directions === 'return-only'} onClick={() => onUse('out')} aria-pressed={planOut === r.id}>
            {planOut === r.id ? '✓ Outbound' : 'Use outbound'}
          </button>
          <button type="button" className={`btn btn--ret ${planRet === r.id ? 'is-on' : ''}`} onClick={() => onUse('ret')} aria-pressed={planRet === r.id}>
            {planRet === r.id ? '✓ Return' : 'Use for return'}
          </button>
        </div>
      </div>
    </motion.article>
  )
}

function HighlightCard({ id, optional, starred, alsoOn, uniqueInSelection }: { id: string; optional: boolean; starred: boolean; alsoOn: string[]; uniqueInSelection: boolean }) {
  const h = ALL_HIGHLIGHTS[id]
  const toggleStar = useTrip((s) => s.toggleStar)
  return (
    <motion.div className={`hcard ${starred ? 'is-starred' : ''}`} layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25 }}>
      <div className="hcard__media">
        <Photo id={h.id} alt={h.name} category={h.category} />
        <button type="button" className="star" aria-pressed={starred} aria-label={starred ? `Unstar ${h.name}` : `Star ${h.name}`} onClick={() => toggleStar(h.id)}>
          {starred ? '★' : '☆'}
        </button>
        {uniqueInSelection && <span className="ribbon">Only here</span>}
      </div>
      <div className="hcard__body">
        <h4 className="hcard__title">{h.name}</h4>
        <p className="hcard__desc">{h.desc}</p>
        <div className="hcard__meta">
          <ScenicDots v={h.scenic} />
          <MayBadge may={h.may} title={h.mayNote} />
        </div>
        {(optional || alsoOn.length > 0) && (
          <p className="hcard__foot">
            {optional && <span className="tag">optional detour</span>}
            {alsoOn.length > 0 && <span className="also">also on {alsoOn.map((r) => `R${ROUTE_BY_ID[r].num}`).join(', ')}</span>}
          </p>
        )}
      </div>
    </motion.div>
  )
}

export type { RouteDef }
