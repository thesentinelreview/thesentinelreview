// Inline owl mark — full-body owl perched on a horizontal line.
// Geometry reconstructed from the design spec (ear tufts, head, body ellipse,
// eye discs with pupils, triangle beak, two feet on a perch line).
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
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* ear tufts */}
      <path d="M7.7 4.6 L8.9 7.1 L6.4 6.7 Z" />
      <path d="M16.3 4.6 L15.1 7.1 L17.6 6.7 Z" />
      {/* head */}
      <circle cx="12" cy="8" r="4.6" />
      {/* body */}
      <ellipse cx="12" cy="14.6" rx="5.2" ry="5.6" />
      {/* eye discs + pupils */}
      <circle cx="10" cy="8" r="1.5" />
      <circle cx="14" cy="8" r="1.5" />
      <circle cx="10" cy="8" r="0.55" fill="currentColor" stroke="none" />
      <circle cx="14" cy="8" r="0.55" fill="currentColor" stroke="none" />
      {/* beak */}
      <path d="M12 9.5 L11 10.7 L13 10.7 Z" fill="currentColor" stroke="none" />
      {/* feet + perch */}
      <path d="M10.4 19.9 L10.4 22.0" />
      <path d="M13.6 19.9 L13.6 22.0" />
      <path d="M6.4 22.6 H17.6" />
    </svg>
  );
}
