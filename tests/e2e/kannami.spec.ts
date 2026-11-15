import { expect, test, type Page } from '@playwright/test'

// 函南町版とモードの切替・レア演出の設定（拡張 USM Step 1、docs/frontend-plan.md §5）。
// API の URL なしで書き出した版（モックの WorldSource）を確かめる

/** 1衝動あたりの上限（shared/domain/vote.ts の VOTE_LIMIT と同じ） */
const VOTE_LIMIT = 100

const KANNAMI_NAMES = ['一揆したい', '荷物をまとめたい', '骨を埋めたい']

test.skip(!!process.env.E2E_API_BASE_URL, 'API 接続版のビルドでは api.spec.ts だけを動かす')

function activePanel(page: Page) {
  return page.locator('.panel:not([data-clone])[aria-hidden="false"]')
}

async function expectActive(page: Page, name: string) {
  await expect(activePanel(page).locator('.name')).toHaveText(name)
  await expect(page.locator('.dot[aria-current="true"]')).toHaveAttribute('aria-label', `${name} へ移動`)
}

async function toKannami(page: Page) {
  await page.getByRole('button', { name: /函南町/ }).click()
  await expect(page.locator('[data-mode="kannami"].layer')).toBeVisible()
  await expectActive(page, KANNAMI_NAMES[0]!)
}

async function count(page: Page): Promise<number> {
  const text = await activePanel(page).locator('.count').textContent()
  return Number((text ?? '').replace(/,/g, ''))
}

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  await expectActive(page, '一揆したい')
})

test('最初はオリジナル版で、切替のボタンで現在のモードが分かる', async ({ page }) => {
  await expect(page.locator('[data-mode="world"].layer')).toBeVisible()
  await expect(page.getByRole('button', { name: /オリジナル/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: /函南町/ })).toHaveAttribute('aria-pressed', 'false')
})

test('函南町版に切り替えると、3つの衝動がこの順に並び、ページ遷移しない', async ({ page }) => {
  const url = page.url()
  await toKannami(page)
  expect(page.url()).toBe(url)
  await expect(page.getByRole('button', { name: /函南町/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-mode="world"]')).toHaveCount(0)
  await expect(page.locator('.dot')).toHaveCount(3)
  for (const [index, name] of KANNAMI_NAMES.entries()) {
    await expect(page.locator('.dot').nth(index)).toHaveAttribute('aria-label', `${name} へ移動`)
  }
  await expect(activePanel(page).locator('.overline')).toHaveText('01 — UPRISING')
  // 函南町版は位置情報を使わない。押せる地域のピルは出さない
  await expect(page.getByRole('button', { name: '現在地の地方を反映する' })).toHaveCount(0)
  await expect(page.locator('.place')).toHaveText('KANNAMI')
})

test('函南町版でもキーボードで切り替わり、ループする', async ({ page }) => {
  await toKannami(page)
  await page.locator('.root').focus()
  await page.keyboard.press('ArrowRight')
  await expectActive(page, '荷物をまとめたい')
  await page.keyboard.press('ArrowRight')
  await expectActive(page, '骨を埋めたい')
  await page.keyboard.press('ArrowRight')
  await expectActive(page, '一揆したい')
})

test('函南町版の投票は +1 され、オリジナル版の集計には入らない', async ({ page }) => {
  await expect(activePanel(page).locator('.count')).not.toHaveText('—')
  const world = await count(page)
  await toKannami(page)
  await expect(activePanel(page).locator('.count')).not.toHaveText('—')
  const before = await count(page)
  await activePanel(page).getByRole('button', { name: '一揆したい に投票する' }).click()
  await expect.poll(() => count(page)).toBe(before + 1)
  await page.getByRole('button', { name: /オリジナル/ }).click()
  await expectActive(page, '一揆したい')
  await expect.poll(() => count(page)).toBe(world)
})

test('函南町版の上限は、オリジナル版の上限と別に数える', async ({ page }) => {
  await activePanel(page).getByRole('button', { name: '一揆したい に投票する' }).evaluate((el, n) => {
    for (let i = 0; i < n; i++) (el as HTMLButtonElement).click()
  }, VOTE_LIMIT)
  await expect(activePanel(page).getByRole('button', { name: '一揆したい に投票する' })).toHaveAttribute('aria-disabled', 'true')
  await toKannami(page)
  await expect(activePanel(page).getByRole('button', { name: '一揆したい に投票する' })).not.toHaveAttribute('aria-disabled', 'true')
})

test('函南町の舞台が描かれ、投票の演出でエラーが出ない', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text())
  })
  await toKannami(page)
  await expect.poll(() => activePanel(page).locator('canvas').evaluate((el) => {
    const c = el as HTMLCanvasElement
    const x = c.getContext('2d')
    if (!x || c.width < 2) return 0
    const d = x.getImageData(0, 0, c.width, c.height).data
    let bright = 0
    for (let i = 0; i < d.length; i += 4 * 7) if ((d[i] ?? 0) + (d[i + 1] ?? 0) + (d[i + 2] ?? 0) > 400) bright++
    return bright
  }), { timeout: 15_000 }).toBeGreaterThan(50)
  for (const name of KANNAMI_NAMES) {
    await page.getByRole('button', { name: `${name} へ移動` }).click()
    await expectActive(page, name)
    const button = activePanel(page).getByRole('button', { name: `${name} に投票する` })
    for (let i = 0; i < 5; i++) await button.click()
  }
  await page.waitForTimeout(1500)
  expect(errors.filter(e => !e.includes('fonts.g'))).toEqual([])
})

test.describe('レア演出の設定', () => {
  test('歯車から開き、初期値は ON。OFF にすると再読み込み後も OFF', async ({ page }) => {
    await page.getByRole('button', { name: '設定', exact: true }).click()
    const rare = page.getByRole('switch', { name: 'レア演出' })
    await expect(rare).toBeFocused()
    await expect(rare).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByText('ON — ときどき特別な演出が起きます')).toBeVisible()
    await rare.click()
    await expect(rare).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByText('OFF — 通常演出のみ')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(rare).toBeHidden()
    await expect(page.getByRole('button', { name: '設定', exact: true })).toBeFocused()
    await page.reload()
    await expectActive(page, '一揆したい')
    await page.getByRole('button', { name: '設定', exact: true }).click()
    await expect(page.getByRole('switch', { name: 'レア演出' })).toHaveAttribute('aria-checked', 'false')
  })

  test('OFF にしても投票できる（集計数は +1 のまま）', async ({ page }) => {
    await page.getByRole('button', { name: '設定', exact: true }).click()
    await page.getByRole('switch', { name: 'レア演出' }).click()
    await page.getByRole('button', { name: '設定を閉じる' }).click()
    await expect(activePanel(page).locator('.count')).not.toHaveText('—')
    const before = await count(page)
    const button = activePanel(page).getByRole('button', { name: '一揆したい に投票する' })
    for (let i = 0; i < 20; i++) await button.click()
    await expect.poll(() => count(page)).toBe(before + 20)
    // レアの演出（画面の揺れ）は起きない
    await expect(activePanel(page).locator('.scene.shakeA, .scene.shakeB')).toHaveCount(0)
  })
})

test('再読み込みするとオリジナル版から始まる', async ({ page }) => {
  await toKannami(page)
  await page.reload()
  await expectActive(page, '一揆したい')
  await expect(page.locator('[data-mode="world"].layer')).toBeVisible()
})

test('どちらのモードでも、主要な要素が画面内に収まり、横スクロールバーが出ない', async ({ page }) => {
  const viewport = page.viewportSize()!
  for (const target of ['world', 'kannami']) {
    if (target === 'kannami') await toKannami(page)
    for (const selector of ['.name', '.count', 'button.vote']) {
      const box = (await activePanel(page).locator(selector).boundingBox())!
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
    }
    const seg = (await page.locator('.seg').boundingBox())!
    expect(seg.x).toBeGreaterThanOrEqual(0)
    expect(seg.x + seg.width).toBeLessThanOrEqual(viewport.width)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(overflow).toBe(false)
  }
})
