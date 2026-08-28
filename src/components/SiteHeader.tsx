import { useEffect, useState } from 'react'
import { Brand } from './Brand'

const sections = [
  { id: 'live', label: 'Live' },
  { id: 'compare', label: 'Compare' },
  { id: 'archive', label: 'Case study' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'decisions', label: 'Decisions' },
]

/**
 * Slim sticky header. The active indicator is the only navigation element that
 * carries the brand gradient, which is what the standard reserves it for.
 */
export function SiteHeader() {
  const [active, setActive] = useState<string>('live')

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) setActive(visible.target.id)
      },
      { rootMargin: '-45% 0px -50% 0px', threshold: [0, 0.25, 0.5, 1] },
    )

    sections.forEach(({ id }) => {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    })

    return () => observer.disconnect()
  }, [])

  return (
    <header className="sticky top-0 z-50 border-b border-ga-border-subtle bg-ga-shell/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-3">
        <a href="#top" className="shrink-0 rounded-md">
          <Brand />
        </a>

        <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
          {sections.map((section) => {
            const isActive = active === section.id
            return (
              <a
                key={section.id}
                href={`#${section.id}`}
                aria-current={isActive ? 'true' : undefined}
                className={`relative rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${
                  isActive
                    ? 'text-ga-text-primary'
                    : 'text-ga-text-muted hover:text-ga-text-secondary'
                }`}
              >
                {section.label}
                {isActive && (
                  <span
                    aria-hidden
                    className="ga-gradient-rule absolute inset-x-3 -bottom-px rounded-full"
                  />
                )}
              </a>
            )
          })}
        </nav>

        <a
          href="https://github.com/Gadiel-Analytics/matchday-intelligence"
          target="_blank"
          rel="noreferrer"
          className="ga-machine shrink-0 rounded-md border border-ga-border-strong px-3 py-1.5 text-[11px] font-medium text-ga-text-secondary transition-colors hover:border-ga-focus hover:text-ga-text-primary"
        >
          Source
        </a>
      </div>
    </header>
  )
}
