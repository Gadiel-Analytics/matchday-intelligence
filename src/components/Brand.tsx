interface BrandProps {
  compact?: boolean
}

/**
 * Brand lockup: `GA_` mark plus product name, per the naming hierarchy
 * "<Product name> by Gadiel Analytics".
 *
 * The mark is set in type rather than as an image so it stays crisp at every
 * size and inherits theme colour. The approved raster logo is reserved for the
 * footer, where full identity belongs; repeating a large logo on every surface
 * is explicitly discouraged by the brand standard.
 */
export function Brand({ compact = false }: BrandProps) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className="ga-machine rounded-md border border-ga-border-strong bg-ga-surface-2 px-2 py-1 text-sm font-bold tracking-tight text-ga-text-primary"
      >
        <span className="ga-gradient-text">GA</span>
        <span className="text-ga-text-muted">_</span>
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="block text-sm font-semibold text-ga-text-primary">Matchday</span>
          <span className="block text-[11px] text-ga-text-muted">by Gadiel Analytics</span>
        </span>
      )}
    </div>
  )
}
