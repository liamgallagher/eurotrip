import { useEffect, useMemo, useRef, useState } from 'react'
import { scaleLinear } from 'd3-scale'
import { area, line } from 'd3-shape'
import type { Sample } from '../lib/legs'
import type { ChargeStop } from '../lib/charging'
import { COUNTRY_NAMES } from '../lib/countries'

export interface ProfileMark {
  km: number
  label: string
}

export function ElevationProfile({
  samples,
  hoverKm,
  onHover,
  color,
  stops = [],
  marks = [],
  height = 150,
  title,
}: {
  samples: Sample[]
  hoverKm: number | null
  onHover: (km: number | null) => void
  color: string
  stops?: ChargeStop[]
  marks?: ProfileMark[]
  height?: number
  title: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(600)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const m = { l: 44, r: 12, t: 16, b: 24 }
  const maxKm = samples.length ? samples[samples.length - 1].km : 1
  const maxE = Math.max(500, ...samples.map((s) => s.ele))
  const x = useMemo(() => scaleLinear().domain([0, maxKm]).range([m.l, w - m.r]), [maxKm, w, m.l, m.r])
  const y = useMemo(() => scaleLinear().domain([0, maxE * 1.08]).nice().range([height - m.b, m.t]), [maxE, height, m.b, m.t])
  const pathA = useMemo(() => area<Sample>().x((s) => x(s.km)).y0(height - m.b).y1((s) => y(s.ele))(samples) ?? '', [samples, x, y, height, m.b])
  const pathL = useMemo(() => line<Sample>().x((s) => x(s.km)).y((s) => y(s.ele))(samples) ?? '', [samples, x, y])
  const hover = hoverKm != null && samples.length ? samples[Math.min(samples.length - 1, Math.max(0, Math.round(hoverKm / 0.5)))] : null
  // samples are 0.5 km apart except when several legs are joined; find nearest by km
  const nearest = (km: number) => {
    let lo = 0, hi = samples.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (samples[mid].km <= km) lo = mid
      else hi = mid
    }
    return Math.abs(samples[lo].km - km) < Math.abs(samples[hi].km - km) ? samples[lo] : samples[hi]
  }
  const hv = hoverKm != null && samples.length ? nearest(hoverKm) : hover
  const xticks = x.ticks(Math.max(2, Math.floor(w / 90)))
  const yticks = y.ticks(3)

  const handle = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    const km = x.invert(clientX - r.left)
    onHover(Math.max(0, Math.min(maxKm, km)))
  }

  return (
    <div
      className="profile"
      ref={ref}
      tabIndex={0}
      role="img"
      aria-label={`${title}: elevation profile, highest point ${Math.round(maxE)} m over ${Math.round(maxKm)} km. Use left and right arrow keys to explore.`}
      onPointerMove={(e) => handle(e.clientX)}
      onPointerDown={(e) => handle(e.clientX)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && onHover(null)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault()
          const step = e.shiftKey ? 25 : 5
          onHover(Math.max(0, Math.min(maxKm, (hoverKm ?? 0) + (e.key === 'ArrowRight' ? step : -step))))
        } else if (e.key === 'Escape') onHover(null)
      }}
    >
      <svg width={w} height={height} style={{ display: 'block' }}>
        <defs>
          <linearGradient id={`pg-${color.slice(1)}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0.04" />
          </linearGradient>
        </defs>
        {yticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={m.l - 6} y={y(t)} className="axis" textAnchor="end" dominantBaseline="middle">
              {t >= 1000 ? `${(t / 1000).toFixed(t % 1000 ? 1 : 0)}k` : t} m
            </text>
          </g>
        ))}
        {xticks.map((t) => (
          <text key={t} x={x(t)} y={height - 6} className="axis" textAnchor="middle">
            {t} km
          </text>
        ))}
        <path d={pathA} fill={`url(#pg-${color.slice(1)})`} />
        <path d={pathL} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {marks.map((mk, i) => (
          <g key={i} transform={`translate(${x(mk.km)},${m.t - 4})`}>
            <circle r={4} className="mark-dot" />
            <title>{mk.label}</title>
          </g>
        ))}
        {stops.map((s, i) => (
          <g key={i} transform={`translate(${x(s.charger.km)},${y(nearest(s.charger.km).ele)})`}>
            <circle r={6} className="sc-dot" />
            <text className="sc-bolt" textAnchor="middle" dominantBaseline="central">⚡</text>
            <title>{`Supercharger ${s.charger.n}`}</title>
          </g>
        ))}
        {hv && (
          <g>
            <line x1={x(hv.km)} x2={x(hv.km)} y1={m.t} y2={height - m.b} className="crosshair" />
            <circle cx={x(hv.km)} cy={y(hv.ele)} r={5} fill={color} stroke="#fff" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hv && (
        <div className="profile__tip" style={{ left: Math.min(w - 150, Math.max(0, x(hv.km) + 10)) }}>
          <b>{Math.round(hv.ele).toLocaleString()} m</b> · km {Math.round(hv.km)}
          <br />
          <span className="muted">
            ~{Math.round(hv.spd)} km/h · {COUNTRY_NAMES[hv.cc] ?? hv.cc}
          </span>
        </div>
      )}
    </div>
  )
}
