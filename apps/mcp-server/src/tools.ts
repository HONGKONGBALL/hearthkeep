/**
 * Read-only P0 MCP tools. Prices, brands, and household names are fictional simulation data.
 * Each tool calls packages/core and returns at most two speakable sentences plus structuredContent.
 */
import {
  DOMAIN_ERROR_CODES,
  DomainError,
  diagnoseSymptom,
  findParts,
  findServiceSlots,
  getUpkeepStatus,
  resolveAppliance,
  type Repository,
} from "@hearthkeep/core";
import { z } from "zod";

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const errorBody = z
  .object({
    code: z.enum(DOMAIN_ERROR_CODES),
    message: z.string(),
    attemptsRemaining: z.number().int().min(0).optional(),
  })
  .strict();

const errorEnvelope = z.object({ error: errorBody }).strict();

const howSchema = z.enum(["part", "pro", "maintenance"]);

const resolvedAppliance = z
  .object({
    id: z.string(),
    spokenName: z.string(),
    maker: z.string(),
    model: z.string(),
    product: z.string(),
    location: z.string(),
  })
  .strict();

const upkeepOutput = z
  .object({
    now: z.string(),
    attention: z.array(
      z
        .object({
          applianceId: z.string(),
          spokenName: z.string(),
          item: z.string(),
          how: howSchema,
          bucket: z.enum(["overdue", "due_today"]),
          due: z.string(),
          daysOverdue: z.number().int().optional(),
        })
        .strict(),
    ),
    upcoming: z.array(
      z
        .object({
          applianceId: z.string(),
          spokenName: z.string(),
          item: z.string(),
          how: howSchema,
          due: z.string(),
          daysUntil: z.number().int(),
        })
        .strict(),
    ),
    inProgress: z.array(
      z
        .object({
          kind: z.enum(["order", "booking"]),
          id: z.string(),
          status: z.string(),
          applianceId: z.string().nullable(),
          item: z.string().nullable(),
          name: z.string(),
          eta: z.string().optional(),
          provider: z.string().optional(),
          windowStart: z.string().optional(),
          windowEnd: z.string().optional(),
        })
        .strict(),
    ),
    tasks: z.array(
      z
        .object({
          taskId: z.string(),
          title: z.string(),
          applianceId: z.string().nullable(),
          item: z.string().nullable(),
          dueDate: z.string().nullable(),
          notes: z.string().nullable(),
          status: z.literal("open"),
        })
        .strict(),
    ),
  })
  .strict();

const resolveOutput = z
  .object({
    status: z.enum(["match", "ambiguous"]),
    appliance: resolvedAppliance.optional(),
    candidates: z.array(resolvedAppliance).optional(),
  })
  .strict();

const partsOutput = z
  .object({
    options: z.array(
      z
        .object({
          optionId: z.string(),
          name: z.string(),
          brand: z.string(),
          priceUsd: z.string(),
          eta: z.string(),
          kind: z.enum(["compatible", "oem", "generic"]),
          certified: z.boolean().nullable(),
          recommended: z.boolean(),
          packQty: z.number().int(),
          leadDays: z.number().int(),
        })
        .strict(),
    ),
    excluded: z.array(
      z
        .object({
          optionId: z.string(),
          name: z.string(),
          reason: z.enum(["POLICY_UNCERTIFIED", "EXCEEDS_MAKER_SPEC"]),
        })
        .strict(),
    ),
    onHand: z
      .object({
        qty: z.number().int(),
        location: z.string().nullable(),
        receivedNotInstalled: z.number().int(),
      })
      .strict(),
    recommendedAction: z.enum(["buy", "use_on_hand"]),
  })
  .strict();

const diagnosisOutput = z
  .object({
    hazard: z.boolean(),
    cause: z.string().optional(),
    item: z.string().optional(),
    advice: z.string(),
  })
  .strict();

const slotsOutput = z
  .object({
    slots: z.array(
      z
        .object({
          slotId: z.string(),
          provider: z.string(),
          date: z.string(),
          weekday: z.string(),
          start: z.string(),
          end: z.string(),
          priceUsd: z.string(),
          overCap: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();

export interface ToolTextContent {
  type: "text";
  text: string;
}

export interface ToolCallResult {
  content: ToolTextContent[];
  structuredContent: { [key: string]: unknown };
  isError: boolean;
}

export interface ListedTool {
  name: string;
  description: string;
  inputSchema: { [key: string]: unknown };
  outputSchema: { [key: string]: unknown };
  annotations: typeof READ_ONLY_ANNOTATIONS;
}

interface RegisteredTool {
  name: string;
  description: string;
  inputSchema: { [key: string]: unknown };
  outputSchema: { [key: string]: unknown };
  call: (repo: Repository, args: unknown) => ToolCallResult;
}

function toJsonSchema(schema: z.ZodType): { [key: string]: unknown } {
  const json = z.toJSONSchema(schema) as { [key: string]: unknown };
  delete json.$schema;
  return json;
}

/** Keep speakable tool text to two sentences. Decimal points in prices are not sentence breaks. */
export function speakable(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed === "") return "I couldn't complete that.";
  const sentences: string[] = [];
  let start = 0;
  for (let index = 0; index < trimmed.length; index += 1) {
    const mark = trimmed[index];
    if (mark !== "." && mark !== "!" && mark !== "?") continue;
    const previous = trimmed[index - 1] ?? "";
    const next = trimmed[index + 1] ?? "";
    if (mark === "." && /\d/.test(previous) && /\d/.test(next)) continue;
    const sentence = trimmed.slice(start, index + 1).trim();
    if (sentence !== "") sentences.push(sentence);
    start = index + 1;
    if (sentences.length === 2) return sentences.join(" ");
  }
  const tail = trimmed.slice(start).trim();
  if (tail !== "") {
    const closed = /[.!?]$/.test(tail) ? tail : `${tail}.`;
    sentences.push(closed);
  }
  return sentences.slice(0, 2).join(" ");
}

function success(speech: string, structuredContent: object): ToolCallResult {
  return {
    content: [{ type: "text", text: speakable(speech) }],
    structuredContent: structuredContent as { [key: string]: unknown },
    isError: false,
  };
}

function failure(code: (typeof DOMAIN_ERROR_CODES)[number], message: string): ToolCallResult {
  const text = speakable(message);
  return {
    content: [{ type: "text", text }],
    structuredContent: { error: { code, message: text } },
    isError: true,
  };
}

function schemaSpeech(error: z.ZodError): string {
  const field = String(error.issues[0]?.path[0] ?? "");
  if (field === "horizonDays") return "Horizon days must be a whole number from 1 to 400.";
  if (field === "from" || field === "to") return "I need a date range in the future for that.";
  if (field === "query") return "I need an appliance name to look up.";
  if (field === "symptom") return "Tell me the symptom you want checked.";
  if (field === "item") return "Tell me which item to look up.";
  if (field === "applianceId") return "Tell me which appliance you mean.";
  return "That request isn't valid.";
}

function defineTool<S extends z.ZodType>(options: {
  name: string;
  description: string;
  input: S;
  output: z.ZodType;
  run: (repo: Repository, args: z.output<S>) => ToolCallResult;
}): RegisteredTool {
  return {
    name: options.name,
    description: options.description,
    inputSchema: toJsonSchema(options.input),
    outputSchema: toJsonSchema(z.union([options.output, errorEnvelope])),
    call(repo, args) {
      const parsed = options.input.safeParse(args);
      if (!parsed.success) return failure("INVALID_ARGUMENT", schemaSpeech(parsed.error));
      try {
        return options.run(repo, parsed.data);
      } catch (error) {
        if (error instanceof DomainError) return failure(error.code, error.message);
        throw error;
      }
    },
  };
}

const upkeepInput = z
  .object({
    horizonDays: z.number().int().min(1).max(400).optional(),
    applianceId: z.string().min(1).optional(),
  })
  .strict();

const resolveInput = z.object({ query: z.string().min(1) }).strict();

const applianceItemInput = z
  .object({
    applianceId: z.string().min(1),
    item: z.string().min(1),
  })
  .strict();

const symptomInput = z
  .object({
    applianceId: z.string().min(1),
    symptom: z.string().min(1),
  })
  .strict();

const slotsInput = z
  .object({
    applianceId: z.string().min(1),
    item: z.string().min(1),
    from: z.string().min(1),
    to: z.string().min(1),
  })
  .strict();

const TOOLS: RegisteredTool[] = [
  defineTool({
    name: "get_upkeep_status",
    description:
      "What needs attention, what is coming, and what is in progress. horizonDays is 1 to 400 and defaults to 14. An optional applianceId limits the lists. Items with an active order or booking appear only in inProgress.",
    input: upkeepInput,
    output: upkeepOutput,
    run(repo, args) {
      const { speech, ...structured } = getUpkeepStatus(repo, args);
      return success(speech, structured);
    },
  }),
  defineTool({
    name: "resolve_appliance",
    description:
      "Map a household phrase such as the fridge or hallway alarm to an appliance. status is match or ambiguous. Nothing found is APPLIANCE_NOT_FOUND.",
    input: resolveInput,
    output: resolveOutput,
    run(repo, args) {
      const { speech, ...structured } = resolveAppliance(repo, args);
      return success(speech, structured);
    },
  }),
  defineTool({
    name: "find_parts",
    description:
      "Parts that fit an appliance item, filtered by household policy, with price, ETA, kind, certification, and stock on hand. When stock covers the need, no option is recommended.",
    input: applianceItemInput,
    output: partsOutput,
    run(repo, args) {
      const { speech, ...structured } = findParts(repo, args);
      return success(speech, structured);
    },
  }),
  defineTool({
    name: "diagnose_symptom",
    description: "Map a symptom to a cause and item, or flag a hazard. This is household guidance for the fictional simulation.",
    input: symptomInput,
    output: diagnosisOutput,
    run(repo, args) {
      const { speech, ...structured } = diagnoseSymptom(repo, args);
      return success(speech, structured);
    },
  }),
  defineTool({
    name: "find_service_slots",
    description:
      "Pro appointments for a service item between from and to. Dates are household-local future dates. Each slot includes provider, start, end, price, and overCap.",
    input: slotsInput,
    output: slotsOutput,
    run(repo, args) {
      const { speech, ...structured } = findServiceSlots(repo, args);
      return success(speech, structured);
    },
  }),
];

export function listTools(): ListedTool[] {
  return TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    annotations: READ_ONLY_ANNOTATIONS,
  }));
}

/** Returns undefined when `name` is not one of the registered read-only tools. */
export function callTool(repo: Repository, name: string, args: unknown): ToolCallResult | undefined {
  const tool = TOOLS.find((entry) => entry.name === name);
  if (tool === undefined) return undefined;
  return tool.call(repo, args);
}
