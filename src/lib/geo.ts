export type LngLat = [number, number]

const R = 6371008.8
const toRad = (d: number) => (d * Math.PI) / 180

export function haversine(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

/** Fast planar distance (m) — fine for < ~50 km comparisons. */
export function fastDist(a: LngLat, b: LngLat): number {
  const x = toRad(b[0] - a[0]) * Math.cos(toRad((a[1] + b[1]) / 2))
  const y = toRad(b[1] - a[1])
  return Math.sqrt(x * x + y * y) * R
}

export function cumulative(coords: LngLat[]): number[] {
  const out = new Array<number>(coords.length)
  out[0] = 0
  for (let i = 1; i < coords.length; i++) out[i] = out[i - 1] + haversine(coords[i - 1], coords[i])
  return out
}

/** Binary-search interpolation of a point at distance d (m) along a line. */
export function pointAt(coords: LngLat[], cum: number[], d: number): LngLat {
  if (d <= 0) return coords[0]
  const last = cum.length - 1
  if (d >= cum[last]) return coords[last]
  let lo = 0
  let hi = last
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (cum[mid] <= d) lo = mid
    else hi = mid
  }
  const seg = cum[hi] - cum[lo] || 1
  const t = (d - cum[lo]) / seg
  return [coords[lo][0] + (coords[hi][0] - coords[lo][0]) * t, coords[lo][1] + (coords[hi][1] - coords[lo][1]) * t]
}

export function bearing(a: LngLat, b: LngLat): number {
  const y = Math.sin(toRad(b[0] - a[0])) * Math.cos(toRad(b[1]))
  const x = Math.cos(toRad(a[1])) * Math.sin(toRad(b[1])) - Math.sin(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.cos(toRad(b[0] - a[0]))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/** Nearest vertex-ish position along a sampled polyline. Returns index and distance (m). */
export function nearestIndex(points: LngLat[], p: LngLat): { index: number; dist: number } {
  let best = Infinity
  let idx = 0
  for (let i = 0; i < points.length; i++) {
    const d = fastDist(points[i], p)
    if (d < best) {
      best = d
      idx = i
    }
  }
  return { index: idx, dist: best }
}

/** Douglas–Peucker simplification (tolerance in metres, planar approximation). */
export function simplify(coords: LngLat[], tolM: number): LngLat[] {
  if (coords.length < 3) return coords.slice()
  const keep = new Uint8Array(coords.length)
  keep[0] = keep[coords.length - 1] = 1
  const lat0 = toRad(coords[0][1])
  const k = Math.cos(lat0) * R
  const px = (c: LngLat) => toRad(c[0]) * k
  const py = (c: LngLat) => toRad(c[1]) * R
  const stack: [number, number][] = [[0, coords.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const ax = px(coords[a]), ay = py(coords[a]), bx = px(coords[b]), by = py(coords[b])
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy || 1
    let maxD = 0
    let maxI = -1
    for (let i = a + 1; i < b; i++) {
      const cx = px(coords[i]), cy = py(coords[i])
      let t = ((cx - ax) * dx + (cy - ay) * dy) / len2
      t = Math.max(0, Math.min(1, t))
      const ex = ax + t * dx - cx, ey = ay + t * dy - cy
      const d = ex * ex + ey * ey
      if (d > maxD) {
        maxD = d
        maxI = i
      }
    }
    if (maxI >= 0 && maxD > tolM * tolM) {
      keep[maxI] = 1
      stack.push([a, maxI], [maxI, b])
    }
  }
  return coords.filter((_, i) => keep[i])
}

/** Stable short hash for cache keys (FNV-1a, 2×32 bit). */
export function hashString(s: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193 ^ 0x5bd1e995
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) ^ (h2 >>> 15)
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36)
}

export function bboxOf(coords: LngLat[]): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of coords) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return [minX, minY, maxX, maxY]
}
