import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ImagePlus,
  Loader2,
  X,
  Crop,
  Film,
  Scissors,
  HardDrive,
  Globe,
  Cloud,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/store/auth";
import { useToast } from "./Toast";
import Modal from "./Modal";
import { processImage } from "@/lib/image";
import {
  processVideo,
  isVideoFile,
  VIDEO_WARN_BYTES,
  REEL_MAX_SECONDS,
  formatBytes,
  type ProcessedVideo,
} from "@/lib/video";
import { putImage, activeBackend } from "@/lib/media";
import {
  encodePhoto,
  encodeVideo,
  encodeStory,
  encodeCarousel,
  CAPTION_LIMIT,
  CAROUSEL_MAX,
} from "@/lib/envelope";
import { rc, requestFaucet } from "@/lib/rouge";
import { invalidateFeeds } from "@/hooks/useSocial";
import { cn } from "@/lib/utils";

type CreateMode = "post" | "story";

interface CreatePostCtx {
  open: (mode?: CreateMode) => void;
}
const Ctx = createContext<CreatePostCtx | null>(null);

export function useCreatePost() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCreatePost must be used within CreatePostProvider");
  return ctx;
}

export function CreatePostProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; mode: CreateMode }>({
    open: false,
    mode: "post",
  });
  const value = useMemo(
    () => ({ open: (mode: CreateMode = "post") => setState({ open: true, mode }) }),
    [],
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      {state.open && (
        <CreatePostDialog
          mode={state.mode}
          onClose={() => setState((s) => ({ ...s, open: false }))}
        />
      )}
    </Ctx.Provider>
  );
}

function CreatePostDialog({
  mode,
  onClose,
}: {
  mode: CreateMode;
  onClose: () => void;
}) {
  const isStory = mode === "story";
  const { wallet, publicKey } = useAuth();
  const { toast } = useToast();
  const client = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [moreImages, setMoreImages] = useState<File[]>([]);
  const [moreUrls, setMoreUrls] = useState<string[]>([]);
  const [square, setSquare] = useState(false);
  const [isReel, setIsReel] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [crop916, setCrop916] = useState(false);
  const [vinfo, setVinfo] = useState<ProcessedVideo | null>(null);
  const [processing, setProcessing] = useState(false);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");

  const backend = activeBackend();
  const kind = file
    ? isVideoFile(file)
      ? "video"
      : moreImages.length > 0
        ? "carousel"
        : "image"
    : null;
  const carouselUrls = [previewUrl, ...moreUrls];
  const reelAllowed =
    !vinfo?.duration || vinfo.duration <= REEL_MAX_SECONDS;

  const pickFiles = useCallback(
    async (list: FileList | File[] | null) => {
      const files = list ? Array.from(list) : [];
      if (!files.length) return;
      const first = files[0];
      const isImg = first.type.startsWith("image/");
      const isVid = first.type.startsWith("video/");
      if (!isImg && !isVid) {
        toast("Choose an image or video file.", "error");
        return;
      }
      setVinfo(null);
      setSquare(false);
      setIsReel(false);

      if (isVid) {
        setFile(first);
        setMoreImages([]);
        setMoreUrls((prev) => {
          prev.forEach((u) => URL.revokeObjectURL(u));
          return [];
        });
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(first);
        });
        setProcessing(true);
        try {
          const info = await processVideo(first);
          setVinfo(info);
          setIsReel(
            info.isPortrait && (!info.duration || info.duration <= REEL_MAX_SECONDS),
          );
          setTrimStart(0);
          setTrimEnd(info.duration || 0);
          setCrop916(false);
        } catch (e) {
          toast(e instanceof Error ? e.message : "Could not read video.", "error");
          setFile(null);
          setPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return "";
          });
        } finally {
          setProcessing(false);
        }
        return;
      }

      // Images — up to CAROUSEL_MAX (stories are single).
      const imgs = files
        .filter((f) => f.type.startsWith("image/"))
        .slice(0, isStory ? 1 : CAROUSEL_MAX);
      const [primary, ...rest] = imgs;
      setFile(primary);
      setMoreImages(rest);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(primary);
      });
      setMoreUrls((prev) => {
        prev.forEach((u) => URL.revokeObjectURL(u));
        return rest.map((f) => URL.createObjectURL(f));
      });
    },
    [toast, isStory],
  );

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    moreUrls.forEach((u) => URL.revokeObjectURL(u));
    setFile(null);
    setPreviewUrl("");
    setMoreImages([]);
    setMoreUrls([]);
    setCaption("");
    setSquare(false);
    setIsReel(false);
    setTrimStart(0);
    setTrimEnd(0);
    setCrop916(false);
    setVinfo(null);
  }

  function uploadStage() {
    return backend === "cloudflare"
      ? "Uploading to Cloudflare…"
      : backend === "ipfs"
        ? "Uploading to IPFS…"
        : "Saving locally…";
  }

  async function shareImage() {
    if (!file || !wallet) return;
    setStage("Processing image…");
    const img = await processImage(file, { square, maxSize: 1440, quality: 0.82 });
    setStage(uploadStage());
    const media = await putImage(img.blob, "photo");
    setStage("Signing & posting on-chain…");
    const body = encodePhoto({
      cid: media.ref,
      mime: img.mime,
      w: img.width,
      h: img.height,
      cap: caption.trim() || undefined,
    });
    await submit(body);
  }

  async function shareVideo() {
    if (!vinfo || !wallet) return;
    let posterRef: string | undefined;
    if (vinfo.poster) {
      setStage("Uploading thumbnail…");
      posterRef = (await putImage(vinfo.poster, "poster")).ref;
    }
    setStage(uploadStage());
    const media = await putImage(vinfo.blob, "video");
    setStage("Signing & posting on-chain…");
    const body = encodeVideo({
      t: isReel && reelAllowed ? "reel" : "video",
      cid: media.ref,
      mime: vinfo.mime,
      w: vinfo.width || undefined,
      h: vinfo.height || undefined,
      dur: vinfo.duration ? Math.round(vinfo.duration) : undefined,
      poster: posterRef,
      start: trimStart > 0.05 ? Math.round(trimStart * 10) / 10 : undefined,
      end:
        vinfo.duration && trimEnd < vinfo.duration - 0.05
          ? Math.round(trimEnd * 10) / 10
          : undefined,
      crop: crop916 ? "9:16" : undefined,
      cap: caption.trim() || undefined,
    });
    await submit(body);
  }

  async function shareStory() {
    if (!wallet || !file) return;
    if (kind === "video") {
      if (!vinfo) return;
      let posterRef: string | undefined;
      if (vinfo.poster) {
        setStage("Uploading thumbnail…");
        posterRef = (await putImage(vinfo.poster, "poster")).ref;
      }
      setStage(uploadStage());
      const media = await putImage(vinfo.blob, "story");
      setStage("Signing & posting on-chain…");
      await submit(
        encodeStory({
          cid: media.ref,
          mime: vinfo.mime,
          w: vinfo.width || undefined,
          h: vinfo.height || undefined,
          dur: vinfo.duration ? Math.round(vinfo.duration) : undefined,
          poster: posterRef,
          cap: caption.trim() || undefined,
        }),
      );
    } else {
      setStage("Processing image…");
      const img = await processImage(file, { maxSize: 1440, quality: 0.85 });
      setStage(uploadStage());
      const media = await putImage(img.blob, "story");
      setStage("Signing & posting on-chain…");
      await submit(
        encodeStory({
          cid: media.ref,
          mime: img.mime,
          w: img.width,
          h: img.height,
          cap: caption.trim() || undefined,
        }),
      );
    }
  }

  async function shareCarousel() {
    if (!file || !wallet) return;
    const all = [file, ...moreImages].slice(0, CAROUSEL_MAX);
    const items: { cid: string; mime: string; w: number; h: number }[] = [];
    for (let i = 0; i < all.length; i++) {
      setStage(`Processing ${i + 1}/${all.length}…`);
      const img = await processImage(all[i], { maxSize: 1440, quality: 0.82 });
      setStage(`Uploading ${i + 1}/${all.length}…`);
      const media = await putImage(img.blob, "photo");
      items.push({ cid: media.ref, mime: img.mime, w: img.width, h: img.height });
    }
    setStage("Signing & posting on-chain…");
    await submit(encodeCarousel({ items, cap: caption.trim() || undefined }));
  }

  async function submit(body: string) {
    if (!wallet) return;
    let res = await rc().social.createPost(wallet, body);
    if (!res.success && needsFunds(res.error)) {
      setStage("Funding account via faucet…");
      await requestFaucet(wallet);
      res = await rc().social.createPost(wallet, body);
    }
    if (!res.success) throw new Error(res.error || "Post failed");
    invalidateFeeds(client, publicKey);
    toast(
      isStory
        ? "Story posted ✨"
        : isReel && kind === "video"
          ? "Reel posted! 🎬"
          : "Posted! 🎉",
      "success",
    );
    reset();
    onClose();
  }

  async function share() {
    if (!file || !wallet || processing) return;
    setBusy(true);
    try {
      if (isStory) await shareStory();
      else if (kind === "video") await shareVideo();
      else if (kind === "carousel") await shareCarousel();
      else await shareImage();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not post.", "error");
    } finally {
      setBusy(false);
      setStage("");
    }
  }

  const tooBig = kind === "video" && file ? file.size > VIDEO_WARN_BYTES : false;

  return (
    <Modal onClose={busy ? () => {} : onClose} title={isStory ? "New story" : "New post"} maxWidth="max-w-lg">
      {!file ? (
        <DropZone onFiles={pickFiles} onBrowse={() => fileInput.current?.click()} isStory={isStory} />
      ) : (
        <div className="space-y-4">
          {kind === "carousel" ? (
            <div className="relative">
              <div className="hide-scrollbar flex gap-2 overflow-x-auto rounded-xl bg-black p-2">
                {carouselUrls.map((u, i) => (
                  <img
                    key={i}
                    src={u}
                    alt=""
                    className="h-28 w-28 shrink-0 rounded-lg object-cover"
                  />
                ))}
              </div>
              <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur">
                {carouselUrls.length} photos
              </span>
              <button
                onClick={() => reset()}
                disabled={busy}
                className="absolute right-2 top-2 rounded-lg bg-black/60 p-2 text-white backdrop-blur hover:bg-black/80"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
            <div
              className={cn(
                "flex items-center justify-center overflow-hidden rounded-xl bg-black",
                kind === "video" && (isReel || crop916)
                  ? "aspect-[9/16] max-h-[60vh]"
                  : kind === "image" && square
                    ? "aspect-[4/5] max-h-[52vh]"
                    : "max-h-[52vh]",
              )}
            >
              {kind === "image" ? (
                <img
                  src={previewUrl}
                  alt="preview"
                  className={cn("h-full w-full", square ? "object-cover" : "object-contain")}
                />
              ) : (
                <video
                  src={previewUrl}
                  className={cn(
                    "h-full w-full",
                    isReel || crop916 ? "object-cover" : "object-contain",
                  )}
                  controls
                  muted
                  loop
                  playsInline
                  onTimeUpdate={(e) => {
                    const el = e.currentTarget;
                    if (trimEnd && el.currentTime >= trimEnd) el.currentTime = trimStart;
                  }}
                />
              )}
              {processing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
              )}
            </div>

            {/* aspect / reel toggle (not for stories) */}
            <div className={cn("absolute left-2 top-2 flex gap-2", isStory && "hidden")}>
              {kind === "image" ? (
                <button
                  onClick={() => setSquare((s) => !s)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium backdrop-blur",
                    square ? "bg-rouge-600 text-white" : "bg-black/60 text-white",
                  )}
                >
                  <Crop className="h-3.5 w-3.5" />
                  {square ? "1:1" : "Original"}
                </button>
              ) : (
                <button
                  onClick={() => reelAllowed && setIsReel((r) => !r)}
                  disabled={!reelAllowed}
                  title={reelAllowed ? "" : `Reels must be ${REEL_MAX_SECONDS}s or shorter`}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium backdrop-blur disabled:opacity-50",
                    isReel ? "bg-rouge-600 text-white" : "bg-black/60 text-white",
                  )}
                >
                  <Film className="h-3.5 w-3.5" />
                  {isReel ? "Reel" : "Video"}
                </button>
              )}
            </div>

            <button
              onClick={() => reset()}
              disabled={busy}
              className="absolute right-2 top-2 rounded-lg bg-black/60 p-2 text-white backdrop-blur hover:bg-black/80"
            >
              <X className="h-4 w-4" />
            </button>

            {vinfo?.duration ? (
              <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white backdrop-blur">
                {formatDur(vinfo.duration)}
              </span>
            ) : null}
            </div>
          )}

          {tooBig && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Large file ({formatBytes(file.size)}) — upload may be slow.
            </div>
          )}

          {kind === "video" && vinfo?.duration ? (
            <div className="space-y-2 rounded-lg bg-ink-soft p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium">
                  <Scissors className="h-3.5 w-3.5" /> Trim
                </span>
                <span className="text-ink-muted">
                  {formatDur(trimStart)} – {formatDur(trimEnd)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={vinfo.duration}
                step={0.1}
                value={trimStart}
                onChange={(e) => setTrimStart(Math.min(Number(e.target.value), trimEnd - 0.5))}
                className="w-full accent-rouge-500"
                aria-label="Trim start"
              />
              <input
                type="range"
                min={0}
                max={vinfo.duration}
                step={0.1}
                value={trimEnd}
                onChange={(e) => setTrimEnd(Math.max(Number(e.target.value), trimStart + 0.5))}
                className="w-full accent-rouge-500"
                aria-label="Trim end"
              />
              <button
                onClick={() => setCrop916((c) => !c)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                  crop916 ? "bg-rouge-600 text-white" : "bg-white/5 text-white hover:bg-white/10",
                )}
              >
                <Crop className="h-3.5 w-3.5" /> {crop916 ? "9:16 crop on" : "Crop to 9:16"}
              </button>
            </div>
          ) : null}

          <div>
            <textarea
              className="input h-24 resize-none"
              placeholder="Write a caption…"
              value={caption}
              maxLength={CAPTION_LIMIT}
              onChange={(e) => setCaption(e.target.value)}
              disabled={busy}
            />
            <div className="mt-1 text-right text-xs text-ink-muted">
              {caption.length}/{CAPTION_LIMIT}
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-ink-soft px-3 py-2 text-xs text-ink-muted">
            {backend === "cloudflare" ? (
              <>
                <Cloud className="h-3.5 w-3.5 text-emerald-400" />
                Storing on Cloudflare R2 — fast &amp; low-cost.
              </>
            ) : backend === "ipfs" ? (
              <>
                <Globe className="h-3.5 w-3.5 text-emerald-400" />
                Storing on IPFS — portable &amp; censorship-resistant.
              </>
            ) : (
              <>
                <HardDrive className="h-3.5 w-3.5 text-amber-400" />
                Local mode — media stays on this device. Add Cloudflare or Pinata
                in Settings.
              </>
            )}
          </div>

          <div className="flex gap-2">
            <button className="btn-soft flex-1 py-3" onClick={reset} disabled={busy}>
              Change
            </button>
            <button
              className="btn-primary flex-[2] py-3"
              onClick={share}
              disabled={busy || processing}
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {stage || "Posting…"}
                </>
              ) : (
                "Share"
              )}
            </button>
          </div>
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*,video/*"
        multiple={!isStory}
        className="hidden"
        onChange={(e) => pickFiles(e.target.files)}
      />
    </Modal>
  );
}

function DropZone({
  onFiles,
  onBrowse,
  isStory,
}: {
  onFiles: (files: FileList | File[]) => void;
  onBrowse: () => void;
  isStory: boolean;
}) {
  const [drag, setDrag] = useState(false);
  return (
    <button
      onClick={onBrowse}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
      }}
      className={cn(
        "flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-16 transition-colors",
        drag ? "border-rouge-500 bg-rouge-500/5" : "border-ink-border hover:border-ink-muted",
      )}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rouge-600/15 text-rouge-400">
        <ImagePlus className="h-8 w-8" />
      </div>
      <div className="text-center">
        <p className="font-medium">
          {isStory ? "Add to your story" : "Drag photos or a video here"}
        </p>
        <p className="text-sm text-ink-muted">
          {isStory ? "photo or video" : "click to browse · up to 10 photos · reels"}
        </p>
      </div>
    </button>
  );
}

function formatDur(sec: number): string {
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function needsFunds(error?: string): boolean {
  if (!error) return false;
  const e = error.toLowerCase();
  return (
    e.includes("balance") ||
    e.includes("fund") ||
    e.includes("insufficient") ||
    e.includes("fee")
  );
}
