import { expect, test, type Page, type Route } from '@playwright/test'

// World API に接続する版（NUXT_PUBLIC_API_BASE_URL を指定して書き出した成果物）を、通信をスタブして確かめる。
// E2E_API_BASE_URL に、書き出し時と同じ URL を指定したときだけ動く
const API = process.env.E2E_API_BASE_URL ?? ''
test.skip(!API, 'E2E_API_BASE_URL を指定したときだけ動かす')

const regions = { hokkaido: 0, tohoku: 0, kanto: 3, chubu: 0, kinki: 1, chugoku: 0, shikoku: 0, kyushu: 0, unknown: 0 }
const FULL = { ikki: 100, exodus: 100, festival: 100 }

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
}

async function stubApi(page: Page) {
  const votes: unknown[] = []
  let ikki = 41
  let remaining = { ...FULL }
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, x-session-token', 'access-control-allow-methods': 'GET, POST, OPTIONS' } })
    if (path === '/v1/state') {
      return json(route, 200, { impulses: { ikki: { votes: ikki, momentum: 4, regions }, exodus: { votes: 7, momentum: 4, regions }, festival: { votes: 0, momentum: 0, regions } } })
    }
    if (path === '/v1/sessions') return json(route, 201, { token: 'token-1', remaining })
    if (path === '/v1/sessions/me') return json(route, 200, { token: 'token-1', remaining })
    if (path === '/v1/votes') {
      votes.push({ body: req.postDataJSON(), token: req.headers()['x-session-token'] })
      ikki += 1
      remaining = { ...remaining, ikki: remaining.ikki - 1 }
      return json(route, 200, { result: 'accepted', token: 'token-1', remaining })
    }
    return json(route, 404, { error: 'not_found' })
  })
  return votes
}

test('API の集計数を表示し、投票を送る（地域は送らない）', async ({ page }) => {
  const votes = await stubApi(page)
  await page.goto('./')
  const panel = page.locator('.panel:not([data-clone])[aria-hidden="false"]')
  await expect(panel.locator('.count')).toHaveText('41')
  await panel.getByRole('button', { name: '一揆したい に投票する' }).click()
  await expect(panel.locator('.count')).toHaveText('42')
  await expect.poll(() => votes.length).toBe(1)
  expect(votes[0]).toMatchObject({ body: { impulse: 'ikki' }, token: 'token-1' })
  expect(Object.keys((votes[0] as { body: object }).body).sort()).toEqual(['impulse', 'voteId'])
  // セッショントークンは姉妹アプリと別のキーで保存する
  expect(await page.evaluate(() => localStorage.getItem('world-impulsive-indicator:session-token'))).toBe('token-1')
})

test.describe('位置情報を使う場合', () => {
  test.use({ geolocation: { latitude: 33.59, longitude: 130.4 }, permissions: ['geolocation'] })

  test('地方のコードだけを付けて投票を送る（緯度経度は送らない）', async ({ page }) => {
    const votes = await stubApi(page)
    await page.goto('./')
    await page.getByRole('button', { name: '現在地の地方を反映する' }).click()
    await expect(page.getByRole('button', { name: '現在地の地方を反映する' })).toHaveText('JAPAN · KYUSHU')
    const panel = page.locator('.panel:not([data-clone])[aria-hidden="false"]')
    await panel.getByRole('button', { name: '一揆したい に投票する' }).click()
    await expect.poll(() => votes.length).toBe(1)
    const body = (votes[0] as { body: Record<string, unknown> }).body
    expect(body).toMatchObject({ impulse: 'ikki', region: 'kyushu' })
    expect(Object.keys(body).sort()).toEqual(['impulse', 'region', 'voteId'])
    expect(JSON.stringify(body)).not.toMatch(/33\.5|130\.4/)
  })
})
