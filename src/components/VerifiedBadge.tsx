/**
 * The RouGee verified "check" — a scalloped seal filled with the logo gradient
 * (pink → purple → blue) and a white tick. Shown next to a verified account's
 * name. Purely presentational; gate rendering on `useVerified`.
 */
export default function VerifiedBadge({
  size = 16,
  className = "",
  title = "Verified",
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  // Unique gradient id per size so multiple badges on a page don't collide.
  const gid = `rougee-verified-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ec4899" />
          <stop offset="50%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      {/* Scalloped seal */}
      <path
        fill={`url(#${gid})`}
        d="M12 1.5l2.09 1.64 2.63-.32 1.02 2.45 2.45 1.02-.32 2.63L23.5 12l-1.64 2.09.32 2.63-2.45 1.02-1.02 2.45-2.63-.32L12 22.5l-2.09-1.64-2.63.32-1.02-2.45-2.45-1.02.32-2.63L.5 12l1.64-2.09-.32-2.63 2.45-1.02 1.02-2.45 2.63.32L12 1.5z"
      />
      {/* Check */}
      <path
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 12.2l2.6 2.6L16 9.2"
      />
    </svg>
  );
}
