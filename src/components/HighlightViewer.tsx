import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import StoryViewer from "./StoryViewer";
import { useHighlightStories } from "@/hooks/useHighlights";
import { type StoryGroup } from "@/hooks/useStories";
import type { Highlight } from "@/lib/highlights";

/**
 * Plays a highlight by resolving its story ids to story posts and feeding them to
 * StoryViewer as a single synthetic group. StoryViewer doesn't re-check the 24h
 * TTL (that lives in useStoryGroups), so highlighted stories play regardless of age.
 */
export default function HighlightViewer({
  ownerPubkey,
  highlight,
  onClose,
}: {
  ownerPubkey: string;
  highlight: Highlight;
  onClose: () => void;
}) {
  const stories = useHighlightStories(highlight.items);
  const posts = stories.data ?? [];

  useEffect(() => {
    if (!stories.isLoading && posts.length === 0) onClose();
  }, [stories.isLoading, posts.length, onClose]);

  if (stories.isLoading) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black">
        <Loader2 className="h-6 w-6 animate-spin text-white" />
      </div>
    );
  }
  if (posts.length === 0) return null;

  const group: StoryGroup = { pubkey: ownerPubkey, stories: posts, latest: 0 };
  return <StoryViewer groups={[group]} startGroupIndex={0} onClose={onClose} />;
}
