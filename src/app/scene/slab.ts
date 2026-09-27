// The diorama "slab": a block of Web Mercator z6 tiles from Cornwall to Vienna, the Baltic edge to Rome.
// Shared by the build script (prebaked heightfield / night lights / overview imagery) and the renderer.

export const SLAB = { z: 6, x0: 31, x1: 35, y0: 21, y1: 23 } as const
/** Prebaked rasters are one zoom level deeper (z7): 10 × 6 tiles of 256 px. */
export const BAKE_Z = 7
export const BAKE_TILE = 256
export const BAKE = {
  x0: SLAB.x0 * 2,
  y0: SLAB.y0 * 2,
  cols: (SLAB.x1 - SLAB.x0 + 1) * 2,
  rows: (SLAB.y1 - SLAB.y0 + 1) * 2,
}
export const BAKE_W = BAKE.cols * BAKE_TILE
export const BAKE_H = BAKE.rows * BAKE_TILE
/** Heightfield encoding: grey = round(sqrt(metres / HEIGHT_MAX) × 255). */
export const HEIGHT_MAX = 4810

export const IMAGERY_URL = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg'
export const DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
export const NIGHT_URL = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Night_Lights/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png'

export const tileUrl = (tpl: string, z: number, x: number, y: number) =>
  tpl.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
