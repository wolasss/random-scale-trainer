/**
 * The composition root. Every hook the app runs is called here, and the wiring
 * between four of them is most of what this file is.
 *
 * `useSettings` holds the practice settings, and they feed both `usePlayback`
 * and `useRoutine`. There are two ways to write
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
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { TopBar } from './components/TopBar'
import { Hero } from './components/Hero'
import { TransportBar } from './components/TransportBar'
import { StageTransport } from './components/StageTransport'
import { PracticeSheet } from './components/PracticeSheet'
import { AndroidInstallHint, InstallButton, IosInstallHint, UpdateChip } from './components/InstallControls'
import { MicDebugPanel } from './components/MicDebugPanel'
import { TempoCard } from './components/TempoCard'
import { NotePoolCard } from './components/NotePoolCard'
import { FretboardCard } from './components/FretboardCard'
import { PracticeOptionsCard } from './components/PracticeOptionsCard'
import { SessionCard } from './components/SessionCard'
import { PracticeLogCard } from './components/PracticeLogCard'
import { RoutineCard } from './components/RoutineCard'
import { RoutineStrip } from './components/RoutineStrip'
import { SetupReveal } from './components/SetupReveal'
import { MicReadout, type BoardStanding } from './components/MicReadout'
import type { ScoreboardLayout } from './components/ScoreboardStrip'
import { ChunkErrorBoundary } from './components/ChunkErrorBoundary'
import { Footer } from './components/Footer'
import { createTapTempo, type TapTempo } from './lib/tapTempo'
import { AudioEngine } from './lib/audio/engine'
import { isMicSupported, primeMicPermission } from './lib/audio/mic'
import { useAppearance } from './hooks/useAppearance'
import { usePersistentState } from './hooks/usePersistentState'
import { useSavedPresets } from './hooks/useSavedPresets'
import { usePlayback } from './hooks/usePlayback'
import { useMicPitch } from './hooks/useMicPitch'
import { useNoteScoring } from './hooks/useNoteScoring'
import { useBeatPulse } from './hooks/useBeatPulse'
import { useSessionTimer } from './hooks/useSessionTimer'
import { useSettings, type SettingsAction } from './hooks/useSettings'
import { useRoutine } from './hooks/useRoutine'
import { useIdlePreview } from './hooks/useIdlePreview'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { usePracticeHistory } from './hooks/usePracticeHistory'
import { useDisplayMode } from './hooks/useDisplayMode'
import { useMediaQuery } from './hooks/useMediaQuery'
import { useWakeLock } from './hooks/useWakeLock'
import { useHiddenTimeout } from './hooks/useHiddenTimeout'
import { useInstallPrompt } from './hooks/useInstallPrompt'
import { useServiceWorker } from './hooks/useServiceWorker'
import { useChallenge } from './hooks/useChallenge'
import { mergeHistories, readHistory, serializeBackup, writeHistory, type PracticeHistory } from './lib/history'
import { HIDDEN_STOP_MS, PLAYBACK_MESSAGES, SCOREBOARD_RAIL_QUERY, STORAGE_KEYS } from './constants'

// Only ever mounted on `?challenge=` — lazy so the rest of the app never pays
// to ship them.
const NicknamePrompt = lazy(() => import('./components/NicknamePrompt'))
const ScoreboardStrip = lazy(() => import('./components/ScoreboardStrip'))

type AppProps = {
  /** Injectable for tests; otherwise the browser's own reload. */
  reload?: () => void
}

function App({ reload = () => window.location.reload() }: AppProps = {}) {
  const { theme, setTheme, skin, setSkin } = useAppearance()
  const toggleTheme = () => setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))
  const [settings, dispatch] = useSettings()
  // False only until the very first start press (or a tap on the fold itself),
  // and never goes back — see SetupReveal.
  const [setupRevealed, setSetupRevealed] = usePersistentState<boolean>(STORAGE_KEYS.setupRevealed, {
    defaultValue: false,
    deserialize: (raw) => (raw === 'true' ? true : raw === 'false' ? false : undefined),
  })
  // Held here rather than in NotePoolCard: the installed layout unmounts that
  // card with the practice sheet, and a preset localStorage refused to take
  // would go with it.
  const [savedPresets, setSavedPresets, savedPresetsPersisted] = useSavedPresets()

  // One engine for the whole app: playback schedules its cues on it and the
  // microphone hangs its analyser off the very same AudioContext, so a
  // detection and a beat are timestamps on one clock rather than two. Created
  // lazily in a ref the way usePlayback used to create its own — the
  // constructor opens no AudioContext, so building it during render is safe.
  const engineRef = useRef<AudioEngine | null>(null)
  const engine = (engineRef.current ??= new AudioEngine())

  // The session timer, playback and the routine all need handles on each
  // other, so they go through refs that are refreshed on every render.
  const playbackRef = useRef<ReturnType<typeof usePlayback> | null>(null)
  const routineRef = useRef<ReturnType<typeof useRoutine> | null>(null)
  // Scoring needs the microphone, which needs the engine playback runs on, so
  // it cannot be declared above the beat handler that feeds it either.
  const scoringRef = useRef<ReturnType<typeof useNoteScoring> | null>(null)

  // The practice log rides the same tick as the block clock, so both stop the
  // moment playback does.
  const practiceHistory = usePracticeHistory()

  // Off entirely unless '?challenge=' brought the user here — see useChallenge.
  // Declared above playback because the transport's pause is what banks a score.
  const challenge = useChallenge({ config: { bpm: settings.bpm, beatsPerNote: settings.beatsPerNote } })

  // The block clock rides the session timer's tick, so it pauses with playback.
  const sessionTimer = useSessionTimer({
    onTick: (elapsedMs) => {
      routineRef.current?.tick(elapsedMs)
      practiceHistory.trackElapsed(elapsedMs)
    },
  })
  const beatPulse = useBeatPulse()

  const playback = usePlayback({
    settings,
    pool: settings.pool,
    spelling: settings.spelling,
    // The speed ramp's write-back goes to the raw dispatch: it is the routine's
    // own doing, never the user drifting off one.
    onBpmChange: (bpm) => dispatch({ type: 'setBpm', bpm }),
    onSessionStart: sessionTimer.start,
    onSessionPause: () => {
      const pausedAtMs = sessionTimer.pause()
      // A practice milestone crossed by this very elapsed update is credited
      // with the pause itself, rather than left to the effect that would
      // otherwise only catch it on the next render.
      scoringRef.current?.creditElapsedMs(pausedAtMs)
      // Every pause and stop banks what has been played, so a session only
      // ever loses the seconds since the last ten-second write.
      practiceHistory.commit()
      // ...and the same moment sends what has been played up to the shared
      // board, if there is one. A no-op off a challenge, and a no-op again with
      // nothing queued. A pause is not the end of a session — resuming is the
      // same practice run — so the scoring session stays open across it.
      challenge.flushEvents()
    },
    // Both of these are ref-only handlers, as onBeat demands: the ring is
    // mutated in place and the score is queued for a microtask.
    onBeat: (event) => {
      beatPulse.handleBeat(event)
      scoringRef.current?.handleBeat(event)
    },
    audio: engine,
  })

  // One value for "the mic is on", read by the hook, the readout and the switch
  // alike: a browser with no microphone API cannot listen, whatever a setting
  // stored by a browser that could says, and a readout the switch reports as
  // off is one the user has no way to be rid of.
  //
  // A shared challenge turns it on regardless of the setting: the board is a
  // board of points, and points come from what the microphone hears. The switch
  // in setup still shows the stored preference, which is what it is for — it is
  // the challenge, not the setting, that is listening.
  const micEnabled = (settings.micEnabled || challenge.active) && isMicSupported()

  // ...and the browser's permission dialog is asked for on arrival rather than
  // at the first note, so it lands on a setup screen instead of on top of the
  // thing you are meant to be reading. Once per visit, and without waiting for
  // a nickname to be entered: the permission is needed whether or not anybody
  // joins.
  //
  // The prompt itself, though, has to be waited on: it is the thing that
  // explains the permission before the browser's own dialog does, and it is a
  // lazily-loaded chunk, so it is not necessarily on screen the instant
  // `challenge.active` flips true. `nicknamePromptReady` tracks whether it has
  // actually mounted — set from the prompt's own effect, so it flips after the
  // browser has painted the explanation, never before.
  const [nicknamePromptReady, setNicknamePromptReady] = useState(false)
  const onNicknamePromptReady = useCallback(() => setNicknamePromptReady(true), [])
  const micPrimedRef = useRef(false)
  useEffect(() => {
    if (!challenge.active || micPrimedRef.current) {
      return
    }

    const waitingOnPrompt = challenge.needsNickname && challenge.name !== null && !nicknamePromptReady
    if (waitingOnPrompt) {
      return
    }

    micPrimedRef.current = true
    void primeMicPermission()
  }, [challenge.active, challenge.needsNickname, challenge.name, nicknamePromptReady])

  // Default off, and only ever open alongside playback: with the setting off
  // nothing here touches a microphone API at all. The note count is what the
  // readout is cleared by — what you played last is an answer to the note that
  // was on screen when you played it, and stale the moment the next one lands.
  const mic = useMicPitch({
    engine,
    enabled: micEnabled,
    running: playback.isPlaying,
    // Null through the count-in, which has no note on screen to answer.
    callId: playback.snapshot.currentNote === null ? null : playback.snapshot.notesCalled,
  })

  // Judging what was heard against what was called. Only ever scores while the
  // microphone is actually open, so the tally is empty by construction with the
  // setting off — and the readout that would show it is not rendered anyway.
  const scoring = useNoteScoring({
    engine,
    subscribe: mic.subscribe,
    active: micEnabled && mic.status === 'listening',
    running: playback.isPlaying,
    // Off a challenge this queues nothing: the shared board decides what a note
    // is worth, from the events themselves, and there is no board here to tell.
    onScored: challenge.recordEvent,
    sessionElapsedMs: sessionTimer.elapsedMs,
  })

  const routine = useRoutine({
    settings,
    dispatch,
    sessionElapsedMs: sessionTimer.elapsedMs,
    getSessionElapsedMs: sessionTimer.getElapsedMs,
    isPlaying: playback.isPlaying,
    onFinish: useCallback(() => playbackRef.current?.stop(PLAYBACK_MESSAGES.routineComplete), []),
  })

  useEffect(() => {
    playbackRef.current = playback
    routineRef.current = routine
    scoringRef.current = scoring
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
  // Which shape the shared board takes. The rail wants a column of its own, so
  // it is only offered where there is a desktop's width to spare — the stand
  // never qualifies, whatever it is propped on, because the note owns that
  // screen. Everywhere else the board folds above the transport instead.
  const boardRailFits = useMediaQuery(SCOREBOARD_RAIL_QUERY)
  const boardLayout: ScoreboardLayout = !display.stage && boardRailFits ? 'rail' : 'fold'
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
    // The score is a property of the session, so it goes back with it — on the
    // shared board too, or a fresh local tally would go on feeding the server
    // session the old one opened.
    scoring.reset()
    challenge.endSession()
  }

  // The practice log's own control: it puts the session clock back to zero and
  // leaves everything else — playback, counters, the stored days — alone. A log
  // of what someone has actually practised is not something a stray click on a
  // heading button gets to erase.
  const clearTimer = () => {
    const cleared = sessionTimer.reset()
    // The routine reads its block clock off this same session time, so the time
    // taken off the clock is handed to it: the block it is on keeps the minutes
    // it has already run, and still hands over when it is due.
    routine.rebase(cleared)
    // The milestone guards in useNoteScoring are keyed off this same clock; the
    // same rebase keeps 20 and 30 minutes arriving on schedule instead of a
    // clock that just went back to zero stranding them.
    scoring.rebase(cleared)
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
        onSkip={routine.skipBlock}
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
      onPool={(pool) => userDispatch({ type: 'setPool', pool })}
      onSpelling={(value) => userDispatch({ type: 'setSpelling', value })}
      saved={savedPresets}
      onSaved={setSavedPresets}
      savedPersisted={savedPresetsPersisted}
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

  // Taken from the hook rather than from the store: it banks the pending
  // seconds first, so the file is never short of the session that is running as
  // it is written, and it hands back the log it is holding — which is the whole
  // of it when the store is refusing writes, exactly when a backup is worth
  // most.
  const getPracticeBackup = () => serializeBackup(practiceHistory.snapshot(), new Date())

  // A restore merges into what is stored and then reloads: the hook reads
  // storage once, on mount, so anything short of a reload would be overwritten
  // by its next commit. (A tick landing between the two would cost the seconds
  // in flight — the same seconds a refresh mid-session costs anyway.)
  //
  // Only once the merged log is really in the store, though. Reloading on a
  // write that was dropped would come back to the log the restore was meant to
  // repair, with the restored days gone and the reload reading as a success —
  // so a refused write is reported back instead, and nothing is thrown away.
  const importPracticeBackup = (incoming: PracticeHistory): boolean => {
    practiceHistory.commit()
    const stored = writeHistory(mergeHistories(readHistory(), incoming))
    if (!stored) {
      return false
    }

    reload()

    return true
  }

  const practiceLogCard = (
    <PracticeLogCard
      history={practiceHistory.history}
      persisted={practiceHistory.persisted}
      onClear={clearTimer}
      getBackup={getPracticeBackup}
      onImportBackup={importPracticeBackup}
      hasPendingPractice={practiceHistory.hasPending}
    />
  )

  // Whoever is top of the board, and how far off them this browser is — the
  // line under the pause summary, and null wherever there is nothing true to
  // say. Off a challenge there is no board at all; without a nickname there is
  // no row of yours on it, and "your score just went up" would be a promise to
  // a browser the server is not taking play from.
  const leader = challenge.active && challenge.nickname !== null ? (challenge.scores[0] ?? null) : null
  const boardStanding: BoardStanding | null =
    leader === null
      ? null
      : leader.nickname === challenge.nickname
        ? { leading: true }
        : {
            leading: false,
            leader: leader.nickname,
            gap:
              leader.points - (challenge.scores.find((entry) => entry.nickname === challenge.nickname)?.points ?? 0),
          }

  // A diagnostic, not a feature: ?micdebug puts the capture's own report on
  // screen, because the iOS microphone pipeline has repeatedly behaved in ways
  // only a real handset can reveal — this is how that handset reports back.
  const micDebug =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('micdebug') ? (
      <MicDebugPanel status={mic.status} getDebugInfo={mic.getDebugInfo} />
    ) : null

  // Only when asked for: with the setting off the tree is exactly what it was
  // before the microphone existed.
  const micReadout = micEnabled ? (
    <MicReadout
      status={mic.status}
      heard={mic.heard}
      spelling={settings.spelling}
      called={playback.snapshot.currentNote}
      isPlaying={playback.isPlaying}
      isPaused={playback.isPaused}
      score={{
        lastVerdict: scoring.lastVerdict,
        hits: scoring.tally.hits,
        scored: scoring.tally.scored,
        points: scoring.tally.points,
        bestStreak: scoring.tally.bestStreak,
        bonuses: scoring.lastBonuses,
        multiplier: scoring.multiplier,
      }}
      board={boardStanding}
    />
  ) : null

  // Both of these are null off a challenge, which is the whole of "without
  // ?challenge= in the URL this feature does not exist".
  const nicknamePrompt =
    challenge.needsNickname && challenge.name !== null ? (
      <ChunkErrorBoundary>
        <Suspense fallback={null}>
          <NicknamePrompt
            challenge={challenge.name}
            prefill={challenge.prefill}
            pending={challenge.joining}
            error={challenge.joinError}
            onJoin={challenge.join}
            onDismiss={challenge.dismissPrompt}
            onReady={onNicknamePromptReady}
          />
        </Suspense>
      </ChunkErrorBoundary>
    ) : null

  const scoreboard =
    challenge.active && challenge.name !== null ? (
      <ChunkErrorBoundary>
        <Suspense fallback={null}>
          <ScoreboardStrip
            challenge={challenge.name}
            nickname={challenge.nickname}
            scores={challenge.scores}
            status={challenge.status}
            notice={challenge.notice}
            layout={boardLayout}
          />
        </Suspense>
      </ChunkErrorBoundary>
    ) : null

  // The two mounting points the two readings need: a column beside the stage,
  // or a line directly above the play control. Never both, and both null off a
  // challenge — which is the whole of "without ?challenge= this does not exist".
  const scoreboardRail = boardLayout === 'rail' ? scoreboard : null
  const scoreboardFold = boardLayout === 'rail' ? null : scoreboard

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

          {micReadout}

          {scoreboardFold}

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
            bpm={settings.bpm}
            onNudgeBpm={(delta) => userDispatch({ type: 'nudgeBpm', delta })}
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

        {nicknamePrompt}

        {updateChip}
      </div>
    )
  }

  /*
   * The playing stack, in the order it is read: note and neck, then what the
   * microphone heard, then the routine, then the board's own line, then the
   * transport. The fold sits directly above the play control on purpose — it
   * is the last thing a thumb passes on the way to starting a run.
   */
  const practiceStack = (
    <>
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

      {micReadout}

      {routineStrip}

      {scoreboardFold}

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
    </>
  )

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
        {installPrompt.showAndroidHint ? <AndroidInstallHint onDismiss={installPrompt.dismissAndroidHint} /> : null}
        {micDebug}

        {/* The practice stage: everything you look at with the guitar in your
            hands, in one full-width card. The neck sits beside the note rather
            than in a column of its own — it is the answer to the question the
            note asks, and the pairing is lost across a few hundred pixels. */}
        <section className="panel practice-stage">
          {/* A column of its own for the stack only when a board is taking the
              one beside it. Off a challenge the stage is exactly the block
              stack it has always been — the wrapper is what the rail needs to
              be a grid column against, and nothing else asks for it. */}
          {scoreboardRail === null ? (
            practiceStack
          ) : (
            <>
              <div className="practice-stage-main">{practiceStack}</div>

              {scoreboardRail}
            </>
          )}
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

      {nicknamePrompt}

      {updateChip}
    </div>
  )
}

export default App
