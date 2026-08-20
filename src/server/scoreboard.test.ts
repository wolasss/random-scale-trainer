// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  API_PREFIX,
  createStore,
  handleRequest,
  MAX_ENTRIES,
  MAX_POINTS,
  normalizeChallengeName,
  normalizeNickname,
  readSnapshot,
  submitScore,
  topScores,
  writeSnapshot,
} from './scoreboard.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const tempFile = (contents?: string): string => {
  const dir = mkdtempSync(join(tmpdir(), 'callnote-board-'))
  dirs.push(dir)
  const path = join(dir, 'scoreboard.json')
  if (contents !== undefined) {
    writeFileSync(path, contents)
  }

  return path
}

const seeded = (entries: Array<[string, number]>, challenge = 'demo') => {
  const store = createStore()
  for (const [nickname, points] of entries) {
    submitScore(store, challenge, nickname, points)
  }

  return store
}

describe('normalizeChallengeName', () => {
  it('lowercases, because a name is shared by being typed to somebody', () => {
    expect(normalizeChallengeName(' Summer Sprint ')).toBe('summer sprint')
  })

  it('refuses anything that is not a name', () => {
    for (const raw of ['', '   ', '-leading', '!!', 'a'.repeat(33), 'semi;colon', 42, null, undefined]) {
      expect(normalizeChallengeName(raw)).toBeNull()
    }
  })
})

describe('normalizeNickname', () => {
  it('collapses the whitespace, so one person is not two rows', () => {
    expect(normalizeNickname('  ada    lovelace ')).toBe('ada lovelace')
  })

  it('strips the characters that would be invisible on somebody else’s screen', () => {
    expect(normalizeNickname('ad\u0007a\u200b')).toBe('ad a')
  })

  it('caps the length rather than refusing a long one outright', () => {
    expect(normalizeNickname('a'.repeat(40))).toBe('a'.repeat(20))
  })

  it('is null when there is nothing left of it', () => {
    for (const raw of ['', '   ', '\u200b\u200b', '\u0000']) {
      expect(normalizeNickname(raw)).toBeNull()
    }
  })
})

describe('submitScore', () => {
  it('keeps the best per nickname, so a worse session cannot take the board down', () => {
    const store = seeded([['ada', 120]])

    expect(submitScore(store, 'demo', 'ada', 90)).toBe('unchanged')
    expect(topScores(store, 'demo')).toEqual([{ nickname: 'ada', points: 120 }])

    expect(submitScore(store, 'demo', 'ada', 200)).toBe('stored')
    expect(topScores(store, 'demo')).toEqual([{ nickname: 'ada', points: 200 }])
  })

  /** The client submits on every pause, so this is the common case, not an edge. */
  it('makes a repeat of a score already on the board a no-op', () => {
    const store = seeded([['ada', 120]])

    expect(submitScore(store, 'demo', 'ada', 120)).toBe('unchanged')
    expect(topScores(store, 'demo')).toEqual([{ nickname: 'ada', points: 120 }])
  })

  it('keeps challenges apart', () => {
    const store = seeded([['ada', 120]])
    submitScore(store, 'other', 'bo', 300)

    expect(topScores(store, 'demo')).toEqual([{ nickname: 'ada', points: 120 }])
    expect(topScores(store, 'other')).toEqual([{ nickname: 'bo', points: 300 }])
  })

  it('normalises the challenge name on the way in, so ?challenge=Demo is ?challenge=demo', () => {
    const store = seeded([['ada', 120]], ' DEMO ')

    expect(topScores(store, 'demo')).toEqual([{ nickname: 'ada', points: 120 }])
  })

  it('refuses what is not a score', () => {
    const store = createStore()

    expect(submitScore(store, '!!', 'ada', 10)).toBe('invalid')
    expect(submitScore(store, 'demo', '  ', 10)).toBe('invalid')
    expect(submitScore(store, 'demo', 'ada', -1)).toBe('invalid')
    expect(submitScore(store, 'demo', 'ada', Number.NaN)).toBe('invalid')
    expect(submitScore(store, 'demo', 'ada', '10')).toBe('invalid')
    expect(store.challenges.size).toBe(0)
  })

  it('caps the points rather than storing whatever it was handed', () => {
    const store = seeded([['ada', MAX_POINTS * 10]])

    expect(topScores(store, 'demo')).toEqual([{ nickname: 'ada', points: MAX_POINTS }])
  })

  /** The one defence against a board being filled with junk; see the module doc. */
  it('stops taking new names once a challenge is full', () => {
    const store = createStore()
    for (let index = 0; index < MAX_ENTRIES; index += 1) {
      expect(submitScore(store, 'demo', `player ${index}`, index)).toBe('stored')
    }

    expect(submitScore(store, 'demo', 'one too many', 10)).toBe('full')
    // Everybody already on it can still improve, which is what they came for.
    expect(submitScore(store, 'demo', 'player 0', 999)).toBe('stored')
  })
})

describe('topScores', () => {
  it('orders by points, then by nickname so a tie does not shuffle', () => {
    const store = seeded([
      ['bo', 100],
      ['ada', 300],
      ['cy', 100],
    ])

    expect(topScores(store, 'demo')).toEqual([
      { nickname: 'ada', points: 300 },
      { nickname: 'bo', points: 100 },
      { nickname: 'cy', points: 100 },
    ])
  })

  it('hands back ten and no more', () => {
    const store = seeded(Array.from({ length: 25 }, (_, index): [string, number] => [`p${index}`, index]))

    const top = topScores(store, 'demo')
    expect(top).toHaveLength(10)
    expect(top[0]).toEqual({ nickname: 'p24', points: 24 })
    expect(top[9]).toEqual({ nickname: 'p15', points: 15 })
  })

  it('is an empty board for a challenge nobody has played', () => {
    expect(topScores(createStore(), 'nobody-here')).toEqual([])
  })
})

describe('handleRequest', () => {
  const get = (pathname: string) => handleRequest(createStore(), { method: 'GET', pathname })

  it('answers a GET with the board', () => {
    const store = seeded([['ada', 120]])

    expect(handleRequest(store, { method: 'GET', pathname: `${API_PREFIX}demo` })).toEqual({
      status: 200,
      json: { challenge: 'demo', scores: [{ nickname: 'ada', points: 120 }] },
      changed: false,
    })
  })

  it('stores a POST and answers with the board it produced', () => {
    const store = createStore()

    const answer = handleRequest(store, {
      method: 'POST',
      pathname: `${API_PREFIX}demo`,
      body: JSON.stringify({ nickname: 'ada', points: 120 }),
    })

    expect(answer.status).toBe(200)
    expect(answer.json.scores).toEqual([{ nickname: 'ada', points: 120 }])
    // What tells main.js the snapshot is worth writing.
    expect(answer.changed).toBe(true)
  })

  it('reports a repeat submit as costing nothing, so no snapshot is written for it', () => {
    const store = seeded([['ada', 120]])

    const answer = handleRequest(store, {
      method: 'POST',
      pathname: `${API_PREFIX}demo`,
      body: JSON.stringify({ nickname: 'ada', points: 120 }),
    })

    expect(answer.status).toBe(200)
    expect(answer.changed).toBe(false)
  })

  it('decodes the challenge out of the path', () => {
    const store = seeded([['ada', 120]], 'summer sprint')

    const answer = handleRequest(store, { method: 'GET', pathname: `${API_PREFIX}summer%20sprint` })

    expect(answer.json).toEqual({ challenge: 'summer sprint', scores: [{ nickname: 'ada', points: 120 }] })
  })

  it('is a 400 for a challenge name it would never store', () => {
    expect(get(`${API_PREFIX}!!`).status).toBe(400)
    expect(get(API_PREFIX).status).toBe(400)
    // A malformed escape is not a name either, and must not throw.
    expect(get(`${API_PREFIX}%zz`).status).toBe(400)
  })

  it('is a 404 anywhere else and a 405 for a method it does not answer', () => {
    expect(get('/api/something-else').status).toBe(404)
    expect(get('/index.html').status).toBe(404)
    expect(
      handleRequest(createStore(), { method: 'DELETE', pathname: `${API_PREFIX}demo` }).status,
    ).toBe(405)
  })

  it('is a 400 for a body that is not a submit', () => {
    const store = createStore()
    for (const body of ['', 'not json', '[]', 'null', '{"nickname":"  ","points":1}', '{"points":1}']) {
      expect(handleRequest(store, { method: 'POST', pathname: `${API_PREFIX}demo`, body }).status).toBe(400)
    }

    expect(store.challenges.size).toBe(0)
  })
})

describe('snapshots', () => {
  it('round-trips a board through a file', () => {
    const path = tempFile()
    const store = seeded([
      ['ada', 300],
      ['bo', 100],
    ])

    expect(writeSnapshot(path, store)).toBe(true)
    expect(topScores(readSnapshot(path), 'demo')).toEqual(topScores(store, 'demo'))
  })

  it('creates the directory it was pointed at', () => {
    const path = join(tempFile(), 'nested', 'deeper', 'scoreboard.json')

    expect(writeSnapshot(path, seeded([['ada', 10]]))).toBe(true)
    expect(readFileSync(path, 'utf8')).toContain('ada')
  })

  it('reads a missing file as an empty board rather than a crash on boot', () => {
    expect(readSnapshot(join(tempFile(), 'never-written.json')).challenges.size).toBe(0)
  })

  it('reads a corrupt file as an empty board', () => {
    for (const contents of ['', 'not json at all', '[]', '{"challenges":[]}', 'null']) {
      expect(readSnapshot(tempFile(contents)).challenges.size).toBe(0)
    }
  })

  /** Salvage is per entry, the way the app's own stored routine list is. */
  it('keeps every entry it can read out of a half-edited file', () => {
    const path = tempFile(
      JSON.stringify({
        version: 1,
        challenges: {
          demo: { ada: 300, bo: 'not a number', '   ': 50, cy: 100 },
          '!!not a challenge': { ada: 1 },
          broken: 'not an object',
        },
      }),
    )

    const store = readSnapshot(path)

    expect(topScores(store, 'demo')).toEqual([
      { nickname: 'ada', points: 300 },
      { nickname: 'cy', points: 100 },
    ])
    expect(store.challenges.has('!!not a challenge')).toBe(false)
    expect(store.challenges.has('broken')).toBe(false)
  })

  it('reports a write it could not make rather than throwing', () => {
    // A directory where the file should be: the write cannot possibly land.
    const dir = mkdtempSync(join(tmpdir(), 'callnote-board-'))
    dirs.push(dir)

    expect(writeSnapshot(dir, seeded([['ada', 10]]))).toBe(false)
  })
})
