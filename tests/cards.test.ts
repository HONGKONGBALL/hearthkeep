/**
 * Card documents stay offline and render fictional tool results in the host bridge.
 */
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { CARD_RESOURCES, MCP_APP_HTML_MIME } from "../apps/mcp-server/src/cards";

function render(html: string, data: Record<string, unknown>, context: Record<string, unknown> = {}): string {
  const main = {
    innerHTML: "",
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return { addEventListener() {} };
    },
  };
  const sandbox: Record<string, unknown> = {
    document: {
      querySelector: () => main,
      addEventListener() {},
      activeElement: null,
    },
    window: { addEventListener() {} },
    parent: { postMessage() {} },
    console,
  };
  sandbox.globalThis = sandbox;
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1] ?? "";
  vm.runInNewContext(script, sandbox);
  const renderCard = sandbox.renderCard as (data: unknown, context: unknown, tool: string) => void;
  renderCard(data, context, "");
  return main.innerHTML;
}

describe("card resources", () => {
  it("serves five offline ui templates", () => {
    expect(CARD_RESOURCES.map((card) => card.uri)).toEqual([
      "ui://hearthkeep/status-card.html",
      "ui://hearthkeep/options-carousel.html",
      "ui://hearthkeep/checkout-card.html",
      "ui://hearthkeep/receipt-card.html",
      "ui://hearthkeep/task-card.html",
    ]);
    for (const card of CARD_RESOURCES) {
      expect(card.mimeType).toBe(MCP_APP_HTML_MIME);
      expect(card.text).toContain("Fictional data");
      expect(card.text).toContain("font:20px");
      expect(card.text).toContain("prefers-reduced-motion");
      expect(card.text).not.toMatch(/https?:\/\//i);
      expect(card.text).not.toContain("tools/call");
    }
  });

  it("renders the status card sections", () => {
    const html = render(CARD_RESOURCES[0]?.text ?? "", {
      attention: [
        { spokenName: "dryer", item: "vent_cleaning", bucket: "overdue", daysOverdue: 21, due: "2026-09-30" },
        { spokenName: "fridge", item: "water_filter", bucket: "due_today", due: "2026-10-21" },
      ],
      upcoming: [
        { spokenName: "hallway smoke alarm", item: "battery", due: "2026-10-28" },
        { spokenName: "furnace", item: "air_filter", due: "2026-10-30" },
      ],
      inProgress: [
        { kind: "order", name: "Rillstone CX-28", status: "shipped", item: "water_filter" },
        { kind: "booking", applianceId: "ap_dryer", item: "vent_cleaning", name: "vent cleaning", windowStart: "2026-10-27T09:00:00-07:00" },
      ],
      tasks: [],
    }, { applianceNames: { ap_dryer: "dryer" } });
    expect(html).toContain("Needs attention");
    expect(html).toContain("Dryer vent cleaning, 21 days overdue");
    expect(html).toContain("Fridge water filter, due today");
    expect(html).toContain("Coming up");
    expect(html).toContain("Hallway smoke alarm battery, Wed, Oct 28");
    expect(html).toContain("Replace battery");
    expect(html).toContain('aria-label="Handle it, Dryer vent cleaning"');
    expect(html).toContain('aria-label="Handle it, Fridge water filter"');
    expect(html).toContain('aria-label="Replace battery, Hallway smoke alarm battery"');
    expect(html).toContain('data-intent="Replace the hallway smoke alarm battery"');
    expect(html).not.toMatch(/keeps chirping/);
    expect(html).toContain("Furnace filter, Fri, Oct 30");
    expect(html).toContain("On the way / Booked");
    expect(html).toContain("Rillstone CX-28 (Shipped)");
    expect(html).toContain("Dryer vent cleaning (Tue, Oct 27)");
    expect(render(CARD_RESOURCES[0]?.text ?? "", { attention: [], upcoming: [], inProgress: [], tasks: [] })).toContain("All caught up");

    const slipped = render(CARD_RESOURCES[0]?.text ?? "", {
      attention: [
        { spokenName: "fridge", item: "water_filter", bucket: "overdue", daysOverdue: 1, due: "2026-10-21" },
        { spokenName: "dryer", item: "vent_cleaning", bucket: "overdue", daysOverdue: 22, due: "2026-09-30" },
      ],
      upcoming: [],
      inProgress: [],
      tasks: [],
    });
    expect(slipped).toContain("Fridge water filter, 1 day overdue");
    expect(slipped).toContain("Dryer vent cleaning, 22 days overdue");
    expect(slipped).not.toContain("1 days overdue");
  });

  it("renders part and service options", () => {
    const parts = render(CARD_RESOURCES[1]?.text ?? "", {
      options: [
        { name: "Rillstone CX-28", brand: "Rillstone", priceUsd: "24.99", eta: "2026-10-23", kind: "compatible", certified: true, recommended: true },
        { name: "Ferngate FG-WF2", brand: "Ferngate", priceUsd: "49.99", eta: "2026-10-23", kind: "oem", certified: true, recommended: false },
      ],
      excluded: [{ name: "Bargo ZX-28", reason: "POLICY_UNCERTIFIED" }],
    }, { fitsLine: "Fits your Ferngate FG-28" });
    expect(parts).toContain("Rillstone CX-28");
    expect(parts).toContain("$24.99");
    expect(parts).toContain("Compatible");
    expect(parts).toContain("Certified");
    expect(parts).toContain("Recommended");
    expect(parts).toContain("Arrives Fri, Oct 23");
    expect(parts).toContain("OEM");
    expect(parts).toContain("Not shown: Bargo ZX-28, not certified (your rules)");
    expect(parts).toContain('data-intent="Choose Rillstone CX-28"');
    expect(parts).toContain('class="act">Choose</span>');
    expect(CARD_RESOURCES[1]?.text).toContain("flex-flow:row nowrap");

    const slots = render(CARD_RESOURCES[1]?.text ?? "", {
      slots: [
        { slotId: "S-1027A", provider: "Ventora Home Care", date: "2026-10-27", start: "2026-10-27T09:00:00-07:00", end: "2026-10-27T11:00:00-07:00", priceUsd: "89.00", overCap: true },
      ],
    });
    expect(slots).toContain("Tue, Oct 27, 9-11 AM");
    expect(slots).toContain("Ventora Home Care");
    expect(slots).toContain("$89.00");
    expect(slots).toContain("Over $60 limit");
    expect(slots).toContain('data-intent="Tuesday morning"');
  });

  it("renders checkout, receipt, and task cards", () => {
    const checkout = CARD_RESOURCES[2]?.text ?? "";
    expect(checkout).not.toContain("<input");
    const part = render(checkout, {
      lines: [{ name: "Rillstone CX-28", lineTotalUsd: "24.99" }],
      totalUsd: "24.99",
      capUsd: "60.00",
      overCap: false,
      eta: "2026-10-23",
    });
    expect(part).toContain("Total $24.99");
    expect(part).toContain("Arrives Fri, Oct 23");
    expect(part).toContain("Within your $60 limit");
    expect(part).toContain("Say your purchase code");

    const service = render(checkout, {
      lines: [{ provider: "Ventora Home Care", lineTotalUsd: "89.00" }],
      totalUsd: "89.00",
      capUsd: "60.00",
      overCap: true,
      overByUsd: "29.00",
      slot: { provider: "Ventora Home Care", start: "2026-10-27T09:00:00-07:00", end: "2026-10-27T11:00:00-07:00" },
    });
    expect(service).toContain("Total $89.00");
    expect(service).toContain("Over your $60 limit by $29.00");
    expect(service).toContain("Say 'approve' and your code");

    const receipt = render(CARD_RESOURCES[3]?.text ?? "", {
      kind: "order",
      id: "ord_0001",
      orderId: "ord_0001",
      status: "placed",
      eta: "2026-10-23",
      mock: true,
    }, { lines: [{ name: "Rillstone CX-28" }], totalUsd: "24.99" });
    expect(receipt).toContain("ord_0001");
    expect(receipt).toContain("Placed");
    expect(receipt).toContain('class="step active"');
    expect(receipt).toContain("Mock order, no real purchase or payment");

    const task = render(CARD_RESOURCES[4]?.text ?? "", {
      taskId: "t_0002",
      task: { title: "Swap hallway smoke alarm battery", dueDate: "2026-10-21", status: "open" },
    }, {
      title: "Swap hallway smoke alarm battery",
      applianceName: "hallway smoke alarm",
      onHand: { name: "9V battery", qty: 2, location: "Garage shelf", item: "battery" },
      done: false,
    });
    expect(task).toContain("Swap hallway smoke alarm battery");
    expect(task).toContain("Due");
    expect(task).toContain("Wed, Oct 21");
    expect(task).toContain("Appliance");
    expect(task).toContain("Hallway smoke alarm");
    expect(task).toContain("Supplies");
    expect(task).toContain("9V battery x2, Garage shelf");
    expect(task).toContain("Mark done");
    expect(task).toContain('aria-label="Mark done, Swap hallway smoke alarm battery"');
    expect(task).not.toMatch(/>hallway smoke alarm</);

    const closed = render(CARD_RESOURCES[4]?.text ?? "", {
      nextDue: "2027-10-21",
      inventoryAfter: { name: "9V battery", qty: 1, location: "Garage shelf" },
    }, {
      title: "Swap hallway smoke alarm battery",
      applianceName: "hallway smoke alarm",
      done: true,
    });
    expect(closed).toContain("Next due");
    expect(closed).toContain("October 2027");
    expect(closed).not.toContain(">Due<");
    expect(closed).toContain("Appliance");
    expect(closed).toContain("Hallway smoke alarm");
    expect(closed).toContain("Done");
  });

  it("P04b marks an arrived install task done from the status card", () => {
    const html = render(CARD_RESOURCES[0]?.text ?? "", {
      attention: [],
      upcoming: [],
      inProgress: [
        { kind: "order", id: "ord_0001", status: "delivered", applianceId: "ap_fridge", item: "water_filter", name: "Rillstone CX-28", eta: "2026-10-23" },
      ],
      tasks: [
        { taskId: "t_0001", title: "Install fridge water filter", applianceId: "ap_fridge", item: "water_filter", dueDate: "2026-10-23", notes: null, status: "open" },
      ],
    });
    expect(html).toContain("Open tasks");
    expect(html).toContain("Install fridge water filter");
    expect(html.toLowerCase()).toContain("arrived");
    expect(html.toLowerCase()).toContain("waiting to install");
    expect(html).toContain("Mark done");
    expect(html).toContain('aria-label="Mark done, Install fridge water filter"');
    expect(html).toContain('data-intent="Done, I swapped it"');
  });
});
