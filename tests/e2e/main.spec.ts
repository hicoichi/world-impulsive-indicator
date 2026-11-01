import { expect, test, type Page } from '@playwright/test'

const NAMES = ['一揆したい', '国外脱出したい', '祭りたい']

/** 表示中（複製でない、読み上げ対象）のパネル */
function activePanel(page: Page) {
  return page.locator('.panel:not([data-clone])[aria-hidden="false"]')
}

async function expectActive(page: Page, name: string) {
  await expect(activePanel(page).locator('.name')).toHaveText(name)
  await expect(page.locator('.dot[aria-current="true"]')).toHaveAttribute('aria-label', `${name} へ移動`)
}

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  await expectActive(page, NAMES[0]!)
})

test('一揆から始まり、衝動名・ボタン・ドット・地域のピルを表示する', async ({ page }) => {
  const panel = activePanel(page)
  await expect(panel.locator('.overline')).toHaveText('01 — UPRISING · JAPAN')
  await expect(panel.getByRole('button', { name: '一揆したい に投票する' })).toBeVisible()
  await expect(page.locator('.dot')).toHaveCount(3)
  await expect(page.locator('.region')).toHaveText('JAPAN')
  // ヘッダーに名前は出さない（Q-17）
  await expect(page.getByText('IMPULSIVE MOMENTUM INDICATOR')).toHaveCount(0)
})

test('主要な要素が画面内に収まり、横スクロールバーが出ない', async ({ page }) => {
  const viewport = page.viewportSize()!
  for (const selector of ['.name', '.count', 'button.vote']) {
    const box = (await activePanel(page).locator(selector).boundingBox())!
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflow).toBe(false)
})

test('ドットで直接移動できる', async ({ page }) => {
  await page.getByRole('button', { name: '祭りたい へ移動' }).click()
  await expectActive(page, '祭りたい')
})

test('キーボードの ← → で切り替わり、端から端へループする', async ({ page }) => {
  await page.locator('.root').focus()
  await page.keyboard.press('ArrowRight')
  await expectActive(page, '国外脱出したい')
  await page.keyboard.press('ArrowRight')
  await expectActive(page, '祭りたい')
  await page.keyboard.press('ArrowRight')
  await expectActive(page, '一揆したい')
  await page.keyboard.press('ArrowLeft')
  await expectActive(page, '祭りたい')
})

test('表示していない衝動のボタンは Tab で辿れない', async ({ page }) => {
  const focusable = page.locator('button.vote:not([inert] *)')
  await expect(page.locator('.panel[inert] button.vote')).toHaveCount(4)
  await expect(focusable).toHaveCount(1)
})

test.describe('PC', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 900, 'PC のみ')

  test('左右の矢印で切り替わり、端でもループする', async ({ page }) => {
    await page.getByRole('button', { name: '前の衝動へ' }).click()
    await expectActive(page, '祭りたい')
    await page.getByRole('button', { name: '次の衝動へ' }).click()
    await expectActive(page, '一揆したい')
  })

  test('縦ホイールでも切り替わる', async ({ page }) => {
    await page.mouse.move(640, 300)
    await page.mouse.wheel(0, 120)
    await expectActive(page, '国外脱出したい')
  })
})

test.describe('スマホ', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 900, 'スマホのみ')

  test('矢印ボタンは表示しない', async ({ page }) => {
    await expect(page.getByRole('button', { name: '次の衝動へ' })).toBeHidden()
  })

  test('横スクロール（スワイプ）で切り替わり、複製に止まると本物へ移る', async ({ page }) => {
    // 左へスワイプして先頭の複製（祭り）に止めた状態を作る
    await page.locator('.track').evaluate((el) => {
      el.scrollLeft = 0
      el.dispatchEvent(new Event('scroll'))
    })
    await expectActive(page, '祭りたい')
    await expect.poll(() => page.locator('.track').evaluate(el => Math.round(el.scrollLeft / el.clientWidth))).toBe(3)
  })
})
