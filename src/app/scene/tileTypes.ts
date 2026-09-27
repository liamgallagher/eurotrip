// Shared between the tile worker and the main thread.

export const GRID = 65
export const DEM_MAX_Z = 12

export interface TileRequest {
  id: number
  z: number
  x: number
  y: number
}
export interface TileResult {
  id: number
  ok: boolean
  heights?: Float32Array
  grad?: Uint8Array
  minH?: number
  maxH?: number
  image?: ImageBitmap | null
  error?: string
}

