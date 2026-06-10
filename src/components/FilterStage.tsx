import { useState } from 'react'
import { motion } from 'framer-motion'
import type { Archetype } from '../types'
import { FAMILY_COLOR } from '../lib/family'
import { StageLayout, OrnamentRule } from './StageLayout'
import { SwipeStack } from './SwipeStack'

const TARGET = 8

// Innate is the sun you were born under; adaptive is moonlight you learned to carry.
const INNATE = { label: 'Innate', hint: "can't help it", color: '#c9a35a' }
const ADAPTIVE = { label: 'Adaptive', hint: 'a learned skill', color: '#8f8a7c' }

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
        eyebrow={`III · Round ${phase.round}`}
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
      <StageLayout eyebrow="III · The Narrowing" title="Round complete">
        <div className="flex max-w-sm flex-col items-center gap-6 text-center">
          <p className="gold-foil font-display text-7xl font-semibold tabular-nums">
            {phase.pile.length}
          </p>
          <OrnamentRule />
          <p className="font-body text-[15px] leading-relaxed text-ivory/60">
            archetypes remain. Keep narrowing to the {TARGET} that are most deeply,
            innately you.
          </p>
          {phase.noProgress && (
            <p className="border border-fam-creative/40 px-5 py-2.5 font-body text-[13px] text-fam-creative/90 italic">
              You kept them all. Be ruthless this round — which could you truly never
              switch off?
            </p>
          )}
          <button
            onClick={() =>
              setPhase({ kind: 'round', pile: phase.pile, round: phase.round })
            }
            className="btn-gold"
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
      eyebrow="III · Almost There"
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
      className={`font-body border px-3.5 py-1.5 text-[14px] transition ${
        disabled ? 'cursor-default' : 'hover:scale-105 active:scale-95'
      }`}
      style={{
        borderColor: selected ? `${accent}cc` : 'rgba(201,163,90,0.25)',
        background: selected ? `${accent}1f` : 'transparent',
        color: selected ? accent : 'rgba(233,225,205,0.65)',
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
      whileTap={{ scale: 0.97 }}
      className="btn-gold mt-8"
    >
      {label}
    </motion.button>
  )
}
