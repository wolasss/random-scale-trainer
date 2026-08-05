type SwitchRowProps = {
  id: string
  label: string
  subtitle: string
  checked: boolean
  onChange: () => void
  disabled?: boolean
}

/** A labelled switch (real knob-in-track control, not an On/Off pill). */
export function SwitchRow({ id, label, subtitle, checked, onChange, disabled = false }: SwitchRowProps) {
  return (
    <div className="switch-row">
      <div className="switch-row-text">
        <label htmlFor={id}>{label}</label>
        <p className="switch-subtitle">{subtitle}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        className="switch"
        disabled={disabled}
        onClick={onChange}
      >
        <span className="switch-knob" aria-hidden="true" />
      </button>
    </div>
  )
}
