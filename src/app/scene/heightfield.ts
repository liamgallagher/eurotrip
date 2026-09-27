import * as THREE from 'three'
import { BAKE_H, BAKE_W, HEIGHT_MAX } from './slab'
import { SLAB_SIZE, SLAB_W } from './proj'

// The prebaked slab-wide rasters (see scripts/build-terrain.ts): one heightfield for shadows, walls and
// quick height lookups; VIIRS night lights; and Sentinel-2 overview imagery for the coarse tiles.

const BASE = import.meta.env.BASE_URL

async function pixels(url: string): Promise<Uint8ClampedArray> {
  const blob = await (await fetch(url)).blob()
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(bmp.width, bmp.height) : Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height })
  const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
  ctx.drawImage(bmp, 0, 0)
  return ctx.getImageData(0, 0, bmp.width, bmp.height).data
}

function grey(rgba: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(rgba.length / 4)
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4]
  return out
}

export interface SlabRasters {
  /** metres, row 0 = north edge */
  heights: Float32Array
  heightTex: THREE.DataTexture
  nightTex: THREE.DataTexture
  overviewTex: THREE.Texture
  /** Height (m) at a world XZ, bilinear; 0 outside the slab. */
  heightAt(x: number, z: number): number
}

export async function loadSlabRasters(): Promise<SlabRasters> {
  const [hPix, nPix, ov] = await Promise.all([
    pixels(`${BASE}data/heightfield.png`),
    pixels(`${BASE}data/night.png`),
    new THREE.TextureLoader().loadAsync(`${BASE}data/overview.jpg`),
  ])
  const hg = grey(hPix)
  const heights = new Float32Array(hg.length)
  for (let i = 0; i < hg.length; i++) {
    const v = hg[i] / 255
    heights[i] = v * v * HEIGHT_MAX
  }
  const heightTex = new THREE.DataTexture(hg, BAKE_W, BAKE_H, THREE.RedFormat, THREE.UnsignedByteType)
  heightTex.magFilter = THREE.LinearFilter
  heightTex.minFilter = THREE.LinearFilter
  heightTex.needsUpdate = true
  const nightTex = new THREE.DataTexture(grey(nPix), BAKE_W, BAKE_H, THREE.RedFormat, THREE.UnsignedByteType)
  nightTex.magFilter = THREE.LinearFilter
  nightTex.minFilter = THREE.LinearMipmapLinearFilter
  nightTex.generateMipmaps = true
  nightTex.needsUpdate = true
  ov.colorSpace = THREE.SRGBColorSpace
  ov.flipY = false
  ov.anisotropy = 8
  ov.needsUpdate = true

  const heightAt = (x: number, z: number) => {
    const u = ((x - SLAB_W.x0) / SLAB_SIZE.w) * BAKE_W - 0.5
    const v = ((z - SLAB_W.z0) / SLAB_SIZE.h) * BAKE_H - 0.5
    if (u < -0.5 || v < -0.5 || u > BAKE_W - 0.5 || v > BAKE_H - 0.5) return 0
    const x0 = Math.max(0, Math.min(BAKE_W - 2, Math.floor(u)))
    const y0 = Math.max(0, Math.min(BAKE_H - 2, Math.floor(v)))
    const fx = Math.min(1, Math.max(0, u - x0)), fy = Math.min(1, Math.max(0, v - y0))
    const i = y0 * BAKE_W + x0
    return (
      heights[i] * (1 - fx) * (1 - fy) + heights[i + 1] * fx * (1 - fy) + heights[i + BAKE_W] * (1 - fx) * fy + heights[i + BAKE_W + 1] * fx * fy
    )
  }
  return { heights, heightTex, nightTex, overviewTex: ov, heightAt }
}
