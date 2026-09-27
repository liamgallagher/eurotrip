import { COUNTRY_NAMES } from './countries'
import type { Leg, Waypoint } from './legs'
import type { Plan, PlanDay } from './plan'
import { ALL_HIGHLIGHTS } from './scoring'
import { PLACES } from '../data/places'

// Google Maps URLs (documented "Maps URLs" API): https://developers.google.com/maps/documentation/urls/get-started
// Desktop browsers accept up to 9 waypoints; some mobile clients show fewer, so we split long days.

export const GMAPS_MAX_WAYPOINTS = 9

export interface GLink {
  label: string
  url: string
  count: number
}

function placeString(w: Waypoint): string {
  const p = Object.values(PLACES).find((x) => x.name === w.name && Math.abs(x.lat - w.lat) < 1e-4 && Math.abs(x.lon - w.lon) < 1e-4)
  if (p && !/\(|port|terminal/i.test(p.name) && p.id !== 'venice') return `${p.name}, ${COUNTRY_NAMES[p.country] ?? ''}`.replace(/ \/ .*?,/, ',')
  return `${w.lat.toFixed(5)},${w.lon.toFixed(5)}`
}

export function gmapsUrl(points: Waypoint[], opts: { home?: string } = {}): string {
  const str = (w: Waypoint) => (w.name === 'Southampton' && opts.home ? opts.home : placeString(w))
  const origin = str(points[0])
  const dest = str(points[points.length - 1])
  const mids = points.slice(1, -1).map(str)
  const q = new URLSearchParams({ api: '1', origin, destination: dest, travelmode: 'driving' })
  if (mids.length) q.set('waypoints', mids.join('|'))
  return `https://www.google.com/maps/dir/?${q.toString().replace(/%2C/g, ',').replace(/%7C/g, '|')}`
}

/** Split a waypoint chain into consecutive chunks that each respect the waypoint limit. */
export function splitChain(points: Waypoint[], max = GMAPS_MAX_WAYPOINTS): Waypoint[][] {
  const out: Waypoint[][] = []
  let i = 0
  while (i < points.length - 1) {
    const end = Math.min(points.length - 1, i + max + 1)
    out.push(points.slice(i, end + 1))
    i = end
  }
  return out
}

export function dayLinks(day: PlanDay, opts: { home?: string; max?: number } = {}): GLink[] {
  const links: GLink[] = []
  for (const s of day.segments) {
    if (s.kind !== 'drive') continue
    const parts = splitChain(s.waypoints, opts.max)
    parts.forEach((p, i) => {
      const label = `${p[0].name} → ${p[p.length - 1].name}${parts.length > 1 ? ` (part ${i + 1}/${parts.length})` : ''}`
      links.push({ label, url: gmapsUrl(p, opts), count: p.length - 2 })
    })
  }
  return links
}

/** Overview link per direction using overnight stops only (Google picks its own roads between them). */
export function overviewLinks(plan: Plan, opts: { home?: string } = {}): GLink[] {
  const mk = (dir: 'out' | 'ret') => {
    const days = plan.days.filter((d) => d.dir === dir && d.kind !== 'rest')
    const pts: Waypoint[] = []
    for (const d of days) {
      for (const s of d.segments) if (s.kind === 'drive') {
        if (!pts.length) pts.push(s.waypoints[0])
        pts.push(s.waypoints[s.waypoints.length - 1])
      }
    }
    const dedup = pts.filter((p, i) => i === 0 || p.name !== pts[i - 1].name)
    return splitChain(dedup).map((p, i, a) => ({ label: `${dir === 'out' ? 'Outbound' : 'Return'} overview${a.length > 1 ? ` ${i + 1}/${a.length}` : ''}`, url: gmapsUrl(p, opts), count: p.length - 2 }))
  }
  return [...mk('out'), ...mk('ret')]
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function toGpx(plan: Plan, legs: Record<string, Leg | undefined>): string {
  const wpts: string[] = []
  const seen = new Set<string>()
  for (const d of plan.days) {
    if (typeof d.sleep === 'object' && !seen.has(d.sleep.id)) {
      seen.add(d.sleep.id)
      wpts.push(`<wpt lat="${d.sleep.lat}" lon="${d.sleep.lon}"><name>${esc(`Night: ${d.sleep.name}`)}</name><sym>Lodging</sym></wpt>`)
    }
    for (const h of d.highlights) {
      const x = ALL_HIGHLIGHTS[h.id]
      if (x && !seen.has(x.id)) {
        seen.add(x.id)
        wpts.push(`<wpt lat="${x.lat}" lon="${x.lon}"><name>${esc(x.name)}</name><desc>${esc(x.desc)}</desc><sym>Scenic Area</sym></wpt>`)
      }
    }
  }
  const rtes: string[] = []
  const trks: string[] = []
  for (const d of plan.days) {
    d.segments.forEach((s, si) => {
      if (s.kind !== 'drive') return
      const name = esc(`Day ${d.n} ${d.date}: ${s.waypoints[0].name} → ${s.waypoints[s.waypoints.length - 1].name}${si ? ` (${si + 1})` : ''}`)
      rtes.push(`<rte><name>${name}</name>${s.waypoints.map((w) => `<rtept lat="${w.lat}" lon="${w.lon}"><name>${esc(w.name)}</name></rtept>`).join('')}</rte>`)
      const leg = legs[s.key]
      if (leg) {
        trks.push(`<trk><name>${name}</name><trkseg>${leg.coords.map(([lon, lat]) => `<trkpt lat="${lat.toFixed(5)}" lon="${lon.toFixed(5)}"/>`).join('')}</trkseg></trk>`)
      }
    })
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Southampton–Ljubljana planner" xmlns="http://www.topografix.com/GPX/1/1">\n<metadata><name>Southampton ⇄ Ljubljana ${plan.days[0]?.date ?? ''}</name></metadata>\n${wpts.join('\n')}\n${rtes.join('\n')}\n${trks.join('\n')}\n</gpx>\n`
}

export function toKml(plan: Plan, legs: Record<string, Leg | undefined>): string {
  const marks: string[] = []
  for (const d of plan.days) {
    d.segments.forEach((s) => {
      if (s.kind !== 'drive') return
      const leg = legs[s.key]
      const coords = leg ? leg.coords : s.waypoints.map((w) => [w.lon, w.lat])
      marks.push(`<Placemark><name>${esc(`Day ${d.n}: ${s.waypoints[0].name} → ${s.waypoints[s.waypoints.length - 1].name}`)}</name><styleUrl>#${d.dir === 'ret' ? 'ret' : 'out'}</styleUrl><LineString><tessellate>1</tessellate><coordinates>${coords.map(([x, y]) => `${x.toFixed(5)},${y.toFixed(5)}`).join(' ')}</coordinates></LineString></Placemark>`)
    })
    if (typeof d.sleep === 'object') marks.push(`<Placemark><name>${esc(`Night ${d.date}: ${d.sleep.name}`)}</name><styleUrl>#night</styleUrl><Point><coordinates>${d.sleep.lon},${d.sleep.lat}</coordinates></Point></Placemark>`)
    for (const h of d.highlights) {
      const x = ALL_HIGHLIGHTS[h.id]
      if (x) marks.push(`<Placemark><name>${esc(x.name)}</name><description>${esc(x.desc)}</description><styleUrl>#hl</styleUrl><Point><coordinates>${x.lon},${x.lat}</coordinates></Point></Placemark>`)
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Southampton ⇄ Ljubljana</name>
<Style id="out"><LineStyle><color>ff7a6a0f</color><width>5</width></LineStyle></Style>
<Style id="ret"><LineStyle><color>ff2b56c2</color><width>5</width></LineStyle></Style>
<Style id="night"><IconStyle><scale>1.1</scale></IconStyle></Style>
<Style id="hl"><IconStyle><scale>0.8</scale></IconStyle></Style>
${marks.join('\n')}
</Document></kml>\n`
}

export function download(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(a.href)
    a.remove()
  }, 500)
}
