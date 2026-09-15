import { cn } from "@/lib/utils";

export default function Logo({
  size = 32,
  withWordmark = false,
  className,
}: {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff647c" />
            <stop offset="0.5" stopColor="#ff2d55" />
            <stop offset="1" stopColor="#8a0e34" />
          </linearGradient>
        </defs>
        <rect x="4" y="4" width="56" height="56" rx="16" fill="url(#lg)" />
        <circle cx="32" cy="32" r="13" fill="none" stroke="#fff" strokeWidth="4" />
        <circle cx="47" cy="17" r="3.4" fill="#fff" />
      </svg>
      {withWordmark && (
        <span className="text-xl font-bold tracking-tight">
          Rou<span className="brand-text">Gee</span>
        </span>
      )}
    </div>
  );
}
