import { SiteHeader } from './components/SiteHeader'
import { SiteFooter } from './components/SiteFooter'
import { Hero } from './sections/Hero'
import { LiveMatchday } from './sections/LiveMatchday'
import { LeagueComparison } from './sections/LeagueComparison'
import { WorldCupArchive } from './sections/WorldCupArchive'
import { Architecture } from './sections/Architecture'
import { DecisionLog, EngineeringNotes, Limitations } from './sections/DecisionLog'
import { useMatchdayData } from './hooks/useMatchdayData'

export default function App() {
  const { snapshots, syncStatus, fetchedAt, state, errorMessage, reload } = useMatchdayData()

  return (
    <div className="min-h-screen bg-ga-canvas">
      <a
        href="#live"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[60] focus:rounded-md focus:bg-ga-surface-2 focus:px-4 focus:py-2 focus:text-sm focus:text-ga-text-primary"
      >
        Skip to content
      </a>

      <SiteHeader />

      <main>
        <Hero syncStatus={syncStatus} state={state} />
        <LiveMatchday
          snapshots={snapshots}
          fetchedAt={fetchedAt}
          state={state}
          errorMessage={errorMessage}
          onRetry={reload}
        />
        <LeagueComparison snapshots={snapshots} state={state} />
        <WorldCupArchive />
        <Architecture />
        <DecisionLog />
        <EngineeringNotes />
        <Limitations />
      </main>

      <SiteFooter />
    </div>
  )
}
