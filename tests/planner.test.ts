/**
 * Deterministic planner coverage. Utterances and the purchase code are fictional.
 */
import { describe, expect, it } from "vitest";
import {
  CANCEL_REPLY,
  HAZARD_REPLY,
  NO_CODE_REPLY,
  SCOPE_REPLY,
  SIM_EPOCH,
  SOUND_QUESTION,
  WHICH_ALARM,
  emptyDialogue,
  executeTurn,
  matchesHazard,
  parseUtterance,
  type IntentName,
  type Slots,
  type ToolResponse,
} from "../apps/simulator/src/planner";

const CLOCK = { iso: SIM_EPOCH, timeZone: "America/Los_Angeles" };

interface Sample {
  text: string;
  intent: IntentName;
  slots?: Partial<Slots>;
  guard?: "hazard" | "scope" | null;
  codeTurn?: boolean;
}

const SAMPLES: Sample[] = [
  { text: "What needs doing?", intent: "briefing" },
  { text: "What's on the list?", intent: "briefing" },
  { text: "Anything due?", intent: "briefing" },
  { text: "Give me a briefing", intent: "briefing" },
  { text: "Status of the house", intent: "briefing" },

  { text: "What's coming up?", intent: "upcoming" },
  { text: "What is coming up this week?", intent: "upcoming" },
  { text: "Show upcoming upkeep", intent: "upcoming" },
  { text: "Anything coming up soon?", intent: "upcoming" },

  { text: "When is the water heater due?", intent: "ask_due", slots: { query: "water heater" } },
  { text: "When is the fridge filter due?", intent: "ask_due", slots: { query: "fridge", item: "water_filter" } },
  { text: "When is the furnace due?", intent: "ask_due", slots: { query: "furnace" } },
  { text: "When does the dryer vent need cleaning?", intent: "ask_due", slots: { query: "dryer", item: "vent_cleaning" } },

  { text: "Order a new filter for the fridge", intent: "reorder_part", slots: { query: "fridge", item: "water_filter" } },
  { text: "Buy a fridge water filter", intent: "reorder_part", slots: { query: "fridge", item: "water_filter" } },
  { text: "I need a new filter for the fridge", intent: "reorder_part", slots: { query: "fridge", item: "water_filter" } },
  { text: "Reorder the furnace filter", intent: "reorder_part", slots: { query: "furnace", item: "air_filter" } },
  { text: "Get a new bulb for the porch light", intent: "reorder_part", slots: { query: "porch light", item: "bulb" } },
  { text: "Replace the hallway smoke alarm battery", intent: "reorder_part", slots: { query: "hallway smoke alarm", item: "battery" } },

  { text: "The hallway smoke alarm keeps chirping", intent: "symptom", slots: { query: "hallway smoke alarm", sound: "chirp" } },
  { text: "The fridge water tastes odd", intent: "symptom", slots: { query: "fridge" } },
  { text: "The dryer takes two cycles", intent: "symptom", slots: { query: "dryer" } },
  { text: "The porch light is out", intent: "symptom", slots: { query: "porch light", item: "bulb" } },
  { text: "My hallway alarm is chirping", intent: "symptom", slots: { query: "hallway smoke alarm", sound: "chirp" } },

  { text: "Yes, the CX-28", intent: "choose_option", slots: { option: "CX-28" } },
  { text: "Choose Rillstone CX-28", intent: "choose_option", slots: { option: "Rillstone CX-28" } },
  { text: "I'll take the CX-28", intent: "choose_option", slots: { option: "CX-28" } },
  { text: "Choose Ferngate FG-WF2", intent: "choose_option", slots: { option: "Ferngate FG-WF2" } },
  { text: "The OEM one", intent: "choose_option", slots: { option: "oem" } },

  { text: "2468", intent: "confirm", slots: { approve: false }, codeTurn: true },
  { text: "1357", intent: "confirm", slots: { approve: false }, codeTurn: true },
  { text: "Approve 2468", intent: "confirm", slots: { approve: true }, codeTurn: true },
  { text: "approve 1357", intent: "confirm", slots: { approve: true }, codeTurn: true },

  { text: "Cancel", intent: "cancel" },
  { text: "Never mind", intent: "cancel" },
  { text: "Don't order it", intent: "cancel" },
  { text: "Stop that order", intent: "cancel" },

  { text: "Done, I swapped it", intent: "done" },
  { text: "I swapped it", intent: "done" },
  { text: "Mark done", intent: "done" },
  { text: "All done", intent: "done" },
  { text: "Finished the battery swap", intent: "done" },

  { text: "Book someone to clean the dryer vent next week", intent: "book_service", slots: { query: "dryer", item: "vent_cleaning", range: "next_week" } },
  { text: "Schedule a dryer vent cleaning", intent: "book_service", slots: { query: "dryer", item: "vent_cleaning" } },
  { text: "Book a pro for the dryer vent", intent: "book_service", slots: { query: "dryer", item: "vent_cleaning" } },
  { text: "I need someone to clean the dryer vent", intent: "book_service", slots: { query: "dryer", item: "vent_cleaning" } },

  { text: "Tuesday morning", intent: "choose_slot", slots: { weekday: "tuesday", daypart: "morning" } },
  { text: "Wednesday afternoon", intent: "choose_slot", slots: { weekday: "wednesday", daypart: "afternoon" } },
  { text: "Saturday morning", intent: "choose_slot", slots: { weekday: "saturday", daypart: "morning" } },
  { text: "The earliest opening", intent: "choose_slot", slots: { earliest: true } },
  { text: "Choose Tuesday morning", intent: "choose_slot", slots: { weekday: "tuesday", daypart: "morning" } },

  { text: "I just installed a new water heater, a Brimwell WH-40, in the garage", intent: "register", slots: { maker: "Brimwell", model: "WH-40", location: "garage", product: "water heater" } },
  { text: "Add a Brimwell WH-40 water heater in the garage", intent: "register", slots: { maker: "Brimwell", model: "WH-40", product: "water heater", location: "garage" } },
  { text: "We installed a new Brimwell WH-40 in the garage", intent: "register", slots: { maker: "Brimwell", model: "WH-40", location: "garage" } },
  { text: "Register a water heater, Brimwell WH-40, garage", intent: "register", slots: { maker: "Brimwell", model: "WH-40", location: "garage", product: "water heater" } },

  { text: "Help", intent: "help" },
  { text: "What can you do?", intent: "help" },
  { text: "What can you help with?", intent: "help" },
  { text: "How does this work?", intent: "help" },

  { text: "What's the weather?", intent: "out_of_scope", guard: "scope" },
  { text: "Play some music", intent: "out_of_scope", guard: "scope" },
  { text: "Set a timer", intent: "out_of_scope", guard: "scope" },
  { text: "Tell me a joke", intent: "out_of_scope", guard: "scope" },
  { text: "What's the score?", intent: "out_of_scope", guard: "scope" },

  { text: "I smell gas in the kitchen", intent: "symptom", guard: "hazard" },
  { text: "Alexa, what needs doing?", intent: "briefing" },
];

function tool(structured: Record<string, unknown>, text = "ok"): ToolResponse {
  return { isError: false, text, structuredContent: structured, httpStatus: 200, ms: 3, sessionPrefix: "abcd1234", protocol: "2025-11-25", raw: structured };
}

function fail(code: string, message: string): ToolResponse {
  return {
    isError: true,
    text: message,
    structuredContent: { error: { code, message } },
    httpStatus: 200,
    ms: 4,
    sessionPrefix: "abcd1234",
    protocol: "2025-11-25",
    raw: { error: { code, message } },
  };
}

describe("planner grammar", () => {
  it("covers at least 60 utterances and three paraphrases per intent", () => {
    expect(SAMPLES.length).toBeGreaterThanOrEqual(60);
    const counts = new Map<IntentName, number>();
    for (const sample of SAMPLES) counts.set(sample.intent, (counts.get(sample.intent) ?? 0) + 1);
    for (const intent of [
      "briefing",
      "upcoming",
      "ask_due",
      "reorder_part",
      "symptom",
      "choose_option",
      "confirm",
      "cancel",
      "done",
      "book_service",
      "choose_slot",
      "register",
      "help",
      "out_of_scope",
    ] as const) {
      expect(counts.get(intent) ?? 0).toBeGreaterThanOrEqual(3);
    }
  });

  it("maps utterances to intents and slots", () => {
    for (const sample of SAMPLES) {
      const parsed = parseUtterance(sample.text);
      expect(parsed.intent, sample.text).toBe(sample.intent);
      if (sample.slots) expect(parsed.slots, sample.text).toMatchObject(sample.slots);
      if (sample.guard !== undefined) expect(parsed.guard, sample.text).toBe(sample.guard);
      if (sample.codeTurn) {
        expect(parsed.codeTurn, sample.text).toBe(true);
        expect(parsed.slots.code).toMatch(/^\d{4,8}$/);
      }
    }
  });

  it("does not treat smoke alarm alone as a hazard", () => {
    expect(matchesHazard("The smoke alarm is beeping")).toBe(false);
    expect(matchesHazard("I smell gas in the kitchen")).toBe(true);
    expect(matchesHazard("It keeps sounding")).toBe(true);
  });

  it("asks about the sound before the appliance", () => {
    const first = parseUtterance("The smoke alarm is beeping");
    expect(first.guard).toBeNull();
    expect(first.slots.sound).toBe("unknown");
    const asked = emptyDialogue();
    asked.clarify = { stage: "sound", symptom: "The smoke alarm is beeping" };
    expect(parseUtterance("Just a chirp", asked).slots.sound).toBe("chirp");
    const which = emptyDialogue();
    which.clarify = { stage: "appliance", symptom: "chirp" };
    expect(parseUtterance("Bedroom", which).slots.query).toBe("main bedroom");
  });
});

describe("planner guards and checkout branches", () => {
  it("stops hazard phrases before any tool call", async () => {
    const turn = await executeTurn({
      utterance: "I smell gas in the kitchen",
      state: emptyDialogue(),
      clock: CLOCK,
      callTool: () => Promise.reject(new Error("should not be called")),
    });
    expect(turn.reply).toBe(HAZARD_REPLY);
    expect(turn.alert).toBe(HAZARD_REPLY);
    expect(turn.guards).toEqual(["Hazard guard"]);
    expect(turn.steps).toHaveLength(0);
    expect(turn.card).toBeNull();
  });

  it("answers out-of-scope requests without tools", async () => {
    const turn = await executeTurn({
      utterance: "What's the weather?",
      state: emptyDialogue(),
      clock: CLOCK,
      callTool: () => Promise.reject(new Error("should not be called")),
    });
    expect(turn.reply).toBe(SCOPE_REPLY);
    expect(turn.guards).toEqual(["Scope guard"]);
    expect(turn.steps).toHaveLength(0);
  });

  it("clears a pending quote on cancel and rejects a later code", async () => {
    const state = emptyDialogue();
    state.pendingQuote = {
      quoteId: "q_0001",
      kind: "part",
      overCap: false,
      totalUsd: "24.99",
      capUsd: "60.00",
      lines: [],
    };
    state.awaitingCode = true;
    const cancelled = await executeTurn({
      utterance: "Cancel",
      state,
      clock: CLOCK,
      callTool: () => Promise.reject(new Error("should not be called")),
    });
    expect(cancelled.reply).toBe(CANCEL_REPLY);
    expect(cancelled.state.pendingQuote).toBeNull();
    const coded = await executeTurn({
      utterance: "2468",
      state: cancelled.state,
      clock: CLOCK,
      callTool: () => Promise.reject(new Error("should not be called")),
    });
    expect(coded.reply).toBe(NO_CODE_REPLY);
    expect(coded.displayUtterance).toBe("••••");
    expect(JSON.stringify(coded)).not.toContain("2468");
  });

  it("chooses a part with prepare_checkout and redacts the code", async () => {
    const calls: string[] = [];
    const state = emptyDialogue();
    state.pendingOptions = [
      { kind: "part", id: "P-CX28", name: "Rillstone CX-28", applianceId: "ap_fridge", item: "water_filter", recommended: true, partKind: "compatible" },
      { kind: "part", id: "P-FGWF2", name: "Ferngate FG-WF2", applianceId: "ap_fridge", item: "water_filter", partKind: "oem" },
    ];
    state.optionsTurnsLeft = 3;
    const chosen = await executeTurn({
      utterance: "Choose Rillstone CX-28",
      state,
      clock: CLOCK,
      callTool: (name, args) => {
        calls.push(name);
        expect(name).toBe("prepare_checkout");
        expect(args).toEqual({ items: [{ type: "part", optionId: "P-CX28", qty: 1, forApplianceId: "ap_fridge" }] });
        return Promise.resolve(tool({
          quoteId: "q_0001",
          kind: "part",
          lines: [{ type: "part", name: "Rillstone CX-28", lineTotalUsd: "24.99" }],
          totalUsd: "24.99",
          capUsd: "60.00",
          overCap: false,
          eta: "2026-10-23",
        }));
      },
    });
    expect(calls).toEqual(["prepare_checkout"]);
    expect(chosen.reply).toContain("$24.99");
    expect(chosen.reply).toContain("October 23");
    expect(chosen.reply).toContain("Within your $60 limit");
    expect(spokenSentences(chosen.reply)).toHaveLength(2);
    expect(chosen.reply).toContain("purchase code");
    expect(chosen.card?.uri).toContain("checkout-card");
    expect(chosen.state.awaitingCode).toBe(true);

    const confirmed = await executeTurn({
      utterance: "2468",
      state: chosen.state,
      clock: CLOCK,
      callTool: (name, args) => {
        calls.push(name);
        expect(args.code).toBe("2468");
        return Promise.resolve(tool({ kind: "order", id: "ord_0001", orderId: "ord_0001", status: "placed", eta: "2026-10-23", mock: true }));
      },
    });
    expect(calls).toEqual(["prepare_checkout", "confirm_purchase"]);
    expect(confirmed.reply).toContain("Ordered");
    expect(confirmed.displayUtterance).toBe("••••");
    expect(confirmed.steps[0]?.args.code).toBe("••••");
    expect(JSON.stringify(confirmed)).not.toContain("2468");
    expect(confirmed.card?.uri).toContain("receipt-card");
  });

  it("keeps the quote when the code is wrong or approval is missing", async () => {
    const state = emptyDialogue();
    state.pendingQuote = {
      quoteId: "q_0001",
      kind: "service",
      overCap: true,
      totalUsd: "89.00",
      capUsd: "60.00",
      overByUsd: "29.00",
      lines: [],
      item: "vent_cleaning",
    };
    state.awaitingCode = true;
    const over = await executeTurn({
      utterance: "2468",
      state,
      clock: CLOCK,
      callTool: () => Promise.resolve(fail("OVER_CAP_APPROVAL_REQUIRED", "That's over your limit. Say 'approve' and your code.")),
    });
    expect(over.reply.toLowerCase()).toContain("approve");
    expect(over.state.pendingQuote?.quoteId).toBe("q_0001");
    expect(JSON.stringify(over)).not.toContain("2468");

    const wrong = await executeTurn({
      utterance: "1111",
      state: over.state,
      clock: CLOCK,
      callTool: () => Promise.resolve(fail("INVALID_PURCHASE_CODE", "That code didn't match, and you have 2 tries left.")),
    });
    expect(wrong.reply).toContain("didn't match");
    expect(wrong.reply).toContain("2 tries left");
    expect(wrong.state.pendingQuote).not.toBeNull();
    expect(wrong.state.requote).toBeNull();
    expect(wrong.card).toBeNull();
  });

  it("drops a locked quote and prices the same lines again on yes", async () => {
    const state = emptyDialogue();
    state.pendingQuote = {
      quoteId: "q_0001",
      kind: "part",
      overCap: false,
      totalUsd: "24.99",
      capUsd: "60.00",
      eta: "2026-10-23",
      item: "water_filter",
      lines: [{ type: "part", optionId: "P-CX28", qty: 1, forApplianceId: "ap_fridge" }],
    };
    state.awaitingCode = true;
    const locked = await executeTurn({
      utterance: "2222",
      state,
      clock: CLOCK,
      callTool: () => Promise.resolve(fail("QUOTE_LOCKED", "That quote is locked after three wrong codes.")),
    });
    expect(locked.reply).toBe("That quote is locked after three wrong codes. Say yes and I'll price it again.");
    expect(locked.state.pendingQuote).toBeNull();
    expect(locked.state.awaitingCode).toBe(false);
    expect(locked.state.requote?.quoteId).toBe("q_0001");
    expect(locked.card).toBeNull();
    expect(JSON.stringify(locked)).not.toContain("2222");

    const refused = await executeTurn({
      utterance: "2468",
      state: locked.state,
      clock: CLOCK,
      callTool: () => Promise.reject(new Error("should not confirm a locked quote")),
    });
    expect(refused.reply).toBe(NO_CODE_REPLY);
    expect(refused.card).toBeNull();

    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const again = await executeTurn({
      utterance: "Yes",
      state: locked.state,
      clock: CLOCK,
      callTool: (name, args) => {
        calls.push({ name, args });
        return Promise.resolve(tool({
          quoteId: "q_0002",
          kind: "part",
          lines: [{ type: "part", optionId: "P-CX28", qty: 1, forApplianceId: "ap_fridge", name: "Rillstone CX-28" }],
          totalUsd: "24.99",
          capUsd: "60.00",
          overCap: false,
          eta: "2026-10-23",
        }));
      },
    });
    expect(calls).toEqual([
      { name: "prepare_checkout", args: { items: [{ type: "part", optionId: "P-CX28", qty: 1, forApplianceId: "ap_fridge" }] } },
    ]);
    expect(again.reply).toContain("$24.99");
    expect(again.reply.toLowerCase()).toContain("purchase code");
    expect(again.state.pendingQuote?.quoteId).toBe("q_0002");
    expect(again.state.awaitingCode).toBe(true);
    expect(again.state.requote).toBeNull();
    expect(again.card?.uri).toContain("checkout-card");
  });

  it("prices an expired quote again when the user says yes", async () => {
    const state = emptyDialogue();
    state.pendingQuote = {
      quoteId: "q_0003",
      kind: "service",
      overCap: true,
      totalUsd: "89.00",
      capUsd: "60.00",
      overByUsd: "29.00",
      item: "vent_cleaning",
      lines: [{ type: "service", slotId: "S-1027A" }],
    };
    state.awaitingCode = true;
    const expired = await executeTurn({
      utterance: "2468",
      state,
      clock: CLOCK,
      callTool: () => Promise.resolve(fail("QUOTE_EXPIRED", "That price expired, and I can check again if you want.")),
    });
    expect(expired.reply).toBe("That price expired, and I can check again if you want. Say yes and I'll price it again.");
    expect(expired.state.pendingQuote).toBeNull();
    expect(expired.state.awaitingCode).toBe(false);
    expect(expired.card).toBeNull();

    const calls: string[] = [];
    const again = await executeTurn({
      utterance: "Yes",
      state: expired.state,
      clock: CLOCK,
      callTool: (name, args) => {
        calls.push(name);
        expect(args).toEqual({ items: [{ type: "service", slotId: "S-1027A" }] });
        return Promise.resolve(tool({
          quoteId: "q_0004",
          kind: "service",
          lines: [{ type: "service", slotId: "S-1027A" }],
          totalUsd: "89.00",
          capUsd: "60.00",
          overCap: true,
          overByUsd: "29.00",
          slot: { slotId: "S-1027A", provider: "Ventora Home Care", start: "2026-10-27T09:00:00-07:00", end: "2026-10-27T11:00:00-07:00", priceUsd: "89.00" },
        }));
      },
    });
    expect(calls).toEqual(["prepare_checkout"]);
    expect(again.reply.toLowerCase()).toContain("approve");
    expect(again.state.pendingQuote?.quoteId).toBe("q_0004");
    expect(again.card?.tool).toBe("prepare_checkout");
  });
});

describe("planner clarify state", () => {
  it("asks the sound, then the room, without tools", async () => {
    const first = await executeTurn({
      utterance: "The smoke alarm is beeping",
      state: emptyDialogue(),
      clock: CLOCK,
      callTool: () => Promise.reject(new Error("should not be called")),
    });
    expect(first.reply).toBe(SOUND_QUESTION);
    expect(first.steps).toHaveLength(0);
    const second = await executeTurn({
      utterance: "Just a chirp",
      state: first.state,
      clock: CLOCK,
      callTool: () => Promise.reject(new Error("should not be called")),
    });
    expect(second.reply).toBe(WHICH_ALARM);
    expect(second.state.clarify?.stage).toBe("appliance");
    const alarm = await executeTurn({
      utterance: "It keeps sounding",
      state: first.state,
      clock: CLOCK,
      callTool: () => Promise.reject(new Error("should not be called")),
    });
    expect(alarm.reply).toBe(HAZARD_REPLY);
    expect(alarm.steps).toHaveLength(0);
  });
});

const HALLWAY = {
  id: "ap_smoke_hall",
  spokenName: "hallway smoke alarm",
  maker: "Wardlight",
  model: "SA-9",
  product: "smoke alarm",
  location: "Hallway",
};

function scripted(calls: Array<{ name: string; args: Record<string, unknown> }>, parts: Record<string, unknown>) {
  return (name: string, args: Record<string, unknown>): Promise<ToolResponse> => {
    calls.push({ name, args });
    if (name === "resolve_appliance") return Promise.resolve(tool({ status: "match", appliance: HALLWAY, speech: "matched" }));
    if (name === "find_parts") return Promise.resolve(tool(parts));
    if (name === "create_task") {
      return Promise.resolve(tool({
        taskId: "t_0001",
        task: {
          id: "t_0001",
          title: args.title,
          applianceId: "ap_smoke_hall",
          item: "battery",
          dueDate: "2026-10-21",
          notes: args.notes ?? null,
          status: "open",
          createdAt: SIM_EPOCH,
          closedAt: null,
        },
      }));
    }
    return Promise.resolve(tool({}));
  };
}

describe("P03 inventory before reorder", () => {
  it("uses the hallway batteries on the shelf instead of checkout", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const turn = await executeTurn({
      utterance: "Order a battery for the hallway smoke alarm",
      state: emptyDialogue(),
      clock: CLOCK,
      callTool: scripted(calls, {
        options: [{
          optionId: "P-VW9V",
          name: "Voltwick 9V, 4-pack",
          brand: "Voltwick",
          priceUsd: "11.49",
          eta: "2026-10-22",
          kind: "generic",
          certified: null,
          recommended: false,
        }],
        excluded: [],
        onHand: { qty: 2, location: "Garage shelf", receivedNotInstalled: 0 },
        recommendedAction: "use_on_hand",
      }),
    });
    expect(turn.reply).toContain("two 9-volt");
    expect(turn.reply).toContain("garage shelf");
    expect(spokenSentences(turn.reply).every((sentence) => /^[A-Z]/.test(sentence)), turn.reply).toBe(true);
    expect(spokenSentences(turn.reply).some((sentence) => /nothing to buy/i.test(sentence) && /added a task/i.test(sentence))).toBe(true);
    expect(turn.reply).not.toMatch(/(^|[.!?]\s+)nothing\b/);
    expect(turn.reply).not.toContain("$11.49");
    expect(turn.reply).not.toMatch(/Want that one/i);
    expect(turn.reply).not.toMatch(/One batteries/);
    expect(calls.map((call) => call.name)).toEqual(["resolve_appliance", "find_parts", "create_task"]);
    expect(turn.steps.some((step) => step.tool === "prepare_checkout")).toBe(false);
    expect(turn.card?.tool).toBe("create_task");
    expect(turn.card?.context.onHand).toMatchObject({ name: "9V battery", qty: 2, location: "Garage shelf" });
    expect(calls.find((call) => call.name === "create_task")?.args.notes).toBe("9V battery x2, Garage shelf");
  });

  it("agrees the battery noun with the option count", async () => {
    const oneCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const one = await executeTurn({
      utterance: "Order a battery for the hallway smoke alarm",
      state: emptyDialogue(),
      clock: CLOCK,
      callTool: scripted(oneCalls, {
        options: [{
          optionId: "P-VW9V",
          name: "Voltwick 9V, 4-pack",
          brand: "Voltwick",
          priceUsd: "11.49",
          eta: "2026-10-22",
          kind: "generic",
          certified: null,
          recommended: true,
        }],
        excluded: [],
        onHand: { qty: 0, location: null, receivedNotInstalled: 0 },
        recommendedAction: "buy",
      }),
    });
    expect(one.reply).toMatch(/^One battery fits /);
    expect(one.reply).not.toMatch(/One batteries/);
    expect(one.reply).toContain("$11.49");
    expect(one.reply).toContain("Want that one?");

    const twoCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const two = await executeTurn({
      utterance: "Order a battery for the hallway smoke alarm",
      state: emptyDialogue(),
      clock: CLOCK,
      callTool: scripted(twoCalls, {
        options: [
          { optionId: "P-A", name: "Voltwick 9V, 4-pack", brand: "Voltwick", priceUsd: "11.49", eta: "2026-10-22", kind: "generic", certified: null, recommended: true },
          { optionId: "P-B", name: "Northcell 9V", brand: "Northcell", priceUsd: "12.00", eta: "2026-10-23", kind: "generic", certified: null, recommended: false },
        ],
        excluded: [],
        onHand: { qty: 0, location: null, receivedNotInstalled: 0 },
        recommendedAction: "buy",
      }),
    });
    expect(two.reply).toMatch(/^Two batteries fit /);
    expect(two.reply).not.toMatch(/One batteries/);
  });

  it("P09 says one 9-volt battery, and an arrived pack is not on the word on", async () => {
    async function stocked(qty: number, location: string): Promise<string> {
      const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
      const turn = await executeTurn({
        utterance: "Order a battery for the hallway smoke alarm",
        state: emptyDialogue(),
        clock: CLOCK,
        callTool: scripted(calls, {
          options: [],
          excluded: [],
          onHand: { qty, location, name: "9V battery", receivedNotInstalled: location.toLowerCase().includes("received") ? qty : 0 },
          recommendedAction: "use_on_hand",
        }),
      });
      return turn.reply;
    }

    const one = await stocked(1, "Garage shelf");
    expect(one).toMatch(/one 9-volt battery\b/i);
    expect(one).not.toMatch(/1 9-volt batteries/);
    expect(one).not.toMatch(/one 9-volt batteries/i);
    expect(one).toMatch(/on the garage shelf/i);
    expect(spokenSentences(one).every((sentence) => /^[A-Z]/.test(sentence)), one).toBe(true);
    expect(one).toMatch(/Nothing to buy, so I added a task/);

    const arrived = await stocked(1, "Received, not yet installed");
    expect(arrived).not.toMatch(/on the received/i);
    expect(arrived).toMatch(/one 9-volt battery that has arrived and is waiting to be installed/i);

    const pair = await stocked(2, "Received, not yet installed");
    expect(pair).toMatch(/two 9-volt batteries that have arrived and are waiting to be installed/i);
    expect(pair).not.toMatch(/on the received/i);
  });

  it("P09 says 1 day overdue when a due-today item slips one morning", async () => {
    const morning = await executeTurn({
      utterance: "",
      state: emptyDialogue(),
      clock: { iso: "2026-10-22T09:00:00-07:00", timeZone: "America/Los_Angeles" },
      callTool: (name) => {
        expect(name).toBe("get_upkeep_status");
        return Promise.resolve(tool({
          attention: [
            { applianceId: "ap_dryer", spokenName: "dryer", item: "vent_cleaning", how: "pro", bucket: "overdue", due: "2026-09-30", daysOverdue: 22 },
            { applianceId: "ap_fridge", spokenName: "fridge", item: "water_filter", how: "part", bucket: "overdue", due: "2026-10-21", daysOverdue: 1 },
          ],
          upcoming: [],
          inProgress: [],
          tasks: [],
        }));
      },
    });
    expect(morning.reply).toContain("1 day overdue");
    expect(morning.reply).not.toMatch(/1 days overdue/);
    expect(morning.reply).toContain("22 days overdue");
    expect(spokenSentences(morning.reply).every((sentence) => /^[A-Z]/.test(sentence)), morning.reply).toBe(true);
  });

  it("P09 replace-battery uses the shelf and does not invent a chirp", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const turn = await executeTurn({
      utterance: "Replace the hallway smoke alarm battery",
      state: emptyDialogue(),
      clock: CLOCK,
      callTool: scripted(calls, {
        options: [],
        excluded: [],
        onHand: { qty: 2, location: "Garage shelf", name: "9V battery", receivedNotInstalled: 0 },
        recommendedAction: "use_on_hand",
      }),
    });
    expect(turn.reply).toMatch(/two 9-volt batteries on the garage shelf/i);
    expect(turn.reply).toMatch(/Nothing to buy/);
    expect(turn.reply).not.toMatch(/chirp/i);
    expect(calls.map((call) => call.name)).toEqual(["resolve_appliance", "find_parts", "create_task"]);
    expect(spokenSentences(turn.reply).every((sentence) => /^[A-Z]/.test(sentence)), turn.reply).toBe(true);
  });
});

/** Spoken sentences. A price such as $24.99 is not a break. */
function spokenSentences(reply: string): string[] {
  return reply.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter((part) => part !== "");
}
