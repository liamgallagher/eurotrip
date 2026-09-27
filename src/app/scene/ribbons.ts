import * as THREE from 'three'
import { heightUnits, worldX, worldZ } from './proj'
import { RIBBON_FRAG, RIBBON_VERT } from './shaders'

// Route ribbons. A track is one continuous line (a day, a whole direction, a preview) with per-point data.

export interface TrackPoint {
  lon: number
  lat: number
  /** metres */
  ele: number
  /** km from the start of this track (drives the pulse and the draw-on animation) */
  km: number
  soc?: number
  grade?: number
  tunnel?: boolean
  driven?: boolean
}

export interface Track {
  id: string
  points: TrackPoint[]
  color: THREE.ColorRepresentation
  opacity?: number
  /** px */
  width?: number
  /** offset added to km so a sequence of days draws on continuously */
  kmOffset?: number
}

export type RibbonMode = 0 | 1 | 2

export class Ribbons {
  group = new THREE.Group()
  private meshes = new Map<string, { solid: THREE.Mesh; xray: THREE.Mesh }>()
  private shared: Record<string, THREE.IUniform>
  uniforms: {
    uRes: THREE.IUniform<THREE.Vector2>
    uLift: THREE.IUniform<number>
    uMode: THREE.IUniform<number>
    uDraw: THREE.IUniform<number>
    uPulse: THREE.IUniform<number>
  }

  constructor(shared: Record<string, THREE.IUniform>) {
    this.shared = shared
    this.uniforms = {
      uRes: { value: new THREE.Vector2(1, 1) },
      uLift: { value: 0.1 },
      uMode: { value: 0 },
      uDraw: { value: 1e5 },
      uPulse: { value: 1 },
    }
    this.group.renderOrder = 10
  }

  private material(xray: boolean, width: number, opacity: number) {
    return new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: RIBBON_VERT,
      fragmentShader: RIBBON_FRAG,
      uniforms: {
        ...this.shared,
        ...this.uniforms,
        uWidth: { value: width },
        uXray: { value: xray ? 1 : 0 },
        uOpacity: { value: opacity },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      depthFunc: xray ? THREE.GreaterDepth : THREE.LessEqualDepth,
      blending: THREE.NormalBlending,
    })
  }

  static geometry(t: Track): THREE.BufferGeometry {
    const pts = t.points
    const n = pts.length
    const P = new Float32Array(n * 2 * 3)
    const col = new THREE.Color(t.color)
    const pos: THREE.Vector3[] = pts.map((p) => new THREE.Vector3(worldX(p.lon), heightUnits(p.ele, p.lat), worldZ(p.lat)))
    const prev = new Float32Array(n * 6)
    const next = new Float32Array(n * 6)
    const side = new Float32Array(n * 2)
    const along = new Float32Array(n * 2)
    const color = new Float32Array(n * 8)
    const soc = new Float32Array(n * 2)
    const grade = new Float32Array(n * 2)
    const driven = new Float32Array(n * 2)
    const tunnel = new Float32Array(n * 2)
    const off = t.kmOffset ?? 0
    for (let i = 0; i < n; i++) {
      const a = pos[Math.max(0, i - 1)], c = pos[i], b = pos[Math.min(n - 1, i + 1)]
      // extend endpoints so the direction is defined
      const pa = i === 0 ? c.clone().multiplyScalar(2).sub(b) : a
      const pb = i === n - 1 ? c.clone().multiplyScalar(2).sub(a) : b
      for (let s = 0; s < 2; s++) {
        const k = i * 2 + s
        P.set([c.x, c.y, c.z], k * 3)
        prev.set([pa.x, pa.y, pa.z], k * 3)
        next.set([pb.x, pb.y, pb.z], k * 3)
        side[k] = s ? 1 : -1
        along[k] = pts[i].km + off
        color.set([col.r, col.g, col.b, 1], k * 4)
        soc[k] = pts[i].soc ?? 80
        grade[k] = pts[i].grade ?? 0
        driven[k] = pts[i].driven ? 1 : 0
        tunnel[k] = pts[i].tunnel ? 1 : 0
      }
    }
    const idx: number[] = []
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3
      idx.push(a, c, b, b, c, d)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(P, 3))
    g.setAttribute('aPrev', new THREE.BufferAttribute(prev, 3))
    g.setAttribute('aNext', new THREE.BufferAttribute(next, 3))
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1))
    g.setAttribute('aAlong', new THREE.BufferAttribute(along, 1))
    g.setAttribute('aColor', new THREE.BufferAttribute(color, 4))
    g.setAttribute('aSoc', new THREE.BufferAttribute(soc, 1))
    g.setAttribute('aGrade', new THREE.BufferAttribute(grade, 1))
    g.setAttribute('aDriven', new THREE.BufferAttribute(driven, 1))
    g.setAttribute('aTunnel', new THREE.BufferAttribute(tunnel, 1))
    g.setIndex(idx)
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9)
    return g
  }

  /** Replace all tracks with this set (by id; unchanged ids keep their GPU buffers). */
  set(tracks: Track[], signature: (t: Track) => string = (t) => `${t.id}:${t.points.length}:${t.color}:${t.width}:${t.opacity}:${t.kmOffset}:${t.points.filter((p) => p.driven).length}`) {
    const want = new Map(tracks.map((t) => [signature(t), t]))
    for (const [sig, m] of this.meshes) {
      if (!want.has(sig)) {
        this.group.remove(m.solid, m.xray)
        m.solid.geometry.dispose()
        ;(m.solid.material as THREE.Material).dispose()
        ;(m.xray.material as THREE.Material).dispose()
        this.meshes.delete(sig)
      }
    }
    for (const [sig, t] of want) {
      if (this.meshes.has(sig) || t.points.length < 2) continue
      const g = Ribbons.geometry(t)
      const solid = new THREE.Mesh(g, this.material(false, t.width ?? 5, t.opacity ?? 1))
      const xray = new THREE.Mesh(g, this.material(true, t.width ?? 5, t.opacity ?? 1))
      solid.frustumCulled = xray.frustumCulled = false
      solid.renderOrder = 11
      xray.renderOrder = 10
      this.group.add(xray, solid)
      this.meshes.set(sig, { solid, xray })
    }
  }
}
