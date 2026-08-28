import type { ReactNode } from 'react'

interface PanelProps {
  children: ReactNode
  className?: string
}

/**
 * The single surface primitive. One panel type used everywhere keeps the page
 * from turning into unrelated card clutter, which the brand standard calls out
 * directly.
 */
export function Panel({ children, className = '' }: PanelProps) {
  return (
    <div
      className={`rounded-xl border border-ga-border-subtle bg-ga-surface-1 ${className}`}
    >
      {children}
    </div>
  )
}

interface SectionHeadingProps {
  eyebrow: string
  title: string
  description?: string
  id?: string
}

export function SectionHeading({ eyebrow, title, description, id }: SectionHeadingProps) {
  return (
    <header id={id} className="scroll-mt-24">
      <p className="ga-eyebrow">{eyebrow}</p>
      <div className="ga-gradient-rule mt-3 w-10 rounded-full" />
      <h2 className="mt-4 text-2xl font-bold tracking-tight text-ga-text-primary sm:text-3xl">
        {title}
      </h2>
      {description && (
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ga-text-secondary">
          {description}
        </p>
      )}
    </header>
  )
}
