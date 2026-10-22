/**
 * Scripted household flows F1–F8 against the local MCP server.
 * Names, prices, and the purchase code are fictional seed data.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HearthkeepClient } from "../apps/simulator/src/mcp-client";
import {
  HAZARD_REPLY,
  SCOPE_REPLY,
  SIM_EPOCH,
  SOUND_QUESTION,
  WHICH_ALARM,
  emptyDialogue,
  executeTurn,
  type Clock,
  type DialogueState,
  type TurnResult,
} from "../apps/simulator/src/planner";
import { start, stop, type Running } from "./protocol/qa-harness";

describe("planner flows on the MCP server", () => {
  let running: Running;
  let client: HearthkeepClient;
  let state: DialogueState;
  let clock: Clock;

  beforeAll(async () => {
    running = await start("json");
    client = new HearthkeepClient(running.base, "http://127.0.0.1:5173");
    await client.initialize();
    const health = await client.health();
    clock = { iso: health.simNow ?? SIM_EPOCH };
    state = emptyDialogue();
  });

  afterAll(async () => {
    await stop(running);
  });

  async function say(utterance: string): Promise<TurnResult> {
    const turn = await executeTurn({
      utterance,
      state,
      clock,
      callTool: (name, args) => client.callTool(name, args),
    });
    state = turn.state;
    return turn;
  }

  it("reads the five card resources", async () => {
    const resources = await client.listResources();
    expect(resources.map((resource) => resource.uri)).toEqual([
      "ui://hearthkeep/status-card.html",
      "ui://hearthkeep/options-carousel.html",
      "ui://hearthkeep/checkout-card.html",
      "ui://hearthkeep/receipt-card.html",
      "ui://hearthkeep/task-card.html",
    ]);
    for (const resource of resources) {
      expect(resource.mimeType).toBe("text/html;profile=mcp-app");
      const read = await client.readResource(resource.uri);
      expect(read.text).toContain("Fictional data");
      expect(read.text).not.toMatch(/https?:\/\//i);
    }
  });

  it("F1 briefs overdue vent cleaning and today's fridge filter", async () => {
    const turn = await say("What needs doing?");
    expect(turn.reply).toContain("dryer vent");
    expect(turn.reply).toContain("overdue");
    expect(turn.reply).toContain("fridge water filter");
    expect(turn.reply).toContain("due today");
    expect(turn.card?.uri).toBe("ui://hearthkeep/status-card.html");
    expect(turn.steps.map((step) => step.tool)).toEqual(["get_upkeep_status"]);
  });

  it("F2 orders the certified fridge filter after the code", async () => {
    const offered = await say("Order a new filter for the fridge");
    expect(offered.reply).toContain("Ferngate FG-28");
    expect(offered.reply).toContain("Rillstone CX-28");
    expect(offered.reply).toContain("$24.99");
    expect(offered.reply).toContain("Friday");
    expect(offered.card?.tool).toBe("find_parts");
    expect(offered.steps.map((step) => step.tool)).toEqual(["resolve_appliance", "find_parts"]);

    const priced = await say("Yes, the CX-28");
    expect(priced.reply).toContain("$24.99");
    expect(priced.reply).toContain("October 23");
    expect(priced.reply).toContain("purchase code");
    expect(priced.card?.tool).toBe("prepare_checkout");
    expect(priced.steps.map((step) => step.tool)).toEqual(["prepare_checkout"]);

    const ordered = await say("2468");
    expect(ordered.displayUtterance).toBe("••••");
    expect(ordered.reply).toContain("Ordered");
    expect(ordered.card?.tool).toBe("confirm_purchase");
    expect(JSON.stringify(ordered.steps)).not.toContain("2468");
    expect(ordered.steps[0]?.args.code).toBe("••••");
  });

  it("F4 books the dryer vent after approve, and a bare code does not", async () => {
    const offered = await say("Book someone to clean the dryer vent next week");
    expect(offered.reply).toContain("three openings");
    expect(offered.reply).toContain("Tuesday");
    expect(offered.reply).toContain("Ventora Home Care");
    expect(offered.reply).toContain("$89");
    expect(offered.card?.tool).toBe("find_service_slots");

    const priced = await say("Tuesday morning");
    expect(priced.reply).toContain("$89");
    expect(priced.reply).toContain("$29");
    expect(priced.reply.toLowerCase()).toContain("approve");
    expect(priced.card?.tool).toBe("prepare_checkout");

    const blocked = await say("2468");
    expect(blocked.reply.toLowerCase()).toContain("approve");
    expect(blocked.card).toBeNull();
    expect(JSON.stringify(blocked)).not.toContain("2468");

    const booked = await say("Approve 2468");
    expect(booked.reply).toContain("Booked");
    expect(booked.reply).toContain("Tuesday");
    expect(booked.reply).toContain("October 27");
    expect(booked.card?.uri).toBe("ui://hearthkeep/receipt-card.html");
    expect(JSON.stringify(booked)).not.toContain("2468");
  });

  it("F5 next morning sees the shipment and the booking", async () => {
    clock = { iso: await client.advanceDays(1) };
    state = emptyDialogue();
    const turn = await say("What needs doing?");
    expect(turn.reply).toContain("shipped");
    expect(turn.reply).toContain("tomorrow");
    expect(turn.reply).toContain("booked");
    expect(turn.reply).toContain("Tuesday");
    expect(turn.card?.tool).toBe("get_upkeep_status");
  });

  it("F3 uses the battery on the shelf and logs the swap", async () => {
    await client.resetSim();
    clock = { iso: SIM_EPOCH };
    state = emptyDialogue();
    const first = await say("The hallway smoke alarm keeps chirping");
    expect(first.reply.toLowerCase()).toContain("low battery");
    expect(first.reply).toContain("two 9-volt");
    expect(first.reply).toContain("garage shelf");
    expect(first.reply.toLowerCase()).toContain("nothing to buy");
    expect(first.card?.tool).toBe("create_task");
    const tools = first.steps.map((step) => step.tool);
    expect(tools).toContain("diagnose_symptom");
    expect(tools).toContain("find_parts");
    expect(tools).toContain("create_task");
    expect(tools).not.toContain("prepare_checkout");

    const done = await say("Done, I swapped it");
    expect(done.reply).toContain("One 9-volt left");
    expect(done.reply).toContain("October 2027");
    expect(done.steps.map((step) => step.tool)).toEqual(["log_maintenance"]);
  });

  it("F6 registers a water heater and recalls the flush", async () => {
    const added = await say("I just installed a new water heater, a Brimwell WH-40, in the garage");
    expect(added.reply).toContain("Brimwell WH-40");
    expect(added.reply).toContain("October 2027");
    expect(added.steps.map((step) => step.tool)).toEqual(["register_appliance"]);
    state = emptyDialogue();
    const due = await say("When is the water heater due?");
    expect(due.reply).toContain("flush");
    expect(due.reply).toContain("October 2027");
  });

  it("F7 stops on a gas hazard with no tool calls", async () => {
    const turn = await say("I smell gas in the kitchen");
    expect(turn.reply).toBe(HAZARD_REPLY);
    expect(turn.reply).toContain("leave");
    expect(turn.reply).toContain("emergency number");
    expect(turn.guards).toContain("Hazard guard");
    expect(turn.steps).toHaveLength(0);
    expect(turn.card).toBeNull();
  });

  it("F8 clarifies the sound and the bedroom alarm", async () => {
    const sound = await say("The smoke alarm is beeping");
    expect(sound.reply).toBe(SOUND_QUESTION);
    expect(sound.steps).toHaveLength(0);
    const which = await say("Just a chirp");
    expect(which.reply).toBe(WHICH_ALARM);
    expect(which.reply).toContain("hallway");
    expect(which.reply).toContain("main bedroom");
    const bedroom = await say("Bedroom");
    expect(bedroom.reply.toLowerCase()).toContain("low battery");
    expect(bedroom.card?.tool).toBe("create_task");
    const scary = await say("The smoke alarm is beeping");
    expect(scary.reply).toBe(SOUND_QUESTION);
    const hazard = await say("It keeps sounding");
    expect(hazard.reply).toBe(HAZARD_REPLY);
    expect(hazard.steps).toHaveLength(0);
  });

  it("cancels a quote and rejects a code with nothing pending", async () => {
    await client.resetSim();
    clock = { iso: SIM_EPOCH };
    state = emptyDialogue();
    await say("Order a new filter for the fridge");
    await say("Yes, the CX-28");
    const cancelled = await say("Cancel");
    expect(cancelled.reply).toContain("Okay, I won't order it.");
    const coded = await say("2468");
    expect(coded.reply).toContain("nothing waiting for a code");
    expect(coded.displayUtterance).toBe("••••");
    expect(JSON.stringify(coded)).not.toContain("2468");
    const weather = await say("What's the weather?");
    expect(weather.reply).toBe(SCOPE_REPLY);
    expect(weather.steps).toHaveLength(0);
  });
});
