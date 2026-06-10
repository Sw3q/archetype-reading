import type { Archetype, Aspect } from '../types'
import { FAMILY_COLOR } from '../lib/family'

/** One labeled pole (Light / Shadow): colored tag + short line. */
function AspectRow({
  label,
  color,
  aspect,
}: {
  label: string
  color: string
  aspect: Aspect
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span
          className="text-[10px] font-semibold tracking-[0.15em] uppercase"
          style={{ color }}
        >
          {label}
        </span>
        <span className="text-sm font-semibold" style={{ color }}>
          {aspect.tag}
        </span>
      </div>
      <p className="mt-0.5 text-sm leading-snug text-white/65">{aspect.line}</p>
    </div>
  )
}

interface CardProps {
  archetype: Archetype
  /** Optional overlay shown while swiping ("ME" / "NOT ME"). */
  hint?: 'yes' | 'no' | null
  className?: string
}

/**
 * The shared archetype card — text-only for now but art-ready: when an
 * archetype has an `image`, it fills the illustration panel at the top.
 */
export function Card({ archetype, hint, className = '' }: CardProps) {
  const accent = FAMILY_COLOR[archetype.family]
  return (
    <div
      className={`relative flex h-full w-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#211d31] to-[#16131f] shadow-2xl ${className}`}
      style={{ boxShadow: `0 20px 60px -20px ${accent}55, 0 8px 30px rgba(0,0,0,0.5)` }}
    >
      {/* Top accent bar / illustration panel */}
      <div
        className="relative flex h-28 shrink-0 items-center justify-center"
        style={{
          background: archetype.image
            ? `center/cover no-repeat url(${archetype.image})`
            : `radial-gradient(circle at 50% 120%, ${accent}66, transparent 70%)`,
        }}
      >
        {!archetype.image && (
          <span
            className="font-display text-7xl opacity-30 select-none"
            style={{ color: accent }}
            aria-hidden
          >
            {archetype.name.charAt(0)}
          </span>
        )}
        <div
          className="absolute inset-x-0 top-0 h-1"
          style={{ background: accent }}
        />
      </div>

      {/* Text content */}
      <div className="flex flex-1 flex-col gap-2.5 px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <span
            className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wider uppercase"
            style={{ background: `${accent}22`, color: accent }}
          >
            {archetype.family}
          </span>
        </div>
        <h2 className="font-display text-[1.7rem] leading-[1.1] font-semibold text-white">
          {archetype.name}
        </h2>
        <div className="mt-0.5 flex flex-col gap-2.5">
          <AspectRow label="Light" color="#6fc79a" aspect={archetype.light} />
          <AspectRow label="Shadow" color="#c9788a" aspect={archetype.shadow} />
        </div>
      </div>

      {/* Swipe hint overlay */}
      {hint && (
        <div
          className={`pointer-events-none absolute top-8 ${
            hint === 'yes' ? 'left-6 -rotate-12' : 'right-6 rotate-12'
          }`}
        >
          <span
            className="rounded-xl border-4 px-4 py-1.5 text-2xl font-extrabold tracking-wider uppercase"
            style={{
              color: hint === 'yes' ? '#6fc79a' : '#d95b5b',
              borderColor: hint === 'yes' ? '#6fc79a' : '#d95b5b',
            }}
          >
            {hint === 'yes' ? 'This is me' : 'Not me'}
          </span>
        </div>
      )}
    </div>
  )
}
