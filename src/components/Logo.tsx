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
      <img
        src="/logo.png"
        alt="RouGee"
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="rounded-[23%] object-cover"
        draggable={false}
      />
      {withWordmark && (
        <span className="text-xl font-bold tracking-tight">
          Rou<span className="brand-text">Gee</span>
        </span>
      )}
    </div>
  );
}
