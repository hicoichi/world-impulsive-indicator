// 衝動ごとの見た目（色・見出し）。値は UI モック（mock/…/JpScene.dc.html）のもの。
// 種類と順序は shared/domain/impulse.ts を正とし、ここでは見た目だけを持つ

import type { ImpulseKey } from '#shared/domain/impulse'

export interface ImpulseTheme {
  /** 英字の見出し（例：01 — UPRISING · JAPAN） */
  overline: string
  /** 見出し・衝動名の色 */
  accent: string
  /** 集計数の光 */
  glow: string
  /** 投票ボタンの背景・文字・光の輪・影 */
  button: { background: string, foreground: string, halo: string, shadow: string }
}

export const IMPULSE_THEMES: Record<ImpulseKey, ImpulseTheme> = {
  ikki: {
    overline: '01 — UPRISING · JAPAN',
    accent: '#FF7452',
    glow: 'rgba(255,90,50,0.55)',
    button: {
      background: '#E8432A',
      foreground: '#FFFFFF',
      halo: '#FF6A45',
      shadow: 'inset 0 1px 0 rgba(255,255,255,.35), 0 12px 44px rgba(232,67,42,.55)',
    },
  },
  exodus: {
    overline: '02 — EXODUS · JAPAN',
    accent: '#6CC6FF',
    glow: 'rgba(80,180,255,0.55)',
    button: {
      background: '#4FB8FF',
      foreground: '#03182C',
      halo: '#5CC0FF',
      shadow: 'inset 0 1px 0 rgba(255,255,255,.5), 0 12px 44px rgba(79,184,255,.5)',
    },
  },
  festival: {
    overline: '03 — FESTIVAL · JAPAN',
    accent: '#FFC53D',
    glow: 'rgba(255,190,60,0.55)',
    button: {
      background: '#FFBF2E',
      foreground: '#2B1100',
      halo: '#FFC23D',
      shadow: 'inset 0 1px 0 rgba(255,255,255,.55), 0 12px 44px rgba(255,170,40,.55)',
    },
  },
}
