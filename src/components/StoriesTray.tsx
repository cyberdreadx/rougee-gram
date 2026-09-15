import { useState } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "@/store/auth";
import { useMyProfile, useProfile } from "@/hooks/useProfile";
import {
  useStoryGroups,
  getSeenStories,
  groupHasUnseen,
  type StoryGroup,
} from "@/hooks/useStories";
import { useCreatePost } from "./CreatePost";
import { displayName } from "@/lib/profile";
import Avatar from "./Avatar";
import StoryViewer from "./StoryViewer";
import { cn } from "@/lib/utils";

export default function StoriesTray() {
  const { publicKey, address } = useAuth();
  const myProfile = useMyProfile();
  const { open } = useCreatePost();
  const { groups, isLoading } = useStoryGroups();
  const [viewerAt, setViewerAt] = useState<number | null>(null);

  const seen = getSeenStories();
  const selfIndex = groups.findIndex((g) => g.pubkey === publicKey);
  const selfGroup = selfIndex >= 0 ? groups[selfIndex] : null;
  const others = groups.filter((g) => g.pubkey !== publicKey);

  return (
    <div className="flex gap-4 overflow-x-auto border-b border-ink-border px-4 py-3 hide-scrollbar">
      {/* Your story */}
      <button
        onClick={() => (selfGroup ? setViewerAt(selfIndex) : open("story"))}
        className="flex w-16 shrink-0 flex-col items-center gap-1"
      >
        <span
          className={cn(
            "relative rounded-full p-[2.5px]",
            selfGroup && groupHasUnseen(selfGroup, seen) ? "brand-gradient" : "bg-ink-border",
          )}
        >
          <span className="block rounded-full border-2 border-ink">
            <Avatar refUri={myProfile?.avatarRef} seed={address} name={myProfile?.name} size={56} />
          </span>
          <span
            onClick={(e) => {
              e.stopPropagation();
              open("story");
            }}
            className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-rouge-600 text-ink ring-2 ring-ink"
          >
            <Plus className="h-3 w-3" />
          </span>
        </span>
        <span className="w-16 truncate text-center text-xs text-ink-muted">Your story</span>
      </button>

      {isLoading && others.length === 0
        ? Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex w-16 shrink-0 flex-col items-center gap-1">
              <div className="skeleton h-[61px] w-[61px] rounded-full" />
              <div className="skeleton h-2.5 w-12 rounded" />
            </div>
          ))
        : others.map((g) => (
            <StoryRing
              key={g.pubkey}
              group={g}
              unseen={groupHasUnseen(g, seen)}
              onClick={() => setViewerAt(groups.indexOf(g))}
            />
          ))}

      {viewerAt !== null && (
        <StoryViewer
          groups={groups}
          startGroupIndex={viewerAt}
          onClose={() => setViewerAt(null)}
        />
      )}
    </div>
  );
}

function StoryRing({
  group,
  unseen,
  onClick,
}: {
  group: StoryGroup;
  unseen: boolean;
  onClick: () => void;
}) {
  const { data: profile } = useProfile(group.pubkey);
  return (
    <button
      onClick={onClick}
      aria-label="View story"
      className="flex w-16 shrink-0 flex-col items-center gap-1"
    >
      <span className={cn("rounded-full p-[2.5px]", unseen ? "brand-gradient" : "bg-ink-border")}>
        <span className="block rounded-full border-2 border-ink">
          <Avatar refUri={profile?.avatarRef} seed={group.pubkey} name={profile?.name} size={56} />
        </span>
      </span>
      <span className="w-16 truncate text-center text-xs text-ink-muted">
        {profile ? displayName(profile) : "…"}
      </span>
    </button>
  );
}
