/**
 * QA section G, plus shipped P1 voice. Playwright in Chrome at 1280x800.
 * Names, prices, and the purchase code are fictional sample data.
 */
import { readPids, startMcp, waitForDown, waitForOk, writePids, MCP_URL } from "./servers";
import {
  card,
  expect,
  expectNoSeriousAxe,
  focusSay,
  latestReply,
  openData,
  send,
  sendKeys,
  startSim,
  test,
} from "./support";

test("64 launch shows the simulation ribbon and the morning briefing", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Start" })).toBeFocused();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.locator(".ribbon")).toHaveText("SIMULATION — not a real Alexa+ device");
  await expect(page.locator(".top")).toContainText("Wed, Oct 21, 2026 · 9:00 AM");
  await expect(page.locator(".top")).toContainText("2025-11-25");
  await expect(page.locator(".badge")).toHaveText("Deterministic (offline)");
  await expect(page.locator(".identity .meta").first()).toHaveText(/^Session [0-9a-f]{8}$/i);
  await expect(page.locator(".transcript .assistant").last()).toContainText(/dryer vent/i, { timeout: 3000 });
  const reply = (await latestReply(page)).toLowerCase();
  expect(reply).toContain("dryer vent");
  expect(reply).toContain("overdue");
  expect(reply).toContain("fridge water filter");
  expect(reply).toContain("due today");
  await expect(page.locator("iframe.card-frame")).toBeVisible();
  await expect(card(page).locator("body")).toContainText("Needs attention");
});

test("65 exact-fit purchase shows options, checkout, and a mock receipt", async ({ page }) => {
  await startSim(page);
  const offered = await send(page, "Order a new filter for the fridge");
  expect(offered).toContain("Ferngate FG-28");
  expect(offered).toContain("Rillstone CX-28");
  expect(offered).toContain("$24.99");
  expect(offered.toLowerCase()).toContain("friday");
  await expect(card(page).locator("body")).toContainText("Rillstone CX-28");

  const priced = await send(page, "Yes, the CX-28");
  expect(priced).toContain("$24.99");
  expect(priced).toContain("October 23");
  expect(priced.toLowerCase()).toContain("purchase code");
  const checkout = card(page).locator("body");
  await expect(checkout).toContainText("Total $24.99");
  await expect(checkout).toContainText("Arrives Fri, Oct 23");
  await expect(checkout).toContainText("Within your $60 limit");
  await expect(checkout).toContainText("Say your purchase code");

  await send(page, "2468");
  await expect(page.locator(".transcript .user").last()).toHaveText("••••");
  await expect(page.locator(".transcript")).not.toContainText("2468");
  const done = await latestReply(page);
  expect(done.toLowerCase()).toContain("ordered");
  const receipt = card(page).locator("body");
  await expect(receipt).toContainText("ord_0001");
  await expect(receipt.locator(".step.active")).toHaveText("Placed");
  await expect(receipt).toContainText("Mock order, no real purchase or payment");

  await openData(page, "Orders and bookings");
  const orders = page.getByRole("complementary", { name: "Data" }).locator("table").first().locator("tbody tr");
  await expect(orders).toHaveCount(1);
  await expect(orders.first()).toContainText("placed");
  await expect(page.getByRole("complementary", { name: "Data" }).locator("input, textarea, select")).toHaveCount(0);

  await openData(page, "Tasks");
  const task = page.getByRole("complementary", { name: "Data" }).locator("tbody tr", { hasText: "Install fridge water filter" });
  await expect(task).toContainText("Fri, Oct 23");
});

test("66 a wrong code leaves two tries and no receipt", async ({ page }) => {
  await startSim(page);
  await send(page, "Order a new filter for the fridge");
  await send(page, "Yes, the CX-28");
  const reply = await send(page, "1111");
  expect(reply.toLowerCase()).toContain("didn't match");
  expect(reply.toLowerCase()).toContain("2 tries left");
  await expect(page.locator(".transcript .user").last()).toHaveText("••••");
  await expect(page.locator("iframe.card-frame")).toHaveCount(0);
  await expect(page.locator(".transcript")).not.toContainText("ord_0001");
});

test("67 a chirping hallway alarm uses the battery on the shelf", async ({ page }) => {
  await startSim(page);
  const first = await send(page, "The hallway smoke alarm keeps chirping");
  expect(first.toLowerCase()).toContain("low battery");
  expect(first.toLowerCase()).toContain("two 9-volt");
  expect(first.toLowerCase()).toContain("garage shelf");
  expect(first.toLowerCase()).toContain("nothing to buy");
  await expect(card(page).locator("body")).toContainText("Hallway smoke alarm");
  await page.getByRole("button", { name: "Trace", exact: true }).click();
  const turn = page.getByRole("complementary", { name: "Trace" }).locator("article").last();
  await expect(turn).toContainText("diagnose_symptom");
  await expect(turn).toContainText("find_parts");
  await expect(turn).toContainText("create_task");
  await expect(turn).not.toContainText("prepare_checkout");

  const second = await send(page, "Done, I swapped it");
  expect(second).toContain("One 9-volt left");
  expect(second).toContain("October 2027");
  await openData(page, "Inventory");
  const battery = page.getByRole("complementary", { name: "Data" }).locator("tbody tr", { hasText: "9V" });
  await expect(battery).toContainText("1");
});

test("68 booking over the cap needs approve before it is saved", async ({ page }) => {
  await startSim(page);
  await send(page, "Book someone to clean the dryer vent next week");
  const tiles = card(page).locator("[data-tile]");
  await expect(tiles).toHaveCount(3);
  await expect(tiles.nth(0)).toContainText("Tue, Oct 27");
  await expect(tiles.nth(0)).toContainText("9-11 AM");
  await expect(tiles.nth(0)).toContainText("Ventora Home Care");
  await expect(tiles.nth(0)).toContainText("$89");
  await expect(tiles.nth(0)).toContainText("Over $60 limit");
  await expect(tiles.nth(1)).toContainText("Wed, Oct 28");
  await expect(tiles.nth(1)).toContainText("1-3 PM");
  await expect(tiles.nth(1)).toContainText("Flueline Services");
  await expect(tiles.nth(1)).toContainText("$109");
  await expect(tiles.nth(1)).toContainText("Over $60 limit");
  await expect(tiles.nth(2)).toContainText("Sat, Oct 31");
  await expect(tiles.nth(2)).toContainText("10 AM-12 PM");
  await expect(tiles.nth(2)).toContainText("Ventora Home Care");
  await expect(tiles.nth(2)).toContainText("$99");
  await expect(tiles.nth(2)).toContainText("Over $60 limit");

  await send(page, "Tuesday morning");
  const checkout = card(page).locator("body");
  await expect(checkout).toContainText("Over your $60 limit by $29.00");

  const held = await send(page, "2468");
  expect(held.toLowerCase()).toContain("approve");
  await openData(page, "Orders and bookings");
  const bookings = page.getByRole("complementary", { name: "Data" }).locator("table").nth(1).locator("tbody tr");
  await expect(bookings).toHaveCount(0);

  const booked = await send(page, "Approve 2468");
  expect(booked.toLowerCase()).toContain("booked");
  const receipt = card(page).locator("body");
  await expect(receipt).toContainText("Booked");
  await expect(receipt).toContainText("Tue, Oct 27, 9-11 AM");
  await expect(bookings).toHaveCount(1);
});

test("69 next morning ships the filter and keeps the Tuesday booking", async ({ page }) => {
  await startSim(page);
  await send(page, "Order a new filter for the fridge");
  await send(page, "Yes, the CX-28");
  await send(page, "2468");
  await send(page, "Book someone to clean the dryer vent next week");
  await send(page, "Tuesday morning");
  await send(page, "Approve 2468");
  const session = await page.locator(".identity .meta").first().innerText();
  await page.getByRole("button", { name: "Next morning" }).click();
  await expect(page.locator(".top")).toContainText("Thu, Oct 22, 2026 · 9:00 AM");
  await expect(page.locator(".identity .meta").first()).not.toHaveText(session);
  await expect(page.locator(".transcript .assistant").last()).toContainText(/shipped/i);
  await expect(page.locator("#say")).toBeEnabled();
  const reply = (await latestReply(page)).toLowerCase();
  expect(reply).toContain("shipped");
  expect(reply).toContain("tomorrow");
  expect(reply).toContain("booked");
  expect(reply).toContain("tuesday");
  const status = card(page).locator("body");
  await expect(status).toContainText("Rillstone CX-28 (Shipped)");
  await expect(status).toContainText("Dryer vent cleaning (Tue, Oct 27)");
  await page.getByRole("button", { name: "Trace", exact: true }).click();
  const trace = page.getByRole("complementary", { name: "Trace" });
  await expect(trace).toContainText("DELETE 200");
  await expect(trace).toContainText("initialize 200");
});

test("70 a new water heater is remembered in the next session", async ({ page }) => {
  await startSim(page);
  const added = await send(page, "I just installed a new water heater, a Brimwell WH-40, in the garage");
  expect(added).toContain("Brimwell WH-40");
  expect(added).toContain("October 2027");
  const beforeSession = await page.locator(".transcript").innerText();
  await page.getByRole("button", { name: "New session" }).click();
  await expect.poll(async () => page.locator(".transcript").innerText()).not.toBe(beforeSession);
  await expect(page.locator("#say")).toBeEnabled();
  const recalled = await send(page, "When is the water heater due?");
  expect(recalled.toLowerCase()).toContain("flush");
  expect(recalled).toContain("October 2027");
});

test("71 gas smell stops before any tool call", async ({ page }) => {
  await startSim(page);
  const reply = await send(page, "I smell gas in the kitchen");
  expect(reply.toLowerCase()).toContain("leave");
  expect(reply.toLowerCase()).toContain("emergency number");
  await expect(page.getByRole("alert")).toContainText(/leave/i);
  await expect(page.locator("iframe.card-frame")).toHaveCount(0);
  await page.getByRole("button", { name: "Trace", exact: true }).click();
  const turn = page.getByRole("complementary", { name: "Trace" }).locator("article").last();
  await expect(turn).toContainText("Hazard guard");
  await expect(turn).not.toContainText("tools/call");
});

test("72 smoke alarms are clarified, and a continuous alarm is a hazard", async ({ page }) => {
  await startSim(page);
  const first = await send(page, "The smoke alarm is beeping");
  expect(first.toLowerCase()).toContain("chirp");
  expect(first.toLowerCase()).toContain("keeps sounding");
  const second = await send(page, "Just a chirp");
  expect(second.toLowerCase()).toContain("hallway");
  expect(second.toLowerCase()).toContain("main bedroom");
  const third = await send(page, "Bedroom");
  expect(third.toLowerCase()).toContain("low battery");
  await expect(card(page).locator("body")).toContainText(/bedroom/i);

  await page.evaluate(() => localStorage.removeItem("hearthkeep.welcome.dismissed"));
  const { resetSim } = await import("./servers");
  await resetSim();
  await page.reload();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.locator(".transcript .assistant").last()).toContainText(/dryer vent/i);
  await send(page, "The smoke alarm is beeping");
  const hazard = await send(page, "It keeps sounding");
  expect(hazard.toLowerCase()).toContain("leave");
  expect(hazard.toLowerCase()).toContain("emergency");
  await page.getByRole("button", { name: "Trace", exact: true }).click();
  const turn = page.getByRole("complementary", { name: "Trace" }).locator("article").last();
  await expect(turn).not.toContainText("tools/call");
});

test("73 weather is out of scope and cancel drops the quote", async ({ page }) => {
  await startSim(page);
  const weather = await send(page, "What's the weather?");
  expect(weather.toLowerCase()).toContain("home upkeep");
  await page.getByRole("button", { name: "Trace", exact: true }).click();
  const scope = page.getByRole("complementary", { name: "Trace" }).locator("article").last();
  await expect(scope).not.toContainText("tools/call");

  await send(page, "Order a new filter for the fridge");
  await send(page, "Yes, the CX-28");
  const cancelled = await send(page, "Cancel");
  expect(cancelled).toContain("Okay, I won't order it.");
  await openData(page, "Orders and bookings");
  await expect(page.getByRole("complementary", { name: "Data" }).locator("table").first().locator("tbody tr")).toHaveCount(0);

  const later = await send(page, "2468");
  expect(later.toLowerCase()).toContain("nothing waiting for a code");
  await expect(page.locator(".transcript .user").last()).toHaveText("••••");
});

test("74 a stopped server shows Retry and the transcript survives", async ({ page }) => {
  await startSim(page);
  const earlier = await latestReply(page);
  const pids = readPids();
  try {
    process.kill(-pids.mcp, "SIGTERM");
  } catch {
    process.kill(pids.mcp, "SIGTERM");
  }
  await waitForDown(`${MCP_URL}/healthz`);
  await send(page, "What needs doing?");
  await expect(page.getByRole("alert")).toContainText("Can't reach the home server");
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();

  const mcp = startMcp();
  writePids({ ...pids, mcp });
  await waitForOk(`${MCP_URL}/healthz`);
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.locator("#say")).toBeEnabled({ timeout: 20000 });
  await expect(page.locator(".transcript")).toContainText(earlier);
  await expect(page.locator(".transcript .assistant").last()).toContainText(/dryer vent/i);
  await page.getByRole("button", { name: "Trace", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Trace" })).toContainText("initialize 200");
});

test("75 the trace redacts the purchase code", async ({ page }) => {
  await startSim(page);
  await send(page, "Order a new filter for the fridge");
  await send(page, "Yes, the CX-28");
  await send(page, "2468");
  await page.getByRole("button", { name: "Trace", exact: true }).click();
  const row = page.getByRole("complementary", { name: "Trace" }).locator("li", { hasText: "confirm_purchase" });
  await expect(row).toContainText("tools/call");
  await expect(row).toContainText("HTTP 200");
  await expect(row).toContainText(/ms/);
  await expect(row).toContainText("2025-11-25");
  await expect(row).toContainText(/[0-9a-f]{8}/i);
  await row.getByRole("button", { name: "Raw JSON" }).click();
  const raw = await row.locator("pre").innerText();
  expect(raw).toContain("request");
  expect(raw).toContain("response");
  expect(raw).toContain("••••");
  expect(raw).not.toContain("2468");
  await expect(page.getByRole("complementary", { name: "Trace" })).not.toContainText("2468");
});

test("76 keyboard purchase and axe scans stay clean with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Start" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".transcript")).toHaveAttribute("aria-live", "polite");
  await expect(page.locator(".transcript .assistant").last()).toContainText(/dryer vent/i);
  await expectNoSeriousAxe(page);

  await sendKeys(page, "Order a new filter for the fridge");
  await expect(card(page).locator("body")).toContainText("Rillstone CX-28");
  await expectNoSeriousAxe(page);

  await sendKeys(page, "Yes, the CX-28");
  await expect(card(page).locator("body")).toContainText("Within your $60 limit");
  await expectNoSeriousAxe(page);

  await sendKeys(page, "2468");
  await expect(card(page).locator("body")).toContainText("ord_0001");
  await expectNoSeriousAxe(page);

  const input = page.locator("#say");
  await focusSay(page);
  await page.keyboard.type("What needs doing?");
  const animation = page.waitForFunction(() => {
    const node = document.querySelector(".assistant.speaking");
    if (!node) return "";
    return getComputedStyle(node).animationName;
  });
  await page.keyboard.press("Enter");
  const animationName = await (await animation).jsonValue();
  expect(animationName).toBe("none");
  await expect(input).toBeEnabled();

  await sendKeys(page, "The hallway smoke alarm keeps chirping");
  await expect(card(page).locator("body")).toContainText("Hallway smoke alarm");
  await expectNoSeriousAxe(page);
});

test("83 voice speaks once when it is on", async ({ page }) => {
  await page.addInitScript(() => {
    const spoken: string[] = [];
    (window as unknown as { __hkSpoken: string[] }).__hkSpoken = spoken;
    const synth = {
      cancel() {},
      speak(utterance: { text?: string }) {
        spoken.push(String(utterance.text ?? ""));
      },
      getVoices() {
        return [];
      },
      pause() {},
      resume() {},
      pending: false,
      speaking: false,
      paused: false,
      addEventListener() {},
      removeEventListener() {},
    };
    Object.defineProperty(window, "speechSynthesis", { configurable: true, get: () => synth });
  });
  await startSim(page);
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await send(page, "What needs doing?");
  const spokenOn = await page.evaluate(() => (window as unknown as { __hkSpoken: string[] }).__hkSpoken);
  expect(spokenOn).toHaveLength(1);
  expect(spokenOn[0]?.toLowerCase()).toContain("dryer vent");
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await send(page, "What needs doing?");
  const spokenOff = await page.evaluate(() => (window as unknown as { __hkSpoken: string[] }).__hkSpoken);
  expect(spokenOff).toHaveLength(1);
});
