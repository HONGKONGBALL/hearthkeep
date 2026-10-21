import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ClockError,
  DEFAULT_SIM_START,
  SeedError,
  defaultSeedDir,
  loadSeed,
  openRepository,
  openRepositoryFromEnv,
  resolveDbPath,
  resolveSimStart,
  type Repository,
} from "@hearthkeep/core";

const CHIPS = [
  "What needs doing?",
  "Order a new filter for the fridge",
  "Yes, the CX-28",
  "Say purchase code (demo)",
  "The hallway smoke alarm keeps chirping",
  "Done, I swapped it",
  "Book someone to clean the dryer vent next week",
  "Tuesday morning",
  "Approve with code (demo)",
  "I just installed a new water heater, a Brimwell WH-40, in the garage",
  "When is the water heater due?",
  "I smell gas in the kitchen",
];

const open: Repository[] = [];
const tempDirs: string[] = [];

function memoryRepo(simStart?: string): Repository {
  const repo = openRepository(simStart === undefined ? { path: ":memory:" } : { path: ":memory:", simStart });
  open.push(repo);
  return repo;
}

afterEach(() => {
  for (const repo of open.splice(0)) repo.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("seed v1 files", () => {
  const dir = defaultSeedDir();

  it("puts a fictional-data notice first in every JSON file", () => {
    const files = readdirSync(dir).filter((name) => name.endsWith(".json")).sort();
    expect(files).toEqual([
      "appliances.json",
      "chips.json",
      "household.json",
      "inventory.json",
      "parts.json",
      "service-slots.json",
      "symptoms.json",
    ]);
    for (const name of files) {
      const parsed = JSON.parse(readFileSync(join(dir, name), "utf8")) as Record<string, unknown>;
      expect(Object.keys(parsed)[0]).toBe("fictionalDataNotice");
      expect(parsed.fictionalDataNotice).toEqual(expect.stringContaining("Fictional data."));
      expect(parsed.seed).toBe("v1");
    }
  });

  it("matches the sample household, appliances, catalog, stock, parts, symptoms, slots, and chips", () => {
    const seed = loadSeed(dir);
    expect(seed.simClockStart).toBe(DEFAULT_SIM_START);
    expect(seed.household).toEqual({
      name: "Demo Household (fictional)",
      member: "Sam (fictional)",
      timezone: "America/Los_Angeles",
      currency: "USD",
    });
    expect(seed.preferences).toEqual({
      spendCapUsd: "60.00",
      partPolicy: "oem_or_certified",
      selection: "cheapest_then_earliest",
      purchaseCodeRequired: true,
      comingUpWindowDays: 14,
      quoteLifetimeSimMinutes: 15,
      codeAttemptsPerQuote: 3,
    });
    expect(seed.demoPurchaseCode).toBe("2468");
    expect(seed.unknownModelSchedule).toBeNull();
    expect(seed.unknownModelNote).toMatch(/no schedule/i);

    const byId = Object.fromEntries(seed.appliances.map((row) => [row.id, row]));
    expect(byId.ap_fridge?.schedule).toMatchObject({
      item: "water_filter",
      how: "part",
      everyDays: 180,
      lastDone: "2026-04-24",
      nextDue: "2026-10-21",
    });
    expect(byId.ap_fridge?.stateOnSeedDate).toBe("due today");
    expect(byId.ap_furnace?.schedule.nextDue).toBe("2026-10-30");
    expect(byId.ap_furnace?.schedule.maxMerv).toBe(11);
    expect(byId.ap_furnace?.stateOnSeedDate).toBe("coming up, 9 d");
    expect(byId.ap_smoke_hall?.schedule).toMatchObject({ item: "battery", spec: "9V", nextDue: "2026-10-28" });
    expect(byId.ap_smoke_hall?.stateOnSeedDate).toBe("coming up, 7 d");
    expect(byId.ap_smoke_bed?.schedule.nextDue).toBe("2027-03-15");
    expect(byId.ap_smoke_bed?.stateOnSeedDate).toBe("later");
    expect(byId.ap_dryer?.schedule).toMatchObject({
      item: "vent_cleaning",
      how: "pro",
      lastDone: "2025-09-30",
      nextDue: "2026-09-30",
    });
    expect(byId.ap_dryer?.stateOnSeedDate).toBe("21 d overdue");
    expect(byId.ap_porch?.schedule).toMatchObject({
      item: "bulb",
      trigger: "on_failure",
      everyDays: null,
      lastDone: null,
      nextDue: null,
      spec: "A19 LED 2700K 800 lm",
    });
    expect(byId.ap_porch?.stateOnSeedDate).toBeNull();

    const heater = seed.catalogModels.find((model) => model.model === "WH-40");
    expect(heater).toMatchObject({
      maker: "Brimwell",
      product: "water heater",
      catalogOnly: true,
      schedule: { item: "flush", how: "maintenance", everyDays: 365, trigger: "interval" },
    });
    expect(seed.appliances.some((row) => row.model === "WH-40")).toBe(false);

    expect(seed.inventory).toEqual([
      {
        id: "inv_9v",
        item: "battery",
        name: "9V battery",
        spec: "9V",
        qty: 2,
        location: "Garage shelf",
        receivedNotInstalled: 0,
      },
      {
        id: "inv_a19",
        item: "bulb",
        name: "A19 LED bulb 2700K 800 lm",
        spec: "A19 LED 2700K 800 lm",
        qty: 1,
        location: "Kitchen drawer",
        receivedNotInstalled: 0,
      },
    ]);

    const parts = Object.fromEntries(seed.parts.map((row) => [row.id, row]));
    expect(parts["P-CX28"]).toMatchObject({
      priceUsd: "24.99",
      kind: "compatible",
      certified: true,
      leadDays: 2,
      fitsModel: "FG-28",
      item: "water_filter",
      policyExample: { orderedOn: "2026-10-21", arrives: "2026-10-23", result: "recommended" },
    });
    expect(parts["P-FGWF2"]?.policyExample.result).toBe("allowed");
    expect(parts["P-ZX28"]).toMatchObject({
      certified: false,
      priceUsd: "12.99",
      leadDays: 3,
      policyExample: { result: "excluded", reason: "POLICY_UNCERTIFIED" },
    });
    expect(parts["P-LF11"]).toMatchObject({ priceUsd: "27.99", merv: 11, packQty: 3 });
    expect(parts["P-LF11"]?.policyExample.result).toBe("recommended");
    expect(parts["P-CF11"]).toMatchObject({ kind: "oem", priceUsd: "38.97", leadDays: 3 });
    expect(parts["P-LF13"]).toMatchObject({
      merv: 13,
      policyExample: { result: "excluded", reason: "EXCEEDS_MAKER_SPEC" },
    });
    expect(parts["P-VW9V"]).toMatchObject({ kind: "generic", spec: "9V", leadDays: 1, priceUsd: "11.49" });
    expect(parts["P-GM19"]).toMatchObject({
      fitsModel: null,
      fitsProduct: "porch light",
      item: "bulb",
      leadDays: 1,
      priceUsd: "9.99",
    });
    for (const part of seed.parts) {
      expect(plusDays(part.policyExample.orderedOn, part.leadDays)).toBe(part.policyExample.arrives);
    }

    expect(seed.symptoms.map((row) => [row.result, row.item])).toEqual([
      ["low_battery", "battery"],
      ["filter_due", "water_filter"],
      ["vent_restricted", "vent_cleaning"],
      ["bulb_failed", "bulb"],
    ]);
    expect(seed.hazards[0]?.phrases).toEqual([
      "smell gas",
      "smell or see smoke",
      "fire",
      "sparks",
      "burning smell",
      "CO alarm",
      "alarm going off",
      "keeps sounding",
    ]);
    expect(seed.hazards[0]?.hazard).toBe(true);

    expect(seed.slots.map((slot) => [slot.id, slot.provider, slot.priceUsd, slot.windowStart])).toEqual([
      ["S-1027A", "Ventora Home Care", "89.00", "2026-10-27T09:00:00-07:00"],
      ["S-1028P", "Flueline Services", "109.00", "2026-10-28T13:00:00-07:00"],
      ["S-1031A", "Ventora Home Care", "99.00", "2026-10-31T10:00:00-07:00"],
    ]);
    expect(seed.chips).toEqual(CHIPS);
  });

  it("rejects a directory that is not seed v1", () => {
    const dir = mkdtempSync(join(tmpdir(), "hk-seed-"));
    tempDirs.push(dir);
    expect(() => loadSeed(dir)).toThrow(SeedError);
  });
});

describe("SQLite repository", () => {
  it("loads seed v1 into an empty memory database", () => {
    const repo = memoryRepo();
    const snapshot = repo.snapshot();
    expect(repo.path).toBe(":memory:");
    expect(snapshot.clock).toBe(DEFAULT_SIM_START);
    expect(snapshot.appliances.map((row) => row.id)).toEqual([
      "ap_fridge",
      "ap_furnace",
      "ap_smoke_hall",
      "ap_smoke_bed",
      "ap_dryer",
      "ap_porch",
    ]);
    expect(snapshot.schedule).toHaveLength(6);
    expect(snapshot.inventory.map((row) => [row.name, row.qty, row.location])).toEqual([
      ["9V battery", 2, "Garage shelf"],
      ["A19 LED bulb 2700K 800 lm", 1, "Kitchen drawer"],
    ]);
    expect(snapshot.orders).toEqual([]);
    expect(snapshot.bookings).toEqual([]);
    expect(snapshot.tasks).toEqual([]);
    expect(snapshot.audit).toEqual([]);
    expect(repo.getPart("P-CX28")?.priceUsd).toBe("24.99");
    expect(repo.getPart("P-ZX28")?.certified).toBe(false);
    expect(repo.getPart("P-LF11")?.certified).toBeNull();
    expect(repo.findCatalogModel("Brimwell", "WH-40")?.catalogOnly).toBe(true);
    expect(repo.findCatalogModel("Other", "Model")).toBeNull();
    expect(repo.listChips().map((chip) => chip.label)).toEqual(CHIPS);
    expect(repo.getServiceSlot("S-1028P")?.provider).toBe("Flueline Services");
    expect(JSON.stringify(repo.getPreferences())).not.toContain("2468");
    expect(JSON.stringify(snapshot)).not.toContain("2468");
  });

  it("issues sequential ids and reset() restores seed v1 and the counters", () => {
    const repo = memoryRepo();
    expect(repo.allocateId("quote")).toBe("q_0001");
    expect(repo.allocateId("order")).toBe("ord_0001");
    expect(repo.allocateId("booking")).toBe("bk_0001");
    expect(repo.allocateId("task")).toBe("t_0001");
    expect(repo.allocateId("appliance")).toBe("ap_0001");
    expect(repo.allocateId("quote")).toBe("q_0002");

    const quote = repo.insertQuote({
      kind: "part",
      lines: [{ optionId: "P-CX28", qty: 1 }],
      totalUsd: "24.99",
      capUsd: "60.00",
      overCap: false,
      expiresAt: "2026-10-21T09:15:00-07:00",
    });
    expect(quote.id).toBe("q_0003");
    const order = repo.insertOrder({
      quoteId: quote.id,
      applianceId: "ap_fridge",
      optionId: "P-CX28",
      qty: 1,
      totalUsd: "24.99",
      eta: "2026-10-23",
    });
    expect(order.id).toBe("ord_0002");
    const booking = repo.insertBooking({
      applianceId: "ap_dryer",
      slotId: "S-1027A",
      provider: "Ventora Home Care",
      service: "vent_cleaning",
      windowStart: "2026-10-27T09:00:00-07:00",
      windowEnd: "2026-10-27T11:00:00-07:00",
      totalUsd: "89.00",
    });
    expect(booking.id).toBe("bk_0002");
    const task = repo.insertTask({
      title: "Install fridge water filter",
      applianceId: "ap_fridge",
      item: "water_filter",
      dueDate: "2026-10-23",
    });
    expect(task.id).toBe("t_0002");
    const added = repo.insertAppliance({
      spokenName: "water heater",
      maker: "Brimwell",
      model: "WH-40",
      product: "water heater",
      location: "garage",
      schedule: {
        item: "flush",
        how: "maintenance",
        everyDays: 365,
        trigger: "interval",
        nextDue: "2027-10-21",
      },
    });
    expect(added.id).toBe("ap_0002");
    expect(repo.getSchedule(added.id)?.item).toBe("flush");
    repo.updateInventory("inv_9v", { qty: 1 });
    repo.updateSchedule("ap_fridge", { nextDue: "2027-04-21", lastDone: "2026-10-23" });
    repo.updateOrder(order.id, { status: "shipped" });
    repo.updateQuote(quote.id, { attempts: 1, status: "confirmed", resultKind: "order", resultId: order.id });
    const audit = repo.appendAudit({
      action: "order.placed",
      entityType: "order",
      entityId: order.id,
      detail: { totalUsd: "24.99" },
    });
    expect(audit.id).toBe(1);
    expect(repo.snapshot().orders).toHaveLength(1);
    expect(repo.listAppliances()).toHaveLength(7);

    expect(repo.reset()).toEqual({ now: DEFAULT_SIM_START, seed: "v1" });
    expect(repo.now()).toBe(DEFAULT_SIM_START);
    expect(repo.getInventory("inv_9v")?.qty).toBe(2);
    expect(repo.getSchedule("ap_fridge")?.nextDue).toBe("2026-10-21");
    expect(repo.getAppliance("ap_0002")).toBeNull();
    expect(repo.listAppliances()).toHaveLength(6);
    expect(repo.snapshot()).toMatchObject({
      clock: DEFAULT_SIM_START,
      orders: [],
      bookings: [],
      tasks: [],
      audit: [],
    });
    expect(repo.allocateId("quote")).toBe("q_0001");
    expect(repo.allocateId("order")).toBe("ord_0001");
    expect(repo.allocateId("booking")).toBe("bk_0001");
    expect(repo.allocateId("task")).toBe("t_0001");
    expect(repo.allocateId("appliance")).toBe("ap_0001");
    expect(repo.appendAudit({ action: "reset", entityType: "demo", entityId: "seed" }).id).toBe(1);
  });

  it("persists the sim clock and moves it only through advanceDays and set", () => {
    const repo = memoryRepo();
    expect(repo.advanceDays(1)).toBe("2026-10-22T09:00:00-07:00");
    expect(repo.advanceDays(1)).toBe("2026-10-23T09:00:00-07:00");
    expect(repo.now()).toBe("2026-10-23T09:00:00-07:00");

    const fresh = memoryRepo();
    expect(fresh.advanceDays(11)).toBe("2026-11-01T09:00:00-08:00");
    const far = fresh.advanceDays(389);
    expect(localDaySpan(DEFAULT_SIM_START, far)).toBe(400);
    expect(far.slice(11, 19)).toBe("09:00:00");
    expect(() => fresh.advanceDays(1)).not.toThrow();
    expect(() => fresh.advanceDays(401)).toThrow(ClockError);
    expect(() => fresh.advanceDays(0)).toThrow(ClockError);
    expect(() => fresh.advanceDays(-1)).toThrow(ClockError);
    expect(() => fresh.advanceDays(1.5)).toThrow(ClockError);
    expect(fresh.now().slice(11, 19)).toBe("09:00:00");

    const clock = memoryRepo();
    expect(() => clock.set(DEFAULT_SIM_START)).toThrow(ClockError);
    expect(() => clock.set("2026-10-21T08:59:00-07:00")).toThrow(ClockError);
    expect(() => clock.set("not-a-time")).toThrow(ClockError);
    expect(() => clock.set("2026-10-22")).toThrow(ClockError);
    expect(clock.now()).toBe(DEFAULT_SIM_START);
    expect(clock.set("2026-10-21T17:00:00Z")).toBe("2026-10-21T10:00:00-07:00");
    expect(clock.advanceDays(1)).toBe("2026-10-22T10:00:00-07:00");
    expect(clock.now()).toBe("2026-10-22T10:00:00-07:00");
  });

  it("keeps a file database across reopen and does not load the seed twice", () => {
    const dir = mkdtempSync(join(tmpdir(), "hk-db-"));
    tempDirs.push(dir);
    const path = join(dir, "nested", "hearthkeep.db");
    const first = openRepository({ path, simStart: DEFAULT_SIM_START });
    open.push(first);
    expect(first.advanceDays(2)).toBe("2026-10-23T09:00:00-07:00");
    first.updateInventory("inv_9v", { qty: 0 });
    const order = first.insertOrder({
      applianceId: "ap_fridge",
      optionId: "P-CX28",
      qty: 1,
      totalUsd: "24.99",
    });
    expect(order.id).toBe("ord_0001");
    first.close();

    const second = openRepository({ path, simStart: DEFAULT_SIM_START });
    open.push(second);
    expect(second.now()).toBe("2026-10-23T09:00:00-07:00");
    expect(second.listAppliances()).toHaveLength(6);
    expect(second.getInventory("inv_9v")?.qty).toBe(0);
    expect(second.getOrder("ord_0001")?.status).toBe("placed");
    expect(second.insertOrder({ qty: 1, totalUsd: "9.99", optionId: "P-GM19" }).id).toBe("ord_0002");
    expect(second.reset()).toEqual({ now: DEFAULT_SIM_START, seed: "v1" });
    expect(second.listOrders()).toEqual([]);
    expect(second.getInventory("inv_9v")?.qty).toBe(2);
    expect(second.allocateId("order")).toBe("ord_0001");
    second.close();

    const third = openRepository({ path });
    open.push(third);
    expect(third.now()).toBe(DEFAULT_SIM_START);
    expect(third.listAppliances()).toHaveLength(6);
    expect(third.listOrders()).toEqual([]);
  });

  it("reads HK_DB and HK_SIM_START", () => {
    expect(resolveDbPath({})).toBe("./data/hearthkeep.db");
    expect(resolveDbPath({ HK_DB: "  " })).toBe("./data/hearthkeep.db");
    expect(resolveDbPath({ HK_DB: " :memory: " })).toBe(":memory:");
    expect(resolveSimStart({})).toBe(DEFAULT_SIM_START);
    expect(resolveSimStart({ HK_SIM_START: "" })).toBe(DEFAULT_SIM_START);
    expect(resolveSimStart({ HK_SIM_START: " 2030-01-02T03:04:05-08:00 " })).toBe(
      "2030-01-02T03:04:05-08:00",
    );

    const repo = openRepositoryFromEnv({
      HK_DB: ":memory:",
      HK_SIM_START: "2030-01-02T03:04:05-08:00",
    });
    open.push(repo);
    expect(repo.now()).toBe("2030-01-02T03:04:05-08:00");
    expect(repo.advanceDays(1)).toBe("2030-01-03T03:04:05-08:00");
    expect(repo.reset().now).toBe("2030-01-02T03:04:05-08:00");
    const zoned = openRepository({ path: ":memory:", simStart: "2026-10-21T16:00:00Z" });
    open.push(zoned);
    expect(zoned.now()).toBe(DEFAULT_SIM_START);
    expect(zoned.advanceDays(1)).toBe("2026-10-22T09:00:00-07:00");
    expect(() => openRepository({ path: ":memory:", simStart: "tomorrow" })).toThrow(ClockError);
  });

  it("keeps memory databases independent", () => {
    const left = memoryRepo();
    const right = memoryRepo();
    left.advanceDays(3);
    expect(right.now()).toBe(DEFAULT_SIM_START);
    expect(left.now()).toBe("2026-10-24T09:00:00-07:00");
  });
});

function plusDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days));
  return shifted.toISOString().slice(0, 10);
}

function localDaySpan(startIso: string, endIso: string): number {
  const start = Date.parse(`${startIso.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${endIso.slice(0, 10)}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}
