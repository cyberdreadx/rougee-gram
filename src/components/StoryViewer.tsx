import { useCallback, useEffect, useRef, useState } from "react";
import { X, Volume2, VolumeX } from "lucide-react";
import { decodeBody, type StoryEnvelope } from "@/lib/envelope";
import { markStoriesSeen, type StoryGroup } from "@/hooks/useStories";
import { useProfile } from "@/hooks/useProfile";
import { displayName } from "@/lib/profile";
import { timeAgo } from "@/lib/format";
import Avatar from "./Avatar";
import MediaImage from "./MediaImage";
import MediaVideo from "./MediaVideo";

const IMAGE_MS = 5000;

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

  const group = groups[gi];
  const story = group?.stories[si];
  const decoded = story ? decodeBody(story.body) : null;
  const data = decoded?.kind === "story" ? (decoded.data as StoryEnvelope) : null;
  const isVideo = (data?.mime || "").startsWith("video/");

  const { data: profile } = useProfile(group?.pubkey);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const downAt = useRef(0);

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

  function onPointerDown() {
    downAt.current = performance.now();
    setPaused(true);
  }
  function onPointerUp(e: React.PointerEvent) {
    const held = performance.now() - downAt.current;
    setPaused(false);
    if (held < 250) {
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
          className="absolute inset-0 flex items-center justify-center"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
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

        {/* caption */}
        {data.cap && (
          <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 to-transparent p-4 pb-8 text-center text-sm text-white">
            {data.cap}
          </div>
        )}
      </div>
    </div>
  );
}
