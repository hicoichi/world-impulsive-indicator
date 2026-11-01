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

// API の URL なしで書き出した版（モックの WorldSource）を確かめる。API 接続版は api.spec.ts
test.skip(!!process.env.E2E_API_BASE_URL, 'API 接続版のビルドでは api.spec.ts だけを動かす')

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

test.describe('投票', () => {
  async function count(page: Page): Promise<number> {
    const text = await activePanel(page).locator('.count').textContent()
    return Number((text ?? '').replace(/,/g, ''))
  }

  test('集計数を表示し、押すと +1 される', async ({ page }) => {
    await expect(activePanel(page).locator('.count')).not.toHaveText('—')
    const before = await count(page)
    await activePanel(page).getByRole('button', { name: '一揆したい に投票する' }).click()
    await expect.poll(() => count(page)).toBe(before + 1)
  })

  test('10票で上限になり、ボタンが弱まって一文が出る。11票目は数えない', async ({ page }) => {
    const button = activePanel(page).getByRole('button', { name: '一揆したい に投票する' })
    await expect(activePanel(page).locator('.count')).not.toHaveText('—')
    const before = await count(page)
    for (let i = 0; i < 10; i++) await button.click()
    await expect(button).toHaveAttribute('aria-disabled', 'true')
    await expect(activePanel(page).locator('.limit')).toHaveText('しばらくしてから、また')
    await button.click()
    await expect.poll(() => count(page)).toBe(before + 10)
  })

  test('上限は衝動ごとに独立している', async ({ page }) => {
    const button = activePanel(page).getByRole('button', { name: '一揆したい に投票する' })
    for (let i = 0; i < 10; i++) await button.click()
    await page.getByRole('button', { name: '国外脱出したい へ移動' }).click()
    await expectActive(page, '国外脱出したい')
    await expect(activePanel(page).getByRole('button', { name: '国外脱出したい に投票する' })).not.toHaveAttribute('aria-disabled', 'true')
  })
})

test.describe('地球の描画', () => {
  test('canvas に地球が描かれ、エラーが出ない', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text())
    })
    await page.reload()
    await expectActive(page, NAMES[0]!)
    // 背景だけでなく、明るい粒子（日本列島）が描かれている
    await expect.poll(() => activePanel(page).locator('canvas').evaluate((el) => {
      const c = el as HTMLCanvasElement
      const x = c.getContext('2d')
      if (!x || c.width < 2) return 0
      const d = x.getImageData(0, 0, c.width, c.height).data
      let bright = 0
      for (let i = 0; i < d.length; i += 4 * 7) if ((d[i] ?? 0) + (d[i + 1] ?? 0) + (d[i + 2] ?? 0) > 500) bright++
      return bright
    }), { timeout: 10_000 }).toBeGreaterThan(50)
    // 投票の演出（通常・レア）を何度起こしてもエラーにならない
    const button = activePanel(page).getByRole('button', { name: '一揆したい に投票する' })
    for (let i = 0; i < 10; i++) await button.click()
    await page.waitForTimeout(1500)
    expect(errors.filter(e => !e.includes('fonts.g'))).toEqual([])
  })
})
