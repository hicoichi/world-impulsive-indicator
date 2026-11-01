// WorldSource の実装を選ぶ唯一の場所。API の URL があれば World API、なければモック

import { createApiWorldSource } from './apiWorldSource'
import { createMockWorldSource } from './mockWorldSource'
import type { WorldSource } from './worldSource'

export function createWorldSource(apiBaseUrl: string): WorldSource {
  return apiBaseUrl ? createApiWorldSource({ baseUrl: apiBaseUrl }) : createMockWorldSource()
}
