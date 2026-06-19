import type { Archetype } from '../types'

/** One seat at the table: a card, or a stack of derivative cards. */
export interface PromptStack {
  /** cards[0] is the primary (top) card; the rest are stacked beneath it. */
  cards: Archetype[]
  /** 0 = innermost orbit (strongest identification), 3 = outer rim. */
  ring: number
}

const RING_NAMES = [
  'Ring 1 of 4 — innermost, right beside me',
  'Ring 2 of 4 — close',
  'Ring 3 of 4 — middle distance',
  'Ring 4 of 4 — the outer rim',
]

function aspectLine(a: Archetype): string {
  return `Light, "${a.light.tag}": ${a.light.line} / Shadow, "${a.shadow.tag}": ${a.shadow.line}`
}

function stackName(s: PromptStack): string {
  return s.cards.length > 1
    ? `${s.cards[0].name} (stack of ${s.cards.length})`
    : s.cards[0].name
}

/**
 * Build the AI-session prompt from the table's explicit structure: every seat
 * sits on exactly one of four orbits around You, stacks declare their primary,
 * and alliances are deliberate side-by-side snaps — nothing is inferred.
 *
 * `manual` = the table was transcribed from an in-person reading (no app
 * journey to narrate, no shadow-reclaim data).
 */
export function buildPrompt(
  stacks: PromptStack[],
  alliances: PromptStack[][],
  reclaimedIds: Set<string>,
  opts: { manual?: boolean } = {},
): string {
  const { manual = false } = opts

  const reclaimedNote = (a: Archetype) =>
    !manual && reclaimedIds.has(a.id)
      ? ' [reclaimed from my shadow pass — I rejected it on first instinct, then admitted it belongs to me]'
      : ''

  const ringSections = RING_NAMES.map((name, ring) => {
    const here = stacks.filter((s) => s.ring === ring)
    if (here.length === 0) return null
    const entries = here
      .map((s) => {
        const [primary, ...beneath] = s.cards
        let entry = `• ${primary.name} (${primary.family} family)${reclaimedNote(primary)}
  ${aspectLine(primary)}`
        if (beneath.length > 0) {
          entry += `
  Stacked beneath it — close derivatives that fuel the card on top:
${beneath
  .map((a) => `  · ${a.name} (${a.family})${reclaimedNote(a)} — ${aspectLine(a)}`)
  .join('\n')}`
        }
        return entry
      })
      .join('\n')
    return `${name}:\n${entries}`
  })
    .filter(Boolean)
    .join('\n\n')

  const allianceLines =
    alliances.length > 0
      ? alliances
          .map((group) => `- ${group.map(stackName).join(' + ')}`)
          .join('\n')
      : '- None — every seat stands apart.'

  const opening = manual
    ? `I completed an archetype roundtable reading in person with the physical deck, and I have transcribed my final table faithfully into a digital tool so we can work with it together.

About this reading:
- It was laid out by hand, card by card, and every placement below is deliberate.
- If I began this work in session with a human analyst, treat our conversation as a continuation of that work, not a restart.`
    : `I have just completed an archetype roundtable reading drawn from Myss's gallery of archetypes, and I want to explore it with you in a depth-psychology session.

How the reading worked:
1. I swiped through the whole deck of archetypes on fast instinct, keeping those I recognize in myself.
2. I then re-examined every card I had rejected, and reclaimed the ones I had been reluctant to admit (marked below).
3. I narrowed the keepers by holding only what is innate — what I can't help being — over what is adaptive, a skill I've merely learned.
4. Finally I arranged the remaining archetypes consciously on a roundtable of four concentric orbits around my own seat.`

  const reflect = manual
    ? 'which orbits carry the weight, what is held at the rim, which stacks and alliances look load-bearing.'
    : 'which orbits carry the weight, what is held at the rim, which stacks and alliances look load-bearing, and what the shadow-reclaimed cards change about the picture.'

  return `You are a Jungian depth psychoanalyst who also knows Caroline Myss's "Sacred Contracts" intimately — her Gallery of Archetypes, the survival archetypes, and her light/shadow framework. ${opening}

How to read my table — every placement below is deliberate and exact:
- The table has four concentric orbits around my seat. Ring 1 is right beside me (strongest identification); Ring 4 is the outer rim (held at a distance).
- A stack is a deliberate grouping of near-derivative archetypes: the top card is the face I identify with; the cards beneath fuel it.
- An alliance is two or more seats deliberately snapped side by side: they support each other, or keep each other in check.
- If I attach an image of the table, treat this text as authoritative — do not re-read the cards from the image.

${ringSections}

Side-by-side alliances:
${allianceLines}

Before any interpretation:
1. Briefly reflect the table back to me in your own words — what stands out structurally: ${reflect}
2. Ask me your clarifying questions — about ambiguous placements, my life context, and what prompted this reading. One focused round, not a long checklist.
3. Only then begin the analysis. Work dialogically: short reflections followed by questions, following what has energy rather than delivering a lecture. Pay particular attention to where each archetype's light and shadow poles are actually living in my life right now.`
}
