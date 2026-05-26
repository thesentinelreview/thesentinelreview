// Inline owl mark — compact tactical/HUD owl for the watchfloor headers.
// Sharp geometric outline tuned to read cleanly at 20–24px on the dark
// dashboard. Colour comes from the caller via `currentColor`.
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
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M4.5 5.25L8.05 8.15H15.95L19.5 5.25L17.95 9.05L15.55 10.55"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.5 5.25L15.95 8.15L12 12.05L8.05 8.15L4.5 5.25"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.35 10.1C7.2 10.65 6.35 11.95 6.35 13.55V17.6L8.25 20.25"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15.65 10.1C16.8 10.65 17.65 11.95 17.65 13.55V17.6L15.75 20.25"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.25 19.25H14.75"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
      />
      <path
        d="M10.35 12.35C9.5 12.35 8.8 11.65 8.8 10.8C8.8 9.95 9.5 9.25 10.35 9.25C11.2 9.25 11.9 9.95 11.9 10.8"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.65 12.35C14.5 12.35 15.2 11.65 15.2 10.8C15.2 9.95 14.5 9.25 13.65 9.25C12.8 9.25 12.1 9.95 12.1 10.8"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 12.15L10.9 14.25L12 15.55L13.1 14.25L12 12.15Z" fill="currentColor" />
      <path
        d="M10.35 16.3L12 17.65L13.65 16.3"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.3 21.2H16.7"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
      />
    </svg>
  );
}
