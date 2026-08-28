import { useEffect, useState } from 'react'

/**
 * A ticking clock.
 *
 * Reading `Date.now()` during render makes a component impure — two renders
 * with identical props can disagree. Holding the current time in state keeps
 * render deterministic and has a second benefit: relative readings like
 * "4 min ago" stay correct while the page sits open, instead of freezing at
 * whatever they said on first paint.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])

  return now
}
