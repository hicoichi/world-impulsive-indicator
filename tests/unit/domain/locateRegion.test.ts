import { describe, expect, test } from 'vitest'
import { distanceKm, MAX_DISTANCE_KM, regionAt } from '../../../app/domain/locateRegion'

describe('regionAt（現在地を8地方に丸める）', () => {
  test.each([
    ['札幌', 43.06, 141.35, 'hokkaido'],
    ['稚内', 45.4, 141.7, 'hokkaido'],
    ['仙台', 38.26, 140.88, 'tohoku'],
    ['新宿', 35.69, 139.7, 'kanto'],
    ['横浜', 35.44, 139.64, 'kanto'],
    ['名古屋', 35.17, 136.9, 'chubu'],
    ['新潟', 37.9, 139.02, 'chubu'],
    ['大阪', 34.7, 135.5, 'kinki'],
    ['広島', 34.39, 132.46, 'chugoku'],
    ['高松', 34.34, 134.05, 'shikoku'],
    ['福岡', 33.59, 130.4, 'kyushu'],
    ['那覇', 26.21, 127.68, 'kyushu'],
  ])('%s → %s', (_, lat, lon, region) => {
    expect(regionAt(lat, lon)).toBe(region)
  })

  test.each([
    ['ソウル', 37.57, 126.98],
    ['釜山', 35.18, 129.08],
    ['ニューヨーク', 40.71, -74.0],
    ['太平洋の真ん中', 30.0, 160.0],
  ])('日本の外は null（%s）', (_, lat, lon) => {
    expect(regionAt(lat, lon)).toBeNull()
  })

  test('不正な値は null', () => {
    expect(regionAt(Number.NaN, 139)).toBeNull()
  })

  test('距離の計算（東京〜大阪は約 400 km）', () => {
    expect(distanceKm(35.69, 139.69, 34.69, 135.52)).toBeGreaterThan(380)
    expect(distanceKm(35.69, 139.69, 34.69, 135.52)).toBeLessThan(420)
    expect(MAX_DISTANCE_KM).toBe(150)
  })
})
