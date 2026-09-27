import type { CountryCode, Source } from './types'

export interface CheckItem {
  id: string
  group: 'Documents' | 'Car & kit' | 'Stickers & tolls' | 'Bookings' | 'Tesla & charging'
  text: string
  detail?: string
  /** Only relevant if the plan passes through one of these countries. */
  countries?: CountryCode[]
  sources?: Source[]
}

export const CHECKLIST: CheckItem[] = [
  // Documents
  { id: 'passports', group: 'Documents', text: 'Passports valid ≥3 months after return and issued <10 years ago', sources: [{ label: 'GOV.UK – travelling to the EU', url: 'https://www.gov.uk/visit-europe-1-january-2021' }] },
  { id: 'ees', group: 'Documents', text: 'EU Entry/Exit System: expect fingerprints + photo at the border on first entry', detail: 'Done at Folkestone/Calais or the port — allow extra time.', sources: [{ label: 'GOV.UK – EES', url: 'https://www.gov.uk/guidance/entryexit-system-ees-what-you-need-to-know' }] },
  { id: 'etias', group: 'Documents', text: 'Check whether ETIAS (€20) is required by May 2027', detail: 'As of Sep 2026, ETIAS was not operating; launch pushed to 2027 with a transition period. Re-check early 2027.', sources: [{ label: 'VisaHQ – ETIAS pushed to 2027', url: 'https://www.visahq.com/news/2026-05-30/gb/etias-start-date-pushed-to-2027-what-uk-travellers-need-to-know-now/' }] },
  { id: 'licence', group: 'Documents', text: 'Both photocard driving licences', detail: 'No IDP needed for UK photocard licences in these countries.' },
  { id: 'v5c', group: 'Documents', text: 'V5C logbook (original) and insurance certificate' },
  { id: 'insurance', group: 'Documents', text: 'Insurance: add your fiancée as a named driver and confirm EU cover for the whole trip' },
  { id: 'breakdown', group: 'Documents', text: 'European breakdown cover that handles EVs (flatbed recovery)' },
  { id: 'ghic', group: 'Documents', text: 'GHIC cards + travel insurance', sources: [{ label: 'NHS – GHIC', url: 'https://www.nhs.uk/using-the-nhs/healthcare-abroad/apply-for-a-free-uk-global-health-insurance-card-ghic/' }] },

  // Stickers & tolls
  { id: 'uk-id', group: 'Stickers & tolls', text: 'UK identifier: number plates with "UK" are enough; otherwise a UK sticker. Remove or cover any GB sticker.', sources: [{ label: 'RAC – UK sticker', url: 'https://www.rac.co.uk/drive/news/motoring-news/gb-car-sticker-to-be-replaced-by-new-uk-version/' }] },
  { id: 'critair', group: 'Stickers & tolls', text: "Crit'Air 0 (green, electric) sticker for French low-emission zones", detail: 'Order only from the official site (about €4 incl. postage). The plan to abolish ZFEs was struck down in May 2026.', countries: ['FR'], sources: [{ label: 'Official Crit\'Air site', url: 'https://www.certificat-air.gouv.fr/en/' }, { label: 'francestickers – Crit\'Air status', url: 'https://francestickers.co.uk/guide/critair-abolished' }] },
  { id: 'umwelt', group: 'Stickers & tolls', text: 'German Umweltplakette (green) — required for Umweltzonen even for EVs', detail: 'Fine €100. Order from a TÜV/DEKRA site.', countries: ['DE'], sources: [{ label: 'Eurocampings – German emission stickers', url: 'https://www.eurocampings.co.uk/blog/listing/german-emissions-stickers/' }] },
  { id: 'vig-at', group: 'Stickers & tolls', text: 'Austrian digital vignette (10-day valid immediately)', countries: ['AT'], sources: [{ label: 'ASFINAG shop', url: 'https://shop.asfinag.at/en/' }] },
  { id: 'vig-ch', group: 'Stickers & tolls', text: 'Swiss 2027 e-vignette (on sale from 1 Dec 2026)', countries: ['CH', 'LI'], sources: [{ label: 'via.admin.ch', url: 'https://via.admin.ch/' }] },
  { id: 'vig-si', group: 'Stickers & tolls', text: 'Slovenian e-vinjeta (7-day or 1-month)', countries: ['SI'], sources: [{ label: 'DARS e-vinjeta', url: 'https://evinjeta.dars.si/' }] },
  { id: 'vig-cz', group: 'Stickers & tolls', text: 'Czech motorway: register the EV exemption online before entering', countries: ['CZ'], sources: [{ label: 'edalnice.gov.cz', url: 'https://edalnice.gov.cz/en/exemption' }] },
  { id: 'ztl', group: 'Stickers & tolls', text: 'Italy: never drive into a ZTL unless your hotel registers the plate', detail: 'Camera fines of €80–100+ per gate arrive months later. Cortina, Aosta, Verona, Como, Bellagio, Bergamo, Trieste all have ZTLs.', countries: ['IT'], sources: [{ label: 'tyremap – Italy ZTL fines', url: 'https://tyremap.com/guides/italy-ztl-fines/' }] },

  // Car & kit
  { id: 'beam', group: 'Car & kit', text: 'Headlight beam for driving on the right', detail: 'Tesla adaptive/LED units generally need no deflectors — confirm for your car (service menu or Tesla service).' },
  { id: 'hivis', group: 'Car & kit', text: 'Hi-vis vests for both of you (inside the cabin)', detail: 'Compulsory in FR, IT, AT, BE, SI and others.' },
  { id: 'triangle', group: 'Car & kit', text: 'Warning triangle' },
  { id: 'firstaid', group: 'Car & kit', text: 'First-aid kit (compulsory in Austria)', countries: ['AT'] },
  { id: 'dashcam', group: 'Car & kit', text: 'Dashcam/Sentry use is heavily restricted in Austria and Switzerland — consider disabling recording there', countries: ['AT', 'CH'] },
  { id: 'speedcams', group: 'Car & kit', text: 'Turn off speed-camera alerts in phone apps (illegal in France, Germany, Switzerland)' },

  // Tesla & charging
  { id: 'type2', group: 'Tesla & charging', text: 'Pack your own Type 2 cable — many hotel chargers are untethered' },
  { id: 'sc-app', group: 'Tesla & charging', text: 'Tesla app payment works abroad; check Supercharger prices in-app (dynamic by time of day)' },
  { id: 'hotels-charge', group: 'Tesla & charging', text: 'Confirm destination charging at every hotel (email ahead — ask for a guaranteed bay)' },

  // Bookings
  { id: 'crossing', group: 'Bookings', text: 'Eurotunnel (or Portsmouth–Caen ferry with cabin)' },
  { id: 'neuschwanstein', group: 'Bookings', text: 'Neuschwanstein timed tickets (Route 1)', sources: [{ label: 'Hohenschwangau ticket centre', url: 'https://www.hohenschwangau.de/en/visitor-information-2-2' }] },
  { id: 'venice-fee', group: 'Bookings', text: 'Venice: register for the access-fee exemption as an overnight guest; book mainland parking (Route 2)', sources: [{ label: 'cda.ve.it FAQ', url: 'https://cda.ve.it/en/faq' }] },
  { id: 'vintgar', group: 'Bookings', text: 'Vintgar Gorge timed ticket (Slovenia)', sources: [{ label: 'vintgar.si', url: 'https://www.vintgar.si/en/my-visit/opening-hours/' }] },
  { id: 'dolomites-hotels', group: 'Bookings', text: 'Dolomites hotels: confirm they are open in mid-May (Routes 3 & 7)' },
]
