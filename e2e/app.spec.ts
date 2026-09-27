import { test, expect } from './fixtures'
import { readFileSync } from 'node:fs'

const shot = (name: string, project: string) => `screenshots/${project}-${name}.png`

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
})

test('comparison board is the first thing you see', async ({ page }, info) => {
  await page.goto('/')
  const board = page.locator('.board__grid')
  await expect(board).toBeVisible()
  const box = await board.boundingBox()
  const vh = page.viewportSize()!.height
  expect(box!.y).toBeLessThan(vh * (info.project.name === 'mobile' ? 0.95 : 0.6))
  await expect(page.locator('.rhead')).toHaveCount(3)
  await expect(page.locator('.hcard').first()).toBeVisible()
  await page.screenshot({ path: shot('01-first-screen', info.project.name) })
})

test('priority sliders re-rank routes live', async ({ page, isMobile }) => {
  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: /Priorities, filters/ }).click()
  const order = () => page.locator('.rank .rank__num').allTextContents()
  const before = (await order()).join()
  const scenic = page.getByRole('slider', { name: /Scenic drives & landscapes weight/ })
  await scenic.fill('0')
  await page.getByRole('slider', { name: /Good towns for evenings weight/ }).fill('10')
  await expect.poll(async () => (await order()).join()).not.toBe(before)
})

test('starring a highlight counts towards routes', async ({ page, isMobile }) => {
  await page.goto('/')
  const star = page.getByRole('button', { name: /^Star Grossglockner High Alpine Road$/ }).first()
  await star.click()
  await expect(page.getByRole('button', { name: /^Unstar Grossglockner High Alpine Road$/ }).first()).toBeVisible()
  if (isMobile) await page.getByRole('button', { name: /Priorities, filters/ }).click()
  await expect(page.locator('.rank__stars').first()).toContainText('★1')
})

test("what you'd miss shows only unique highlights", async ({ page }) => {
  await page.goto('/')
  const all = await page.locator('.hcard').count()
  await page.getByRole('radio', { name: "What you'd miss" }).click()
  await expect.poll(() => page.locator('.hcard').count()).toBeLessThan(all)
  // every card in this view is unique to one of the selected routes
  const cards = await page.locator('.hcard').count()
  await expect(page.locator('.ribbon')).toHaveCount(cards)
  const selected = (await page.locator('.rhead__num').allTextContents()).map((t) => `R${t.match(/Route (\d)/)![1]}`)
  for (const t of await page.locator('.also').allTextContents()) for (const r of selected) expect(t).not.toContain(r)
})

test('category filter limits rows', async ({ page, isMobile }) => {
  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: /Priorities, filters/ }).click()
  await page.getByRole('button', { name: /Mountain passes/ }).click()
  await expect(page.locator('.rowlabel')).toHaveCount(1)
  await expect(page.locator('.rowlabel')).toContainText('Mountain passes')
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
  await page.getByRole('button', { name: /^Star Venice$/ }).first().click()
  await page.getByRole('combobox', { name: 'Return route' }).selectOption('r4')
  await page.waitForTimeout(400)
  const url = page.url()
  expect(url).toContain('#p=')
  const p2 = await context.newPage()
  await p2.addInitScript(() => localStorage.clear())
  await p2.goto(url)
  await expect(p2.getByRole('combobox', { name: 'Return route' })).toHaveValue('r4')
  await expect(p2.getByRole('button', { name: /^Unstar Venice$/ }).first()).toBeVisible()
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
