import { useMemo, useState } from 'react'
import type { Archetype } from './types'
import { ARCHETYPES } from './data/archetypes'
import { StageLayout, OrnamentRule } from './components/StageLayout'
import { SwipeStack } from './components/SwipeStack'
import { FilterStage } from './components/FilterStage'
import { Roundtable } from './components/Roundtable'

type Stage =
  | { name: 'intro' }
  | { name: 'swipe' }
  | { name: 'shadow'; kept: Archetype[]; rejected: Archetype[] }
  | { name: 'filter'; kept: Archetype[] }
  | { name: 'roundtable'; final: Archetype[] }
  | { name: 'empty' }

const TARGET = 8
// Gold = claimed (the sun); ash = set aside (the waning moon).
const GOLD = '#c9a35a'
const ASH = '#8f8a7c'
const ME = { label: 'This is me', hint: 'identify with it', color: GOLD }
const NOT_ME = { label: 'Not me', hint: "doesn't fit", color: ASH }
const RECLAIM = { label: 'This is me too', hint: 'reclaim it', color: GOLD }
const STILL_NOT = { label: 'Still not me', hint: 'leave it', color: ASH }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function App() {
  const [stage, setStage] = useState<Stage>({ name: 'intro' })
  // A fresh shuffle each time a reading begins.
  const [seed, setSeed] = useState(0)
  const deck = useMemo(() => shuffle(ARCHETYPES), [seed])
  // Ids reclaimed during the Shadow pass — not shown in the UI, but fed into
  // the AI-session prompt as "initially denied, then admitted".
  const [reclaimedIds, setReclaimedIds] = useState<string[]>([])

  function begin() {
    setSeed((s) => s + 1)
    setReclaimedIds([])
    setStage({ name: 'swipe' })
  }

  function restart() {
    setSeed((s) => s + 1)
    setReclaimedIds([])
    setStage({ name: 'intro' })
  }

  // Route the kept pile onward: nothing → empty; ≤8 → roundtable; >8 → filter.
  function route(kept: Archetype[]) {
    if (kept.length === 0) setStage({ name: 'empty' })
    else if (kept.length <= TARGET) setStage({ name: 'roundtable', final: kept })
    else setStage({ name: 'filter', kept })
  }

  function onSwipeDone(kept: Archetype[], rejected: Archetype[]) {
    // Always offer the shadow second-look (unless nothing was rejected).
    if (rejected.length === 0) route(kept)
    else setStage({ name: 'shadow', kept, rejected })
  }

  switch (stage.name) {
    case 'intro':
      return <Intro onBegin={begin} count={ARCHETYPES.length} />

    case 'swipe':
      return (
        <StageLayout
          eyebrow="I · The Gallery"
          title="This is me?"
          instruction="Go with your gut. Swipe right on every archetype you recognize in yourself, left on those you don't. Don't overthink it."
        >
          <SwipeStack
            key={`deck-${seed}`}
            cards={deck}
            left={NOT_ME}
            right={ME}
            onComplete={({ left, right }) => onSwipeDone(right, left)}
          />
        </StageLayout>
      )

    case 'shadow': {
      // Reviewing the rejected pile: right = reclaim. Reclaimed merge into kept.
      const finish = (reclaimed: Archetype[]) => {
        setReclaimedIds(reclaimed.map((a) => a.id))
        route([...stage.kept, ...reclaimed])
      }
      return (
        <StageLayout
          eyebrow="II · The Shadow"
          title="Look again"
          instruction="These are the archetypes you passed over. Some you may have been reluctant — or unwilling — to claim. Swipe right on any that, honestly, are also you."
        >
          <SwipeStack
            key={`shadow-${seed}`}
            cards={stage.rejected}
            left={STILL_NOT}
            right={RECLAIM}
            onComplete={({ right }) => finish(right)}
            onSkip={({ right }) => finish(right)}
            skipLabel="I'm done looking"
          />
        </StageLayout>
      )
    }

    case 'filter':
      return (
        <FilterStage
          cards={stage.kept}
          onComplete={(final) => setStage({ name: 'roundtable', final })}
        />
      )

    case 'roundtable':
      return (
        <Roundtable
          cards={stage.final}
          reclaimedIds={reclaimedIds}
          onRestart={restart}
        />
      )

    case 'empty':
      return (
        <StageLayout
          eyebrow="I · The Gallery"
          title="No archetypes chosen"
          instruction="You swiped left on every card. The reading needs at least one archetype you identify with."
        >
          <button onClick={restart} className="btn-gold">
            Try again
          </button>
        </StageLayout>
      )
  }
}

/** Eight-pointed star within engraved rings — the reading's sigil. */
function Sigil() {
  return (
    <svg viewBox="0 0 120 120" className="h-20 w-20" aria-hidden>
      <g fill="none" stroke="#c9a35a">
        <circle cx="60" cy="60" r="56" strokeWidth="1" opacity="0.3" />
        <circle cx="60" cy="60" r="50" strokeWidth="0.75" opacity="0.45" strokeDasharray="1 4" />
        <path
          d="M60 14 L67 53 L106 60 L67 67 L60 106 L53 67 L14 60 L53 53 Z"
          strokeWidth="1.1"
          opacity="0.9"
        />
        <path
          d="M60 34 L65 55 L86 60 L65 65 L60 86 L55 65 L34 60 L55 55 Z"
          strokeWidth="0.9"
          opacity="0.55"
          transform="rotate(45 60 60)"
        />
        <circle cx="60" cy="60" r="4" fill="#ecd296" stroke="none" opacity="0.95" />
      </g>
    </svg>
  )
}

const MOVEMENTS = [
  {
    numeral: 'I',
    title: 'The Gallery',
    body: 'Swipe through the deck — keep the archetypes you recognize in yourself.',
  },
  {
    numeral: 'II',
    title: 'The Shadow',
    body: 'Look back through the ones you passed over — reclaim any you were reluctant to admit.',
  },
  {
    numeral: 'III',
    title: 'Innate or Adaptive',
    body: "Narrow the field to 8 — keep what you can't help being over what you've merely learned.",
  },
  {
    numeral: 'IV',
    title: 'The Roundtable',
    body: 'Arrange your 8 around the table by closeness and alliance, then export the image.',
  },
]

function Intro({ onBegin, count }: { onBegin: () => void; count: number }) {
  return (
    <div className="starfield relative flex min-h-[100dvh] flex-col items-center justify-center px-6 py-14">
      <div className="flex w-full max-w-4xl flex-col items-center text-center">
        <div className="rise" style={{ animationDelay: '0.05s' }}>
          <Sigil />
        </div>

        <div
          className="rise mt-7 flex items-center justify-center gap-3"
          style={{ animationDelay: '0.15s' }}
        >
          <span aria-hidden className="h-px w-12 bg-gradient-to-l from-gold/50 to-transparent sm:w-20" />
          <p className="font-display text-[10px] font-medium tracking-[0.42em] whitespace-nowrap text-gold/80 uppercase sm:text-[11px]">
            A Reading in Four Movements
          </p>
          <span aria-hidden className="h-px w-12 bg-gradient-to-r from-gold/50 to-transparent sm:w-20" />
        </div>

        <h1
          className="gold-foil rise font-display mt-4 text-[2.05rem] font-semibold tracking-[0.14em] uppercase sm:text-5xl md:text-6xl"
          style={{ animationDelay: '0.25s' }}
        >
          Archetypes
        </h1>

        <p
          className="rise font-body mt-6 max-w-xl text-[17px] leading-relaxed text-ivory/65"
          style={{ animationDelay: '0.35s' }}
        >
          The archetypes are patterns that move power through your psyche. This is a
          fast, intuitive reading drawn from Caroline Myss's gallery of {count}{' '}
          archetypes — meet them, narrow them, and seat the few that are most truly you.
        </p>

        <ol className="rise mt-10 grid w-full grid-cols-1 gap-3.5 text-left sm:grid-cols-2 lg:grid-cols-4" style={{ animationDelay: '0.45s' }}>
          {MOVEMENTS.map((m) => (
            <li key={m.numeral} className="tarot-frame bg-ink-2/60 px-5 pt-5 pb-6">
              <p className="font-display text-xl text-gold/90">{m.numeral}</p>
              <div aria-hidden className="mt-2.5 mb-3 h-px w-8 bg-gold/30" />
              <p className="font-display text-[12px] font-semibold tracking-[0.14em] text-ivory uppercase">
                {m.title}
              </p>
              <p className="font-body mt-2 text-[14px] leading-snug text-ivory/55">{m.body}</p>
            </li>
          ))}
        </ol>

        <div className="rise mt-10" style={{ animationDelay: '0.55s' }}>
          <button onClick={onBegin} className="btn-gold">
            Begin the reading
          </button>
        </div>

        <p
          className="rise font-body mt-7 text-[13px] text-ivory/35 italic"
          style={{ animationDelay: '0.65s' }}
        >
          After the Gallery of Archetypes of Caroline Myss
        </p>
        <OrnamentRule className="rise mt-4 opacity-70" />
      </div>
    </div>
  )
}
