import type { Planner } from '../engine/planner'
import { setCrossing } from '../engine/trip'
import { useApp } from '../store'
import { useDio } from './Stage'
import { clock } from './common'
import type { Quality } from '../scene/Diorama'

export function Settings({ pl }: { pl: Planner | null }) {
  const plan = useApp((s) => s.plan)
  const setPlan = useApp((s) => s.setPlan)
  const dio = useDio()
  const s = plan.settings
  const put = (patch: Partial<typeof s>) => setPlan((p) => ({ ...p, settings: { ...p.settings, ...patch } }))
  return (
    <section className="panel__body settings" aria-labelledby="set-h">
      <p className="kicker">Settings</p>
      <h2 id="set-h">How you like to travel</h2>
      <label className="field">
        <span>
          Longest comfortable day at the wheel: <b>{s.maxDriveH} h</b>
        </span>
        <input type="range" min={3.5} max={7} step={0.5} value={s.maxDriveH} onChange={(e) => put({ maxDriveH: Number(e.target.value) })} />
        <small>Suggestions and trip ideas try to keep every day under this. Stops, charging and lunch come on top.</small>
      </label>
      <label className="field">
        <span>
          Usually set off at <b>{clock(s.departMin)}</b>
        </span>
        <input type="range" min={7 * 60} max={11 * 60} step={15} value={s.departMin} onChange={(e) => put({ departMin: Number(e.target.value) })} />
      </label>
      <label className="field field--row">
        <input type="checkbox" checked={s.countryRule} onChange={(e) => put({ countryRule: e.target.checked })} />
        <span>Don’t double back into a country we’ve already left (e.g. after Bruges, no more France on the way out). Hidden stops can still be shown.</span>
      </label>
      <label className="field">
        <span>
          Motorway cruising speed: <b>{s.cruiseKmh} km/h</b>
        </span>
        <input type="range" min={100} max={130} step={5} value={s.cruiseKmh} onChange={(e) => put({ cruiseKmh: Number(e.target.value) })} />
        <small>Affects the battery model and charging breaks, not drive times.</small>
      </label>
      <label className="field">
        <span>First day</span>
        <input type="date" value={plan.startDate} min="2027-04-01" max="2027-07-31" onChange={(e) => e.target.value && setPlan((p) => ({ ...p, startDate: e.target.value }))} />
        <small>Your dates stay in this browser and in links you share.</small>
      </label>
      <div className="field">
        <span>Channel crossing</span>
        {(['out', 'ret'] as const).map((dir) => (
          <div key={dir} className="seg seg--small" role="radiogroup" aria-label={dir === 'out' ? 'Outbound crossing' : 'Return crossing'}>
            <span className="seg__cap">{dir === 'out' ? 'Out' : 'Back'}</span>
            {(['tunnel', 'ferry'] as const).map((c) => (
              <button key={c} type="button" role="radio" aria-checked={plan[dir].crossing === c} className={plan[dir].crossing === c ? 'is-on' : ''} onClick={() => pl && setPlan((p) => setCrossing(pl, p, dir, c))}>
                {c === 'tunnel' ? 'Le Shuttle (Folkestone–Calais)' : 'Overnight ferry (Portsmouth–Caen)'}
              </button>
            ))}
          </div>
        ))}
        <small>The overnight ferry counts as one of the nights, so that direction has four road stops.</small>
      </div>
      <div className="field">
        <span>3D quality</span>
        <div className="seg seg--small" role="radiogroup" aria-label="3D quality">
          {(['high', 'medium', 'low'] as Quality[]).map((q) => (
            <button key={q} type="button" role="radio" aria-checked={dio?.quality === q} className={dio?.quality === q ? 'is-on' : ''} onClick={() => { dio?.setQuality(q); setPlan((p) => ({ ...p })) }}>
              {q}
            </button>
          ))}
        </div>
      </div>
      <p className="fine">
        <a href="./classic.html">Classic planner</a> (all tables and sources) ·{' '}
        <button type="button" className="linkbtn" onClick={() => { if (confirm('Start again? This clears your stops (hearts stay).')) setPlan((p) => ({ ...p, out: { ...p.out, stops: [] }, ret: { ...p.ret, stops: [] }, days: {} })) }}>
          Start over
        </button>
      </p>
    </section>
  )
}
