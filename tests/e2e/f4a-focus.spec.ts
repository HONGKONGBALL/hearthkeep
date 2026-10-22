/**
 * P-06 focus rings on the dark top-bar controls and the Retry button.
 * Screenshots land in docs/screens/rc2/. Contrast numbers land in docs/evidence/rc2/.
 * Household names in the sim are fictional.
 */
import { inflateSync } from "node:zlib";
import { appendFileSync, writeFileSync } from "node:fs";
import { MCP_URL, readPids, startMcp, waitForDown, waitForOk, writePids } from "./servers";
import { expect, send, startSim, test } from "./support";
import type { Locator, Page } from "@playwright/test";

const LIGHT: RGB = [246, 241, 232];
const DARK: RGB = [28, 25, 23];
const BANNER: RGB = [127, 29, 29];
const CONTRAST_LOG = "docs/evidence/rc2/f4a-focus-contrast.txt";

const HEADER = [
  "New session",
  "Next morning",
  "Reset demo",
  "Trace",
  "Data",
  "Cards",
  "Voice",
  "About",
] as const;

type RGB = [number, number, number];

interface Shot {
  width: number;
  height: number;
  data: Buffer;
}

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function contrast(a: RGB, b: RGB): number {
  const l1 = 0.2126 * channel(a[0]) + 0.7152 * channel(a[1]) + 0.0722 * channel(a[2]);
  const l2 = 0.2126 * channel(b[0]) + 0.7152 * channel(b[1]) + 0.0722 * channel(b[2]);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

function dist(a: RGB, b: RGB): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

function fmt(rgb: RGB): string {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function readPng(buf: Buffer): Shot {
  if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("not a png");
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) throw new Error(`unsupported png depth ${data[8]} interlace ${data[12]}`);
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (colorType !== 2 && colorType !== 6) throw new Error(`unsupported png color ${colorType}`);
  const channels = colorType === 6 ? 4 : 3;
  const inflated = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  let src = 0;
  let prev = Buffer.alloc(stride);
  const paeth = (left: number, up: number, upLeft: number): number => {
    const p = left + up - upLeft;
    const pa = Math.abs(p - left);
    const pb = Math.abs(p - up);
    const pc = Math.abs(p - upLeft);
    if (pa <= pb && pa <= pc) return left;
    if (pb <= pc) return up;
    return upLeft;
  };
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[src];
    src += 1;
    const row = Buffer.from(inflated.subarray(src, src + stride));
    src += stride;
    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? row[i - channels] : 0;
      const up = prev[i];
      const upLeft = i >= channels ? prev[i - channels] : 0;
      if (filter === 1) row[i] = (row[i] + left) & 255;
      else if (filter === 2) row[i] = (row[i] + up) & 255;
      else if (filter === 3) row[i] = (row[i] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[i] = (row[i] + paeth(left, up, upLeft)) & 255;
      else if (filter !== 0) throw new Error(`png filter ${filter}`);
    }
    prev = row;
    for (let x = 0; x < width; x += 1) {
      const s = x * channels;
      const d = (y * width + x) * 4;
      out[d] = row[s];
      out[d + 1] = row[s + 1];
      out[d + 2] = row[s + 2];
      out[d + 3] = channels === 4 ? row[s + 3] : 255;
    }
  }
  return { width, height, data: out };
}

function pixel(shot: Shot, x: number, y: number): RGB {
  const cx = Math.min(shot.width - 1, Math.max(0, x));
  const cy = Math.min(shot.height - 1, Math.max(0, y));
  const i = (cy * shot.width + cx) * 4;
  return [shot.data[i], shot.data[i + 1], shot.data[i + 2]];
}

interface Run {
  color: RGB;
  start: number;
  end: number;
}

interface Bands {
  fill: RGB;
  inner: RGB;
  outer: RGB;
  outside: RGB;
}

function runsOf(column: RGB[]): Run[] {
  const found: Run[] = [];
  let start = 0;
  for (let y = 1; y <= column.length; y += 1) {
    if (y !== column.length && dist(column[y], column[y - 1]) <= 18) continue;
    if (y - start >= 2) {
      const slice = column.slice(start, y);
      const mid = slice[Math.floor(slice.length / 2)];
      found.push({ color: mid, start, end: y - 1 });
    }
    start = y;
  }
  return found;
}

/** Outer ring, then inner ring, then the control, reading from the top of the shot. */
function measureRings(shot: Shot, x: number, outerTarget: RGB, innerTarget: RGB): Bands {
  const column: RGB[] = [];
  for (let y = 0; y < shot.height; y += 1) column.push(pixel(shot, x, y));
  const found = runsOf(column);
  for (let i = 0; i < found.length - 3; i += 1) {
    const outside = found[i];
    const outer = found[i + 1];
    const inner = found[i + 2];
    const fill = found[i + 3];
    if (dist(outer.color, outerTarget) > 16 || dist(inner.color, innerTarget) > 16) continue;
    return {
      outside: column[outside.end],
      outer: column[outer.end],
      inner: column[inner.end],
      fill: column[fill.start],
    };
  }
  const dump = found.map((run) => `${run.start}-${run.end} ${fmt(run.color)}`).join("; ");
  throw new Error(`ring bands not found at x=${x}. Runs: ${dump}`);
}

function expectAtLeast3(label: string, a: RGB, b: RGB): number {
  const ratio = contrast(a, b);
  expect(ratio, `${label}: ${fmt(a)} vs ${fmt(b)} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3);
  return ratio;
}

async function blurPage(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

async function focusStyle(locator: Locator): Promise<{
  outlineColor: string;
  outlineStyle: string;
  outlineWidth: string;
  boxShadow: string;
  backgroundColor: string;
}> {
  return locator.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
      backgroundColor: style.backgroundColor,
    };
  });
}

function assertLightOutline(style: { outlineColor: string; outlineStyle: string; outlineWidth: string }, name: string): void {
  expect(style.outlineStyle, name).toBe("solid");
  expect(style.outlineWidth, name).toBe("3px");
  expect(["rgb(246, 241, 232)", "rgba(246, 241, 232, 1)"], name).toContain(style.outlineColor);
}

async function shoot(page: Page, locator: Locator, file: string): Promise<{ shot: Shot; x: number; scale: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`no box for ${file}`);
  const viewport = page.viewportSize() ?? { width: 1280, height: 800 };
  const pad = 24;
  const x = Math.max(0, Math.floor(box.x) - pad);
  const y = Math.max(0, Math.floor(box.y) - pad);
  const right = Math.min(viewport.width, Math.ceil(box.x + box.width) + pad);
  const bottom = Math.min(viewport.height, Math.ceil(box.y + box.height) + pad);
  const clip = { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
  const buf = await page.screenshot({ clip, path: file });
  const shot = readPng(buf);
  const scale = shot.width / clip.width;
  return {
    shot,
    x: Math.round((box.x - clip.x + box.width / 2) * scale),
    scale,
  };
}

test("P-06 top bar focus rings are light and clear 3:1", async ({ page }) => {
  writeFileSync(CONTRAST_LOG, "P-06 focus contrast (WCAG relative luminance). Fictional demo.\n");
  await startSim(page);
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".brand").click();

  for (const name of HEADER) {
    const button = page.getByRole("button", { name, exact: true });
    await page.keyboard.press("Tab");
    await expect(button).toBeFocused();
    const style = await focusStyle(button);
    assertLightOutline(style, name);
    expect(style.boxShadow, name).toContain("rgb(28, 25, 23)");
    expect(style.boxShadow, name).toContain("rgb(246, 241, 232)");
    const slug = name.toLowerCase().replace(/\s+/g, "-");
    const { shot, x } = await shoot(page, button, `docs/screens/rc2/f4a-focus-${slug}.png`);
    const bands = measureRings(shot, x, DARK, LIGHT);
    const fillRatio = expectAtLeast3(`${name} light ring vs fill`, bands.inner, bands.fill);
    const ringRatio = expectAtLeast3(`${name} light ring vs dark ring`, bands.inner, bands.outer);
    const pageRatio = expectAtLeast3(`${name} dark ring vs page`, bands.outer, bands.outside);
    appendFileSync(
      CONTRAST_LOG,
      `${name}: outline ${style.outlineColor}; fill ${fmt(bands.fill)} ${fillRatio.toFixed(2)}; rings ${ringRatio.toFixed(2)}; page ${fmt(bands.outside)} ${pageRatio.toFixed(2)}\n`,
    );
  }

  for (let step = 0; step < 4; step += 1) await page.keyboard.press("Shift+Tab");
  const trace = page.getByRole("button", { name: "Trace", exact: true });
  await expect(trace).toBeFocused();
  await page.keyboard.press("Space");
  await expect(trace).toBeFocused();
  await expect(trace).toHaveAttribute("aria-pressed", "true");
  const pressed = await focusStyle(trace);
  assertLightOutline(pressed, "Trace pressed");
  expect(pressed.backgroundColor).toBe("rgb(124, 45, 18)");
  expect(pressed.outlineColor).not.toBe(pressed.backgroundColor);
  const pressedShot = await shoot(page, trace, "docs/screens/rc2/f4a-focus-trace-pressed.png");
  const pressedBands = measureRings(pressedShot.shot, pressedShot.x, DARK, LIGHT);
  const pressedRatio = expectAtLeast3("Trace pressed light ring vs fill", pressedBands.inner, pressedBands.fill);
  expectAtLeast3("Trace pressed light ring vs dark ring", pressedBands.inner, pressedBands.outer);
  expectAtLeast3("Trace pressed dark ring vs page", pressedBands.outer, pressedBands.outside);
  appendFileSync(
    CONTRAST_LOG,
    `Trace pressed: fill ${pressed.backgroundColor} vs outline ${pressed.outlineColor}; rendered ${fmt(pressedBands.fill)} vs ${fmt(pressedBands.inner)} ${pressedRatio.toFixed(2)}\n`,
  );

  const say = page.locator("#say");
  for (let step = 0; step < 20; step += 1) {
    if (await say.evaluate((el) => el === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(say).toBeFocused();
  const field = await focusStyle(say);
  expect(field.outlineColor).toBe("rgb(29, 78, 216)");
  appendFileSync(CONTRAST_LOG, `Say field outline ${field.outlineColor}\n`);
});

test("P-06 Retry focus ring is light on the banner and clears 3:1", async ({ page }) => {
  await startSim(page);
  const pids = readPids();
  let killed = false;
  try {
    try {
      process.kill(-pids.mcp, "SIGTERM");
    } catch {
      process.kill(pids.mcp, "SIGTERM");
    }
    killed = true;
    await waitForDown(`${MCP_URL}/healthz`);
    await send(page, "What needs doing?");
    await expect(page.getByRole("alert")).toContainText("Can't reach the home server");
    await page.evaluate(() => document.fonts.ready);
    await blurPage(page);

    const seen: string[] = [];
    const retry = page.getByRole("button", { name: "Retry" });
    for (let step = 0; step < 12; step += 1) {
      await page.keyboard.press("Tab");
      const name = await page.evaluate(() =>
        document.activeElement instanceof HTMLElement ? document.activeElement.innerText.trim() : "",
      );
      seen.push(name);
      if (name === "Retry") break;
    }
    expect(seen).toEqual([...HEADER, "Retry"]);
    await expect(retry).toBeFocused();
    const style = await focusStyle(retry);
    assertLightOutline(style, "Retry");
    expect(style.boxShadow, "Retry").toContain("rgb(28, 25, 23)");
    expect(style.backgroundColor).toBe("rgb(255, 255, 255)");
    const { shot, x } = await shoot(page, retry, "docs/screens/rc2/f4a-focus-retry.png");
    const bands = measureRings(shot, x, LIGHT, DARK);
    const fillRatio = expectAtLeast3("Retry dark ring vs button", bands.inner, bands.fill);
    const ringRatio = expectAtLeast3("Retry light ring vs dark ring", bands.outer, bands.inner);
    const bannerRatio = expectAtLeast3("Retry light ring vs banner", bands.outer, bands.outside);
    expect(dist(bands.outside, BANNER), `banner sample ${fmt(bands.outside)}`).toBeLessThanOrEqual(40);
    appendFileSync(
      CONTRAST_LOG,
      `Retry: outline ${style.outlineColor}; button ${fmt(bands.fill)} ${fillRatio.toFixed(2)}; rings ${ringRatio.toFixed(2)}; banner ${fmt(bands.outside)} ${bannerRatio.toFixed(2)}\n`,
    );
  } finally {
    if (killed) {
      const mcp = startMcp();
      writePids({ ...pids, mcp });
      await waitForOk(`${MCP_URL}/healthz`);
    }
  }
});
