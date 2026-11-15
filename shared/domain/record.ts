// キーの並びから記録を作る。衝動の種類が対象ごとに違うため、型をキーの並びから決める

/** keys の順に、各キーに初期値を持つ記録を作る */
export function recordOf<K extends string, T>(keys: readonly K[], initial: (key: K) => T): Record<K, T> {
  const record: Partial<Record<K, T>> = {}
  for (const key of keys) record[key] = initial(key)
  // すべてのキーを上で埋めたので、欠けはない（型の上では Partial から絞り込めないため as を使う）
  return record as Record<K, T>
}
