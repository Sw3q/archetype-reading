export type ArchetypeFamily =
  | 'Survival'
  | 'Feminine'
  | 'Masculine'
  | 'Spiritual'
  | 'Intellectual'
  | 'Helper'
  | 'Creative'
  | 'Action'
  | 'Shadow'
  | 'Other'

/** One pole of an archetype: a 1–3 word tag plus a short sentence. */
export interface Aspect {
  tag: string
  line: string
}

export interface Archetype {
  id: string
  name: string
  family: ArchetypeFamily
  /** The gift / empowered expression. */
  light: Aspect
  /** The fear-based / distorted expression. */
  shadow: Aspect
  /** Optional image URL — the card renders text-only until real art is dropped in. */
  image?: string
}

export type Stage = 'intro' | 'swipe' | 'filter' | 'roundtable'

/** A card placed on the roundtable, with its position as a fraction (0–1) of the table. */
export interface PlacedCard {
  archetype: Archetype
  /** 0 = left/top edge, 1 = right/bottom edge of the table surface. */
  x: number
  y: number
}
