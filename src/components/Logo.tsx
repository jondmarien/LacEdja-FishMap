interface LogoProps {
  size?: number
  className?: string
  /** Slightly rounded badge corner radius, in viewBox units. */
  radius?: number
}

/**
 * The Lac Edja brand mark: a leaping fish over lake waves in a deep-water
 * badge. Mirrors public/favicon.svg so the in-app logo and the favicon match.
 */
export default function Logo({ size = 40, className, radius = 120 }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      role="img"
      aria-label="Lac Edja"
      className={className}
    >
      <defs>
        <linearGradient id="edja-water" x1="0" y1="0" x2="0" y2="512" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0e6d91" />
          <stop offset="0.55" stopColor="#0c4a6e" />
          <stop offset="1" stopColor="#083344" />
        </linearGradient>
      </defs>

      <rect width="512" height="512" rx={radius} fill="url(#edja-water)" />

      <g transform="rotate(-18 256 240)">
        <path d="M250 212 L268 176 L300 216 Z" fill="#a5f0fc" opacity="0.9" />
        <path d="M268 266 L250 304 L300 276 Z" fill="#a5f0fc" opacity="0.9" />
        <path d="M180 248 L128 210 L154 248 L128 290 Z" fill="#67e3f9" />
        <path d="M360 248 C320 206 232 202 178 248 C232 296 320 292 360 248 Z" fill="#ecfeff" />
        <path
          d="M300 216 C288 234 288 264 300 280"
          stroke="#67e3f9"
          strokeWidth="9"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="332" cy="240" r="11" fill="#0c4a6e" />
      </g>

      <g stroke="#a5f0fc" strokeWidth="14" strokeLinecap="round" fill="none" opacity="0.85">
        <path d="M96 372 C140 350 180 350 224 372 C268 394 308 394 352 372 C384 356 408 354 432 364" />
        <path d="M120 418 C160 400 196 400 236 418 C276 436 312 436 352 418" opacity="0.6" />
      </g>
    </svg>
  )
}
