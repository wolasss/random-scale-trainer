import { By, Key, error as seleniumError, until, type WebDriver } from 'selenium-webdriver'
import { config } from '../config.ts'

// Note names use the Unicode accidentals ♭ (U+266D) and ♯ (U+266F) — never
// ASCII 'b'/'#'. While idle the note element is absent (getCurrentNote → null).
export const NOTE_NAMES = new Set([
  'C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B',
  'D♭', 'E♭', 'G♭', 'A♭', 'B♭',
])

// Exact strings from src/constants.ts — update here if the copy changes.
export const MESSAGES = {
  idle: 'Press start — or hit Space.',
  countingIn: 'Counting in…',
  playing: 'Find it on the neck before the next beat.',
  playingRamp: 'Speed ramp on: +2 BPM each cycle.',
  paused: 'Paused — the session timer is paused too.',
  finished: 'Finished all 12 notes.',
}
/** The hero shows the count-in digit where the note normally appears. */
export const COUNT_IN_DIGIT = /^[1-4]$/

export const STORAGE_KEYS = {
  theme: 'fretboard-theme',
  bpm: 'fretboard-bpm',
  continuousMode: 'fretboard-continuous-mode',
  speedRampMode: 'fretboard-speed-ramp-mode',
  beatsPerNote: 'fretboard-beats-per-note',
}

const POLL_MS = 100

const SELECTORS = {
  playToggle: By.css('[data-testid="play-toggle"]'),
  reset: By.css('[data-testid="reset"]'),
  themeToggle: By.css('[data-testid="theme-toggle"]'),
  nowPlaying: By.css('[data-testid="now-playing"]'),
  currentNote: By.css('[data-testid="current-note"]'),
  playbackMessage: By.css('[data-testid="playback-message"]'),
  bpmValue: By.css('[data-testid="bpm-value"]'),
  timer: By.css('[data-testid="timer"]'),
  bpmSlider: By.id('bpm-slider'),
  continuousToggle: By.id('continuous-mode'),
  speedRampToggle: By.id('speed-ramp-mode'),
  cycleTime: By.css('.target-time'),
  heading: By.css('h1'),
  nextNote: By.css('[data-testid="next-note"]'),
  cyclePosition: By.css('[data-testid="cycle-position"]'),
  bpmDown: By.css('[data-testid="bpm-down"]'),
  bpmUp: By.css('[data-testid="bpm-up"]'),
  tapTempo: By.css('[data-testid="tap-tempo"]'),
  noteEvery: By.css('[data-testid="note-every"]'),
}

export const timerToSeconds = (timerText: string): number => {
  const [minutes, seconds] = timerText.split(':').map(Number)
  return minutes * 60 + seconds
}

export class TrainerPage {
  constructor(private readonly driver: WebDriver) {}

  async open(): Promise<void> {
    await this.driver.get(config.appBaseUrl)
    await this.driver.wait(until.elementLocated(SELECTORS.playToggle), 10_000)
    await this.disableAnimations()
  }

  /** Open the app with a clean localStorage so every test starts from defaults. */
  async openFresh(): Promise<void> {
    await this.open()
    await this.driver.executeScript('window.localStorage.clear()')
    await this.refresh()
  }

  /** Seed a stored setting, then reload so the app picks it up. */
  async seedStorageAndReload(key: string, value: string): Promise<void> {
    await this.driver.executeScript('window.localStorage.setItem(arguments[0], arguments[1])', key, value)
    await this.refresh()
  }

  async refresh(): Promise<void> {
    await this.driver.navigate().refresh()
    await this.driver.wait(until.elementLocated(SELECTORS.playToggle), 10_000)
    await this.disableAnimations()
  }

  /**
   * Entrance animations (e.g. .panel's fade-up) start at opacity 0, and
   * WebDriver getText() reads zero-opacity text as "". Disabling animations
   * makes every read deterministic.
   */
  private async disableAnimations(): Promise<void> {
    await this.driver.executeScript(`
      const style = document.createElement('style')
      style.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; }'
      document.head.appendChild(style)
    `)
  }

  // --- reads ---

  /**
   * Returns null while the note element is absent (note state is an empty string).
   * The element remounts on every note change (key={currentNote}), so it can go
   * stale between lookup and read — retry when that happens.
   */
  async getCurrentNote(): Promise<string | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const elements = await this.driver.findElements(SELECTORS.currentNote)
        return elements.length > 0 ? await elements[0].getText() : null
      } catch (err) {
        if (!(err instanceof seleniumError.StaleElementReferenceError)) {
          throw err
        }
      }
    }
    return null
  }

  async getPlaybackMessage(): Promise<string> {
    return this.driver.findElement(SELECTORS.playbackMessage).getText()
  }

  /** Null when the NEXT chip is not rendered (e.g. ear-only mode). */
  async getNextNote(): Promise<string | null> {
    const elements = await this.driver.findElements(SELECTORS.nextNote)
    return elements.length > 0 ? elements[0].getText() : null
  }

  /** e.g. "note 7 of 12"; null while idle. */
  async getCyclePosition(): Promise<string | null> {
    const elements = await this.driver.findElements(SELECTORS.cyclePosition)
    return elements.length > 0 ? elements[0].getText() : null
  }

  async getBpm(): Promise<number> {
    return Number(await this.driver.findElement(SELECTORS.bpmValue).getText())
  }

  async getTimer(): Promise<string> {
    return this.driver.findElement(SELECTORS.timer).getText()
  }

  async getCycleTime(): Promise<string> {
    return this.driver.findElement(SELECTORS.cycleTime).getText()
  }

  async getTheme(): Promise<string | null> {
    return this.driver.findElement(By.css('html')).getAttribute('data-theme')
  }

  async getThemeToggleLabel(): Promise<string | null> {
    return this.driver.findElement(SELECTORS.themeToggle).getAttribute('aria-label')
  }

  async getNowPlayingState(): Promise<'active' | 'paused' | 'idle'> {
    const className = (await this.driver.findElement(SELECTORS.nowPlaying).getAttribute('class')) ?? ''
    if (className.includes('active')) return 'active'
    if (className.includes('paused')) return 'paused'
    return 'idle'
  }

  async getPlayButtonText(): Promise<string> {
    return this.driver.findElement(SELECTORS.playToggle).getText()
  }

  async isPlayButtonPrimary(): Promise<boolean> {
    const className = (await this.driver.findElement(SELECTORS.playToggle).getAttribute('class')) ?? ''
    return className.includes('primary-button')
  }

  /** Switches expose their state via role=switch aria-checked, not text. */
  async getSwitchState(toggle: 'continuous' | 'speedRamp'): Promise<{ checked: boolean; disabled: boolean }> {
    const locator = toggle === 'continuous' ? SELECTORS.continuousToggle : SELECTORS.speedRampToggle
    const element = this.driver.findElement(locator)
    const [checked, enabled] = await Promise.all([element.getAttribute('aria-checked'), element.isEnabled()])
    return { checked: checked === 'true', disabled: !enabled }
  }

  async getSliderAttribute(name: string): Promise<string | null> {
    return this.driver.findElement(SELECTORS.bpmSlider).getAttribute(name)
  }

  async getLocalStorage(key: string): Promise<string | null> {
    return this.driver.executeScript('return window.localStorage.getItem(arguments[0])', key)
  }

  // --- actions ---

  async clickPlayPause(): Promise<void> {
    await this.driver.findElement(SELECTORS.playToggle).click()
  }

  async clickReset(): Promise<void> {
    await this.driver.findElement(SELECTORS.reset).click()
  }

  async clickThemeToggle(): Promise<void> {
    await this.driver.findElement(SELECTORS.themeToggle).click()
  }

  async clickBpmStepper(direction: 'up' | 'down'): Promise<void> {
    await this.driver.findElement(direction === 'up' ? SELECTORS.bpmUp : SELECTORS.bpmDown).click()
  }

  async tapTempo(times: number, intervalMs: number): Promise<void> {
    for (let index = 0; index < times; index++) {
      if (index > 0) {
        await this.sleep(intervalMs)
      }
      await this.driver.findElement(SELECTORS.tapTempo).click()
    }
  }

  /** Clicks the note-every segmented option with the given beat count. */
  async setNoteEvery(beats: 1 | 2 | 4 | 8): Promise<void> {
    await this.driver
      .findElement(SELECTORS.noteEvery)
      .findElement(By.css(`[data-value="${beats}"]`))
      .click()
  }

  async clickContinuousToggle(): Promise<void> {
    await this.driver.findElement(SELECTORS.continuousToggle).click()
  }

  async clickSpeedRampToggle(): Promise<void> {
    await this.driver.findElement(SELECTORS.speedRampToggle).click()
  }

  /**
   * Range inputs ignore typed text; Home/End/Arrow keys are handled natively
   * and fire the input event React's onChange listens to. sendKeys focuses the
   * element without clicking (a click would jump the value to the pointer position).
   */
  async setBpmToMax(): Promise<void> {
    await this.driver.findElement(SELECTORS.bpmSlider).sendKeys(Key.END)
  }

  async setBpmToMin(): Promise<void> {
    await this.driver.findElement(SELECTORS.bpmSlider).sendKeys(Key.HOME)
  }

  async nudgeBpmOnSlider(delta: number): Promise<void> {
    const key = delta > 0 ? Key.ARROW_UP : Key.ARROW_DOWN
    const keys = Array.from({ length: Math.abs(delta) }, () => key)
    await this.driver.findElement(SELECTORS.bpmSlider).sendKeys(...keys)
  }

  /**
   * Send global keyboard shortcuts (Space, arrows, R). Clicks the heading first
   * so no control has focus — Space on a focused button would click that button
   * instead of reaching the window keydown handler.
   */
  async pressBody(...keys: string[]): Promise<void> {
    await this.driver.findElement(SELECTORS.heading).click()
    await this.driver.actions().sendKeys(...keys).perform()
  }

  // --- waits ---

  async waitForMessage(expected: string | RegExp, timeoutMs = 5_000): Promise<void> {
    await this.driver.wait(
      async () => {
        const message = await this.getPlaybackMessage()
        return typeof expected === 'string' ? message === expected : expected.test(message)
      },
      timeoutMs,
      `playback message did not match ${expected}`,
      POLL_MS,
    )
  }

  /** Count-in follows audio load, whose duration varies — hence the long default timeout. */
  async waitForCountIn(timeoutMs = 15_000): Promise<void> {
    await this.waitForMessage(MESSAGES.countingIn, timeoutMs)
  }

  /** Resolves with the note once a real note is showing (valid note name, not a count-in digit). */
  async waitForNotePlaying(timeoutMs = 15_000): Promise<string> {
    let playingNote = ''
    await this.driver.wait(
      async () => {
        const note = await this.getCurrentNote()
        if (note !== null && NOTE_NAMES.has(note)) {
          playingNote = note
          return true
        }
        return false
      },
      timeoutMs,
      'no valid note started playing',
      POLL_MS,
    )
    return playingNote
  }

  /** Collect distinct valid notes as they play; a shuffled cycle guarantees consecutive notes differ. */
  async collectDistinctNotes(count: number, timeoutMs: number): Promise<string[]> {
    const seen = new Set<string>()
    await this.driver.wait(
      async () => {
        const note = await this.getCurrentNote()
        if (note !== null && NOTE_NAMES.has(note)) {
          seen.add(note)
        }
        return seen.size >= count
      },
      timeoutMs,
      `saw only ${seen.size} distinct notes, expected ${count}`,
      POLL_MS,
    )
    return [...seen]
  }

  async waitForCurrentNote(expected: string, timeoutMs = 5_000): Promise<void> {
    await this.driver.wait(
      async () => (await this.getCurrentNote()) === expected,
      timeoutMs,
      `current note did not become ${expected}`,
      POLL_MS,
    )
  }

  async waitForTimerAtLeast(seconds: number, timeoutMs = 10_000): Promise<void> {
    await this.driver.wait(
      async () => timerToSeconds(await this.getTimer()) >= seconds,
      timeoutMs,
      `timer did not reach ${seconds}s`,
      POLL_MS,
    )
  }

  async sleep(ms: number): Promise<void> {
    await this.driver.sleep(ms)
  }
}
