import type { CountryCode, Source } from './types'

// Tolls, vignettes, crossings and charging prices. All figures are 2026 unless stated —
// 2027 rates are mostly unpublished. Everything here is shown in the app with its source and date.

export const COSTS_CHECKED = '2026-09-27'

export interface FixedToll {
  id: string
  name: string
  country: CountryCode
  eur: number
  /** Return price if cheaper when both directions use it within validity. */
  returnEur?: number
  returnValidDays?: number
  /** Detect on a leg by OSRM step name (regex, case-insensitive) … */
  names?: string[]
  /** … or by passing within `radiusM` of a point. */
  near?: { lat: number; lon: number; radiusM: number }
  note?: string
  estimate?: boolean
  sources: Source[]
}

export const FIXED_TOLLS: FixedToll[] = [
  {
    id: 'grossglockner', name: 'Grossglockner High Alpine Road (EV day ticket)', country: 'AT', eur: 40,
    names: ['glockner'], near: { lat: 47.0830, lon: 12.8420, radiusM: 400 },
    note: '€46.50 standard; €40 for pure-electric cars (2026).',
    sources: [{ label: 'Heiligenblut – Grossglockner tolls', url: 'https://heiligenblut.at/en/grossglockner-hochalpenstrasse/' }, { label: 'Nomad Epicureans – 2026 tolls', url: 'https://www.nomadepicureans.com/europe/austria/grossglockner-high-alpine-road-2026-tolls-stops-viewpoints/' }],
  },
  {
    id: 'nockalm', name: 'Nockalm Road (EV)', country: 'AT', eur: 20, names: ['nockalm'], near: { lat: 46.8770, lon: 13.8050, radiusM: 1500 },
    note: '€25 standard; €20 EV (2026).',
    sources: [{ label: 'Autorevue – Nockalmstraße', url: 'https://www.autorevue.at/ratgeber/nockalmstrasse' }, { label: 'Nockalmstraße – prices', url: 'https://www.nockalmstrasse.at/en/for-your-visit/prices-opening-hours' }],
  },
  {
    id: 'rossfeld', name: 'Rossfeld Panoramastraße', country: 'DE', eur: 9.5, names: ['ro(ss|ß)feld'], near: { lat: 47.6150, lon: 13.0510, radiusM: 1500 },
    sources: [{ label: 'Rossfeld Panoramastraße – info', url: 'https://www.rossfeldpanoramastrasse.de/informationen/' }],
  },
  {
    id: 'gerlos', name: 'Gerlos Alpine Road (e-car day ticket)', country: 'AT', eur: 12, names: ['gerlos(straße|strasse| alpenstra)'], near: { lat: 47.2460, lon: 12.1100, radiusM: 2000 },
    sources: [{ label: 'Gerlosstraße – prices', url: 'https://www.gerlosstrasse.at/en/for-your-visit/prices-opening-hours' }],
  },
  {
    id: 'montblanc', name: 'Mont Blanc Tunnel', country: 'FR', eur: 55.5, returnEur: 70.4, returnValidDays: 7,
    names: ['mont-blanc', 'monte bianco'], near: { lat: 45.8650, lon: 6.9100, radiusM: 1200 },
    note: 'Sources conflict (one quotes €36.70). Return ticket valid 7 days — not useful for this trip.', estimate: true,
    sources: [{ label: 'TMB – tolls', url: 'https://www.tunnelmb.net/en-US/vehicles-classification-and-tolls' }, { label: 'alps2alps – Mont Blanc tunnel 2026', url: 'https://www.alps2alps.com/blog/crossing-the-mont-blanc-tunnel-in-2026-rules-costs-and-transfer-tips' }],
  },
  {
    id: 'arlbergtunnel', name: 'Arlberg road tunnel', country: 'AT', eur: 13, names: ['arlbergtunnel', 'arlberg-straßentunnel', 'arlberg-strassentunnel'],
    sources: [{ label: 'Pressefeuer – ASFINAG 2026 tolls', url: 'https://pressefeuer.at/news/asfinag-erhoeht-mautpreise-das-kostet-autofahren-ab-2026-134' }],
  },
  {
    id: 'karawanken', name: 'Karawanken tunnel', country: 'AT', eur: 9, names: ['karawanken'],
    sources: [{ label: 'Pressefeuer – ASFINAG 2026 tolls', url: 'https://pressefeuer.at/news/asfinag-erhoeht-mautpreise-das-kostet-autofahren-ab-2026-134' }],
  },
  {
    id: 'tauern', name: 'A10 Tauern & Katschberg tunnels', country: 'AT', eur: 15, names: ['tauerntunnel', 'katschbergtunnel'],
    sources: [{ label: 'Pressefeuer – ASFINAG 2026 tolls', url: 'https://pressefeuer.at/news/asfinag-erhoeht-mautpreise-das-kostet-autofahren-ab-2026-134' }],
  },
  {
    id: 'felbertauern', name: 'Felbertauern tunnel', country: 'AT', eur: 13.5, names: ['felbertauern'],
    sources: [{ label: 'mautgebuhren.de – Felbertauern', url: 'https://mautgebuhren.de/felbertauerntunnel/' }],
  },
  {
    id: 'brenner', name: 'A13 Brenner motorway', country: 'AT', eur: 12.5, names: ['brenner autobahn', 'brennerautobahn'],
    note: 'Single trip, 2026. The old B182 pass road is toll-free.',
    sources: [{ label: 'ADAC – A13 Brenner section toll', url: 'https://www.adac.de/fahrzeugwelt/maut-vignette/oesterreich/maut-oesterreich-kaufen/digitale-streckenmaut-a13-brenner/' }, { label: 'Autopay – Brenner Maut 2026', url: 'https://autopay.de/blog/brenner-autobahn-kosten-und-mautgebuhren' }],
  },
]

export interface Vignette {
  country: CountryCode
  name: string
  options: { label: string; days: number; eur: number }[]
  note: string
  buyUrl: string
  sources: Source[]
  exemptEv?: boolean
}

export const VIGNETTES: Vignette[] = [
  {
    country: 'AT', name: 'Austrian digital vignette',
    options: [{ label: '1-day', days: 1, eur: 9.6 }, { label: '10-day', days: 10, eur: 12.8 }],
    note: 'Buy from ASFINAG. 1-day and 10-day digital vignettes are valid immediately; online 2-month/annual ones only from the 18th day after purchase.',
    buyUrl: 'https://shop.asfinag.at/en/',
    sources: [{ label: 'fuel-prices.eu – Austria (checked 18 Apr 2026)', url: 'https://www.fuel-prices.eu/vignette/austria/' }, { label: 'ASFINAG – validity', url: 'https://help.asfinag.at/en/vignette-and-section-tolls/validity/' }],
  },
  {
    country: 'CH', name: 'Swiss motorway e-vignette 2027',
    options: [{ label: 'Annual (CHF 40)', days: 430, eur: 43 }],
    note: 'CHF 40; the 2027 vignette goes on sale 1 Dec 2026 and runs to 31 Jan 2028. The 2026 one expires 31 Jan 2027. EUR shown is an estimate.',
    buyUrl: 'https://via.admin.ch/',
    sources: [{ label: 'ch.ch – motorway vignette', url: 'https://www.ch.ch/en/travel-and-emigrate/holidays-in-switzerland/how-to-behave-in-road-traffic/motorway-vignette/' }, { label: 'BAZG – e-vignette', url: 'https://www.bazg.admin.ch/en/electronic-vignette-via-portal-purchase' }],
  },
  {
    country: 'SI', name: 'Slovenian e-vinjeta',
    options: [{ label: '7-day', days: 7, eur: 16 }, { label: '1-month', days: 30, eur: 32 }],
    note: 'Needed for Slovenian motorways on the way in and out .',
    buyUrl: 'https://evinjeta.dars.si/',
    sources: [{ label: 'fuel-prices.eu – Slovenia', url: 'https://www.fuel-prices.eu/vignette/slovenia/' }],
  },
  {
    country: 'CZ', name: 'Czech e-vignette (EV exemption)', exemptEv: true,
    options: [{ label: 'EV exemption', days: 365, eur: 0 }],
    note: 'Battery-electric cars are exempt, but foreign EVs must register the exemption at edalnice.gov.cz before using a motorway. (10-day would be CZK 300 otherwise.)',
    buyUrl: 'https://edalnice.gov.cz/en/exemption',
    sources: [{ label: 'edalnice.gov.cz – exemptions', url: 'https://edalnice.gov.cz/en/exemption' }, { label: 'tolls.eu – Czechia', url: 'https://www.tolls.eu/czechia' }],
  },
]

/** Distance-based motorway tolls, estimated from km on A-roads in each country. */
export const PER_KM_TOLLS: { country: CountryCode; eurPerKm: number; range: string; note: string; sources: Source[] }[] = [
  { country: 'FR', eurPerKm: 0.1, range: '€0.095–0.104/km', note: 'Estimated from km on A-roads, excluding known toll-free sections (A25, A31, A33, A35, A330). Treat as approximate.', sources: [{ label: 'fuel-prices.eu – France tolls', url: 'https://www.fuel-prices.eu/tolls/france/' }] },
  { country: 'IT', eurPerKm: 0.08, range: '€0.07–0.09/km', note: '+1.46% in 2026. Estimate.', sources: [{ label: 'tolls.eu – Italy', url: 'https://www.tolls.eu/italy' }] },
]

export interface Crossing {
  id: 'tunnel' | 'ferry'
  name: string
  from: string
  to: string
  /** Hours from arriving at the port to driving away on the other side. */
  hours: number
  gbpEach: number
  gbpRange: string
  overnight: boolean
  note: string
  sources: Source[]
  estimate: boolean
}

export const CROSSINGS: Record<'tunnel' | 'ferry', Crossing> = {
  tunnel: {
    id: 'tunnel', name: 'Eurotunnel Le Shuttle', from: 'folkestone', to: 'calais', hours: 1.75, gbpEach: 150, gbpRange: 'from £69; typically £104–229 each way in May',
    overnight: false, note: 'Check-in closes 1 h before departure; 35-min crossing. France is 1 h ahead.',
    sources: [{ label: 'LeShuttle – on the day', url: 'https://www.leshuttle.com/uk-en/travelling-with-us/before-you-go/on-the-day' }, { label: 'eurotunnelcost.com', url: 'https://www.eurotunnelcost.com/' }],
    estimate: true,
  },
  ferry: {
    id: 'ferry', name: 'Brittany Ferries Portsmouth–Caen (overnight)', from: 'portsmouth', to: 'caen', hours: 8, gbpEach: 330, gbpRange: 'from £114 car + 2; ~£250–450 with a cabin (estimate)',
    overnight: true, note: 'Departs ~23:00, arrives 06:45–07:30. Cabin or reserved seat required at night. Adds a night on board.',
    sources: [{ label: 'Brittany Ferries – Portsmouth–Caen', url: 'https://www.brittany-ferries.co.uk/ferry-routes/ferries-france/portsmouth-caen/about' }, { label: 'portsmouthtocaen.co.uk', url: 'https://portsmouthtocaen.co.uk/ferry-information/' }],
    estimate: true,
  },
}

export const GBP_TO_EUR = 1.16 // approximate, labelled estimate in the UI

/** Tesla owner Supercharger prices €/kWh (mid-points of 2025/26 ranges; dynamic by site/time). */
export const SC_PRICE: Partial<Record<CountryCode, { eur: number; range: string; source: Source }>> = {
  FR: { eur: 0.42, range: '€0.32–0.48 (peaks higher)', source: { label: 'meilleurecharge.fr', url: 'https://www.meilleurecharge.fr/operateur/tesla-supercharger' } },
  DE: { eur: 0.37, range: '€0.20–0.39', source: { label: 'teslamag.de – Sep 2026 price cuts', url: 'https://teslamag.de/news/tesla-senkt-deutsche-supercharger-preise-breite-front-ab-20-cent-kwh-67295' } },
  AT: { eur: 0.39, range: '€0.34–0.43', source: { label: 'chargecompass – Austria', url: 'https://chargecompass.app/tesla-supercharger-prices-austria' } },
  CH: { eur: 0.45, range: 'CHF 0.30–0.53', source: { label: 'shop4tesla – CH prices', url: 'https://www.shop4tesla.com/en/blogs/news/senkung-der-preise-am-tesla-supercharger-auf-teilweise-unter-0-40' } },
  IT: { eur: 0.45, range: '€0.38–0.50', source: { label: 'elettronauti – tariffe', url: 'https://elettronauti.it/tesla-supercharger-tariffe-aggiornate/' } },
  SI: { eur: 0.42, range: '€0.35–0.50', source: { label: 'renttesla.si', url: 'https://renttesla.si/tesla-supercharger-slovenia.html' } },
  NL: { eur: 0.4, range: '€0.27–0.50', source: { label: 'tesla-referralgids.nl', url: 'https://tesla-referralgids.nl/blog/supercharger-prijs-per-kwh-checklist/' } },
  BE: { eur: 0.45, range: 'weak data (~€0.45–0.60)', source: { label: 'egear.be', url: 'https://www.egear.be/tesla-supercharger-prijs/' } },
  CZ: { eur: 0.4, range: 'estimate', source: { label: 'estimate', url: 'https://www.tesla.com/findus' } },
  LU: { eur: 0.4, range: 'estimate', source: { label: 'estimate', url: 'https://www.tesla.com/findus' } },
  LI: { eur: 0.45, range: 'estimate', source: { label: 'estimate', url: 'https://www.tesla.com/findus' } },
}
export const SC_PRICE_DEFAULT = 0.42
/** Hotel destination charging — often free for guests; allowance per night (estimate). */
export const HOTEL_CHARGE_EUR_PER_NIGHT = 8
