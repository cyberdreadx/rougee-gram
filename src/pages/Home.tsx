import { useState } from "react";
import { Link } from "react-router-dom";
import { Compass, Camera } from "lucide-react";
import { useFollowingFeed, useGlobalTimeline } from "@/hooks/useSocial";
import { useCreatePost } from "@/components/CreatePost";
import FeedList from "@/components/FeedList";
import StoriesTray from "@/components/StoriesTray";
import { cn } from "@/lib/utils";

type Tab = "following" | "discover";

export default function Home() {
  const [tab, setTab] = useState<Tab>("following");
  const following = useFollowingFeed();
  const discover = useGlobalTimeline();
  const { open } = useCreatePost();

  const active = tab === "following" ? following : discover;

  return (
    <div>
      <StoriesTray />

      {/* Segmented tabs */}
      <div className="sticky top-[var(--top-bar-h)] z-20 flex border-b border-ink-border bg-ink/80 backdrop-blur md:top-0">
        <TabButton active={tab === "following"} onClick={() => setTab("following")}>
          Following
        </TabButton>
        <TabButton active={tab === "discover"} onClick={() => setTab("discover")}>
          Discover
        </TabButton>
      </div>

      <FeedList
        posts={active.data}
        isLoading={active.isLoading}
        isError={active.isError}
        emptyState={
          tab === "following" ? (
            <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rouge-600/15 text-rouge-400">
                <Compass className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Your feed is quiet</h3>
                <p className="mx-auto mt-1 max-w-xs text-sm text-ink-muted">
                  Follow some people to fill this up — or head to Discover to see
                  what's happening across RougeChain.
                </p>
              </div>
              <div className="flex gap-2">
                <button className="btn-soft" onClick={() => setTab("discover")}>
                  Browse Discover
                </button>
                <Link to="/explore" className="btn-primary">
                  Explore
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rouge-600/15 text-rouge-400">
                <Camera className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">No photos yet</h3>
                <p className="mx-auto mt-1 max-w-xs text-sm text-ink-muted">
                  Be the first to post on Rougee-gram. Your photo will live
                  on-chain, signed by you.
                </p>
              </div>
              <button className="btn-primary" onClick={() => open()}>
                Share the first photo
              </button>
            </div>
          )
        }
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex-1 py-3.5 text-sm font-semibold transition-colors",
        active ? "text-white" : "text-ink-muted hover:text-white",
      )}
    >
      {children}
      {active && (
        <span className="absolute inset-x-0 bottom-0 mx-auto h-0.5 w-16 rounded-full bg-rouge-500" />
      )}
    </button>
  );
}
