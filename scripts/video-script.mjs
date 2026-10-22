/**
 * Timed narration cues for the Hearthkeep demo.
 * Times are seconds. The last cue ends before the 3:00 limit.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const SCRIPT_PATH = resolve(import.meta.dirname, "../docs/video-script.md");

export function parseVideoScript(markdown) {
  const cues = [];
  for (const line of markdown.split("\n")) {
    if (!line.startsWith("| L")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 5) continue;
    const [id, start, end, shot, narration] = cells;
    cues.push({
      id,
      start: Number(start),
      end: Number(end),
      shot,
      narration,
    });
  }
  return cues;
}

export function assertCues(cues) {
  if (cues.length < 2) throw new Error("video script has no cues");
  if (cues[0].start !== 0) throw new Error("first cue must start at 0");
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index];
    if (!cue.id || !cue.narration || !cue.shot) throw new Error(`cue ${index} is incomplete`);
    if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.end <= cue.start) {
      throw new Error(`cue ${cue.id} has a bad time range`);
    }
    if (index > 0 && cue.start !== cues[index - 1].end) {
      throw new Error(`cue ${cue.id} does not follow the previous cue`);
    }
  }
  if (cues[cues.length - 1].end >= 180) throw new Error("video script is 3:00 or longer");
  return cues;
}

export function loadCues(path = SCRIPT_PATH) {
  return assertCues(parseVideoScript(readFileSync(path, "utf8")));
}

export function assTime(seconds) {
  const centiseconds = Math.round(seconds * 100);
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor((centiseconds % 360000) / 6000);
  const secs = Math.floor((centiseconds % 6000) / 100);
  const cents = centiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(cents).padStart(2, "0")}`;
}

function assText(narration) {
  return narration.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/\n/g, "\\N");
}

/** Burned-in caption track. PlayRes matches the 1080p frame. */
export function captionsAss(cues) {
  const events = cues
    .map(
      (cue) =>
        `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Caption,,0,0,0,,${assText(cue.narration)}`,
    )
    .join("\n");
  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,DejaVu Sans,40,&H00FFFFFF,&H000000FF,&H00111111,&H96000000,-1,0,0,0,100,100,0,0,3,0,0,2,80,80,36,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}
`;
}
