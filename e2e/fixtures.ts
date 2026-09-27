import { test as base, expect } from '@playwright/test'

// In the cloud sandbox Chromium cannot authenticate to the egress proxy, so with E2E_NODE_FETCH=1 we
// pass external requests through Node's fetch (which honours NODE_USE_ENV_PROXY). Locally this is off.
export const test = base.extend({
  context: async ({ context }, use) => {
    if (process.env.E2E_NODE_FETCH) {
      await context.route(/^https:\/\//, async (route) => {
        const url = route.request().url()
        // keep tests fast and polite: no live routing, and Wikimedia hotlinks are not needed (photos are local)
        if (/router\.project-osrm\.org|upload\.wikimedia\.org/.test(url)) return route.abort()
        try {
          const r = await fetch(url, { headers: { 'user-agent': 'eurotrip-planner-e2e' } })
          await route.fulfill({
            status: r.status,
            body: Buffer.from(await r.arrayBuffer()),
            headers: { 'content-type': r.headers.get('content-type') ?? 'application/octet-stream', 'access-control-allow-origin': '*' },
          })
        } catch {
          await route.abort()
        }
      })
    }
    await use(context)
  },
})

export { expect }
