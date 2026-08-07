// @vitest-environment node
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { NOTE_AUDIO_FILES } from './engine'

const publicDir = fileURLToPath(new URL('../../../public', import.meta.url))

describe('NOTE_AUDIO_FILES', () => {
  it('covers all 17 note spellings', () => {
    expect(Object.keys(NOTE_AUDIO_FILES)).toHaveLength(17)
  })

  it('points every note at an existing file under public/', () => {
    for (const [note, path] of Object.entries(NOTE_AUDIO_FILES)) {
      const filePath = join(publicDir, path)
      expect(existsSync(filePath), `missing audio file for ${note}: ${path}`).toBe(true)
    }
  })

  it('references every clip in public/audio/notes exactly once', () => {
    const clips = readdirSync(join(publicDir, 'audio/notes'))
      .filter((name) => name.endsWith('.mp3'))
      .map((name) => `/audio/notes/${name}`)
      .sort()
    const referenced = Object.values(NOTE_AUDIO_FILES).sort()

    // Sorted arrays rather than sets, so a clip mapped to two notes shows up too.
    expect(referenced).toEqual(clips)
  })
})
