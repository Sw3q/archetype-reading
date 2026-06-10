import { useMemo, useState } from 'react'
import type { Archetype } from './types'
import { ARCHETYPES } from './data/archetypes'
import { StageLayout } from './components/StageLayout'
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
const ME = { label: 'This is me', hint: 'identify with it', color: '#6fc79a' }
const NOT_ME = { label: 'Not me', hint: "doesn't fit", color: '#d95b5b' }
const RECLAIM = { label: 'This is me too', hint: 'reclaim it', color: '#6fc79a' }
const STILL_NOT = { label: 'Still not me', hint: 'leave it', color: '#d95b5b' }

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

  function begin() {
    setSeed((s) => s + 1)
    setStage({ name: 'swipe' })
  }

  function restart() {
    setSeed((s) => s + 1)
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
          eyebrow="Stage 1 · The Gallery"
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
      const finish = (reclaimed: Archetype[]) =>
        route([...stage.kept, ...reclaimed])
      return (
        <StageLayout
          eyebrow="Stage 2 · The Shadow"
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
      return <Roundtable cards={stage.final} onRestart={restart} />

    case 'empty':
      return (
        <StageLayout
          eyebrow="Stage 1"
          title="No archetypes chosen"
          instruction="You swiped left on every card. The reading needs at least one archetype you identify with."
        >
          <button
            onClick={restart}
            className="rounded-full bg-white px-8 py-3 font-semibold text-black transition hover:scale-105 active:scale-95"
          >
            Try again
          </button>
        </StageLayout>
      )
  }
}

function Intro({ onBegin, count }: { onBegin: () => void; count: number }) {
  return (
    <StageLayout eyebrow="A Reading In Four Movements" title="Archetypes">
      <div className="flex max-w-md flex-col items-center gap-7 text-center">
        <p className="text-sm leading-relaxed text-white/65">
          The archetypes are patterns that move power through your psyche. This is a
          fast, intuitive reading drawn from Caroline Myss's gallery of {count}{' '}
          archetypes — meet them, narrow them, and seat the few that are most truly you.
        </p>
        <ol className="flex w-full flex-col gap-3 text-left">
          <Step n={1} title="The Gallery" body="Swipe through the deck — keep the archetypes you recognize in yourself." />
          <Step n={2} title="The Shadow" body="Look back through the ones you passed over — reclaim any you were reluctant to admit." />
          <Step n={3} title="Innate or Adaptive" body="Narrow the field to 8 — keep what you can't help being over what you've merely learned." />
          <Step n={4} title="The Roundtable" body="Arrange your 8 around the table by closeness and alliance, then export the image." />
        </ol>
        <button
          onClick={onBegin}
          className="rounded-full bg-white px-10 py-3.5 text-lg font-semibold text-black transition hover:scale-105 active:scale-95"
        >
          Begin the reading
        </button>
      </div>
    </StageLayout>
  )
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="flex gap-3.5">
      <span className="font-display flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 text-sm font-semibold text-white/80">
        {n}
      </span>
      <div>
        <p className="font-semibold text-white">{title}</p>
        <p className="text-sm text-white/55">{body}</p>
      </div>
    </li>
  )
}
