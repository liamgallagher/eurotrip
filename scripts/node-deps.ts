import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { createHash } from 'node:crypto'
import { DemSampler } from '../src/lib/dem'
import { CountryIndex, type CountryShape } from '../src/lib/countries'

const CACHE = 'scripts/.cache/dem'

/** Node DEM decoder with a small on-disk cache so re-runs are fast. */
export function nodeDem() {
  mkdirSync(CACHE, { recursive: true })
  return new DemSampler(async (url) => {
    const file = `${CACHE}/${createHash('md5').update(url).digest('hex')}.png`
    let buf: Buffer
    if (existsSync(file)) buf = readFileSync(file)
    else {
      const res = await fetch(url)
      if (!res.ok) return null
      buf = Buffer.from(await res.arrayBuffer())
      writeFileSync(file, buf)
    }
    const png = PNG.sync.read(buf)
    return png.data
  })
}

export function nodeCountries(): CountryIndex {
  const shapes = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryShape[]
  return new CountryIndex(shapes)
}
