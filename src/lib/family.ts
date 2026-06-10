import type { ArchetypeFamily } from '../types'

/** Antiqued jewel tone per family (mirrors the --color-fam-* tokens in index.css). */
export const FAMILY_COLOR: Record<ArchetypeFamily, string> = {
  Survival: '#b25a42', // garnet clay
  Feminine: '#b06179', // rose madder
  Masculine: '#5d7fb7', // lapis
  Spiritual: '#9a72c4', // amethyst
  Intellectual: '#4a9a9c', // verdigris
  Helper: '#5aa276', // jade
  Creative: '#c79a3e', // topaz
  Action: '#b85048', // carnelian
  Shadow: '#8d8a80', // smoke
  Other: '#a59a82',
}
