import type { ReactNode } from 'react'

interface StageLayoutProps {
  eyebrow: string
  title: string
  instruction?: string
  children: ReactNode
  footer?: ReactNode
}

/** Hairline rule with a central diamond — the engraver's divider. */
export function OrnamentRule({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-2 ${className}`} aria-hidden>
      <span className="h-px w-10 bg-gradient-to-l from-gold/50 to-transparent" />
      <span className="block h-1.5 w-1.5 rotate-45 border border-gold/70" />
      <span className="h-px w-10 bg-gradient-to-r from-gold/50 to-transparent" />
    </div>
  )
}

/** Consistent stage chrome: eyebrow + ceremonial title + instruction. */
export function StageLayout({
  eyebrow,
  title,
  instruction,
  children,
  footer,
}: StageLayoutProps) {
  return (
    <div className="starfield relative flex min-h-[100dvh] flex-col items-center px-5 py-8">
      <header className="mb-5 max-w-xl shrink-0 text-center">
        <p className="font-display text-[10px] font-medium tracking-[0.42em] text-gold/75 uppercase">
          {eyebrow}
        </p>
        <h1 className="font-display mt-2.5 text-[1.65rem] leading-tight font-semibold tracking-[0.08em] text-ivory uppercase sm:text-3xl">
          {title}
        </h1>
        <OrnamentRule className="mt-3" />
        {instruction && (
          <p className="mx-auto mt-3 max-w-md font-body text-[15px] leading-relaxed text-ivory/60">
            {instruction}
          </p>
        )}
      </header>
      <main className="flex w-full flex-1 flex-col items-center justify-center">
        {children}
      </main>
      {footer && <footer className="mt-4 shrink-0">{footer}</footer>}
    </div>
  )
}
