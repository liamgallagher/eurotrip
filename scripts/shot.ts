// Dev helper: screenshots of the diorama through a headless Chromium (SwiftShader WebGL).
// Usage: npx tsx scripts/shot.ts out.png "lon,lat,dist,tilt,heading" [minutes] [w] [h] [path]
import { chromium } from '@playwright/test'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const [out = 'shot.png', view = '', t = '', w = '1440', h = '900', path = '/'] = process.argv.slice(2)
const CACHE = 'scripts/.cache/http'
mkdirSync(CACHE, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, ignoreHTTPSErrors: true })
await ctx.route(/^https:\/\//, async (route) => {
  const url = route.request().url()
  const f = `${CACHE}/${createHash('md5').update(url).digest('hex')}`
  if (existsSync(f)) {
    const j = JSON.parse(readFileSync(f + '.h', 'utf8'))
    return route.fulfill({ status: j.status, body: readFileSync(f), headers: { 'content-type': j.ct, 'access-control-allow-origin': '*' } })
  }
  try {
    const r = await fetch(url)
    const body = Buffer.from(await r.arrayBuffer())
    const ct = r.headers.get('content-type') ?? 'application/octet-stream'
    if (r.ok) { writeFileSync(f, body); writeFileSync(f + '.h', JSON.stringify({ status: r.status, ct })) }
    await route.fulfill({ status: r.status, body, headers: { 'content-type': ct, 'access-control-allow-origin': '*' } })
  } catch { await route.abort() }
})
if (process.env.PLAN) {
  const plan = readFileSync(process.env.PLAN, 'utf8')
  await ctx.addInitScript((p) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('eurotrip:v2', p); sessionStorage.setItem('seeded', '1') } }, plan)
}
const page = await ctx.newPage()
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text().slice(0, 300)) })
page.on('pageerror', (e) => console.log('pageerror:', e.message))
const q = new URLSearchParams()
if (view) q.set('view', view)
if (t) q.set('t', t)
await page.goto(`${process.env.BASE ?? "http://127.0.0.1:5199"}${path}?${q}`)
await page.waitForFunction(() => document.body.dataset.ready === '1' || !!document.querySelector('.optlist li'), null, { timeout: 120000 }).catch(() => console.log('not ready'))
const t0 = Date.now()
await page.waitForTimeout(1500)
await page.evaluate(() => { const d = (window as unknown as { __dio?: { animateAlways: boolean } }).__dio; if (d) d.animateAlways = true })
let calm = 0
while (Date.now() - t0 < 150000 && calm < 3) {
  const busy = await page.evaluate(() => (window as unknown as { __dio?: { busy: boolean } }).__dio?.busy)
  calm = busy ? 0 : calm + 1
  await page.waitForTimeout(2500)
}
await page.waitForTimeout(1500)
for (const step of (process.env.STEPS ?? '').split(';').filter(Boolean)) {
  const kind = step.slice(0, step.indexOf('=')), arg = step.slice(step.indexOf('=') + 1)
  if (kind === 'click') await page.click(arg)
  if (kind === 'wait') await page.waitForTimeout(Number(arg))
  if (kind === 'eval') await page.evaluate(arg)
  if (kind === 'upload') { const [sel, file] = arg.split('|'); await page.setInputFiles(sel, file) }
}
if (process.env.STEPS) {
  let calm2 = 0
  const t1 = Date.now()
  while (Date.now() - t1 < 120000 && calm2 < 3) {
    const busy = await page.evaluate(() => (window as unknown as { __dio?: { busy: boolean } }).__dio?.busy)
    calm2 = busy ? 0 : calm2 + 1
    await page.waitForTimeout(2500)
  }
}
await page.screenshot({ path: out })
console.log(JSON.stringify(await page.evaluate(() => (window as unknown as { __dio?: { debug: unknown } }).__dio?.debug)))
console.log('saved', out)
await browser.close()
