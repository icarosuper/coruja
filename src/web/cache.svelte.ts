// The last answer each page got from the API, kept in memory (decisions #30): a page shown again
// appears at once with it while it reloads, instead of waiting for the round trip to the US.
// Forgotten on sign-out and when admin is locked, so nobody sees another session's data.

const lastAnswers = new Map<string, unknown>()

/** Plain copies both ways: what a page changes in its own state never leaks into the cache. */
export function cached<Answer>(key: string): Answer | null {
  const answer = lastAnswers.get(key) as Answer | undefined
  return answer === undefined ? null : structuredClone(answer)
}

export function remember<Answer>(key: string, answer: Answer): void {
  lastAnswers.set(key, $state.snapshot(answer))
}

export function forgetAnswers(): void {
  lastAnswers.clear()
}
