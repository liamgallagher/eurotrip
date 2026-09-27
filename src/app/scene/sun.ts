import * as SunCalc from 'suncalc'
import * as THREE from 'three'

// Real sun position for a date, time and place (SunCalc), turned into the diorama's light and air colours.

export interface Light {
  dir: THREE.Vector3
  altitudeDeg: number
  azimuthDeg: number
  sunColor: THREE.Color
  skyAmb: THREE.Color
  groundAmb: THREE.Color
  fog: THREE.Color
  fogSun: THREE.Color
  night: number
}

/** Continental Europe in May is on CEST (UTC+2). */
export const CEST = 120

/** Date for local clock minutes (CEST) on an ISO day. */
export function localDate(iso: string, minutes: number, offsetMin = CEST): Date {
  const d = new Date(`${iso}T00:00:00Z`)
  return new Date(d.getTime() + (minutes - offsetMin) * 60000)
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const mix = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, t)

export function lightFor(date: Date, lat: number, lon: number): Light {
  const p = SunCalc.getPosition(date, lat, lon)
  // SunCalc v2: degrees, azimuth clockwise from north
  const alt = (p.altitude * Math.PI) / 180
  const az = (p.azimuth * Math.PI) / 180
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt)).normalize()
  const altDeg = p.altitude
  // 0 at the horizon → 1 by ~35°
  const high = smooth(-2, 35, altDeg)
  const day = smooth(-7, 3, altDeg)
  const golden = 1 - smooth(0, 14, Math.abs(altDeg - 4))

  const noon = new THREE.Color(1.0, 0.95, 0.88).multiplyScalar(3.0)
  const low = new THREE.Color(1.0, 0.5, 0.22).multiplyScalar(2.6)
  // a photographer's exposure: part-compensate the low sun so golden hour glows rather than goes murky
  const expo = 1 / Math.max(0.15, Math.sin(Math.max(alt, 0.02))) ** 0.4
  const sunColor = mix(low, noon, high).multiplyScalar(smooth(-3, 2, altDeg) * Math.min(2.4, expo))

  const skyDay = new THREE.Color(0.30, 0.40, 0.58)
  const skyDusk = new THREE.Color(0.22, 0.22, 0.36)
  const skyNight = new THREE.Color(0.02, 0.035, 0.08)
  const skyAmb = mix(skyNight, mix(skyDusk, skyDay, high), day)

  const gDay = new THREE.Color(0.16, 0.14, 0.11)
  const gNight = new THREE.Color(0.01, 0.012, 0.02)
  const groundAmb = mix(gNight, gDay, day)

  const fogDay = new THREE.Color(0.66, 0.76, 0.9)
  const fogDusk = new THREE.Color(0.55, 0.47, 0.6)
  const fogNight = new THREE.Color(0.02, 0.03, 0.07)
  const fog = mix(fogNight, mix(fogDusk, fogDay, high), day)
  const fogSun = mix(fog, new THREE.Color(1.0, 0.62, 0.36).multiplyScalar(1.1), 0.25 + golden * 0.65)

  return { dir, altitudeDeg: altDeg, azimuthDeg: p.azimuth, sunColor, skyAmb, groundAmb, fog, fogSun, night: 1 - day }
}

export function sunTimes(iso: string, lat: number, lon: number) {
  const t = SunCalc.getTimes(localDate(iso, 12 * 60), lat, lon)
  const toMin = (d: Date | null) => !d ? NaN : Math.round((d.getTime() - new Date(`${iso}T00:00:00Z`).getTime()) / 60000 + CEST)
  return { sunrise: toMin(t.sunrise), sunset: toMin(t.sunset), goldenHour: toMin(t.goldenHour) }
}
