import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Compass, Camera, ArrowUp } from "lucide-react";
import { useFollowingFeed } from "@/hooks/useSocial";
import { useDiscoverFeed } from "@/hooks/useNostrFeed";
import { DISCOVER_TOPICS } from "@/lib/nostrFeed";
import { useCreatePost } from "@/components/CreatePost";
import FeedList from "@/components/FeedList";
import StoriesTray from "@/components/StoriesTray";
import { cn } from "@/lib/utils";

type Tab = "following" | "discover";

const HOME_TAB_KEY = "rougee:home-tab";
function initialHomeTab(): Tab {
  try {
    const v = localStorage.getItem(HOME_TAB_KEY);
    if (v === "following" || v === "discover") return v;
  } catch {
    /* localStorage unavailable */
  }
  return "discover"; // Discover leads — it's where the activity is
}

export default function Home() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>(initialHomeTab);
  const [topic, setTopic] = useState<string | null>(null);

  // Remember the chosen tab so each person lands on what they prefer.
  const selectTab = (next: Tab) => {
    setTab(next);
    try {
      localStorage.setItem(HOME_TAB_KEY, next);
    } catch {
      /* ignore */
    }
  };
  const following = useFollowingFeed();
  const discover = useDiscoverFeed(topic);
  const { open } = useCreatePost();

  const active = tab === "following" ? following : discover;

  return (
    <div>
      <StoriesTray />

      {/* Segmented tabs */}
      <div className="sticky top-[var(--top-bar-h)] z-20 flex border-b border-ink-border bg-ink/55 backdrop-blur md:top-0">
        <TabButton active={tab === "discover"} onClick={() => selectTab("discover")}>
          {t("home.discover")}
        </TabButton>
        <TabButton active={tab === "following"} onClick={() => selectTab("following")}>
          {t("common.following")}
        </TabButton>
      </div>

      {tab === "discover" && (
        <div
          className="flex gap-2 overflow-x-auto border-b border-ink-border px-3 py-2"
          style={{ scrollbarWidth: "none" }}
        >
          {DISCOVER_TOPICS.map((tp) => (
            <TopicChip key={tp.label} active={topic === tp.id} onClick={() => setTopic(tp.id)}>
              {tp.label}
            </TopicChip>
          ))}
          {discover.trending
            .filter((tag) => !DISCOVER_TOPICS.some((d) => d.id === tag))
            .map((tag) => (
              <TopicChip key={`tr-${tag}`} active={topic === tag} onClick={() => setTopic(tag)}>
                #{tag}
              </TopicChip>
            ))}
        </div>
      )}

      {tab === "discover" && discover.newCount > 0 && (
        <button
          onClick={() => {
            discover.showNew();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className="fixed left-1/2 top-24 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-rouge-600 px-4 py-1.5 text-xs font-semibold text-white shadow-lg shadow-rouge-600/30 transition hover:bg-rouge-500"
        >
          <ArrowUp className="h-3.5 w-3.5" />
          {discover.newCount} new {discover.newCount === 1 ? "post" : "posts"}
        </button>
      )}

      <FeedList
        posts={active.data}
        isLoading={active.isLoading}
        isError={active.isError}
        showSponsored
        emptyState={
          tab === "following" ? (
            <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rouge-600/15 text-rouge-400">
                <Compass className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">{t("home.feedQuiet")}</h3>
                <p className="mx-auto mt-1 max-w-xs text-sm text-ink-muted">
                  {t("home.feedQuietHint")}
                </p>
              </div>
              <div className="flex gap-2">
                <button className="btn-soft" onClick={() => selectTab("discover")}>
                  {t("home.browseDiscover")}
                </button>
                <Link to="/explore" className="btn-primary">
                  {t("nav.explore")}
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rouge-600/15 text-rouge-400">
                <Camera className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">{t("home.noPhotos")}</h3>
                <p className="mx-auto mt-1 max-w-xs text-sm text-ink-muted">
                  {t("home.noPhotosHint")}
                </p>
              </div>
              <button className="btn-primary" onClick={() => open()}>
                {t("home.shareFirst")}
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

function TopicChip({
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
        "shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-rouge-500 bg-rouge-600/15 text-rouge-300"
          : "border-ink-border text-ink-muted hover:text-white",
      )}
    >
      {children}
    </button>
  );
}
