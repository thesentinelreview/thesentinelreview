// Inline owl mark — angular "great horned" sentinel owl for the watchfloor.
// Heart-shaped facial disc with splayed ear tufts, fierce slanted eyes, a kite
// beak, a tall folded-wing body, and talons gripping a forked perch. Authored
// on a 64-unit grid for precision; renders at `size` px. Colour via currentColor.
export default function SentinelMark({
  className = "",
  size = 24,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* facial disc + ear tufts */}
      <path d="M32 12 L17 3 Q15 14 16 22 Q18 30 32 33 Q46 30 48 22 Q49 14 47 3 Z" strokeWidth={3.2} />
      {/* eyes */}
      <path d="M29 20.5 Q25.5 16 21 18 Q24.5 20 29 20.5 Z" strokeWidth={2.4} />
      <path d="M35 20.5 Q38.5 16 43 18 Q39.5 20 35 20.5 Z" strokeWidth={2.4} />
      <circle cx="24.7" cy="18.7" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="39.3" cy="18.7" r="1.6" fill="currentColor" stroke="none" />
      {/* beak */}
      <path d="M32 21.5 L30.2 23.5 L32 27 L33.8 23.5 Z" fill="currentColor" stroke="none" />
      {/* body sides */}
      <path d="M19 27 L20 47 Q21 51 27 53" />
      <path d="M45 27 L44 47 Q43 51 37 53" />
      {/* folded wings */}
      <path d="M24 31 L25 48" />
      <path d="M40 31 L39 48" />
      {/* talons */}
      <g strokeWidth={2.4}>
        <path d="M27 53 L25 56.3" />
        <path d="M27 53 L27 56.8" />
        <path d="M27 53 L29 56.3" />
        <path d="M37 53 L35 56.3" />
        <path d="M37 53 L37 56.8" />
        <path d="M37 53 L39 56.3" />
      </g>
      {/* perch + forked ends */}
      <path d="M13 55 L51 55" />
      <path d="M13 55 L10 53.6" />
      <path d="M13 55 L10 56.6" />
      <path d="M51 55 L54 53.6" />
      <path d="M51 55 L54 56.6" />
    </svg>
  );
}
