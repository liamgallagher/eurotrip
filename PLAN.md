# Eurotrip planner — build plan (awaiting go-ahead)

Southampton ↔ Ljubljana road-trip planner, May 2027. This is the pre-build plan. No app code has been written yet.

## 1. Architecture

| Layer | Choice | Why |
|---|---|---|
| App | Vite + React 19 + TypeScript, static SPA | Fast, simple; runs on a phone with no server needed |
| State | Zustand store → persisted to `localStorage` and encoded into the URL hash (`lz-string`) | Plans can be shared by link |
| Map | MapLibre GL JS + OpenFreeMap "liberty" vector style + AWS Terrarium DEM (`s3.amazonaws.com/elevation-tiles-prod`) for 3D terrain and hillshade | Free, no key, real 3D terrain |
| Routing | OSRM public server (`router.project-osrm.org`) by default. Optional OpenRouteService or Mapbox Directions adapter if a key is set. Results cached in IndexedDB, keyed by waypoint hash. A committed snapshot (`public/data/routes-snapshot.json`) is the offline fallback. | Real distances, nothing hard-coded |
| Scenic via-points | Each scenic road is stored as ordered via-coordinates, e.g. Grossglockner = Bruck → Fuscher Törl → Hochtor → Heiligenblut. OSRM is forced over the pass rather than through the tunnel. | Stops the router "optimising" the scenery away |
| Elevation | Sampled client-side from the same Terrarium DEM tiles along the route geometry | Per-day profile, synced to the map on hover |
| Motion | `motion` (Framer Motion) for UI and layout transitions. Custom rAF line-draw (`line-gradient` + `line-progress`) plus `@turf/along` for the car marker and camera fly-through. | Line draws itself along real roads |
| Charts | Hand-built SVG with d3-scale/d3-shape: elevation, SoC, country bars | Small, on-brand, not a dashboard kit |
| Tests | Vitest for the energy, scoring, URL and GPX/KML logic. Playwright for flows and desktop and mobile screenshots. | |
| Hosting (proposal) | GitHub Pages via a GitHub Action, so it works on the phone during the trip | Free |

The **first screen is the Highlights Comparison board**: 2–3 route columns with category rows aligned, priority sliders and category filters in a sticky rail, and ⭐ stars that re-rank routes. The map, builder, charging, day guide and costs are the next sections or tabs. A compact live map strip sits beside the board on desktop and collapses on mobile.

## 2. Data sources

| Data | Source | Key? | How |
|---|---|---|---|
| Driving distance, time, geometry | OSRM demo (default), ORS or Mapbox (optional) | No (ORS and Mapbox need a free key) | Runtime + IndexedDB cache + snapshot |
| Base map / terrain | OpenFreeMap; AWS Terrarium DEM | No | Runtime |
| Superchargers + stall counts | supercharge.info `allSites` JSON | No | `npm run data:chargers` snapshots the Europe subset to `public/data/superchargers.json` with a `lastChecked` date. Open Charge Map is an optional runtime fallback. |
| Photos | Wikimedia Commons (API `imageinfo` + `extmetadata`) | No | `npm run data:photos` resolves each highlight's Commons file into thumb URL, author, licence and link |
| Public holidays | Nager.Date `/PublicHolidays/2027/{cc}` | No | Runtime + committed fallback |
| Tolls, vignettes, pass opening dates, hotel-season notes | Hand-curated `src/data/*.ts`, every item carrying `source`, `lastChecked` and `estimate: boolean` | — | Updated by editing data files (README explains how) |
| May temperatures | Monthly climate normals per region (curated, labelled estimate) | — | Energy model input |

**No keys are required.** Optional `.env` values: `VITE_ORS_KEY` (openrouteservice.org, free), `VITE_MAPBOX_TOKEN`, `VITE_OCM_KEY` (openchargemap.org, free).

## 3. Energy and charging model (Model 3 RWD LFP)

- About 57.5 kWh usable. Starts every day at 100% (LFP, hotel destination charging).
- Consumption is modelled per 1 km segment:
  - A speed-dependent base: about 14–16 kWh/100 km at 110 km/h and 18–22 at 130 km/h. Road class is inferred from OSRM speed.
  - Climbing: m·g·Δh ÷ drivetrain efficiency.
  - Descending: recovers about 55% via regen.
  - Temperature factor from May normals.
  - Everything is labelled as an estimate, with sources.
- Charger planning: find Superchargers within about 5 km of the geometry. A greedy/DP planner keeps SoC ≥ 10% on arrival at each charger and ≥ 15% at the hotel. The UI flags "no Supercharger for X km" gaps.

## 4. Changes to your brief, from research (sources in the app)

**Must change**
- **Portsmouth–Le Havre ends in October 2026** (Brittany Ferries route closures), so it won't run in May 2027. I propose **Portsmouth–Caen (Ouistreham)** overnight as the ferry alternative, with Eurotunnel staying the default. The Le Havre crossing goes on the excluded list with the reason.
- **Default dates collide with Whitsun.** Departing Mon 10 May, you arrive in Ljubljana on **Sat 15 May, the Whitsun Saturday**, with heavy Alpine southbound traffic. Whit Monday is 17 May, so that doesn't hit a driving day; Ascension (6 May) and Corpus Christi (27 May) fall outside the trip. The app will flag it; departing a day earlier or later avoids it.

**Add** (as highlights, via-roads or swap stops)
- **Vršič → Soča valley → Bovec → Predil** as its own Slovenian scenic day. It's also a day-trip option from the Ljubljana base, alongside Bled, Bohinj, Piran and Postojna.
- **Nockalm Road** as a Route 1 or Route 4 finish. It opened 1 May in 2025 and 2026 and costs €20 for EVs.
- **Engadin circuit** (Julier → St Moritz → Maloja or Bernina), all open year-round. It's already in Route 2's upgrade.
- **Deutsche Alpenstraße east plus the Rossfeld Panoramastraße** (Berchtesgaden, open year-round) as a Route 1 or 4 alternative.
- **Lake Garda Strada della Forra** (reopened March 2026, now one-way uphill) as a Route 2 or 3 detour.
- **Great Dolomite Road** (Bolzano → Karersee → Pordoi → Falzarego → Cortina) to formalise Route 3's day.
- **Possible 7th route, "Engadin & Dolomites":** Bruges → Colmar → Chur → Bernina/Tirano → Bolzano → Cortina → Predil/Vršič. It has the most passes guaranteed open in May. It's your call whether to include it.

**Flag, don't cut**
- Zell am See, Hallstatt, Bovec, Chamonix and Canazei have **no Supercharger nearby**. Hotels with destination charging are fine there, since you charge overnight.
- **St Moritz has only 4 stalls.**
- Dolomites hotels are often closed until late May or June.
- **Vršič** has a new traffic regime from June 2026; May 2027 needs checking nearer the time.

**Considered but excluded** (visible list, toggleable, with opening dates)
- Your exclusions: Paris, Luxembourg, Stelvio, Furka, Grimsel, Susten, Timmelsjoch and Great St Bernard.
- New additions:
  - Mangart saddle road: opened mid-June 2026 and partly closed by a rockslide.
  - Silvretta High Alpine Road: the Vorarlberg side is closed until about 2030.
  - Albula: opened 16 May in 2025, so not reliable in May.
  - San Bernardino pass road: opens late May; the tunnel is fine.
  - Zillertal High Road: opens around 22 May.
  - Cinque Terre: too far off-line.
  - Portsmouth–Le Havre ferry: discontinued.
- **Venice stays in Route 2**, with a mainland-parking note (Tronchetto or Mestre).

## 5. Delivery phases
1. Data layer (routes, highlights, sources, exclusions) + routing and cache + scoring engine + comparison board (hero).
2. Map, 3D terrain, animated route drawing, car marker, fly-through, elevation profile.
3. Builder with stop swaps, live stats and warnings; nights adjuster; date picker; holiday flags.
4. Charging plan with SoC charts; costs and paperwork; country breakdown; day-by-day timeline.
5. Google Maps links (split so each link stays within the waypoint limit) + GPX/KML export + URL sharing.
6. Accessibility, `prefers-reduced-motion`, mobile polish, Playwright screenshots and fixes; README.

## 6. Blocker: container network
This cloud container can currently reach only npm, PyPI, GitHub and the AWS DEM tiles. OSRM, OpenFreeMap, supercharge.info, Wikimedia, Nager.Date and Open Charge Map are blocked. The app will work in your browser either way. But without access, I can't:
- snapshot real Supercharger data or check Commons photo licences,
- or run Playwright against real maps and routes; I'd have to use recorded fixtures.

**Hosts to allow:**
- `router.project-osrm.org`
- `tiles.openfreemap.org`
- `supercharge.info`
- `commons.wikimedia.org`
- `upload.wikimedia.org`
- `date.nager.at`
- `api.openchargemap.io`
- optionally `api.openrouteservice.org`
