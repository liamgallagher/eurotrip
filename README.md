# Soton × Slovenia — a living 3D planner for a May 2027 road trip

A map-first planner for a two-week Tesla Model 3 road trip from Southampton to Slovenia and back (five nights out, four in Slovenia, five back). The whole of western Europe floats as a 3D diorama built from real terrain and Sentinel-2 satellite imagery, lit by the real sun for the date, time and place. You plan on top of it.

**How you use it**

1. **Heart your must-sees** (optional). Liam and Tatiana each have their own hearts.
2. **Trip ideas**: three complete, different 14-night trips built around both sets of hearts, drawn on the map side by side. Choose one.
3. **Refine by tapping any night.** Every sensible stop appears as a card and a pin, sorted by how good the *whole* direction becomes. Each card shows the consequence before you choose (“4 h 10 · ≈1 charge · arrive 17:40 · Hallstatt no longer fits”). Stops that would double back into a country you have already left (after Bruges, no more France) are hidden unless you ask. Choosing one re-plans the rest of that direction around it; nights marked **booked** never move.
4. **Day cards**: drive time, arrival and sunset, charging shown as coffee/lunch breaks at real Superchargers, the sights on the way, detours worth making, a scenic-or-direct choice, a Plan B for pass days, Booking.com with your dates, and Google Maps directions.
5. **Before booking**: missing hearts, the hardest day, passes to check, holiday clashes, charging gaps, between-season hotels, low-emission zones and the considered-but-excluded list.
6. **On the road**: **Today** is a flat, offline page for the phone. **Our drive** turns the ribbon gold wherever you have actually driven (GPS while the app is open, or an imported GPX), pins notes and photos where they happened, and can record a 90-second fly-over film of the whole trip.

The sun follows the day: pick a day and the scene lights to your arrival time at tonight's stop. Scrub the sun dial or play a whole day. Close up the relief is near-true; far out it is exaggerated like a relief model. May snow above the typical snowline (~2,350 m, lower on north faces) is illustrative, not a live snow report.

The previous, table-heavy planner is still available at `classic.html` (linked from Settings and the plan sheet) with every source and detailed table.

**No API keys are needed.** Every data source is free and keyless.

## Run it

```bash
npm install        # also copies the MapLibre worker into public/vendor
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
npm run preview    # serve the production build
```

Node 20+ is required (22 recommended).

### Tests

```bash
npm test                         # unit tests (trip engine, energy model, classic planner, exports, share links)
npx playwright install chromium  # first time only
npm run e2e                      # end-to-end tests + screenshots in screenshots/
```

The end-to-end suite runs at desktop (1440×900) and phone (Pixel 7) sizes. `e2e/planner.spec.ts` covers the 3D planner; `e2e/classic.spec.ts` covers the classic page. Every run saves screenshots to `screenshots/`. In CI or a sandbox without a GPU, Chromium renders WebGL with SwiftShader, which is slow but works.

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` runs the tests, builds, and deploys on every push to the repository's default branch. It needs a one-off setup: go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**. The site will then be at `https://<user>.github.io/eurotrip/`.

## Sharing a plan

Everything you change is saved in the browser (localStorage). **Share** copies a link (`#t=…`), or opens the share sheet on a phone. Whoever opens it gets your stops, nights, booked flags, day choices, settings and both sets of hearts. The journal (track, notes, photos) never leaves the device. The first time you open the new planner it imports your dates, stops and stars (as Liam's hearts) from the classic planner.

The public page opens on a neutral example week (Mon 3 May 2027). Your real dates live only in your own browser and your share link, so the public site doesn't advertise when you're away.

The optional home address for Google Maps links is **only** stored on your device. It is never put in a share link or in the repo.

## How it works

### The diorama (`src/app/scene/`)

A custom three.js renderer, no map SDK:

- **Slab**: Web Mercator z6 tiles from Cornwall to Hungary, with cut earth walls and a sea of cloud beneath it.
- **Terrain**: a quadtree of tiles (z6–z14) that streams [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) and [Sentinel-2 cloudless 2020](https://s2maps.eu) imagery (EOX, CC BY-NC-SA 4.0) through a Web Worker. z6–z7 come from baked rasters (`npm run data:terrain`), so the first frame needs no tile requests.
- **Light**: the sun position comes from SunCalc for the day's date, time and place. Shadows are ray-marched through a slab-wide heightfield; the air (haze toward the sun) and sky follow the sun's colour; night uses NASA's VIIRS night lights. Water gets sun glint; May snow is added above the typical snowline.
- **Ribbons**: screen-space lines draped on the terrain, coloured by direction, battery % or gradient, with an x-ray pass for tunnels and hidden stretches. The parts you have actually driven turn gold.
- **Pins** are real HTML (buttons with labels), positioned on the terrain every frame and decluttered by priority.
- **Post-processing** (pmndrs `postprocessing`): bloom, tilt-shift at the miniature overview, ACES tone mapping, vignette. Quality drops automatically on slow devices (Settings → 3D quality).
- **Fallbacks**: a flat MapLibre map, a plain list, and Today mode all work without the 3D scene.

### The trip engine (`src/app/engine/`)

- `public/data/matrix.json`: OSRM drive times between every overnight place and every highlight (262 × 262, `npm run data:matrix`).
- `public/data/curated.json`: the seven researched routes' days, re-usable between any of their stop options in either direction, each with exact OSRM times (`npm run data:curated`, which also routes and caches the legs).
- **Ways**: each day is either a curated scenic day or the most direct road, plus highlights on the way (≤ 10 min extra) and detours (≤ 75 min). Hearted detours are added automatically while the day stays within your driving limit.
- **Scoring**: scenery (weighted by May status), evening quality, +30 per heart per person, variety between the two directions, and penalties for long or pointless days and for doubling back into a country.
- **Search**: a beam search per direction, re-scored exactly. Trip ideas combine diverse outbound and return paths. Suggestions re-plan the rest of the direction for every candidate, which is what makes “Hallstatt no longer fits” possible. “What would it take?” re-plans with a missed heart strongly preferred and reports the extra driving and what else it would cost.

### Shared with the classic planner

| Layer | What | Source |
| --- | --- | --- |
| Routing | Real road distances, times and geometry | [OSRM](https://project-osrm.org) public server (OpenStreetMap) |
| Elevation | Terrarium DEM tiles, sampled every 500 m; tunnels are interpolated | [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) |
| Map | MapLibre GL with 3D terrain and hillshade | [OpenFreeMap](https://openfreemap.org) |
| Superchargers | Locations, stall counts, power | [supercharge.info](https://supercharge.info) |
| Holidays | Public holidays, fetched live with an offline copy | [Nager.Date](https://date.nager.at), [OpenHolidays](https://openholidaysapi.org) |
| Photos | Lead images with author and licence | Wikimedia Commons |
| Borders | Which countries each leg passes through | Natural Earth 1:50m |

- **No hard-coded distances.** Each day is routed through OSRM using that day's waypoints. Via points force the scenic roads, for example over the Grossglockner or the Arlberg pass instead of through the tunnels.
- **Caching:** routes are cached in three layers:
  1. a committed snapshot (`public/data/legs/*.json`) covering every route, direction, crossing, single stop swap and detour toggle, so the app works instantly and offline;
  2. IndexedDB on the device;
  3. a live OSRM call for anything new.

  **Recalculate all legs live now** in the builder bypasses the cache.
- **Energy model** (`src/lib/energy.ts`): physics per 500 m covering rolling resistance, aero drag (motorways at your cruise speed, other roads at OSRM speed), gradient, altitude air density, May temperatures and regen on descents. It is calibrated to about 16 kWh/100 km at 110 km/h and about 20 at 130 km/h for a Model 3 RWD LFP (57.5 kWh usable).
- **Charging planner** (`src/lib/charging.ts`): each day starts at 100%. It stops at real Superchargers within 4 km of the route and keeps at least 10% on arrival at a charger and your chosen reserve at the hotel. Charging time comes from an approximate LFP charge curve. It also flags stretches of 200 km or more with no Supercharger, and mountain stretches of 120 km or more.
- **Tolls and vignettes** (`src/lib/tripStats.ts`):
  - Vignettes are only bought where you actually use motorways, using OSRM's motorway flags.
  - French and Italian tolls are estimated from the kilometres OSM tags as toll roads.
  - Fixed tolls (Grossglockner, Nockalm, Mont Blanc tunnel, Arlberg tunnel and so on) are detected from the routed road names or position.
- **Scores** (`src/lib/scoring.ts`): editorial scenic and evening scores are combined with a computed charging score and a May-reliability score, weighted by the four sliders. Each starred highlight adds 6 points.

Anything modelled or approximate is marked **ESTIMATE** in the UI. Everything that can change has a source link and a "checked" date.

## Updating the route data

All hand-curated data lives in `src/data/`:

| File | Contents |
| --- | --- |
| `routes.ts` | The 7 routes: 5 stops each (with swap options) and 6 days with via points and optional detours. Always written Channel → Slovenia; the return direction is derived automatically. |
| `places.ts` | Overnight stops and swaps, with evening scores and practical notes |
| `highlights.ts` | Highlight cards: category, scenic score, May status, sources |
| `exclusions.ts` | The "considered but excluded" list and how to reinstate each item |
| `costs.ts` | Vignettes, fixed tolls, per-km tolls, crossings and Supercharger prices, with sources |
| `calendar.ts` | Traffic peaks and school holidays |
| `checklist.ts` | The pre-trip checklist |

After editing routes, places or highlights, refresh the generated data:

```bash
# In a network-restricted sandbox, prefix commands with NODE_USE_ENV_PROXY=1 so Node uses the proxy.
npm run data:legs            # route any new/changed legs through OSRM (cached; --force to refetch all, --prune to delete unused)
npm run data:check           # sanity-check legs: snap distances and that pass days actually climb the pass
npm run data:metrics         # per-route summary numbers for the comparison board
npm run data:photos          # resolve Wikimedia photos + attribution for new highlights
npm run data:photos:download # store 500px local copies in public/photos (slow on purpose)
npm run data:chargers        # refresh the Supercharger snapshot
npm run data:holidays        # refresh the offline holiday copy (-- --year=2028 for another year)
npm run data:all             # everything above except the photo download
npm run data:matrix          # drive-time table between places and highlights (3–4 minutes)
npm run data:curated         # index + route every curated day between every stop option
npm run data:terrain         # bake the slab heightfield, night lights and overview imagery
```

If a new via point snaps to the wrong road, `data:check` reports a large snap distance. Move the point onto the road (OSRM's `/nearest` endpoint helps) and rerun `data:legs`.

To add a highlight whose Wikipedia lead image is poor, set `commons: 'File name.jpg'` on it, or add it to `scripts/photo-overrides.json`.

## Environment variables

See `.env.example`. Both are optional:

- `VITE_OSRM_URL`: use your own OSRM server instead of the public demo.
- `VITE_MAP_STYLE`: use a different MapLibre style.

## Accuracy notes

- Distances and times are OSRM free-flow figures. Add breaks and allow for traffic.
- Pass opening dates come from the 2024–2026 seasons. Check the official pass sites the week before you drive.
- Prices are 2026 rates, since most 2027 prices are not published yet.
- The Portsmouth–Le Havre ferry is being withdrawn in October 2026. Portsmouth–Caen is used instead.

## Attribution

- Satellite imagery: Sentinel-2 cloudless 2020 by [EOX IT Services GmbH](https://s2maps.eu) (contains modified Copernicus Sentinel data 2020), CC BY-NC-SA 4.0. Non-commercial use only, which fits a private trip planner.
- Terrain: [Mapzen Terrain Tiles on AWS](https://registry.opendata.aws/terrain-tiles/) (SRTM, GMTED, ETOPO1, EU-DEM and others).
- Night lights: NASA Earth Observatory / VIIRS via [GIBS](https://nasa-gibs.github.io/gibs-api-docs/).
- Roads and places: © OpenStreetMap contributors, routed with [OSRM](https://project-osrm.org).
- Photos: Wikimedia Commons authors, credited on every image.
