// Exponential backoff with full jitter (RF-10, contract §Reconnect).
// wait = random(0, min(30000, 5000 * 2 ** attempt)). The 5s base spreads the
// 50,000 clients of a fallen instance. Reset attempt on any event.

export const BACKOFF_BASE_MS = 5000;
export const BACKOFF_MAX_MS = 30000;

export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const cap = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt);
  return random() * cap;
}

export interface BackoffState {
  attempt: number;
}

/** Call after each failure; returns ms to wait. */
export function nextBackoff(s: BackoffState, random?: () => number): number {
  const ms = backoffDelay(s.attempt, random);
  s.attempt += 1;
  return ms;
}

/** Call on any valid event. */
export function resetBackoff(s: BackoffState): void {
  s.attempt = 0;
}
