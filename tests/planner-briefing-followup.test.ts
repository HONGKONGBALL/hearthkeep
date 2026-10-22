/**
 * Briefing follow-up. "Want me to handle them?" must accept a plain yes.
 * Household names and prices are fictional.
 */
import { describe, expect, it } from "vitest";
import {
  SCOPE_REPLY,
  SIM_EPOCH,
  emptyDialogue,
  executeTurn,
  parseUtterance,
  type DialogueState,
  type ToolCaller,
  type ToolResponse,
} from "../apps/simulator/src/planner";

const CLOCK = { iso: SIM_EPOCH, timeZone: "America/Los_Angeles" };

const AFFIRMATIVES = ["Yes", "Yeah", "Yep", "Sure", "Handle them", "Handle it", "Yes, handle them", "Sure thing"];

interface ChoreRow {
  item: string;
  spokenName: string;
  how?: string;
}

function tool(structured: Record<string, unknown>): ToolResponse {
  return {
    isError: false,
    text: "ok",
    structuredContent: structured,
    httpStatus: 200,
    ms: 3,
    sessionPrefix: "abcd1234",
    protocol: "2025-11-25",
    raw: structured,
  };
}

function choresOf(state: DialogueState): ChoreRow[] {
  const pending = (state as DialogueState & { pendingChores?: ChoreRow[] }).pendingChores;
  return pending ?? [];
}

function attention(rows: Array<Record<string, unknown>>): Record<string, unknown> {
  return { attention: rows, upcoming: [], inProgress: [], tasks: [] };
}

const DRYER = {
  applianceId: "ap_dryer",
  spokenName: "dryer",
  item: "vent_cleaning",
  how: "pro",
  bucket: "overdue",
  due: "2026-09-30",
  daysOverdue: 21,
};

const FRIDGE = {
  applianceId: "ap_fridge",
  spokenName: "fridge",
  item: "water_filter",
  how: "part",
  bucket: "due_today",
  due: "2026-10-21",
};

const DRYER_APPLIANCE = {
  id: "ap_dryer",
  spokenName: "dryer",
  maker: "Tumblewell",
  model: "TD-5",
  product: "dryer",
  location: "Laundry",
};

const FRIDGE_APPLIANCE = {
  id: "ap_fridge",
  spokenName: "fridge",
  maker: "Ferngate",
  model: "FG-28",
  product: "fridge",
  location: "Kitchen",
};

function dispatcher(status: Record<string, unknown>): ToolCaller {
  return (name, args) => {
    if (name === "get_upkeep_status") return Promise.resolve(tool(status));
    if (name === "resolve_appliance") {
      const query = String(args.query ?? "");
      const appliance = /fridge|filter/.test(query) && !/dryer|vent/.test(query) ? FRIDGE_APPLIANCE : DRYER_APPLIANCE;
      return Promise.resolve(tool({ status: "match", appliance, speech: "matched" }));
    }
    if (name === "find_service_slots") {
      const slot = (id: string, day: string, hour: string) => ({
        slotId: id,
        provider: "Ventora Home Care",
        date: day,
        start: `${day}T${hour}:00:00-07:00`,
        end: `${day}T${String(Number(hour) + 3).padStart(2, "0")}:00:00-07:00`,
        priceUsd: "89.00",
      });
      return Promise.resolve(tool({
        slots: [
          slot("slot_1", "2026-10-27", "09"),
          slot("slot_2", "2026-10-28", "13"),
          slot("slot_3", "2026-10-29", "09"),
        ],
      }));
    }
    if (name === "find_parts") {
      return Promise.resolve(tool({
        options: [{
          optionId: "opt_cx",
          name: "Rillstone CX-28",
          priceUsd: "24.99",
          eta: "2026-10-23",
          recommended: true,
          certified: true,
          kind: "compatible",
        }],
        onHand: { name: "filter", qty: 0, location: null },
      }));
    }
    return Promise.reject(new Error(`unexpected tool ${name}`));
  };
}

function isDeadEnd(reply: string): boolean {
  const lower = reply.toLowerCase();
  return lower.includes("don't have options") || lower.includes("do not have options") || reply === SCOPE_REPLY;
}

describe("briefing follow-up", () => {
  it("saves the briefing chores and continues each affirmative into the first one", async () => {
    const callTool = dispatcher(attention([DRYER, FRIDGE]));
    const brief = await executeTurn({
      utterance: "What needs doing?",
      state: emptyDialogue(),
      clock: CLOCK,
      callTool,
    });
    expect(brief.reply).toContain("Want me to handle them?");
    expect(choresOf(brief.state).map((chore) => chore.item)).toEqual(["vent_cleaning", "water_filter"]);

    for (const utterance of AFFIRMATIVES) {
      const parsed = parseUtterance(utterance, brief.state);
      expect(["choose_option", "out_of_scope"], utterance).not.toContain(parsed.intent);
      const next = await executeTurn({
        utterance,
        state: structuredClone(brief.state),
        clock: CLOCK,
        callTool,
      });
      expect(isDeadEnd(next.reply), `${utterance}: ${next.reply}`).toBe(false);
      expect(next.reply, utterance).toContain("three openings");
      expect(next.reply, utterance).toContain("Tuesday");
      expect(next.reply, utterance).toContain("$89");
      expect(next.reply.toLowerCase(), utterance).toContain("dryer");
      expect(next.steps.map((step) => step.tool), utterance).toEqual(["resolve_appliance", "find_service_slots"]);
      expect(next.steps[1]?.args.item, utterance).toBe("vent_cleaning");
      expect(next.displayUtterance, utterance).toBe(utterance);
    }
  });

  it("starts the only chore when the briefing names one", async () => {
    const callTool = dispatcher(attention([FRIDGE]));
    const brief = await executeTurn({
      utterance: "",
      state: emptyDialogue(),
      clock: CLOCK,
      callTool,
    });
    expect(brief.reply).toContain("Want me to handle it?");
    expect(choresOf(brief.state).map((chore) => chore.item)).toEqual(["water_filter"]);
    const next = await executeTurn({
      utterance: "Yes",
      state: brief.state,
      clock: CLOCK,
      callTool,
    });
    expect(isDeadEnd(next.reply)).toBe(false);
    expect(next.reply).toContain("Rillstone CX-28");
    expect(next.reply).toContain("$24.99");
    expect(next.steps.map((step) => step.tool)).toEqual(["resolve_appliance", "find_parts"]);
    expect(next.steps[1]?.args.item).toBe("water_filter");
  });

  it("still chooses a pending part when the user says yes", async () => {
    const state = emptyDialogue();
    state.pendingOptions = [
      { kind: "part", id: "P-CX28", name: "Rillstone CX-28", applianceId: "ap_fridge", item: "water_filter", recommended: true, partKind: "compatible" },
    ];
    state.optionsTurnsLeft = 3;
    (state as DialogueState & { pendingChores?: ChoreRow[] }).pendingChores = [
      { item: "vent_cleaning", spokenName: "dryer", how: "pro" },
    ];
    const chosen = await executeTurn({
      utterance: "Yes",
      state,
      clock: CLOCK,
      callTool: (name, args) => {
        expect(name).toBe("prepare_checkout");
        expect(args).toEqual({ items: [{ type: "part", optionId: "P-CX28", qty: 1, forApplianceId: "ap_fridge" }] });
        return Promise.resolve(tool({
          quoteId: "q_0001",
          kind: "part",
          lines: [],
          totalUsd: "24.99",
          capUsd: "60.00",
          overCap: false,
          eta: "2026-10-23",
        }));
      },
    });
    expect(chosen.reply).toContain("$24.99");
    expect(chosen.reply).toContain("purchase code");
    expect(chosen.steps.map((step) => step.tool)).toEqual(["prepare_checkout"]);
  });

  it("does not invent a chore when nothing needs attention", async () => {
    const brief = await executeTurn({
      utterance: "What needs doing?",
      state: emptyDialogue(),
      clock: CLOCK,
      callTool: (name) => {
        expect(name).toBe("get_upkeep_status");
        return Promise.resolve(tool(attention([])));
      },
    });
    expect(brief.reply.toLowerCase()).not.toContain("want me to handle");
    expect(choresOf(brief.state)).toEqual([]);
    const yes = await executeTurn({
      utterance: "Yes",
      state: brief.state,
      clock: CLOCK,
      callTool: () => Promise.reject(new Error("should not be called")),
    });
    expect(yes.steps).toHaveLength(0);
    expect(parseUtterance("Handle them").intent).toBe("out_of_scope");
    expect(parseUtterance("Sure").intent).toBe("out_of_scope");
  });
});
