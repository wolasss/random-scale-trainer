import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { useTrainerSession } from '../session.ts'

/**
 * The shared challenge, in a real browser and against the real API — the Vite
 * plugin in vite.config.ts serves it under `vite preview`, which is what these
 * specs run against.
 *
 * The browser is launched with a synthetic microphone and no permission dialog:
 * arriving on a challenge asks for the mic straight away, and a headless Chrome
 * has neither a microphone nor anybody to click "Allow".
 *
 * The challenge names are unique to this file so a re-run does not read the
 * board the last one left behind; the preview server keeps it in memory for its
 * life. The scoring specs each take a name of their own for the same reason —
 * a nickname is claimed once and never again.
 */
const CHALLENGE = 'e2e-challenge'
const OWNED = 'e2e-owned'
const GUARDED = 'e2e-guarded'

/** The fastest the app can call a note, which is the server's spacing rule. */
const NOTE_INTERVAL_MS = 250

describe('shared challenge', () => {
  const page = useTrainerSession({ fakeMedia: true })

  it('is completely absent without ?challenge= in the URL', async () => {
    await page().openFresh()

    assert.equal(await page().hasNicknamePrompt(), false)
    assert.equal(await page().hasScoreboard(), false)
  })

  it('asks for a nickname, then shows the board with you on it', async () => {
    await page().openChallenge(CHALLENGE)

    assert.equal(await page().hasNicknamePrompt(), true)

    await page().joinChallenge('ada')

    assert.equal(await page().hasNicknamePrompt(), false)
    assert.equal(await page().hasScoreboard(), true)

    // Nothing has been played, so the board is still empty — what is being
    // asserted is that it loaded at all, which means the API answered.
    assert.deepEqual(await page().getScoreboardEntries(), [])

    // The name is remembered as the next prompt's prefill...
    assert.equal(await page().getLocalStorage('fretboard-challenge-nickname'), 'ada')
    // ...and the ownership token, which is the thing that actually makes it hers.
    const tokens = JSON.parse((await page().getLocalStorage('fretboard-challenge-tokens')) ?? '{}')
    assert.equal(tokens[CHALLENGE].nickname, 'ada')
    assert.ok(tokens[CHALLENGE].token.length >= 32)
  })

  it('leaves the practice app itself exactly as it was', async () => {
    await page().openChallenge(CHALLENGE)
    await page().joinChallenge('bo')
    await page().clickPlayPause()

    assert.equal(await page().getPlayButtonText(), 'Pause')
  })

  /**
   * The whole authenticated round trip, driven from the page with the token the
   * UI stored: a session, a batch of events at the legal spacing, a finish. The
   * number that ends up on the strip is the *server's* arithmetic — three hits
   * at ten points each plus the streak bonus the third one earns.
   */
  it('scores a session through the API and shows the server’s own total', async () => {
    await page().openChallenge(OWNED)
    await page().joinChallenge('ada')

    const tokens = JSON.parse((await page().getLocalStorage('fretboard-challenge-tokens')) ?? '{}')
    const { token } = tokens[OWNED]

    const opened = await page().callApi(`/api/scoreboard/${OWNED}/session`, {
      method: 'POST',
      token,
      body: { nickname: 'ada', config: { bpm: 72, beatsPerNote: 4 } },
    })
    assert.equal(opened.status, 201)
    const { sessionId } = JSON.parse(opened.body)

    const events = [0, 1, 2].map((index) => ({ seq: index, kind: 'hit', at: index * NOTE_INTERVAL_MS }))
    const posted = await page().callApi(`/api/scoreboard/${OWNED}/session/${sessionId}/events`, {
      method: 'POST',
      token,
      body: { events },
    })
    assert.equal(posted.status, 200)
    assert.equal(JSON.parse(posted.body).points, 35)

    // Replaying that very batch adds nothing, and neither does a second finish.
    const replayed = await page().callApi(`/api/scoreboard/${OWNED}/session/${sessionId}/events`, {
      method: 'POST',
      token,
      body: { events },
    })
    assert.equal(replayed.status, 400)

    const finished = await page().callApi(`/api/scoreboard/${OWNED}/session/${sessionId}/finish`, {
      method: 'POST',
      token,
    })
    assert.equal(finished.status, 200)
    assert.equal(
      (
        await page().callApi(`/api/scoreboard/${OWNED}/session/${sessionId}/finish`, { method: 'POST', token })
      ).status,
      404,
    )

    // ...and the strip catches up to the board the server is now holding.
    await page().openChallenge(OWNED)
    const board = await page().getScoreboardEntries()
    assert.deepEqual(board, [{ nickname: 'ada', points: 35 }])
  })

  /** The acceptance case: an arbitrary total, posted straight at the board. */
  it('refuses a posted points total outright and leaves the board untouched', async () => {
    await page().openChallenge(GUARDED)
    await page().joinChallenge('ada')

    const tokens = JSON.parse((await page().getLocalStorage('fretboard-challenge-tokens')) ?? '{}')
    const { token } = tokens[GUARDED]

    const opened = await page().callApi(`/api/scoreboard/${GUARDED}/session`, {
      method: 'POST',
      token,
      body: { nickname: 'ada', config: { bpm: 72, beatsPerNote: 4 } },
    })
    const { sessionId } = JSON.parse(opened.body)
    await page().callApi(`/api/scoreboard/${GUARDED}/session/${sessionId}/events`, {
      method: 'POST',
      token,
      body: { events: [{ seq: 0, kind: 'hit', at: 0 }] },
    })

    const cheated = await page().callApi(`/api/scoreboard/${GUARDED}`, {
      method: 'POST',
      body: { nickname: 'ada', points: 1_000_000 },
    })

    assert.equal(cheated.status, 410)
    const read = await page().callApi(`/api/scoreboard/${GUARDED}`)
    assert.deepEqual(JSON.parse(read.body).scores, [{ nickname: 'ada', points: 10 }])
    // And the board a stranger can read carries nothing to become an owner with.
    assert.equal(read.body.includes('token'), false)
    assert.equal(read.body.includes(token), false)
  })

  /**
   * A browser that has forgotten its token is a stranger. It cannot re-claim
   * the name — which is the point, since anything that let it would let anybody
   * — and it cannot move the score that name already holds.
   */
  it('will not let another browser take a name or touch its score', async () => {
    await page().forgetAndReopenChallenge(GUARDED)

    assert.equal(await page().hasNicknamePrompt(), true)
    await page().joinChallenge('ada')

    assert.match(await page().getNicknameError(), /already has that name/)
    assert.equal(await page().hasNicknamePrompt(), true)
    assert.equal(await page().getLocalStorage('fretboard-challenge-tokens'), null)

    // A session on somebody else's name, with a token of this browser's own
    // invention: refused before it can score anything.
    const forged = await page().callApi(`/api/scoreboard/${GUARDED}/session`, {
      method: 'POST',
      token: 'f'.repeat(64),
      body: { nickname: 'ada', config: { bpm: 72, beatsPerNote: 4 } },
    })
    assert.equal(forged.status, 401)

    // ...and holding the URL is still read access, which is what it should be.
    await page().dismissNicknamePrompt()
    assert.equal(await page().hasScoreboard(), true)
    const read = await page().callApi(`/api/scoreboard/${GUARDED}`)
    assert.deepEqual(JSON.parse(read.body).scores, [{ nickname: 'ada', points: 10 }])
  })
})
