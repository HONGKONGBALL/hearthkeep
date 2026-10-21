/**
 * Write P0 MCP tools. Prices, brands, and the purchase code are fictional simulation data.
 * confirm_purchase is idempotent and open-world and keeps the default destructive hint.
 * The other writes set destructiveHint false. Each tool calls packages/core.
 */
import {
  confirmPurchase,
  createTask,
  logMaintenance,
  prepareCheckout,
  registerAppliance,
  type Repository,
} from "@hearthkeep/core";
import { z } from "zod";

export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

/** Local writes. destructiveHint is false; they are not open-world. */
const LOCAL_WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

/** Idempotent on maker + model + location. Still not destructive or open-world. */
const REGISTER_WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/**
 * Spending money keeps the MCP default destructive hint (true).
 * Idempotent per quote, and open-world because it places an order or booking.
 */
const CONFIRM_WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
};

export interface WriteToolOptions {
  name: string;
  description: string;
  annotations: ToolAnnotations;
  input: z.ZodType;
  output: z.ZodType;
  run: (repo: Repository, args: never) => { speech: string; structured: object };
}

function writeTool<S extends z.ZodType>(options: {
  name: string;
  description: string;
  annotations: ToolAnnotations;
  input: S;
  output: z.ZodType;
  run: (repo: Repository, args: z.output<S>) => { speech: string; structured: object };
}): WriteToolOptions {
  return options as unknown as WriteToolOptions;
}

const howSchema = z.enum(["part", "pro", "maintenance"]);

const registerSchedule = z
  .object({
    item: z.string(),
    how: howSchema,
    everyDays: z.number().int().nullable(),
    trigger: z.enum(["interval", "on_failure"]),
    lastDone: z.string().nullable(),
    nextDue: z.string().nullable(),
    spec: z.string().nullable(),
    maxMerv: z.number().int().nullable(),
  })
  .strict();

const registerInput = z
  .object({
    type: z.string().min(1),
    maker: z.string().min(1),
    model: z.string().min(1),
    location: z.string().min(1),
    installedOn: z.string().min(1).optional(),
  })
  .strict();

const registerOutput = z
  .object({
    applianceId: z.string(),
    created: z.boolean(),
    scheduleSource: z.enum(["catalog", "none"]),
    schedule: z.array(registerSchedule),
  })
  .strict();

const partItem = z
  .object({
    type: z.literal("part"),
    optionId: z.string().min(1),
    qty: z.number().int().min(1).max(10),
    forApplianceId: z.string().min(1),
  })
  .strict();

const serviceItem = z
  .object({
    type: z.literal("service"),
    slotId: z.string().min(1),
  })
  .strict();

const checkoutInput = z
  .object({
    items: z.array(z.discriminatedUnion("type", [partItem, serviceItem])).min(1).max(3),
  })
  .strict();

const partLine = z
  .object({
    type: z.literal("part"),
    optionId: z.string(),
    qty: z.number().int(),
    forApplianceId: z.string(),
    item: z.string(),
    name: z.string(),
    unitPriceUsd: z.string(),
    lineTotalUsd: z.string(),
    eta: z.string(),
    leadDays: z.number().int(),
  })
  .strict();

const serviceLine = z
  .object({
    type: z.literal("service"),
    slotId: z.string(),
    applianceId: z.string(),
    item: z.string(),
    provider: z.string(),
    windowStart: z.string(),
    windowEnd: z.string(),
    priceUsd: z.string(),
    lineTotalUsd: z.string(),
  })
  .strict();

const checkoutSlot = z
  .object({
    slotId: z.string(),
    provider: z.string(),
    start: z.string(),
    end: z.string(),
    priceUsd: z.string(),
  })
  .strict();

const checkoutOutput = z
  .object({
    quoteId: z.string(),
    kind: z.enum(["part", "service"]),
    lines: z.array(z.discriminatedUnion("type", [partLine, serviceLine])),
    totalUsd: z.string(),
    capUsd: z.string(),
    overCap: z.boolean(),
    overByUsd: z.string().optional(),
    expiresAt: z.string(),
    eta: z.string().optional(),
    slot: checkoutSlot.optional(),
  })
  .strict();

const confirmInput = z
  .object({
    quoteId: z.string().min(1),
    code: z.string().min(1),
    approveOverCap: z.boolean().optional(),
  })
  .strict();

const confirmOutput = z
  .object({
    kind: z.enum(["order", "booking"]),
    id: z.string(),
    orderId: z.string().optional(),
    bookingId: z.string().optional(),
    status: z.string(),
    eta: z.string().optional(),
    slot: checkoutSlot.optional(),
    mock: z.literal(true),
    alreadyConfirmed: z.literal(true).optional(),
    createdTaskId: z.string().optional(),
  })
  .strict();

const taskInput = z
  .object({
    title: z.string().min(1),
    applianceId: z.string().min(1).optional(),
    item: z.string().min(1).optional(),
    dueDate: z.string().min(1).optional(),
    notes: z.string().optional(),
  })
  .strict();

const taskBody = z
  .object({
    id: z.string(),
    title: z.string(),
    applianceId: z.string().nullable(),
    item: z.string().nullable(),
    dueDate: z.string().nullable(),
    notes: z.string().nullable(),
    status: z.enum(["open", "closed"]),
    createdAt: z.string(),
    closedAt: z.string().nullable(),
  })
  .strict();

const taskOutput = z
  .object({
    taskId: z.string(),
    task: taskBody,
  })
  .strict();

const maintenanceInput = z
  .object({
    applianceId: z.string().min(1),
    item: z.string().min(1),
    doneOn: z.string().min(1).optional(),
    consumeInventory: z.boolean().optional(),
  })
  .strict();

const inventoryAfter = z
  .object({
    id: z.string(),
    item: z.string(),
    name: z.string(),
    qty: z.number().int(),
    location: z.string(),
    receivedNotInstalled: z.number().int(),
  })
  .strict();

const maintenanceOutput = z
  .object({
    lastDone: z.string(),
    nextDue: z.string().nullable(),
    inventoryAfter: inventoryAfter.optional(),
    closedTaskIds: z.array(z.string()),
  })
  .strict();

/** P0 write tools in section 7.2 order, excluding the read-only tools registered separately. */
export function writeToolOptions(): WriteToolOptions[] {
  return [
    writeTool({
      name: "register_appliance",
      description:
        "Learn an appliance and its schedule from the catalog. Input is type, maker, model, location, and optional installedOn. Idempotent on maker, model, and location. scheduleSource is catalog or none.",
      annotations: REGISTER_WRITE,
      input: registerInput,
      output: registerOutput,
      run(repo, args) {
        const { speech, ...structured } = registerAppliance(repo, args);
        return { speech, structured };
      },
    }),
    writeTool({
      name: "prepare_checkout",
      description:
        "Price a purchase of 1 to 3 lines, all parts or all services. Nothing is bought. Returns quoteId, lines, totalUsd, eta or slot, capUsd, overCap, optional overByUsd, and expiresAt 15 simulated minutes out.",
      annotations: LOCAL_WRITE,
      input: checkoutInput,
      output: checkoutOutput,
      run(repo, args) {
        const { speech, ...structured } = prepareCheckout(repo, args);
        return { speech, structured };
      },
    }),
    writeTool({
      name: "confirm_purchase",
      description:
        "Place the mock order or booking for a quote. Idempotent per quote. Checks the code, then over-cap approval. A wrong code uses an attempt. Returns kind, id, status, eta or slot, mock true, and optional alreadyConfirmed or createdTaskId.",
      annotations: CONFIRM_WRITE,
      input: confirmInput,
      output: confirmOutput,
      run(repo, args) {
        const { speech, ...structured } = confirmPurchase(repo, args);
        return { speech, structured };
      },
    }),
    writeTool({
      name: "create_task",
      description: "Add a household task with a title and optional applianceId, item, dueDate, and notes. Returns taskId and the task.",
      annotations: LOCAL_WRITE,
      input: taskInput,
      output: taskOutput,
      run(repo, args) {
        const { speech, ...structured } = createTask(repo, args);
        return { speech, structured };
      },
    }),
    writeTool({
      name: "log_maintenance",
      description:
        "Record a job done, use stock, and roll the schedule. consumeInventory defaults to true. Returns lastDone, nextDue, optional inventoryAfter, and closedTaskIds.",
      annotations: LOCAL_WRITE,
      input: maintenanceInput,
      output: maintenanceOutput,
      run(repo, args) {
        const { speech, ...structured } = logMaintenance(repo, args);
        return { speech, structured };
      },
    }),
  ];
}
