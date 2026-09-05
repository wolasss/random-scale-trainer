import { describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '../constants'
import { initSettings, writeChangedSettings } from './settingsStorage'

describe('initSettings', () => {
  it('accepts a listed sessionGoalMin', () => {
    window.localStorage.setItem(STORAGE_KEYS.sessionGoal, '20')
    expect(initSettings().sessionGoalMin).toBe(20)
  })

  it('rejects an off-list sessionGoalMin and falls back to the default', () => {
    window.localStorage.setItem(STORAGE_KEYS.sessionGoal, '15')
    expect(initSettings().sessionGoalMin).toBe(10)
  })

  it('accepts a listed beatsPerNote', () => {
    window.localStorage.setItem(STORAGE_KEYS.beatsPerNote, '8')
    expect(initSettings().beatsPerNote).toBe(8)
  })

  it('rejects an off-list beatsPerNote and falls back to the default', () => {
    window.localStorage.setItem(STORAGE_KEYS.beatsPerNote, '3')
    expect(initSettings().beatsPerNote).toBe(4)
  })

  it('reads back a stored false for endSoundEnabled, its only door since it has no UI', () => {
    window.localStorage.setItem(STORAGE_KEYS.endSound, 'false')
    expect(initSettings().endSoundEnabled).toBe(false)
  })

  it.each(['0', 'TRUE', ''])(
    'rejects %j for endSoundEnabled and keeps it on',
    (raw) => {
      window.localStorage.setItem(STORAGE_KEYS.endSound, raw)
      expect(initSettings().endSoundEnabled).toBe(true)
    },
  )

  it('keeps the default-on booleans on when garbage is stored', () => {
    window.localStorage.setItem(STORAGE_KEYS.continuousMode, '1')
    window.localStorage.setItem(STORAGE_KEYS.countIn, 'off')
    window.localStorage.setItem(STORAGE_KEYS.endSound, '1')

    const settings = initSettings()
    expect(settings.continuousMode).toBe(true)
    expect(settings.countInEnabled).toBe(true)
    expect(settings.endSoundEnabled).toBe(true)
  })

  it('flips the default-off booleans on only from a literal true', () => {
    window.localStorage.setItem(STORAGE_KEYS.speedRampMode, 'true')
    window.localStorage.setItem(STORAGE_KEYS.showFretboard, 'true')
    window.localStorage.setItem(STORAGE_KEYS.micListen, 'true')

    const settings = initSettings()
    expect(settings.speedRampMode).toBe(true)
    expect(settings.showFretboard).toBe(true)
    expect(settings.micEnabled).toBe(true)
  })

  it('keeps the default-off booleans off when garbage is stored', () => {
    window.localStorage.setItem(STORAGE_KEYS.speedRampMode, '1')
    window.localStorage.setItem(STORAGE_KEYS.showFretboard, 'yes')
    window.localStorage.setItem(STORAGE_KEYS.micListen, 'on')

    const settings = initSettings()
    expect(settings.speedRampMode).toBe(false)
    expect(settings.showFretboard).toBe(false)
    expect(settings.micEnabled).toBe(false)
  })

  it('clamps an out-of-range finite bpm', () => {
    window.localStorage.setItem(STORAGE_KEYS.bpm, '999')
    expect(initSettings().bpm).toBe(240)

    window.localStorage.setItem(STORAGE_KEYS.bpm, '5')
    expect(initSettings().bpm).toBe(30)
  })

  it('rejects a non-numeric bpm and falls back to the default', () => {
    window.localStorage.setItem(STORAGE_KEYS.bpm, 'fast')
    expect(initSettings().bpm).toBe(72)
  })

  it('clamps an out-of-range finite rampTargetBpm', () => {
    window.localStorage.setItem(STORAGE_KEYS.rampTarget, '999')
    expect(initSettings().rampTargetBpm).toBe(240)
  })

  it('rejects a non-numeric rampTargetBpm and falls back to the default', () => {
    window.localStorage.setItem(STORAGE_KEYS.rampTarget, 'fast')
    expect(initSettings().rampTargetBpm).toBe(112)
  })

  it('does not re-floor a stored rampTargetBpm against a stored bpm', () => {
    window.localStorage.setItem(STORAGE_KEYS.bpm, '200')
    window.localStorage.setItem(STORAGE_KEYS.rampTarget, '100')

    const settings = initSettings()
    expect(settings.bpm).toBe(200)
    expect(settings.rampTargetBpm).toBe(100)
  })

  it.each(['', '1,,3', '1,2,2', '0,12', '-1,2', '001,2'])(
    'rejects a pool of %j and falls back to the full chromatic default',
    (raw) => {
      window.localStorage.setItem(STORAGE_KEYS.notePool, raw)
      expect(initSettings().pool).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    },
  )

  it('sorts an accepted pool', () => {
    window.localStorage.setItem(STORAGE_KEYS.notePool, '7,0,4')
    expect(initSettings().pool).toEqual([0, 4, 7])
  })

  it('accepts a zero-padded single-digit segment, since the codec only checks digit shape', () => {
    // The doc comment on notePool claims "no padding", but the codec
    // (isPitchClassText, /^\d{1,2}$/) accepts a leading zero on a
    // single-digit segment — '001,2' is rejected for length, not padding.
    window.localStorage.setItem(STORAGE_KEYS.notePool, '01,2')
    expect(initSettings().pool).toEqual([1, 2])
  })

  it('drops a stored speedRampMode when continuousMode is stored off', () => {
    window.localStorage.setItem(STORAGE_KEYS.continuousMode, 'false')
    window.localStorage.setItem(STORAGE_KEYS.speedRampMode, 'true')

    const settings = initSettings()
    expect(settings.continuousMode).toBe(false)
    expect(settings.speedRampMode).toBe(false)
  })
})

describe('writeChangedSettings', () => {
  const codecStorageKeys = [
    STORAGE_KEYS.bpm,
    STORAGE_KEYS.continuousMode,
    STORAGE_KEYS.speedRampMode,
    STORAGE_KEYS.rampTarget,
    STORAGE_KEYS.endSound,
    STORAGE_KEYS.countIn,
    STORAGE_KEYS.beatsPerNote,
    STORAGE_KEYS.spelling,
    STORAGE_KEYS.notePool,
    STORAGE_KEYS.sessionGoal,
    STORAGE_KEYS.showFretboard,
    STORAGE_KEYS.micListen,
  ]

  it('writes every key when previous is null', () => {
    writeChangedSettings(null, initSettings())

    for (const key of codecStorageKeys) {
      expect(window.localStorage.getItem(key)).not.toBeNull()
    }
  })

  it('writes only the keys whose value changed', () => {
    const previous = initSettings()
    const next = { ...previous, bpm: previous.bpm + 10 }

    writeChangedSettings(previous, next)

    expect(window.localStorage.getItem(STORAGE_KEYS.bpm)).toBe('82')
    for (const key of codecStorageKeys) {
      if (key === STORAGE_KEYS.bpm) {
        continue
      }
      expect(window.localStorage.getItem(key)).toBeNull()
    }
  })
})
