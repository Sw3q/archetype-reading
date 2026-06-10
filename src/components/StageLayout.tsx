import type { ReactNode } from 'react'

interface StageLayoutProps {
  eyebrow: string
  title: string
  instruction?: string
  children: ReactNode
  footer?: ReactNode
}

/** Consistent stage chrome: eyebrow + title + instruction, centered body. */
export function StageLayout({
  eyebrow,
  title,
  instruction,
  children,
  footer,
}: StageLayoutProps) {
  return (
    <div className="starfield relative flex min-h-[100dvh] flex-col items-center px-4 py-6">
      <header className="mb-4 max-w-xl shrink-0 text-center">
        <p className="text-[11px] font-semibold tracking-[0.25em] text-white/40 uppercase">
          {eyebrow}
        </p>
        <h1 className="font-display mt-1 text-3xl font-semibold text-white sm:text-4xl">
          {title}
        </h1>
        {instruction && (
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/55">
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
