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
    expect(wrong.card).toBeNull();
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
