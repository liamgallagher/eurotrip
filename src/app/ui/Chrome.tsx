import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { PLACES } from '../../data/places'
import { fmtDate } from '../../ui/format'
import { sunTimes } from '../scene/sun'
import { PEOPLE, PERSON } from '../engine/planner'
import type { Trip } from '../engine/trip'
import { shareUrl, useApp, type Panel, type ViewMode } from '../store'
import { clock, Icon, ICONS, OUT, RET, shortName } from './common'

// The frame around the diorama: top bar, day strip and sun dial.

const range = (a: string, b: string) => {
  const d1 = new Date(a + 'T12:00:00Z'), d2 = new Date(b + 'T12:00:00Z')
  const m = (d: Date) => d.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })
  return d1.getUTCMonth() === d2.getUTCMonth() ? `${d1.getUTCDate()}–${d2.getUTCDate()} ${m(d2)} ${d2.getUTCFullYear()}` : `${d1.getUTCDate()} ${m(d1)} – ${d2.getUTCDate()} ${m(d2)} ${d2.getUTCFullYear()}`
}

export function TopBar({ trip, totals }: { trip: Trip | null; totals: { km: number; driveH: number } | null }) {
  const { panel, view, who, start } = useApp(useShallow((s) => ({ panel: s.panel, view: s.view, who: s.plan.who, start: s.plan.startDate })))
  const set = useApp((s) => s.ui)
  const setWho = useApp((s) => s.setWho)
  const [menu, setMenu] = useState(false)
  const open = (p: Panel) => {
    set({ panel: panel === p ? null : p, ...(p !== 'day' ? { day: null } : {}) })
    setMenu(false)
  }
  const share = async () => {
    const url = shareUrl()
    try {
      if (navigator.share) await navigator.share({ title: 'Our Slovenia road trip', url })
      else {
        await navigator.clipboard.writeText(url)
        set({ toast: 'Link copied — it holds the whole plan, including both sets of hearts.' })
      }
    } catch { /* cancelled */ }
    setMenu(false)
  }
  const views: [ViewMode, string, string][] = [['3d', '3D', ICONS.cube], ['2d', 'Map', ICONS.map], ['list', 'List', ICONS.list]]
  return (
    <header className="topbar">
      <button type="button" className="brand" onClick={() => set({ panel: null, day: null })} aria-label="Whole trip overview">
        <span className="brand__mark">Soton × Slovenia</span>
        <span className="brand__sub">{trip ? range(start, trip.endDate) : 'May 2027'}{totals && totals.km > 0 ? ` · ${Math.round(totals.km).toLocaleString('en-GB')} km · ${Math.round(totals.driveH)} h driving` : ''}</span>
      </button>
      <nav className={`topbar__nav ${menu ? 'is-open' : ''}`} aria-label="Planner">
        <button type="button" className={panel === 'options' ? 'is-on' : ''} onClick={() => open('options')}>
          <Icon d={ICONS.route} /> Trip ideas
        </button>
        <button type="button" className={panel === 'discover' ? 'is-on' : ''} onClick={() => open('discover')}>
          <Icon d={ICONS.heart} /> Must-sees
        </button>
        <button type="button" className={panel === 'sheet' ? 'is-on' : ''} onClick={() => open('sheet')} disabled={!trip}>
          <Icon d={ICONS.book} /> Plan
        </button>
        <button type="button" className={panel === 'journal' ? 'is-on' : ''} onClick={() => open('journal')} disabled={!trip}>
          <Icon d={ICONS.camera} /> Our drive
        </button>
        <a href="#today" className="navlink" onClick={() => setMenu(false)}>
          <Icon d={ICONS.today} /> Today
        </a>
        <button type="button" className={panel === 'settings' ? 'is-on' : ''} onClick={() => open('settings')} aria-label="Settings">
          <Icon d={ICONS.gear} /> <span className="only-menu">Settings</span>
        </button>
        <button type="button" onClick={share} aria-label="Share this plan">
          <Icon d={ICONS.share} /> <span className="only-menu">Share</span>
        </button>
      </nav>
      <div className="topbar__right">
        <div className="who" role="radiogroup" aria-label="Who is choosing">
          {PEOPLE.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={who === p} className={`who__p ${who === p ? 'is-on' : ''}`} style={{ ['--c' as string]: PERSON[p].color }} onClick={() => setWho(p)}>
              {PERSON[p].name}
            </button>
          ))}
        </div>
        <div className="seg" role="radiogroup" aria-label="View">
          {views.map(([v, label, d]) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? 'is-on' : ''} onClick={() => set({ view: v })} title={label}>
              <Icon d={d} size={16} />
              <span className="seg__label">{label}</span>
            </button>
          ))}
        </div>
        <button type="button" className="menu-btn" aria-expanded={menu} aria-label="Menu" onClick={() => setMenu((m) => !m)}>
          <Icon d="M4 7h16M4 12h16M4 17h16" />
        </button>
      </div>
    </header>
  )
}

export function DayStrip({ trip }: { trip: Trip }) {
  const { day, panel } = useApp(useShallow((s) => ({ day: s.day, panel: s.panel })))
  const set = useApp((s) => s.ui)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current?.querySelector('.is-on') as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [day])
  const base = trip.days.filter((d) => d.kind === 'base')
  const firstBase = base[0]?.n
  const pick = (n: number | null) => set({ day: n, panel: n == null ? null : 'day', sunMin: null })
  return (
    <nav className="daystrip" aria-label="Days of the trip">
      <div className="daystrip__scroll" ref={ref}>
        <button type="button" className={`dchip dchip--all ${day == null && panel !== 'options' ? 'is-on' : ''}`} onClick={() => pick(null)}>
          <span className="dchip__n">All</span>
          <span className="dchip__t">Whole trip</span>
        </button>
        {trip.days.map((d) => {
          if (d.kind === 'base' && d.n !== firstBase) return null
          const on = day === d.n || (d.kind === 'base' && day != null && trip.days[day - 1]?.kind === 'base')
          const label = d.kind === 'base' ? `Slovenia` : d.sleep === 'home' ? 'Home' : d.sleep === 'ferry' ? 'Ferry' : shortName(d.sleep)
          const c = d.dir === 'out' ? OUT : d.dir === 'ret' ? RET : '#c4b5fd'
          return (
            <button key={d.n} type="button" className={`dchip ${on ? 'is-on' : ''} dchip--${d.kind}`} style={{ ['--c' as string]: c }} onClick={() => pick(d.n)} aria-label={`Day ${d.n}, ${fmtDate(d.date)}: ${d.title}`}>
              <span className="dchip__n">{d.kind === 'base' ? `${d.n}–${d.n + base.length - 1}` : d.n}</span>
              <span className="dchip__t">{label}{d.kind === 'base' ? ` ×${base.length + 1}` : ''}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export function SunDial({ trip }: { trip: Trip | null }) {
  const { sunMin, day, start } = useApp(useShallow((s) => ({ sunMin: s.sunMin, day: s.day, start: s.plan.startDate })))
  const set = useApp((s) => s.ui)
  const [playing, setPlaying] = useState(false)
  const d = day != null && trip ? trip.days[day - 1] : null
  const place = d ? PLACES[d.sleep] ?? PLACES[d.to] : PLACES.ljubljana
  const t = sunTimes(d?.date ?? start, place?.lat ?? 47, place?.lon ?? 10)
  const cur = sunMin ?? null
  useEffect(() => {
    if (!playing) return
    let m = Math.max(t.sunrise - 30, 5 * 60)
    const id = setInterval(() => {
      m += 6
      if (m > t.sunset + 60) {
        setPlaying(false)
        set({ sunMin: null })
        return
      }
      set({ sunMin: m })
    }, 50)
    return () => clearInterval(id)
  }, [playing, t.sunrise, t.sunset, set])
  return (
    <div className="sundial" role="group" aria-label="Time of day">
      <button type="button" className="sundial__play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Stop the day' : 'Play the day from sunrise to sunset'}>
        <Icon d={playing ? ICONS.pause : ICONS.play} size={14} />
      </button>
      <input type="range" min={4 * 60} max={23 * 60} step={5} value={cur ?? 19 * 60 + 30} onChange={(e) => set({ sunMin: Number(e.target.value) })} aria-label="Sun time" />
      <span className="sundial__t">{cur != null ? clock(cur) : 'Arrival'}</span>
      <span className="sundial__sub" title="Sunrise and sunset where you sleep that night">
        ☀ {clock(t.sunrise)}–{clock(t.sunset)}
      </span>
      {cur != null && (
        <button type="button" className="sundial__reset" onClick={() => set({ sunMin: null })}>
          follow day
        </button>
      )}
    </div>
  )
}
