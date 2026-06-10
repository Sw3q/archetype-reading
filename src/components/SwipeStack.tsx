import { useEffect, useRef, useState } from 'react'
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from 'framer-motion'
import type { Archetype } from '../types'
import { Card } from './Card'

export interface SwipeSide {
  /** Short verb shown on the button, e.g. "This is me" or "Innate". */
  label: string
  /** Optional helper line under the button. */
  hint?: string
  color: string
}

interface SwipeStackProps {
  cards: Archetype[]
  left: SwipeSide
  right: SwipeSide
  onComplete: (result: { left: Archetype[]; right: Archetype[] }) => void
  /** When provided, a Skip control appears that finishes early with progress so far. */
  onSkip?: (result: { left: Archetype[]; right: Archetype[] }) => void
  skipLabel?: string
}

const THRESHOLD = 110 // px past which a release counts as a swipe

/** The single interactive top card. Lower cards in the stack are static. */
function TopCard({
  archetype,
  onDecide,
  left,
  right,
  enterFrom,
}: {
  archetype: Archetype
  onDecide: (dir: 'left' | 'right') => void
  left: SwipeSide
  right: SwipeSide
  /** When restored via undo, the card flies back in from this side. */
  enterFrom?: 'left' | 'right' | null
}) {
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-200, 200], [-14, 14])
  const yesOpacity = useTransform(x, [10, THRESHOLD], [0, 1])
  const noOpacity = useTransform(x, [-THRESHOLD, -10], [1, 0])
  const [hint, setHint] = useState<'yes' | 'no' | null>(null)

  function handleDragEnd(_e: unknown, info: PanInfo) {
    const offset = info.offset.x
    const velocity = info.velocity.x
    if (offset > THRESHOLD || velocity > 700) onDecide('right')
    else if (offset < -THRESHOLD || velocity < -700) onDecide('left')
    else setHint(null)
  }

  return (
    <motion.div
      className="draggable absolute inset-0 cursor-grab active:cursor-grabbing"
      style={{ x, rotate }}
      initial={
        enterFrom ? { x: enterFrom === 'left' ? -600 : 600, opacity: 0 } : false
      }
      animate={{ x: 0, opacity: 1, transition: { duration: 0.28 } }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDrag={(_e, info) =>
        setHint(info.offset.x > 20 ? 'yes' : info.offset.x < -20 ? 'no' : null)
      }
      onDragEnd={handleDragEnd}
      exit={{
        x: hint === 'no' ? -600 : 600,
        opacity: 0,
        transition: { duration: 0.25 },
      }}
      whileTap={{ scale: 1.02 }}
    >
      <Card archetype={archetype} hint={hint} />
      {/* Color wash tied to drag direction */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{ background: right.color, opacity: yesOpacity, mixBlendMode: 'soft-light' }}
      />
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{ background: left.color, opacity: noOpacity, mixBlendMode: 'soft-light' }}
      />
    </motion.div>
  )
}

export function SwipeStack({
  cards,
  left,
  right,
  onComplete,
  onSkip,
  skipLabel = 'Skip the rest',
}: SwipeStackProps) {
  const [index, setIndex] = useState(0)
  const result = useRef<{ left: Archetype[]; right: Archetype[] }>({
    left: [],
    right: [],
  })

  // Order of decisions so the back button can reverse the most recent one.
  const history = useRef<('left' | 'right')[]>([])
  // Direction the just-undone card should fly back in from.
  const [undoFrom, setUndoFrom] = useState<'left' | 'right' | null>(null)

  // Reset when a fresh set of cards arrives (e.g. a new filter round).
  useEffect(() => {
    setIndex(0)
    result.current = { left: [], right: [] }
    history.current = []
    setUndoFrom(null)
  }, [cards])

  function decide(dir: 'left' | 'right') {
    const card = cards[index]
    if (!card) return
    setUndoFrom(null)
    result.current[dir].push(card)
    history.current.push(dir)
    const next = index + 1
    setIndex(next)
    if (next >= cards.length) {
      // Defer so the exit animation can start before parent swaps the view.
      const snapshot = result.current
      setTimeout(() => onComplete(snapshot), 260)
    }
  }

  function undo() {
    if (index === 0 || history.current.length === 0) return
    const dir = history.current.pop()!
    result.current[dir].pop()
    setUndoFrom(dir)
    setIndex(index - 1)
  }

  // Undo is unavailable once every card is decided (the view is mid-handoff).
  const canUndo = index > 0 && index < cards.length
  const remaining = cards.length - index
  const visible = cards.slice(index, index + 3)

  return (
    <div className="flex w-full flex-col items-center gap-4">
      {/* Progress */}
      <div className="flex w-full max-w-sm items-center gap-3">
        <div className="h-px flex-1 bg-gold/15">
          <div
            className="h-px bg-gold/70 transition-all duration-300"
            style={{ width: `${(index / cards.length) * 100}%` }}
          />
        </div>
        <span className="font-display text-[10px] tracking-[0.25em] text-gold/70 uppercase tabular-nums">
          {remaining} left
        </span>
      </div>

      {/* Card stack — width also capped by viewport height (card is 4/3 of its
          width; ~390px of chrome surrounds it) so the stage never scrolls. */}
      <div className="relative aspect-[3/4] w-[min(86vw,360px,calc((100dvh-390px)*0.75))]">
        {visible
          .map((card, i) => {
            const depth = i // 0 = top
            if (depth === 0) {
              return (
                <AnimatePresence key={card.id} custom={card.id}>
                  <TopCard
                    key={card.id}
                    archetype={card}
                    onDecide={decide}
                    left={left}
                    right={right}
                    enterFrom={undoFrom}
                  />
                </AnimatePresence>
              )
            }
            return (
              <div
                key={card.id}
                className="absolute inset-0"
                style={{
                  // Peek upward so only the clean colored accent edge shows
                  // behind the top card (downward peek would reveal blurb text).
                  transform: `scale(${1 - depth * 0.045}) translateY(${depth * -12}px)`,
                  zIndex: -depth,
                  opacity: 1 - depth * 0.3,
                }}
              >
                <Card archetype={card} />
              </div>
            )
          })
          // Render lower cards first so the top card paints last (on top).
          .reverse()}
      </div>

      {/* Buttons */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-7">
          <button
            data-testid="swipe-no"
            onClick={() => decide('left')}
            className="flex h-16 w-16 items-center justify-center rounded-full border bg-ink/60 text-xl transition hover:scale-110 hover:bg-ink active:scale-95"
            style={{ borderColor: `${left.color}88`, color: left.color }}
            aria-label={left.label}
          >
            ✕
          </button>
          <div className="font-display flex flex-col items-center gap-1.5 text-center text-[10px] tracking-[0.2em] uppercase">
            <span style={{ color: `${left.color}cc` }}>← {left.label}</span>
            <span style={{ color: right.color }}>{right.label} →</span>
          </div>
          <button
            data-testid="swipe-yes"
            onClick={() => decide('right')}
            className="flex h-16 w-16 items-center justify-center rounded-full border bg-ink/60 text-xl transition hover:scale-110 hover:bg-ink active:scale-95"
            style={{
              borderColor: right.color,
              color: right.color,
              boxShadow: '0 0 24px -8px rgba(201,163,90,0.5)',
            }}
            aria-label={right.label}
          >
            ✓
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button
            data-testid="swipe-undo"
            onClick={undo}
            disabled={!canUndo}
            className="font-body px-3 py-1.5 text-[13px] text-ivory/50 italic transition hover:text-gold-bright disabled:pointer-events-none disabled:opacity-0"
            aria-label="Undo last card"
          >
            ↶ Undo last card
          </button>
          {onSkip && (
            <button
              data-testid="swipe-skip"
              onClick={() => onSkip(result.current)}
              className="font-display border border-gold/30 px-4 py-2 text-[10px] tracking-[0.2em] text-gold/80 uppercase transition hover:border-gold/60 hover:text-gold-bright"
            >
              {skipLabel} →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
