import type { Leg } from '../lib/legs'
import type { Diorama, PathPoint } from './scene/Diorama'
import { localDate } from './scene/sun'
import type { Trip } from './engine/trip'
import type { Note } from './journal'
import { photoUrl } from './journal'
import { fmtDateLong } from '../ui/format'
import { fastDist } from '../lib/geo'

// A fly-over film of the whole trip, recorded straight from the 3D canvas (MediaRecorder), with day
// captions and your own photos popping up where you took them.

export interface FilmOpts {
  seconds: number
  notes: Note[]
  onProgress: (f: number) => void
  signal: { cancelled: boolean }
}

export function filmSupported() {
  return typeof MediaRecorder !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype
}

export async function makeFilm(dio: Diorama, trip: Trip, legs: Record<string, Leg>, o: FilmOpts): Promise<Blob | null> {
  // one continuous path through every driving day
  const path: PathPoint[] = []
  const marks: { km: number; title: string; date: string; dep: number; arr: number; lon: number; lat: number }[] = []
  let off = 0
  for (const d of trip.days) {
    if (d.kind !== 'drive') continue
    const startKm = off
    for (const s of d.segments) {
      if (s.kind !== 'drive') continue
      const leg = legs[s.key!]
      if (!leg) continue
      for (let i = 0; i < leg.samples.length; i += 2) {
        const p = leg.samples[i]
        path.push({ lon: p.lon, lat: p.lat, ele: p.ele, km: off + p.km })
      }
      off += leg.distance / 1000
    }
    const last = path[path.length - 1]
    if (last) marks.push({ km: startKm, title: d.title, date: d.date, dep: 9 * 60 + 30, arr: 9 * 60 + 30 + (d.e?.min ?? 300) + 90, lon: last.lon, lat: last.lat })
  }
  if (path.length < 2) return null

  const src = dio.canvas
  const W = 1280, H = Math.round((1280 * src.height) / src.width / 2) * 2
  const comp = document.createElement('canvas')
  comp.width = W
  comp.height = H
  const ctx = comp.getContext('2d')!
  const photos = await Promise.all(o.notes.filter((n) => n.photo).map(async (n) => {
    const url = await photoUrl(n.photo!)
    if (!url) return null
    const img = new Image()
    img.src = url
    await img.decode().catch(() => undefined)
    return { n, img }
  }))
  const shown = photos.filter(Boolean) as { n: Note; img: HTMLImageElement }[]

  let caption = ''
  let sub = ''
  let pop: { img: HTMLImageElement; text: string; until: number } | null = null
  const seen = new Set<string>()
  const off2 = dio.addAfterRender(() => {
    ctx.drawImage(src, 0, 0, W, H)
    const g = ctx.createLinearGradient(0, H - 150, 0, H)
    g.addColorStop(0, 'rgba(5,8,18,0)')
    g.addColorStop(1, 'rgba(5,8,18,0.75)')
    ctx.fillStyle = g
    ctx.fillRect(0, H - 150, W, 150)
    ctx.fillStyle = '#f6f1e7'
    ctx.font = '600 34px Fraunces Variable, Georgia, serif'
    ctx.fillText(caption, 48, H - 62)
    ctx.font = '500 18px Inter Variable, system-ui, sans-serif'
    ctx.fillStyle = 'rgba(246,241,231,0.8)'
    ctx.fillText(sub, 48, H - 32)
    if (pop && performance.now() < pop.until) {
      const w = 300, h = Math.round((w * pop.img.naturalHeight) / Math.max(1, pop.img.naturalWidth))
      const x = W - w - 60, y = 60
      ctx.save()
      ctx.translate(x + w / 2, y + h / 2)
      ctx.rotate(-0.04)
      ctx.fillStyle = '#fbf7ef'
      ctx.shadowColor = 'rgba(0,0,0,0.45)'
      ctx.shadowBlur = 30
      ctx.fillRect(-w / 2 - 12, -h / 2 - 12, w + 24, h + 64)
      ctx.shadowBlur = 0
      ctx.drawImage(pop.img, -w / 2, -h / 2, w, h)
      ctx.fillStyle = '#2b2620'
      ctx.font = '500 17px Inter Variable, system-ui, sans-serif'
      ctx.fillText(pop.text.slice(0, 34), -w / 2, h / 2 + 34)
      ctx.restore()
    }
  })

  const stream = comp.captureStream(30)
  const type = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 })
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const done = new Promise<void>((r) => (rec.onstop = () => r()))
  rec.start(500)
  const total = path[path.length - 1].km
  await dio.flyAlong(path, {
    kmPerSec: total / o.seconds,
    dist: 70,
    onKm: (km) => {
      if (o.signal.cancelled) return false
      o.onProgress(km / total)
      let m = marks[0]
      for (const x of marks) if (x.km <= km) m = x
      const next = marks[marks.indexOf(m) + 1]?.km ?? total
      const f = (km - m.km) / Math.max(1, next - m.km)
      caption = m.title
      sub = fmtDateLong(m.date)
      dio.setSun(localDate(m.date, m.dep + (m.arr - m.dep) * f), { lon: m.lon, lat: m.lat })
      const here = path.find((p) => p.km >= km) ?? path[path.length - 1]
      for (const s of shown) {
        if (seen.has(s.n.id)) continue
        if (fastDist([here.lon, here.lat], [s.n.lon, s.n.lat]) < 15000) {
          seen.add(s.n.id)
          pop = { img: s.img, text: s.n.text, until: performance.now() + 3500 }
        }
      }
    },
  })
  rec.stop()
  await done
  off2()
  return o.signal.cancelled ? null : new Blob(chunks, { type: type.split(';')[0] || 'video/webm' })
}
