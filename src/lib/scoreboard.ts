/**
 * The client half of the shared board: two calls against the service in
 * src/server/, and no state of its own.
 *
 * Everything here answers `null` rather than throwing. A board is a nicety
 * beside a practice session — a server that is down, a response that is not
 * what it claims to be, a request that was aborted on unmount — none of it is
 * worth an error boundary, and all of it reads the same way to the player: the
 * board is not available right now.
 */

export type ScoreEntry = {
  nickname: string
  points: number
}

/** Mounted here by nginx in the container and by a Vite middleware in dev. */
export const SCOREBOARD_ENDPOINT = '/api/scoreboard'

export type ScoreboardRequestOptions = {
  signal?: AbortSignal
  /** Injectable for tests; otherwise the browser's own. */
  fetchImpl?: typeof fetch
}

const endpointFor = (challenge: string) => `${SCOREBOARD_ENDPOINT}/${encodeURIComponent(challenge)}`

/**
 * Anything that isn't a well-formed entry is dropped rather than rendered: this
 * is the one place in the app where the data came from somebody else's browser.
 */
const parseScores = (payload: unknown): ScoreEntry[] | null => {
  if (payload === null || typeof payload !== 'object') {
    return null
  }

  const { scores } = payload as { scores?: unknown }
  if (!Array.isArray(scores)) {
    return null
  }

  return scores.flatMap((entry): ScoreEntry[] => {
    if (entry === null || typeof entry !== 'object') {
      return []
    }

    const { nickname, points } = entry as { nickname?: unknown; points?: unknown }

    return typeof nickname === 'string' && nickname !== '' && typeof points === 'number' && Number.isFinite(points)
      ? [{ nickname, points }]
      : []
  })
}

const readScores = async (response: Response): Promise<ScoreEntry[] | null> => {
  if (!response.ok) {
    return null
  }

  try {
    return parseScores(await response.json())
  } catch {
    return null
  }
}

/** The current top ten, or null if the board could not be reached or read. */
export const fetchTopScores = async (
  challenge: string,
  { signal, fetchImpl = fetch }: ScoreboardRequestOptions = {},
): Promise<ScoreEntry[] | null> => {
  try {
    return await readScores(await fetchImpl(endpointFor(challenge), { signal }))
  } catch {
    return null
  }
}

/**
 * Posts a tally and hands back the board it produced, so a submit costs one
 * round trip rather than two. The server keeps the best per nickname, which is
 * what makes re-submitting a score already on the board harmless.
 */
export const submitScore = async (
  challenge: string,
  nickname: string,
  points: number,
  { signal, fetchImpl = fetch }: ScoreboardRequestOptions = {},
): Promise<ScoreEntry[] | null> => {
  try {
    return await readScores(
      await fetchImpl(endpointFor(challenge), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname, points }),
        signal,
      }),
    )
  } catch {
    return null
  }
}
