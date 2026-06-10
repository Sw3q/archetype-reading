import { test, expect, type Page } from '@playwright/test'

/**
 * Decide exactly `total` cards in the current swipe round: cards where
 * `keep(i)` is true go right (yes/innate), the rest left. Deterministic count,
 * because Stage 1 and Stage 2 render the same swipe UI and can't be told apart
 * by on-screen text.
 */
async function decideRound(page: Page, total: number, keep: (i: number) => boolean) {
  for (let i = 0; i < total; i++) {
    const id = keep(i) ? 'swipe-yes' : 'swipe-no'
    await page.getByTestId(id).click()
    await page.waitForTimeout(40)
  }
}

test('full reading flow: intro -> swipe -> filter -> roundtable -> export', async ({
  page,
}) => {
  await page.goto('/')

  // Intro
  await expect(page.getByRole('heading', { name: 'Archetypes' })).toBeVisible()
  await page.getByRole('button', { name: 'Begin the reading' }).click()

  // Stage 1: keep 12 of 91, discard the rest -> advances to filter (12 > 8)
  await expect(page.getByRole('heading', { name: 'This is me?' })).toBeVisible()

  // Undo reverses an accidental swipe and restores the count.
  await expect(page.getByTestId('swipe-undo')).toBeDisabled()
  await page.getByTestId('swipe-yes').click()
  await expect(page.getByText('90 left')).toBeVisible()
  await page.getByTestId('swipe-undo').click()
  await expect(page.getByText('91 left')).toBeVisible()

  await decideRound(page, 91, (i) => i < 12)

  // Stage 2 (The Shadow): review the rejected pile, reclaim 2, then skip the rest.
  await expect(page.getByRole('heading', { name: 'Look again' })).toBeVisible()
  await page.getByTestId('swipe-yes').click()
  await page.waitForTimeout(40)
  await page.getByTestId('swipe-yes').click()
  await page.waitForTimeout(40)
  await page.getByTestId('swipe-skip').click()

  // Stage 3 round 1: combined pile is 12 + 2 = 14; keep all (no progress) -> interstitial
  await expect(page.getByRole('heading', { name: 'Innate or Adaptive?' })).toBeVisible()
  await decideRound(page, 14, () => true)
  await expect(page.getByRole('heading', { name: 'Round complete' })).toBeVisible()
  await page.getByRole('button', { name: 'Next round' }).click()

  // Stage 3 round 2: keep the last 6 (<8) — these include the two shadow-reclaimed
  // cards, which sit at the end of the pile -> rescue/top-up phase
  await decideRound(page, 14, (i) => i >= 8)
  await expect(page.getByRole('button', { name: /Seat \d+ at the roundtable/ })).toBeVisible()
  await page.getByRole('button', { name: /Seat \d+ at the roundtable/ }).click()

  // Stage 3: roundtable with the You node, tokens, and export
  await expect(page.getByRole('heading', { name: 'Seat your archetypes' })).toBeVisible()
  await expect(page.getByText('You', { exact: true })).toBeVisible()

  // A seat must be draggable: grab one and confirm it moves (snapping to an
  // orbit). Release into the empty inner-left orbit region (relative to the
  // You seal) so it can't accidentally stack or ally with another seat.
  const seatCount = await page.locator('[data-token-id]').count()
  expect(seatCount).toBe(6)
  const you = await page.getByText('You', { exact: true }).boundingBox()
  if (!you) throw new Error('You seal not found')
  const token = page.locator('[data-token-id]').first()
  const before = await token.boundingBox()
  if (!before) throw new Error('no token found')
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
  await page.mouse.down()
  // Move in steps so framer-motion registers a drag gesture.
  await page.mouse.move(you.x - you.width * 1.6, you.y - you.height * 0.4, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  const after = await token.boundingBox()
  if (!after) throw new Error('token disappeared after drag')
  expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBeGreaterThan(20)

  // Stacking: drop the farthest seat onto the first → one seat fewer, two cards in it.
  await page.waitForTimeout(200)
  const target = await page.locator('[data-token-id]').first().boundingBox()
  const source = await page.locator('[data-token-id]').last().boundingBox()
  if (!target || !source) throw new Error('missing seats for stacking')
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  await expect(page.locator('[data-token-id]')).toHaveCount(5)
  await expect(page.locator('[data-token-id]').first().locator('[data-card-id]')).toHaveCount(2)

  // Copy AI prompt puts the full session prompt on the clipboard
  await page.getByRole('button', { name: 'Copy AI prompt' }).click()
  await expect(page.getByRole('button', { name: 'Copied ✓' })).toBeVisible()
  const prompt = await page.evaluate(() => navigator.clipboard.readText())
  expect(prompt).toContain('Jungian depth psychoanalyst')
  expect(prompt).toContain('four concentric orbits')
  expect(prompt).toContain('Ring ')
  expect(prompt).toContain('Stacked beneath it')
  expect(prompt).toContain('Light, "')
  expect(prompt).toContain('Shadow, "')
  // The two shadow-reclaimed cards from stage 2 must be flagged
  expect(prompt.match(/reclaimed from my shadow pass/g)?.length).toBeGreaterThanOrEqual(1)

  // Export downloads a real, non-trivial PNG
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export as image' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.png$/)
  const path = await download.path()
  const { statSync, readSync, openSync } = await import('node:fs')
  expect(statSync(path).size).toBeGreaterThan(5000) // a blank/failed render would be tiny
  // Verify PNG magic bytes.
  const buf = Buffer.alloc(8)
  readSync(openSync(path, 'r'), buf, 0, 8, 0)
  expect(buf.subarray(0, 4).toString('binary')).toContain('PNG')
})

test('manual mapping: search, seat, remove, AI prompt', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Done in person? Map your table' }).click()
  await expect(page.getByRole('heading', { name: 'Map your table' })).toBeVisible()

  // Seat three archetypes via search (Enter seats the first match).
  const search = page.getByLabel('Search archetypes')
  for (const name of ['vampire', 'hermit', 'queen']) {
    await search.fill(name)
    await search.press('Enter')
  }
  await expect(page.locator('[data-token-id]')).toHaveCount(3)
  // No cap: a seated count is shown.
  await expect(page.getByText('3 seated')).toBeVisible()

  // Remove one via its × control (revealed on hover).
  await page.locator('[data-token-id="queen"]').hover()
  await page.getByRole('button', { name: 'Remove Queen' }).click()
  await expect(page.locator('[data-token-id]')).toHaveCount(2)

  // Ally the two remaining seats: release one just beside (not onto) the other.
  const anchor = await page.locator('[data-token-id="vampire"]').boundingBox()
  const mover = await page.locator('[data-token-id="hermit"]').boundingBox()
  if (!anchor || !mover) throw new Error('missing seats for alliance')
  await page.mouse.move(mover.x + mover.width / 2, mover.y + mover.height / 2)
  await page.mouse.down()
  // Pointer lands just outside the anchor's right edge → snap-beside, not stack.
  await page.mouse.move(anchor.x + anchor.width + 12, anchor.y + anchor.height / 2, {
    steps: 8,
  })
  await page.mouse.up()
  await page.waitForTimeout(150)
  await expect(page.locator('[data-token-id]')).toHaveCount(2)

  // The AI prompt uses the in-person framing, reports the alliance, and omits
  // journey/shadow data.
  await page.getByRole('button', { name: 'Copy AI prompt' }).click()
  await expect(page.getByRole('button', { name: 'Copied ✓' })).toBeVisible()
  const prompt = await page.evaluate(() => navigator.clipboard.readText())
  expect(prompt).toContain('in person with the physical deck')
  expect(prompt).toContain('Vampire')
  expect(prompt).toContain('Hermit')
  expect(prompt).toMatch(/- (Vampire \+ Hermit|Hermit \+ Vampire)/)
  expect(prompt).not.toContain('Queen')
  expect(prompt).not.toContain('shadow pass')
  expect(prompt).not.toContain('How the reading worked')
})
