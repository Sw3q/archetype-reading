import { useState } from 'react'
import { motion } from 'framer-motion'
import type { Archetype } from '../types'
import { FAMILY_COLOR } from '../lib/family'
import { StageLayout } from './StageLayout'
import { SwipeStack } from './SwipeStack'

const TARGET = 8

const INNATE = { label: 'Innate', hint: "can't help it", color: '#6fc79a' }
const ADAPTIVE = { label: 'Adaptive', hint: 'a learned skill', color: '#d98a5b' }

interface FilterStageProps {
  cards: Archetype[]
  onComplete: (final: Archetype[]) => void
}

type Phase =
  | { kind: 'round'; pile: Archetype[]; round: number }
  | { kind: 'interstitial'; pile: Archetype[]; round: number; noProgress: boolean }
  | { kind: 'rescue'; keep: Archetype[]; pool: Archetype[] }

export function FilterStage({ cards, onComplete }: FilterStageProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'round', pile: cards, round: 1 })

  function finishRound(survivors: Archetype[], dropped: Archetype[], round: number, prevSize: number) {
    if (survivors.length > TARGET) {
      setPhase({
        kind: 'interstitial',
        pile: survivors,
        round: round + 1,
        noProgress: survivors.length === prevSize,
      })
    } else if (survivors.length === TARGET) {
      onComplete(survivors)
    } else {
      // Below target — let the seeker optionally pull a few back up to 8.
      setPhase({ kind: 'rescue', keep: survivors, pool: dropped })
    }
  }

  if (phase.kind === 'round') {
    const pile = phase.pile
    return (
      <StageLayout
        eyebrow={`Stage 3 · Round ${phase.round}`}
        title="Innate or Adaptive?"
        instruction="An innate archetype is one you can't help but live out. An adaptive one is a skill you've cultivated and are good at. Keep only the innate — they advance."
      >
        <SwipeStack
          key={`round-${phase.round}`}
          cards={pile}
          left={ADAPTIVE}
          right={INNATE}
          onComplete={({ left, right }) =>
            finishRound(right, left, phase.round, pile.length)
          }
        />
      </StageLayout>
    )
  }

  if (phase.kind === 'interstitial') {
    return (
      <StageLayout eyebrow="Stage 3" title="Round complete">
        <div className="flex max-w-sm flex-col items-center gap-6 text-center">
          <p className="text-6xl font-semibold text-white tabular-nums">
            {phase.pile.length}
          </p>
          <p className="text-sm text-white/60">
            archetypes remain. Keep narrowing to the {TARGET} that are most deeply,
            innately you.
          </p>
          {phase.noProgress && (
            <p className="rounded-xl bg-amber-400/10 px-4 py-2 text-xs text-amber-200/80">
              You kept them all. Be ruthless this round — which could you truly never
              switch off?
            </p>
          )}
          <button
            onClick={() =>
              setPhase({ kind: 'round', pile: phase.pile, round: phase.round })
            }
            className="rounded-full bg-white px-8 py-3 font-semibold text-black transition hover:scale-105 active:scale-95"
          >
            Next round
          </button>
        </div>
      </StageLayout>
    )
  }

  // rescue
  return <RescuePhase keep={phase.keep} pool={phase.pool} onDone={onComplete} />
}

function RescuePhase({
  keep,
  pool,
  onDone,
}: {
  keep: Archetype[]
  pool: Archetype[]
  onDone: (final: Archetype[]) => void
}) {
  const [picked, setPicked] = useState<Archetype[]>([])
  const slotsLeft = TARGET - keep.length - picked.length
  const finalCount = keep.length + picked.length

  function toggle(card: Archetype) {
    setPicked((p) =>
      p.find((c) => c.id === card.id)
        ? p.filter((c) => c.id !== card.id)
        : slotsLeft > 0
          ? [...p, card]
          : p,
    )
  }

  return (
    <StageLayout
      eyebrow="Stage 3 · Almost there"
      title={keep.length === 0 ? 'Pick your circle' : 'Top up your circle'}
      instruction={
        keep.length === 0
          ? `You filtered everything out. Choose up to ${TARGET} to seat at your roundtable.`
          : `You have ${keep.length}. Optionally pull a few favorites back up to ${TARGET}, then continue.`
      }
    >
      <div className="flex w-full max-w-2xl flex-col items-center gap-6">
        {keep.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {keep.map((c) => (
              <Chip key={c.id} archetype={c} selected disabled />
            ))}
          </div>
        )}
        {pool.length > 0 && (
          <div className="flex max-h-[40vh] flex-wrap justify-center gap-2 overflow-y-auto">
            {pool.map((c) => (
              <Chip
                key={c.id}
                archetype={c}
                selected={!!picked.find((p) => p.id === c.id)}
                onClick={() => toggle(c)}
              />
            ))}
          </div>
        )}
      </div>
      <FooterButton
        label={`Seat ${finalCount} at the roundtable →`}
        disabled={finalCount === 0}
        onClick={() => onDone([...keep, ...picked])}
      />
    </StageLayout>
  )
}

function Chip({
  archetype,
  selected,
  disabled,
  onClick,
}: {
  archetype: Archetype
  selected?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  const accent = FAMILY_COLOR[archetype.family]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
        disabled ? 'cursor-default' : 'hover:scale-105 active:scale-95'
      }`}
      style={{
        borderColor: selected ? accent : 'rgba(255,255,255,0.15)',
        background: selected ? `${accent}22` : 'transparent',
        color: selected ? accent : 'rgba(255,255,255,0.7)',
      }}
    >
      {archetype.name}
    </button>
  )
}

function FooterButton({
  label,
  onClick,
  disabled,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.96 }}
      className="mt-2 rounded-full bg-white px-8 py-3 font-semibold text-black transition enabled:hover:scale-105 disabled:opacity-40"
    >
      {label}
    </motion.button>
  )
}
