import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Volume2, VolumeX, Send, Eye, Loader2 } from "lucide-react";
import { decodeBody, type StoryEnvelope } from "@/lib/envelope";
import { markStoriesSeen, type StoryGroup } from "@/hooks/useStories";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/store/auth";
import { useDmCapable, useSendStoryReply } from "@/hooks/useMessenger";
import { DMS_ENABLED } from "@/lib/features";
import { useToast } from "./Toast";
import { displayName } from "@/lib/profile";
import { timeAgo, formatCount } from "@/lib/format";
import { shortAddress } from "@/lib/format";
import {
  recordStoryView,
  reactToStory,
  getStoryEngagement,
  storyEngageEnabled,
} from "@/lib/storyEngage";
import { VerifiedName } from "./UserLink";
import Avatar from "./Avatar";
import MediaImage from "./MediaImage";
import MediaVideo from "./MediaVideo";

const IMAGE_MS = 5000;
const REACTIONS = ["❤️", "🔥", "😂", "😮", "😢", "👏"];

export default function StoryViewer({
  groups,
  startGroupIndex,
  onClose,
}: {
  groups: StoryGroup[];
  startGroupIndex: number;
  onClose: () => void;
}) {
  const [gi, setGi] = useState(startGroupIndex);
  const [si, setSi] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [reactions, setReactions] = useState<Record<string, string>>({});
  const [reply, setReply] = useState("");
  const [seenOpen, setSeenOpen] = useState(false);

  const { publicKey } = useAuth();
  const dmCapable = useDmCapable();
  const sendReply = useSendStoryReply();
  const { toast } = useToast();

  const group = groups[gi];
  const story = group?.stories[si];
  const decoded = story ? decodeBody(story.body) : null;
  const data = decoded?.kind === "story" ? (decoded.data as StoryEnvelope) : null;
  const isVideo = (data?.mime || "").startsWith("video/");
  const isMine = !!group && group.pubkey === publicKey;
  const myReaction = story ? reactions[story.id] : undefined;

  const { data: profile } = useProfile(group?.pubkey);

  // Record a view (others' stories only) whenever the visible segment changes.
  useEffect(() => {
    if (story && !isMine && publicKey && storyEngageEnabled()) {
      recordStoryView(story.id, publicKey);
    }
  }, [story, isMine, publicKey]);

  function react(emoji: string) {
    if (!story || !publicKey) return;
    const nextVal = myReaction === emoji ? "" : emoji;
    setReactions((m) => ({ ...m, [story.id]: nextVal }));
    void reactToStory(story.id, publicKey, nextVal);
  }

  function submitReply() {
    const text = reply.trim();
    if (!text || !group) return;
    sendReply.mutate(
      { authorPubkey: group.pubkey, text },
      {
        onSuccess: () => {
          setReply("");
          toast("Reply sent", "success");
        },
        onError: (e) => toast(e instanceof Error ? e.message : "Couldn't send reply", "error"),
      },
    );
  }
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const downAt = useRef(0);
  const downPos = useRef({ x: 0, y: 0 });
  const moved = useRef(false);

  const next = useCallback(() => {
    setProgress(0);
    setSi((curSi) => {
      const g = groups[gi];
      if (g && curSi < g.stories.length - 1) return curSi + 1;
      // advance group
      if (gi < groups.length - 1) {
        setGi(gi + 1);
        return 0;
      }
      onClose();
      return curSi;
    });
  }, [gi, groups, onClose]);

  const prev = useCallback(() => {
    setProgress(0);
    if (si > 0) {
      setSi(si - 1);
    } else if (gi > 0) {
      const pg = groups[gi - 1];
      setGi(gi - 1);
      setSi(Math.max(0, pg.stories.length - 1));
    }
  }, [gi, si, groups]);

  // Reset progress + mark seen on each segment.
  useEffect(() => {
    setProgress(0);
    if (story) markStoriesSeen([story.id]);
  }, [gi, si, story]);

  // Escape to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, next, prev]);

  // Image auto-advance timer (video uses its own timeupdate/ended).
  useEffect(() => {
    if (isVideo || paused || !story) return;
    let raf = 0;
    const start = performance.now() - progress * IMAGE_MS;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / IMAGE_MS);
      setProgress(p);
      if (p >= 1) {
        next();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideo, paused, story, gi, si]);

  // Pause/resume video.
  useEffect(() => {
    if (!isVideo) return;
    const v = videoRef.current;
    if (!v) return;
    if (paused) v.pause();
    else v.play().catch(() => {});
  }, [paused, isVideo, story]);

  // Press-and-hold pauses the story (image timer or video); releasing resumes.
  // A quick tap navigates (left third = previous, else next); a drag does
  // neither. Movement is tracked so a swipe doesn't register as a tap.
  function onPointerDown(e: React.PointerEvent) {
    downAt.current = performance.now();
    downPos.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
    setPaused(true);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (moved.current) return;
    const dx = e.clientX - downPos.current.x;
    const dy = e.clientY - downPos.current.y;
    if (Math.hypot(dx, dy) > 12) moved.current = true;
  }
  function onPointerUp(e: React.PointerEvent) {
    const held = performance.now() - downAt.current;
    setPaused(false);
    if (held < 250 && !moved.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x < rect.width * 0.33) prev();
      else next();
    }
  }

  if (!group || !story || !data) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black">
      <div className="relative h-full w-full max-w-[440px] bg-black">
        {/* progress bars */}
        <div className="absolute inset-x-0 top-0 z-20 flex gap-1 p-2">
          {group.stories.map((s, idx) => (
            <div key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
              <div
                className="h-full bg-white"
                style={{
                  width: `${idx < si ? 100 : idx === si ? progress * 100 : 0}%`,
                  transition: idx === si && !isVideo ? "none" : undefined,
                }}
              />
            </div>
          ))}
        </div>

        {/* header */}
        <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-2 px-3 pb-2 pt-5 text-white">
          <Avatar refUri={profile?.avatarRef} seed={group.pubkey} name={profile?.name} size={32} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-semibold">
              {profile ? displayName(profile) : ""}
            </div>
            <div className="text-xs text-white/70">{timeAgo(story.created_at)}</div>
          </div>
          {isVideo && (
            <button
              onClick={() => setMuted((m) => !m)}
              className="rounded-full bg-black/40 p-2"
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          )}
          <button onClick={onClose} className="rounded-full bg-black/40 p-2" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* media + tap zones */}
        <div
          className="absolute inset-0 flex select-none items-center justify-center"
          style={{ touchAction: "none", WebkitTouchCallout: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setPaused(false)}
          onPointerLeave={() => setPaused(false)}
        >
          {isVideo ? (
            <MediaVideo
              key={story.id}
              onRef={(el) => (videoRef.current = el)}
              refUri={data.cid}
              poster={data.poster}
              className="max-h-full w-full object-contain"
              autoPlay
              muted={muted}
              controls={false}
              playsInline
              onEnded={next}
              onTimeUpdate={(ct, dur) => dur && setProgress(Math.min(1, ct / dur))}
            />
          ) : (
            <MediaImage
              key={story.id}
              refUri={data.cid}
              alt={data.cap || "story"}
              className="max-h-full w-full object-contain"
            />
          )}
        </div>

        {/* caption + engagement (higher z than the tap layer; own handlers) */}
        <div
          className="absolute inset-x-0 bottom-0 z-30 flex flex-col gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pb-4 pt-8"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          {data.cap && <p className="px-1 text-center text-sm text-white">{data.cap}</p>}

          {isMine ? (
            storyEngageEnabled() && (
              <button
                onClick={() => setSeenOpen(true)}
                className="mx-auto flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-xs text-white"
              >
                <Eye className="h-4 w-4" /> Seen by — tap to see
              </button>
            )
          ) : (
            <>
              {storyEngageEnabled() && (
                <div className="flex items-center justify-center gap-2">
                  {REACTIONS.map((e) => (
                    <button
                      key={e}
                      onClick={() => react(e)}
                      className={
                        "text-2xl transition-transform active:scale-90 " +
                        (myReaction === e ? "scale-110" : "opacity-80 hover:opacity-100")
                      }
                      aria-label={`React ${e}`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
              {DMS_ENABLED && dmCapable && (
                <div className="flex items-center gap-2">
                  <input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onFocus={() => setPaused(true)}
                    onBlur={() => setPaused(false)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitReply();
                    }}
                    placeholder={`Reply to ${profile ? displayName(profile) : "story"}…`}
                    className="flex-1 rounded-full border border-white/30 bg-black/40 px-4 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none"
                  />
                  <button
                    onClick={submitReply}
                    disabled={!reply.trim() || sendReply.isPending}
                    className="rounded-full bg-rouge-600 p-2 text-white disabled:opacity-40"
                    aria-label="Send reply"
                  >
                    {sendReply.isPending ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Send className="h-5 w-5" />
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {seenOpen && story && (
        <SeenBySheet storyId={story.id} onClose={() => setSeenOpen(false)} />
      )}
    </div>
  );
}

/** Author-only viewer/reaction list for one of your own stories. */
function SeenBySheet({ storyId, onClose }: { storyId: string; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["storyEngage", storyId],
    queryFn: () => getStoryEngagement(storyId),
    staleTime: 15_000,
  });
  // reactions keyed by viewer, so we can show an emoji next to each name.
  const reactionByViewer = new Map((data?.reactions ?? []).map((r) => [r.from, r.emoji]));

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-[440px] rounded-t-2xl border-t border-ink-border bg-ink-card p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
          <Eye className="h-4 w-4" /> Seen by {formatCount(data?.viewCount ?? 0)}
        </div>
        {!data || data.views.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">No views yet.</p>
        ) : (
          <ul className="max-h-[55vh] space-y-1 overflow-y-auto">
            {data.views.map((v) => (
              <SeenByRow key={v.viewer} viewer={v.viewer} at={v.at} emoji={reactionByViewer.get(v.viewer)} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SeenByRow({ viewer, at, emoji }: { viewer: string; at: number; emoji?: string }) {
  const { data: profile } = useProfile(viewer);
  return (
    <li className="flex items-center gap-3 rounded-xl px-2 py-2">
      <Avatar refUri={profile?.avatarRef} seed={viewer} name={profile?.name} size={36} />
      <div className="min-w-0 flex-1 leading-tight">
        <VerifiedName pubkey={viewer} className="truncate text-sm font-semibold" />
        <div className="truncate text-xs text-ink-muted">
          <span className="font-mono">{shortAddress(profile?.address ?? "", 8, 4)}</span> · {timeAgo(at)}
        </div>
      </div>
      {emoji && <span className="shrink-0 text-lg">{emoji}</span>}
    </li>
  );
}
