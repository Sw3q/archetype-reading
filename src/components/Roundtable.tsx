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

function ringPos(ring: number, phi: number): { left: number; top: number } {
  const { r } = RINGS[ring]
  return { left: YOU.x + r * Math.sin(phi), top: YOU.y - r * Math.cos(phi) }
}

const clampPhi = (ring: number, phi: number) =>
  Math.max(-RINGS[ring].max, Math.min(RINGS[ring].max, phi))

/** SVG path for an orbit arc (shared by the engraving and the live highlight). */
function arcPath(ring: number): string {
  const { r, max } = RINGS[ring]
  const x1 = YOU.x + r * Math.sin(-max)
  const y1 = YOU.y - r * Math.cos(-max)
  const x2 = YOU.x + r * Math.sin(max)
  const y2 = YOU.y - r * Math.cos(max)
  return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`
}

/** A seat on the table: one card, or a stack (cards[0] = primary/top). */
interface Seat {
  id: string
  cards: string[]
  ring: number
  phi: number
}

/** Box of a seat in table-% units, plus its seat metadata. */
interface SeatBox {
  id: string
  l: number
  t: number
  r: number
  b: number
  w: number
  ring: number
  phi: number
}

/** What releasing right now would do — computed live during the drag and
 * reused verbatim on release, so the preview can never disagree with the act. */
type DragIntent =
  | { kind: 'stack'; targetId: string }
  | { kind: 'ally'; targetId: string; side: -1 | 1; ring: number; phi: number; left: number; top: number }
  | { kind: 'orbit'; ring: number; phi: number; left: number; top: number }

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

/** Where a card snaps when allied beside a partner seat (with roomier-side flip). */
function allyBeside(
  partner: SeatBox,
  draggedW: number,
  preferSide: -1 | 1,
): { side: -1 | 1; phi: number } {
  const { r, max } = RINGS[partner.ring]
  const dPhi = (partner.w / 2 + draggedW / 2 + 1.5) / r
  let side = preferSide
  if (Math.abs(partner.phi + side * dPhi) > max) side = side === 1 ? -1 : 1
  return { side, phi: clampPhi(partner.ring, partner.phi + side * dPhi) }
}

/* ------------------------------------------------------------------ */

/** Engraved table: four orbit arcs fanning out from the You seal. */
function TableEngraving() {
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
        <path d={arcPath(0)} strokeWidth="0.25" opacity="0.4" />
        <path d={arcPath(1)} strokeWidth="0.25" opacity="0.32" />
        <path d={arcPath(2)} strokeWidth="0.25" opacity="0.26" strokeDasharray="0.4 1.6" />
        <path d={arcPath(3)} strokeWidth="0.25" opacity="0.32" />
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

/** Live snap cues drawn under the tokens while a card is being dragged. */
function DragOverlay({
  intent,
  targets,
  dragW,
  dragH,
}: {
  intent: DragIntent
  targets: SeatBox[]
  dragW: number
  dragH: number
}) {
  const target =
    intent.kind !== 'orbit' ? targets.find((t) => t.id === intent.targetId) : undefined

  return (
    <>
      {/* Destination orbit arc, brightened (orbit + ally both land on a ring). */}
      {intent.kind !== 'stack' && (
        <svg
          viewBox="0 0 100 100"
          className="pointer-events-none absolute inset-0 z-0 h-full w-full"
          aria-hidden
        >
          <path d={arcPath(intent.ring)} fill="none" stroke="#ecd296" strokeWidth="1.4" opacity="0.18" />
          <path d={arcPath(intent.ring)} fill="none" stroke="#ecd296" strokeWidth="0.4" opacity="0.85" />
        </svg>
      )}

      {/* Stack: gold glow framing the target it will drop beneath. */}
      {intent.kind === 'stack' && target && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-20 border border-gold-bright"
          style={{
            left: `${target.l}%`,
            top: `${target.t}%`,
            width: `${target.r - target.l}%`,
            height: `${target.b - target.t}%`,
            boxShadow: '0 0 0 1px rgba(236,210,150,0.5), 0 0 22px -2px rgba(236,210,150,0.7)',
            background: 'rgba(236,210,150,0.08)',
          }}
        />
      )}

      {/* Alliance: luminous bar on the target edge the card will snap against. */}
      {intent.kind === 'ally' && target && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-20 -translate-x-1/2"
          style={{
            left: `${intent.side < 0 ? target.l : target.r}%`,
            top: `${target.t}%`,
            height: `${target.b - target.t}%`,
            width: '3px',
            background: 'linear-gradient(180deg, transparent, #ecd296 18%, #ecd296 82%, transparent)',
            boxShadow: '0 0 10px 1px rgba(236,210,150,0.85)',
          }}
        />
      )}

      {/* Ghost: dashed outline at the exact resting position & size. */}
      {intent.kind !== 'stack' && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-0 -translate-x-1/2 -translate-y-1/2 border border-dashed border-gold-bright/70"
          style={{
            left: `${intent.left}%`,
            top: `${intent.top}%`,
            width: `${dragW}%`,
            height: `${dragH}%`,
            background: 'rgba(236,210,150,0.06)',
          }}
        />
      )}
    </>
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

  // Live drag state. `dragCtx` snapshots the static boxes once at drag start
  // (the other seats don't move), so the per-frame intent is pure math.
  const dragCtx = useRef<{
    rect: DOMRect
    dragW: number
    dragH: number
    targets: SeatBox[]
  } | null>(null)
  const [intent, setIntent] = useState<DragIntent | null>(null)
  const intentKey = useRef('')

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

  /** Snapshot the table + other seats' boxes at the start of a drag. */
  function beginDrag(seatId: string) {
    const table = tableRef.current
    if (!table) return
    const rect = table.getBoundingClientRect()
    const toBox = (el: HTMLElement) => {
      const r = el.getBoundingClientRect()
      return {
        l: ((r.left - rect.left) / rect.width) * 100,
        t: ((r.top - rect.top) / rect.height) * 100,
        r: ((r.right - rect.left) / rect.width) * 100,
        b: ((r.bottom - rect.top) / rect.height) * 100,
      }
    }
    let dragW = 18
    let dragH = 8
    const targets: SeatBox[] = []
    seatEls.current.forEach((el, id) => {
      const box = toBox(el)
      if (id === seatId) {
        dragW = box.r - box.l
        dragH = box.b - box.t
        return
      }
      const s = seats.find((x) => x.id === id)
      if (!s) return
      targets.push({ id, ...box, w: box.r - box.l, ring: s.ring, phi: s.phi })
    })
    dragCtx.current = { rect, dragW, dragH, targets }
    intentKey.current = ''
  }

  /** What releasing at `pointer` (viewport coords) would do. */
  function computeIntent(pointer: { x: number; y: number }): DragIntent | null {
    const ctx = dragCtx.current
    if (!ctx) return null
    const px = ((pointer.x - ctx.rect.left) / ctx.rect.width) * 100
    const py = ((pointer.y - ctx.rect.top) / ctx.rect.height) * 100

    // Target = the seat whose (slightly grown) box the pointer sits in,
    // nearest-center wins when several overlap.
    let target: SeatBox | null = null
    let best = Infinity
    for (const t of ctx.targets) {
      const mx = (t.r - t.l) * 0.18
      const my = (t.b - t.t) * 0.4
      if (px >= t.l - mx && px <= t.r + mx && py >= t.t - my && py <= t.b + my) {
        const d = Math.hypot(px - (t.l + t.r) / 2, py - (t.t + t.b) / 2)
        if (d < best) {
          best = d
          target = t
        }
      }
    }

    if (target) {
      const frac = (px - target.l) / (target.r - target.l)
      // Centre band stacks; the outer thirds ally on that side.
      if (frac > 0.32 && frac < 0.68) return { kind: 'stack', targetId: target.id }
      const { side, phi } = allyBeside(target, ctx.dragW, frac <= 0.32 ? -1 : 1)
      const pos = ringPos(target.ring, phi)
      return { kind: 'ally', targetId: target.id, side, ring: target.ring, phi, left: pos.left, top: pos.top }
    }

    // No target → settle onto the nearest orbit.
    const dist = Math.hypot(px - YOU.x, py - YOU.y)
    let ring = 0
    for (let i = 1; i < RINGS.length; i++) {
      if (Math.abs(dist - RINGS[i].r) < Math.abs(dist - RINGS[ring].r)) ring = i
    }
    const phi = clampPhi(ring, Math.atan2(px - YOU.x, YOU.y - py))
    const pos = ringPos(ring, phi)
    return { kind: 'orbit', ring, phi, left: pos.left, top: pos.top }
  }

  /** Per-frame preview update — only re-renders when the intent changes shape. */
  function updateDrag(pointer: { x: number; y: number }) {
    const next = computeIntent(pointer)
    const key = !next
      ? ''
      : next.kind === 'stack'
        ? `s:${next.targetId}`
        : next.kind === 'ally'
          ? `a:${next.targetId}:${next.side}`
          : `o:${next.ring}:${Math.round(next.phi * 50)}`
    if (key === intentKey.current) return
    intentKey.current = key
    setIntent(next)
  }

  /** Commit the snapped intent on release. */
  function endDrag(seatId: string, pointer: { x: number; y: number }) {
    const decided = computeIntent(pointer)
    dragCtx.current = null
    setIntent(null)
    intentKey.current = ''
    if (!decided) return
    const dragged = seats.find((s) => s.id === seatId)
    if (!dragged) return

    if (decided.kind === 'stack') {
      setSeats((prev) =>
        prev
          .filter((s) => s.id !== seatId)
          .map((s) =>
            s.id === decided.targetId
              ? { ...s, cards: [...s.cards, ...dragged.cards] }
              : s,
          ),
      )
      setEdges((e) => e.filter(([a, b]) => a !== seatId && b !== seatId))
    } else if (decided.kind === 'ally') {
      setSeats((prev) =>
        prev.map((s) =>
          s.id === seatId ? { ...s, ring: decided.ring, phi: decided.phi } : s,
        ),
      )
      setEdges((e) => [
        ...e.filter(([a, b]) => a !== seatId && b !== seatId),
        [seatId, decided.targetId],
      ])
    } else {
      setSeats((prev) =>
        prev.map((s) =>
          s.id === seatId ? { ...s, ring: decided.ring, phi: decided.phi } : s,
        ),
      )
      setEdges((e) => e.filter(([a, b]) => a !== seatId && b !== seatId))
    }
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

  const instruction = (
    <>
      Place each card on an orbit —{' '}
      <span className="text-gold-bright/90">Ring 1, beside You, is what you are most</span>.
      Drop a card <span className="text-gold-bright/90">over the centre of another to stack</span>{' '}
      derivatives, or <span className="text-gold-bright/90">against its edge to ally them</span>.
      A lit edge or glow shows what will happen before you let go.
    </>
  )

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
          {editable ? <>Search the deck, then place each card. {instruction}</> : instruction}
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

        {/* Live snap cues (only while dragging) */}
        {intent && dragCtx.current && (
          <DragOverlay
            intent={intent}
            targets={dragCtx.current.targets}
            dragW={dragCtx.current.dragW}
            dragH={dragCtx.current.dragH}
          />
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
            onBegin={beginDrag}
            onMove={updateDrag}
            onSettle={endDrag}
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
  onBegin,
  onMove,
  onSettle,
  onPromote,
  onRemoveCard,
  hideRemove,
}: {
  seat: Seat
  byId: Map<string, Archetype>
  constraintsRef: React.RefObject<HTMLDivElement | null>
  registerEl: (el: HTMLElement | null) => void
  onBegin: (seatId: string) => void
  onMove: (pointer: { x: number; y: number }) => void
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
        onBegin(seat.id)
      }}
      onDrag={(_e, info) => onMove(info.point)}
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
