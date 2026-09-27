import { test, expect } from './fixtures'
import { readFileSync } from 'node:fs'

const shot = (name: string, project: string) => `screenshots/${project}-${name}.png`

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
})






test('large place photos are the first thing you see', async ({ page, isMobile }, info) => {
  await page.goto('/')
  const gallery = page.locator('.gallery')
  await expect(gallery).toBeVisible()
  const box = await gallery.boundingBox()
  expect(box!.y).toBeLessThan(page.viewportSize()!.height)
  await expect(page.locator('.ghero')).toHaveCount(isMobile ? 1 : 2)
  await expect(page.locator('.place').first()).toBeVisible()
  // no sliders or scores any more
  await expect(page.getByRole('slider')).toHaveCount(await page.locator('#charging input[type=range]').count())
  await page.screenshot({ path: shot('01-first-screen', info.project.name) })
})

test('shortlisting a place shows on the route picker', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Shortlist Neuschwanstein Castle' }).first().click()
  await expect(page.getByRole('button', { name: 'Remove Neuschwanstein Castle from shortlist' }).first()).toBeVisible()
  await expect(page.locator('.rpick').filter({ hasText: 'Romantic Road' }).locator('.rpick__hearts')).toContainText('♥ 1')
})

test('picking routes and "only places the other route doesn\'t have"', async ({ page, isMobile }) => {
  await page.goto('/')
  await page.locator('.rpick').filter({ hasText: 'Dolomites' }).first().click()
  if (isMobile) await expect(page.getByRole('tab', { name: /Dolomites/ })).toBeVisible()
  else await expect(page.locator('.ghero__title').filter({ hasText: 'Dolomites' })).toBeVisible()
  const before = await page.locator('.place').count()
  await page.getByLabel("Only places the other route doesn't have").check()
  await expect.poll(() => page.locator('.place').count()).toBeLessThan(before)
})

test('every place links to more photos on Google', async ({ page }) => {
  await page.goto('/')
  const link = page.getByRole('link', { name: 'More photos ↗' }).first()
  await expect(link).toHaveAttribute('href', /google\.com\/search\?tbm=isch/)
})

test('builder swaps a stop and recalculates, and flags the same route both ways', async ({ page }) => {
  await page.goto('/#plan')
  const total = page.locator('.stat').filter({ hasText: 'Total driving' }).locator('.stat__value')
  await expect(total).toHaveText(/\d[\d,]* km/, { timeout: 30_000 })
  const before = await total.textContent()
  await page.getByRole('combobox', { name: 'Outbound overnight stop 4' }).selectOption('munich')
  await expect(total).not.toHaveText(before!, { timeout: 30_000 })
  await page.getByRole('combobox', { name: 'Return route' }).selectOption('r1')
  await expect(page.locator('.warning').filter({ hasText: 'same route' })).toBeVisible()
})

test('nights steppers keep the 14-night total visible', async ({ page }) => {
  await page.goto('/#plan')
  await expect(page.locator('.total')).toContainText('14')
  await page.getByRole('button', { name: 'Fewer Slovenia nights' }).click()
  await expect(page.locator('.total')).toContainText('13')
  await expect(page.locator('.warning').filter({ hasText: 'not 14' })).toBeVisible()
})

test('share link restores the plan', async ({ page, context }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Shortlist Neuschwanstein Castle' }).first().click()
  await page.getByRole('combobox', { name: 'Return route' }).selectOption('r4')
  await page.waitForTimeout(400)
  const url = page.url()
  expect(url).toContain('#p=')
  const p2 = await context.newPage()
  await p2.addInitScript(() => localStorage.clear())
  await p2.goto(url)
  await expect(p2.getByRole('combobox', { name: 'Return route' })).toHaveValue('r4')
  await expect(p2.getByRole('button', { name: 'Remove Neuschwanstein Castle from shortlist' }).first()).toBeVisible()
})

test('Google Maps links respect the waypoint limit; GPX exports', async ({ page }) => {
  await page.goto('/#days')
  const links = page.locator('a.glink[href^="https://www.google.com/maps/dir/"]')
  await expect(links.first()).toBeVisible()
  const hrefs = await links.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href))
  expect(hrefs.length).toBeGreaterThan(10)
  for (const h of hrefs) {
    const u = new URL(h)
    expect(u.searchParams.get('api')).toBe('1')
    const w = u.searchParams.get('waypoints')
    expect(w ? w.split('|').length : 0).toBeLessThanOrEqual(9)
  }
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /GPX/ }).click()])
  const text = readFileSync((await dl.path())!, 'utf8')
  expect(text).toContain('<gpx')
  expect(text).toContain('<trkpt')
})

test('map renders with terrain and a day profile', async ({ page }, info) => {
  await page.goto('/#map')
  const canvas = page.locator('.map canvas')
  await expect(canvas).toBeVisible({ timeout: 30_000 })
  await page.getByRole('tab', { name: 'D6' }).click()
  await expect(page.locator('.map__profile')).toBeVisible()
  await expect(page.locator('.map__profile-head')).toContainText('km')
  await page.waitForTimeout(5000)
  await page.locator('#map').screenshot({ path: shot('03-map', info.project.name) })
})

test('respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#map')
  await expect(page.getByRole('button', { name: /Step through/ })).toBeVisible({ timeout: 30_000 })
})

test('considered-but-excluded list can reinstate a pass with a warning', async ({ page }) => {
  await page.goto('/#excluded')
  const card = page.locator('.xcard').filter({ hasText: 'Stelvio Pass' })
  await expect(card).toContainText('Usually shut in May')
  await card.getByRole('checkbox').check()
  await expect(card).toContainText('Likely still closed')
})

test('full-page screenshots', async ({ page }, info) => {
  await page.goto('/')
  await page.waitForTimeout(1500)
  // make lazy content render
  for (const id of ['plan', 'map', 'days', 'charging', 'costs', 'checklist', 'excluded']) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded()
    await page.waitForTimeout(id === 'map' ? 3000 : 400)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: shot('02-full', info.project.name), fullPage: true })
  // accessibility smoke checks
  const imgsWithoutAlt = await page.locator('img:not([alt])').count()
  expect(imgsWithoutAlt).toBe(0)
  const unnamedButtons = await page.locator('button').evaluateAll((bs) => bs.filter((b) => !(b.textContent?.trim() || b.getAttribute('aria-label') || b.getAttribute('title'))).length)
  expect(unnamedButtons).toBe(0)
})

test('fly-through runs smoothly and can be zoomed while playing', async ({ page, isMobile }) => {
  test.skip(isMobile, 'covered on desktop; same code path')
  await page.goto('/#map')
  await expect(page.locator('.map canvas')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('tab', { name: 'D2', exact: true }).click()
  await page.getByRole('button', { name: /Fly day 2/ }).click()
  await expect(page.getByRole('button', { name: /Pause/ })).toBeVisible()
  const zoomGroup = page.getByRole('group', { name: 'Zoom while flying' })
  await expect(zoomGroup).toBeVisible()
  await expect(page.locator('.car')).toBeVisible({ timeout: 10_000 })
  await zoomGroup.getByRole('button', { name: 'Zoom out' }).click()
  await page.getByRole('radio', { name: '2×' }).click()
  await page.waitForTimeout(1500)
  await expect(page.getByRole('button', { name: /Pause/ })).toBeVisible()
  await page.getByRole('button', { name: /Stop/ }).click()
  await expect(page.locator('.car')).toHaveCount(0)
})
