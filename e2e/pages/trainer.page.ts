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
  // The ramp names its ceiling, then says when the tempo has settled on it.
  rampClimbing: (target: number) => `Climbing to ${target} BPM, 2 at a time.`,
  rampHolding: (bpm: number) => `At your target tempo — holding ${bpm} BPM.`,
  paused: 'Paused — the timer stopped too.',
  finished: 'Finished all 12 notes.',
}
/** The hero shows the count-in digit where the note normally appears. */
export const COUNT_IN_DIGIT = /^[1-4]$/

export const STORAGE_KEYS = {
  theme: 'fretboard-theme',
  bpm: 'fretboard-bpm',
  continuousMode: 'fretboard-continuous-mode',
  speedRampMode: 'fretboard-speed-ramp-mode',
  rampTarget: 'fretboard-ramp-target',
  beatsPerNote: 'fretboard-beats-per-note',
  notePool: 'fretboard-note-pool',
  spelling: 'fretboard-spelling',
  sessionGoal: 'fretboard-session-goal',
  setupRevealed: 'fretboard-setup-revealed',
  micListen: 'fretboard-mic-listen',
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
  rampTarget: By.css('[data-testid="ramp-target"]'),
  rampTargetValue: By.css('[data-testid="ramp-target-value"]'),
  rampTargetUp: By.css('[data-testid="ramp-target-up"]'),
  rampTargetDown: By.css('[data-testid="ramp-target-down"]'),
  rampHelper: By.css('[data-testid="ramp-helper"]'),
  cycleTime: By.css('.target-time'),
  heading: By.css('h1'),
  nextNote: By.css('[data-testid="next-note"]'),
  cyclePosition: By.css('[data-testid="cycle-position"]'),
  bpmDown: By.css('[data-testid="bpm-down"]'),
  bpmUp: By.css('[data-testid="bpm-up"]'),
  tapTempo: By.css('[data-testid="tap-tempo"]'),
  noteEvery: By.css('[data-testid="note-every"]'),
  presetSelect: By.css('[data-testid="preset-select"]'),
  poolGuarantee: By.css('[data-testid="pool-guarantee"]'),
  spelling: By.css('[data-testid="spelling"]'),
  sessionGoal: By.css('[data-testid="session-goal"]'),
  sessionProgress: By.css('[data-testid="session-progress"]'),
  statNotes: By.css('[data-testid="stat-notes"]'),
  statCycles: By.css('[data-testid="stat-cycles"]'),
  openSetup: By.css('[data-testid="open-setup"]'),
  practiceSheet: By.css('[data-testid="practice-sheet"]'),
  setupReveal: By.css('[data-testid="setup-reveal"]'),
  routineCard: By.css('[data-testid="routine-card"]'),
  transportReadout: By.css('[data-testid="transport-readout"]'),
  scoreboard: By.css('[data-testid="scoreboard"]'),
  scoreboardHide: By.css('[data-testid="scoreboard-hide"]'),
  scoreboardHandle: By.css('[data-testid="scoreboard-handle"]'),
  scoreboardNudge: By.css('[data-testid="scoreboard-nudge"]'),
  scoreboardEmpty: By.css('[data-testid="scoreboard-empty"]'),
  nicknamePrompt: By.css('[data-testid="nickname-prompt"]'),
  nicknameError: By.css('[data-testid="nickname-error"]'),
  nicknameInput: By.css('[data-testid="nickname-input"]'),
  nicknameSubmit: By.css('[data-testid="nickname-submit"]'),
  nicknameDismiss: By.css('[data-testid="nickname-dismiss"]'),
  micReadout: By.css('[data-testid="mic-readout"]'),
  scorePlay: By.css('[data-testid="score-play"]'),
  reportBug: By.css('[data-testid="report-bug-button"]'),
  bugReportModal: By.css('[data-testid="bug-report-modal"]'),
  bugDescription: By.css('[data-testid="bug-description"]'),
  bugSubmit: By.css('[data-testid="bug-submit"]'),
  bugSent: By.css('[data-testid="bug-sent"]'),
  bugUnavailable: By.css('[data-testid="bug-unavailable"]'),
  bugCaptchaToken: By.css('[data-testid="bug-captcha"] input[name="cf-turnstile-response"]'),
}

/** Roots the layout guard measures against. */
export const OVERFLOW_ROOTS = {
  page: 'body',
  sheet: '.sheet-body',
}

export type Overflow = {
  /** How far the root's content reaches past its own box, in CSS pixels. */
  scrollOverhang: number
  /** The widest few culprits, so a failure names the element to fix. */
  offenders: Array<{ label: string; over: number }>
}

const noteChip = (pc: number) => By.css(`[data-testid="note-chip-${pc}"]`)

/**
 * Reports everything sticking out past a root's right edge, skipping whatever
 * sits inside a deliberate horizontal scroller — the fretboard rides in one and
 * is meant to be swiped.
 *
 * A hit means the root scrolls sideways, and where the root also scrolls
 * vertically, as the practice sheet's body does, CSS computes overflow-x to
 * auto along with it: one over-wide child then drags every one of its siblings
 * off the screen with it.
 */
const OVERFLOW_SCRIPT = `
  const root = document.querySelector(arguments[0])
  if (root === null) {
    throw new Error('overflow root not found: ' + arguments[0])
  }

  const limit = root.getBoundingClientRect().right
  const scrollsSideways = (element) => {
    const overflowX = getComputedStyle(element).overflowX
    return overflowX === 'auto' || overflowX === 'scroll'
  }

  const offenders = []
  for (const element of root.querySelectorAll('*')) {
    const rect = element.getBoundingClientRect()
    // Sub-pixel rounding puts plenty of honest layouts a hair over the edge.
    if (rect.width === 0 || rect.right <= limit + 1) {
      continue
    }

    let clipped = false
    for (let parent = element.parentElement; parent !== null && parent !== root; parent = parent.parentElement) {
      if (scrollsSideways(parent)) {
        clipped = true
        break
      }
    }

    if (!clipped) {
      const classes = String(element.className).trim().split(/\\s+/).filter(Boolean)
      offenders.push({
        label: element.tagName.toLowerCase() + (classes.length > 0 ? '.' + classes.join('.') : ''),
        over: Math.round(rect.right - limit),
      })
    }
  }

  return {
    scrollOverhang: Math.max(0, root.scrollWidth - root.clientWidth),
    offenders: offenders.sort((a, b) => b.over - a.over).slice(0, 5),
  }
`

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

  /**
   * Open the app with a clean localStorage so every test starts from defaults —
   * except for the first-run fold, which is left open. A fresh profile is a
   * first run by definition, and every spec below this one is about the
   * controls the fold hides. `01-initial-load` covers the folded state itself.
   */
  async openFresh(): Promise<void> {
    await this.open()
    await this.driver.executeScript(
      `window.localStorage.clear(); window.localStorage.setItem(arguments[0], 'true')`,
      STORAGE_KEYS.setupRevealed,
    )
    await this.refresh()
  }

  /**
   * Open a shared challenge with a clean localStorage, so the nickname prompt
   * is always the one a first-time visitor gets. `?challenge=` is the whole
   * feature switch — the app is untouched without it.
   */
  async openChallenge(challenge: string): Promise<void> {
    await this.open()
    await this.driver.executeScript('window.localStorage.clear()')
    await this.driver.get(`${config.appBaseUrl}/?challenge=${encodeURIComponent(challenge)}`)
    await this.driver.wait(until.elementLocated(SELECTORS.playToggle), 10_000)
    await this.disableAnimations()
  }

  /**
   * Types a name and reserves it. Waits for the round trip to land, either way:
   * a claim is a request now, so the prompt is still up for a moment after the
   * click and reading anything before it settles would be reading the old state.
   */
  async joinChallenge(nickname: string): Promise<void> {
    await this.driver.wait(until.elementLocated(SELECTORS.nicknameInput), 10_000)
    await this.driver.findElement(SELECTORS.nicknameInput).clear()
    await this.driver.findElement(SELECTORS.nicknameInput).sendKeys(nickname)
    await this.driver.findElement(SELECTORS.nicknameSubmit).click()
    await this.driver.wait(
      async () => (await this.hasNicknamePrompt()) === false || (await this.getNicknameError()) !== '',
      10_000,
    )
  }

  async hasNicknamePrompt(): Promise<boolean> {
    return (await this.driver.findElements(SELECTORS.nicknamePrompt)).length > 0
  }

  /** Leaves the prompt without joining: the board stays, read-only. */
  async dismissNicknamePrompt(): Promise<void> {
    await this.driver.findElement(SELECTORS.nicknameDismiss).click()
  }

  /** Why the last claim was refused, or '' if it was not. */
  async getNicknameError(): Promise<string> {
    const found = await this.driver.findElements(SELECTORS.nicknameError)

    return found.length === 0 ? '' : found[0].getText()
  }

  /**
   * Forgets everything this browser knows and comes back to the same challenge.
   * That is a *different person* as far as the board is concerned — the
   * ownership token was the only copy, and losing it loses the nickname.
   */
  async forgetAndReopenChallenge(challenge: string): Promise<void> {
    await this.driver.executeScript('window.localStorage.clear()')
    await this.driver.get(`${config.appBaseUrl}/?challenge=${encodeURIComponent(challenge)}`)
    await this.driver.wait(until.elementLocated(SELECTORS.playToggle), 10_000)
    await this.disableAnimations()
  }

  /**
   * One request against the scoreboard API, made from the page itself — the
   * same origin, the same cookies, everything a real attacker in this browser
   * would have. Answers `{ status, body }` so a spec can assert on both.
   */
  async callApi(
    path: string,
    { method = 'GET', body, token }: { method?: string; body?: unknown; token?: string } = {},
  ): Promise<{ status: number; body: string }> {
    return this.driver.executeAsyncScript(
      `const [path, method, body, token, done] = arguments;
       fetch(path, {
         method,
         headers: {
           ...(body === null ? {} : { 'Content-Type': 'application/json' }),
           ...(token === null ? {} : { Authorization: 'Bearer ' + token }),
         },
         body: body === null ? undefined : body,
       })
         .then((response) => response.text().then((text) => done({ status: response.status, body: text })))
         .catch((error) => done({ status: 0, body: String(error) }));`,
      path,
      method,
      body === undefined ? null : JSON.stringify(body),
      token ?? null,
    )
  }

  // --- reporting a bug ---

  /** Whether the footer offers the report button at all, at this width. */
  async hasReportBugButton(): Promise<boolean> {
    const found = await this.driver.findElements(SELECTORS.reportBug)

    return found.length > 0 && (await found[0].isDisplayed())
  }

  async openBugReport(): Promise<void> {
    await this.driver.findElement(SELECTORS.reportBug).click()
    await this.driver.wait(until.elementLocated(SELECTORS.bugReportModal), 5_000)
  }

  async hasBugReportModal(): Promise<boolean> {
    return (await this.driver.findElements(SELECTORS.bugReportModal)).length > 0
  }

  /**
   * What the modal says when it cannot take a report — either the deployment
   * has no keys or the widget script never arrived. '' when it can.
   */
  async getBugReportUnavailable(): Promise<string> {
    const found = await this.driver.findElements(SELECTORS.bugUnavailable)

    return found.length === 0 ? '' : found[0].getText()
  }

  /**
   * Waits for the captcha to hand a token over, and answers false if it never
   * does. Cloudflare's script is the one thing on this page that comes from
   * another origin, and a runner with no egress will not have it.
   *
   * The token is read off the hidden field the widget writes rather than off an
   * iframe: against the always-passes test key there is no challenge to show,
   * so the widget renders no frame at all — only the field.
   */
  async waitForBugCaptcha(timeoutMs = 15_000): Promise<boolean> {
    try {
      await this.driver.wait(
        async () => {
          const found = await this.driver.findElements(SELECTORS.bugCaptchaToken)
          return found.length > 0 && ((await found[0].getAttribute('value')) ?? '') !== ''
        },
        timeoutMs,
        'the captcha never produced a token',
        POLL_MS,
      )
      return true
    } catch {
      return false
    }
  }

  async describeBug(text: string): Promise<void> {
    await this.driver.findElement(SELECTORS.bugDescription).sendKeys(text)
  }

  /** Submits once the widget has handed a token over, then waits for the answer. */
  async submitBugReport(timeoutMs = 20_000): Promise<void> {
    await this.driver.wait(until.elementIsEnabled(this.driver.findElement(SELECTORS.bugSubmit)), timeoutMs)
    await this.driver.findElement(SELECTORS.bugSubmit).click()
    await this.driver.wait(until.elementLocated(SELECTORS.bugSent), timeoutMs)
  }

  async hasScoreboard(): Promise<boolean> {
    return (await this.driver.findElements(SELECTORS.scoreboard)).length > 0
  }

  /**
   * Every row on the board, as "<nickname> <points>" pairs, top first. The name
   * is read off `.scoreboard-name` rather than the cell around it: your own row
   * carries a "· you" tag in that cell, and a board is a list of names.
   */
  async getScoreboardEntries(): Promise<Array<{ nickname: string; points: number }>> {
    const rows = await this.driver.findElements(By.css('.scoreboard-entry'))

    return Promise.all(
      rows.map(async (row) => ({
        nickname: await row.findElement(By.css('.scoreboard-name')).getText(),
        points: Number(await row.findElement(By.css('.scoreboard-points')).getText()),
      })),
    )
  }

  /** What the board says for itself while it has no rows — '' once it has some. */
  async getScoreboardEmptyText(): Promise<string> {
    const found = await this.driver.findElements(SELECTORS.scoreboardEmpty)

    return found.length === 0 ? '' : found[0].getText()
  }

  /** Folds the desktop rail away to its handle, and reads what the handle says. */
  async hideScoreboardRail(): Promise<void> {
    await this.driver.findElement(SELECTORS.scoreboardHide).click()
    await this.driver.wait(until.elementLocated(SELECTORS.scoreboardHandle), 5_000)
  }

  /** The handle's full standing, as a screen reader would get it — '' if absent. */
  async getScoreboardHandleLabel(): Promise<string> {
    const found = await this.driver.findElements(SELECTORS.scoreboardHandle)

    return found.length === 0 ? '' : ((await found[0].getAttribute('aria-label')) ?? '')
  }

  /** The one line under the rail that is about you rather than everybody. */
  async getScoreboardNudge(): Promise<string> {
    const found = await this.driver.findElements(SELECTORS.scoreboardNudge)

    return found.length === 0 ? '' : found[0].getText()
  }

  /** Open the app exactly as a first-time visitor gets it: setup folded away. */
  async openFirstRun(): Promise<void> {
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

  /** Text of the NEXT chip ('—' while the deck is empty). */
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

  /** The Climb to panel only exists while the ramp is on. */
  async hasRampTarget(): Promise<boolean> {
    return (await this.driver.findElements(SELECTORS.rampTarget)).length > 0
  }

  /** The first-run fold: present only while the setup cards are folded away. */
  async hasSetupReveal(): Promise<boolean> {
    return (await this.driver.findElements(SELECTORS.setupReveal)).length > 0
  }

  /** Routine is the first of the setup cards — its presence stands for them. */
  async hasSetupCards(): Promise<boolean> {
    return (await this.driver.findElements(SELECTORS.routineCard)).length > 0
  }

  async openSetupFold(): Promise<void> {
    await this.driver.findElement(SELECTORS.setupReveal).click()
    await this.driver.wait(until.elementLocated(SELECTORS.routineCard), 5_000)
  }

  async getRampTarget(): Promise<number> {
    return Number(await this.driver.findElement(SELECTORS.rampTargetValue).getText())
  }

  async getRampHelper(): Promise<string> {
    return this.driver.findElement(SELECTORS.rampHelper).getText()
  }

  async getTimer(): Promise<string> {
    return this.driver.findElement(SELECTORS.timer).getText()
  }

  /** The transport's own clock — the one reading that survives the setup fold. */
  async getTransportReadout(): Promise<string> {
    return this.driver.findElement(SELECTORS.transportReadout).getText()
  }

  /** Reset and the readout only exist once there is something on the clock. */
  async hasResetControl(): Promise<boolean> {
    return (await this.driver.findElements(SELECTORS.reset)).length > 0
  }

  async hasTransportReadout(): Promise<boolean> {
    return (await this.driver.findElements(SELECTORS.transportReadout)).length > 0
  }

  /** The mic readout only mounts once mic listening is turned on in settings. */
  async hasMicReadout(): Promise<boolean> {
    return (await this.driver.findElements(SELECTORS.micReadout)).length > 0
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

  /** True once the app has swapped to the propped-on-a-stand layout. */
  async isStageLayout(): Promise<boolean> {
    return this.driver.executeScript('return document.documentElement.hasAttribute("data-stage")')
  }

  async getViewportWidth(): Promise<number> {
    return this.driver.executeScript('return document.documentElement.clientWidth')
  }

  /** @see OVERFLOW_SCRIPT */
  async measureOverflow(root: string): Promise<Overflow> {
    return this.driver.executeScript<Overflow>(OVERFLOW_SCRIPT, root)
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

  /**
   * Opens the practice sheet, where the stage layout keeps every setting.
   * Its slide-up is an animation, which disableAnimations() has already
   * stripped, so the body is at its final size as soon as it is located.
   */
  async openSetupSheet(): Promise<void> {
    await this.driver.findElement(SELECTORS.openSetup).click()
    await this.driver.wait(until.elementLocated(SELECTORS.practiceSheet), 5_000)
    await this.driver.wait(until.elementLocated(By.css(OVERFLOW_ROOTS.sheet)), 5_000)
  }

  async clickBpmStepper(direction: 'up' | 'down'): Promise<void> {
    await this.driver.findElement(direction === 'up' ? SELECTORS.bpmUp : SELECTORS.bpmDown).click()
  }

  /**
   * Taps the tap-tempo button `times` times, `intervalMs` apart, and returns the
   * page-clock (performance.now()) timestamp the app saw for each tap. intervalMs
   * is a floor, not the measured interval — the WebDriver round trip for each
   * click() lands inside the sleep, so only these in-page timestamps say what
   * tempo was actually tapped.
   */
  async tapTempo(times: number, intervalMs: number): Promise<number[]> {
    await this.driver.executeScript(`
      if (window.__tapTimes === undefined) {
        window.__tapTimes = []
        document.addEventListener('click', (event) => {
          if (event.target.closest('[data-testid="tap-tempo"]') !== null) {
            window.__tapTimes.push(performance.now())
          }
        }, true)
      }
      window.__tapTimes.length = 0
    `)

    for (let index = 0; index < times; index++) {
      if (index > 0) {
        await this.sleep(intervalMs)
      }
      await this.driver.findElement(SELECTORS.tapTempo).click()
    }

    return this.driver.executeScript<number[]>('return window.__tapTimes')
  }

  /** Clicks the note-every segmented option with the given beat count. */
  async setNoteEvery(beats: 1 | 2 | 4 | 8): Promise<void> {
    await this.driver
      .findElement(SELECTORS.noteEvery)
      .findElement(By.css(`[data-value="${beats}"]`))
      .click()
  }

  async selectPreset(presetId: string): Promise<void> {
    const select = this.driver.findElement(SELECTORS.presetSelect)
    await select.click()
    await select.findElement(By.css(`option[value="${presetId}"]`)).click()
  }

  async getPresetValue(): Promise<string | null> {
    return this.driver.findElement(SELECTORS.presetSelect).getAttribute('value')
  }

  async toggleChip(pc: number): Promise<void> {
    await this.driver.findElement(noteChip(pc)).click()
  }

  async isChipSelected(pc: number): Promise<boolean> {
    return (await this.driver.findElement(noteChip(pc)).getAttribute('aria-pressed')) === 'true'
  }

  async getChipLabel(pc: number): Promise<string> {
    return this.driver.findElement(noteChip(pc)).getText()
  }

  async getPoolGuarantee(): Promise<string> {
    return this.driver.findElement(SELECTORS.poolGuarantee).getText()
  }

  async setSpelling(value: 'flat' | 'sharp' | 'mixed'): Promise<void> {
    await this.driver
      .findElement(SELECTORS.spelling)
      .findElement(By.css(`[data-value="${value}"]`))
      .click()
  }

  async setSessionGoal(minutes: 5 | 10 | 20 | 30): Promise<void> {
    await this.driver
      .findElement(SELECTORS.sessionGoal)
      .findElement(By.css(`[data-value="${minutes}"]`))
      .click()
  }

  async getSessionProgress(): Promise<number> {
    const value = await this.driver.findElement(SELECTORS.sessionProgress).getAttribute('aria-valuenow')
    return Number(value)
  }

  async getStat(stat: 'notes' | 'cycles'): Promise<number> {
    const locator = stat === 'notes' ? SELECTORS.statNotes : SELECTORS.statCycles
    return Number(await this.driver.findElement(locator).getText())
  }

  async clickContinuousToggle(): Promise<void> {
    await this.driver.findElement(SELECTORS.continuousToggle).click()
  }

  async clickSpeedRampToggle(): Promise<void> {
    await this.driver.findElement(SELECTORS.speedRampToggle).click()
  }

  async clickRampTargetUp(): Promise<void> {
    await this.driver.findElement(SELECTORS.rampTargetUp).click()
  }

  async clickRampTargetDown(): Promise<void> {
    await this.driver.findElement(SELECTORS.rampTargetDown).click()
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
  /**
   * Escape, sent wherever focus already is. Unlike `pressBody` this moves no
   * focus first: with a modal open the heading is behind the scrim, and
   * clicking it would dismiss what is being tested.
   */
  async pressEscape(): Promise<void> {
    await this.driver.actions().sendKeys(Key.ESCAPE).perform()
  }

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

  /**
   * Resolves once the score row has something to show — the first note has
   * been scored. A default tempo takes seconds per note, hence the generous
   * timeout; the fake microphone rarely lands a hit, so this also passes on
   * the first miss, which is all the layout guard needs. The in-play row is
   * what it waits for: the summary only exists once playback has stopped, and
   * the guard measures the readout while a session is running.
   */
  async waitForScoreRow(timeoutMs = 25_000): Promise<void> {
    await this.driver.wait(until.elementLocated(SELECTORS.scorePlay), timeoutMs, 'score row never appeared')
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
