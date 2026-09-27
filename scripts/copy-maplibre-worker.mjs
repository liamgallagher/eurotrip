// MapLibre v6 loads its worker relative to its own module URL, which breaks once the library is bundled.
// Copy the worker (+ the shared chunk it imports) to /public so we can point setWorkerUrl() at it.
import { copyFileSync, mkdirSync } from 'node:fs'
const dir = 'public/vendor/maplibre'
mkdirSync(dir, { recursive: true })
for (const f of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) copyFileSync(`node_modules/maplibre-gl/dist/${f}`, `${dir}/${f}`)
console.log('maplibre worker copied')
