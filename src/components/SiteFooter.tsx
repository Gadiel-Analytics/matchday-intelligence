export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-ga-border-subtle bg-ga-shell">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <p className="text-sm font-semibold text-ga-text-primary">Matchday</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ga-text-secondary">
              A read-only football data pipeline, built and operated as a decision system.
              Ingests six competitions, derives what the feed does not provide, and states
              its own limits.
            </p>
          </div>

          <div className="flex flex-col gap-2 text-[13px]">
            <p className="ga-eyebrow mb-1">Gadiel Analytics</p>
            <a
              href="https://gadielanalytics.com"
              className="text-ga-text-secondary transition-colors hover:text-ga-text-primary"
            >
              gadielanalytics.com
            </a>
            <a
              href="https://x.com/gadielanalytics"
              className="text-ga-text-secondary transition-colors hover:text-ga-text-primary"
            >
              @gadielanalytics
            </a>
            <a
              href="https://github.com/Gadiel-Analytics"
              className="text-ga-text-secondary transition-colors hover:text-ga-text-primary"
            >
              github.com/Gadiel-Analytics
            </a>
            <a
              href="mailto:hello@gadielanalytics.com"
              className="text-ga-text-secondary transition-colors hover:text-ga-text-primary"
            >
              hello@gadielanalytics.com
            </a>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-ga-border-subtle pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="ga-machine text-[11px] text-ga-text-muted">
            Match data: football-data.org (free tier) · Infrastructure: Cloudflare Pages,
            Workers, D1
          </p>
          <p className="ga-machine text-[11px] text-ga-text-muted">MIT licensed</p>
        </div>
      </div>
    </footer>
  )
}
