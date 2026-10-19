import { useId } from "react"

// Render the supplied rounded wordmark in the current theme colour. The filter
// removes the navy backing at render time while preserving the original asset.
export default function Brand({ compact = false }) {
  const id = useId().replace(/:/g, "")
  const filter = `logo-ink-${id}`
  const width = compact ? 285 : 1068
  return (
    <span
      className={`chef-brand asset-brand ${compact ? "compact" : ""}`}
      aria-label="Chefos"
    >
      <svg viewBox={`94 408 ${width} 400`} role="img" aria-label="Chefos logo">
        <defs>
          <filter
            id={filter}
            colorInterpolationFilters="sRGB"
            x="0"
            y="0"
            width="100%"
            height="100%"
          >
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  3 0 0 0 -0.55"
              result="logoAlpha"
            />
            <feFlood floodColor="currentColor" />
            <feComposite in2="logoAlpha" operator="in" />
          </filter>
          <clipPath id={`c-${id}`}>
            <rect x="94" y="570" width="276" height="238" />
          </clipPath>
          <clipPath id={`hat-${id}`}>
            <rect x="94" y="408" width="285" height="162" />
          </clipPath>
          <clipPath id={`word-${id}`}>
            <rect x="370" y="408" width="792" height="400" />
          </clipPath>
        </defs>
        <g filter={`url(#${filter})`}>
          <g className="logo-c-piece" clipPath={`url(#c-${id})`}>
            <image href="/brand/chefos-logo.png" width="1254" height="1254" />
          </g>
          <g className="logo-hat-piece" clipPath={`url(#hat-${id})`}>
            <image href="/brand/chefos-logo.png" width="1254" height="1254" />
          </g>
          {!compact && (
            <g className="logo-word-piece" clipPath={`url(#word-${id})`}>
              <image href="/brand/chefos-logo.png" width="1254" height="1254" />
            </g>
          )}
        </g>
      </svg>
    </span>
  )
}
