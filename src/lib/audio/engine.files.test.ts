// @vitest-environment node
import { existsSync } from 'node:fs'
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
})
