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
import { encodePhoto, encodeVideo, CAPTION_LIMIT } from "@/lib/envelope";
import { rc, requestFaucet } from "@/lib/rouge";
import { invalidateFeeds } from "@/hooks/useSocial";
import { cn } from "@/lib/utils";

interface CreatePostCtx {
  open: () => void;
}
const Ctx = createContext<CreatePostCtx | null>(null);

export function useCreatePost() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCreatePost must be used within CreatePostProvider");
  return ctx;
}

export function CreatePostProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const value = useMemo(() => ({ open: () => setIsOpen(true) }), []);
  return (
    <Ctx.Provider value={value}>
      {children}
      {isOpen && <CreatePostDialog onClose={() => setIsOpen(false)} />}
    </Ctx.Provider>
  );
}

function CreatePostDialog({ onClose }: { onClose: () => void }) {
  const { wallet, publicKey } = useAuth();
  const { toast } = useToast();
  const client = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [square, setSquare] = useState(false);
  const [isReel, setIsReel] = useState(false);
  const [vinfo, setVinfo] = useState<ProcessedVideo | null>(null);
  const [processing, setProcessing] = useState(false);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");

  const backend = activeBackend();
  const kind = file ? (isVideoFile(file) ? "video" : "image") : null;
  const reelAllowed =
    !vinfo?.duration || vinfo.duration <= REEL_MAX_SECONDS;

  const pickFile = useCallback(
    async (f: File | null) => {
      if (!f) return;
      const isImg = f.type.startsWith("image/");
      const isVid = f.type.startsWith("video/");
      if (!isImg && !isVid) {
        toast("Choose an image or video file.", "error");
        return;
      }
      const url = URL.createObjectURL(f);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setFile(f);
      setVinfo(null);
      setSquare(false);
      setIsReel(false);

      if (isVid) {
        setProcessing(true);
        try {
          const info = await processVideo(f);
          setVinfo(info);
          setIsReel(
            info.isPortrait && (!info.duration || info.duration <= REEL_MAX_SECONDS),
          );
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
      }
    },
    [toast],
  );

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl("");
    setCaption("");
    setSquare(false);
    setIsReel(false);
    setVinfo(null);
  }

  async function shareImage() {
    if (!file || !wallet) return;
    setStage("Processing image…");
    const img = await processImage(file, { square, maxSize: 1440, quality: 0.82 });
    setStage(backend === "ipfs" ? "Uploading to IPFS…" : "Saving locally…");
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
    setStage(backend === "ipfs" ? "Uploading video to IPFS…" : "Saving video locally…");
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
      cap: caption.trim() || undefined,
    });
    await submit(body);
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
    toast(isReel && kind === "video" ? "Reel posted! 🎬" : "Posted! 🎉", "success");
    reset();
    onClose();
  }

  async function share() {
    if (!file || !wallet || processing) return;
    setBusy(true);
    try {
      if (kind === "video") await shareVideo();
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
    <Modal onClose={busy ? () => {} : onClose} title="New post" maxWidth="max-w-lg">
      {!file ? (
        <DropZone onFile={pickFile} onBrowse={() => fileInput.current?.click()} />
      ) : (
        <div className="space-y-4">
          <div className="relative">
            <div
              className={cn(
                "flex items-center justify-center overflow-hidden rounded-xl bg-black",
                (kind === "image" && square) || (kind === "video" && isReel)
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
                  className={cn("h-full w-full", isReel ? "object-cover" : "object-contain")}
                  controls
                  muted
                  loop
                  playsInline
                />
              )}
              {processing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
              )}
            </div>

            {/* aspect / reel toggle */}
            <div className="absolute left-2 top-2 flex gap-2">
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

          {tooBig && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Large file ({formatBytes(file.size)}) — upload may be slow.
            </div>
          )}

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
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
      />
    </Modal>
  );
}

function DropZone({
  onFile,
  onBrowse,
}: {
  onFile: (f: File) => void;
  onBrowse: () => void;
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
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
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
        <p className="font-medium">Drag a photo or video here</p>
        <p className="text-sm text-ink-muted">or click to browse · reels supported</p>
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
