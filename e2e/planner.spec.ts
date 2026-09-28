import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// The map-first planner (index.html). The classic planner has its own spec.

async function chooseFirstTrip(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Three ways to do it' })).toBeVisible()
  const first = page.locator('.opt').first()
  await expect(first).toBeVisible({ timeout: 30_000 })
  await first.getByRole('button', { name: 'Choose this trip' }).click()
  await expect(page.locator('.daystrip')).toBeVisible()
}

test('first visit offers three complete trips, and choosing one lays out 15 days', async ({ page }, info) => {
  await chooseFirstTrip(page)
  await expect(page.locator(".dchip")).toHaveCount(14) // "All" + 12 driving days + one chip for the Slovenia days
  await expect(page.locator('.brand__sub')).toContainText('km')
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `screenshots/planner-${info.project.name}.png` })
})

test('a day card shows the drive, the breaks and tonight’s stop; a stop can be swapped', async ({ page, isMobile }, info) => {
  await chooseFirstTrip(page)
  await page.locator('.dchip').nth(2).click()
  const card = page.locator('.daycard')
  await expect(card.locator('.facts')).toContainText('At the wheel')
  await expect(card.getByRole('heading', { name: /Tonight:/ })).toBeVisible()
  await expect(card.getByRole('link', { name: /Booking.com/ })).toHaveAttribute('href', /booking\.com.*checkin=/)
  // follow the route
  const fly = card.getByRole('button', { name: 'Fly this day' })
  await expect(fly).toBeEnabled({ timeout: 30_000 })
  await fly.click()
  await expect(card.getByRole('button', { name: 'Stop', exact: true })).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __dio: { flying: boolean } }).__dio.flying)).toBe(true)
  await card.getByRole('button', { name: 'Stop', exact: true }).click()
  await card.getByRole('button', { name: /Change tonight’s stop/ }).click()
  const cards = page.locator('.ccard')
  await expect(cards.first()).toBeVisible({ timeout: 30_000 })
  expect(await cards.count()).toBeGreaterThan(4)
  await expect(page.locator('.ccard__facts').first()).toContainText('arrive')
  if (!isMobile) await page.screenshot({ path: `screenshots/candidates-${info.project.name}.png` })
  // choose the second option
  const second = cards.nth(1)
  const name = (await second.locator('.ccard__name').innerText()).split('\n')[0].trim()
  await second.click()
  await second.getByRole('button', { name: /^Choose/ }).click()
  await expect(page.locator('.toast')).toContainText('re-planned')
  await expect(page.locator('.daycard h2')).toContainText(name.split(' ')[0])
})

test('Liam and Tatiana each have their own hearts', async ({ page, isMobile }) => {
  await chooseFirstTrip(page)
  if (isMobile) await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('button', { name: /Must-sees/ }).click()
  const first = page.locator('.gcard').first()
  await first.getByRole('button', { name: /^Liam heart/ }).click()
  await first.getByRole('button', { name: /^Tatiana heart/ }).click()
  await expect(first.getByRole('button', { name: /^Liam unheart/ })).toBeVisible()
  await expect(first.getByRole('button', { name: /^Tatiana unheart/ })).toBeVisible()
  await expect(page.locator('.discover .lede')).toContainText('Liam 1, Tatiana 1')
})

test('the plan sheet has days, hearts, costs and a check before booking', async ({ page, isMobile }) => {
  await chooseFirstTrip(page)
  if (isMobile) await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('button', { name: /^Plan$/ }).click()
  await expect(page.locator('.dayslist li')).toHaveCount(15)
  await page.getByRole('tab', { name: 'Costs' }).click()
  await expect(page.locator('.costs')).toContainText(/Eurotunnel|Vignettes|Tolls/, { timeout: 30_000 })
  await page.getByRole('tab', { name: 'Before booking' }).click()
  await expect(page.locator('.checklist li').first()).toBeVisible()
  await expect(page.locator('.excluded')).toContainText('Stelvio')
})

test('Today mode works as a flat page with a Google Maps button', async ({ page }) => {
  await chooseFirstTrip(page)
  await page.goto('/#today')
  await expect(page.locator('.today__h')).toBeVisible()
  await page.getByRole('button', { name: 'Next day' }).click()
  await expect(page.locator('.today__go').first()).toHaveAttribute('href', /google\.com\/maps\/dir/)
})

test('share link carries the plan and both sets of hearts', async ({ page, context }) => {
  await chooseFirstTrip(page)
  const link = await page.evaluate(() => {
    const w = window as unknown as { __app: { getState: () => { toggleHeart: (id: string, who: string) => void } }; __shareUrl: () => string }
    w.__app.getState().toggleHeart('hallstatt', 'tatiana')
    return w.__shareUrl()
  })
  expect(link).toContain('#t=')
  const p2 = await context.newPage()
  await p2.addInitScript(() => localStorage.clear())
  await p2.goto(link)
  await expect(p2.locator('.daystrip')).toBeVisible()
  const hearts = await p2.evaluate(() => (window as unknown as { __app: { getState: () => { plan: { hearts: { tatiana: string[] } } } } }).__app.getState().plan.hearts.tatiana)
  expect(hearts).toContain('hallstatt')
})

test('list and 2D views work without the 3D scene', async ({ page, isMobile }) => {
  await chooseFirstTrip(page)
  if (isMobile) await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('radio', { name: /List/ }).first().click()
  await expect(page.locator('.listview .drow')).toHaveCount(15)
  if (isMobile) await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('radio', { name: /Map/ }).first().click()
  await expect(page.locator('.map2d canvas')).toBeVisible({ timeout: 30_000 })
})

test('classic planner is still there', async ({ page }) => {
  await page.goto('/classic.html')
  await expect(page.getByText('Soton×Slovenia').first()).toBeVisible()
})
