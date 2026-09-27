// Bakes three slab-wide rasters for the diorama at z7 (~1 km/px):
//   heightfield.png  — elevation (Terrarium DEM, AWS open data), 16-bit in R/G
//   night.png        — VIIRS night lights (NASA GIBS), grey
//   overview.jpg     — Sentinel-2 cloudless 2020 (EOX), for the first frame before detail tiles stream in
// Usage: npm run data:terrain
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { PNG } from 'pngjs'
import jpeg from 'jpeg-js'
import { BAKE, BAKE_H, BAKE_TILE, BAKE_W, BAKE_Z, DEM_URL, HEIGHT_MAX, IMAGERY_URL, NIGHT_URL, tileUrl } from '../src/app/scene/slab'

const CACHE = 'scripts/.cache/terrain'
mkdirSync(CACHE, { recursive: true })

async function get(url: string): Promise<Buffer> {
  const file = `${CACHE}/${createHash('md5').update(url).digest('hex')}`
  if (existsSync(file)) return readFileSync(file)
  for (let i = 0; i < 5; i++) {
    const r = await fetch(url)
    if (r.ok) {
      const b = Buffer.from(await r.arrayBuffer())
      writeFileSync(file, b)
      return b
    }
    await new Promise((res) => setTimeout(res, 1500 * 2 ** i))
  }
  throw new Error(`fetch failed ${url}`)
}

function decode(buf: Buffer): { data: Uint8Array; w: number; h: number } {
  if (buf[0] === 0x89) {
    const p = PNG.sync.read(buf)
    return { data: p.data, w: p.width, h: p.height }
  }
  const j = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true })
  return { data: j.data, w: j.width, h: j.height }
}

async function mosaic(tpl: string, onPixel: (out: Uint8Array, o: number, src: Uint8Array, s: number) => void, channels: number) {
  const out = new Uint8Array(BAKE_W * BAKE_H * channels)
  const jobs: Promise<void>[] = []
  for (let r = 0; r < BAKE.rows; r++) for (let c = 0; c < BAKE.cols; c++) {
    jobs.push((async () => {
      const t = decode(await get(tileUrl(tpl, BAKE_Z, BAKE.x0 + c, BAKE.y0 + r)))
      for (let y = 0; y < BAKE_TILE; y++) for (let x = 0; x < BAKE_TILE; x++) {
        const s = (y * t.w + x) * 4
        const o = ((r * BAKE_TILE + y) * BAKE_W + c * BAKE_TILE + x) * channels
        onPixel(out, o, t.data, s)
      }
    })())
    if (jobs.length >= 8) await Promise.all(jobs.splice(0))
  }
  await Promise.all(jobs)
  return out
}

// Heightfield: 8-bit grey with a square-root curve (fine steps in the lowlands, ~30 m near 4,000 m).
// Sea and anything below sea level store 0. Detail tiles carry the precise heights; this is for shadows,
// the slab's walls and the first frame.
const hf = await mosaic(DEM_URL, (out, o, s, i) => {
  const m = s[i] * 256 + s[i + 1] + s[i + 2] / 256 - 32768
  const v = Math.round(Math.sqrt(Math.max(0, Math.min(HEIGHT_MAX, m)) / HEIGHT_MAX) * 255)
  out[o] = out[o + 1] = out[o + 2] = v
  out[o + 3] = 255
}, 4)
const png = new PNG({ width: BAKE_W, height: BAKE_H, colorType: 0 })
png.data = Buffer.from(hf)
writeFileSync('public/data/heightfield.png', PNG.sync.write(png, { colorType: 0, inputColorType: 6 }))
console.log('heightfield.png', BAKE_W, BAKE_H)

// Night lights (alpha-weighted grey)
const nl = await mosaic(NIGHT_URL, (out, o, s, i) => {
  const v = Math.round(((s[i] + s[i + 1] + s[i + 2]) / 3) * (s[i + 3] / 255))
  out[o] = out[o + 1] = out[o + 2] = v
  out[o + 3] = 255
}, 4)
const npng = new PNG({ width: BAKE_W, height: BAKE_H, colorType: 0 })
npng.data = Buffer.from(nl)
writeFileSync('public/data/night.png', PNG.sync.write(npng, { colorType: 0, inputColorType: 6 }))
console.log('night.png')

// Overview imagery
const im = await mosaic(IMAGERY_URL, (out, o, s, i) => {
  out[o] = s[i]; out[o + 1] = s[i + 1]; out[o + 2] = s[i + 2]; out[o + 3] = 255
}, 4)
writeFileSync('public/data/overview.jpg', jpeg.encode({ data: im, width: BAKE_W, height: BAKE_H }, 82).data)
console.log('overview.jpg')
