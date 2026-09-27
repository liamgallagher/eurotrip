import { useMemo, useState } from 'react'
import { ALL_HIGHLIGHTS, CATEGORIES } from '../../lib/scoring'
import { COUNTRY_NAMES } from '../../lib/countries'
import type { Category } from '../../data/types'
import { MayBadge, Photo, googleImagesUrl } from '../../ui/bits'
import { PEOPLE, PERSON } from '../engine/planner'
import type { Trip } from '../engine/trip'
import { useApp } from '../store'
import { useDio } from './Stage'
import { dur, flag, Hearts } from './common'

// Must-sees: every place we know about, large photos, and a heart for each of you.

type Group = 'route' | 'near' | 'all'

export function Discover({ trip }: { trip: Trip | null }) {
  const plan = useApp((s) => s.plan)
  const set = useApp((s) => s.ui)
  const focusId = useApp((s) => s.hoverHighlight)
  const dio = useDio()
  const [cat, setCat] = useState<Category | 'all'>('all')
  const [group, setGroup] = useState<Group>(trip ? 'route' : 'all')
  const [q, setQ] = useState('')

  const { onRoute, near } = useMemo(() => {
    const on = new Set<string>([...(trip?.out.covered ?? []), ...(trip?.ret.covered ?? [])])
    const nearM = new Map<string, number>()
    for (const d of trip?.days ?? []) for (const x of d.e?.way.detours ?? []) if (!on.has(x.id)) nearM.set(x.id, Math.min(nearM.get(x.id) ?? 999, x.extra))
    return { onRoute: on, near: nearM }
  }, [trip])

  const list = useMemo(() => {
    let ids = Object.keys(ALL_HIGHLIGHTS)
    if (group === 'route') ids = ids.filter((id) => onRoute.has(id))
    if (group === 'near') ids = ids.filter((id) => near.has(id)).sort((a, b) => near.get(a)! - near.get(b)!)
    if (cat !== 'all') ids = ids.filter((id) => ALL_HIGHLIGHTS[id].category === cat)
    if (q.trim()) {
      const s = q.trim().toLowerCase()
      ids = ids.filter((id) => `${ALL_HIGHLIGHTS[id].name} ${ALL_HIGHLIGHTS[id].desc} ${COUNTRY_NAMES[ALL_HIGHLIGHTS[id].country]}`.toLowerCase().includes(s))
    }
    if (group !== 'near') ids.sort((a, b) => ALL_HIGHLIGHTS[b].scenic - ALL_HIGHLIGHTS[a].scenic || ALL_HIGHLIGHTS[a].name.localeCompare(ALL_HIGHLIGHTS[b].name))
    // the one you tapped on the map comes first
    if (focusId && ids.includes(focusId)) ids = [focusId, ...ids.filter((x) => x !== focusId)]
    return ids
  }, [group, cat, q, onRoute, near, focusId])

  return (
    <section className="panel__body discover" aria-labelledby="disc-h">
      <p className="kicker">Must-sees · hearting as {PERSON[plan.who].name}</p>
      <h2 id="disc-h">What would you hate to miss?</h2>
      <p className="lede">
        Heart anything that makes you say “we have to”. Each of you has your own hearts ({PEOPLE.map((p) => `${PERSON[p].name} ${plan.hearts[p].length}`).join(', ')}); trip ideas and suggestions bend around them.
      </p>
      <div className="filters">
        <div className="seg seg--small" role="radiogroup" aria-label="Which places">
          {([['route', 'On our route'], ['near', 'Near it'], ['all', 'Everywhere']] as [Group, string][]).map(([g, l]) => (
            <button key={g} type="button" role="radio" aria-checked={group === g} className={group === g ? 'is-on' : ''} onClick={() => setGroup(g)} disabled={!trip && g !== 'all'}>
              {l}
            </button>
          ))}
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value as Category | 'all')} aria-label="Kind of place">
          <option value="all">All kinds</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.plural}
            </option>
          ))}
        </select>
        <input type="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search places" />
      </div>
      <ul className="gallery3">
        {list.map((id) => {
          const h = ALL_HIGHLIGHTS[id]
          return (
            <li key={id} className={`gcard ${focusId === id ? 'is-focus' : ''}`} onMouseEnter={() => set({ hoverHighlight: id })}>
              <div className="gcard__media">
                <Photo id={id} alt={h.name} category={h.category} hd sizes="(max-width: 900px) 100vw, 420px" />
                <div className="gcard__over">
                  <Hearts id={id} size="lg" />
                </div>
              </div>
              <div className="gcard__body">
                <h3>
                  {h.name} <span title={COUNTRY_NAMES[h.country]}>{flag(h.country)}</span>
                </h3>
                <p>{h.desc}</p>
                <p className="gcard__meta">
                  <MayBadge may={h.may} title={h.mayNote} />
                  {onRoute.has(id) && <span className="tag tag--on">on our route</span>}
                  {near.has(id) && <span className="tag">+{dur(near.get(id)!)} detour</span>}
                  <button type="button" className="linkbtn" onClick={() => dio?.flyTo({ lon: h.lon, lat: h.lat, dist: 28, tilt: 60 }, 2200)}>
                    Show me
                  </button>
                  <a className="linkbtn" href={googleImagesUrl(`${h.name} ${COUNTRY_NAMES[h.country] ?? ''}`)} target="_blank" rel="noreferrer">
                    More photos ↗
                  </a>
                </p>
              </div>
            </li>
          )
        })}
      </ul>
      {!list.length && <p className="muted">Nothing matches — try “Everywhere”.</p>}
    </section>
  )
}
