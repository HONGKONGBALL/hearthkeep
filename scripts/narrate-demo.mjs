/**
 * Speak docs/video-script.md with DashScope qwen3-tts-flash, voice Cherry.
 * The key comes from the DASHSCOPE_API_KEY environment variable; if that is unset,
 * it falls back to a local secrets file. The key is never printed.
 */

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { captionsAss, loadCues } from "./video-script.mjs";

const SECRET_PATH = "/etc/grok-secrets/dashscope.env";
const OUT = "/tmp/hk-video";
const ENDPOINTS = [
  "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
  "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
];
const PERMISSIONS = "https://dashscope.aliyuncs.com/api/v1/models/permissions";
const MODEL = "qwen3-tts-flash";
const VOICE = "Cherry";

function scrub(text) {
  return String(text).replace(/sk-[A-Za-z0-9_-]{6,}/g, "[secret]").replace(/Bearer\s+\S+/gi, "Bearer [secret]");
}

function loadKey() {
  const fromEnv = (process.env.DASHSCOPE_API_KEY || "").trim();
  if (fromEnv) return fromEnv;
  let text;
  try {
    text = readFileSync(SECRET_PATH, "utf8");
  } catch (error) {
    const code = error && error.code ? error.code : "error";
    console.error(`Cannot read ${SECRET_PATH} (${code}). Set DASHSCOPE_API_KEY. Narration stops. The key is not read from the repo.`);
    process.exit(1);
  }
  for (const line of text.split("\n")) {
    const raw = line.trim();
    if (!raw || raw.startsWith("#") || !raw.includes("=")) continue;
    const name = raw.slice(0, raw.indexOf("=")).trim();
    const value = raw.slice(raw.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
    if (name === "DASHSCOPE_API_KEY" && value) return value;
  }
  console.error(`${SECRET_PATH} has no DASHSCOPE_API_KEY value.`);
  process.exit(1);
}

function run(command, args) {
  return new Promise((done, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) done(stderr);
      else reject(new Error(`${command} exited ${code}: ${scrub(stderr).slice(-400)}`));
    });
  });
}

function probeDuration(path) {
  return new Promise((done, reject) => {
    const child = spawn(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(scrub(stderr).slice(-300)));
      else done(Number(stdout.trim()));
    });
  });
}

function findAudio(payload) {
  const output = payload && payload.output;
  if (!output || typeof output !== "object") return null;
  const audio = output.audio;
  if (audio && typeof audio === "object") {
    if (typeof audio.url === "string" && audio.url.startsWith("http")) return { kind: "url", value: audio.url };
    if (typeof audio.data === "string" && audio.data.length > 80) return { kind: "b64", value: audio.data };
  }
  if (typeof audio === "string" && audio.startsWith("http")) return { kind: "url", value: audio };
  for (const key of ["audio_url", "url"]) {
    if (typeof output[key] === "string" && output[key].startsWith("http")) return { kind: "url", value: output[key] };
  }
  return null;
}

function payloadBits(payload) {
  const code = String((payload && (payload.code || payload.output?.code)) || "");
  const message = scrub(String((payload && (payload.message || payload.output?.message)) || "")).slice(0, 240);
  return { code, message };
}

async function postJson(url, key, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  return { response, payload };
}

async function synthesizeLine(key, text, binPath, wavPath) {
  const body = {
    model: MODEL,
    input: { text, voice: VOICE, language_type: "English" },
  };
  let last = "no attempt";
  let granted = false;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    for (const endpoint of ENDPOINTS) {
      try {
        const { response, payload } = await postJson(endpoint, key, body);
        const bits = payloadBits(payload);
        const blob = `${bits.code} ${bits.message}`.toLowerCase();
        if ((blob.includes("accessdenied") || blob.includes("access denied")) && !granted) {
          granted = true;
          await postJson(PERMISSIONS, key, { models: [{ model: MODEL, inference: true }] });
          last = `access denied on ${new URL(endpoint).host}`;
          continue;
        }
        if (!response.ok) {
          last = `http ${response.status} ${bits.code} ${bits.message}`.trim();
          const transient = [408, 429, 500, 502, 503, 504].includes(response.status);
          if (!transient) continue;
          break;
        }
        const found = findAudio(payload);
        if (!found) {
          last = `no audio http ${response.status} ${bits.code} ${bits.message}`.trim();
          continue;
        }
        let bytes;
        if (found.kind === "url") {
          const download = found.value.replace(/^http:\/\//, "https://");
          const audio = await fetch(download);
          if (!audio.ok) {
            last = `download http ${audio.status}`;
            continue;
          }
          bytes = Buffer.from(await audio.arrayBuffer());
        } else {
          bytes = Buffer.from(found.value, "base64");
        }
        if (bytes.length < 200) {
          last = "audio too small";
          continue;
        }
        writeFileSync(binPath, bytes);
        await run("ffmpeg", ["-y", "-i", binPath, "-ar", "24000", "-ac", "1", wavPath]);
        const duration = await probeDuration(wavPath);
        if (!Number.isFinite(duration) || duration < 0.3) {
          last = `short audio ${duration}`;
          continue;
        }
        return duration;
      } catch (error) {
        last = scrub(error instanceof Error ? error.message : "request failed");
      }
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.min(8000, 500 * attempt)));
  }
  throw new Error(last);
}

async function mix(cues, rows) {
  const total = cues[cues.length - 1].end;
  const args = ["-y", "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"];
  for (const row of rows) args.push("-i", row.wav);
  const filters = [`[0:a]atrim=0:${total},asetpts=PTS-STARTPTS,volume=0[base]`];
  const labels = ["[base]"];
  rows.forEach((row, index) => {
    const delay = Math.round(row.start * 1000);
    const label = `[a${index + 1}]`;
    filters.push(
      `[${index + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${delay}|${delay},volume=1${label}`,
    );
    labels.push(label);
  });
  filters.push(`${labels.join("")}amix=inputs=${labels.length}:duration=first:dropout_transition=0:normalize=0[out]`);
  const wav = resolve(OUT, "narration.wav");
  args.push(
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[out]",
    "-t",
    String(total),
    "-ar",
    "48000",
    "-ac",
    "2",
    wav,
  );
  await run("ffmpeg", args);
  return wav;
}

async function main() {
  const cues = loadCues();
  mkdirSync(resolve(OUT, "lines"), { recursive: true });
  writeFileSync(resolve(OUT, "captions.ass"), captionsAss(cues));
  const key = loadKey();
  const rows = [];
  for (const cue of cues) {
    const binPath = resolve(OUT, "lines", `${cue.id}.bin`);
    const wavPath = resolve(OUT, "lines", `${cue.id}.wav`);
    const duration = await synthesizeLine(key, cue.narration, binPath, wavPath);
    const slot = cue.end - cue.start;
    let fitted = wavPath;
    if (duration > slot - 0.15) {
      const tempo = Math.min(1.2, duration / Math.max(0.4, slot - 0.15));
      fitted = resolve(OUT, "lines", `${cue.id}.fit.wav`);
      await run("ffmpeg", ["-y", "-i", wavPath, "-filter:a", `atempo=${tempo.toFixed(3)}`, fitted]);
    }
    rows.push({ id: cue.id, start: cue.start, wav: fitted, duration: Number(duration.toFixed(3)) });
    console.log(`${cue.id} ${duration.toFixed(2)}s`);
  }
  const wav = await mix(cues, rows);
  writeFileSync(
    resolve(OUT, "narration.json"),
    JSON.stringify({ model: MODEL, voice: VOICE, lines: rows.map(({ id, start, duration }) => ({ id, start, duration })) }, null, 2),
  );
  console.log(wav);
}

main().catch((error) => {
  console.error(scrub(error instanceof Error ? error.message : "narration failed"));
  process.exit(1);
});
