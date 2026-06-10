import { test, expect, type Page } from '@playwright/test'

/**
 * Decide exactly `total` cards in the current swipe round: the first `keep`
 * right (yes/innate), the rest left. Deterministic count, because both Stage 1
 * and Stage 2 render the same swipe UI and can't be told apart by on-screen text.
 */
async function decideRound(page: Page, total: number, keep: number) {
  for (let i = 0; i < total; i++) {
    const id = i < keep ? 'swipe-yes' : 'swipe-no'
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

  await decideRound(page, 91, 12)

  // Stage 2 (The Shadow): review the rejected pile, reclaim 2, then skip the rest.
  await expect(page.getByRole('heading', { name: 'Look again' })).toBeVisible()
  await page.getByTestId('swipe-yes').click()
  await page.waitForTimeout(40)
  await page.getByTestId('swipe-yes').click()
  await page.waitForTimeout(40)
  await page.getByTestId('swipe-skip').click()

  // Stage 3 round 1: combined pile is 12 + 2 = 14; keep all (no progress) -> interstitial
  await expect(page.getByRole('heading', { name: 'Innate or Adaptive?' })).toBeVisible()
  await decideRound(page, 14, 14)
  await expect(page.getByRole('heading', { name: 'Round complete' })).toBeVisible()
  await page.getByRole('button', { name: 'Next round' }).click()

  // Stage 3 round 2: keep 6 (<8) -> rescue/top-up phase
  await decideRound(page, 14, 6)
  await expect(page.getByRole('button', { name: /Seat \d+ at the roundtable/ })).toBeVisible()
  await page.getByRole('button', { name: /Seat \d+ at the roundtable/ }).click()

  // Stage 3: roundtable with the You node, tokens, and export
  await expect(page.getByRole('heading', { name: 'Seat your archetypes' })).toBeVisible()
  await expect(page.getByText('You', { exact: true })).toBeVisible()

  // A token must be draggable: grab one and confirm it actually moves.
  const token = page.locator('.draggable').first()
  const before = await token.boundingBox()
  if (!before) throw new Error('no token found')
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
  await page.mouse.down()
  // Move in steps so framer-motion registers a drag gesture.
  await page.mouse.move(before.x + 80, before.y + 140, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(100)
  const after = await token.boundingBox()
  if (!after) throw new Error('token disappeared after drag')
  expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBeGreaterThan(20)

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
