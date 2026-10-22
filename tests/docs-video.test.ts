import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assertCues, captionsAss, loadCues } from "../scripts/video-script.mjs";

const root = resolve(import.meta.dirname, "..");

describe("demo video script", () => {
  it("stays under 3:00 and keeps the narration lines in order", () => {
    const cues = loadCues();
    expect(cues.map((cue) => cue.id)).toEqual(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "L9"]);
    expect(cues[0].start).toBe(0);
    expect(cues[cues.length - 1].end).toBe(170);
    expect(cues[2].narration).toContain("speaks first, from memory");
    expect(cues[6].narration).toContain("Safety beats shopping");
    expect(cues[8].narration).toContain("Fictional sample data");
    expect(cues[8].narration).toContain("Simulated Alexa+ experience");
    const captions = captionsAss(cues);
    expect(captions).toContain("PlayResX: 1920");
    expect(captions).toContain("PlayResY: 1080");
    expect(captions).toContain("Upkeep you only notice when something beeps.");
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
