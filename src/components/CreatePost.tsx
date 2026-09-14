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
  HardDrive,
  Globe,
} from "lucide-react";
import { useAuth } from "@/store/auth";
import { useToast } from "./Toast";
import Modal from "./Modal";
import { processImage } from "@/lib/image";
import { putImage, activeBackend } from "@/lib/media";
import { encodePhoto, CAPTION_LIMIT } from "@/lib/envelope";
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
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");

  const backend = activeBackend();

  const pickFile = useCallback((f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast("Please choose an image file.", "error");
      return;
    }
    setFile(f);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
  }, [toast]);

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl("");
    setCaption("");
    setSquare(false);
  }

  async function share() {
    if (!file || !wallet) return;
    setBusy(true);
    try {
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

      let res = await rc().social.createPost(wallet, body);
      if (!res.success && needsFunds(res.error)) {
        setStage("Funding account via faucet…");
        await requestFaucet(wallet);
        res = await rc().social.createPost(wallet, body);
      }
      if (!res.success) throw new Error(res.error || "Post failed");

      invalidateFeeds(client, publicKey);
      toast("Posted! 🎉", "success");
      reset();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not post.", "error");
    } finally {
      setBusy(false);
      setStage("");
    }
  }

  return (
    <Modal onClose={busy ? () => {} : onClose} title="New post" maxWidth="max-w-lg">
      {!file ? (
        <DropZone
          onFile={pickFile}
          onBrowse={() => fileInput.current?.click()}
        />
      ) : (
        <div className="space-y-4">
          <div className="relative">
            <div
              className={cn(
                "overflow-hidden rounded-xl bg-black",
                square ? "aspect-square" : "max-h-[52vh]",
              )}
            >
              <img
                src={previewUrl}
                alt="preview"
                className={cn(
                  "h-full w-full",
                  square ? "object-cover" : "mx-auto object-contain",
                )}
              />
            </div>
            <div className="absolute left-2 top-2 flex gap-2">
              <button
                onClick={() => setSquare((s) => !s)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium backdrop-blur",
                  square ? "bg-rouge-600 text-white" : "bg-black/60 text-white",
                )}
              >
                <Crop className="h-3.5 w-3.5" />
                {square ? "1:1" : "Original"}
              </button>
            </div>
            <button
              onClick={() => reset()}
              disabled={busy}
              className="absolute right-2 top-2 rounded-lg bg-black/60 p-1.5 text-white backdrop-blur hover:bg-black/80"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

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
            {backend === "ipfs" ? (
              <>
                <Globe className="h-3.5 w-3.5 text-emerald-400" />
                Storing on IPFS — portable &amp; censorship-resistant.
              </>
            ) : (
              <>
                <HardDrive className="h-3.5 w-3.5 text-amber-400" />
                Local mode — photo stays on this device. Add a Pinata key in
                Settings for IPFS.
              </>
            )}
          </div>

          <div className="flex gap-2">
            <button className="btn-soft flex-1" onClick={reset} disabled={busy}>
              Change photo
            </button>
            <button
              className="btn-primary flex-[2]"
              onClick={share}
              disabled={busy}
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
        accept="image/*"
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
        <p className="font-medium">Drag a photo here</p>
        <p className="text-sm text-ink-muted">or click to browse</p>
      </div>
    </button>
  );
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
