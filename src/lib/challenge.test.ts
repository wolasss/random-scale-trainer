import { describe, expect, it } from 'vitest'
import {
  challengeUrl,
  MAX_NICKNAME_LENGTH,
  nicknameKey,
  normalizeChallengeName,
  normalizeNickname,
  readChallengeName,
} from './challenge'

describe('readChallengeName', () => {
  it('is null when nothing asked for a challenge — which is the whole feature flag', () => {
    expect(readChallengeName('')).toBeNull()
    expect(readChallengeName('?src=pwa')).toBeNull()
    expect(readChallengeName('?challenges=demo')).toBeNull()
  })

  it('reads the name out of the query string, with or without the leading ?', () => {
    expect(readChallengeName('?challenge=demo')).toBe('demo')
    expect(readChallengeName('challenge=demo')).toBe('demo')
    expect(readChallengeName('?src=pwa&challenge=demo')).toBe('demo')
  })

  it('lowercases and trims, so a name typed from memory still lands on one board', () => {
    expect(readChallengeName('?challenge=%20Summer%20Sprint%20')).toBe('summer sprint')
    expect(readChallengeName('?challenge=DEMO')).toBe('demo')
  })

  it('takes letters, digits, dashes and underscores inside a name', () => {
    expect(readChallengeName('?challenge=week-1_final')).toBe('week-1_final')
  })

  /** An unusable name is the same as not asking for a challenge at all. */
  it('is null for anything that is not a name', () => {
    expect(readChallengeName('?challenge=')).toBeNull()
    expect(readChallengeName('?challenge=%20%20')).toBeNull()
    expect(readChallengeName('?challenge=-leading')).toBeNull()
    expect(readChallengeName('?challenge=%3Cscript%3E')).toBeNull()
    expect(readChallengeName(`?challenge=${'a'.repeat(33)}`)).toBeNull()
  })
})

describe('normalizeChallengeName', () => {
  it('canonicalises what somebody typed, so one name is one board', () => {
    expect(normalizeChallengeName(' Summer Sprint ')).toBe('summer sprint')
    expect(normalizeChallengeName('DEMO')).toBe('demo')
    expect(normalizeChallengeName('week-1_final')).toBe('week-1_final')
  })

  it('is null for anything that is not a name', () => {
    expect(normalizeChallengeName('')).toBeNull()
    expect(normalizeChallengeName('   ')).toBeNull()
    expect(normalizeChallengeName('-leading')).toBeNull()
    expect(normalizeChallengeName('<script>')).toBeNull()
    expect(normalizeChallengeName('a'.repeat(33))).toBeNull()
  })
})

describe('challengeUrl', () => {
  it('puts the name on this page and nothing else', () => {
    expect(challengeUrl('demo', 'https://callnote.app/')).toBe('https://callnote.app/?challenge=demo')
  })

  /** Whoever shares arrived here somehow; that is not the recipient's business. */
  it('drops a query and a hash the sharer happened to be carrying', () => {
    expect(challengeUrl('demo', 'https://callnote.app/?challenge=old&src=pwa#stage')).toBe(
      'https://callnote.app/?challenge=demo',
    )
  })

  it('canonicalises the name into the link', () => {
    expect(challengeUrl('  Summer Sprint ', 'https://callnote.app/')).toBe(
      'https://callnote.app/?challenge=summer+sprint',
    )
  })

  it('is null rather than a throw when there is no link to make', () => {
    expect(challengeUrl('-nope', 'https://callnote.app/')).toBeNull()
    expect(challengeUrl('demo', 'not a url')).toBeNull()
  })

  /** The one that matters: a link this side builds is a link this side reads. */
  it('round-trips through readChallengeName, spaces and all', () => {
    for (const name of ['demo', 'summer sprint', 'week-1_final']) {
      const url = challengeUrl(name, 'https://callnote.app/?src=pwa')
      expect(url).not.toBeNull()
      expect(readChallengeName(new URL(url as string).search)).toBe(name)
    }
  })
})

describe('normalizeNickname', () => {
  it('collapses the whitespace, so one person cannot be two rows', () => {
    expect(normalizeNickname('  ada    lovelace  ')).toBe('ada lovelace')
  })

  it('drops what would be invisible on everybody else’s screen', () => {
    expect(normalizeNickname('ad\u0007a\u200b')).toBe('ad a')
  })

  it('caps a long one instead of refusing it', () => {
    expect(normalizeNickname('a'.repeat(40))).toBe('a'.repeat(MAX_NICKNAME_LENGTH))
  })

  it('is null when there is nothing left of it', () => {
    expect(normalizeNickname('')).toBeNull()
    expect(normalizeNickname('   ')).toBeNull()
    expect(normalizeNickname('\u200b\u0000')).toBeNull()
  })
})

describe('nicknameKey', () => {
  /**
   * The key a nickname is *owned* under. `Alice` and `alice` have to be one
   * owner, or the difference between your row and somebody impersonating you is
   * a capital letter. Kept in step with src/server/scoreboard.js, which is
   * where it actually decides anything; both sides are tested on these cases.
   */
  it('folds every variant of one name onto one key', () => {
    for (const raw of ['Alice', 'alice ', ' ALICE', 'aLiCe', '  Alice\u200b']) {
      expect(nicknameKey(raw)).toBe('alice')
    }
  })

  it('is null for what is not a nickname at all', () => {
    for (const raw of ['', '   ', '\u200b']) {
      expect(nicknameKey(raw)).toBeNull()
    }
  })
})
