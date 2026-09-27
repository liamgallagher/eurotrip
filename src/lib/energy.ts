import type { Sample } from './legs'

// Physics-based energy model for a Tesla Model 3 RWD (LFP). Everything here is an ESTIMATE and is
// labelled so in the UI. Calibrated to published real-world figures: ~14–16 kWh/100 km at 110 km/h and
// ~18–22 kWh/100 km at 130 km/h (go-electra / EV Database), regen ≈ 55–60 % of braking energy on long descents.

export const CAR = {
  name: 'Tesla Model 3 RWD (LFP)',
  usableKWh: 57.5,
  massKg: 1765 + 180, // kerb + two people and luggage
  cdA: 0.23 * 2.22,
  crr: 0.0105,
  driveEff: 0.86, // battery → wheel
  regenEff: 0.58, // wheel → battery on descents
  maxRegenKW: 60,
  auxKW: 0.35, // electronics + mild HVAC
  sources: [
    { label: 'EV Specs Hub – Model 3 RWD LFP (57.5 kWh usable)', url: 'https://evspecshub.com/tesla-model-3-rwd-highland-2023-full-specs-range-battery/' },
    { label: 'EV Database – Model 3 RWD real-world range', url: 'https://ev-database.org/uk/car/1991/Tesla-Model-3-RWD' },
    { label: 'go-electra – consumption vs speed', url: 'https://www.go-electra.com/en/newsroom/tesla-model-3-range/' },
    { label: 'evkx.net – regen efficiency', url: 'https://evkx.net/technology/regen/calculations/' },
  ],
}

/** Typical mid-May daily mean temperature (°C) at sea level by latitude — rough climatology, estimate. */
export function mayTempSeaLevel(lat: number): number {
  // ~16 °C at 46°N (Ljubljana/Milan), ~13 °C at 51°N (Flanders/Kent)
  return 16 - (lat - 46) * 0.6
}

export interface EnergyTrace {
  /** cumulative kWh at each sample */
  kwh: number[]
  totalKWh: number
  regenKWh: number
  perKm: number
}

export function legEnergy(samples: Sample[], opts: { cruiseKmh: number }): EnergyTrace {
  const g = 9.81
  const kwh = [0]
  let total = 0
  let regen = 0
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i]
    const dx = (b.km - a.km) * 1000
    if (dx <= 0) { kwh.push(total); continue }
    // OSRM's motorway speeds (~100 km/h) are conservative; assume you cruise at your chosen cap on fast roads.
    const osrm = (a.spd + b.spd) / 2
    const vKmh = osrm >= 85 ? opts.cruiseKmh : Math.max(15, Math.min(opts.cruiseKmh, osrm))
    const v = vKmh / 3.6
    const dh = b.ele - a.ele
    const ele = (a.ele + b.ele) / 2
    const T = mayTempSeaLevel(b.lat) - 6.5 * (ele / 1000)
    const rho = 1.225 * (288.15 / (273.15 + T)) * Math.exp(-ele / 8400)
    const fRoll = CAR.massKg * g * CAR.crr
    const fAero = 0.5 * rho * CAR.cdA * v * v
    // stop-and-go / hairpin penalty on slow roads (acceleration losses)
    const slowFactor = vKmh < 60 ? 1.08 : 1
    const wheelJ = (fRoll + fAero) * dx * slowFactor + CAR.massKg * g * dh
    const dt = dx / v
    const auxKW = CAR.auxKW + 0.04 * Math.max(0, 14 - T) // heating when cold
    let battJ: number
    if (wheelJ >= 0) battJ = wheelJ / CAR.driveEff
    else {
      const recoverable = Math.max(wheelJ * CAR.regenEff, -CAR.maxRegenKW * 1000 * dt)
      battJ = recoverable
      regen += -recoverable / 3.6e6
    }
    battJ += auxKW * 1000 * dt
    total += battJ / 3.6e6
    kwh.push(total)
  }
  const km = samples.length ? samples[samples.length - 1].km : 0
  return { kwh, totalKWh: total, regenKWh: regen, perKm: km > 0 ? total / km : 0 }
}

/** Charging power (kW) vs state of charge for an LFP Model 3 on a 250 kW V3 site (approximate curve). */
export function chargePowerKW(socPct: number, siteKW = 250): number {
  const curve: [number, number][] = [[0, 150], [10, 170], [25, 150], [40, 120], [55, 95], [70, 70], [80, 50], [90, 32], [100, 12]]
  let p = curve[curve.length - 1][1]
  for (let i = 1; i < curve.length; i++) {
    if (socPct <= curve[i][0]) {
      const [x0, y0] = curve[i - 1], [x1, y1] = curve[i]
      p = y0 + ((y1 - y0) * (socPct - x0)) / (x1 - x0)
      break
    }
  }
  return Math.min(p, siteKW * (siteKW <= 150 ? 0.8 : 1)) // older 150 kW V2 sites share power between stalls
}

/** Minutes to charge from a → b % SoC. */
export function chargeMinutes(fromPct: number, toPct: number, siteKW = 250): number {
  let min = 0
  for (let s = fromPct; s < toPct; s += 1) {
    const kwh = CAR.usableKWh / 100
    min += (kwh / chargePowerKW(s + 0.5, siteKW)) * 60
  }
  return min
}
