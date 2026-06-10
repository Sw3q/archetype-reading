import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { Archetype } from '../types'
import { ARCHETYPES } from '../data/archetypes'
import { FAMILY_COLOR } from '../lib/family'
import { exportNodeAsPng } from '../lib/exportImage'
import { buildPrompt, type SeatedCard } from '../lib/buildPrompt'
import { OrnamentRule } from './StageLayout'

interface RoundtableProps {
  cards: Archetype[]
  /** Ids reclaimed during the Shadow pass (used only in the AI prompt). */
  reclaimedIds?: string[]
  onRestart: () => void
  /** Manual-mapping mode: search/add/remove cards transcribed from an
   * in-person reading. Changes the header copy and the AI prompt framing. */
  editable?: {
    onAdd: (archetype: Archetype) => void
    onRemove: (id: string) => void
  }
}

/** Tokens whose boxes sit within this gap (fraction of table width) are "allied". */
const CLUSTER_GAP = 0.04

interface Box {
  cx: number
  cy: number
  l: number
  t: number
  r: number
  b: number
}

/** Shortest edge-to-edge distance between two boxes (0 when overlapping). */
function boxGap(a: Box, b: Box): number {
  const dx = Math.max(0, Math.max(a.l, b.l) - Math.min(a.r, b.r))
  const dy = Math.max(0, Math.max(a.t, b.t) - Math.min(a.b, b.b))
  return Math.hypot(dx, dy)
}

/** Read live token/You positions from the DOM (drag state lives in framer-motion,
 * not React state, so the rendered boxes are the source of truth). */
function readTable(table: HTMLDivElement, cards: Archetype[]) {
  const rect = table.getBoundingClientRect()
  const norm = (r: DOMRect): Box => ({
    cx: (r.left + r.width / 2 - rect.left) / rect.width,
    cy: (r.top + r.height / 2 - rect.top) / rect.height,
    l: (r.left - rect.left) / rect.width,
    t: (r.top - rect.top) / rect.height,
    r: (r.right - rect.left) / rect.width,
    b: (r.bottom - rect.top) / rect.height,
  })
  const you = norm(table.querySelector('[data-you]')!.getBoundingClientRect())
  const boxes = new Map<string, Box>()
  table.querySelectorAll<HTMLElement>('[data-token-id]').forEach((el) => {
    boxes.set(el.dataset.tokenId!, norm(el.getBoundingClientRect()))
  })

  const seated: SeatedCard[] = cards.map((archetype) => {
    const p = boxes.get(archetype.id)!
    return { archetype, dist: Math.hypot(p.cx - you.cx, p.cy - you.cy) }
  })

  // Allied clusters = connected components of near-touching tokens.
  const groups: Archetype[][] = []
  const assigned = new Set<string>()
  for (const card of cards) {
    if (assigned.has(card.id)) continue
    const group = [card]
    assigned.add(card.id)
    for (let i = 0; i < group.length; i++) {
      const gb = boxes.get(group[i].id)!
      for (const other of cards) {
        if (assigned.has(other.id)) continue
        if (boxGap(gb, boxes.get(other.id)!) <= CLUSTER_GAP) {
          group.push(other)
          assigned.add(other.id)
        }
      }
    }
    if (group.length > 1) groups.push(group)
  }

  return { seated, groups }
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

/** Spawn point for the i-th card added in mapping mode: a golden-angle spiral
 * out from the table's center, so successive adds never stack exactly. */
function spawnPosition(i: number): { left: number; top: number } {
  const clamp = (v: number) => Math.max(22, Math.min(78, v))
  const angle = i * 2.39996 // golden angle
  const radius = 8 + 7 * Math.sqrt(i)
  return {
    left: clamp(50 + radius * Math.cos(angle)),
    top: clamp(40 + radius * Math.sin(angle) * 0.8),
  }
}

/** Search-to-seat field for mapping mode. Enter seats the first match. */
function ArchetypeSearch({
  seatedIds,
  onAdd,
}: {
  seatedIds: Set<string>
  onAdd: (a: Archetype) => void
}) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return ARCHETYPES.filter(
      (a) =>
        !seatedIds.has(a.id) &&
        (a.name.toLowerCase().includes(q) || a.family.toLowerCase().includes(q)),
    ).slice(0, 7)
  }, [query, seatedIds])

  function add(a: Archetype) {
    onAdd(a)
    setQuery('')
    inputRef.current?.focus()
  }

  return (
    <div className="relative z-40 mb-3 w-[min(92vw,560px)] shrink-0">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches[0]) add(matches[0])
          if (e.key === 'Escape') setQuery('')
        }}
        placeholder="Search the deck — name or family — then press Enter to seat…"
        aria-label="Search archetypes"
        className="w-full border border-gold/30 bg-ink/70 px-4 py-2.5 font-body text-[15px] text-ivory transition outline-none placeholder:text-ivory/35 focus:border-gold/60"
      />
      {matches.length > 0 && (
        <ul className="absolute top-full right-0 left-0 mt-1 border border-gold/30 bg-panel/95 shadow-2xl backdrop-blur-sm">
          {matches.map((a) => (
            <li key={a.id}>
              <button
                onClick={() => add(a)}
                className="flex w-full items-baseline gap-2.5 px-4 py-2 text-left transition hover:bg-gold/10"
              >
                <span
                  aria-hidden
                  className="block h-1.5 w-1.5 shrink-0 translate-y-[-1px] rotate-45"
                  style={{ background: FAMILY_COLOR[a.family] }}
                />
                <span className="font-body text-[15px] text-ivory">{a.name}</span>
                <span
                  className="font-display ml-auto text-[9px] tracking-[0.25em] uppercase"
                  style={{ color: FAMILY_COLOR[a.family] }}
                >
                  {a.family}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
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

export function Roundtable({
  cards,
  reclaimedIds = [],
  onRestart,
  editable,
}: RoundtableProps) {
  const tableRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const [done, setDone] = useState(false)
  const [copied, setCopied] = useState(false)

  // Per-card spawn positions. Guided mode seeds the full ring up front;
  // mapping mode assigns a spiral spot to each card as it is added (and
  // remembers it, so a removed-then-re-added card returns where it spawned).
  const positionsRef = useRef(new Map<string, { left: number; top: number }>())
  const spawnCount = useRef(0)
  if (!editable && positionsRef.current.size === 0 && cards.length > 0) {
    const ring = initialLayout(cards.length)
    cards.forEach((c, i) => positionsRef.current.set(c.id, ring[i]))
  }
  cards.forEach((c) => {
    if (!positionsRef.current.has(c.id)) {
      positionsRef.current.set(c.id, spawnPosition(spawnCount.current++))
    }
  })

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

  async function handleCopyPrompt() {
    if (!tableRef.current) return
    const { seated, groups } = readTable(tableRef.current, cards)
    const prompt = buildPrompt(seated, groups, new Set(reclaimedIds), {
      manual: !!editable,
    })
    try {
      await navigator.clipboard.writeText(prompt)
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — legacy fallback.
      const ta = document.createElement('textarea')
      ta.value = prompt
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="starfield flex h-[100dvh] flex-col items-center overflow-y-auto px-5 py-5">
      <header className="mb-3 max-w-xl shrink-0 text-center">
        <p className="font-display text-[10px] font-medium tracking-[0.42em] text-gold/75 uppercase">
          {editable ? 'The Roundtable · Mapped by Hand' : 'IV · The Roundtable'}
        </p>
        <h1 className="font-display mt-2.5 text-[1.65rem] leading-tight font-semibold tracking-[0.08em] text-ivory uppercase sm:text-3xl">
          {editable ? 'Map your table' : 'Seat your archetypes'}
        </h1>
        <OrnamentRule className="mt-3" />
        <p className="mx-auto mt-2.5 max-w-md font-body text-[15px] leading-snug text-ivory/60">
          {editable ? (
            <>
              Recreate the table from your in-person reading: search the deck, seat
              each archetype, then drag it into place — those you identify with most
              <span className="text-gold-bright/90"> closest to You</span>, allied
              cards <span className="text-gold-bright/90">near each other</span>.
            </>
          ) : (
            <>
              Drag each archetype into place. Set the ones you identify with most
              <span className="text-gold-bright/90"> closest to You</span>. Place archetypes
              that are <span className="text-gold-bright/90">allied</span> — that support or
              keep each other in check — <span className="text-gold-bright/90">near each other</span>.
            </>
          )}
        </p>
      </header>

      {editable && (
        <ArchetypeSearch
          seatedIds={new Set(cards.map((c) => c.id))}
          onAdd={editable.onAdd}
        />
      )}

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
            data-you
            className="font-display flex h-16 w-16 items-center justify-center rounded-full border border-gold/80 bg-ink/80 text-[13px] font-semibold tracking-[0.18em] text-gold-bright uppercase"
            style={{ boxShadow: '0 0 0 3px rgba(11,9,8,0.9), 0 0 0 4px rgba(201,163,90,0.35), 0 0 30px -6px rgba(201,163,90,0.45)' }}
          >
            You
          </div>
        </div>

        {/* Empty-table hint (mapping mode) */}
        {editable && cards.length === 0 && (
          <p className="absolute inset-x-8 top-[36%] text-center font-body text-[15px] text-ivory/40 italic">
            Search the deck above to seat the first archetype from your reading.
          </p>
        )}

        {/* Draggable archetype tokens */}
        {cards.map((card) => (
          <Token
            key={card.id}
            archetype={card}
            start={positionsRef.current.get(card.id)!}
            constraintsRef={tableRef}
            onRemove={editable ? () => editable.onRemove(card.id) : undefined}
            hideRemove={exporting}
          />
        ))}
      </div>

      {/* Seated count (mapping mode) */}
      {editable && cards.length > 0 && (
        <p className="mt-2 shrink-0 font-body text-[13px] text-ivory/40 italic">
          {cards.length} seated
          {cards.length > 12 ? ' — past a dozen, the table gets hard to read' : ''}
        </p>
      )}

      {/* Controls (excluded from the export since they live outside tableRef) */}
      <div className="mt-4 flex shrink-0 flex-wrap items-center justify-center gap-3">
        <button onClick={onRestart} className="btn-ghost">
          Start over
        </button>
        <button onClick={handleCopyPrompt} className="btn-ghost">
          {copied ? 'Copied ✓' : 'Copy AI prompt'}
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
  onRemove,
  hideRemove,
}: {
  archetype: Archetype
  start: { left: number; top: number }
  constraintsRef: React.RefObject<HTMLDivElement | null>
  /** Present in mapping mode: unseat this card. */
  onRemove?: () => void
  /** Suppress the remove control while the table is being exported. */
  hideRemove?: boolean
}) {
  const accent = FAMILY_COLOR[archetype.family]
  const [active, setActive] = useState(false)
  // On touch devices there is no hover; a tap toggles the remove control.
  const [tapped, setTapped] = useState(false)
  return (
    <motion.div
      data-token-id={archetype.id}
      className="group draggable absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing"
      style={{ left: `${start.left}%`, top: `${start.top}%` }}
      drag
      dragConstraints={constraintsRef}
      dragElastic={0.04}
      dragMomentum={false}
      onDragStart={() => setActive(true)}
      onDragEnd={() => setActive(false)}
      onTap={() => onRemove && setTapped((t) => !t)}
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
      {onRemove && !hideRemove && (
        <button
          onPointerDownCapture={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          aria-label={`Remove ${archetype.name}`}
          className={`absolute -top-2.5 -right-2.5 z-20 flex h-5 w-5 items-center justify-center rounded-full border border-gold/50 bg-ink text-[10px] leading-none text-ivory/80 transition hover:border-gold hover:text-gold-bright ${
            tapped ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          ✕
        </button>
      )}
    </motion.div>
  )
}
