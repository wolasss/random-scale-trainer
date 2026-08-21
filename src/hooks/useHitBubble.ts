import { useCallback, useEffect, useRef } from 'react'

/**
 * Authored to the `hit-bubble` animation in index.css: the node is taken out
 * the moment its float is over, and never before.
 */
const BUBBLE_MS = 900
/**
 * A ceiling on what can be in the air at once. Timers in a backgrounded tab are
 * throttled rather than stopped, so without this the layer could keep growing
 * for as long as the tab is away from the eye that would see it.
 */
const MAX_BUBBLES = 6
/**
 * Sideways offsets, walked in order, so a run of quick hits floats up a fan of
 * lines instead of stacking one on top of another. A counter rather than
 * randomness: the suites mock Math.random, and a decoration is no reason to
 * take that away from them.
 */
const DRIFTS = [0, 14, -18, 8, -24, 4]

/**
 * The "+1" that floats off a correct note. Like useBeatPulse this mutates the
 * DOM directly rather than going through state: it is driven from the mic poll,
 * whose handlers are ref-only, and a re-render of the whole app per note played
 * would be a steep price for a decoration.
 *
 * Unlike the beat ring one element cannot be reused, since notes land close
 * enough together that two bubbles have to overlap, so every hit appends a node
 * of its own that takes itself back out on a timer. The timer is the only way a
 * node ever leaves: jsdom never fires `animationend`, and a node that somehow
 * never animates would be left behind for the rest of the session.
 */
export function useHitBubble() {
  const layerRef = useRef<HTMLDivElement | null>(null)
  /** Live nodes against the timeout that will remove them. Insertion-ordered,
   *  so the first key is always the oldest bubble in the air. */
  const liveRef = useRef(new Map<HTMLElement, number>())
  const countRef = useRef(0)

  // The single exit: the timeout, the overflow eviction and the unmount
  // teardown all come through here, so no node can lose its element without
  // losing its timer with it. Idempotent, so a double call is harmless.
  const remove = useCallback((node: HTMLElement) => {
    const timer = liveRef.current.get(node)
    if (timer === undefined) {
      return
    }

    window.clearTimeout(timer)
    liveRef.current.delete(node)
    node.remove()
  }, [])

  const spawn = useCallback(() => {
    const layer = layerRef.current
    if (!layer) {
      return
    }

    const node = document.createElement('span')
    node.className = 'hit-bubble'
    node.textContent = '+1'
    node.dataset.testid = 'hit-bubble'
    node.style.setProperty('--hit-bubble-drift', `${DRIFTS[countRef.current % DRIFTS.length]}px`)
    countRef.current += 1

    layer.append(node)
    liveRef.current.set(
      node,
      window.setTimeout(() => remove(node), BUBBLE_MS),
    )

    while (liveRef.current.size > MAX_BUBBLES) {
      const oldest = liveRef.current.keys().next().value
      if (oldest === undefined) {
        break
      }
      remove(oldest)
    }
  }, [remove])

  // Nothing outlives the view it floated over: neither a node nor a timer.
  useEffect(
    () => () => {
      for (const node of [...liveRef.current.keys()]) {
        remove(node)
      }
    },
    [remove],
  )

  return { layerRef, spawn }
}
