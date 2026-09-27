import { SLAB } from './slab'

// World space for the diorama: Web Mercator, scaled so 1 unit ≈ 1 km at 47.5°N, centred on the slab.
// +X = east, −Z = north, +Y = up. Heights are exaggerated in the shaders (uExag) so they can ease
// from a relief-model look far out to near-true proportions close in.

export const R_KM = 6378.137
export const REF_LAT = 47.5
export const K = Math.cos((REF_LAT * Math.PI) / 180)
/** World units per whole-world Mercator width. */
export const C = 2 * Math.PI * R_KM * K

const n0 = 2 ** SLAB.z
/** Slab bounds in normalised Mercator (0..1, y down). */
export const SLAB_M = {
  x0: SLAB.x0 / n0,
  x1: (SLAB.x1 + 1) / n0,
  y0: SLAB.y0 / n0,
  y1: (SLAB.y1 + 1) / n0,
}
const CX = (SLAB_M.x0 + SLAB_M.x1) / 2
const CY = (SLAB_M.y0 + SLAB_M.y1) / 2

/** Slab bounds in world units. */
export const SLAB_W = {
  x0: (SLAB_M.x0 - CX) * C,
  x1: (SLAB_M.x1 - CX) * C,
  z0: (SLAB_M.y0 - CY) * C,
  z1: (SLAB_M.y1 - CY) * C,
}
export const SLAB_SIZE = { w: SLAB_W.x1 - SLAB_W.x0, h: SLAB_W.z1 - SLAB_W.z0 }

export const mercX = (lon: number) => (lon + 180) / 360
export const mercY = (lat: number) => {
  const r = (lat * Math.PI) / 180
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2
}
export const lonOf = (mx: number) => mx * 360 - 180
export const latOf = (my: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180) / Math.PI

export const worldX = (lon: number) => (mercX(lon) - CX) * C
export const worldZ = (lat: number) => (mercY(lat) - CY) * C
export const lonAt = (x: number) => lonOf(x / C + CX)
export const latAt = (z: number) => latOf(z / C + CY)
export const mxAt = (x: number) => x / C + CX
export const myAt = (z: number) => z / C + CY

/** World units per true km at a latitude (Mercator stretches toward the pole). */
export const scaleAt = (lat: number) => K / Math.cos((lat * Math.PI) / 180)

/** Un-exaggerated world height (units) for metres at a latitude. */
export const heightUnits = (m: number, lat: number) => (Math.max(0, m) / 1000) * scaleAt(lat)

/** World rectangle of a Mercator tile. */
export function tileRect(z: number, x: number, y: number) {
  const n = 2 ** z
  return {
    x0: (x / n - CX) * C,
    x1: ((x + 1) / n - CX) * C,
    z0: (y / n - CY) * C,
    z1: ((y + 1) / n - CY) * C,
  }
}

/** Slab-normalised UV (0..1, v down) for a world XZ. */
export const slabU = (x: number) => (x - SLAB_W.x0) / SLAB_SIZE.w
export const slabV = (z: number) => (z - SLAB_W.z0) / SLAB_SIZE.h
