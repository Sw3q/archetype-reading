import type { Archetype } from '../types'

export interface SeatedCard {
  archetype: Archetype
  /** Distance from the You node, normalized by table width. */
  dist: number
}

function tier(dist: number): string {
  if (dist <= 0.35) return 'innermost — right beside me'
  if (dist <= 0.55) return 'close'
  if (dist <= 0.75) return 'mid-table'
  return 'outer rim'
}

/**
 * Build the AI-session prompt from the live table state. The layout is fully
 * described in text so the analyst never has to (mis)read the exported image.
 *
 * `manual` = the table was transcribed from an in-person reading (no app
 * journey to narrate, no shadow-reclaim data).
 */
export function buildPrompt(
  seated: SeatedCard[],
  clusters: Archetype[][],
  reclaimedIds: Set<string>,
  opts: { manual?: boolean } = {},
): string {
  const { manual = false } = opts
  const byCloseness = [...seated].sort((a, b) => a.dist - b.dist)

  const cardLines = byCloseness
    .map((s, i) => {
      const a = s.archetype
      const reclaimed =
        !manual && reclaimedIds.has(a.id)
          ? '\n   Reclaimed from my shadow pass — I rejected it on first instinct, then admitted it belongs to me.'
          : ''
      return `${i + 1}. ${a.name} (${a.family} family) — ${tier(s.dist)}${reclaimed}
   Light, "${a.light.tag}": ${a.light.line}
   Shadow, "${a.shadow.tag}": ${a.shadow.line}`
    })
    .join('\n')

  const clusterLines =
    clusters.length > 0
      ? clusters
          .map((group) => `- ${group.map((a) => a.name).join(' + ')}`)
          .join('\n')
      : '- None — I kept every archetype standing apart.'

  const opening = manual
    ? `I completed an archetype roundtable reading in person with the physical deck, and I have transcribed my final table faithfully into a digital tool so we can work with it together.

About this reading:
- It was laid out by hand, card by card, and every placement below is deliberate.
- If I began this work in session with a human analyst, treat our conversation as a continuation of that work, not a restart.`
    : `I have just completed an archetype roundtable reading drawn from Myss's gallery of 91 archetypes, and I want to explore it with you in a depth-psychology session.

How the reading worked:
1. I swiped through all 91 archetypes on fast instinct, keeping those I recognize in myself.
2. I then re-examined every card I had rejected, and reclaimed the ones I had been reluctant to admit (marked below).
3. I narrowed the keepers by holding only what is innate — what I can't help being — over what is adaptive, a skill I've merely learned.
4. Finally I arranged the remaining archetypes consciously around a roundtable, with me ("You") seated at the bottom edge.`

  const reflect = manual
    ? 'what sits nearest, what is held at the rim, and which alliances look load-bearing.'
    : 'what sits nearest, what is held at the rim, which alliances look load-bearing, and what the shadow-reclaimed cards change about the picture.'

  return `You are a Jungian depth psychoanalyst who also knows Caroline Myss's "Sacred Contracts" intimately — her Gallery of Archetypes, the survival archetypes, and her light/shadow framework. ${opening}

How to read my table:
- The closer a card sits to me, the more strongly I identify with it.
- Cards placed near each other are allied: they support each other, fuel each other, or keep each other in check.
- Every placement was deliberate. If I attach an image of the table, treat this text as authoritative — do not re-read the cards from the image.

My table, from closest to me to farthest:
${cardLines}

Allied groupings (cards I deliberately placed together):
${clusterLines}

Before any interpretation:
1. Briefly reflect the table back to me in your own words — what stands out structurally: ${reflect}
2. Ask me your clarifying questions — about ambiguous placements, my life context, and what prompted this reading. One focused round, not a long checklist.
3. Only then begin the analysis. Work dialogically: short reflections followed by questions, following what has energy rather than delivering a lecture. Pay particular attention to where each archetype's light and shadow poles are actually living in my life right now.`
}
