import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assertCues, captionsAss, loadCues } from "../scripts/video-script.mjs";

const root = resolve(import.meta.dirname, "..");

function assColour(field: string): { a: number; r: number; g: number; b: number } {
  const hex = field.replace(/^&H/i, "");
  return {
    a: Number.parseInt(hex.slice(0, 2), 16),
    b: Number.parseInt(hex.slice(2, 4), 16),
    g: Number.parseInt(hex.slice(4, 6), 16),
    r: Number.parseInt(hex.slice(6, 8), 16),
  };
}

function linearChannel(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function contrastRatio(
  foreground: { r: number; g: number; b: number },
  background: { r: number; g: number; b: number },
): number {
  const luminance = (color: { r: number; g: number; b: number }) =>
    0.2126 * linearChannel(color.r) + 0.7152 * linearChannel(color.g) + 0.0722 * linearChannel(color.b);
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe("demo video script", () => {
  it("stays under 3:00 and keeps the narration lines in order", () => {
    const cues = loadCues();
    expect(cues.map((cue) => cue.id)).toEqual(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "L9"]);
    expect(cues[0].start).toBe(0);
    expect(cues[cues.length - 1].end).toBe(142.16);
    expect(cues[2].narration).toContain("The simulator speaks first");
    expect(cues[6].narration).toContain("Safety beats shopping");
    expect(cues[8].narration).toContain("Fictional sample data");
    expect(cues[8].narration).toContain("Simulated Alexa+ experience");
    const script = readFileSync(resolve(root, "docs/video-script.md"), "utf8");
    for (const id of ["A1", "G1", "G2", "G3", "B1", "B2", "C1", "C2", "C3", "D1", "D2", "E1", "E2"]) expect(script).toContain(`| ${id} |`);
    expect(script).not.toContain("no on-screen caption");
    expect(script).toContain("every one of the 22 spoken lines");
    const srt = readFileSync(resolve(root, "docs/video/hearthkeep-demo.srt"), "utf8");
    const blocks = srt.trim().split(/\n\s*\n/);
    expect(blocks).toHaveLength(22);
    const toSeconds = (stamp: string) => {
      const [h, m, rest] = stamp.split(":");
      return Number(h) * 3600 + Number(m) * 60 + Number(rest.replace(",", "."));
    };
    let previousEnd = 0;
    for (const block of blocks) {
      const [, timing, ...text] = block.split("\n");
      const [from, to] = timing.split(" --> ").map(toSeconds);
      expect(from).toBeGreaterThanOrEqual(previousEnd);
      expect(to).toBeGreaterThan(from);
      expect(to).toBeLessThanOrEqual(142.16);
      expect(text.join(" ").length).toBeGreaterThan(0);
      previousEnd = to;
    }
    for (const cue of cues) expect(srt).toContain(cue.narration);
    for (const line of script.matchAll(/^\| ([A-G][0-9]) \| [0-9.]+ \| [^|]+ \| (.+?) \|$/gm)) expect(srt).toContain(line[2]);
    const captions = captionsAss(cues);
    expect(captions).toContain("PlayResX: 1920");
    expect(captions).toContain("PlayResY: 1080");
    expect(captions).toContain("Upkeep you only notice when something beeps.");
    const style = String(captions)
      .split("\n")
      .find((line) => line.startsWith("Style: Caption,"));
    expect(style).toBeTruthy();
    const fields = style!.slice("Style: ".length).split(",");
    expect(fields[15]).toBe("3");
    expect(Number(fields[16])).toBeGreaterThanOrEqual(8);
    const primary = assColour(fields[3]);
    const outline = assColour(fields[5]);
    const back = assColour(fields[6]);
    expect(primary.a).toBe(0);
    expect(outline.a).toBe(0);
    expect(back.a).toBe(0);
    expect(contrastRatio(primary, outline)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(primary, back)).toBeGreaterThanOrEqual(4.5);
    expect(() =>
      assertCues([
        { id: "L1", start: 0, end: 10, shot: "x", narration: "y" },
        { id: "L2", start: 10, end: 180, shot: "x", narration: "y" },
      ]),
    ).toThrow(/3:00/);
  });

  it("keeps the narration script on DashScope Cherry and out of the repo secrets", () => {
    const narrate = readFileSync(resolve(root, "scripts/narrate-demo.mjs"), "utf8");
    const record = readFileSync(resolve(root, "scripts/record-demo.mjs"), "utf8");
    const assemble = readFileSync(resolve(root, "scripts/assemble-demo.mjs"), "utf8");
    expect(narrate).toContain("process.env.DASHSCOPE_API_KEY");
    expect(narrate).toContain("/etc/grok-secrets/dashscope.env");
    expect(narrate).toContain("qwen3-tts-flash");
    expect(narrate).toContain("Cherry");
    expect(narrate).not.toMatch(/sk-[A-Za-z0-9]/);
    for (const source of [narrate, record, assemble]) {
      expect(source.toLowerCase()).not.toContain("edge-tts");
    }
    const docs = ["product-feedback.md", "friction-log.md", "feature-requests.md", "devpost.md", "video-script.md"]
      .map((name) => readFileSync(resolve(root, "docs", name), "utf8"))
      .join("\n");
    expect(docs).not.toMatch(/sk-[A-Za-z0-9]{8,}/);
    expect(docs).not.toMatch(/DASHSCOPE_API_KEY=(?!$|\s*`|\s*from)/);
  });
});
