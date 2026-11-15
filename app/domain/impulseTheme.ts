// 衝動ごとの見た目（色・見出し）。値は UI モック（JpScene）のもの。
// 種類と順序は shared/domain/impulse.ts・target.ts を正とし、ここでは見た目だけを持つ

import type { ImpulseKey } from '#shared/domain/impulse'
import type { KannamiImpulseKey } from '#shared/domain/target'

export interface ImpulseTheme {
  /** 英字の見出し（例：01 — UPRISING · JAPAN） */
  overline: string
  /** 見出し・衝動名の色 */
  accent: string
  /** 集計数の光 */
  glow: string
  /** 投票ボタンの背景・文字・光の輪・影 */
  button: { background: string, foreground: string, halo: string, shadow: string }
  /** レアの演出のときの画面のフラッシュ */
  flash: string
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
    flash: 'radial-gradient(circle at 55% 40%, rgba(255,120,70,0.55), rgba(255,60,20,0) 65%)',
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
    flash: 'radial-gradient(circle at 55% 40%, rgba(170,225,255,0.6), rgba(60,150,255,0) 65%)',
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
    flash: 'radial-gradient(circle at 55% 40%, rgba(255,220,140,0.6), rgba(255,80,160,0) 65%)',
  },
}

/**
 * 函南町版の衝動ごとの見た目。値は UI モック（KnScene）のもの。
 * 見出しの番号は、決めた並び（一揆したい → 荷物をまとめたい → 骨を埋めたい）に合わせる（docs/frontend-plan.md §5 K-1）。
 * 函南町版にはレア演出がないため、flash は使わない（K-2）
 */
export const KANNAMI_THEMES: Record<KannamiImpulseKey, ImpulseTheme> = {
  ikki: {
    overline: '01 — UPRISING',
    accent: '#FF7452',
    glow: 'rgba(255,90,50,0.55)',
    button: {
      background: '#E8432A',
      foreground: '#FFFFFF',
      halo: '#FF6A45',
      shadow: 'inset 0 1px 0 rgba(255,255,255,.35), 0 12px 44px rgba(232,67,42,.55)',
    },
    flash: 'none',
  },
  pack: {
    overline: '02 — PACK UP',
    accent: '#6CC6FF',
    glow: 'rgba(80,180,255,0.55)',
    button: {
      background: '#4FB8FF',
      foreground: '#03182C',
      halo: '#5CC0FF',
      shadow: 'inset 0 1px 0 rgba(255,255,255,.5), 0 12px 44px rgba(79,184,255,.5)',
    },
    flash: 'none',
  },
  settle: {
    overline: '03 — PUT DOWN ROOTS',
    accent: '#F2C46B',
    glow: 'rgba(255,196,92,0.5)',
    button: {
      background: '#F2C46B',
      foreground: '#2B1A00',
      halo: '#FFD27A',
      shadow: 'inset 0 1px 0 rgba(255,255,255,.55), 0 12px 44px rgba(255,190,80,.5)',
    },
    flash: 'none',
  },
}
