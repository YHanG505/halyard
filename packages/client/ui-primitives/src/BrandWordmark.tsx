import type { IconProps } from './icons/props.ts'
import { FISH_LOGO_PATH } from './FishLogo.tsx'

/** Display options for the brand wordmark. */
export interface BrandWordmarkProps extends IconProps {
  /** Whether to include the leading whale mark; defaults to true. */
  includeMark?: boolean | undefined
}

/** Native width of the leading whale mark in viewBox units. */
const MARK_WIDTH = 24
/** Gap between the whale mark and the name in viewBox units. */
const NAME_GAP = 6
/** Native width of the name span in viewBox units. */
const NAME_WIDTH = 150

/**
 * Render the brand wordmark: the whale mark plus the Halyard name.
 * @param props.size - height in px (default 24; width follows the selected artwork).
 * @param props.className - extra class for layout placement.
 * @param props.includeMark - whether to include the leading whale mark.
 * @returns the wordmark svg (aria-hidden decorative brand art).
 */
export function BrandWordmark({ size = 24, className, includeMark = true }: BrandWordmarkProps) {
  const offset = includeMark ? MARK_WIDTH + NAME_GAP : 0
  const width = offset + NAME_WIDTH
  return (
    <svg
      width={(size * width) / 24}
      height={size}
      className={className}
      viewBox={`0 0 ${width} 24`}
      fill="none"
      aria-hidden="true"
    >
      {includeMark && (
        <g transform="translate(0 3.17) scale(1.036)">
          <path d={FISH_LOGO_PATH} fill="currentColor" />
        </g>
      )}
      <text
        x={offset}
        y="18.6"
        style={{ fontFamily: 'var(--dsw-font-family)' }}
        fontSize="19"
        fontWeight="600"
        letterSpacing="-0.3"
        textLength={NAME_WIDTH - 2}
        lengthAdjust="spacingAndGlyphs"
        fill="currentColor"
      >
        DeepSeek Halyard
      </text>
    </svg>
  )
}
