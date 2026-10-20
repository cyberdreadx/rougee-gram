// RouGee mux service — bakes a reel's chosen qRougee track into the video as one
// file (perfect, single-file A/V sync). The browser composer POSTs the raw video
// + the track's URL + offsets; we run ffmpeg (copy video, encode audio, bake the
// start offset + trim), store the result in R2 via the media Worker's /upload,
// and return its content-addressed ref (`cf:media/<sha>.mp4`).
//
// On-chain posts are immutable, so the composer calls this synchronously BEFORE
// creating the post and writes the returned ref + the `mx` flag into the envelope.
//
// Env: MEDIA_WORKER_URL (required), UPLOAD_SECRET (optional), ALLOW_ORIGIN, PORT.
import express from "express";
import multer from "multer";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MEDIA = (process.env.MEDIA_WORKER_URL || "").replace(/\/+$/, "");
const SECRET = process.env.UPLOAD_SECRET || "";
const ORIGIN = process.env.ALLOW_ORIGIN || "*";
const PORT = Number(process.env.PORT) || 8080;

// Reels cap at ~90s; 200MB leaves generous headroom for the raw upload.
const upload = multer({ dest: tmpdir(), limits: { fileSize: 200 * 1024 * 1024 } });
const app = express();

app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", ORIGIN);
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

app.get("/", (_req, res) => res.json({ ok: true, media: !!MEDIA }));

app.post("/mux", upload.single("video"), async (req, res) => {
  if (!MEDIA) return res.status(501).json({ error: "MEDIA_WORKER_URL not set" });
  if (!req.file) return res.status(400).json({ error: "no video" });

  const audioUrl = String(req.body.audioUrl || "");
  if (!/^https:\/\//i.test(audioUrl)) {
    await rm(req.file.path, { force: true }).catch(() => {});
    return res.status(400).json({ error: "bad audioUrl" });
  }
  const start = num(req.body.start);
  const trimStart = num(req.body.trimStart);
  const trimEnd = num(req.body.trimEnd);

  const dir = await mkdtemp(join(tmpdir(), "mux-"));
  const audioPath = join(dir, "audio");
  const outPath = join(dir, "out.mp4");
  try {
    // Fetch the track.
    const ar = await fetch(audioUrl);
    if (!ar.ok) throw new Error(`audio fetch ${ar.status}`);
    await writeFile(audioPath, Buffer.from(await ar.arrayBuffer()));

    // ffmpeg: trim the VIDEO to [trimStart, trimEnd], seek the AUDIO to `start`,
    // copy the video stream (no re-encode), encode audio to AAC, end at the
    // shorter of the two. +faststart so it streams while downloading.
    const args = [];
    if (trimStart > 0) args.push("-ss", String(trimStart));
    if (trimEnd > trimStart) args.push("-to", String(trimEnd));
    args.push("-i", req.file.path);
    if (start > 0) args.push("-ss", String(start));
    args.push(
      "-i",
      audioPath,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-shortest",
      "-movflags",
      "+faststart",
      "-y",
      outPath,
    );
    await run("ffmpeg", args);

    // Store in R2 (content-addressed) through the media Worker.
    const buf = await readFile(outPath);
    const key = createHash("sha256").update(buf).digest("hex");
    const up = await fetch(`${MEDIA}/upload?key=${key}&ext=mp4`, {
      method: "POST",
      headers: {
        "Content-Type": "video/mp4",
        ...(SECRET ? { "X-Upload-Secret": SECRET } : {}),
      },
      body: buf,
    });
    if (!up.ok) throw new Error(`upload ${up.status}: ${(await up.text()).slice(0, 160)}`);
    const j = await up.json();
    const refKey = j.key || `media/${key}.mp4`;
    res.json({ ref: `cf:${refKey}`, mime: "video/mp4", bytes: buf.length });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    await rm(req.file.path, { force: true }).catch(() => {});
  }
});

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}
function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}: ${err.slice(-400)}`)),
    );
  });
}

app.listen(PORT, () => console.log(`rougee-mux listening on :${PORT} (media=${!!MEDIA})`));
