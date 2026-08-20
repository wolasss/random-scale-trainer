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
 * The challenge name is unique to this file so a re-run does not read the board
 * the last one left behind; the preview server keeps it in memory for its life.
 */
const CHALLENGE = 'e2e-challenge'

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

    // And the name is remembered, so a later challenge walks straight in.
    assert.equal(await page().getLocalStorage('fretboard-challenge-nickname'), 'ada')
  })

  it('leaves the practice app itself exactly as it was', async () => {
    await page().openChallenge(CHALLENGE)
    await page().joinChallenge('bo')
    await page().clickPlayPause()

    assert.equal(await page().getPlayButtonText(), 'Pause')
  })
})
