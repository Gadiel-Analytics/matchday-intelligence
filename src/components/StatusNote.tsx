import type { ReactNode } from 'react'

type Tone = 'info' | 'warning' | 'negative' | 'neutral'

const toneStyles: Record<Tone, { border: string; text: string; label: string }> = {
  info: { border: 'border-ga-info/40', text: 'text-ga-info', label: 'Note' },
  warning: { border: 'border-ga-warning/40', text: 'text-ga-warning', label: 'Stale' },
  negative: { border: 'border-ga-negative/40', text: 'text-ga-negative', label: 'Unavailable' },
  neutral: { border: 'border-ga-border-strong', text: 'text-ga-neutral', label: 'Not computed' },
}

interface StatusNoteProps {
  tone?: Tone
  label?: string
  children: ReactNode
}

/**
 * Explicit state messaging.
 *
 * Colour is always paired with a written label, so the meaning survives for a
 * reader who cannot distinguish the hues — the brand standard requires colour
 * to be a secondary encoding, never the only one.
 */
export function StatusNote({ tone = 'info', label, children }: StatusNoteProps) {
  const style = toneStyles[tone]

  return (
    <div className={`rounded-lg border ${style.border} bg-ga-surface-2/60 px-4 py-3`}>
      <p className="text-[13px] leading-relaxed text-ga-text-secondary">
        <span className={`ga-eyebrow mr-2 ${style.text}`}>{label ?? style.label}</span>
        {children}
      </p>
    </div>
  )
}
