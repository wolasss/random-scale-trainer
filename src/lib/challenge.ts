/**
 * What turns an ordinary visit into a shared challenge: one query parameter.
 *
 * Everything about the feature hangs off `readChallengeName` returning
 * non-null. Without `?challenge=` in the URL there is no board, no nickname
 * prompt, and nothing that reaches for a microphone — the app is exactly what
 * it was before any of this existed.
 *
 * The rules below are duplicated in src/server/scoreboard.js, which is plain JS
 * and cannot import this file. Both sides are tested against the same cases;
 * keep them in step.
 */

export const CHALLENGE_PARAM = 'challenge'

/** Long enough for a band name, short enough to read on one line of a board. */
export const MAX_NICKNAME_LENGTH = 20

/**
 * Lowercase, because a challenge is shared by typing it to somebody and nobody
 * agrees on capitals. Spaces, dashes and underscores are allowed inside; the
 * first character has to be a letter or a digit so a name is never just
 * punctuation. Anything else is not a challenge, which is the same as not
 * asking for one.
 */
const CHALLENGE_PATTERN = /^[a-z0-9][a-z0-9 _-]{0,31}$/

/** Control and format characters — invisible on a board, and not a name. */
const CONTROL_CHARS = /[\p{Cc}\p{Cf}]/gu

/** The challenge a URL's query string names, or null if it names none. */
export const readChallengeName = (search: string): string | null => {
  const raw = new URLSearchParams(search).get(CHALLENGE_PARAM)
  if (raw === null) {
    return null
  }

  const name = raw.trim().toLowerCase()

  return CHALLENGE_PATTERN.test(name) ? name : null
}

/**
 * A nickname as it will be stored and shown to everyone else, or null when
 * there is nothing left of it. Collapsing the whitespace matters more here than
 * it looks: 'ada' and 'ada ' are the same person to everybody but a Map key.
 */
export const normalizeNickname = (raw: string): string | null => {
  const nickname = raw
    .replace(CONTROL_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NICKNAME_LENGTH)
    .trim()

  return nickname === '' ? null : nickname
}

/**
 * The key a nickname is *owned* under, which is the normalized name folded to
 * lower case. `Alice`, `alice ` and `ALICE` are one person on a board, so they
 * have to be one owner too — otherwise the difference between your row and
 * somebody impersonating you is a capital letter.
 *
 * Normalised again after folding, because folding can lengthen a name — `İ`
 * becomes two code units — and a key that is not itself a key would not survive
 * a round trip through storage.
 *
 * Duplicated in src/server/scoreboard.js, which is where it actually decides
 * anything. This copy is for the client to tell whether the token it stored
 * belongs to the name it is about to play under.
 */
export const nicknameKey = (raw: string): string | null => {
  const nickname = normalizeNickname(raw)

  return nickname === null ? null : normalizeNickname(nickname.toLowerCase())
}
