import { useEffect, useRef, useState } from 'react'
import { scaleLinear } from 'd3-scale'
import { line } from 'd3-shape'
import { useTrip } from '../store'
import type { TripModel } from '../hooks'
import type { DayStats } from '../lib/tripStats'
import { CAR } from '../lib/energy'
import { SectionHead, SourceLinks, Estimate } from '../ui/bits'
import { fmtAgo, fmtDate, fmtH, fmtKm } from '../ui/format'
import { OUT_COLOR, RET_COLOR } from '../ui/colors'

export function SocSpark({ d, height = 64 }: { d: DayStats; height?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(320)
  const [hover, setHover] = useState<[number, number] | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const c = d.charging
  if (!c || !c.soc.length) return null
  const maxKm = c.soc[c.soc.length - 1][0] || 1
  const m = { l: 30, r: 8, t: 8, b: 16 }
  const x = scaleLinear().domain([0, maxKm]).range([m.l, w - m.r])
  const y = scaleLinear().domain([0, 100]).range([height - m.b, m.t])
  const path = line<[number, number]>().x((p) => x(p[0])).y((p) => y(p[1]))(c.soc) ?? ''
  const color = d.day.dir === 'ret' ? RET_COLOR : OUT_COLOR
  return (
    <div
      className="soc"
      ref={ref}
      role="img"
      aria-label={`State of charge: leaves at 100%, arrives at ${Math.round(c.arriveSoc)}%, ${c.stops.length} Supercharger stops`}
      onPointerMove={(e) => {
        const r = ref.current!.getBoundingClientRect()
        const km = x.invert(e.clientX - r.left)
        const p = c.soc.reduce((a, b) => (Math.abs(b[0] - km) < Math.abs(a[0] - km) ? b : a))
        setHover(p)
      }}
      onPointerLeave={() => setHover(null)}
    >
      <svg width={w} height={height}>
        {[20, 50, 80].map((t) => (
          <g key={t}>
            <line x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={m.l - 4} y={y(t)} className="axis" textAnchor="end" dominantBaseline="middle">{t}%</text>
          </g>
        ))}
        <rect x={m.l} y={y(15)} width={w - m.l - m.r} height={y(0) - y(15)} className="soc__reserve" />
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {c.stops.map((s, i) => (
          <g key={i} transform={`translate(${x(s.charger.km)},${y(s.departSoc)})`}>
            <circle r={4} className="sc-dot" />
          </g>
        ))}
        {hover && <circle cx={x(hover[0])} cy={y(hover[1])} r={4} fill={color} stroke="#fff" strokeWidth={1.5} />}
        <text x={w - m.r} y={height - 3} className="axis" textAnchor="end">{Math.round(maxKm)} km</text>
      </svg>
      {hover && (
        <span className="soc__tip" style={{ left: Math.min(w - 110, x(hover[0]) + 8) }}>
          {Math.round(hover[1])}% · km {Math.round(hover[0])}
        </span>
      )}
      <span className="soc__cap">State of charge <Estimate>modelled</Estimate></span>
    </div>
  )
}

export function Charging({ model }: { model: TripModel }) {
  const { days, totals, chargers, state } = model
  const a = useTrip.getState()
  const drive = days.filter((d) => d.samples.length)
  const gaps = drive.flatMap((d) => (d.charging?.gaps ?? []).map((g) => ({ d, g })))
  return (
    <section className="charging" id="charging" aria-labelledby="charging-title">
      <div className="wrap">
        <SectionHead kicker="Electric logistics" title="Charging plan" id="charging-title">
          <p>
            Every day starts at 100% (LFP battery, hotel destination charging). Energy use is modelled per 500 m from speed, gradient, altitude and May temperatures, including regen on descents. Stops are suggested at real Superchargers within 4 km of the route.
          </p>
        </SectionHead>

        <div className="charging__controls">
          <label className="slider slider--inline">
            <span className="slider__top"><span>Cruise speed cap</span><output>{state.cruiseKmh} km/h</output></span>
            <input type="range" min={100} max={140} step={5} value={state.cruiseKmh} onChange={(e) => a.set({ cruiseKmh: Number(e.target.value) })} />
          </label>
          <label className="slider slider--inline">
            <span className="slider__top"><span>Arrive at hotel with at least</span><output>{state.minArrivalPct}%</output></span>
            <input type="range" min={5} max={40} step={5} value={state.minArrivalPct} onChange={(e) => a.set({ minArrivalPct: Number(e.target.value) })} />
          </label>
          <div className="stat">
            <span className="stat__label">Energy, whole trip</span>
            <span className="stat__value">{Math.round(totals.kwh).toLocaleString()} kWh</span>
            <span className="stat__sub">{totals.km ? ((totals.kwh / totals.km) * 100).toFixed(1) : '–'} kWh/100 km <Estimate /></span>
          </div>
          <div className="stat">
            <span className="stat__label">Supercharger stops</span>
            <span className="stat__value">{totals.chargeStops}</span>
            <span className="stat__sub">{fmtH(totals.chargeMin / 60)} total</span>
          </div>
        </div>

        {gaps.length > 0 && (
          <div className="gaps">
            <h3>Long stretches without a Supercharger near the route</h3>
            <ul>
              {gaps.map(({ d, g }, i) => (
                <li key={i}>
                  <b>Day {d.day.n}</b> ({d.day.from.name} → {d.day.to.name}): {Math.round(g.km)} km, km {Math.round(g.fromKm)}–{Math.round(g.toKm)}
                  {g.maxEle > 1500 ? ` — mountain section up to ${Math.round(g.maxEle).toLocaleString()} m` : ''}. Leave with a full battery.
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="cdays">
          {drive.map((d) => (
            <article key={d.day.n} className={`cday cday--${d.day.dir}`}>
              <header>
                <strong>Day {d.day.n} · {fmtDate(d.day.date)}</strong>
                <span>{d.day.from.name} → {d.day.to.name} · {fmtKm(d.km)}</span>
              </header>
              <SocSpark d={d} />
              {d.charging && (
                <>
                  <p className="cday__line">
                    {d.charging.kwh.toFixed(1)} kWh used ({(d.charging.perKm * 100).toFixed(1)} kWh/100 km), {d.charging.regenKWh.toFixed(1)} kWh regenerated · arrive with ~{Math.round(d.charging.arriveSoc)}%
                  </p>
                  {d.charging.stops.length === 0 ? (
                    <p className="cday__none">No charging stop needed.</p>
                  ) : (
                    <ol className="cstops">
                      {d.charging.stops.map((s, i) => (
                        <li key={i}>
                          <span className="cstops__name">⚡ {s.charger.n}</span>
                          <span className="cstops__meta">
                            km {Math.round(s.charger.km)} · {s.charger.st ?? '?'} stalls · {s.charger.kw ?? '?'} kW · {Math.round(s.arriveSoc)}% → {Math.round(s.departSoc)}% · ~{Math.round(s.minutes)} min
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </>
              )}
            </article>
          ))}
        </div>

        <details className="method">
          <summary>How the energy model works</summary>
          <p>
            {CAR.name}: {CAR.usableKWh} kWh usable, {CAR.massKg} kg loaded, CdA {CAR.cdA.toFixed(2)} m², rolling resistance {CAR.crr}, drivetrain efficiency {Math.round(CAR.driveEff * 100)}%, regen {Math.round(CAR.regenEff * 100)}% of descent energy (capped at {CAR.maxRegenKW} kW). On fast roads (OSRM speed ≥ 85 km/h) you are assumed to cruise at your chosen cap; slower roads use OSRM's segment speeds. Air density falls with altitude; heating load rises below 14 °C using mid-May climate normals. Calibrated to ~16 kWh/100 km at 110 km/h and ~20 at 130 km/h. Charging time uses an approximate LFP charge curve (≈170 kW peak, tapering above 60%).
          </p>
          <SourceLinks sources={CAR.sources} />
          <p className="fine">Supercharger locations and stall counts: <a href="https://supercharge.info" target="_blank" rel="noreferrer">supercharge.info</a> snapshot of {fmtAgo(chargers?.fetchedAt ?? '')} ({chargers?.sites.length ?? 0} sites in the corridor). Sites under construction are not used for planning.</p>
        </details>
      </div>
    </section>
  )
}
