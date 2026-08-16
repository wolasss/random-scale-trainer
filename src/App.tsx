/**
 * The composition root. Every hook the app runs is called here, and the wiring
 * between four of them is most of what this file is.
 *
 * `useSettings` holds the practice settings, and they feed both `usePlayback`
 * (with `speakNotes` forced on) and `useRoutine`. There are two ways to write
 * to them. `userDispatch` takes the edits the user makes to the settings a
 * routine block owns — tempo, beats per note, the note pool, spelling, the
 * ramp — so the routine can tell someone drifting off a block from its own
 * writes. The raw `dispatch` takes everything else: the routine applying a
 * block, the speed ramp's BPM write-back, and the settings no block owns (the
 * session goal, the practice toggles), which the user is free to change without
 * it meaning anything to the routine.
 *
 * `useSessionTimer` is the one clock. Playback starts and pauses it, and its
 * tick both advances the routine's block clock and banks time into the practice
 * log — so a pause stops all three at once, and neither the block nor the log
 * counts time nobody played.
 *
 * That leaves a cycle: the timer ticks the routine, the routine stops playback
 * when its last timed block runs out, playback starts and pauses the timer.
 * `routineRef` and `playbackRef` are what break it — the tick reaches the
 * routine through one and `onFinish` reaches playback through the other, so
 * neither hook has to be declared before the other.
 *
 * `useDisplayMode` picks the reading. On the stage this returns the stage shell
 * — hero, `StageTransport`, and the setup cards tucked into the slide-up
 * `PracticeSheet`; otherwise it returns the scrolling page grid. The cards are
 * built once above the branch and placed by whichever one runs.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { TopBar } from './components/TopBar'
import { Hero } from './components/Hero'
import { TransportBar } from './components/TransportBar'
import { StageTransport } from './components/StageTransport'
import { PracticeSheet } from './components/PracticeSheet'
import { InstallButton, IosInstallHint, UpdateChip } from './components/InstallControls'
import { TempoCard } from './components/TempoCard'
import { NotePoolCard } from './components/NotePoolCard'
import { FretboardCard } from './components/FretboardCard'
import { PracticeOptionsCard } from './components/PracticeOptionsCard'
import { SessionCard } from './components/SessionCard'
import { PracticeLogCard } from './components/PracticeLogCard'
import { RoutineCard } from './components/RoutineCard'
import { RoutineStrip } from './components/RoutineStrip'
import { SetupReveal } from './components/SetupReveal'
import { Footer } from './components/Footer'
import { createTapTempo, type TapTempo } from './lib/tapTempo'
import { useAppearance } from './hooks/useAppearance'
import { usePersistentState } from './hooks/usePersistentState'
import { usePlayback } from './hooks/usePlayback'
import { useBeatPulse } from './hooks/useBeatPulse'
import { useSessionTimer } from './hooks/useSessionTimer'
import { useSettings, type SettingsAction } from './hooks/useSettings'
import { useRoutine } from './hooks/useRoutine'
import { useIdlePreview } from './hooks/useIdlePreview'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { usePracticeHistory } from './hooks/usePracticeHistory'
import { useDisplayMode } from './hooks/useDisplayMode'
import { useWakeLock } from './hooks/useWakeLock'
import { useHiddenTimeout } from './hooks/useHiddenTimeout'
import { useInstallPrompt } from './hooks/useInstallPrompt'
import { useServiceWorker } from './hooks/useServiceWorker'
import { mergeHistories, readHistory, serializeBackup, writeHistory, type PracticeHistory } from './lib/history'
import { HIDDEN_STOP_MS, PLAYBACK_MESSAGES, STORAGE_KEYS } from './constants'

function App() {
  const { theme, setTheme, skin, setSkin } = useAppearance()
  const toggleTheme = () => setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))
  const [settings, dispatch] = useSettings()
  // False only until the very first start press (or a tap on the fold itself),
  // and never goes back — see SetupReveal.
  const [setupRevealed, setSetupRevealed] = usePersistentState<boolean>(STORAGE_KEYS.setupRevealed, {
    defaultValue: false,
    deserialize: (raw) => (raw === 'true' ? true : raw === 'false' ? false : undefined),
  })

  // The session timer, playback and the routine all need handles on each
  // other, so they go through refs that are refreshed on every render.
  const playbackRef = useRef<ReturnType<typeof usePlayback> | null>(null)
  const routineRef = useRef<ReturnType<typeof useRoutine> | null>(null)

  // The practice log rides the same tick as the block clock, so both stop the
  // moment playback does.
  const practiceHistory = usePracticeHistory()

  // The block clock rides the session timer's tick, so it pauses with playback.
  const sessionTimer = useSessionTimer({
    onTick: (elapsedMs) => {
      routineRef.current?.tick(elapsedMs)
      practiceHistory.trackElapsed(elapsedMs)
    },
  })
  const beatPulse = useBeatPulse()

  const playback = usePlayback({
    // The spoken note is always on; count-in and the rest ride the user's settings.
    settings: { ...settings, speakNotes: true },
    pool: settings.pool,
    spelling: settings.spelling,
    // The speed ramp's write-back goes to the raw dispatch: it is the routine's
    // own doing, never the user drifting off one.
    onBpmChange: (bpm) => dispatch({ type: 'setBpm', bpm }),
    onSessionStart: sessionTimer.start,
    onSessionPause: () => {
      sessionTimer.pause()
      // Every pause and stop banks what has been played, so a session only
      // ever loses the seconds since the last ten-second write.
      practiceHistory.commit()
    },
    onBeat: beatPulse.handleBeat,
  })

  const routine = useRoutine({
    settings,
    dispatch,
    sessionElapsedMs: sessionTimer.elapsedMs,
    isPlaying: playback.isPlaying,
    onFinish: useCallback(() => playbackRef.current?.stop(PLAYBACK_MESSAGES.routineComplete), []),
  })

  useEffect(() => {
    playbackRef.current = playback
    routineRef.current = routine
  })

  /**
   * Every settings change made by hand goes through here, so the routine can
   * tell the user's edits apart from its own block changes.
   */
  const userDispatch = (action: SettingsAction) => {
    routine.notifyManualChange(action)
    dispatch(action)
  }

  const display = useDisplayMode()
  const serviceWorker = useServiceWorker()
  const installPrompt = useInstallPrompt(display.standalone)
  const [setupOpen, setSetupOpen] = useState(false)

  // Everything that rearranges for the music stand keys off this one attribute,
  // so the stylesheet and the component tree can never disagree about which
  // reading is on. A pointer-and-keyboard browser never sets it.
  useEffect(() => {
    document.documentElement.toggleAttribute('data-stage', display.stage)
  }, [display.stage])

  // A metronome that dims out after thirty seconds is broken.
  useWakeLock(playback.isPlaying)

  // ...and one still clicking in a pocket is worse than one that stopped.
  useHiddenTimeout(
    playback.isPlaying,
    HIDDEN_STOP_MS,
    useCallback(() => playbackRef.current?.stop(PLAYBACK_MESSAGES.hiddenTooLong), []),
  )

  // iOS suspends the audio clock on the way out and does not restart it on the
  // way back in, which would leave the transport running silently.
  const { handleVisible } = playback
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleVisible()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [handleVisible])

  // The running total rewinds to zero on reset, so the log takes the rise and
  // ignores the fall rather than reading the counter as an absolute.
  const { notesCalled } = playback.snapshot
  const { trackNotes } = practiceHistory
  useEffect(() => {
    trackNotes(notesCalled)
  }, [notesCalled, trackNotes])

  const playOrPause = () => {
    if (playback.isPlaying) {
      playback.pause()
      return
    }

    // Starting a finished routine runs it again from block 0.
    if (routine.finished) {
      routine.restart()
    }

    // Practice has begun, so the setup below is no longer a page of questions
    // in front of the thing you came for. It stays out from here on.
    setSetupRevealed(true)
    void playback.start()
  }

  const resetSession = () => {
    playback.reset()
    sessionTimer.reset()
    routine.reset()
  }

  // The practice log's own control: it puts the session clock back to zero and
  // leaves everything else — playback, counters, the stored days — alone. A log
  // of what someone has actually practised is not something a stray click on a
  // heading button gets to erase.
  const clearTimer = () => {
    // The routine reads its block clock off this same session time, so the time
    // taken off the clock is handed to it: the block it is on keeps the minutes
    // it has already run, and still hands over when it is due.
    routine.rebase(sessionTimer.reset())
    // reset() stops the ticking; without this the clock would sit at 00:00
    // while the notes kept coming.
    if (playback.isPlaying) {
      sessionTimer.start()
    }
  }

  const tapTempoRef = useRef<TapTempo | null>(null)
  const handleTapTempo = () => {
    tapTempoRef.current ??= createTapTempo()
    const tapped = tapTempoRef.current.tap()
    if (tapped !== null) {
      userDispatch({ type: 'setBpm', bpm: tapped })
    }
  }

  useKeyboardShortcuts({
    onSpace: playOrPause,
    onTap: handleTapTempo,
    onTempoUp: () => userDispatch({ type: 'nudgeBpm', delta: 1 }),
    onTempoDown: () => userDispatch({ type: 'nudgeBpm', delta: -1 }),
    onReset: resetSession,
  })

  // Anything on the clock, in play, or a routine moved off block 0 — exactly
  // the state "Reset session" exists to unwind. Until then the transport shows
  // only Start, and the goal readout waits with it: a reset button at a zeroed
  // state invites the "what does this do?" click, and a second number gives an
  // idle screen more to parse than "press start".
  const sessionTouched =
    playback.isPlaying ||
    playback.isPaused ||
    sessionTimer.elapsedMs > 0 ||
    routine.blockIndex > 0 ||
    routine.finished

  // The idle hero's ghost note. Gated on the machine's own status: 'playing'
  // covers the count-in too, so the ghost is gone from the first press.
  const idlePreview = useIdlePreview(settings.pool, settings.spelling, playback.snapshot.status === 'idle')

  const activeBlock = routine.selected?.blocks[routine.blockIndex] ?? null
  // A multi-block routine names its current block; anything else keeps the
  // existing coaching lines.
  const heroMessage =
    playback.isPlaying && routine.selected !== null && routine.selected.blocks.length > 1 && activeBlock !== null
      ? `${routine.selected.name} · block ${routine.blockIndex + 1} of ${routine.selected.blocks.length} — ${activeBlock.name}`
      : undefined

  // Built once and placed by whichever reading is active. The installed app
  // rearranges where these sit; it never gets a different set of them.
  const routineStrip =
    routine.selected !== null ? (
      <RoutineStrip
        routine={routine.selected}
        blockIndex={routine.blockIndex}
        blockElapsedMs={routine.blockElapsedMs}
        finished={routine.finished}
        onClear={routine.clear}
      />
    ) : null

  const tempoCard = (
    <TempoCard
      bpm={settings.bpm}
      beatsPerNote={settings.beatsPerNote}
      poolSize={settings.pool.length}
      rampEnabled={settings.speedRampMode}
      rampTarget={settings.rampTargetBpm}
      rampAvailable={settings.continuousMode}
      onBpmChange={(bpm) => userDispatch({ type: 'setBpm', bpm })}
      onNudge={(delta) => userDispatch({ type: 'nudgeBpm', delta })}
      onTap={handleTapTempo}
      onBeatsPerNoteChange={(value) => userDispatch({ type: 'setBeatsPerNote', value })}
      // The ramp is block-owned now, so touching it drifts off a routine exactly
      // as touching the tempo does.
      onRampToggle={() => userDispatch({ type: 'setRamp', enabled: !settings.speedRampMode })}
      onRampTargetNudge={(delta) => userDispatch({ type: 'nudgeRampTarget', delta })}
    />
  )

  const notePoolCard = (
    <NotePoolCard
      pool={settings.pool}
      spelling={settings.spelling}
      onTogglePc={(pc) => userDispatch({ type: 'togglePoolNote', pc })}
      onPreset={(preset) => userDispatch({ type: 'setPreset', preset })}
      onSpelling={(value) => userDispatch({ type: 'setSpelling', value })}
    />
  )

  const sessionCard = (
    <SessionCard
      elapsedMs={sessionTimer.elapsedMs}
      goalMin={settings.sessionGoalMin}
      onGoal={(minutes) => dispatch({ type: 'setSessionGoal', minutes })}
      notesCalled={playback.snapshot.notesCalled}
      cyclesCompleted={playback.snapshot.cyclesCompleted}
    />
  )

  const fretboardCard = settings.showFretboard ? (
    <FretboardCard
      currentPc={playback.snapshot.currentNote?.pc ?? null}
      currentDisplay={playback.snapshot.currentNote?.display ?? null}
    />
  ) : null

  const practiceOptionsCard = (
    <PracticeOptionsCard settings={settings} onToggle={(key) => dispatch({ type: 'toggle', key })} />
  )

  // Both backup paths go through here rather than through the log's own hook,
  // which holds up to ten seconds of practice in refs and rewrites storage on
  // every commit. Exporting banks the pending seconds first, so the file is
  // never short of the session that is running as it is written.
  const getPracticeBackup = () => {
    practiceHistory.commit()

    return serializeBackup(readHistory(), new Date())
  }

  // A restore merges into what is stored and then reloads: the hook reads
  // storage once, on mount, so anything short of a reload would be overwritten
  // by its next commit. (A tick landing between the two would cost the seconds
  // in flight — the same seconds a refresh mid-session costs anyway.)
  const importPracticeBackup = (incoming: PracticeHistory) => {
    practiceHistory.commit()
    writeHistory(mergeHistories(readHistory(), incoming))
    window.location.reload()
  }

  const practiceLogCard = (
    <PracticeLogCard
      history={practiceHistory.history}
      onClear={clearTimer}
      getBackup={getPracticeBackup}
      onImportBackup={importPracticeBackup}
    />
  )

  const updateChip = serviceWorker.updateReady ? (
    <UpdateChip onReload={serviceWorker.applyUpdate} onDismiss={serviceWorker.dismissUpdate} />
  ) : null

  if (display.stage) {
    return (
      <div className="app-shell stage-shell">
        <div className="backdrop" />
        <main className="stage">
          <Hero
            variant="stage"
            snapshot={playback.snapshot}
            beatsPerNote={settings.beatsPerNote}
            poolSize={settings.pool.length}
            ringRef={beatPulse.ringRef}
            message={heroMessage}
            idlePreview={idlePreview}
          />

          {/* Landscape is the stand's natural orientation and the only place the
              neck is wide enough to read at arm's length. In portrait it goes
              back in the sheet with the rest of the setup. */}
          {display.landscape && fretboardCard !== null ? <div className="stage-side">{fretboardCard}</div> : null}

          <StageTransport
            isPlaying={playback.isPlaying}
            isPaused={playback.isPaused}
            routineName={routine.selected?.name ?? null}
            routineFinished={routine.finished}
            onPlayPause={playOrPause}
            onReset={resetSession}
            onOpenSetup={() => setSetupOpen(true)}
            started={sessionTouched}
            elapsedMs={sessionTimer.elapsedMs}
            goalMin={settings.sessionGoalMin}
            strip={routineStrip}
          />
        </main>

        <PracticeSheet open={setupOpen} onClose={() => setSetupOpen(false)}>
          {tempoCard}
          {notePoolCard}
          {practiceOptionsCard}
          <RoutineCard routine={routine} />
          {sessionCard}
          {display.landscape ? null : fretboardCard}
          {practiceLogCard}
          {/* The credits and the version have nowhere else to live once the
              page stops scrolling — the installed app loses nothing. */}
          <Footer skin={skin} onSkinChange={setSkin} theme={theme} onToggleTheme={toggleTheme} />
        </PracticeSheet>

        {updateChip}
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="backdrop" />
      <main className="app-grid">
        <TopBar
          theme={theme}
          onToggleTheme={toggleTheme}
          install={installPrompt.canInstall ? <InstallButton onInstall={installPrompt.install} /> : null}
        />

        {installPrompt.showIosHint ? <IosInstallHint onDismiss={installPrompt.dismissIosHint} /> : null}

        {/* The practice stage: everything you look at with the guitar in your
            hands, in one full-width card. The neck sits beside the note rather
            than in a column of its own — it is the answer to the question the
            note asks, and the pairing is lost across a few hundred pixels. */}
        <section className="panel practice-stage">
          <div className={`practice-stage-view ${fretboardCard !== null ? 'with-neck' : ''}`}>
            <Hero
              snapshot={playback.snapshot}
              beatsPerNote={settings.beatsPerNote}
              poolSize={settings.pool.length}
              ringRef={beatPulse.ringRef}
              message={heroMessage}
              idlePreview={idlePreview}
            />

            {fretboardCard !== null ? <div className="practice-stage-neck">{fretboardCard}</div> : null}
          </div>

          {routineStrip}

          <TransportBar
            isPlaying={playback.isPlaying}
            isPaused={playback.isPaused}
            routineName={routine.selected?.name ?? null}
            routineFinished={routine.finished}
            onPlayPause={playOrPause}
            onReset={resetSession}
            started={sessionTouched}
            elapsedMs={sessionTimer.elapsedMs}
            goalMin={settings.sessionGoalMin}
          />
        </section>

        {/* Setup below, in the order the concepts build on each other: the
            controls first — notes on one full-width row of chips, then the
            knobs — and only then Saved setups, which is a layer over those
            controls ("save these, come back to them") and reads as one once
            they have been seen. The stage sheet keeps the same order.

            None of it is on screen until practice has started once: the stage
            above plays on the defaults, and a first run that opens on a column
            of controls reads as a form to fill in. */}
        {setupRevealed ? (
          <>
            {notePoolCard}

            {/* Knobs: touched occasionally, and small enough to pair up. */}
            <div className="card-row">
              {tempoCard}

              {practiceOptionsCard}
            </div>

            <RoutineCard routine={routine} />

            {/* Both of these are about time practised — one live, one historical —
                and both are read after a session rather than during one. */}
            <div className="card-row">
              {sessionCard}

              {practiceLogCard}
            </div>
          </>
        ) : (
          <SetupReveal onReveal={() => setSetupRevealed(true)} />
        )}
      </main>

      <Footer skin={skin} onSkinChange={setSkin} />

      {updateChip}
    </div>
  )
}

export default App
