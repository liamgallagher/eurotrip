import { useMemo } from 'react'
import type { Leg } from '../../lib/legs'
import type { Trip } from '../engine/trip'
import { tripPath } from '../tripPath'
import { startFlight, useFlight } from '../flight'
import { useApp } from '../store'
import { useDio } from './Stage'
import { Icon, ICONS } from './common'

// "Fly the whole trip": the camera chases the route from Southampton to Slovenia and home again.

export function TripFlight({ trip, legs }: { trip: Trip; legs: Record<string, Leg> }) {
  const dio = useDio()
  const active = useFlight((s) => s.active)
  const settings = useApp((s) => s.plan.settings)
  const planned = useMemo(() => tripPath(trip, legs, settings), [trip, legs, settings])
  if (!dio || active) return null
  return (
    <button
      type="button"
      className="btn btn--primary tripfly__go"
      onClick={() => {
        useApp.getState().ui({ day: null })
        startFlight(dio, planned, { kind: 'trip', seconds: 200, dist: 45 })
      }}
      disabled={planned.path.length < 2}
      title={planned.missing ? 'Some roads are still loading — those days fly in a straight line for now' : 'Fly the whole route, day by day'}
    >
      <Icon d={ICONS.play} size={15} /> Fly the whole trip
    </button>
  )
}
