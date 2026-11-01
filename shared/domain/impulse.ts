// 衝動の種類と順序。種類と順序はここだけで決める。画面と Lambda の両方が使う
// キーは姉妹アプリ（impulsive-momentum-indicator）と同じ。集計は別

export const IMPULSE_KEYS = ['ikki', 'exodus', 'festival'] as const

export type ImpulseKey = (typeof IMPULSE_KEYS)[number]

export const IMPULSE_LABELS: Record<ImpulseKey, string> = {
  ikki: '一揆したい',
  exodus: '国外脱出したい',
  festival: '祭りたい',
}

export function isImpulseKey(value: unknown): value is ImpulseKey {
  return typeof value === 'string' && (IMPULSE_KEYS as readonly string[]).includes(value)
}

/** 各衝動に同じ初期値を持つ記録を作る */
export function createImpulseRecord<T>(initial: (key: ImpulseKey) => T): Record<ImpulseKey, T> {
  return {
    ikki: initial('ikki'),
    exodus: initial('exodus'),
    festival: initial('festival'),
  }
}
