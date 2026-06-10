import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useMotionValue } from 'framer-motion'
import type { Archetype } from '../types'
import { ARCHETYPES } from '../data/archetypes'
import { FAMILY_COLOR } from '../lib/family'
import { exportNodeAsPng } from '../lib/exportImage'
import { buildPrompt, type PromptStack } from '../lib/buildPrompt'
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

/* ------------------------------------------------------------------ *
 * Polar geometry: four orbits around the You seal at the table bottom.
 * All units are percentages of the table's width/height.
 * ------------------------------------------------------------------ */

const YOU = { x: 50, y: 86 }
/** Orbit radius + max angle (radians, measured from straight-up) that keeps
 * a token inside the table bounds on that orbit. */
const RINGS = [
  { r: 14, max: 0.78 },
  { r: 28, max: 1.21 },
  { r: 42, max: 1.08 },
  { r: 56, max: 0.72 },
]
/** Released boxes whose edge gap is within this many table-% units ally. */
const ALLY_GAP = 4.5

function ringPos(ring: number, phi: number): { left: number; top: number } {
  const { r } = RINGS[ring]
  return { left: YOU.x + r * Math.sin(phi), top: YOU.y - r * Math.cos(phi) }
}

const clampPhi = (ring: number, phi: number) =>
  Math.max(-RINGS[ring].max, Math.min(RINGS[ring].max, phi))

/** A seat on the table: one card, or a stack (cards[0] = primary/top). */
interface Seat {
  id: string
  cards: string[]
  ring: number
  phi: number
}

/** Even spread of n seats across the outer orbits (guided mode's start). */
function initialSeats(cards: Archetype[]): Seat[] {
  const seats: Seat[] = []
  const place = (ids: string[], ring: number) => {
    const { max } = RINGS[ring]
    ids.forEach((id, i) => {
      const t = ids.length === 1 ? 0.5 : i / (ids.length - 1)
      seats.push({ id, cards: [id], ring, phi: (t * 2 - 1) * max * 0.82 })
    })
  }
  const ids = cards.map((c) => c.id)
  place(ids.slice(0, 4), 3)
  place(ids.slice(4, 8), 2)
  place(ids.slice(8), 1)
  return seats
}

/** First uncrowded slot for a new seat, scanning outer orbits inward. */
function findFreeSlot(seats: Seat[]): { ring: number; phi: number } {
  for (let ring = 3; ring >= 0; ring--) {
    const { r, max } = RINGS[ring]
    const sep = 26 / r // ≈ one token width of angular separation
    const taken = seats.filter((s) => s.ring === ring).map((s) => s.phi)
    for (let k = 0; k < 24; k++) {
      // 0, +step, -step, +2·step… fanning out from the top of the arc.
      // Step must exceed the separation or consecutive candidates collide.
      const phi = (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * (sep * 1.1)
      if (Math.abs(phi) > max) break
      if (taken.every((t) => Math.abs(t - phi) >= sep)) return { ring, phi }
    }
  }
  return { ring: 3, phi: (Math.random() * 2 - 1) * RINGS[3].max }
}

/* ------------------------------------------------------------------ */

/** Engraved table: four orbit arcs fanning out from the You seal. */
function TableEngraving() {
  const arc = (ring: number) => {
    const { r, max } = RINGS[ring]
    const x1 = YOU.x + r * Math.sin(-max)
    const y1 = YOU.y - r * Math.cos(-max)
    const x2 = YOU.x + r * Math.sin(max)
    const y2 = YOU.y - r * Math.cos(max)
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`
  }
  // Tick marks along the outer arc.
  const ticks = Array.from({ length: 13 }, (_, i) => {
    const phi = -RINGS[3].max + (i / 12) * 2 * RINGS[3].max
    const r1 = RINGS[3].r + 2.2
    const r2 = RINGS[3].r + (i % 3 === 0 ? 4.4 : 3.2)
    return {
      x1: YOU.x + r1 * Math.sin(phi),
      y1: YOU.y - r1 * Math.cos(phi),
      x2: YOU.x + r2 * Math.sin(phi),
      y2: YOU.y - r2 * Math.cos(phi),
    }
  })
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
      <g fill="none" stroke="#c9a35a">
        <path d={arc(0)} strokeWidth="0.25" opacity="0.4" />
        <path d={arc(1)} strokeWidth="0.25" opacity="0.32" />
        <path d={arc(2)} strokeWidth="0.25" opacity="0.26" strokeDasharray="0.4 1.6" />
        <path d={arc(3)} strokeWidth="0.25" opacity="0.32" />
        {ticks.map((t, i) => (
          <line key={i} {...t} strokeWidth="0.25" opacity="0.4" />
        ))}
        {/* Eight-pointed star in the upper void */}
        <path
          d="M50 10 L51.4 14.6 L56 16 L51.4 17.4 L50 22 L48.6 17.4 L44 16 L48.6 14.6 Z"
          strokeWidth="0.3"
          opacity="0.35"
        />
      </g>
    </svg>
  )
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

/* ------------------------------------------------------------------ */

export function Roundtable({
  cards,
  reclaimedIds = [],
  onRestart,
  editable,
}: RoundtableProps) {
  const tableRef = useRef<HTMLDivElement>(null)
  const seatEls = useRef(new Map<string, HTMLElement>())
  const [exporting, setExporting] = useState(false)
  const [done, setDone] = useState(false)
  const [copied, setCopied] = useState(false)

  const byId = useMemo(() => new Map(ARCHETYPES.map((a) => [a.id, a])), [])
  const [seats, setSeats] = useState<Seat[]>(() => (editable ? [] : initialSeats(cards)))
  /** Alliance edges between seat ids. */
  const [edges, setEdges] = useState<Array<[string, string]>>([])

  // Reconcile seats with the cards prop (mapping mode adds/removes cards).
  useEffect(() => {
    const ids = new Set(cards.map((c) => c.id))
    setSeats((prev) => {
      let next = prev
        .map((s) => ({ ...s, cards: s.cards.filter((id) => ids.has(id)) }))
        .filter((s) => s.cards.length > 0)
      const seated = new Set(next.flatMap((s) => s.cards))
      for (const c of cards) {
        if (!seated.has(c.id)) {
          next = [...next, { id: c.id, cards: [c.id], ...findFreeSlot(next) }]
        }
      }
      const alive = new Set(next.map((s) => s.id))
      setEdges((e) => e.filter(([a, b]) => alive.has(a) && alive.has(b)))
      return next
    })
  }, [cards])

  /** Commit a seat's release: stack onto a target, ally with a neighbor, or
   * settle onto the nearest orbit. */
  function settleSeat(seatId: string, pointer: { x: number; y: number }) {
    const table = tableRef.current
    if (!table) return
    const rect = table.getBoundingClientRect()
    const toUnits = (r: DOMRect) => ({
      l: ((r.left - rect.left) / rect.width) * 100,
      t: ((r.top - rect.top) / rect.height) * 100,
      r: ((r.right - rect.left) / rect.width) * 100,
      b: ((r.bottom - rect.top) / rect.height) * 100,
      w: (r.width / rect.width) * 100,
    })
    const px = ((pointer.x - rect.left) / rect.width) * 100
    const py = ((pointer.y - rect.top) / rect.height) * 100

    const dragged = seats.find((s) => s.id === seatId)
    if (!dragged) return
    const draggedBox = seatEls.current.get(seatId)
      ? toUnits(seatEls.current.get(seatId)!.getBoundingClientRect())
      : null

    // 1. Pointer released inside another seat → stack beneath it.
    for (const other of seats) {
      if (other.id === seatId) continue
      const el = seatEls.current.get(other.id)
      if (!el) continue
      const b = toUnits(el.getBoundingClientRect())
      if (px >= b.l && px <= b.r && py >= b.t && py <= b.b) {
        setSeats((prev) =>
          prev
            .filter((s) => s.id !== seatId)
            .map((s) =>
              s.id === other.id ? { ...s, cards: [...s.cards, ...dragged.cards] } : s,
            ),
        )
        setEdges((e) => e.filter(([a, b2]) => a !== seatId && b2 !== seatId))
        return
      }
    }

    // 2. Released near another seat → snap beside it and record the alliance.
    if (draggedBox) {
      let nearest: { id: string; gap: number; box: ReturnType<typeof toUnits> } | null =
        null
      for (const other of seats) {
        if (other.id === seatId) continue
        const el = seatEls.current.get(other.id)
        if (!el) continue
        const b = toUnits(el.getBoundingClientRect())
        const dx = Math.max(0, Math.max(draggedBox.l, b.l) - Math.min(draggedBox.r, b.r))
        const dy = Math.max(0, Math.max(draggedBox.t, b.t) - Math.min(draggedBox.b, b.b))
        const gap = Math.hypot(dx, dy)
        if (gap <= ALLY_GAP && (!nearest || gap < nearest.gap)) {
          nearest = { id: other.id, gap, box: b }
        }
      }
      if (nearest) {
        const partner = seats.find((s) => s.id === nearest!.id)!
        const { r, max } = RINGS[partner.ring]
        const dPhi = (nearest.box.w / 2 + draggedBox.w / 2 + 1.5) / r
        // Snap to the pointer's side, but flip if that side has no room left
        // on the arc (so an allied card never gets crushed against the edge).
        let side = px >= (nearest.box.l + nearest.box.r) / 2 ? 1 : -1
        if (Math.abs(partner.phi + side * dPhi) > max) side = -side
        const phi = clampPhi(partner.ring, partner.phi + side * dPhi)
        setSeats((prev) =>
          prev.map((s) => (s.id === seatId ? { ...s, ring: partner.ring, phi } : s)),
        )
        setEdges((e) => [
          ...e.filter(([a, b2]) => a !== seatId && b2 !== seatId),
          [seatId, nearest.id],
        ])
        return
      }
    }

    // 3. Settle onto the orbit nearest the release point; alliances dissolve.
    const dist = Math.hypot(px - YOU.x, py - YOU.y)
    let ring = 0
    for (let i = 1; i < RINGS.length; i++) {
      if (Math.abs(dist - RINGS[i].r) < Math.abs(dist - RINGS[ring].r)) ring = i
    }
    const phi = clampPhi(ring, Math.atan2(px - YOU.x, YOU.y - py))
    setSeats((prev) => prev.map((s) => (s.id === seatId ? { ...s, ring, phi } : s)))
    setEdges((e) => e.filter(([a, b2]) => a !== seatId && b2 !== seatId))
  }

  function promote(seatId: string, cardId: string) {
    setSeats((prev) =>
      prev.map((s) =>
        s.id === seatId
          ? { ...s, cards: [cardId, ...s.cards.filter((id) => id !== cardId)] }
          : s,
      ),
    )
  }

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
    const toStack = (s: Seat): PromptStack => ({
      cards: s.cards.map((id) => byId.get(id)!),
      ring: s.ring,
    })
    const stacks = seats.map(toStack)
    // Alliance groups = connected components over the edge list.
    const groups: PromptStack[][] = []
    const seen = new Set<string>()
    for (const seat of seats) {
      if (seen.has(seat.id)) continue
      const component = [seat.id]
      seen.add(seat.id)
      for (let i = 0; i < component.length; i++) {
        for (const [a, b] of edges) {
          const next = a === component[i] ? b : b === component[i] ? a : null
          if (next && !seen.has(next)) {
            component.push(next)
            seen.add(next)
          }
        }
      }
      if (component.length > 1) {
        groups.push(component.map((id) => toStack(seats.find((s) => s.id === id)!)))
      }
    }
    const prompt = buildPrompt(stacks, groups, new Set(reclaimedIds), {
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

  // Alliance midpoint markers, derived from seat positions.
  const allianceMarks = edges
    .map(([a, b]) => {
      const sa = seats.find((s) => s.id === a)
      const sb = seats.find((s) => s.id === b)
      if (!sa || !sb) return null
      const pa = ringPos(sa.ring, sa.phi)
      const pb = ringPos(sb.ring, sb.phi)
      return { key: `${a}-${b}`, left: (pa.left + pb.left) / 2, top: (pa.top + pb.top) / 2 }
    })
    .filter(Boolean) as { key: string; left: number; top: number }[]

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
              Search the deck, then place each card on an orbit —{' '}
              <span className="text-gold-bright/90">Ring 1, beside You, is what you are most</span>.
              Drop a card <span className="text-gold-bright/90">onto another to stack</span>{' '}
              derivatives (tap a name to bring it to the top); release it{' '}
              <span className="text-gold-bright/90">touching a neighbour to ally them</span>.
            </>
          ) : (
            <>
              Place each archetype on an orbit —{' '}
              <span className="text-gold-bright/90">Ring 1, beside You, is what you are most</span>.
              Drop a card <span className="text-gold-bright/90">onto another to stack</span>{' '}
              derivatives (tap a name to bring it to the top); release it{' '}
              <span className="text-gold-bright/90">touching a neighbour to ally them</span>.
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
            'radial-gradient(circle at 50% 78%, #1a140c 0%, #120e09 52%, #0b0908 100%)',
        }}
      >
        <TableEngraving />

        {/* Empty-table hint (mapping mode) */}
        {editable && cards.length === 0 && (
          <p className="absolute inset-x-8 top-[36%] text-center font-body text-[15px] text-ivory/40 italic">
            Search the deck above to seat the first archetype from your reading.
          </p>
        )}

        {/* Alliance midpoint marks */}
        {allianceMarks.map((m) => (
          <span
            key={m.key}
            aria-hidden
            className="pointer-events-none absolute z-0 block h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-gold/80 bg-ink"
            style={{ left: `${m.left}%`, top: `${m.top}%` }}
          />
        ))}

        {/* "You" seal — the origin of the four orbits */}
        <div
          data-you
          className="font-display absolute flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-gold/80 bg-ink/80 text-[13px] font-semibold tracking-[0.18em] text-gold-bright uppercase"
          style={{
            left: `${YOU.x}%`,
            top: `${YOU.y}%`,
            boxShadow:
              '0 0 0 3px rgba(11,9,8,0.9), 0 0 0 4px rgba(201,163,90,0.35), 0 0 30px -6px rgba(201,163,90,0.45)',
          }}
        >
          You
        </div>

        {/* Seats (cards & stacks) */}
        {seats.map((seat) => (
          <SeatToken
            key={seat.id}
            seat={seat}
            byId={byId}
            constraintsRef={tableRef}
            registerEl={(el) => {
              if (el) seatEls.current.set(seat.id, el)
              else seatEls.current.delete(seat.id)
            }}
            onSettle={settleSeat}
            onPromote={(cardId) => promote(seat.id, cardId)}
            onRemoveCard={editable ? (cardId) => editable.onRemove(cardId) : undefined}
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

/* ------------------------------------------------------------------ */

function SeatToken({
  seat,
  byId,
  constraintsRef,
  registerEl,
  onSettle,
  onPromote,
  onRemoveCard,
  hideRemove,
}: {
  seat: Seat
  byId: Map<string, Archetype>
  constraintsRef: React.RefObject<HTMLDivElement | null>
  registerEl: (el: HTMLElement | null) => void
  onSettle: (seatId: string, pointer: { x: number; y: number }) => void
  onPromote: (cardId: string) => void
  /** Present in mapping mode: unseat one card. */
  onRemoveCard?: (cardId: string) => void
  /** Suppress the remove controls while the table is being exported. */
  hideRemove?: boolean
}) {
  const pos = ringPos(seat.ring, seat.phi)
  const [active, setActive] = useState(false)
  // On touch devices there is no hover; a tap toggles the remove controls.
  const [tapped, setTapped] = useState(false)
  const dragging = useRef(false)
  // Controlled drag offset so it can be zeroed once the snapped ring/phi
  // position is committed to state (otherwise the offset double-applies).
  const dx = useMotionValue(0)
  const dy = useMotionValue(0)

  return (
    <motion.div
      ref={registerEl}
      data-token-id={seat.id}
      className="group draggable absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing"
      style={{ left: `${pos.left}%`, top: `${pos.top}%`, x: dx, y: dy }}
      drag
      dragConstraints={constraintsRef}
      dragElastic={0.04}
      dragMomentum={false}
      onDragStart={() => {
        dragging.current = true
        setActive(true)
      }}
      onDragEnd={(_e, info) => {
        setActive(false)
        onSettle(seat.id, info.point)
        dx.set(0)
        dy.set(0)
        // Allow the settle to re-render before treating clicks as taps again.
        setTimeout(() => (dragging.current = false), 50)
      }}
      onTap={() => {
        if (!dragging.current && onRemoveCard) setTapped((t) => !t)
      }}
      whileDrag={{ scale: 1.08, zIndex: 30 }}
    >
      <div className="flex flex-col items-center">
        {seat.cards.map((cardId, i) => {
          const a = byId.get(cardId)!
          const cardAccent = FAMILY_COLOR[a.family]
          const isPrimary = i === 0
          return (
            <div
              key={cardId}
              data-card-id={cardId}
              className={`relative flex items-center gap-1.5 border select-none ${
                isPrimary ? 'z-10 max-w-[130px] px-2.5 py-1.5' : 'max-w-[120px] px-2 py-1 -mt-px'
              }`}
              style={{
                borderColor: active ? cardAccent : `${cardAccent}99`,
                background: active
                  ? `${cardAccent}26`
                  : isPrimary
                    ? 'rgba(13,10,8,0.92)'
                    : 'rgba(13,10,8,0.78)',
                boxShadow: isPrimary ? '0 6px 18px -8px rgba(0,0,0,0.8)' : undefined,
              }}
            >
              <span
                aria-hidden
                className={`block shrink-0 rotate-45 ${isPrimary ? 'h-1.5 w-1.5' : 'h-1 w-1'}`}
                style={{ background: cardAccent }}
              />
              {isPrimary ? (
                <span className="font-body text-center text-[12px] leading-tight font-medium text-ivory">
                  {a.name}
                </span>
              ) : (
                <button
                  onPointerDownCapture={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!dragging.current) onPromote(cardId)
                  }}
                  title="Bring to the top of the stack"
                  className="font-body text-center text-[11px] leading-tight text-ivory/70 transition hover:text-gold-bright"
                >
                  {a.name}
                </button>
              )}
              {onRemoveCard && !hideRemove && (
                <button
                  onPointerDownCapture={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveCard(cardId)
                  }}
                  aria-label={`Remove ${a.name}`}
                  className={`absolute -top-2 -right-2 z-20 flex h-4.5 w-4.5 items-center justify-center rounded-full border border-gold/50 bg-ink text-[9px] leading-none text-ivory/80 transition hover:border-gold hover:text-gold-bright ${
                    tapped ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  ✕
                </button>
              )}
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}
