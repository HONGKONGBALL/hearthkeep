import { afterEach, describe, expect, it } from "vitest";
import {
  DomainError,
  confirmPurchase,
  createTask,
  diagnoseSymptom,
  findParts,
  findServiceSlots,
  getUpkeepStatus,
  logMaintenance,
  openRepository,
  prepareCheckout,
  recordAudit,
  registerAppliance,
  resolveAppliance,
  syncLifecycle,
  type Repository,
} from "@hearthkeep/core";

const open: Repository[] = [];

function memoryRepo(): Repository {
  const repo = openRepository({ path: ":memory:" });
  open.push(repo);
  return repo;
}

afterEach(() => {
  for (const repo of open.splice(0)) repo.close();
});

function expectCode(run: () => unknown, code: string): DomainError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    const domain = error as DomainError;
    expect(domain.code).toBe(code);
    return domain;
  }
  throw new Error(`expected ${code}`);
}

describe("getUpkeepStatus", () => {
  it("buckets overdue, due today, and the coming-up window", () => {
    const status = getUpkeepStatus(memoryRepo(), {});
    expect(status.attention.map((item) => [item.applianceId, item.item, item.bucket, item.due, item.daysOverdue])).toEqual([
      ["ap_dryer", "vent_cleaning", "overdue", "2026-09-30", 21],
      ["ap_fridge", "water_filter", "due_today", "2026-10-21", undefined],
    ]);
    expect(status.upcoming.map((item) => [item.applianceId, item.item, item.due, item.daysUntil])).toEqual([
      ["ap_smoke_hall", "battery", "2026-10-28", 7],
      ["ap_furnace", "air_filter", "2026-10-30", 9],
    ]);
    expect(status.inProgress).toEqual([]);
    expect(status.tasks).toEqual([]);
    expect(status.speech).toContain("dryer vent");
    expect(status.speech).toContain("fridge water filter");
    expect(status.now).toBe("2026-10-21T09:00:00-07:00");
  });

  it("rejects a horizon outside 1 to 400 and an unknown appliance", () => {
    const repo = memoryRepo();
    expectCode(() => getUpkeepStatus(repo, { horizonDays: 0 }), "INVALID_ARGUMENT");
    expectCode(() => getUpkeepStatus(repo, { horizonDays: 401 }), "INVALID_ARGUMENT");
    expectCode(() => getUpkeepStatus(repo, { applianceId: "ap_missing" }), "APPLIANCE_NOT_FOUND");
  });
});

describe("resolveAppliance", () => {
  it("matches the fridge, splits smoke alarms, and misses a garage door", () => {
    const repo = memoryRepo();
    const match = resolveAppliance(repo, { query: "the fridge" });
    expect(match.status).toBe("match");
    expect(match.appliance?.id).toBe("ap_fridge");
    expect(match.appliance?.model).toBe("FG-28");
    const ambiguous = resolveAppliance(repo, { query: "smoke alarm" });
    expect(ambiguous.status).toBe("ambiguous");
    expect(ambiguous.candidates?.map((row) => row.id)).toEqual(["ap_smoke_hall", "ap_smoke_bed"]);
    expect(ambiguous.speech.toLowerCase()).toContain("which");
    const error = expectCode(() => resolveAppliance(repo, { query: "garage door" }), "APPLIANCE_NOT_FOUND");
    expect(error.message.toLowerCase()).toContain("add");
  });
});

describe("registerAppliance", () => {
  it("learns a catalog schedule and repeats the same id", () => {
    const repo = memoryRepo();
    const created = registerAppliance(repo, {
      type: "water_heater",
      maker: "Brimwell",
      model: "WH-40",
      location: "Garage",
    });
    expect(created.created).toBe(true);
    expect(created.applianceId).toBe("ap_0001");
    expect(created.scheduleSource).toBe("catalog");
    expect(created.schedule).toEqual([
      expect.objectContaining({ item: "flush", everyDays: 365, nextDue: "2027-10-21" }),
    ]);
    const again = registerAppliance(repo, {
      type: "water_heater",
      maker: "brimwell",
      model: "wh-40",
      location: "garage",
    });
    expect(again.created).toBe(false);
    expect(again.applianceId).toBe("ap_0001");
    const status = getUpkeepStatus(repo, { horizonDays: 400, applianceId: "ap_0001" });
    expect(status.upcoming.map((item) => [item.item, item.due])).toEqual([["flush", "2027-10-21"]]);
    expect(resolveAppliance(repo, { query: "water heater" }).appliance?.id).toBe("ap_0001");
  });

  it("registers an unknown model with no schedule", () => {
    const created = registerAppliance(memoryRepo(), {
      type: "dishwasher",
      maker: "Zephyrine",
      model: "Q-1",
      location: "Kitchen",
    });
    expect(created.created).toBe(true);
    expect(created.scheduleSource).toBe("none");
    expect(created.schedule).toEqual([]);
    expect(created.speech.toLowerCase()).toContain("no schedule");
  });
});

describe("findParts", () => {
  it("recommends the cheapest certified fridge filter and excludes the uncertified one", () => {
    const found = findParts(memoryRepo(), { applianceId: "ap_fridge", item: "water_filter" });
    expect(found.options.map((row) => [row.optionId, row.priceUsd, row.eta, row.kind, row.certified, row.recommended])).toEqual([
      ["P-CX28", "24.99", "2026-10-23", "compatible", true, true],
      ["P-FGWF2", "49.99", "2026-10-23", "oem", true, false],
    ]);
    expect(found.excluded).toEqual([{ optionId: "P-ZX28", name: "Bargo ZX-28", reason: "POLICY_UNCERTIFIED" }]);
    expect(found.onHand.qty).toBe(0);
    expect(found.recommendedAction).toBe("buy");
  });

  it("keeps furnace filters inside the maker MERV limit", () => {
    const found = findParts(memoryRepo(), { applianceId: "ap_furnace", item: "air_filter" });
    expect(found.options.map((row) => [row.optionId, row.priceUsd, row.eta, row.recommended])).toEqual([
      ["P-LF11", "27.99", "2026-10-23", true],
      ["P-CF11", "38.97", "2026-10-24", false],
    ]);
    expect(found.excluded).toEqual([
      { optionId: "P-LF13", name: "Loftaire 16x25x1 MERV 13, 3-pack", reason: "EXCEEDS_MAKER_SPEC" },
    ]);
  });

  it("prefers stock already on the shelf", () => {
    const found = findParts(memoryRepo(), { applianceId: "ap_smoke_hall", item: "battery" });
    expect(found.options.map((row) => [row.optionId, row.priceUsd, row.eta, row.recommended])).toEqual([
      ["P-VW9V", "11.49", "2026-10-22", false],
    ]);
    expect(found.onHand).toMatchObject({ qty: 2, location: "Garage shelf" });
    expect(found.recommendedAction).toBe("use_on_hand");
  });

  it("rejects an item the appliance does not take", () => {
    expectCode(() => findParts(memoryRepo(), { applianceId: "ap_dryer", item: "water_filter" }), "ITEM_NOT_APPLICABLE");
  });
});

describe("diagnoseSymptom", () => {
  it("maps a chirp to a low battery without writing", () => {
    const repo = memoryRepo();
    const before = repo.snapshot();
    const result = diagnoseSymptom(repo, { applianceId: "ap_smoke_hall", symptom: "keeps chirping" });
    expect(result.hazard).toBe(false);
    expect(result.cause).toBe("low_battery");
    expect(result.item).toBe("battery");
    expect(repo.snapshot().audit).toEqual(before.audit);
    expect(repo.snapshot().tasks).toEqual(before.tasks);
    expect(repo.snapshot().orders).toEqual(before.orders);
  });

  it("flags smoke as a hazard and does not write", () => {
    const repo = memoryRepo();
    const before = JSON.stringify(repo.snapshot());
    const result = diagnoseSymptom(repo, {
      applianceId: "ap_smoke_hall",
      symptom: "it's going off and I smell smoke",
    });
    expect(result.hazard).toBe(true);
    expect(result.cause).toBeUndefined();
    expect(result.speech.toLowerCase()).toContain("leave");
    expect(result.speech.toLowerCase()).toContain("emergency");
    expect(JSON.stringify(repo.snapshot())).toBe(before);
    const gas = diagnoseSymptom(repo, { applianceId: "ap_fridge", symptom: "I smell gas in the kitchen" });
    expect(gas.hazard).toBe(true);
    const sounding = diagnoseSymptom(repo, { applianceId: "ap_smoke_bed", symptom: "the alarm is going off" });
    expect(sounding.hazard).toBe(true);
  });
});

describe("findServiceSlots", () => {
  it("lists fictional vent-cleaning visits and marks them over the cap", () => {
    const found = findServiceSlots(memoryRepo(), {
      applianceId: "ap_dryer",
      item: "vent_cleaning",
      from: "2026-10-26",
      to: "2026-11-01",
    });
    expect(found.slots.map((slot) => [slot.slotId, slot.provider, slot.start, slot.end, slot.priceUsd, slot.overCap])).toEqual([
      ["S-1027A", "Ventora Home Care", "2026-10-27T09:00:00-07:00", "2026-10-27T11:00:00-07:00", "89.00", true],
      ["S-1028P", "Flueline Services", "2026-10-28T13:00:00-07:00", "2026-10-28T15:00:00-07:00", "109.00", true],
      ["S-1031A", "Ventora Home Care", "2026-10-31T10:00:00-07:00", "2026-10-31T12:00:00-07:00", "99.00", true],
    ]);
  });

  it("rejects a window in the past", () => {
    expectCode(
      () =>
        findServiceSlots(memoryRepo(), {
          applianceId: "ap_dryer",
          item: "vent_cleaning",
          from: "2026-10-01",
          to: "2026-10-07",
        }),
      "INVALID_ARGUMENT",
    );
  });
});

describe("prepareCheckout", () => {
  it("prices a part without placing an order", () => {
    const repo = memoryRepo();
    const quote = prepareCheckout(repo, {
      items: [{ type: "part", optionId: "P-CX28", qty: 1, forApplianceId: "ap_fridge" }],
    });
    expect(quote.quoteId).toBe("q_0001");
    expect(quote.totalUsd).toBe("24.99");
    expect(quote.eta).toBe("2026-10-23");
    expect(quote.capUsd).toBe("60.00");
    expect(quote.overCap).toBe(false);
    expect(quote.overByUsd).toBeUndefined();
    expect(quote.expiresAt).toBe("2026-10-21T09:15:00-07:00");
    expect(repo.listOrders()).toEqual([]);
    expect(repo.listAudit().map((event) => event.action)).toEqual(["quote_created"]);
  });

  it("prices a service over the cap", () => {
    const quote = prepareCheckout(memoryRepo(), { items: [{ type: "service", slotId: "S-1027A" }] });
    expect(quote.totalUsd).toBe("89.00");
    expect(quote.overCap).toBe(true);
    expect(quote.overByUsd).toBe("29.00");
    expect(quote.slot?.slotId).toBe("S-1027A");
  });

  it("enforces policy and fit on the server", () => {
    const repo = memoryRepo();
    expectCode(
      () => prepareCheckout(repo, { items: [{ type: "part", optionId: "P-ZX28", qty: 1, forApplianceId: "ap_fridge" }] }),
      "POLICY_EXCLUDED",
    );
    expectCode(
      () => prepareCheckout(repo, { items: [{ type: "part", optionId: "P-FGWF2", qty: 1, forApplianceId: "ap_furnace" }] }),
      "PART_NOT_COMPATIBLE",
    );
    expect(repo.listQuotes()).toEqual([]);
  });

  it("rejects an empty cart and a bad quantity", () => {
    const repo = memoryRepo();
    expectCode(() => prepareCheckout(repo, { items: [] }), "INVALID_ARGUMENT");
    expectCode(
      () => prepareCheckout(repo, { items: [{ type: "part", optionId: "P-CX28", qty: 0, forApplianceId: "ap_fridge" }] }),
      "INVALID_ARGUMENT",
    );
  });
});

describe("confirmPurchase", () => {
  it("rejects a wrong code, then places one idempotent mock order", () => {
    const repo = memoryRepo();
    const quote = prepareCheckout(repo, {
      items: [{ type: "part", optionId: "P-CX28", qty: 1, forApplianceId: "ap_fridge" }],
    });
    const wrong = expectCode(() => confirmPurchase(repo, { quoteId: quote.quoteId, code: "0000" }), "INVALID_PURCHASE_CODE");
    expect(wrong.attemptsRemaining).toBe(2);
    expect(repo.listOrders()).toEqual([]);
    const placed = confirmPurchase(repo, { quoteId: quote.quoteId, code: "2468" });
    expect(placed.kind).toBe("order");
    expect(placed.orderId).toBe("ord_0001");
    expect(placed.status).toBe("placed");
    expect(placed.eta).toBe("2026-10-23");
    expect(placed.mock).toBe(true);
    expect(placed.createdTaskId).toBe("t_0001");
    expect(placed.alreadyConfirmed).toBeUndefined();
    const status = getUpkeepStatus(repo, {});
    expect(status.attention.map((item) => item.applianceId)).toEqual(["ap_dryer"]);
    expect(status.inProgress.map((item) => [item.id, item.status, item.item])).toEqual([["ord_0001", "placed", "water_filter"]]);
    expect(status.tasks.map((task) => [task.taskId, task.title, task.dueDate])).toEqual([
      ["t_0001", "Install fridge water filter", "2026-10-23"],
    ]);
    const again = confirmPurchase(repo, { quoteId: quote.quoteId, code: "0000" });
    expect(again.alreadyConfirmed).toBe(true);
    expect(again.orderId).toBe("ord_0001");
    expect(repo.listOrders()).toHaveLength(1);
  });

  it("expires a quote after 15 simulated minutes", () => {
    const repo = memoryRepo();
    const quote = prepareCheckout(repo, {
      items: [{ type: "part", optionId: "P-CX28", qty: 1, forApplianceId: "ap_fridge" }],
    });
    repo.set("2026-10-21T09:16:00-07:00");
    expectCode(() => confirmPurchase(repo, { quoteId: quote.quoteId, code: "2468" }), "QUOTE_EXPIRED");
    expect(repo.listOrders()).toEqual([]);
  });

  it("locks a quote after three wrong codes", () => {
    const repo = memoryRepo();
    const quote = prepareCheckout(repo, {
      items: [{ type: "part", optionId: "P-CX28", qty: 1, forApplianceId: "ap_fridge" }],
    });
    expect(expectCode(() => confirmPurchase(repo, { quoteId: quote.quoteId, code: "0000" }), "INVALID_PURCHASE_CODE").attemptsRemaining).toBe(2);
    expect(expectCode(() => confirmPurchase(repo, { quoteId: quote.quoteId, code: "1111" }), "INVALID_PURCHASE_CODE").attemptsRemaining).toBe(1);
    expectCode(() => confirmPurchase(repo, { quoteId: quote.quoteId, code: "2222" }), "QUOTE_LOCKED");
    expectCode(() => confirmPurchase(repo, { quoteId: quote.quoteId, code: "2468" }), "QUOTE_LOCKED");
    expect(repo.getQuote(quote.quoteId)?.locked).toBe(true);
    expect(repo.getQuote(quote.quoteId)?.attempts).toBe(3);
    expect(repo.listOrders()).toEqual([]);
  });

  it("asks for over-cap approval without using an attempt, then books", () => {
    const repo = memoryRepo();
    const quote = prepareCheckout(repo, { items: [{ type: "service", slotId: "S-1027A" }] });
    expectCode(() => confirmPurchase(repo, { quoteId: quote.quoteId, code: "2468" }), "OVER_CAP_APPROVAL_REQUIRED");
    expect(repo.getQuote(quote.quoteId)?.attempts).toBe(0);
    const wrong = expectCode(() => confirmPurchase(repo, { quoteId: quote.quoteId, code: "0000" }), "INVALID_PURCHASE_CODE");
    expect(wrong.attemptsRemaining).toBe(2);
    const booked = confirmPurchase(repo, { quoteId: quote.quoteId, code: "2468", approveOverCap: true });
    expect(booked.kind).toBe("booking");
    expect(booked.bookingId).toBe("bk_0001");
    expect(booked.status).toBe("booked");
    const status = getUpkeepStatus(repo, {});
    expect(status.attention.map((item) => item.applianceId)).not.toContain("ap_dryer");
    expect(status.inProgress.map((item) => [item.id, item.status])).toEqual([["bk_0001", "booked"]]);
  });

  it("refuses a taken slot and drops it from the open list", () => {
    const repo = memoryRepo();
    const quote = prepareCheckout(repo, { items: [{ type: "service", slotId: "S-1027A" }] });
    confirmPurchase(repo, { quoteId: quote.quoteId, code: "2468", approveOverCap: true });
    expectCode(
      () => prepareCheckout(repo, { items: [{ type: "service", slotId: "S-1027A" }] }),
      "SLOT_UNAVAILABLE",
    );
    const slots = findServiceSlots(repo, {
      applianceId: "ap_dryer",
      item: "vent_cleaning",
      from: "2026-10-26",
      to: "2026-11-01",
    });
    expect(slots.slots.map((slot) => slot.slotId)).not.toContain("S-1027A");
  });

  it("does not know an unknown quote", () => {
    expectCode(() => confirmPurchase(memoryRepo(), { quoteId: "q_9999", code: "2468" }), "QUOTE_NOT_FOUND");
  });
});

describe("createTask and logMaintenance", () => {
  it("creates a task, uses one battery, rolls the year, and closes the task", () => {
    const repo = memoryRepo();
    const created = createTask(repo, {
      title: "Replace hallway smoke alarm battery",
      applianceId: "ap_smoke_hall",
      item: "battery",
      dueDate: "2026-10-21",
      notes: "Use a 9V from the Garage shelf",
    });
    expect(created.taskId).toBe("t_0001");
    const logged = logMaintenance(repo, { applianceId: "ap_smoke_hall", item: "battery" });
    expect(logged.lastDone).toBe("2026-10-21");
    expect(logged.nextDue).toBe("2027-10-21");
    expect(logged.inventoryAfter).toMatchObject({ qty: 1, location: "Garage shelf" });
    expect(logged.closedTaskIds).toEqual(["t_0001"]);
    const status = getUpkeepStatus(repo, {});
    expect(status.upcoming.map((item) => item.applianceId)).not.toContain("ap_smoke_hall");
    expect(status.tasks).toEqual([]);
  });

  it("does not consume stock when asked not to", () => {
    const repo = memoryRepo();
    const logged = logMaintenance(repo, { applianceId: "ap_smoke_hall", item: "battery", consumeInventory: false });
    expect(logged.inventoryAfter).toBeUndefined();
    expect(repo.getInventory("inv_9v")?.qty).toBe(2);
    expect(logged.nextDue).toBe("2027-10-21");
  });
});

describe("syncLifecycle", () => {
  it("ships the next morning and delivers stock on the ETA date", () => {
    const repo = memoryRepo();
    const quote = prepareCheckout(repo, {
      items: [{ type: "part", optionId: "P-CX28", qty: 1, forApplianceId: "ap_fridge" }],
    });
    confirmPurchase(repo, { quoteId: quote.quoteId, code: "2468" });
    repo.advanceDays(1);
    expect(syncLifecycle(repo).shipped).toEqual(["ord_0001"]);
    expect(repo.getOrder("ord_0001")?.status).toBe("shipped");
    expect(getUpkeepStatus(repo).inProgress.map((item) => [item.id, item.status, item.name])).toEqual([
      ["ord_0001", "shipped", "Rillstone CX-28"],
    ]);
    expect(syncLifecycle(repo).shipped).toEqual([]);
    repo.advanceDays(1);
    expect(syncLifecycle(repo).delivered).toEqual(["ord_0001"]);
    expect(repo.getOrder("ord_0001")?.status).toBe("delivered");
    const received = repo.listInventory().find((row) => row.name === "Rillstone CX-28");
    expect(received).toMatchObject({ qty: 1, location: "Received, not yet installed", receivedNotInstalled: 1 });
    const logged = logMaintenance(repo, { applianceId: "ap_fridge", item: "water_filter" });
    expect(logged.lastDone).toBe("2026-10-23");
    expect(logged.nextDue).toBe("2027-04-21");
    expect(logged.inventoryAfter?.qty).toBe(0);
    expect(logged.closedTaskIds).toEqual(["t_0001"]);
    expect(syncLifecycle(repo).delivered).toEqual([]);
  });

  it("P04d keeps a delivered filter in progress until the install task closes", () => {
    const repo = memoryRepo();
    const quote = prepareCheckout(repo, {
      items: [{ type: "part", optionId: "P-CX28", qty: 1, forApplianceId: "ap_fridge" }],
    });
    confirmPurchase(repo, { quoteId: quote.quoteId, code: "2468" });
    repo.advanceDays(2);
    expect(syncLifecycle(repo).delivered).toEqual(["ord_0001"]);
    const waiting = getUpkeepStatus(repo);
    expect(waiting.attention.some((item) => item.applianceId === "ap_fridge" && item.item === "water_filter")).toBe(false);
    expect(waiting.attention.some((item) => item.daysOverdue === 2)).toBe(false);
    expect(waiting.inProgress).toEqual([
      expect.objectContaining({ id: "ord_0001", status: "delivered", item: "water_filter", applianceId: "ap_fridge" }),
    ]);
    expect(waiting.tasks.map((task) => task.taskId)).toEqual(["t_0001"]);
    const logged = logMaintenance(repo, { applianceId: "ap_fridge", item: "water_filter" });
    expect(logged.closedTaskIds).toEqual(["t_0001"]);
    expect(logged.inventoryAfter?.qty).toBe(0);
    expect(logged.nextDue).toBe("2027-04-21");
    const after = getUpkeepStatus(repo);
    expect(after.inProgress.some((item) => item.id === "ord_0001")).toBe(false);
    expect(after.tasks).toEqual([]);
    expect(after.attention.some((item) => item.applianceId === "ap_fridge")).toBe(false);
  });
});

describe("recordAudit", () => {
  it("records writes and never stores a purchase code", () => {
    const repo = memoryRepo();
    const quote = prepareCheckout(repo, {
      items: [{ type: "part", optionId: "P-CX28", qty: 1, forApplianceId: "ap_fridge" }],
    });
    expectCode(() => confirmPurchase(repo, { quoteId: quote.quoteId, code: "0000" }), "INVALID_PURCHASE_CODE");
    confirmPurchase(repo, { quoteId: quote.quoteId, code: "2468" });
    const service = prepareCheckout(repo, { items: [{ type: "service", slotId: "S-1027A" }] });
    confirmPurchase(repo, { quoteId: service.quoteId, code: "2468", approveOverCap: true });
    createTask(repo, { title: "Check the porch light" });
    const actions = repo.listAudit().map((event) => event.action);
    expect(actions).toEqual(
      expect.arrayContaining(["quote_created", "code_rejected", "order_placed", "booking_placed", "task_created"]),
    );
    const dumped = JSON.stringify(repo.listAudit());
    expect(dumped).not.toContain("2468");
    expect(dumped).not.toContain("0000");
    expectCode(
      () => recordAudit(repo, "note", "quote", quote.quoteId, { note: "code 2468" }),
      "INVALID_ARGUMENT",
    );
  });
});
