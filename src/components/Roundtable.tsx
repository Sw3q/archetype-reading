import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { Archetype } from '../types'
import { FAMILY_COLOR } from '../lib/family'
import { exportNodeAsPng } from '../lib/exportImage'
import { OrnamentRule } from './StageLayout'

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

/** Engraved table: concentric gold rings, dotted orbit, tick marks, center star. */
function TableEngraving() {
  const ticks = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2
    const r1 = 45.5
    const r2 = i % 6 === 0 ? 43 : 44.3
    return {
      x1: 50 + r1 * Math.cos(a),
      y1: 40 + r1 * Math.sin(a),
      x2: 50 + r2 * Math.cos(a),
      y2: 40 + r2 * Math.sin(a),
    }
  })
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
      <g fill="none" stroke="#c9a35a">
        <circle cx="50" cy="40" r="46" strokeWidth="0.25" opacity="0.4" />
        {ticks.map((t, i) => (
          <line key={i} {...t} strokeWidth="0.25" opacity="0.45" />
        ))}
        <circle cx="50" cy="40" r="38" strokeWidth="0.2" opacity="0.28" />
        <circle cx="50" cy="40" r="29" strokeWidth="0.2" opacity="0.2" strokeDasharray="0.4 2.2" />
        <circle cx="50" cy="40" r="17" strokeWidth="0.2" opacity="0.16" />
        <path
          d="M50 33.5 L51.6 38.4 L56.5 40 L51.6 41.6 L50 46.5 L48.4 41.6 L43.5 40 L48.4 38.4 Z"
          strokeWidth="0.3"
          opacity="0.4"
        />
      </g>
    </svg>
  )
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
    <div className="starfield flex h-[100dvh] flex-col items-center overflow-y-auto px-5 py-5">
      <header className="mb-3 max-w-xl shrink-0 text-center">
        <p className="font-display text-[10px] font-medium tracking-[0.42em] text-gold/75 uppercase">
          IV · The Roundtable
        </p>
        <h1 className="font-display mt-2.5 text-[1.65rem] leading-tight font-semibold tracking-[0.08em] text-ivory uppercase sm:text-3xl">
          Seat your archetypes
        </h1>
        <OrnamentRule className="mt-3" />
        <p className="mx-auto mt-2.5 max-w-md font-body text-[15px] leading-snug text-ivory/60">
          Drag each archetype into place. Set the ones you identify with most
          <span className="text-gold-bright/90"> closest to You</span>. Place archetypes
          that are <span className="text-gold-bright/90">allied</span> — that support or
          keep each other in check — <span className="text-gold-bright/90">near each other</span>.
        </p>
      </header>

      {/* The exportable table surface */}
      <div
        ref={tableRef}
        className="tarot-frame relative aspect-square w-[min(92vw,560px,calc(100dvh-320px))] shrink-0 overflow-hidden"
        style={{
          background:
            'radial-gradient(circle at 50% 42%, #1a140c 0%, #120e09 52%, #0b0908 100%)',
        }}
      >
        <TableEngraving />

        {/* "You" node, fixed at bottom-center */}
        <div className="absolute bottom-[5%] left-1/2 flex -translate-x-1/2 flex-col items-center">
          <div
            className="font-display flex h-16 w-16 items-center justify-center rounded-full border border-gold/80 bg-ink/80 text-[13px] font-semibold tracking-[0.18em] text-gold-bright uppercase"
            style={{ boxShadow: '0 0 0 3px rgba(11,9,8,0.9), 0 0 0 4px rgba(201,163,90,0.35), 0 0 30px -6px rgba(201,163,90,0.45)' }}
          >
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
      <div className="mt-4 flex shrink-0 items-center gap-3">
        <button onClick={onRestart} className="btn-ghost">
          Start over
        </button>
        <button onClick={handleExport} disabled={exporting} className="btn-gold">
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
        className="flex max-w-[130px] items-center gap-1.5 border px-2.5 py-1.5 select-none"
        style={{
          borderColor: active ? accent : `${accent}99`,
          background: active ? `${accent}26` : 'rgba(13,10,8,0.88)',
          boxShadow: '0 6px 18px -8px rgba(0,0,0,0.8)',
        }}
      >
        <span
          aria-hidden
          className="block h-1.5 w-1.5 shrink-0 rotate-45"
          style={{ background: accent }}
        />
        <span className="font-body text-center text-[12px] leading-tight font-medium text-ivory">
          {archetype.name}
        </span>
      </div>
    </motion.div>
  )
}
