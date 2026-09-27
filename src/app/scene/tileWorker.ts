/// <reference lib="webworker" />
import { DEM_URL, IMAGERY_URL, tileUrl } from './slab'
import { DEM_MAX_Z, GRID, type TileRequest, type TileResult } from './tileTypes'

// Off-main-thread tile preparation: fetches a Terrarium DEM tile and a Sentinel-2 imagery tile, decodes the
// DEM, samples a 65×65 vertex grid and a 256×256 slope map (for crisp per-pixel lighting).

const S = 256

async function decode(url: string): Promise<Uint8ClampedArray> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status}`)
  const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
  const c = new OffscreenCanvas(S, S)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0)
  return ctx.getImageData(0, 0, S, S).data
}

const demCache = new Map<string, Promise<Float32Array>>()
function dem(z: number, x: number, y: number): Promise<Float32Array> {
  const k = `${z}/${x}/${y}`
  let p = demCache.get(k)
  if (!p) {
    p = decode(tileUrl(DEM_URL, z, x, y)).then((px) => {
      const out = new Float32Array(S * S)
      for (let i = 0; i < S * S; i++) out[i] = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768
      return out
    })
    demCache.set(k, p)
    if (demCache.size > 64) demCache.delete(demCache.keys().next().value!)
    p.catch(() => demCache.delete(k))
  }
  return p
}

/** DEM for a tile at any zoom: deeper than DEM_MAX_Z is cropped + upsampled from the ancestor. */
async function demFor(z: number, x: number, y: number): Promise<Float32Array> {
  if (z <= DEM_MAX_Z) return dem(z, x, y)
  const d = z - DEM_MAX_Z
  const f = 2 ** d
  const px = Math.floor(x / f), py = Math.floor(y / f)
  const src = await dem(DEM_MAX_Z, px, py)
  const ox = ((x % f) * S) / f, oy = ((y % f) * S) / f
  const out = new Float32Array(S * S)
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const u = ox + (i + 0.5) / f - 0.5, v = oy + (j + 0.5) / f - 0.5
    out[j * S + i] = bilinear(src, u, v)
  }
  return out
}

function bilinear(a: Float32Array, u: number, v: number): number {
  u = Math.max(0, Math.min(S - 1, u))
  v = Math.max(0, Math.min(S - 1, v))
  const x0 = Math.min(S - 2, Math.floor(u)), y0 = Math.min(S - 2, Math.floor(v))
  const fx = u - x0, fy = v - y0
  const i = y0 * S + x0
  return a[i] * (1 - fx) * (1 - fy) + a[i + 1] * fx * (1 - fy) + a[i + S] * (1 - fx) * fy + a[i + S + 1] * fx * fy
}

const latOfY = (yNorm: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * yNorm)))

async function prepare(req: TileRequest): Promise<TileResult> {
  const { z, x, y } = req
  const [h, image] = await Promise.all([
    demFor(z, x, y),
    fetch(tileUrl(IMAGERY_URL, z, x, y))
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => createImageBitmap(b))
      .catch(() => null),
  ])
  const heights = new Float32Array(GRID * GRID)
  let minH = Infinity, maxH = -Infinity
  const step = S / (GRID - 1)
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    const v = bilinear(h, i * step - 0.5, j * step - 0.5)
    heights[j * GRID + i] = v
    const c = Math.max(0, v)
    if (c < minH) minH = c
    if (c > maxH) maxH = c
  }
  // Slope map (dh/dx east, dh/dz south) in m/m, square-root encoded into two bytes.
  const n = 2 ** z
  const grad = new Uint8Array(S * S * 2)
  const enc = (g: number) => Math.round(Math.sign(g) * Math.sqrt(Math.min(4, Math.abs(g)) / 4) * 127 + 128)
  for (let j = 0; j < S; j++) {
    const lat = latOfY((y + (j + 0.5) / S) / n)
    const px = (40075016.686 * Math.cos(lat)) / n / S
    for (let i = 0; i < S; i++) {
      const l = h[j * S + Math.max(0, i - 1)], r = h[j * S + Math.min(S - 1, i + 1)]
      const u = h[Math.max(0, j - 1) * S + i], d = h[Math.min(S - 1, j + 1) * S + i]
      const dx = (i === 0 || i === S - 1 ? 1 : 2) * px
      const dz = (j === 0 || j === S - 1 ? 1 : 2) * px
      // flatten the sea so waves come from the shader, not bathymetry
      const sea = h[j * S + i] <= 0
      grad[(j * S + i) * 2] = sea ? 128 : enc((Math.max(0, r) - Math.max(0, l)) / dx)
      grad[(j * S + i) * 2 + 1] = sea ? 128 : enc((Math.max(0, d) - Math.max(0, u)) / dz)
    }
  }
  return { id: req.id, ok: true, heights, grad, minH, maxH, image }
}

self.onmessage = async (e: MessageEvent<TileRequest>) => {
  try {
    const r = await prepare(e.data)
    const transfer: Transferable[] = [r.heights!.buffer, r.grad!.buffer]
    if (r.image) transfer.push(r.image)
    ;(self as unknown as Worker).postMessage(r, transfer)
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ id: e.data.id, ok: false, error: String(err) } satisfies TileResult)
  }
}
