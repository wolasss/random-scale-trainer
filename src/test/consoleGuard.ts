import { afterEach, beforeEach } from 'vitest'

/**
 * React reports act() violations, missing keys, invalid props and updates after
 * unmount through console.error. Printed to stderr they scroll past and the run
 * stays green, so this turns console noise into what it actually is: a failing
 * test. A test that means to provoke one asks for it with allowConsole().
 *
 * The calls are recorded and asserted in afterEach rather than thrown from
 * inside the wrapper: React calls console.error from within its own frames, so
 * a throw there is swallowed or resurfaces as an unrelated render error, while
 * an afterEach failure is attributed to the test that caused it.
 */

type ConsoleMethod = 'error' | 'warn'

/** The recorded calls, so an allowed test can still assert on them. */
export type ConsoleAllowance = { calls: unknown[][] }

const original = { error: console.error, warn: console.warn }

let unexpected: string[] = []
let allowed: { error?: ConsoleAllowance; warn?: ConsoleAllowance } = {}

/**
 * Lets the current test call console.error and/or console.warn without failing,
 * and hands back the calls it made. The allowance lasts for one test — the
 * beforeEach below clears it — and calling this twice for the same method in
 * one test returns the same handle. With no argument, both methods are allowed.
 */
export const allowConsole = (method?: ConsoleMethod): ConsoleAllowance => {
  const methods: ConsoleMethod[] = method ? [method] : ['error', 'warn']
  const handle = allowed[methods[0]] ?? { calls: [] }
  for (const name of methods) {
    allowed[name] = handle
  }
  return handle
}

const describeArg = (arg: unknown) => (arg instanceof Error ? (arg.stack ?? String(arg)) : String(arg))

const guard = (method: ConsoleMethod) =>
  function (...args: unknown[]) {
    const allowance = allowed[method]
    if (allowance) {
      // Swallowed, so an expected error does not muddy the run's stderr.
      allowance.calls.push(args)
      return
    }
    unexpected.push(`console.${method}: ${args.map(describeArg).join(' ')}`)
    // Still printed: the stack under it is usually what names the culprit.
    original[method](...args)
  }

beforeEach(() => {
  unexpected = []
  allowed = {}
  console.error = guard('error')
  console.warn = guard('warn')
})

afterEach(() => {
  // Restored before the throw, so one failure does not leave the wrappers on
  // for every test after it.
  console.error = original.error
  console.warn = original.warn

  if (unexpected.length === 0) return
  const { length } = unexpected
  const lines = unexpected.join('\n')
  unexpected = []
  throw new Error(
    `Unexpected console output (${length} call${length === 1 ? '' : 's'}):\n${lines}\n\n` +
      "If the test means to provoke it, opt in with allowConsole() from 'src/test/consoleGuard'.",
  )
})
