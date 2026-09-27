import type { CountryCode, Source } from './types'

// Traffic peaks and school holidays that matter for May 2027. Public holidays are fetched live from
// Nager.Date (with a committed fallback in /public/data/holidays-2027.json).

export interface Peak {
  from: string
  to: string
  label: string
  countries: CountryCode[]
  severity: 'high' | 'medium'
  sources: Source[]
}

const kal = (s: string) => ({ label: 'kalenderpedia', url: `https://www.kalenderpedia.de/ferien/ferien-${s}-2027.html` })

export const PEAKS: Peak[] = [
  { from: '2027-05-05', to: '2027-05-09', label: 'Ascension bridge weekend (Thu 6 May holiday; Wed evening and Sun return are worst)', countries: ['DE', 'AT', 'CH', 'FR', 'BE', 'NL'], severity: 'high', sources: [{ label: 'timeanddate – Germany 2027', url: 'https://www.timeanddate.com/holidays/germany/2027' }] },
  { from: '2027-05-14', to: '2027-05-17', label: 'Whitsun weekend (Whit Monday 17 May) — heavy southbound Alpine traffic Fri–Sat, returns Mon', countries: ['DE', 'AT', 'CH', 'FR', 'BE', 'NL'], severity: 'high', sources: [{ label: 'timeanddate – Germany 2027', url: 'https://www.timeanddate.com/holidays/germany/2027' }] },
  { from: '2027-05-15', to: '2027-05-17', label: 'Austrian Pfingstferien (all states)', countries: ['AT'], severity: 'medium', sources: [{ label: 'BMB – Austrian school holidays 2026/27', url: 'https://www.bmb.gv.at/Themen/schule/schulpraxis/termine/ferientermine_26_27.html' }] },
  { from: '2027-05-18', to: '2027-05-28', label: 'Bavarian Pfingstferien — busy Alpine roads and lakes', countries: ['DE', 'AT', 'IT'], severity: 'medium', sources: [kal('bayern')] },
  { from: '2027-05-18', to: '2027-05-29', label: 'Baden-Württemberg Pfingstferien', countries: ['DE'], severity: 'medium', sources: [kal('baden-wuerttemberg')] },
  { from: '2027-05-26', to: '2027-05-30', label: 'Corpus Christi (Thu 27 May) bridge weekend', countries: ['DE', 'AT'], severity: 'high', sources: [{ label: 'timeanddate – Germany 2027', url: 'https://www.timeanddate.com/holidays/germany/2027' }] },
  { from: '2027-05-29', to: '2027-06-06', label: 'UK bank holiday (31 May) & half term (Hampshire 31 May–4 Jun) — busy Channel crossings', countries: ['GB', 'FR'], severity: 'medium', sources: [{ label: 'bank-holidays-uk', url: 'https://bank-holidays-uk.co.uk/bank-holidays-2027/' }, { label: 'Hampshire term dates', url: 'https://hellofred.ai/term-dates/hampshire' }] },
  { from: '2027-04-24', to: '2027-05-02', label: 'Dutch meivakantie', countries: ['NL', 'BE'], severity: 'medium', sources: [{ label: 'Rijksoverheid – meivakantie 2027', url: 'https://www.rijksoverheid.nl/themas/onderwijs/schoolvakanties/meivakantie/meivakantie-2027' }] },
]
