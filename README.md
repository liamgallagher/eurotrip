# Southampton ⇄ Ljubljana — road-trip planner (May 2027)

An interactive planner for choosing the outbound and return routes of a two-week Tesla road trip from Southampton to Slovenia and back. The first screen is a side-by-side **highlights comparison**. Below it are a live route builder, a 3D map, a day-by-day guide, a charging plan, costs and a checklist.

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
npm test                         # unit tests (energy model, planner, scoring, exports, share links)
npx playwright install chromium  # first time only
npm run e2e                      # end-to-end tests + screenshots in test-results/screens
```

The end-to-end suite runs at desktop (1440×900) and phone (Pixel 7) sizes. Every run saves screenshots to `test-results/screens/`.

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` runs the tests, builds, and deploys on every push to `main`. It needs a one-off setup: go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**. The site will then be at `https://<user>.github.io/eurotrip/`.

## Sharing a plan

Everything you change is saved in the browser (localStorage) and encoded into the URL (`#p=…`). The **Share plan** button copies the link, or opens the share sheet on a phone. Whoever opens the link gets exactly your routes, swaps, nights, detours, weights and stars.

The optional home address for Google Maps links is **only** stored on your device. It is never put in a share link or in the repo.

## How it works

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
