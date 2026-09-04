import type { SVGProps } from 'react'
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons'

type IconProps = { icon: IconDefinition } & SVGProps<SVGSVGElement>

/** Renders a Font Awesome icon definition as an inline SVG, without the FA runtime. */
export function Icon({ icon, className, ...rest }: IconProps) {
  const [width, height, , , paths] = icon.icon
  const pathData = Array.isArray(paths) ? paths : [paths]

  return (
    <svg
      data-prefix={icon.prefix}
      data-icon={icon.iconName}
      className={['svg-inline--fa', `fa-${icon.iconName}`, className].filter(Boolean).join(' ')}
      role="img"
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      {...rest}
    >
      {pathData.map((d, i) => (
        <path key={i} fill="currentColor" d={d} />
      ))}
    </svg>
  )
}
