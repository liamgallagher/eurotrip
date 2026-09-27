import type { CountryCode } from '../data/types'

// Point-in-country lookup using simplified Natural Earth 1:50m polygons (public/data/countries.json).
// Accuracy near borders is ~1 km — good enough for "which countries do we pass through".

type Ring = [number, number][]
export interface CountryShape {
  cc: CountryCode | string
  name: string
  bbox: [number, number, number, number]
  polys: Ring[][] // polygons → rings (first = outer)
}

export class CountryIndex {
  shapes: CountryShape[]
  constructor(shapes: CountryShape[]) {
    this.shapes = shapes
  }

  lookup(lon: number, lat: number, hint?: string): string | null {
    if (hint) {
      const s = this.shapes.find((x) => x.cc === hint)
      if (s && inShape(s, lon, lat)) return s.cc
    }
    for (const s of this.shapes) if (inShape(s, lon, lat)) return s.cc
    return null
  }
}

function inShape(s: CountryShape, lon: number, lat: number): boolean {
  const [a, b, c, d] = s.bbox
  if (lon < a || lon > c || lat < b || lat > d) return false
  for (const poly of s.polys) {
    if (!inRing(poly[0], lon, lat)) continue
    let hole = false
    for (let i = 1; i < poly.length; i++) if (inRing(poly[i], lon, lat)) hole = true
    if (!hole) return true
  }
  return false
}

function inRing(ring: Ring, x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export const COUNTRY_NAMES: Record<string, string> = {
  GB: 'United Kingdom', FR: 'France', BE: 'Belgium', NL: 'Netherlands', LU: 'Luxembourg', DE: 'Germany',
  CH: 'Switzerland', LI: 'Liechtenstein', AT: 'Austria', IT: 'Italy', SI: 'Slovenia', CZ: 'Czechia', HR: 'Croatia',
}

export const FLAGS: Record<string, string> = {
  GB: '🇬🇧', FR: '🇫🇷', BE: '🇧🇪', NL: '🇳🇱', LU: '🇱🇺', DE: '🇩🇪', CH: '🇨🇭', LI: '🇱🇮', AT: '🇦🇹', IT: '🇮🇹', SI: '🇸🇮', CZ: '🇨🇿', HR: '🇭🇷',
}
