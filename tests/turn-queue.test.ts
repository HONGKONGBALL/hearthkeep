import { describe, expect, it } from "vitest";
import { acceptUtterance, isCardFrameSource, nextIntent, rememberCardWindow } from "../apps/simulator/src/turn-queue";

describe("card intents during a turn", () => {
  it("starts a turn when nothing is in flight", () => {
    expect(acceptUtterance(false, null, "Replace the hallway smoke alarm battery")).toEqual({
      pending: null,
      start: "Replace the hallway smoke alarm battery",
    });
  });

  it("parks a card tap that arrives while a turn is in flight", () => {
    expect(acceptUtterance(true, null, "  Replace the hallway smoke alarm battery  ")).toEqual({
      pending: "Replace the hallway smoke alarm battery",
      start: null,
    });
  });

  it("keeps the latest parked tap and ignores blanks", () => {
    const parked = acceptUtterance(true, null, "Book someone to clean the dryer vent next week");
    expect(acceptUtterance(true, parked.pending, "Replace the hallway smoke alarm battery")).toEqual({
      pending: "Replace the hallway smoke alarm battery",
      start: null,
    });
    expect(acceptUtterance(true, parked.pending, "   ")).toEqual({
      pending: parked.pending,
      start: null,
    });
  });

  it("reads the parked tap once", () => {
    expect(nextIntent("Replace the hallway smoke alarm battery")).toBe("Replace the hallway smoke alarm battery");
    expect(nextIntent("  ")).toBeNull();
    expect(nextIntent(null)).toBeNull();
  });
});

describe("card frame source across a reload", () => {
  const first = { id: "first-frame" };
  const second = { id: "second-frame" };
  const stranger = { id: "other-frame" };

  it("accepts the live window and the window a reload just replaced", () => {
    const noted = rememberCardWindow(null, null, first);
    expect(noted).toEqual({ live: first, previous: null });
    expect(isCardFrameSource(first, noted.live, noted.previous)).toBe(true);

    const reloaded = rememberCardWindow(noted.live, noted.previous, second);
    expect(reloaded).toEqual({ live: second, previous: first });
    expect(isCardFrameSource(second, second, reloaded.previous)).toBe(true);
    expect(isCardFrameSource(first, second, reloaded.previous)).toBe(true);
    expect(isCardFrameSource(stranger, second, reloaded.previous)).toBe(false);
    expect(isCardFrameSource(null, second, reloaded.previous)).toBe(false);
  });

  it("keeps the noted windows when the iframe has no contentWindow yet", () => {
    expect(rememberCardWindow(first, null, null)).toEqual({ live: first, previous: null });
    expect(isCardFrameSource(first, first, null)).toBe(true);
  });
});
