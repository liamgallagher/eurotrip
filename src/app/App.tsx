import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useApp } from './store'
import { useDayStats, useLegSet, useLegs, usePlanner, useTripPlan, type LegReq } from './data'
import { dayLegKey } from './engine/planner'
import { Stage } from './ui/Stage'
import { SceneSync } from './ui/SceneSync'
import { Pins } from './ui/Pins'
import { Gazetteer, Lettering } from './ui/Lettering'
import { FlightHUD } from './ui/FlightHUD'
import { TripFlight } from './ui/TripFlight'
import { DayStrip, SunDial, TopBar } from './ui/Chrome'
import { Options, useTripOptions } from './ui/Options'
import { DayCard } from './ui/DayCard'
import { Candidates } from './ui/Candidates'
import { Discover } from './ui/Discover'
import { DaysList, TripSheet } from './ui/TripSheet'
import { Settings } from './ui/Settings'
import { Icon, ICONS } from './ui/common'
import { useJournal } from './journal'

const Journal = lazy(() => import('./ui/Journal'))
const Today = lazy(() => import('./ui/Today'))
const Map2D = lazy(() => import('./ui/Map2D'))

function useHash() {
  const [h, setH] = useState(location.hash)
  useEffect(() => {
    const on = () => setH(location.hash)
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return h
}

export default function App() {
  const hash = useHash()
  const pl = usePlanner()
  const trip = useTripPlan(pl)
  const { legs } = useLegs(trip)
  const stats = useDayStats(trip, legs)
  const ui = useApp(useShallow((s) => ({ panel: s.panel, view: s.view, toast: s.toast, ribbon: s.ribbon, day: s.day, flying: s.tripFlight })))
  const set = useApp((s) => s.ui)
  const journal = useJournal()
  const options = useTripOptions(pl, ui.panel === 'options')
  const optionReqs = useMemo<LegReq[]>(() => {
    if (!options) return []
    const m = new Map<string, LegReq>()
    for (const o of options) for (const e of [...o.out.days, ...o.ret.days]) {
      const { key, waypoints } = dayLegKey(e)
      m.set(key, { key, waypoints })
    }
    return [...m.values()]
  }, [options])
  const { legs: optionLegs } = useLegSet(ui.panel === 'options' ? optionReqs : [])

  useEffect(() => {
    if (!ui.toast) return
    const id = setTimeout(() => set({ toast: null }), 5200)
    return () => clearTimeout(id)
  }, [ui.toast, set])

  useEffect(() => {
    if (trip) document.body.dataset.ready = '1'
  }, [trip])

  // Esc closes the panel
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') set({ panel: null, cand: null, focusCand: null })
    }
    addEventListener('keydown', on)
    return () => removeEventListener('keydown', on)
  }, [set])

  if (hash.startsWith('#today')) {
    return (
      <Suspense fallback={null}>
        <Today pl={pl} trip={trip} stats={stats?.days ?? null} legs={legs} />
      </Suspense>
    )
  }

  const panel = (() => {
    switch (ui.panel) {
      case 'options':
        return <Options options={options} />
      case 'day':
        return trip ? <DayCard pl={pl} trip={trip} stats={stats?.days ?? null} legs={legs} /> : null
      case 'candidates':
        return <Candidates pl={pl} />
      case 'discover':
        return <Discover trip={trip} />
      case 'sheet':
        return trip ? <TripSheet pl={pl} trip={trip} stats={stats} /> : null
      case 'settings':
        return <Settings pl={pl} />
      case 'journal':
        return trip ? (
          <Suspense fallback={null}>
            <Journal trip={trip} legs={legs} />
          </Suspense>
        ) : null
      default:
        return null
    }
  })()

  return (
    <div className={`app view-${ui.view} ${ui.panel ? 'has-panel' : ''} panel-${ui.panel ?? 'none'} ${ui.flying ? 'is-flying' : ''}`}>
      {ui.view === '3d' && (
        <Stage>
          <SceneSync pl={pl} trip={trip} legs={legs} stats={stats?.days ?? null} options={options} optionLegs={optionLegs} driven={journal.driven} drivenVersion={journal.version} />
          <Lettering />
          <Gazetteer />
          <Pins pl={pl} trip={trip} stats={stats?.days ?? null} />
        </Stage>
      )}
      {ui.view === '2d' && (
        <Suspense fallback={null}>
          <Map2D trip={trip} legs={legs} />
        </Suspense>
      )}
      {ui.view === 'list' && trip && (
        <main className="listview">
          <h1 className="listview__h">The trip, day by day</h1>
          <DaysList pl={pl} trip={trip} stats={stats} />
        </main>
      )}
      <TopBar trip={trip} totals={stats?.totals ?? null} />
      {panel && (
        <aside className="panel" aria-label="Details">
          <button type="button" className="panel__close" onClick={() => set({ panel: null, cand: null, focusCand: null })} aria-label="Close panel">
            <Icon d={ICONS.close} />
          </button>
          {panel}
        </aside>
      )}
      {ui.view === '3d' && (
        <div className="hud">
          {trip && <TripFlight trip={trip} legs={legs} />}
          <SunDial trip={trip} />
          <div className="seg seg--small ribbonmode" role="radiogroup" aria-label="Colour the route by">
            {(['Route', 'Battery', 'Climb'] as const).map((l, i) => (
              <button key={l} type="button" role="radio" aria-checked={ui.ribbon === i} className={ui.ribbon === i ? 'is-on' : ''} onClick={() => set({ ribbon: i as 0 | 1 | 2 })}>
                {l}
              </button>
            ))}
          </div>
        </div>
      )}
      {trip && <DayStrip trip={trip} />}
      {ui.view === '3d' && <FlightHUD />}
      {!pl && <div className="loading">Loading Europe…</div>}
      {ui.toast && (
        <div className="toast" role="status">
          {ui.toast}
        </div>
      )}
      <p className="credits">
        Imagery: Sentinel-2 cloudless 2020 by EOX (CC BY-NC-SA 4.0, Copernicus data) · Terrain: Mapzen/AWS Terrain Tiles · Night lights: NASA VIIRS · Roads: OSRM/OpenStreetMap
      </p>
    </div>
  )
}
