import * as THREE from 'three'
import { MapControls } from 'three/examples/jsm/controls/MapControls.js'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  TiltShiftEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing'
import { HEIGHT_MAX } from './slab'
import { C, K, SLAB_M, SLAB_SIZE, SLAB_W, heightUnits, latAt, lonAt, scaleAt, worldX, worldZ } from './proj'
import { loadSlabRasters, type SlabRasters } from './heightfield'
import { TileSet } from './tiles'
import { Ribbons, type Track } from './ribbons'
import { buildCloudSea, buildStars, buildWalls, Gates, type Gate, SLAB_DEPTH } from './extras'
import { lightFor, localDate, type Light } from './sun'

export type Quality = 'high' | 'medium' | 'low'

export interface View {
  lon: number
  lat: number
  /** camera distance from the target, km */
  dist: number
  /** degrees from straight down */
  tilt: number
  /** degrees, 0 = looking north */
  heading: number
}

export interface Anchor {
  el: HTMLElement
  lon: number
  lat: number
  /** extra metres above the ground */
  lift?: number
  /** hide when the camera is further than this (km) */
  maxDist?: number
  /** hide when a mountain is in the way */
  occlude?: boolean
}

interface FlyAnim {
  from: View
  to: View
  t0: number
  ms: number
  hop: number
  resolve: () => void
}

export interface PathPoint {
  lon: number
  lat: number
  ele: number
  km: number
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerpAngle = (a: number, b: number, t: number) => {
  let d = ((b - a + 540) % 360) - 180
  if (d < -180) d += 360
  return a + d * t
}

export class Diorama {
  readonly canvas: HTMLCanvasElement
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly controls: MapControls
  private composer: EffectComposer
  private bloom: BloomEffect
  private tilt: TiltShiftEffect
  private smaa: EffectPass | null = null
  private sky: Sky
  private stars: THREE.Points
  private rasters!: SlabRasters
  private tiles!: TileSet
  ribbons!: Ribbons
  gates!: Gates
  private anchors = new Map<string, Anchor & { h: number; hAt: number; vis: boolean }>()
  private uniforms: Record<string, THREE.IUniform>
  private raf = 0
  private disposed = false
  private activeUntil = 0
  private dirty = true
  private lastExag = 0
  private anim: FlyAnim | null = null
  private follow: { path: PathPoint[]; km: number; speed: number; dist: number; onKm?: (km: number) => boolean | void; headingS: number; resolve: () => void } | null = null
  private clock = new THREE.Clock()
  private frameTimes: number[] = []
  private afterRender: ((renderer: THREE.WebGLRenderer) => void)[] = []
  private resizeObs: ResizeObserver
  quality: Quality
  light!: Light
  sunDate = localDate('2027-05-10', 19 * 60 + 30)
  ready: Promise<void>
  onFrame: (() => void) | null = null
  onQuality: ((q: Quality) => void) | null = null
  /** When false, rendering only happens on demand (saves battery). */
  animateAlways = false

  constructor(container: HTMLElement, opts: { quality?: Quality } = {}) {
    const mobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700
    this.quality = opts.quality ?? (mobile ? 'medium' : 'high')
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'diorama__canvas'
    container.appendChild(this.canvas)
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true, alpha: false })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.NoToneMapping
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 60000)
    this.camera.position.set(0, 1600, 1500)

    this.uniforms = {
      uExag: { value: 3 },
      uC: { value: C },
      uCY: { value: (SLAB_M.y0 + SLAB_M.y1) / 2 },
      uK: { value: K },
      uSlab: { value: new THREE.Vector4(SLAB_W.x0, SLAB_W.z0, SLAB_SIZE.w, SLAB_SIZE.h) },
      uHF: { value: null },
      uHMax: { value: HEIGHT_MAX },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(3, 3, 3) },
      uSkyAmb: { value: new THREE.Color(0.4, 0.5, 0.7) },
      uGroundAmb: { value: new THREE.Color(0.2, 0.2, 0.2) },
      uFogColor: { value: new THREE.Color(0.7, 0.8, 0.9) },
      uFogSunColor: { value: new THREE.Color(1, 0.7, 0.5) },
      uFogDensity: { value: 0.0002 },
      uNightF: { value: 0 },
      uTime: { value: 0 },
      uNight: { value: null },
      uHFTexel: { value: new THREE.Vector2(1, 1) },
      uSnowline: { value: 2200 },
      uSteps: { value: 24 },
      uFocus: { value: new THREE.Vector4(0, 0, 1, 0) },
    }

    this.sky = new Sky()
    this.sky.scale.setScalar(1)
    const su = this.sky.material.uniforms
    su.turbidity.value = 4.5
    su.rayleigh.value = 1.6
    su.mieCoefficient.value = 0.004
    su.mieDirectionalG.value = 0.86
    this.scene.add(this.sky)
    this.stars = buildStars()
    this.scene.add(this.stars)

    this.controls = new MapControls(this.camera, this.canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.screenSpacePanning = false
    this.controls.zoomToCursor = true
    this.controls.minDistance = 1.2
    this.controls.maxDistance = 3400
    this.controls.maxPolarAngle = 1.32
    this.controls.zoomSpeed = 1.2
    this.controls.target.set(0, 0, 0)
    this.controls.addEventListener('change', () => this.poke())
    this.controls.addEventListener('start', () => {
      this.anim = null
    })

    this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType, multisampling: this.quality === 'high' ? 4 : 0 })
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new BloomEffect({ luminanceThreshold: 1.5, luminanceSmoothing: 0.3, intensity: 0.85, mipmapBlur: true, radius: 0.7 })
    this.tilt = new TiltShiftEffect({ offset: 0.05, rotation: 0, focusArea: 0.62, feather: 0.4, kernelSize: 2 })
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC })
    const vignette = new VignetteEffect({ offset: 0.28, darkness: 0.5 })
    this.composer.addPass(new EffectPass(this.camera, this.bloom, this.tilt))
    this.composer.addPass(new EffectPass(this.camera, tone, vignette))
    if (this.quality !== 'high') {
      this.smaa = new EffectPass(this.camera, new SMAAEffect())
      this.composer.addPass(this.smaa)
    }

    this.resizeObs = new ResizeObserver(() => this.resize())
    this.resizeObs.observe(container)
    this.resize()
    this.ready = this.init()
    const onVis = () => {
      if (!document.hidden) this.poke()
    }
    document.addEventListener('visibilitychange', onVis)
    this.raf = requestAnimationFrame(this.tick)
  }

  private async init() {
    this.rasters = await loadSlabRasters()
    this.rasters.heightTex.generateMipmaps = true
    this.rasters.heightTex.minFilter = THREE.LinearMipmapLinearFilter
    this.rasters.heightTex.needsUpdate = true
    this.uniforms.uHF.value = this.rasters.heightTex
    this.uniforms.uNight.value = this.rasters.nightTex
    this.uniforms.uHFTexel.value.set(1 / this.rasters.heightTex.image.width, 1 / this.rasters.heightTex.image.height)
    const mobile = this.quality !== 'high'
    this.tiles = new TileSet(this.rasters, { maxTiles: mobile ? 140 : 320, uniforms: this.uniforms })
    this.tiles.onChange = () => this.poke(600)
    this.scene.add(this.tiles.group)
    this.scene.add(buildWalls(this.rasters, this.uniforms))
    this.scene.add(buildCloudSea(this.uniforms))
    this.ribbons = new Ribbons(this.uniforms)
    this.scene.add(this.ribbons.group)
    this.gates = new Gates(this.uniforms)
    this.scene.add(this.gates.group)
    this.applyQuality()
    this.setSun(this.sunDate)
    this.poke()
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.resizeObs.disconnect()
    this.controls.dispose()
    this.tiles?.dispose()
    this.composer.dispose()
    this.renderer.dispose()
    this.canvas.remove()
  }

  /** Keep rendering every frame for a while (animations, streaming tiles). */
  poke(ms = 2500) {
    this.dirty = true
    this.activeUntil = Math.max(this.activeUntil, performance.now() + ms)
  }

  private dpr() {
    const d = window.devicePixelRatio || 1
    return this.quality === 'high' ? Math.min(d, 1.75) : this.quality === 'medium' ? Math.min(d, 1.25) : 1
  }

  setQuality(q: Quality) {
    if (q === this.quality) return
    this.quality = q
    this.applyQuality()
    this.resize()
    this.onQuality?.(q)
  }

  private applyQuality() {
    this.uniforms.uSteps.value = this.quality === 'high' ? 26 : this.quality === 'medium' ? 16 : 8
    this.composer.multisampling = this.quality === 'high' ? 4 : 0
    this.bloom.blendMode.opacity.value = this.quality === 'low' ? 0 : 1
  }

  resize() {
    const el = this.canvas.parentElement!
    const w = el.clientWidth || 1, h = el.clientHeight || 1
    this.renderer.setPixelRatio(this.dpr())
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.poke()
  }

  // ——— sun
  setSun(date: Date, where?: { lon: number; lat: number }) {
    this.sunDate = date
    const lat = where?.lat ?? latAt(this.controls.target.z)
    const lon = where?.lon ?? lonAt(this.controls.target.x)
    const L = lightFor(date, lat, lon)
    this.light = L
    const u = this.uniforms
    u.uSunDir.value.copy(L.dir)
    u.uSunColor.value.copy(L.sunColor)
    u.uSkyAmb.value.copy(L.skyAmb)
    u.uGroundAmb.value.copy(L.groundAmb)
    u.uFogColor.value.copy(L.fog)
    u.uFogSunColor.value.copy(L.fogSun)
    u.uNightF.value = L.night
    this.sky.material.uniforms.sunPosition.value.copy(L.dir)
    ;(this.stars.material as THREE.ShaderMaterial).uniforms.uOpacity.value = L.night
    this.poke(300)
  }

  setSnowline(m: number) {
    this.uniforms.uSnowline.value = m
    this.poke(300)
  }

  setFocus(f: { lon: number; lat: number; radiusKm: number } | null) {
    const v = this.uniforms.uFocus.value as THREE.Vector4
    if (!f) v.w = 0
    else v.set(worldX(f.lon), worldZ(f.lat), f.radiusKm * scaleAt(f.lat), 1)
    this.poke(300)
  }

  // ——— content
  setTracks(tracks: Track[]) {
    this.ribbons?.set(tracks)
    this.poke()
  }

  setRibbonMode(mode: 0 | 1 | 2) {
    if (this.ribbons) this.ribbons.uniforms.uMode.value = mode
    this.poke(300)
  }

  /** Animate the ribbons drawing on from km 0 to `toKm` over `ms`. */
  drawOn(toKm: number, ms: number) {
    if (!this.ribbons) return
    const u = this.ribbons.uniforms.uDraw
    const t0 = performance.now()
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / ms)
      u.value = t >= 1 ? 1e5 : toKm * easeInOut(t)
      this.poke(200)
      if (t < 1 && !this.disposed) requestAnimationFrame(step)
    }
    u.value = 0
    step()
  }

  setGates(list: { id: string; lon: number; lat: number; ele?: number; status: Gate['status'] }[]) {
    this.gates?.set(
      list.map((g) => {
        const x = worldX(g.lon), z = worldZ(g.lat)
        const h = g.ele ?? this.rasters.heightAt(x, z)
        return { id: g.id, x, z, y: heightUnits(h, g.lat), status: g.status }
      }),
    )
    this.poke()
  }

  // ——— anchors (HTML pins that follow the terrain)
  setAnchor(id: string, a: Anchor) {
    const prev = this.anchors.get(id)
    this.anchors.set(id, { ...a, h: prev && prev.lon === a.lon && prev.lat === a.lat ? prev.h : NaN, hAt: 0, vis: prev?.vis ?? false })
    this.poke(200)
  }
  removeAnchor(id: string) {
    const a = this.anchors.get(id)
    if (a) a.el.style.visibility = 'hidden'
    this.anchors.delete(id)
  }

  private groundY(x: number, z: number, lat: number) {
    const h = this.tiles ? this.tiles.heightAt(x, z) : this.rasters ? this.rasters.heightAt(x, z) : 0
    return heightUnits(h, lat) * this.uniforms.uExag.value
  }

  private updateAnchors(frame: number) {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight
    const v = new THREE.Vector3()
    const camDist = this.camera.position.distanceTo(this.controls.target)
    const exag = this.uniforms.uExag.value
    for (const a of this.anchors.values()) {
      const x = worldX(a.lon), z = worldZ(a.lat)
      if (Number.isNaN(a.h) || frame - a.hAt > 40) {
        a.h = this.tiles ? this.tiles.heightAt(x, z) : this.rasters?.heightAt(x, z) ?? 0
        a.hAt = frame
      }
      v.set(x, heightUnits(a.h + (a.lift ?? 0), a.lat) * exag, z)
      const world = v.clone()
      v.project(this.camera)
      let vis = v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15 && (!a.maxDist || camDist <= a.maxDist)
      if (vis && a.occlude && this.rasters) vis = !this.occluded(world)
      if (vis !== a.vis) {
        a.el.style.visibility = vis ? 'visible' : 'hidden'
        a.el.dataset.vis = vis ? '1' : '0'
        a.vis = vis
      }
      if (vis) {
        const sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h
        a.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`
        a.el.style.zIndex = String(Math.round((1 - v.z) * 100000))
      }
    }
  }

  /** Is terrain between the camera and this world point? (coarse, heightfield) */
  private occluded(p: THREE.Vector3): boolean {
    const c = this.camera.position
    const exag = this.uniforms.uExag.value
    for (let i = 1; i < 12; i++) {
      const t = i / 12
      const x = lerp(p.x, c.x, t), y = lerp(p.y, c.y, t), z = lerp(p.z, c.z, t)
      const lat = latAt(z)
      if (y < heightUnits(this.rasters.heightAt(x, z), lat) * exag - 0.3) return true
    }
    return false
  }

  // ——— camera
  getView(): View {
    const t = this.controls.target
    const off = this.camera.position.clone().sub(t)
    const dist = off.length()
    const tilt = (Math.acos(clamp(off.y / dist, -1, 1)) * 180) / Math.PI
    const heading = ((Math.atan2(-off.x, off.z) * 180) / Math.PI + 360) % 360
    const lat = latAt(t.z)
    return { lon: lonAt(t.x), lat, dist: dist / scaleAt(lat), tilt, heading }
  }

  private applyView(v: View) {
    const x = worldX(v.lon), z = worldZ(v.lat)
    const s = scaleAt(v.lat)
    const d = v.dist * s
    const tr = (v.tilt * Math.PI) / 180
    const hr = (v.heading * Math.PI) / 180
    const ty = this.rasters ? this.groundY(x, z, v.lat) : 0
    this.controls.target.set(x, ty, z)
    this.camera.position.set(x - Math.sin(hr) * Math.sin(tr) * d, ty + Math.cos(tr) * d, z + Math.cos(hr) * Math.sin(tr) * d)
    this.camera.lookAt(this.controls.target)
  }

  setView(v: View) {
    this.anim = null
    this.applyView(v)
    this.poke()
  }

  flyTo(to: Partial<View> & { lon: number; lat: number }, ms = 1800): Promise<void> {
    const from = this.getView()
    const target: View = { dist: from.dist, tilt: from.tilt, heading: from.heading, ...to }
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) ms = 0
    const travel = Math.hypot(worldX(from.lon) - worldX(target.lon), worldZ(from.lat) - worldZ(target.lat))
    const hop = Math.max(0, travel * 0.55 - Math.max(from.dist, target.dist) * 0.5)
    return new Promise((resolve) => {
      if (this.anim) this.anim.resolve()
      if (ms <= 0) {
        this.setView(target)
        resolve()
        return
      }
      this.anim = { from, to: target, t0: performance.now(), ms, hop, resolve }
      this.poke(ms + 500)
    })
  }

  /** Chase-camera fly along a path. `onKm` can return false to stop early. */
  flyAlong(path: PathPoint[], opts: { kmPerSec?: number; dist?: number; onKm?: (km: number) => boolean | void } = {}): Promise<void> {
    return new Promise((resolve) => {
      if (this.follow) this.follow.resolve()
      this.follow = { path, km: path[0]?.km ?? 0, speed: opts.kmPerSec ?? 60, dist: opts.dist ?? 28, onKm: opts.onKm, headingS: this.getView().heading, resolve }
      this.controls.enableRotate = false
      this.controls.enablePan = false
      this.poke(1e9)
    })
  }
  setFlySpeed(kmPerSec: number) {
    if (this.follow) this.follow.speed = kmPerSec
  }
  /** Tiles still streaming? */
  get busy() {
    return !this.tiles || this.tiles.inflight > 0 || performance.now() - this.tiles.lastLoadAt < 1500
  }
  get debug() {
    const z: Record<number, number> = {}
    for (const k of this.tiles?.drawnZooms ?? []) z[k] = (z[k] ?? 0) + 1
    return { drawn: z, loaded: this.tiles?.loadedCount, failed: this.tiles?.failedCount, exag: this.uniforms.uExag.value, quality: this.quality }
  }
  get flying() {
    return !!this.follow
  }
  stopFly() {
    if (!this.follow) return
    const f = this.follow
    this.follow = null
    this.controls.enableRotate = true
    this.controls.enablePan = true
    this.activeUntil = performance.now() + 1500
    f.resolve()
  }

  private pathAt(path: PathPoint[], km: number) {
    let lo = 0, hi = path.length - 1
    if (km <= path[0].km) return path[0]
    if (km >= path[hi].km) return path[hi]
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1
      if (path[m].km <= km) lo = m
      else hi = m
    }
    const a = path[lo], b = path[hi]
    const t = (km - a.km) / (b.km - a.km || 1)
    return { lon: lerp(a.lon, b.lon, t), lat: lerp(a.lat, b.lat, t), ele: lerp(a.ele, b.ele, t), km }
  }

  private stepFollow(dt: number) {
    const f = this.follow!
    const end = f.path[f.path.length - 1].km
    f.km = Math.min(end, f.km + f.speed * dt)
    if (f.onKm?.(f.km) === false || f.km >= end) {
      this.stopFly()
      return
    }
    const p = this.pathAt(f.path, f.km)
    const ahead = this.pathAt(f.path, Math.min(end, f.km + Math.max(4, f.dist * 0.6)))
    const behind = this.pathAt(f.path, Math.max(f.path[0].km, f.km - 3))
    const hx = worldX(ahead.lon) - worldX(behind.lon), hz = worldZ(ahead.lat) - worldZ(behind.lat)
    const want = ((Math.atan2(hx, -hz) * 180) / Math.PI + 360) % 360
    f.headingS = lerpAngle(f.headingS, want, 1 - Math.exp(-dt * 1.4))
    const v: View = { lon: p.lon, lat: p.lat, dist: f.dist, tilt: 62, heading: f.headingS }
    const cur = this.getView()
    const k = 1 - Math.exp(-dt * 3.5)
    this.applyView({ ...v, lon: lerp(cur.lon, v.lon, k), lat: lerp(cur.lat, v.lat, k), dist: lerp(cur.dist, f.dist, k), tilt: lerp(cur.tilt, 62, k) })
  }

  /** Adjust chase distance (wheel/pinch while flying). */
  zoomFly(factor: number) {
    if (this.follow) this.follow.dist = clamp(this.follow.dist * factor, 4, 400)
  }

  // ——— capture
  addAfterRender(fn: (r: THREE.WebGLRenderer) => void) {
    this.afterRender.push(fn)
    return () => {
      this.afterRender = this.afterRender.filter((f) => f !== fn)
    }
  }

  project(lon: number, lat: number, ele = 0): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(worldX(lon), heightUnits(ele, lat) * this.uniforms.uExag.value, worldZ(lat)).project(this.camera)
    return { x: (v.x * 0.5 + 0.5) * this.canvas.clientWidth, y: (-v.y * 0.5 + 0.5) * this.canvas.clientHeight, visible: v.z < 1 }
  }

  /** lon/lat under a screen point (ray against the heightfield). */
  pick(clientX: number, clientY: number): { lon: number; lat: number } | null {
    const r = this.canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc, this.camera)
    const o = ray.ray.origin, d = ray.ray.direction
    const exag = this.uniforms.uExag.value
    let t = 0
    const maxT = o.distanceTo(this.controls.target) * 4
    const step = maxT / 400
    for (let i = 0; i < 400; i++) {
      t += step
      const p = o.clone().addScaledVector(d, t)
      const lat = latAt(p.z)
      if (p.y <= heightUnits(this.rasters.heightAt(p.x, p.z), lat) * exag) return { lon: lonAt(p.x), lat }
    }
    return null
  }

  // ——— loop
  private tick = () => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.tick)
    if (document.hidden) return
    const now = performance.now()
    const dt = Math.min(0.1, this.clock.getDelta())
    const active = this.animateAlways || now < this.activeUntil || !!this.anim || !!this.follow
    if (!active && !this.dirty) return
    this.dirty = false
    this.uniforms.uTime.value += dt

    if (this.anim) {
      const a = this.anim
      const t = Math.min(1, (now - a.t0) / a.ms)
      const e = easeInOut(t)
      const v: View = {
        lon: lerp(a.from.lon, a.to.lon, e),
        lat: lerp(a.from.lat, a.to.lat, e),
        dist: Math.exp(lerp(Math.log(a.from.dist), Math.log(a.to.dist), e)) + Math.sin(Math.PI * e) * a.hop,
        tilt: lerp(a.from.tilt, a.to.tilt, e),
        heading: lerpAngle(a.from.heading, a.to.heading, e),
      }
      this.applyView(v)
      if (t >= 1) {
        this.anim = null
        a.resolve()
      }
    } else if (this.follow) {
      this.stepFollow(dt)
    } else {
      this.controls.update(dt)
    }
    this.constrain()

    // exaggeration: relief-model far out, near-true close in
    const dist = this.camera.position.distanceTo(this.controls.target)
    const lt = clamp((Math.log10(dist) - Math.log10(12)) / (Math.log10(2600) - Math.log10(12)), 0, 1)
    const exag = lerp(1.15, 3.4, lt ** 1.7)
    const exagChanged = Math.abs(exag - this.lastExag) > 0.02
    if (exagChanged) this.lastExag = exag
    this.uniforms.uExag.value = exag
    this.uniforms.uFogDensity.value = 1 / (dist * 4.5 + 140)
    if (this.ribbons) {
      this.ribbons.uniforms.uRes.value.set(this.canvas.width / 2, this.canvas.height / 2)
      this.ribbons.uniforms.uLift.value = dist * 0.0012
    }
    if (this.gates) this.gates.size.value = dist * 0.018
    // tilt-shift only for the miniature overview
    this.tilt.blendMode.opacity.value = this.quality === 'low' ? 0 : clamp((dist - 300) / 1200, 0, 1) * 0.6
    this.tilt.offset = clamp(0.1 - (this.camera.position.y - this.controls.target.y) / dist * 0.05, -0.2, 0.2)

    // near / far planes from height above ground
    const cam = this.camera.position
    const ground = this.rasters ? this.groundY(cam.x, cam.z, latAt(cam.z)) : 0
    const above = Math.max(0.05, cam.y - ground)
    this.camera.near = clamp(above * 0.12, 0.02, 60)
    this.camera.far = 30000
    this.camera.updateProjectionMatrix()
    this.sky.position.copy(cam)
    this.sky.scale.setScalar(20000)
    this.stars.position.copy(cam)
    ;(this.stars.material as THREE.ShaderMaterial).uniforms.uRadius.value = 15000

    if (this.tiles) {
      this.camera.updateMatrixWorld()
      const loading = this.tiles.update(this.camera, this.canvas.height, exagChanged)
      if (loading) this.activeUntil = Math.max(this.activeUntil, now + 300)
    }
    this.composer.render(dt)
    for (const f of this.afterRender) f(this.renderer)
    this.updateAnchors(Math.round(this.uniforms.uTime.value * 60))
    this.onFrame?.()

    // adaptive quality
    this.frameTimes.push(dt)
    if (this.frameTimes.length > 90) {
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length
      this.frameTimes = []
      if (avg > 0.05 && this.quality === 'high') this.setQuality('medium')
      else if (avg > 0.06 && this.quality === 'medium') this.setQuality('low')
    }
  }

  private constrain() {
    const t = this.controls.target
    const cam = this.camera.position
    // keep the target on the slab
    const cx = clamp(t.x, SLAB_W.x0, SLAB_W.x1), cz = clamp(t.z, SLAB_W.z0, SLAB_W.z1)
    if (cx !== t.x || cz !== t.z) {
      cam.x += cx - t.x
      cam.z += cz - t.z
      t.x = cx
      t.z = cz
    }
    // the target rides on the terrain, the camera moves with it
    if (this.rasters && !this.anim && !this.follow) {
      const gy = this.groundY(t.x, t.z, latAt(t.z))
      const dy = (gy - t.y) * 0.15
      t.y += dy
      cam.y += dy
    }
    // tilt range: steeper allowed close in
    const dist = cam.distanceTo(t)
    this.controls.maxPolarAngle = lerp(1.38, 1.0, clamp((dist - 60) / 1800, 0, 1))
    // never below the ground
    if (this.rasters) {
      const g = this.groundY(cam.x, cam.z, latAt(cam.z)) + Math.max(0.08, dist * 0.02)
      if (cam.y < g) cam.y = g
    }
    void SLAB_DEPTH
  }
}
