import { describe, expect, it } from 'vitest'
import { createCueLog } from './cueLog'

describe('createCueLog', () => {
  describe('record + isWithinCue', () => {
    it('is within cue for a time inside the interval', () => {
      const log = createCueLog()
      log.record(10, 11, 0.15, 10)

      expect(log.isWithinCue(10.5)).toBe(true)
    })

    it('is within cue for a time inside the decay tail', () => {
      const log = createCueLog()
      log.record(10, 11, 0.15, 10)

      expect(log.isWithinCue(11.1)).toBe(true)
    })

    it('is not within cue just past end + decay', () => {
      const log = createCueLog()
      log.record(10, 11, 0.15, 10)

      expect(log.isWithinCue(11.16)).toBe(false)
    })
  })

  describe('record pruning', () => {
    it('drops entries whose end is older than now - CUE_HISTORY_S (5)', () => {
      const log = createCueLog()
      log.record(0, 1, 0.1, 0)
      // now = 6.5 -> cutoff = 1.5, so the cue ending at 1 is pruned
      log.record(6, 6.5, 0.1, 6.5)

      expect(log.isWithinCue(0.5)).toBe(false)
      expect(log.isWithinCue(6.2)).toBe(true)
    })

    it('keeps entries whose end is within the history bound', () => {
      const log = createCueLog()
      log.record(0, 2, 0.1, 0)
      // now = 6 -> cutoff = 1, so the cue ending at 2 survives
      log.record(6, 6.5, 0.1, 6)

      expect(log.isWithinCue(1.5)).toBe(true)
    })
  })

  describe('endForBeat', () => {
    it('matches a cue starting exactly at the beat within epsilon', () => {
      const log = createCueLog()
      log.record(5, 5.14, 0.04, 5)

      expect(log.endForBeat(5.0005)).toBe(5.14)
    })

    it('matches a still-ringing cue overlapping the beat', () => {
      const log = createCueLog()
      log.record(4, 5.5, 0.15, 4)

      expect(log.endForBeat(5)).toBe(5.5)
    })

    it('returns the max end when both an on-beat and a ringing cue apply', () => {
      const log = createCueLog()
      log.record(4, 5.5, 0.15, 4)
      log.record(5, 5.2, 0.04, 5)

      expect(log.endForBeat(5)).toBe(5.5)
    })

    it('returns null for a beat with no covering cue', () => {
      const log = createCueLog()
      log.record(0, 1, 0.1, 0)

      expect(log.endForBeat(10)).toBeNull()
    })
  })

  describe('pruneCancelled', () => {
    it('drops cues that have not started yet', () => {
      const log = createCueLog()
      log.record(10, 11, 0.1, 5)

      log.pruneCancelled(5)

      expect(log.isWithinCue(10.5)).toBe(false)
    })

    it('keeps cues that have already started sounding', () => {
      const log = createCueLog()
      log.record(4, 6, 0.1, 5)

      log.pruneCancelled(5)

      expect(log.isWithinCue(5)).toBe(true)
    })
  })
})
