type SegmentedControlProps<T extends string | number> = {
  ariaLabel: string
  options: ReadonlyArray<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
  testId?: string
}

export function SegmentedControl<T extends string | number>({
  ariaLabel,
  options,
  value,
  onChange,
  testId,
}: SegmentedControlProps<T>) {
  return (
    <div className="segmented" role="radiogroup" aria-label={ariaLabel} data-testid={testId}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          data-value={option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
