import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { Archetype } from '../types'
import { FAMILY_COLOR } from '../lib/family'
import { exportNodeAsPng } from '../lib/exportImage'

interface RoundtableProps {
  cards: Archetype[]
  onRestart: () => void
}

/** Initial token positions: spread around a circle in the upper table, so the
 * seeker drags them inward toward the "You" node at the bottom. Values are
 * percentages of the table surface. */
function initialLayout(n: number): { left: number; top: number }[] {
  const cx = 50
  const cy = 40
  const radius = 28
  const clamp = (v: number) => Math.max(22, Math.min(78, v))
  return Array.from({ length: n }, (_, i) => {
    // Spread across the top ~270° arc, avoiding the bottom where "You" sits.
    const t = n === 1 ? 0 : i / (n - 1)
    const angle = (-215 + t * 250) * (Math.PI / 180)
    return {
      left: clamp(cx + radius * Math.cos(angle)),
      top: clamp(cy + radius * Math.sin(angle)),
    }
  })
}

export function Roundtable({ cards, onRestart }: RoundtableProps) {
  const tableRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const [done, setDone] = useState(false)
  const layout = useRef(initialLayout(cards.length)).current

  async function handleExport() {
    if (!tableRef.current) return
    setExporting(true)
    try {
      await exportNodeAsPng(tableRef.current)
      setDone(true)
      setTimeout(() => setDone(false), 2500)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="starfield flex min-h-[100dvh] flex-col items-center px-4 py-6">
      <header className="mb-3 max-w-xl shrink-0 text-center">
        <p className="text-[11px] font-semibold tracking-[0.25em] text-white/40 uppercase">
          Stage 4 · The Roundtable
        </p>
        <h1 className="font-display mt-1 text-3xl font-semibold text-white sm:text-4xl">
          Seat your archetypes
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/55">
          Drag each archetype into place. Set the ones you identify with most
          <span className="text-white/80"> closest to You</span>. Place archetypes
          that are <span className="text-white/80">allied</span> — that support or
          keep each other in check — <span className="text-white/80">near each other</span>.
        </p>
      </header>

      {/* The exportable table surface — a rounded square so tokens are never
          clipped by a circular edge; the rings below depict the round table. */}
      <div
        ref={tableRef}
        className="relative aspect-square w-[min(92vw,560px)] shrink-0 overflow-hidden rounded-[2rem]"
        style={{
          background:
            'radial-gradient(circle at 50% 44%, #241f33 0%, #181426 55%, #100d1a 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Concentric proximity rings (the "round" table), centered on You-ward focus */}
        {[0.92, 0.68, 0.44, 0.2].map((s) => (
          <div
            key={s}
            className="absolute aspect-square rounded-full border border-white/5"
            style={{
              width: `${s * 100}%`,
              left: '50%',
              top: '40%',
              transform: 'translate(-50%, -50%)',
            }}
          />
        ))}

        {/* "You" node, fixed at bottom-center */}
        <div className="absolute bottom-[6%] left-1/2 flex -translate-x-1/2 flex-col items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/70 bg-white/10 text-center font-display text-lg font-semibold text-white shadow-lg backdrop-blur-sm">
            You
          </div>
        </div>

        {/* Draggable archetype tokens */}
        {cards.map((card, i) => (
          <Token
            key={card.id}
            archetype={card}
            start={layout[i]}
            constraintsRef={tableRef}
          />
        ))}
      </div>

      {/* Controls (excluded from the export since they live outside tableRef) */}
      <div className="mt-5 flex shrink-0 items-center gap-3">
        <button
          onClick={onRestart}
          className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/5"
        >
          Start over
        </button>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black transition hover:scale-105 active:scale-95 disabled:opacity-50"
        >
          {exporting ? 'Rendering…' : done ? 'Saved ✓' : 'Export as image'}
        </button>
      </div>
    </div>
  )
}

function Token({
  archetype,
  start,
  constraintsRef,
}: {
  archetype: Archetype
  start: { left: number; top: number }
  constraintsRef: React.RefObject<HTMLDivElement | null>
}) {
  const accent = FAMILY_COLOR[archetype.family]
  const [active, setActive] = useState(false)
  return (
    <motion.div
      className="draggable absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing"
      style={{ left: `${start.left}%`, top: `${start.top}%` }}
      drag
      dragConstraints={constraintsRef}
      dragElastic={0.04}
      dragMomentum={false}
      onDragStart={() => setActive(true)}
      onDragEnd={() => setActive(false)}
      whileDrag={{ scale: 1.08, zIndex: 30 }}
    >
      <div
        className="flex max-w-[130px] select-none items-center gap-1.5 rounded-2xl border px-2.5 py-1.5 shadow-lg backdrop-blur-sm"
        style={{
          borderColor: accent,
          background: active ? `${accent}33` : 'rgba(20,17,30,0.85)',
        }}
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: accent }}
        />
        <span className="text-center text-[11px] leading-tight font-semibold text-white">
          {archetype.name}
        </span>
      </div>
    </motion.div>
  )
}
