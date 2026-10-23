/**
 * V1: cards paint at 390 and 768 when the context is created at that size.
 * A full-page shot after a mid-run resize can record only the iframe well.
 * Each flow gets its own context. No page.setViewportSize. Fictional sample data.
 */
import { inflateSync } from "node:zlib";
import { type Page } from "@playwright/test";
import { card, childFrame, e2eShot, expect, send, startSim, test } from "./support";

const SURFACE = [255, 254, 248] as const;
/** A blank #fffef8 well measures 0. Painted cards in this suite sit well above 1000. */
const MIN_VARIANCE = 200;
const MIN_NON_SURFACE = 0.02;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Shot {
  width: number;
  height: number;
  data: Buffer;
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

/** Mean of the three channel variances, inset so the frame edge is left out. */
function cardPaint(shot: Shot, box: Box, inset = 18): { variance: number; nonSurface: number; pixels: number } {
  const x0 = Math.max(0, Math.floor(box.x) + inset);
  const y0 = Math.max(0, Math.floor(box.y) + inset);
  const x1 = Math.min(shot.width, Math.ceil(box.x + box.width) - inset);
  const y1 = Math.min(shot.height, Math.ceil(box.y + box.height) - inset);
  if (x1 - x0 < 40 || y1 - y0 < 40) throw new Error(`card crop too small ${x1 - x0}x${y1 - y0}`);
  const red: number[] = [];
  const green: number[] = [];
  const blue: number[] = [];
  let far = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * shot.width + x) * 4;
      const r = shot.data[i];
      const g = shot.data[i + 1];
      const b = shot.data[i + 2];
      red.push(r);
      green.push(g);
      blue.push(b);
      if (Math.abs(r - SURFACE[0]) > 2 || Math.abs(g - SURFACE[1]) > 2 || Math.abs(b - SURFACE[2]) > 2) far += 1;
    }
  }
  const variance = (channel: number[]): number => {
    const mean = channel.reduce((sum, value) => sum + value, 0) / channel.length;
    let total = 0;
    for (const value of channel) total += (value - mean) ** 2;
    return total / channel.length;
  };
  return {
    variance: (variance(red) + variance(green) + variance(blue)) / 3,
    nonSurface: far / red.length,
    pixels: red.length,
  };
}

async function expectCardPaints(page: Page, shotPath: string, phrases: string[]): Promise<void> {
  const frame = page.locator("iframe.card-frame");
  await expect(frame).toBeVisible();
  const body = card(page).locator("body");
  for (const phrase of phrases) await expect(body).toContainText(phrase);
  await childFrame(page).evaluate(() => document.fonts.ready);
  await frame.evaluate((node) => node.scrollIntoView({ block: "center", inline: "nearest" }));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));

  const fit = await childFrame(page).evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
    elements: document.body.querySelectorAll("*").length,
    text: (document.body.innerText || "").trim().length,
  }));
  expect(fit.scrollHeight).toBeLessThanOrEqual(fit.clientHeight);
  expect(fit.elements).toBeGreaterThan(8);
  expect(fit.text).toBeGreaterThan(80);

  const box = await frame.boundingBox();
  const view = page.viewportSize();
  expect(box, "card frame has no box").not.toBeNull();
  expect(view, "viewport is unset").not.toBeNull();
  if (!box || !view) return;
  expect(box.width).toBeGreaterThan(200);
  expect(box.height).toBeGreaterThan(120);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(view.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(view.height + 1);

  const png = await page.screenshot({ path: shotPath, scale: "css" });
  const shot = readPng(png);
  expect(shot.width).toBe(view.width);
  expect(shot.height).toBe(view.height);
  const paint = cardPaint(shot, box);
  expect(paint.pixels).toBeGreaterThan(1000);
  expect(paint.variance, `card region variance ${paint.variance.toFixed(2)}`).toBeGreaterThanOrEqual(MIN_VARIANCE);
  expect(paint.nonSurface, `non-surface fraction ${paint.nonSurface.toFixed(4)}`).toBeGreaterThanOrEqual(MIN_NON_SURFACE);
}

async function nextMorning(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Next morning" }).click();
  await expect(page.locator("#say")).toBeEnabled({ timeout: 20000 });
}

const FLOWS: Array<{ id: string; phrases: string[]; run: (page: Page) => Promise<void> }> = [
  {
    id: "f1",
    phrases: ["Needs attention", "Dryer vent cleaning, 21 days overdue", "Fridge water filter, due today"],
    run: async (page) => {
      await startSim(page);
    },
  },
  {
    id: "f3",
    phrases: ["Swap hallway smoke alarm battery", "Hallway smoke alarm", "Mark done"],
    run: async (page) => {
      await startSim(page);
      await send(page, "The hallway smoke alarm keeps chirping");
    },
  },
  {
    id: "f5",
    phrases: ["Rillstone CX-28 (Shipped)", "Dryer vent cleaning (Tue, Oct 27)", "Install fridge water filter"],
    run: async (page) => {
      await startSim(page);
      await send(page, "Order a new filter for the fridge");
      await send(page, "Yes, the CX-28");
      await send(page, "2468");
      await send(page, "Book someone to clean the dryer vent next week");
      await send(page, "Tuesday morning");
      await send(page, "Approve 2468");
      await nextMorning(page);
    },
  },
];

for (const size of [
  { width: 390, height: 800 },
  { width: 768, height: 1024 },
] as const) {
  test.describe(`V1 fresh ${size.width} context`, () => {
    test.use({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    });
    for (const flow of FLOWS) {
      test(`V1 ${flow.id} card paints at ${size.width}`, async ({ page }) => {
        const actual = page.viewportSize();
        expect(actual?.width).toBe(size.width);
        expect(actual?.height).toBe(size.height);
        await flow.run(page);
        await expectCardPaints(page, e2eShot(`v1-${size.width}-${flow.id}.png`), flow.phrases);
      });
    }
  });
}
