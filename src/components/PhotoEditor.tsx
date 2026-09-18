import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Type, Trash2, Loader2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Lightweight photo editor: one-tap filters + draggable text in a few font
 * styles, all burned into an exported WebP on save. Non-AR, GPU-free — CSS
 * filters for live preview, mirrored onto a canvas for export.
 */

interface Filter {
  id: string;
  label: string;
  /** CSS filter string; also applied to the export canvas via ctx.filter. */
  css: string;
}

const FILTERS: Filter[] = [
  { id: "original", label: "Original", css: "none" },
  { id: "vivid", label: "Vivid", css: "saturate(1.4) contrast(1.1)" },
  { id: "warm", label: "Warm", css: "sepia(.3) saturate(1.3) brightness(1.05)" },
  { id: "cool", label: "Cool", css: "hue-rotate(-12deg) saturate(1.2) brightness(1.03)" },
  { id: "bw", label: "B&W", css: "grayscale(1) contrast(1.1)" },
  { id: "vintage", label: "Vintage", css: "sepia(.5) contrast(.9) brightness(1.1) saturate(1.2)" },
  { id: "fade", label: "Fade", css: "contrast(.85) brightness(1.1) saturate(.9)" },
  { id: "noir", label: "Noir", css: "grayscale(1) contrast(1.4) brightness(.95)" },
  { id: "punch", label: "Punch", css: "contrast(1.3) saturate(1.5)" },
];

interface FontStyle {
  id: string;
  label: string;
  family: string;
  weight: number;
  glow?: boolean;
}

const FONTS: FontStyle[] = [
  { id: "classic", label: "Classic", family: "'Inter', sans-serif", weight: 700 },
  { id: "impact", label: "Impact", family: "'Bebas Neue', 'Inter', sans-serif", weight: 400 },
  { id: "type", label: "Type", family: "'JetBrains Mono', monospace", weight: 600 },
  { id: "neon", label: "Neon", family: "'Inter', sans-serif", weight: 700, glow: true },
  { id: "script", label: "Script", family: "'Pacifico', cursive", weight: 400 },
  { id: "serif", label: "Serif", family: "Georgia, serif", weight: 700 },
];

const COLORS = ["#ffffff", "#000000", "#13ecda", "#ff2d55", "#ffd60a", "#34d399", "#a855f7", "#ff8a5c"];

interface Overlay {
  id: number;
  text: string;
  /** Center position as % of the image. */
  x: number;
  y: number;
  /** Font size as % of image height. */
  size: number;
  fontId: string;
  color: string;
}

function fontById(id: string): FontStyle {
  return FONTS.find((f) => f.id === id) ?? FONTS[0];
}

export default function PhotoEditor({
  src,
  onSave,
  onClose,
}: {
  src: string;
  onSave: (blob: Blob) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<Filter>(FILTERS[0]);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [stageH, setStageH] = useState(0);
  const nextId = useRef(1);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ id: number; dx: number; dy: number } | null>(null);

  // Track the displayed image height so overlay text scales with the preview
  // exactly as it will in the exported canvas (both use % of image height).
  useEffect(() => {
    const measure = () => setStageH(imgRef.current?.clientHeight ?? 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const selected = overlays.find((o) => o.id === selectedId) ?? null;

  function addText() {
    const o: Overlay = {
      id: nextId.current++,
      text: "",
      x: 50,
      y: 50,
      size: 8,
      fontId: "classic",
      color: "#ffffff",
    };
    setOverlays((prev) => [...prev, o]);
    setSelectedId(o.id);
  }

  function update(id: number, patch: Partial<Overlay>) {
    setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  function remove(id: number) {
    setOverlays((prev) => prev.filter((o) => o.id !== id));
    setSelectedId(null);
  }

  // Drag overlays around the stage (pointer events → % coordinates).
  function onPointerDown(e: React.PointerEvent, id: number) {
    e.stopPropagation();
    setSelectedId(id);
    const stage = stageRef.current;
    const o = overlays.find((x) => x.id === id);
    if (!stage || !o) return;
    const r = stage.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * 100;
    const py = ((e.clientY - r.top) / r.height) * 100;
    dragRef.current = { id, dx: px - o.x, dy: py - o.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    const stage = stageRef.current;
    if (!d || !stage) return;
    const r = stage.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * 100;
    const py = ((e.clientY - r.top) / r.height) * 100;
    update(d.id, {
      x: Math.max(2, Math.min(98, px - d.dx)),
      y: Math.max(2, Math.min(98, py - d.dy)),
    });
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  async function save() {
    setSaving(true);
    try {
      const blob = await renderToBlob(src, filter.css, overlays);
      onSave(blob);
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-black pt-[env(safe-area-inset-top)]">
      {/* top bar */}
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={onClose} className="rounded-full p-1 text-white" aria-label="Cancel">
          <X className="h-6 w-6" />
        </button>
        <span className="text-sm font-semibold text-white">Edit</span>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-full bg-rouge-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Done
        </button>
      </div>

      {/* stage */}
      <div className="flex min-h-0 flex-1 items-center justify-center p-2">
        <div
          ref={stageRef}
          className="relative max-h-full max-w-full select-none overflow-hidden rounded-lg"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={() => setSelectedId(null)}
        >
          {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
          <img
            ref={imgRef}
            src={src}
            alt="edit preview"
            className="max-h-[calc(100dvh-14rem)] max-w-full object-contain"
            style={{ filter: filter.css }}
            draggable={false}
            onLoad={() => setStageH(imgRef.current?.clientHeight ?? 0)}
          />
          {overlays.map((o) => {
            const f = fontById(o.fontId);
            return (
              <div
                key={o.id}
                onPointerDown={(e) => onPointerDown(e, o.id)}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(o.id);
                }}
                className={cn(
                  "absolute -translate-x-1/2 -translate-y-1/2 cursor-move whitespace-pre px-1 text-center leading-tight",
                  selectedId === o.id && "outline-dashed outline-1 outline-white/60",
                )}
                style={{
                  left: `${o.x}%`,
                  top: `${o.y}%`,
                  fontFamily: f.family,
                  fontWeight: f.weight,
                  color: o.color,
                  opacity: o.text ? 1 : 0.5,
                  fontSize: `${(o.size / 100) * stageH}px`,
                  textShadow: f.glow
                    ? `0 0 .35em ${o.color}, 0 0 .7em ${o.color}`
                    : "0 1px 3px rgba(0,0,0,.4)",
                }}
              >
                {o.text || "Type…"}
              </div>
            );
          })}
        </div>
      </div>

      {/* controls */}
      <div className="space-y-3 bg-black/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
        {selected ? (
          <TextControls
            overlay={selected}
            onChange={(patch) => update(selected.id, patch)}
            onDelete={() => remove(selected.id)}
          />
        ) : (
          <>
            {/* filter strip */}
            <div className="hide-scrollbar flex gap-2 overflow-x-auto">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f)}
                  className="shrink-0 text-center"
                >
                  <div
                    className={cn(
                      "h-14 w-14 overflow-hidden rounded-lg ring-2",
                      filter.id === f.id ? "ring-rouge-500" : "ring-transparent",
                    )}
                  >
                    <img src={src} alt="" className="h-full w-full object-cover" style={{ filter: f.css }} />
                  </div>
                  <span
                    className={cn(
                      "mt-1 block text-[10px]",
                      filter.id === f.id ? "text-white" : "text-ink-muted",
                    )}
                  >
                    {f.label}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={addText}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-sm font-semibold text-white"
            >
              <Type className="h-4 w-4" /> Add text
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function TextControls({
  overlay,
  onChange,
  onDelete,
}: {
  overlay: Overlay;
  onChange: (patch: Partial<Overlay>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          className="input flex-1"
          value={overlay.text}
          placeholder="Your text"
          onChange={(e) => onChange({ text: e.target.value })}
          autoFocus
        />
        <button onClick={onDelete} className="btn-soft h-10 w-10 shrink-0 p-0 text-rouge-400" aria-label="Delete text">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* fonts */}
      <div className="hide-scrollbar flex gap-2 overflow-x-auto">
        {FONTS.map((f) => (
          <button
            key={f.id}
            onClick={() => onChange({ fontId: f.id })}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-sm ring-1 transition-colors",
              overlay.fontId === f.id ? "bg-white/15 text-white ring-white/40" : "text-ink-muted ring-white/10",
            )}
            style={{ fontFamily: f.family, fontWeight: f.weight }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* colors + size */}
      <div className="flex items-center gap-3">
        <div className="hide-scrollbar flex gap-1.5 overflow-x-auto">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onChange({ color: c })}
              className={cn(
                "h-7 w-7 shrink-0 rounded-full ring-2",
                overlay.color === c ? "ring-white" : "ring-white/20",
              )}
              style={{ background: c }}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
      </div>
      <input
        type="range"
        min={3}
        max={20}
        step={0.5}
        value={overlay.size}
        onChange={(e) => onChange({ size: Number(e.target.value) })}
        className="w-full accent-rouge-500"
        aria-label="Text size"
      />
    </div>
  );
}

/** Bake the filter + text overlays into a WebP blob at the image's native size. */
async function renderToBlob(src: string, filterCss: string, overlays: Overlay[]): Promise<Blob> {
  const img = await loadImage(src);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // Draw the filtered image.
  ctx.filter = filterCss && filterCss !== "none" ? filterCss : "none";
  ctx.drawImage(img, 0, 0, w, h);
  ctx.filter = "none";

  // Ensure the fonts we use are loaded before drawing text to canvas.
  await ensureFonts(overlays, h);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const o of overlays) {
    if (!o.text.trim()) continue;
    const f = fontById(o.fontId);
    const px = (o.size / 100) * h;
    ctx.font = `${f.weight} ${px}px ${f.family}`;
    ctx.fillStyle = o.color;
    if (f.glow) {
      ctx.shadowColor = o.color;
      ctx.shadowBlur = px * 0.5;
    } else {
      ctx.shadowColor = "rgba(0,0,0,.4)";
      ctx.shadowBlur = px * 0.06;
      ctx.shadowOffsetY = px * 0.03;
    }
    const x = (o.x / 100) * w;
    const y = (o.y / 100) * h;
    // Glow reads better drawn twice.
    ctx.fillText(o.text, x, y);
    if (f.glow) ctx.fillText(o.text, x, y);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed"))), "image/webp", 0.92),
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function ensureFonts(overlays: Overlay[], h: number) {
  if (!("fonts" in document)) return;
  const used = new Set(overlays.map((o) => o.fontId));
  await Promise.all(
    [...used].map((id) => {
      const f = fontById(id);
      const px = Math.round(0.08 * h);
      // Load the primary family (first in the stack) at a representative size.
      const family = f.family.split(",")[0].trim();
      return document.fonts.load(`${f.weight} ${px}px ${family}`).catch(() => {});
    }),
  );
  await document.fonts.ready;
}
