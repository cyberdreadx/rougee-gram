import { Bookmark } from "lucide-react";
import { useIsSaved, useToggleSave } from "@/hooks/useSaved";
import { useToast } from "./Toast";
import { cn } from "@/lib/utils";

/**
 * Instagram-style bookmark toggle. Saves the post to the current account's
 * private, local Saved collection (see useSaved).
 */
export default function SaveButton({
  postId,
  className,
  iconClassName = "h-6 w-6",
}: {
  postId: string;
  className?: string;
  iconClassName?: string;
}) {
  const saved = useIsSaved(postId);
  const toggle = useToggleSave();
  const { toast } = useToast();

  return (
    <button
      onClick={() => {
        const nowSaved = toggle(postId);
        toast(nowSaved ? "Saved" : "Removed from saved", "success");
      }}
      className={cn(
        "text-white transition-transform hover:text-ink-muted active:scale-90",
        className,
      )}
      aria-label={saved ? "Remove from saved" : "Save"}
      aria-pressed={saved}
    >
      <Bookmark className={cn(iconClassName, saved && "fill-white text-white")} />
    </button>
  );
}
