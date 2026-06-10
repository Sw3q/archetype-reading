import type { Archetype, Aspect } from '../types'
import { FAMILY_COLOR } from '../lib/family'

/** One pole (Light / Shadow): celestial glyph, small-caps label, tag + line. */
function AspectRow({
  glyph,
  label,
  color,
  aspect,
}: {
  glyph: string
  label: string
  color: string
  aspect: Aspect
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span
          className="font-display text-[10px] font-medium tracking-[0.3em] uppercase"
          style={{ color }}
        >
          <span aria-hidden className="mr-1.5">{glyph}</span>
          {label}
        </span>
        <span className="font-card text-[17px] leading-none font-semibold italic" style={{ color }}>
          {aspect.tag}
        </span>
      </div>
      <p className="mt-1 font-body text-[14px] leading-snug text-ivory/65">{aspect.line}</p>
    </div>
  )
}

/** Eight-pointed star medallion bearing the archetype's initial (art-ready: swaps for `image`). */
function Medallion({ initial, color }: { initial: string; color: string }) {
  return (
    <div className="relative flex h-24 w-24 items-center justify-center">
      <svg viewBox="0 0 96 96" className="absolute inset-0" aria-hidden>
        <g fill="none" stroke={color} strokeWidth="1">
          <rect x="22" y="22" width="52" height="52" opacity="0.55" />
          <rect x="22" y="22" width="52" height="52" opacity="0.8" transform="rotate(45 48 48)" />
          <circle cx="48" cy="48" r="33" opacity="0.35" />
          <circle cx="48" cy="48" r="44" opacity="0.18" strokeDasharray="1 5" />
        </g>
      </svg>
      <span className="font-card text-5xl leading-none text-gold-bright/90 select-none" aria-hidden>
        {initial}
      </span>
    </div>
  )
}

interface CardProps {
  archetype: Archetype
  /** Optional overlay shown while swiping ("This is me" / "Not me"). */
  hint?: 'yes' | 'no' | null
  className?: string
}

/**
 * The archetype card, drawn as a gilded tarot card — double hairline frame,
 * corner dots, engraved medallion. Art-ready: when an archetype has an
 * `image`, it replaces the medallion panel.
 */
export function Card({ archetype, hint, className = '' }: CardProps) {
  const accent = FAMILY_COLOR[archetype.family]
  return (
    <div
      className={`tarot-frame relative flex h-full w-full flex-col overflow-hidden bg-gradient-to-b from-panel to-ink-2 ${className}`}
      style={{ boxShadow: '0 24px 70px -28px rgba(0,0,0,0.9), 0 0 40px -22px rgba(201,163,90,0.35)' }}
    >
      {/* Medallion / illustration panel */}
      <div
        className="relative flex h-36 shrink-0 items-center justify-center"
        style={
          archetype.image
            ? { background: `center/cover no-repeat url(${archetype.image})` }
            : undefined
        }
      >
        {!archetype.image && <Medallion initial={archetype.name.charAt(0)} color="#c9a35a" />}
      </div>

      {/* Text content */}
      <div className="flex flex-1 flex-col gap-2.5 px-6 pt-1 pb-5 text-center">
        <p
          className="font-display text-[10px] font-medium tracking-[0.34em] uppercase"
          style={{ color: accent }}
        >
          {archetype.family}
        </p>
        <h2 className="font-card mx-auto max-w-[260px] text-[1.85rem] leading-[1.05] font-semibold text-ivory">
          {archetype.name}
        </h2>
        <div aria-hidden className="mx-auto my-0.5 h-px w-12 bg-gold/40" />
        <div className="flex flex-col gap-2.5 text-left">
          <AspectRow glyph="☀" label="Light" color="#d9b96c" aspect={archetype.light} />
          <AspectRow glyph="☾" label="Shadow" color="#9b9484" aspect={archetype.shadow} />
        </div>
      </div>

      {/* Swipe verdict stamp */}
      {hint && (
        <div
          className={`pointer-events-none absolute top-7 ${
            hint === 'yes' ? 'left-5 -rotate-12' : 'right-5 rotate-12'
          }`}
        >
          <span
            className="font-display border px-3.5 py-1.5 text-base font-semibold tracking-[0.2em] uppercase"
            style={{
              color: hint === 'yes' ? '#ecd296' : '#9b9484',
              borderColor: hint === 'yes' ? '#c9a35a' : '#75705f',
              background: 'rgba(11,9,8,0.55)',
            }}
          >
            {hint === 'yes' ? 'This is me' : 'Not me'}
          </span>
        </div>
      )}
    </div>
  )
}
