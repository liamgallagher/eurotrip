import { useEffect, useMemo, useRef, useState } from 'react'
import { ALL_HIGHLIGHTS } from '../../lib/scoring'
import { COUNTRY_NAMES, FLAGS } from '../../lib/countries'
import { fmtDateLong } from '../../ui/format'
import { BAKE_H, BAKE_W } from '../scene/slab'
import { slabU, slabV, worldX, worldZ } from '../scene/proj'
import { hereAt, markAt, type TripPath } from '../tripPath'
import { jumpDay, jumpTo, setFlightSpeed, stopFlight, useFlight } from '../flight'
import { clock, Icon, ICONS, OUT, RET, placeName } from './common'
import { COUNTRY_LABELS } from './Lettering'

// What you see while flying: where you are (country, road, height), what's next, a banner at each border
// and a bird's-eye inset map of the whole route with you on it.

const SPEEDS = [0.5, 1, 2, 4]
const BASE = import.meta.env.BASE_URL

const px = (lon: number, lat: number): [number, number] => [slabU(worldX(lon)) * BAKE_W, slabV(worldZ(lat)) * BAKE_H]

export function FlightHUD() {
  const { active, data, km, min, speed, kind } = useFlight()
  const [banner, setBanner] = useState<string | null>(null)
  const lastCountry = useRef<string | null>(null)
  const here = useMemo(() => (data ? hereAt(data, km) : null), [data, km])

  useEffect(() => {
    if (!active) lastCountry.current = null
  }, [active])
  useEffect(() => {
    const cc = here?.country ?? null
    if (!cc) return
    if (lastCountry.current && cc !== lastCountry.current) {
      setBanner(cc)
      const id = setTimeout(() => setBanner(null), 3200)
      lastCountry.current = cc
      return () => clearTimeout(id)
    }
    lastCountry.current = cc
  }, [here?.country])

  if (!active || !data || !here) return null
  const m = markAt(data.marks, km)
  const firstRet = data.marks.find((x) => x.dir === 'ret')
  const slovenia = kind === 'trip' && m === firstRet && km - m.km < 25
  const left = Math.max(0, m.endKm - km)
  const upcoming = data.pois.filter((p) => p.km >= km - 2 && p.km <= m.endKm)
  const next = upcoming[0]
  const nextText = next ? (next.km - km < 3 ? `Passing ${ALL_HIGHLIGHTS[next.id].name}` : `Next: ${ALL_HIGHLIGHTS[next.id].name} in ${Math.round(next.km - km)} km`) : null
  const color = m.dir === 'out' ? OUT : RET

  return (
    <>
    <div className="tripfly" role="region" aria-label="Flying the route" aria-live="polite">
      <div className="tripfly__cap" style={{ ['--c' as string]: color }}>
        <p className="tripfly__day">
          Day {m.n} · {fmtDateLong(m.date)} · {clock(min)}
        </p>
        <p className="tripfly__t">{slovenia ? 'After four nights in Slovenia, heading home' : `${placeName(m.from)} → ${placeName(m.to)}`}</p>
        <p className="tripfly__where">
          {here.country && (
            <span>
              {FLAGS[here.country]} {COUNTRY_NAMES[here.country]}
            </span>
          )}
          {here.road && <span>{here.road}</span>}
          <span>▲ {Math.round(here.ele).toLocaleString('en-GB')} m</span>
          <span>{Math.round(left)} km to {placeName(m.to).split(' ')[0]}</span>
        </p>
        {nextText && <p className="tripfly__next">{nextText}</p>}
        <div className="tripfly__bar" aria-hidden="true">
          <span style={{ width: `${(100 * (km - data.path[0].km)) / (data.path[data.path.length - 1].km - data.path[0].km)}%` }} />
        </div>
      </div>
      <div className="tripfly__ctl">
        {kind === 'trip' && (
          <button type="button" className="iconbtn" onClick={() => jumpDay(-1)} aria-label="Previous day">
            <Icon d={ICONS.chevL} />
          </button>
        )}
        <span className="seg seg--small" role="radiogroup" aria-label="Speed">
          {SPEEDS.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={speed === s} className={speed === s ? 'is-on' : ''} onClick={() => setFlightSpeed(s)}>
              {s}×
            </button>
          ))}
        </span>
        {kind === 'trip' && (
          <button type="button" className="iconbtn" onClick={() => jumpDay(1)} aria-label="Next day">
            <Icon d={ICONS.chevR} />
          </button>
        )}
        <button type="button" className="btn btn--small" onClick={stopFlight}>
          <Icon d={ICONS.pause} size={14} /> Stop
        </button>
      </div>
      <p className="tripfly__hint">Scroll or pinch to move closer or further back · tap the little map to jump</p>
    </div>
      {banner && (
        <div className="border-banner" key={banner}>
          <span className="border-banner__flag">{FLAGS[banner]}</span>
          <span>
            <small>Entering</small>
            {COUNTRY_NAMES[banner]}
          </span>
        </div>
      )}
      <MiniMap data={data} km={km} here={here} color={color} kind={kind} />
    </>
  )
}

function MiniMap({ data, km, here, color, kind }: { data: TripPath; km: number; here: { lon: number; lat: number; heading: number }; color: string; kind: 'trip' | 'day' }) {
  const W = 260, H = 180
  // thin the path for drawing
  const pts = useMemo(() => {
    const every = Math.max(1, Math.floor(data.path.length / 900))
    return data.path.filter((_, i) => i % every === 0 || i === data.path.length - 1).map((p) => ({ km: p.km, xy: px(p.lon, p.lat) }))
  }, [data])
  // frame: the whole route (with a margin), at least ~600 km across so there's always context
  const box = useMemo(() => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const p of pts) {
      x0 = Math.min(x0, p.xy[0])
      x1 = Math.max(x1, p.xy[0])
      y0 = Math.min(y0, p.xy[1])
      y1 = Math.max(y1, p.xy[1])
    }
    const minSpan = kind === 'day' ? 300 : 0 // px of the 2,560 px slab image (~1 km per px)
    let w = Math.max(x1 - x0, minSpan) * 1.35, h = Math.max(y1 - y0, minSpan * 0.7) * 1.35
    if (w / h > W / H) h = (w * H) / W
    else w = (h * W) / H
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
    return { x: cx - w / 2, y: cy - h / 2, w, h }
  }, [pts, kind])
  const k = box.w / W // svg units per screen px
  const idx = pts.findIndex((p) => p.km >= km)
  const done = pts.slice(0, idx < 0 ? pts.length : idx + 1)
  const m = markAt(data.marks, km)
  const today = pts.filter((p) => p.km >= m.km && p.km <= m.endKm)
  const [hx, hy] = px(here.lon, here.lat)
  const line = (a: { xy: [number, number] }[]) => a.map((p) => p.xy.join(',')).join(' ')
  const stops = data.marks.map((x) => px(x.lon, x.lat))
  const labels = COUNTRY_LABELS.filter(([, , , major]) => major || box.w < 900).map(([name, lat, lon]) => ({ name, xy: px(lon, lat) })).filter((l) => l.xy[0] > box.x && l.xy[0] < box.x + box.w && l.xy[1] > box.y && l.xy[1] < box.y + box.h)

  const click = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = box.x + ((e.clientX - r.left) / r.width) * box.w
    const y = box.y + ((e.clientY - r.top) / r.height) * box.h
    let best = Infinity, bk = km
    for (const p of pts) {
      const d = (p.xy[0] - x) ** 2 + (p.xy[1] - y) ** 2
      if (d < best) {
        best = d
        bk = p.km
      }
    }
    jumpTo(bk)
  }

  return (
    <figure className="minimap" aria-label="Where you are on the route">
      <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} width={W} height={H} onClick={click} role="img">
        <image href={`${BASE}data/overview.jpg`} x={0} y={0} width={BAKE_W} height={BAKE_H} preserveAspectRatio="none" className="minimap__img" />
        {labels.map((l) => (
          <text key={l.name} x={l.xy[0]} y={l.xy[1]} fontSize={8 * k} className="minimap__label" textAnchor="middle">
            {l.name.toUpperCase()}
          </text>
        ))}
        <polyline points={line(pts)} className="minimap__route" strokeWidth={2 * k} />
        <polyline points={line(today)} stroke={color} strokeWidth={3.2 * k} className="minimap__today" />
        <polyline points={line(done)} className="minimap__done" strokeWidth={2.2 * k} />
        {stops.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={2.6 * k} className="minimap__stop" strokeWidth={1 * k} />
        ))}
        <g transform={`translate(${hx} ${hy}) rotate(${here.heading})`}>
          <circle r={9 * k} className="minimap__halo" />
          <path d={`M0 ${-7 * k} L${4.5 * k} ${5 * k} L0 ${2.5 * k} L${-4.5 * k} ${5 * k} Z`} className="minimap__me" />
        </g>
      </svg>
      <figcaption>N ↑</figcaption>
    </figure>
  )
}
