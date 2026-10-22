/**
 * Mux the Playwright page recording, the Cherry narration, and burned-in captions.
 * Output: /workspace/demo/amazon-demo.mp4
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadCues } from "./video-script.mjs";

const OUT = "/workspace/demo/amazon-demo.mp4";
const WORK = "/tmp/hk-video";

function run(command, args) {
  return new Promise((done, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code === 0) done({ stdout, stderr });
      else reject(new Error(`${command} exited ${code}\n${stderr.slice(-800)}`));
    });
  });
}

async function main() {
  const cues = loadCues();
  const seconds = String(cues[cues.length - 1].end);
  mkdirSync("/workspace/demo", { recursive: true });
  const recorded = resolve(WORK, "page.webm");
  const saved = "/workspace/demo/hearthkeep-page.webm";
  const video = existsSync(recorded) ? recorded : saved;
  if (!existsSync(video)) throw new Error(`missing picture: ${recorded}`);
  const audio = resolve(WORK, "narration.wav");
  const captions = resolve(WORK, "captions.ass");
  await run("ffmpeg", [
    "-y",
    "-i",
    video,
    "-i",
    audio,
    "-filter_complex",
    `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0xe7dfd2,fps=30,subtitles=${captions}:fontsdir=/usr/share/fonts[v]`,
    "-map",
    "[v]",
    "-map",
    "1:a:0",
    "-t",
    seconds,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    OUT,
  ]);
  const probe = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=codec_type,codec_name,width,height,channels",
    "-of",
    "default=noprint_wrappers=1",
    OUT,
  ]);
  process.stdout.write(probe.stdout);
  const volume = await run("ffmpeg", ["-i", OUT, "-af", "volumedetect", "-f", "null", "-"]);
  const max = volume.stderr.match(/max_volume:\s*(-?[\d.]+) dB/);
  if (!max || Number(max[1]) < -50) throw new Error("narration is not audible");
  console.log(`max_volume ${max[1]} dB`);
  console.log(OUT);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
