import type { ArchetypeFamily } from '../types'

/** Accent color per family (mirrors the --color-fam-* tokens in index.css). */
export const FAMILY_COLOR: Record<ArchetypeFamily, string> = {
  Survival: '#d98a5b',
  Feminine: '#d76d92',
  Masculine: '#6f8fd9',
  Spiritual: '#b58bd9',
  Intellectual: '#5fb8c9',
  Helper: '#6fc79a',
  Creative: '#e0b15a',
  Action: '#d95b5b',
  Shadow: '#8a8f9c',
  Other: '#9a93b0',
}
