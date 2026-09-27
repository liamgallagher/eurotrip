import * as THREE from 'three'
import { BAKE_H, BAKE_W } from './slab'
import { SLAB_W } from './proj'
import { GATE_FRAG, GATE_VERT, SEA_FRAG, SEA_VERT, WALL_FRAG, WALL_VERT } from './shaders'
import type { SlabRasters } from './heightfield'

// The slab's cut earth walls, the sea of cloud beneath it, a starfield, and pass "gates".

export const SLAB_DEPTH = 42

export function buildWalls(r: SlabRasters, shared: Record<string, THREE.IUniform>): THREE.Group {
  const g = new THREE.Group()
  const sides: { from: [number, number]; to: [number, number]; normal: THREE.Vector3; px: (i: number) => number; n: number }[] = [
    // north edge (row 0), south edge (last row), west (col 0), east (last col)
    { from: [SLAB_W.x0, SLAB_W.z0], to: [SLAB_W.x1, SLAB_W.z0], normal: new THREE.Vector3(0, 0, -1), n: BAKE_W, px: (i) => i },
    { from: [SLAB_W.x1, SLAB_W.z1], to: [SLAB_W.x0, SLAB_W.z1], normal: new THREE.Vector3(0, 0, 1), n: BAKE_W, px: (i) => (BAKE_H - 1) * BAKE_W + (BAKE_W - 1 - i) },
    { from: [SLAB_W.x0, SLAB_W.z1], to: [SLAB_W.x0, SLAB_W.z0], normal: new THREE.Vector3(-1, 0, 0), n: BAKE_H, px: (i) => (BAKE_H - 1 - i) * BAKE_W },
    { from: [SLAB_W.x1, SLAB_W.z0], to: [SLAB_W.x1, SLAB_W.z1], normal: new THREE.Vector3(1, 0, 0), n: BAKE_H, px: (i) => i * BAKE_W + BAKE_W - 1 },
  ]
  for (const s of sides) {
    const step = 2
    const cnt = Math.floor(s.n / step)
    const pos: number[] = []
    const aH: number[] = []
    const aTop: number[] = []
    const idx: number[] = []
    for (let k = 0; k <= cnt; k++) {
      const i = Math.min(s.n - 1, k * step)
      const t = i / (s.n - 1)
      const x = s.from[0] + (s.to[0] - s.from[0]) * t
      const z = s.from[1] + (s.to[1] - s.from[1]) * t
      const h = r.heights[s.px(i)]
      pos.push(x, 0, z, x, 0, z)
      aH.push(h, h)
      aTop.push(1, 0)
      if (k < cnt) {
        const a = k * 2
        idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('aH', new THREE.Float32BufferAttribute(aH, 1))
    geo.setAttribute('aTop', new THREE.Float32BufferAttribute(aTop, 1))
    geo.setIndex(idx)
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9)
    const m = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: WALL_VERT,
        fragmentShader: WALL_FRAG,
        uniforms: { ...shared, uNormal: { value: s.normal }, uDepth: { value: SLAB_DEPTH } },
        side: THREE.DoubleSide,
      }),
    )
    m.frustumCulled = false
    g.add(m)
  }
  // underside
  const w = SLAB_W.x1 - SLAB_W.x0, h = SLAB_W.z1 - SLAB_W.z0
  const bottom = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0x1a1410 }))
  bottom.rotation.x = Math.PI / 2
  bottom.position.set((SLAB_W.x0 + SLAB_W.x1) / 2, -SLAB_DEPTH, (SLAB_W.z0 + SLAB_W.z1) / 2)
  g.add(bottom)
  return g
}

export function buildCloudSea(shared: Record<string, THREE.IUniform>): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(40000, 40000, 1, 1),
    new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: SEA_VERT,
      fragmentShader: SEA_FRAG,
      uniforms: { ...shared, uSlabBottom: { value: -SLAB_DEPTH } },
      depthWrite: true,
    }),
  )
  m.rotation.x = -Math.PI / 2
  m.position.y = -SLAB_DEPTH - 140
  m.frustumCulled = false
  return m
}

export function buildStars(): THREE.Points {
  const n = 2500
  const pos = new Float32Array(n * 3)
  const size = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1
    const th = Math.random() * Math.PI * 2
    const r = Math.sqrt(1 - u * u)
    pos.set([r * Math.cos(th), Math.abs(u) * 0.95 + 0.05, r * Math.sin(th)], i * 3)
    size[i] = Math.random() ** 3 * 2.2 + 0.6
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
  const m = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { uOpacity: { value: 0 }, uRadius: { value: 1000 } },
    vertexShader: /* glsl */ `
      attribute float aSize; uniform float uRadius; out float vS;
      void main() { vS = aSize; vec4 mv = modelViewMatrix * vec4(position * uRadius, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize; }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity; in float vS; layout(location = 0) out highp vec4 outColor;
      void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * uOpacity * min(1.0, vS / 1.5); outColor = vec4(vec3(0.85, 0.9, 1.0) * 2.0, a); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const p = new THREE.Points(g, m)
  p.frustumCulled = false
  return p
}

export type GateStatus = 'open' | 'likely' | 'check' | 'closed'
export interface Gate {
  id: string
  x: number
  y: number
  z: number
  status: GateStatus
}

const GATE_TINT: Record<GateStatus, THREE.Color> = {
  open: new THREE.Color(1.0, 0.85, 0.5),
  likely: new THREE.Color(1.0, 0.85, 0.5),
  check: new THREE.Color(1.0, 0.55, 0.15),
  closed: new THREE.Color(0.55, 0.8, 1.0),
}

/** A little stone-and-timber pass gate: two posts and a bar (lowered when the pass is shut in May). */
function gateGeometry(closed: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const post = (x: number) => new THREE.BoxGeometry(0.16, 1.1, 0.16).translate(x, 0.55, 0)
  parts.push(post(-0.55), post(0.55))
  parts.push(new THREE.BoxGeometry(0.3, 0.12, 0.3).translate(-0.55, 1.14, 0), new THREE.BoxGeometry(0.3, 0.12, 0.3).translate(0.55, 1.14, 0))
  if (closed) parts.push(new THREE.BoxGeometry(1.1, 0.1, 0.08).translate(0, 0.62, 0))
  else parts.push(new THREE.BoxGeometry(0.08, 0.9, 0.08).translate(0.55, 1.1, 0.12))
  let n = 0
  for (const p of parts) n += p.getAttribute('position').count
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3)
  const idx: number[] = []
  let o = 0
  for (const p of parts) {
    const pp = p.getAttribute('position'), nn = p.getAttribute('normal')
    pos.set(pp.array as Float32Array, o * 3)
    nor.set(nn.array as Float32Array, o * 3)
    for (const i of p.getIndex()!.array) idx.push(i + o)
    o += pp.count
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  g.setIndex(idx)
  return g
}

export class Gates {
  group = new THREE.Group()
  private shared: Record<string, THREE.IUniform>
  size: THREE.IUniform<number> = { value: 1 }
  constructor(shared: Record<string, THREE.IUniform>) {
    this.shared = shared
  }
  set(gates: Gate[]) {
    for (const c of [...this.group.children]) {
      const m = c as THREE.Mesh
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
      this.group.remove(m)
    }
    for (const closed of [false, true]) {
      const list = gates.filter((g) => (g.status === 'closed') === closed)
      if (!list.length) continue
      const base = gateGeometry(closed)
      const geo = new THREE.InstancedBufferGeometry()
      geo.index = base.index
      geo.setAttribute('position', base.getAttribute('position'))
      geo.setAttribute('normal', base.getAttribute('normal'))
      geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(list.flatMap((g) => [g.x, g.y, g.z])), 3))
      geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(new Float32Array(list.flatMap((g) => GATE_TINT[g.status].toArray())), 3))
      geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(new Float32Array(list.map(() => 1)), 1))
      geo.instanceCount = list.length
      const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: GATE_VERT, fragmentShader: GATE_FRAG, uniforms: { ...this.shared, uSize: this.size } }))
      m.frustumCulled = false
      this.group.add(m)
    }
  }
}
