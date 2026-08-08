import { useRef, type KeyboardEvent } from 'react'

type SegmentedControlProps<T extends string | number> = {
  ariaLabel: string
  options: ReadonlyArray<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
  testId?: string
  /** Extra class for style variants, e.g. 'loose' for separated pill buttons. */
  className?: string
}

/**
 * Where a key sends the selection, or null when the key is none of ours and
 * belongs to whoever is listening further up. The arrows wrap around.
 */
function targetIndex(key: string, from: number, count: number) {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (from + 1) % count
    case 'ArrowLeft':
    case 'ArrowUp':
      return (from - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}

export function SegmentedControl<T extends string | number>({
  ariaLabel,
  options,
  value,
  onChange,
  testId,
  className,
}: SegmentedControlProps<T>) {
  const groupRef = useRef<HTMLDivElement>(null)
  // A radio group is one tab stop: only the checked option is reachable with
  // Tab, and the arrows move from there. With nothing checked the first
  // option holds the stop, so the group never drops out of the tab order.
  const checkedIndex = options.findIndex((option) => option.value === value)
  const tabStopIndex = checkedIndex === -1 ? 0 : checkedIndex

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, from: number) => {
    const next = targetIndex(event.key, from, options.length)
    if (next === null) {
      return
    }

    event.preventDefault()
    groupRef.current?.querySelectorAll('button')[next]?.focus()
    if (options[next].value !== value) {
      onChange(options[next].value)
    }
  }

  return (
    <div
      ref={groupRef}
      className={`segmented ${className ?? ''}`}
      role="radiogroup"
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {options.map((option, index) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={index === tabStopIndex ? 0 : -1}
          data-value={option.value}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
