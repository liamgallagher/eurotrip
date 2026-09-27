// Fallback snapshot of 2027 public holidays (Nager.Date) and May school holidays (OpenHolidays API).
// The app fetches these live; this file is used when offline.
// Usage: npm run data:holidays [-- --year=2027]
import { writeFileSync } from 'node:fs'

const year = Number(process.argv.find((a) => a.startsWith('--year='))?.split('=')[1] ?? 2027)
const COUNTRIES = ['GB', 'FR', 'BE', 'NL', 'LU', 'DE', 'CH', 'LI', 'AT', 'IT', 'SI', 'CZ', 'HR']
const pub: Record<string, unknown> = {}
for (const cc of COUNTRIES) {
  const r = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${cc}`)
  pub[cc] = r.ok ? await r.json() : []
}
const school: Record<string, unknown> = {}
for (const cc of ['DE', 'AT', 'CH', 'NL', 'BE', 'FR', 'IT', 'SI', 'CZ', 'LU']) {
  const r = await fetch(`https://openholidaysapi.org/SchoolHolidays?countryIsoCode=${cc}&languageIsoCode=EN&validFrom=${year}-04-15&validTo=${year}-06-15`)
  school[cc] = r.ok ? await r.json() : []
}
writeFileSync(`public/data/holidays-${year}.json`, JSON.stringify({ year, fetchedAt: new Date().toISOString(), sources: ['https://date.nager.at', 'https://openholidaysapi.org'], public: pub, school }))
console.log('holidays written', Object.fromEntries(Object.entries(pub).map(([k, v]) => [k, (v as unknown[]).length])), Object.fromEntries(Object.entries(school).map(([k, v]) => [k, (v as unknown[]).length])))
