// Elevation sampling from Terrarium-encoded DEM tiles (AWS Terrain Tiles, public, no key).
// The tile decoder is injected so the same code runs in the browser (canvas) and Node (pngjs).

export const TERRARIUM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
export const DEM_ZOOM = 11
const SIZE = 256

export type TileDecoder = (url: string) => Promise<Uint8ClampedArray | Uint8Array | null>

export class DemSampler {
  private cache = new Map<string, Promise<Float32Array | null>>()
  private decode: TileDecoder
  private zoom: number

  constructor(decode: TileDecoder, zoom = DEM_ZOOM) {
    this.decode = decode
    this.zoom = zoom
  }

  private tile(x: number, y: number): Promise<Float32Array | null> {
    const key = `${x}/${y}`
    let p = this.cache.get(key)
    if (!p) {
      const url = TERRARIUM_URL.replace('{z}', String(this.zoom)).replace('{x}', String(x)).replace('{y}', String(y))
      p = this.decode(url).then((rgba) => {
        if (!rgba) return null
        const out = new Float32Array(SIZE * SIZE)
        for (let i = 0; i < SIZE * SIZE; i++) {
          out[i] = rgba[i * 4] * 256 + rgba[i * 4 + 1] + rgba[i * 4 + 2] / 256 - 32768
        }
        return out
      }).catch(() => null)
      this.cache.set(key, p)
    }
    return p
  }

  /** Sample elevations (m) for many lon/lat points; tiles are fetched once each. */
  async sample(points: [number, number][]): Promise<number[]> {
    const n = 2 ** this.zoom
    const pix = points.map(([lon, lat]) => {
      const x = ((lon + 180) / 360) * n * SIZE
      const latR = (lat * Math.PI) / 180
      const y = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n * SIZE
      return [x, y] as const
    })
    const needed = new Set<string>()
    for (const [x, y] of pix) {
      const tx = Math.floor(x / SIZE), ty = Math.floor(y / SIZE)
      needed.add(`${tx}/${ty}`)
      // neighbour for bilinear at tile edges
      needed.add(`${Math.floor((x + 1) / SIZE)}/${Math.floor((y + 1) / SIZE)}`)
    }
    const tiles = new Map<string, Float32Array | null>()
    const keys = [...needed]
    // limited parallelism
    const CONC = 8
    for (let i = 0; i < keys.length; i += CONC) {
      const batch = keys.slice(i, i + CONC)
      const res = await Promise.all(batch.map((k) => { const [tx, ty] = k.split('/').map(Number); return this.tile(tx, ty) }))
      batch.forEach((k, j) => tiles.set(k, res[j]))
    }
    const at = (px: number, py: number): number | null => {
      const tx = Math.floor(px / SIZE), ty = Math.floor(py / SIZE)
      const t = tiles.get(`${tx}/${ty}`)
      if (!t) return null
      const ix = Math.min(SIZE - 1, Math.max(0, Math.floor(px - tx * SIZE)))
      const iy = Math.min(SIZE - 1, Math.max(0, Math.floor(py - ty * SIZE)))
      return t[iy * SIZE + ix]
    }
    return pix.map(([x, y]) => {
      const x0 = Math.floor(x - 0.5), y0 = Math.floor(y - 0.5)
      const fx = x - 0.5 - x0, fy = y - 0.5 - y0
      const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1)
      if (a == null || b == null || c == null || d == null) return a ?? b ?? c ?? d ?? 0
      return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy
    })
  }
}

/** Browser decoder using createImageBitmap + OffscreenCanvas/canvas. */
export const browserDecoder: TileDecoder = async (url) => {
  const res = await fetch(url)
  if (!res.ok) return null
  const blob = await res.blob()
  const bmp = await createImageBitmap(blob)
  const canvas: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(SIZE, SIZE) : Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE })
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  ctx.drawImage(bmp, 0, 0)
  return ctx.getImageData(0, 0, SIZE, SIZE).data
}
