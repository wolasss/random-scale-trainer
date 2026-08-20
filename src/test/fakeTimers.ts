import type { vi } from 'vitest'

export const FAKE_CLOCKS = {
  toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
} satisfies NonNullable<Parameters<typeof vi.useFakeTimers>[0]>

export const FAKE_CLOCKS_AND_FRAMES = {
  toFake: [...FAKE_CLOCKS.toFake, 'requestAnimationFrame', 'cancelAnimationFrame'],
} satisfies NonNullable<Parameters<typeof vi.useFakeTimers>[0]>
