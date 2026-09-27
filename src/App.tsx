import { MotionConfig } from 'motion/react'
import { lazy, Suspense } from 'react'
import { useTripModel } from './hooks'
import { Masthead } from './sections/Masthead'
import { Compare } from './sections/Compare'
import { Builder } from './sections/Builder'
import { Days } from './sections/Days'
import { Charging } from './sections/Charging'
import { Checklist, Costs, Countries, Excluded, Footer } from './sections/Costs'

const MapSection = lazy(() => import('./sections/MapSection').then((m) => ({ default: m.MapSection })))

export default function App() {
  const model = useTripModel()
  return (
    <MotionConfig reducedMotion="user">
      <a className="skip" href="#compare">Skip to the comparison</a>
      <Masthead model={model} />
      <main>
        <Compare />
        <Builder model={model} />
        <Suspense fallback={<div className="map-fallback" id="map">Loading map…</div>}>
          <MapSection model={model} />
        </Suspense>
        <Days model={model} />
        <Charging model={model} />
        <Costs model={model} />
        <Countries model={model} />
        <Checklist model={model} />
        <Excluded />
      </main>
      <Footer model={model} />
    </MotionConfig>
  )
}
