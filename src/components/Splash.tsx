import { Loader2 } from "lucide-react";
import Logo from "./Logo";

export default function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-ink">
      <Logo size={56} />
      <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
    </div>
  );
}
