import type { Exclusion, Highlight } from './types'
import { LAST_CHECKED } from './highlights'

// "Considered but excluded" — visible in the app, each with a reason and (where sensible) a way to put it back.

const wp = (t: string) => ({ label: 'Wikipedia', url: `https://en.wikipedia.org/wiki/${t.replace(/ /g, '_')}` })
const ALPEN = (slug: string, name: string) => ({ label: `alpen-paesse.ch – ${name}`, url: `https://alpen-paesse.ch/en/alpenpaesse/${slug}/` })
const ADAC = { label: 'ADAC – Alpine pass winter closures', url: 'https://www.adac.de/news/reise-wintersperren-alpen/' }

export const EXCLUSIONS: Exclusion[] = [
  // Your exclusions
  { id: 'x-paris', name: 'Paris (overnight)', kind: 'place', userExclusion: true, reason: 'Already visited — no overnight stop. Routes may still pass around it on the périphérique/A86.', sources: [], lastChecked: LAST_CHECKED },
  { id: 'x-luxembourg', name: 'Luxembourg (overnight)', kind: 'place', userExclusion: true, reason: 'Already visited — no overnight stop. Route 7 (Bruges ↔ Colmar) crosses it on the motorway for ~34 km; nothing else goes through it.', sources: [], lastChecked: LAST_CHECKED },
  {
    id: 'x-stelvio', name: 'Stelvio Pass', kind: 'pass', userExclusion: true,
    reason: 'Usually shut in May: 2,757 m with snow walls; opening is typically around late May–June.',
    typicalOpening: 'Late May – mid June (roughly 1 June ± 2–4 weeks)',
    sources: [wp('Stelvio Pass'), { label: 'rove.me – Stelvio', url: 'https://rove.me/to/italy/stelvio-pass' }, ADAC], lastChecked: LAST_CHECKED,
    reinstate: { routeId: 'r7', dayIndex: 3, via: { name: 'Stelvio Pass', lat: 46.5286, lon: 10.4531 }, highlight: 'stelvio', warning: 'Likely still closed on your dates — have the Ofen Pass or Tonale as fallback.' },
  },
  {
    id: 'x-furka', name: 'Furka Pass', kind: 'pass', userExclusion: true,
    reason: 'Usually shut in May (2,429 m). In 2025 only partly open from 2 May; full opening typically late May–June.',
    typicalOpening: 'Late May – June',
    sources: [ALPEN('furkapass', 'Furkapass'), { label: 'polizei.news – Uri pass status 18 May 2025', url: 'https://polizei.news/2025/05/18/kanton-uri-offen-sind-gotthard-klausen-und-oberalppass-susten-und-furka-teils-befahrbar/' }], lastChecked: LAST_CHECKED,
    reinstate: { routeId: 'r2', dayIndex: 3, via: { name: 'Furka Pass', lat: 46.5728, lon: 8.4150 }, highlight: 'furka', warning: 'Probably closed — the router cannot know live closures.' },
  },
  {
    id: 'x-grimsel', name: 'Grimsel Pass', kind: 'pass', userExclusion: true,
    reason: 'Usually shut in May (2,164 m); still closed on 18 May 2025.',
    typicalOpening: 'Late May – June',
    sources: [ALPEN('grimselpass', 'Grimselpass'), ADAC], lastChecked: LAST_CHECKED,
    reinstate: { routeId: 'r2', dayIndex: 3, via: { name: 'Grimsel Pass', lat: 46.5610, lon: 8.3370 }, highlight: 'grimsel', warning: 'Probably closed on your dates.' },
  },
  {
    id: 'x-susten', name: 'Susten Pass', kind: 'pass', userExclusion: true,
    reason: 'Usually shut in May: partly open from 19 May 2026, fully from mid-June.',
    typicalOpening: 'Mid/late May (partial) – June',
    sources: [ALPEN('sustenpass', 'Sustenpass')], lastChecked: LAST_CHECKED,
    reinstate: { routeId: 'r2', dayIndex: 3, via: { name: 'Susten Pass', lat: 46.7300, lon: 8.4480 }, highlight: 'susten', warning: 'Probably closed or only partly open.' },
  },
  {
    id: 'x-timmelsjoch', name: 'Timmelsjoch (Passo del Rombo)', kind: 'pass', userExclusion: true,
    reason: 'Usually shut in early May: opened 21 May 2025 and 13 May 2026 (a record early date). Also closed at night.',
    typicalOpening: 'Mid–late May',
    sources: [{ label: 'alpin.de – record early opening 2026', url: 'https://www.alpin.de/home/news/63788/artikel_timmelsjoch_startet_mit_historischem_fruehtermin_in_die_saison.html' }, wp('Timmelsjoch')], lastChecked: LAST_CHECKED,
    reinstate: { routeId: 'r3', dayIndex: 4, via: { name: 'Timmelsjoch', lat: 46.9060, lon: 11.0970 }, highlight: 'timmelsjoch', warning: 'Only open from mid/late May in recent years — may still be shut on your outbound dates.' },
  },
  {
    id: 'x-gsb', name: 'Great St Bernard Pass', kind: 'pass', userExclusion: true,
    reason: 'Pass road shut until June (22 June in 2026). The tunnel beneath is open year-round (toll).',
    typicalOpening: 'June',
    sources: [ALPEN('grosser-sankt-bernhard', 'Grosser Sankt Bernhard')], lastChecked: LAST_CHECKED,
    reinstate: { routeId: 'r5', dayIndex: 3, via: { name: 'Great St Bernard', lat: 45.8690, lon: 7.1700 }, highlight: 'great-st-bernard', warning: 'Closed in May — the router will likely use the tunnel instead.' },
  },

  // Added from research
  { id: 'x-lehavre', name: 'Portsmouth–Le Havre ferry', kind: 'crossing', reason: 'Brittany Ferries is withdrawing the route from October 2026, so it will not run in May 2027. Replaced by Portsmouth–Caen (Ouistreham).', sources: [{ label: 'Connexion – Brittany Ferries to end two routes', url: 'https://www.connexionfrance.com/news/brittany-ferries-to-end-two-uk-france-routes-and-sell-two-ferries/799888' }, { label: 'ferrygogo – 2026 route closures', url: 'https://ferrygogo.co.uk/brittany-ferries-route-closures-2026-alternatives/' }], lastChecked: LAST_CHECKED },
  {
    id: 'x-mangart', name: 'Mangart Saddle road', kind: 'road', reason: 'Slovenia\'s highest road opened only in mid-June 2026 and was cut at km 9 by a rockslide. Not a May option.',
    typicalOpening: 'June (if open at all)', sources: [{ label: 'e-slovenie – Mangart road', url: 'https://www.e-slovenie.com/en/articles/mangart-road-most-impressive-slovenia/' }], lastChecked: LAST_CHECKED,
    reinstate: { routeId: 'r3', dayIndex: 5, via: { name: 'Mangart Saddle', lat: 46.4410, lon: 13.6500 }, highlight: 'mangart', warning: 'Almost certainly closed in May.' },
  },
  { id: 'x-silvretta', name: 'Silvretta High Alpine Road', kind: 'road', reason: 'Vorarlberg side closed for building work until about 2030; only a dead-end from Tyrol is open.', sources: [{ label: 'ÖAMTC – closure until 2030', url: 'https://www.oeamtc.at/news/vorarlberg/silvretta-hochalpenstrasse-sperre-bis-2030-24352721' }], lastChecked: LAST_CHECKED },
  {
    id: 'x-albula', name: 'Albula Pass', kind: 'pass', reason: 'Opened 16 May in 2025; normally June–October with night closures. Julier (open all year) is used instead.',
    typicalOpening: 'Mid May – June', sources: [ALPEN('albulapass', 'Albulapass')], lastChecked: LAST_CHECKED,
    reinstate: { routeId: 'r2', dayIndex: 3, via: { name: 'Albula Pass', lat: 46.5800, lon: 9.8380 }, highlight: 'albula', warning: 'May open mid-May at the earliest.' },
  },
  { id: 'x-sanbernardino', name: 'San Bernardino Pass road', kind: 'pass', reason: 'Pass road opened 24 May 2024 and 30 May 2025. The A13 tunnel underneath is open all year but is not on our routes.', typicalOpening: 'Late May', sources: [{ label: 'bluewin – pass openings', url: 'https://www.bluewin.ch/en/news/road-over-the-oberalp-pass-open-again-despite-snow-2667154.html' }], lastChecked: LAST_CHECKED },
  { id: 'x-zillertal', name: 'Zillertal High Road', kind: 'road', reason: 'Toll panorama road that opens around 22 May — marginal for the outbound leg and off our routes.', typicalOpening: '~22 May', sources: [{ label: 'Zillertaler Höhenstraße – news', url: 'https://www.zillertaler-hoehenstrasse.com/en/news-en' }], lastChecked: LAST_CHECKED },
  {
    id: 'x-trecime', name: 'Tre Cime toll road (Rifugio Auronzo)', kind: 'road', reason: 'Planned opening 23 May in 2026, snow permitting; €40 per car and online booking mandatory. Lake Misurina (on an open road) is kept instead.',
    typicalOpening: 'Late May – June', sources: [{ label: 'dolomiti.it – Tre Cime toll road', url: 'https://www.dolomiti.it/en/auronzo-misurina/news/toll-road-tre-cime-di-lavaredo-open' }, { label: 'moonhoneytravel – Rifugio Auronzo road', url: 'https://www.moonhoneytravel.com/rifugio-auronzo-toll-road/' }], lastChecked: LAST_CHECKED,
    reinstate: { routeId: 'r3', dayIndex: 5, via: { name: 'Rifugio Auronzo', lat: 46.6120, lon: 12.2950 }, highlight: 'tre-cime', warning: 'Needs an online booking and may not be open until late May.' },
  },
  {
    id: 'x-hahntennjoch', name: 'Hahntennjoch', kind: 'pass', reason: 'Opened 11 May 2026 — borderline for the outbound dates. The Arlberg (open all year) is used instead.',
    typicalOpening: 'Early–mid May', sources: [{ label: 'Land Tirol – Hahntennjoch opening 2026', url: 'https://www.tirol.gv.at/presse/meldungen/meldung/wintersperre-vorbei-hahntennjoch-ab-montag-11-mai-wieder-geoeffnet/' }], lastChecked: LAST_CHECKED,
    reinstate: { routeId: 'r3', dayIndex: 3, via: { name: 'Hahntennjoch', lat: 47.2917, lon: 10.6694 }, highlight: 'hahntennjoch', warning: 'Only opened on 11 May in 2026.' },
  },
  {
    id: 'x-gotthard', name: 'Gotthard Pass road (Tremola)', kind: 'pass', reason: 'Cobbled Tremola opened 8 May in 2026 — risky for May. Bernina/Julier (open all year) chosen instead on Route 2.',
    typicalOpening: 'Early–late May', sources: [{ label: 'ASTRA – Swiss national roads', url: 'https://www.astra.admin.ch/' }, wp('Gotthard Pass')], lastChecked: LAST_CHECKED,
    reinstate: { routeId: 'r2', dayIndex: 3, via: { name: 'Gotthard Pass (Tremola)', lat: 46.5590, lon: 8.5620 }, highlight: 'gotthard-pass', warning: 'Opened 8 May in 2026 — may be closed early in May.' },
  },
  { id: 'x-nufenen', name: 'Nufenen Pass', kind: 'pass', reason: 'Opened 14 May 2026. Off our routes.', typicalOpening: 'Mid May – June', sources: [ALPEN('nufenenpass', 'Nufenenpass')], lastChecked: LAST_CHECKED },
  { id: 'x-gavia', name: 'Passo Gavia', kind: 'pass', reason: 'Opened 23–27 May 2026. Tonale (open year-round) is used on Route 7.', typicalOpening: 'Late May – June', sources: [{ label: 'passogavia.it – 2026 opening', url: 'https://www.passogavia.it/en/2026/05/01/opening-2026-gavia-pass-road-ss300/' }], lastChecked: LAST_CHECKED },
  { id: 'x-galibier', name: 'Col du Galibier & Col de l\'Iseran', kind: 'pass', reason: 'Galibier summit opened 5 June 2026, Iseran ~12 June — shut in May. Route 5 uses the Aravis instead.', typicalOpening: 'June', sources: [{ label: 'Alti Mag – French Alpine pass openings', url: 'https://www.alti-mag.com/en/travel-guide/alpine-pass-opening-dates-french-alps' }], lastChecked: LAST_CHECKED },
  { id: 'x-seiser', name: 'Seiser Alm road', kind: 'road', reason: 'Private cars may only drive up before 09:00 or after 17:00; better visited by cable car from Ortisei/Siusi.', sources: [{ label: 'Seiser Alm – access rules', url: 'https://www.seiseralm.it/en/info-service/mobility/access-to-seiser-alm.html' }], lastChecked: LAST_CHECKED },
  { id: 'x-kaunertal', name: 'Kaunertal Glacier Road', kind: 'road', reason: 'Open year-round but a long dead-end detour from Landeck; not worth a day on these routes.', sources: [{ label: 'Wikipedia (de)', url: 'https://de.wikipedia.org/wiki/Kaunertaler_Gletscherstra%C3%9Fe' }], lastChecked: LAST_CHECKED },
  {
    id: 'x-lauterbrunnen', name: 'Lauterbrunnen & Interlaken', kind: 'place', reason: 'Spectacular, but Colmar → Lucerne via the Bernese Oberland adds ~2 h and the Susten/Grimsel links are shut in May.',
    sources: [wp('Lauterbrunnen')], lastChecked: LAST_CHECKED,
    reinstate: { routeId: 'r2', dayIndex: 2, via: { name: 'Lauterbrunnen', lat: 46.5935, lon: 7.9091 }, highlight: 'lauterbrunnen', warning: 'Adds ~2 h to the Colmar–Lucerne day.' },
  },
  { id: 'x-cinqueterre', name: 'Cinque Terre', kind: 'place', reason: 'Too far off-line (~3–4 h from any route) and car-hostile.', sources: [wp('Cinque Terre')], lastChecked: LAST_CHECKED },
  { id: 'x-plitvice', name: 'Plitvice Lakes (Croatia)', kind: 'place', reason: 'Great day out but ~2.5 h each way from central Slovenia; adds Croatian border time. Possible if you add a base night.', sources: [wp('Plitvice Lakes National Park')], lastChecked: LAST_CHECKED },
]

/** Highlights that only appear if an exclusion is reinstated. */
export const EXCLUDED_HIGHLIGHTS: Highlight[] = [
  ['stelvio', 'Stelvio Pass', 'IT', 46.5286, 10.4531, 'Stelvio Pass', '48 stacked hairpins to 2,757 m.'],
  ['furka', 'Furka Pass', 'CH', 46.5728, 8.4150, 'Furka Pass', 'Goldfinger\'s pass past the Rhône glacier.'],
  ['grimsel', 'Grimsel Pass', 'CH', 46.5610, 8.3370, 'Grimsel Pass', 'Granite and dam lakes at 2,164 m.'],
  ['susten', 'Susten Pass', 'CH', 46.7300, 8.4480, 'Susten Pass', 'Glacier views on a grand engineered road.'],
  ['timmelsjoch', 'Timmelsjoch', 'AT', 46.9060, 11.0970, 'Timmelsjoch', 'High Alpine road from the Ötztal to Merano.'],
  ['great-st-bernard', 'Great St Bernard Pass', 'CH', 45.8690, 7.1700, 'Great St Bernard Pass', 'Hospice and dogs at 2,469 m.'],
  ['mangart', 'Mangart Saddle road', 'SI', 46.4410, 13.6500, 'Mangart', 'Slovenia\'s highest road, 2,072 m.'],
  ['albula', 'Albula Pass', 'CH', 46.5800, 9.8380, 'Albula Pass', 'Quiet pass beside the UNESCO railway.'],
  ['tre-cime', 'Tre Cime di Lavaredo', 'IT', 46.6187, 12.3025, 'Tre Cime di Lavaredo', 'The three great Dolomite towers.'],
  ['hahntennjoch', 'Hahntennjoch', 'AT', 47.2917, 10.6694, 'Hahntennjoch', 'Wild pass between the Lech valley and Imst.'],
  ['gotthard-pass', 'Gotthard Pass (Tremola)', 'CH', 46.5590, 8.5620, 'Gotthard Pass', 'Cobbled Tremola hairpins.'],
  ['lauterbrunnen', 'Lauterbrunnen valley', 'CH', 46.5935, 7.9091, 'Lauterbrunnen', '72 waterfalls under the Jungfrau.'],
].map(([id, name, country, lat, lon, wiki, desc]) => ({
  id: id as string,
  name: name as string,
  category: (id === 'lauterbrunnen' || id === 'tre-cime' ? 'landmark' : 'pass') as Highlight['category'],
  country: country as Highlight['country'],
  lat: lat as number,
  lon: lon as number,
  scenic: 10,
  may: (id === 'lauterbrunnen' ? 'open' : 'closed') as Highlight['may'],
  mayNote: 'Normally closed for at least part of May — see "considered but excluded".',
  wiki: wiki as string,
  desc: desc as string,
  sources: [wp(wiki as string)],
  lastChecked: LAST_CHECKED,
}))
