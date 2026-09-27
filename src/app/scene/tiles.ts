import * as THREE from 'three'
import { SLAB } from './slab'
import { GRID, type TileRequest, type TileResult } from './tileTypes'
import { heightUnits, latAt, SLAB_W, tileRect } from './proj'
import { TERRAIN_FRAG, TERRAIN_VERT } from './shaders'
import type { SlabRasters } from './heightfield'

// Level-of-detail terrain: a quadtree of Web Mercator tiles over the slab. z6–z7 draw from the baked
// overview + heightfield (no network); deeper tiles stream real DEM + Sentinel-2 imagery via a worker.
// A tile splits when it would cover more than ~SPLIT_PX pixels on screen.

const MAX_Z = 14
const BAKED_MAX_Z = 7
const SPLIT_PX = 360

let sharedGeo: THREE.BufferGeometry | null = null
/** One 64×64 grid with skirts, shared by every tile: x/z in 0..1, y = 0 on the surface and −1 on skirts. */
function gridGeometry(): THREE.BufferGeometry {
  if (sharedGeo) return sharedGeo
  const N = GRID - 1
  const pos: number[] = []
  const idx: number[] = []
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) pos.push(i / N, 0, j / N)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * GRID + i, b = a + 1, c = a + GRID, d = c + 1
    idx.push(a, c, b, b, c, d)
  }
  // skirts round the four edges
  const edge = (list: number[]) => {
    for (let k = 0; k < list.length - 1; k++) {
      const a = list[k], b = list[k + 1]
      const base = pos.length / 3
      pos.push(pos[a * 3], -1, pos[a * 3 + 2], pos[b * 3], -1, pos[b * 3 + 2])
      // copy top vertices so skirt tops share the tile's height sampling
      const ta = pos.length / 3
      pos.push(pos[a * 3], 0, pos[a * 3 + 2], pos[b * 3], 0, pos[b * 3 + 2])
      idx.push(ta, base, ta + 1, ta + 1, base, base + 1)
      idx.push(ta, ta + 1, base, ta + 1, base + 1, base)
    }
  }
  const top = [...Array(GRID).keys()]
  edge(top)
  edge(top.map((i) => N * GRID + i))
  edge(top.map((j) => j * GRID))
  edge(top.map((j) => j * GRID + N))
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9)
  sharedGeo = g
  return g
}

type State = 'idle' | 'loading' | 'ready' | 'failed'

class Tile {
  z: number
  x: number
  y: number
  key: string
  parent: Tile | null
  children: Tile[] | null = null
  state: State = 'idle'
  mesh: THREE.Mesh | null = null
  box = new THREE.Box3()
  heights: Float32Array | null = null
  lastUsed = 0
  imgTex: THREE.Texture | null = null
  gradTex: THREE.DataTexture | null = null
  hTex: THREE.DataTexture | null = null
  rect: ReturnType<typeof tileRect>

  constructor(z: number, x: number, y: number, parent: Tile | null) {
    this.z = z
    this.x = x
    this.y = y
    this.parent = parent
    this.key = `${z}/${x}/${y}`
    this.rect = tileRect(z, x, y)
  }
}

export interface TileSetOptions {
  maxTiles: number
  uniforms: Record<string, THREE.IUniform>
}

export class TileSet {
  group = new THREE.Group()
  private roots: Tile[] = []
  private all = new Map<string, Tile>()
  private worker: Worker
  private pending = new Map<number, Tile>()
  private queue: Tile[] = []
  private nextId = 1
  private frame = 0
  private maxTiles: number
  private shared: Record<string, THREE.IUniform>
  private rasters: SlabRasters
  private frustum = new THREE.Frustum()
  private projScreen = new THREE.Matrix4()
  onChange: () => void = () => {}
  loadedCount = 0
  inflight = 0
  failedCount = 0
  lastLoadAt = 0
  /** zoom levels of the tiles drawn last frame (debug) */
  drawnZooms: number[] = []

  constructor(rasters: SlabRasters, opts: TileSetOptions) {
    this.rasters = rasters
    this.maxTiles = opts.maxTiles
    this.shared = opts.uniforms
    this.worker = new Worker(new URL('./tileWorker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (e: MessageEvent<TileResult>) => this.onResult(e.data)
    for (let y = SLAB.y0; y <= SLAB.y1; y++) for (let x = SLAB.x0; x <= SLAB.x1; x++) {
      const t = new Tile(SLAB.z, x, y, null)
      this.roots.push(t)
      this.all.set(t.key, t)
    }
  }

  dispose() {
    this.worker.terminate()
    for (const t of this.all.values()) this.freeTile(t)
  }

  private material(t: Tile): THREE.ShaderMaterial {
    const baked = t.z <= BAKED_MAX_Z
    const r = t.rect
    // imagery: baked overview (slab UV), own tile, or the nearest ancestor with imagery
    let img: THREE.Texture = this.rasters.overviewTex
    let st = new THREE.Vector4(
      (r.x1 - r.x0) / (SLAB_W.x1 - SLAB_W.x0),
      (r.z1 - r.z0) / (SLAB_W.z1 - SLAB_W.z0),
      (r.x0 - SLAB_W.x0) / (SLAB_W.x1 - SLAB_W.x0),
      (r.z0 - SLAB_W.z0) / (SLAB_W.z1 - SLAB_W.z0),
    )
    if (!baked) {
      let a: Tile | null = t
      while (a && !a.imgTex) a = a.parent
      if (a && a.imgTex) {
        img = a.imgTex
        const f = 2 ** (t.z - a.z)
        st = new THREE.Vector4(1 / f, 1 / f, (t.x - a.x * f) / f, (t.y - a.y * f) / f)
      }
    }
    return new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: TERRAIN_VERT,
      fragmentShader: TERRAIN_FRAG,
      uniforms: {
        ...this.shared,
        uRect: { value: new THREE.Vector4(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0) },
        uHeights: { value: t.hTex },
        uHasDetail: { value: t.hTex ? 1 : 0 },
        uSkirt: { value: Math.max(0.05, (r.x1 - r.x0) * 0.02) },
        uImg: { value: img },
        uImgST: { value: st },
        uGrad: { value: t.gradTex },
        uHasGrad: { value: t.gradTex ? 1 : 0 },
      },
    })
  }

  private makeMesh(t: Tile) {
    const m = new THREE.Mesh(gridGeometry(), this.material(t))
    m.frustumCulled = false
    m.matrixAutoUpdate = false
    t.mesh = m
  }

  private computeBox(t: Tile) {
    const r = t.rect
    let minH = 0, maxH = 0
    if (t.heights) {
      minH = Infinity
      maxH = -Infinity
      for (const h of t.heights) {
        const c = Math.max(0, h)
        if (c < minH) minH = c
        if (c > maxH) maxH = c
      }
    } else {
      // coarse range from the heightfield
      maxH = 0
      for (let j = 0; j <= 8; j++) for (let i = 0; i <= 8; i++) {
        const h = this.rasters.heightAt(r.x0 + ((r.x1 - r.x0) * i) / 8, r.z0 + ((r.z1 - r.z0) * j) / 8)
        if (h > maxH) maxH = h
      }
      maxH = maxH * 1.15 + 200
    }
    const lat = latAt((r.z0 + r.z1) / 2)
    const e = Number(this.shared.uExag.value)
    t.box.min.set(r.x0, heightUnits(minH, lat) * e - 0.5, r.z0)
    t.box.max.set(r.x1, heightUnits(maxH, lat) * e + 0.5, r.z1)
  }

  private request(t: Tile) {
    if (t.state !== 'idle') return
    if (t.z <= BAKED_MAX_Z) {
      t.state = 'ready'
      this.makeMesh(t)
      this.computeBox(t)
      return
    }
    t.state = 'loading'
    this.queue.push(t)
  }

  private pump() {
    const MAX_INFLIGHT = 10
    if (!this.queue.length) return
    // closest-to-camera first: sort by last-used frame then zoom
    this.queue.sort((a, b) => b.lastUsed - a.lastUsed || a.z - b.z)
    while (this.inflight < MAX_INFLIGHT && this.queue.length) {
      const t = this.queue.shift()!
      if (this.frame - t.lastUsed > 30) {
        t.state = 'idle'
        continue
      }
      const id = this.nextId++
      this.pending.set(id, t)
      this.inflight++
      this.worker.postMessage({ id, z: t.z, x: t.x, y: t.y } satisfies TileRequest)
    }
  }

  private onResult(r: TileResult) {
    const t = this.pending.get(r.id)
    this.pending.delete(r.id)
    this.inflight--
    if (!t) return
    if (!r.ok) {
      this.failedCount++
      t.state = 'failed'
      this.pump()
      return
    }
    t.heights = r.heights!
    const hTex = new THREE.DataTexture(r.heights!, GRID, GRID, THREE.RedFormat, THREE.FloatType)
    hTex.needsUpdate = true
    t.hTex = hTex
    const g = new THREE.DataTexture(r.grad!, 256, 256, THREE.RGFormat, THREE.UnsignedByteType)
    g.magFilter = THREE.LinearFilter
    g.minFilter = THREE.LinearFilter
    g.needsUpdate = true
    t.gradTex = g
    if (r.image) {
      const tex = new THREE.Texture(r.image as unknown as HTMLImageElement)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.flipY = false
      tex.anisotropy = 8
      tex.generateMipmaps = true
      tex.minFilter = THREE.LinearMipmapLinearFilter
      tex.needsUpdate = true
      t.imgTex = tex
    }
    t.state = 'ready'
    this.loadedCount++
    this.lastLoadAt = performance.now()
    this.makeMesh(t)
    this.computeBox(t)
    this.onChange()
    this.pump()
  }

  private freeTile(t: Tile) {
    if (t.mesh) (t.mesh.material as THREE.Material).dispose()
    t.mesh = null
    t.imgTex?.dispose()
    ;(t.imgTex?.image as ImageBitmap | undefined)?.close?.()
    t.gradTex?.dispose()
    t.hTex?.dispose()
    t.imgTex = t.gradTex = t.hTex = null
    t.heights = null
    t.state = 'idle'
  }

  private childrenOf(t: Tile): Tile[] {
    if (!t.children) {
      t.children = []
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const c = new Tile(t.z + 1, t.x * 2 + dx, t.y * 2 + dy, t)
        this.all.set(c.key, c)
        t.children.push(c)
      }
    }
    return t.children
  }

  /** Pick the tiles to draw this frame; kick off loads. Returns true while anything is still loading. */
  update(camera: THREE.PerspectiveCamera, viewportH: number, exagChanged: boolean): boolean {
    this.frame++
    this.projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    this.frustum.setFromProjectionMatrix(this.projScreen)
    const draw: Tile[] = []
    const k = viewportH / (2 * Math.tan(((camera.fov * Math.PI) / 180) / 2))
    const cam = camera.position
    const tmp = new THREE.Vector3()

    const visit = (t: Tile) => {
      t.lastUsed = this.frame
      if (t.state === 'idle') this.request(t)
      if (t.state !== 'ready') return false
      if (exagChanged) this.computeBox(t)
      if (!this.frustum.intersectsBox(t.box)) return true
      const dist = Math.max(0.001, t.box.clampPoint(cam, tmp).distanceTo(cam))
      const size = t.rect.x1 - t.rect.x0
      const px = (size / dist) * k
      if (px > SPLIT_PX && t.z < MAX_Z) {
        const kids = this.childrenOf(t)
        let ready = true
        for (const c of kids) {
          c.lastUsed = this.frame
          if (c.state === 'idle') this.request(c)
          if (c.state === 'failed') ready = false
          else if (c.state !== 'ready') ready = false
        }
        if (ready) {
          for (const c of kids) visit(c)
          return true
        }
      }
      draw.push(t)
      return true
    }
    for (const r of this.roots) visit(r)

    // swap drawn meshes
    this.group.clear()
    for (const t of draw) if (t.mesh) this.group.add(t.mesh)
    this.drawnZooms = draw.map((t) => t.z)

    this.pump()
    if (this.frame % 20 === 0) this.evict()
    return this.inflight > 0 || this.queue.length > 0 || performance.now() - this.lastLoadAt < 400
  }

  private evict() {
    const loaded = [...this.all.values()].filter((t) => t.state === 'ready' && t.z > BAKED_MAX_Z)
    if (loaded.length <= this.maxTiles) return
    loaded.sort((a, b) => a.lastUsed - b.lastUsed)
    for (const t of loaded.slice(0, loaded.length - this.maxTiles)) {
      if (t.lastUsed === this.frame) break
      this.freeTile(t)
      // children that borrow this tile's imagery will re-resolve their material when rebuilt
      if (t.children) for (const c of t.children) if (c.state === 'ready' && c.mesh) {
        ;(c.mesh.material as THREE.Material).dispose()
        this.makeMesh(c)
      }
    }
  }

  /** Best available terrain height (m) at world XZ: finest loaded tile, else the heightfield. */
  heightAt(x: number, z: number): number {
    let t: Tile | undefined = this.roots.find((r) => x >= r.rect.x0 && x < r.rect.x1 && z >= r.rect.z0 && z < r.rect.z1)
    let best: Tile | null = null
    while (t) {
      if (t.state === 'ready' && t.heights) best = t
      if (!t.children) break
      const cx = (t.rect.x0 + t.rect.x1) / 2, cz = (t.rect.z0 + t.rect.z1) / 2
      t = t.children[(z >= cz ? 2 : 0) + (x >= cx ? 1 : 0)]
    }
    if (!best || !best.heights) return this.rasters.heightAt(x, z)
    const r = best.rect
    const u = ((x - r.x0) / (r.x1 - r.x0)) * (GRID - 1)
    const v = ((z - r.z0) / (r.z1 - r.z0)) * (GRID - 1)
    const i0 = Math.min(GRID - 2, Math.max(0, Math.floor(u))), j0 = Math.min(GRID - 2, Math.max(0, Math.floor(v)))
    const fx = u - i0, fy = v - j0
    const H = best.heights
    const a = Math.max(0, H[j0 * GRID + i0]), b = Math.max(0, H[j0 * GRID + i0 + 1])
    const c = Math.max(0, H[(j0 + 1) * GRID + i0]), d = Math.max(0, H[(j0 + 1) * GRID + i0 + 1])
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy
  }
}
