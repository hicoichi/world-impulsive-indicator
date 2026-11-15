// WorldSource の実装を選ぶ唯一の場所。API の URL があれば World API、なければモック

import type { ImpulseKey } from '#shared/domain/impulse'
import { KANNAMI_IMPULSE_KEYS, type KannamiImpulseKey } from '#shared/domain/target'
import { createApiWorldSource } from './apiWorldSource'
import { createMockKannamiSource, createMockWorldSource } from './mockWorldSource'
import type { WorldSource } from './worldSource'

/** オリジナル版（世界） */
export function createWorldSource(apiBaseUrl: string): WorldSource<ImpulseKey> {
  return apiBaseUrl ? createApiWorldSource({ baseUrl: apiBaseUrl }) : createMockWorldSource()
}

/** 函南町版 */
export function createKannamiSource(apiBaseUrl: string): WorldSource<KannamiImpulseKey> {
  return apiBaseUrl
    ? createApiWorldSource({ baseUrl: apiBaseUrl, target: 'kannami', keys: KANNAMI_IMPULSE_KEYS })
    : createMockKannamiSource()
}
