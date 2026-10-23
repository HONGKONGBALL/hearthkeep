/**
 * P-04 install close. A "Done" after a part order follows the server task.
 * Names, prices, and dates are fictional seed data.
 */
import { describe, expect, it } from "vitest";
import { emptyDialogue, executeTurn, type DialogueState, type ToolResponse } from "../apps/simulator/src/planner";

const FRIDAY = { iso: "2026-10-23T09:00:00-07:00", timeZone: "America/Los_Angeles" };

function tool(structured: Record<string, unknown>, isError = false): ToolResponse {
  return {
    isError,
    text: isError ? String(structured.message ?? "error") : "ok",
    structuredContent: structured,
    httpStatus: isError ? 400 : 200,
    ms: 3,
    sessionPrefix: "abcd1234",
    protocol: "2025-11-25",
    raw: structured,
  };
}

const FRIDGE_TASK = {
  taskId: "t_0001",
  title: "Install fridge water filter",
  applianceId: "ap_fridge",
  item: "water_filter",
  dueDate: "2026-10-23",
  notes: null,
  status: "open",
};

const FURNACE_TASK = {
  taskId: "t_0001",
  title: "Install furnace air filter",
  applianceId: "ap_furnace",
  item: "air_filter",
  dueDate: "2026-10-23",
  notes: null,
  status: "open",
};

function order(status: string, applianceId: string, item: string, name: string) {
  return {
    kind: "order",
    id: "ord_0001",
    status,
    applianceId,
    item,
    name,
    eta: "2026-10-23",
  };
}

describe("P04 install task close", () => {
  it("P04a logs the furnace filter from the server task, not a fridge water filter", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const state = emptyDialogue();
    state.lastTask = {
      taskId: "t_fridge",
      applianceId: "ap_fridge",
      item: "water_filter",
      title: "Install fridge water filter",
    };
    const turn = await executeTurn({
      utterance: "Done",
      state,
      clock: FRIDAY,
      callTool: (name, args) => {
        calls.push({ name, args });
        if (name === "get_upkeep_status") {
          return Promise.resolve(tool({
            attention: [],
            upcoming: [],
            inProgress: [order("delivered", "ap_furnace", "air_filter", "Loftaire 16x25x1 MERV 11, 3-pack")],
            tasks: [FURNACE_TASK],
          }));
        }
        if (name === "log_maintenance" && args.item === "water_filter") {
          return Promise.resolve(tool({ code: "ITEM_NOT_APPLICABLE", message: "The furnace doesn't take a water filter." }, true));
        }
        if (name === "log_maintenance") {
          return Promise.resolve(tool({
            lastDone: "2026-10-23",
            nextDue: "2027-01-21",
            closedTaskIds: ["t_0001"],
            inventoryAfter: { qty: 2, item: "air_filter", name: "Loftaire 16x25x1 MERV 11, 3-pack", location: "Received, not yet installed" },
          }));
        }
        return Promise.resolve(tool({}));
      },
    });
    expect(turn.reply).not.toContain("ITEM_NOT_APPLICABLE");
    expect(turn.reply).not.toContain("water filter");
    expect(turn.reply).not.toContain("9-volt");
    expect(calls.find((call) => call.name === "log_maintenance")?.args).toMatchObject({
      applianceId: "ap_furnace",
      item: "air_filter",
    });
    expect(turn.reply).toContain("January 2027");
  });

  it("P04b closes the open server task after the dialogue state was cleared", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const turn = await executeTurn({
      utterance: "Done",
      state: emptyDialogue(),
      clock: FRIDAY,
      callTool: (name, args) => {
        calls.push({ name, args });
        if (name === "get_upkeep_status") {
          return Promise.resolve(tool({
            attention: [],
            upcoming: [],
            inProgress: [order("delivered", "ap_fridge", "water_filter", "Rillstone CX-28")],
            tasks: [FRIDGE_TASK],
          }));
        }
        if (name === "log_maintenance") {
          return Promise.resolve(tool({
            lastDone: "2026-10-23",
            nextDue: "2027-04-21",
            closedTaskIds: ["t_0001"],
            inventoryAfter: { qty: 0, item: "water_filter", name: "Rillstone CX-28", location: "Received, not yet installed" },
          }));
        }
        return Promise.resolve(tool({}));
      },
    });
    expect(turn.reply).not.toMatch(/don't have a task|which chore/i);
    expect(turn.reply).not.toContain("9-volt");
    expect(turn.reply).toContain("April 2027");
    expect(calls.map((call) => call.name)).toEqual(["get_upkeep_status", "log_maintenance"]);
    expect(calls.find((call) => call.name === "log_maintenance")?.args).toMatchObject({
      applianceId: "ap_fridge",
      item: "water_filter",
    });
  });

  it("P04c leaves the schedule alone when the filter has not arrived", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const state: DialogueState = emptyDialogue();
    state.lastTask = {
      taskId: "t_battery",
      applianceId: "ap_smoke_hall",
      item: "battery",
      title: "Swap hallway smoke alarm battery",
    };
    const turn = await executeTurn({
      utterance: "Done, I swapped it",
      state,
      clock: { iso: "2026-10-21T09:00:00-07:00", timeZone: "America/Los_Angeles" },
      callTool: (name, args) => {
        calls.push({ name, args });
        if (name === "get_upkeep_status") {
          return Promise.resolve(tool({
            attention: [],
            upcoming: [],
            inProgress: [order("placed", "ap_fridge", "water_filter", "Rillstone CX-28")],
            tasks: [FRIDGE_TASK],
          }));
        }
        if (name === "log_maintenance") {
          return Promise.resolve(tool({
            lastDone: "2026-10-21",
            nextDue: "2027-10-21",
            closedTaskIds: ["t_battery"],
            inventoryAfter: { qty: 0, item: "battery", name: "9V battery", location: "Garage shelf" },
            speech: "Nice. 0 9-volt left, and the next battery change is due April 2027.",
          }));
        }
        return Promise.resolve(tool({}));
      },
    });
    expect(calls.map((call) => call.name)).not.toContain("log_maintenance");
    expect(turn.reply).not.toContain("9-volt");
    expect(turn.reply.toLowerCase()).toContain("hasn't arrived");
    expect(turn.reply.toLowerCase()).toContain("water filter");
    expect(turn.reply).toContain("Friday");
  });

  it("P04d describes an arrived filter as waiting to install and does not buy another", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const brief = await executeTurn({
      utterance: "What needs doing?",
      state: emptyDialogue(),
      clock: FRIDAY,
      callTool: (name, args) => {
        calls.push({ name, args });
        return Promise.resolve(tool({
          attention: [
            {
              applianceId: "ap_fridge",
              spokenName: "fridge",
              item: "water_filter",
              how: "part",
              bucket: "overdue",
              due: "2026-10-21",
              daysOverdue: 2,
            },
          ],
          upcoming: [],
          inProgress: [order("delivered", "ap_fridge", "water_filter", "Rillstone CX-28")],
          tasks: [FRIDGE_TASK],
        }));
      },
    });
    expect(brief.reply.toLowerCase()).toContain("arrived");
    expect(brief.reply.toLowerCase()).toContain("waiting to be installed");
    expect(brief.reply.toLowerCase()).not.toContain("overdue");
    expect(brief.reply).not.toContain("9-volt");
    expect(brief.reply).not.toContain("Order a new filter");
    const next = await executeTurn({
      utterance: "Handle it",
      state: brief.state,
      clock: FRIDAY,
      callTool: (name, args) => {
        calls.push({ name, args });
        return Promise.resolve(tool({ options: [], excluded: [], recommendedAction: "buy" }));
      },
    });
    expect(calls.map((call) => call.name)).not.toContain("find_parts");
    expect(calls.map((call) => call.name)).not.toContain("prepare_checkout");
    expect(next.reply).not.toContain("$24.99");
    expect(next.reply).not.toContain("9-volt");
  });
});

const BATTERY_TASK = {
  taskId: "t_0002",
  title: "Swap hallway smoke alarm battery",
  applianceId: "ap_smoke_hall",
  item: "battery",
  dueDate: "2026-10-21",
  notes: null,
  status: "open",
};

function twoTasks(inProgress: unknown[] = []) {
  return {
    attention: [],
    upcoming: [],
    inProgress,
    tasks: [BATTERY_TASK, FRIDGE_TASK],
  };
}

describe("A6 mark done picks the named task", () => {
  it("asks which task when several are open and the words do not name one", async () => {
    const calls: string[] = [];
    const state = emptyDialogue();
    state.lastTask = {
      taskId: "t_0002",
      applianceId: "ap_smoke_hall",
      item: "battery",
      title: "Swap hallway smoke alarm battery",
    };
    const turn = await executeTurn({
      utterance: "Done, I swapped it",
      state,
      clock: FRIDAY,
      callTool: (name) => {
        calls.push(name);
        return Promise.resolve(tool(twoTasks()));
      },
    });
    expect(calls).toEqual(["get_upkeep_status"]);
    expect(turn.reply).toBe("Which one, the hallway smoke alarm battery or the fridge water filter?");
    expect(turn.reply).not.toContain("9-volt");
    expect(turn.card?.uri).toBe("ui://hearthkeep/status-card.html");
    expect(turn.state.pendingTaskChoice?.map((choice) => choice.taskId)).toEqual(["t_0002", "t_0001"]);
    expect(turn.state.lastTask?.taskId).toBe("t_0002");
  });

  it("closes the task named on the card button instead of lastTask", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const state = emptyDialogue();
    state.lastTask = {
      taskId: "t_0002",
      applianceId: "ap_smoke_hall",
      item: "battery",
      title: "Swap hallway smoke alarm battery",
    };
    const turn = await executeTurn({
      utterance: "Done, I swapped it task t_0001",
      state,
      clock: FRIDAY,
      callTool: (name, args) => {
        calls.push({ name, args });
        if (name === "get_upkeep_status") return Promise.resolve(tool(twoTasks()));
        if (name === "log_maintenance") {
          return Promise.resolve(tool({
            lastDone: "2026-10-23",
            nextDue: "2027-04-21",
            closedTaskIds: ["t_0001"],
            inventoryAfter: { qty: 0, item: "water_filter", name: "Rillstone CX-28", location: "Received, not yet installed" },
          }));
        }
        return Promise.resolve(tool({}));
      },
    });
    expect(turn.reply).toContain("fridge water filter");
    expect(turn.reply).toContain("April 2027");
    expect(turn.reply).not.toContain("9-volt");
    expect(calls.map((call) => call.name)).toEqual(["get_upkeep_status", "log_maintenance"]);
    expect(calls.find((call) => call.name === "log_maintenance")?.args).toMatchObject({
      applianceId: "ap_fridge",
      item: "water_filter",
    });
    expect(turn.state.pendingTaskChoice).toBeNull();
  });

  it("closes the task the person names after the question", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const asked = await executeTurn({
      utterance: "Done",
      state: emptyDialogue(),
      clock: FRIDAY,
      callTool: (name, args) => {
        calls.push({ name, args });
        return Promise.resolve(tool(twoTasks()));
      },
    });
    expect(asked.reply).toMatch(/which one/i);
    const turn = await executeTurn({
      utterance: "the fridge water filter",
      state: asked.state,
      clock: FRIDAY,
      callTool: (name, args) => {
        calls.push({ name, args });
        if (name === "get_upkeep_status") return Promise.resolve(tool(twoTasks()));
        return Promise.resolve(tool({
          lastDone: "2026-10-23",
          nextDue: "2027-04-21",
          closedTaskIds: ["t_0001"],
          inventoryAfter: { qty: 0, item: "water_filter", name: "Rillstone CX-28", location: "Received, not yet installed" },
        }));
      },
    });
    expect(turn.reply).toContain("April 2027");
    expect(turn.reply).not.toContain("9-volt");
    expect(calls.filter((call) => call.name === "log_maintenance")).toEqual([
      { name: "log_maintenance", args: { applianceId: "ap_fridge", item: "water_filter", consumeInventory: true } },
    ]);
  });

  it("does not log the battery when the install button is clicked before the filter arrives", async () => {
    const calls: string[] = [];
    const state = emptyDialogue();
    state.lastTask = {
      taskId: "t_0002",
      applianceId: "ap_smoke_hall",
      item: "battery",
      title: "Swap hallway smoke alarm battery",
    };
    const turn = await executeTurn({
      utterance: "Done, I swapped it task t_0001",
      state,
      clock: { iso: "2026-10-21T09:00:00-07:00", timeZone: "America/Los_Angeles" },
      callTool: (name) => {
        calls.push(name);
        return Promise.resolve(tool(twoTasks([order("placed", "ap_fridge", "water_filter", "Rillstone CX-28")])));
      },
    });
    expect(calls).toEqual(["get_upkeep_status"]);
    expect(turn.reply.toLowerCase()).toContain("hasn't arrived");
    expect(turn.reply.toLowerCase()).toContain("water filter");
    expect(turn.reply).not.toContain("9-volt");
  });

  it("does not close a different open task when the named id is missing", async () => {
    const calls: string[] = [];
    const turn = await executeTurn({
      utterance: "Done, I swapped it task t_0002",
      state: emptyDialogue(),
      clock: FRIDAY,
      callTool: (name) => {
        calls.push(name);
        return Promise.resolve(tool({
          attention: [],
          upcoming: [],
          inProgress: [],
          tasks: [FRIDGE_TASK],
        }));
      },
    });
    expect(calls).toEqual(["get_upkeep_status"]);
    expect(turn.reply).toBe("I don't have a task waiting to close.");
  });
});
