/**
 * Deterministic Hearthkeep planner for the Alexa+ simulation host.
 * Fictional household utterances only. Purchase codes stay out of traces.
 */

export const SIM_EPOCH = "2026-10-21T09:00:00-07:00";
export const SIM_TIME_ZONE = "America/Los_Angeles";
export const PROTOCOL_LABEL = "2025-11-25";

export const HAZARD_REPLY =
  "If you smell gas, leave the home now and call your local emergency number or gas utility from outside. I can't help troubleshoot this one.";
export const SCOPE_REPLY = "I can help with home upkeep: filters, batteries, vents and repairs.";
export const CANCEL_REPLY = "Okay, I won't order it.";
export const NO_CODE_REPLY = "There's nothing waiting for a code.";
export const SOUND_QUESTION =
  "Is it a short chirp every minute or so, or a loud alarm that keeps sounding?";
export const WHICH_ALARM = "Which one, the hallway or the main bedroom?";

export const CARD_URIS = {
  status: "ui://hearthkeep/status-card.html",
  options: "ui://hearthkeep/options-carousel.html",
  checkout: "ui://hearthkeep/checkout-card.html",
  receipt: "ui://hearthkeep/receipt-card.html",
  task: "ui://hearthkeep/task-card.html",
} as const;

export const QUICK_CHIPS: ReadonlyArray<{ label: string; utterance: string; masked?: boolean }> = [
  { label: "What needs doing?", utterance: "What needs doing?" },
  { label: "Order a new filter for the fridge", utterance: "Order a new filter for the fridge" },
  { label: "Yes, the CX-28", utterance: "Yes, the CX-28" },
  { label: "Say purchase code (demo)", utterance: "2468", masked: true },
  { label: "The hallway smoke alarm keeps chirping", utterance: "The hallway smoke alarm keeps chirping" },
  { label: "Done, I swapped it", utterance: "Done, I swapped it" },
  { label: "Book someone to clean the dryer vent next week", utterance: "Book someone to clean the dryer vent next week" },
  { label: "Tuesday morning", utterance: "Tuesday morning" },
  { label: "Approve with code (demo)", utterance: "Approve 2468", masked: true },
  {
    label: "I just installed a new water heater, a Brimwell WH-40, in the garage",
    utterance: "I just installed a new water heater, a Brimwell WH-40, in the garage",
  },
  { label: "When is the water heater due?", utterance: "When is the water heater due?" },
  { label: "I smell gas in the kitchen", utterance: "I smell gas in the kitchen" },
];

const HAZARD_PHRASES = [
  "smell gas",
  "smell or see smoke",
  "fire",
  "sparks",
  "burning smell",
  "co alarm",
  "alarm going off",
  "keeps sounding",
];

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const QTY_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

export type IntentName =
  | "briefing"
  | "upcoming"
  | "ask_due"
  | "reorder_part"
  | "symptom"
  | "choose_option"
  | "confirm"
  | "cancel"
  | "done"
  | "book_service"
  | "choose_slot"
  | "register"
  | "help"
  | "out_of_scope";

export interface Slots {
  query?: string;
  item?: string;
  symptom?: string;
  sound?: "chirp" | "alarm" | "unknown";
  option?: string;
  weekday?: string;
  daypart?: "morning" | "afternoon" | "evening";
  earliest?: boolean;
  code?: string;
  approve?: boolean;
  maker?: string;
  model?: string;
  location?: string;
  product?: string;
  range?: "next_week" | "today" | "tomorrow";
}

export interface ParsedUtterance {
  intent: IntentName;
  slots: Slots;
  codeTurn: boolean;
  guard: "hazard" | "scope" | null;
}

export interface PendingOption {
  kind: "part" | "service";
  id: string;
  name: string;
  applianceId?: string;
  item?: string;
  weekday?: string;
  daypart?: "morning" | "afternoon" | "evening";
  provider?: string;
  recommended?: boolean;
  partKind?: string;
}

export interface PendingQuote {
  quoteId: string;
  kind: "part" | "service";
  overCap: boolean;
  totalUsd: string;
  capUsd: string;
  overByUsd?: string;
  eta?: string;
  lines: unknown[];
  slot?: Record<string, unknown>;
  item?: string;
}

export interface DialogueState {
  pendingOptions: PendingOption[] | null;
  optionsTurnsLeft: number;
  pendingQuote: PendingQuote | null;
  lastAppliance: {
    id: string;
    spokenName: string;
    maker: string;
    model: string;
    product: string;
    location: string;
  } | null;
  lastTask: { taskId: string; applianceId: string | null; item: string | null; title: string } | null;
  lastOnHand: { name: string; qty: number; location: string | null; item: string } | null;
  clarify: { stage: "sound" | "appliance"; symptom: string } | null;
  awaitingCode: boolean;
}

export interface Clock {
  iso: string;
  timeZone?: string;
}

export interface ToolResponse {
  isError: boolean;
  text: string;
  structuredContent: Record<string, unknown>;
  httpStatus: number;
  ms: number;
  sessionPrefix?: string;
  protocol?: string;
  raw?: unknown;
}

export type ToolCaller = (name: string, args: Record<string, unknown>) => Promise<ToolResponse>;

export interface CardPayload {
  uri: string;
  tool: string;
  structuredContent: Record<string, unknown>;
  context: Record<string, unknown>;
}

export interface TraceStep {
  method: "tools/call";
  tool: string;
  args: Record<string, unknown>;
  httpStatus: number;
  ms: number;
  sessionPrefix: string;
  protocol: string;
  status: "done" | "failed" | "skipped";
  rawRequest: unknown;
  rawResponse: unknown;
}

export interface TurnResult {
  reply: string;
  alert: string | null;
  card: CardPayload | null;
  state: DialogueState;
  intent: IntentName;
  slots: Slots;
  guards: string[];
  steps: TraceStep[];
  displayUtterance: string;
  codeTurn: boolean;
  unreachable: boolean;
}

export function emptyDialogue(): DialogueState {
  return {
    pendingOptions: null,
    optionsTurnsLeft: 0,
    pendingQuote: null,
    lastAppliance: null,
    lastTask: null,
    lastOnHand: null,
    clarify: null,
    awaitingCode: false,
  };
}

export function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => redactValue(entry));
  if (value === null || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const copy: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (key === "code") copy[key] = "••••";
    else copy[key] = redactValue(entry);
  }
  return copy;
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token !== "");
}

function wordsInOrder(text: string, phrase: string): boolean {
  const hay = words(text);
  const needle = words(phrase);
  let index = 0;
  for (const token of hay) {
    if (token === needle[index]) {
      index += 1;
      if (index === needle.length) return true;
    }
  }
  return needle.length === 0;
}

function expandOr(phrase: string): string[] {
  const tokens = words(phrase);
  const orAt = tokens.indexOf("or");
  if (orAt <= 0 || orAt >= tokens.length - 1) return [phrase];
  const prefix = tokens.slice(0, orAt - 1);
  const suffix = tokens.slice(orAt + 2);
  return [
    [...prefix, tokens[orAt - 1], ...suffix].join(" "),
    [...prefix, tokens[orAt + 1], ...suffix].join(" "),
  ];
}

export function matchesHazard(text: string): boolean {
  const lower = text.toLowerCase();
  for (const phrase of HAZARD_PHRASES) {
    for (const alternative of expandOr(phrase)) {
      if (wordsInOrder(lower, alternative)) return true;
    }
  }
  return false;
}

function stripWake(text: string): string {
  return text.replace(/^\s*(?:hey\s+)?alexa[, ]+/i, "").trim();
}

function ymdFromClock(clock: Clock): string {
  return calendarParts(clock.iso, clock.timeZone ?? SIM_TIME_ZONE).ymd;
}

interface CalendarParts {
  ymd: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
}

function calendarParts(iso: string, timeZone: string): CalendarParts {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "long",
  }).formatToParts(new Date(iso));
  const bag: Record<string, string> = {};
  for (const part of formatted) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  const year = bag.year ?? "0000";
  const month = bag.month ?? "01";
  const day = bag.day ?? "01";
  return {
    ymd: `${year}-${month}-${day}`,
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(bag.hour ?? "0"),
    minute: Number(bag.minute ?? "0"),
    weekday: (bag.weekday ?? "Wednesday").toLowerCase(),
  };
}

function ymdParts(ymd: string): { year: number; month: number; day: number; weekday: number } {
  const [year, month, day] = ymd.split("-").map((part) => Number(part));
  const weekday = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  return { year, month, day, weekday };
}

function addDays(ymd: string, days: number): string {
  const { year, month, day } = ymdParts(ymd);
  const next = new Date(Date.UTC(year, month - 1, day + days, 12));
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, "0");
  const d = String(next.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const from = ymdParts(fromYmd);
  const to = ymdParts(toYmd);
  const left = Date.UTC(from.year, from.month - 1, from.day);
  const right = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((right - left) / 86_400_000);
}

export function nextWeekRange(ymd: string): { from: string; to: string } {
  const day = ymdParts(ymd).weekday;
  const untilMonday = day === 1 ? 7 : (8 - day) % 7;
  const from = addDays(ymd, untilMonday);
  return { from, to: addDays(from, 6) };
}

export function formatShortDate(ymd: string): string {
  const { month, day, weekday } = ymdParts(ymd);
  return `${WEEKDAY_SHORT[weekday]}, ${MONTHS_SHORT[month - 1]} ${day}`;
}

export function formatMonthDay(ymd: string): string {
  const { month, day } = ymdParts(ymd);
  return `${MONTHS[month - 1]} ${day}`;
}

export function formatWeekdayLong(ymd: string): string {
  return WEEKDAYS[ymdParts(ymd).weekday] ?? "day";
}

export function formatMonthYear(ymd: string): string {
  const { year, month } = ymdParts(ymd);
  return `${MONTHS[month - 1]} ${year}`;
}

export function formatSimHeader(iso: string, timeZone = SIM_TIME_ZONE): string {
  const parts = calendarParts(iso, timeZone);
  const { month, day, weekday } = ymdParts(parts.ymd);
  const hour24 = parts.hour;
  const ap = hour24 >= 12 ? "PM" : "AM";
  let hour = hour24 % 12;
  if (hour === 0) hour = 12;
  const minute = String(parts.minute).padStart(2, "0");
  const week = WEEKDAY_SHORT[weekday];
  return `${week}, ${MONTHS_SHORT[month - 1]} ${day}, ${parts.year} · ${hour}:${minute} ${ap}`;
}

function ymdOfIso(iso: string, timeZone: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return calendarParts(iso, timeZone).ymd;
}

function hourOf(iso: string, timeZone: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 9;
  return calendarParts(iso, timeZone).hour;
}

export function daypartOf(iso: string, timeZone = SIM_TIME_ZONE): "morning" | "afternoon" | "evening" {
  const hour = hourOf(iso, timeZone);
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export function windowPhrase(startIso: string, endIso: string, timeZone = SIM_TIME_ZONE): string {
  const label = (iso: string): { hour: number; ap: "AM" | "PM" } => {
    const hour24 = hourOf(iso, timeZone);
    const ap = hour24 >= 12 ? "PM" : "AM";
    let hour = hour24 % 12;
    if (hour === 0) hour = 12;
    return { hour, ap };
  };
  const start = label(startIso);
  const end = label(endIso);
  if (start.ap === end.ap) return `${start.hour} to ${end.hour} ${start.ap}`;
  return `${start.hour} ${start.ap} to ${end.hour} ${end.ap}`;
}

function titleCase(value: string): string {
  return value.replace(/\b([a-z])/g, (letter) => letter.toUpperCase());
}

function humanItem(item: string): string {
  if (item === "air_filter") return "filter";
  return item.replaceAll("_", " ");
}

function speechMoney(value: string | undefined): string {
  const amount = Number(value ?? "0");
  if (!Number.isFinite(amount)) return "$0";
  if (Math.abs(amount - Math.round(amount)) < 0.001) return `$${Math.round(amount)}`;
  return `$${amount.toFixed(2)}`;
}

function qtyWord(qty: number): string {
  return QTY_WORDS[qty] ?? String(qty);
}

function normKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Record<string, unknown> => asRecord(entry) !== null);
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function errorCode(structured: Record<string, unknown>): string | undefined {
  const error = asRecord(structured.error);
  const code = error?.code;
  return typeof code === "string" ? code : undefined;
}

function extractQuery(text: string): string | undefined {
  const lower = text.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/hallway/, "hallway smoke alarm"],
    [/main bedroom|\bbedroom\b/, "bedroom smoke alarm"],
    [/water heater|brimwell/, "water heater"],
    [/fridge|refrigerator|ferngate/, "fridge"],
    [/furnace|calorith/, "furnace"],
    [/dryer|tumblewell/, "dryer"],
    [/porch/, "porch light"],
    [/smoke alarm|smoke detector/, "smoke alarm"],
  ];
  for (const [pattern, query] of rules) {
    if (pattern.test(lower)) return query;
  }
  return undefined;
}

function inferItem(lower: string, query: string | undefined): string | undefined {
  if (/vent/.test(lower)) return "vent_cleaning";
  if (/batter|9-volt|9 volt|\b9v\b|chirp/.test(lower)) return "battery";
  if (/bulb|light is out/.test(lower)) return "bulb";
  if (/\bflush\b/.test(lower)) return "flush";
  if (/air filter|furnace filter|merv/.test(lower) || (query ?? "").includes("furnace")) {
    if (/filter/.test(lower) || (query ?? "").includes("furnace")) return "air_filter";
  }
  if (/filter/.test(lower) || (query ?? "").includes("fridge")) return "water_filter";
  if ((query ?? "").includes("dryer")) return "vent_cleaning";
  if ((query ?? "").includes("smoke")) return "battery";
  if ((query ?? "").includes("porch")) return "bulb";
  if ((query ?? "").includes("water heater")) return "flush";
  return undefined;
}

function soundOf(lower: string): "chirp" | "alarm" | "unknown" | undefined {
  if (/keeps sounding|loud alarm|alarm that keeps/.test(lower)) return "alarm";
  if (/chirp/.test(lower)) return "chirp";
  if (/beep/.test(lower)) return "unknown";
  return undefined;
}

function matchCode(text: string): Slots | null {
  const only = text.match(/^(\d{4,8})$/);
  if (only) return { code: only[1], approve: false };
  const approved = text.match(/^approve(?:\s+with)?(?:\s+code)?\s+(\d{4,8})$/i);
  if (approved) return { code: approved[1], approve: true };
  return null;
}

function parseRegister(text: string): Slots | null {
  const lower = text.toLowerCase();
  if (!/\b(installed|register|registered)\b/.test(lower) && !/\badd a\b/.test(lower)) return null;
  const modelMatch = text.match(/\b([A-Za-z][A-Za-z]+)\s+([A-Za-z]{1,5}-?\d{2,4})\b/);
  if (!modelMatch) return null;
  const maker = modelMatch[1] ?? "";
  const model = modelMatch[2] ?? "";
  let product: string | undefined;
  if (/water heater/i.test(text) || /wh-40/i.test(model)) product = "water heater";
  else if (/fridge|refrigerator/i.test(text)) product = "fridge";
  else if (/furnace/i.test(text)) product = "furnace";
  else if (/dryer/i.test(text)) product = "dryer";
  else if (/smoke/i.test(text)) product = "smoke alarm";
  const inThe = text.match(/\bin the ([a-z][a-z ]*)/i);
  let location = inThe?.[1]?.replace(/\b(and|with)\b.*$/i, "").replace(/[.,]$/, "").trim();
  if (!location) {
    const named = text.match(/\b(garage|kitchen|laundry|hallway|basement|attic|closet|bedroom)\b/i);
    location = named?.[1];
  }
  return { maker, model, product, location, query: product };
}

function optionName(text: string): string {
  const lower = text.toLowerCase();
  if (/\boem\b/.test(lower)) return "oem";
  return text
    .replace(/^(?:yes|yeah|yep)[, ]+/i, "")
    .replace(/^(?:i'll take|i will take|choose|take|pick|get)\s+/i, "")
    .replace(/^(?:the\s+)/i, "")
    .replace(/[?.!]+$/, "")
    .trim();
}

function slotSlots(lower: string): Slots {
  const weekday = WEEKDAYS.find((day) => lower.includes(day));
  let daypart: Slots["daypart"];
  if (/\bmorning\b/.test(lower)) daypart = "morning";
  else if (/\bafternoon\b/.test(lower)) daypart = "afternoon";
  else if (/\bevening\b/.test(lower)) daypart = "evening";
  return {
    ...(weekday ? { weekday } : {}),
    ...(daypart ? { daypart } : {}),
    earliest: /\b(earliest|soonest|first opening)\b/.test(lower),
  };
}

function isChooseSlot(lower: string): boolean {
  if (/\b(earliest|soonest|first opening)\b/.test(lower)) return true;
  const named = WEEKDAYS.some((day) => lower.includes(day));
  if (!named) return false;
  if (/\b(when|due|order|book|schedule|installed)\b/.test(lower)) return false;
  return true;
}

function isChooseOption(lower: string): boolean {
  if (/^(yes|yeah|yep)\b/.test(lower)) return true;
  if (/^(choose|take|pick)\b/.test(lower)) return true;
  if (/^i(?:'ll| will) take\b/.test(lower)) return true;
  if (/\b(oem|cx-28|cx28|fg-wf2|fgwf2)\b/.test(lower)) return true;
  return false;
}

function isReorder(lower: string): boolean {
  if (/\b(order|reorder|buy|purchase)\b/.test(lower)) return true;
  if (/\bnew (filter|bulb|battery|part)\b/.test(lower)) return true;
  if (/\bneed a new\b/.test(lower)) return true;
  if (/\breplace\b/.test(lower) && /\b(filter|battery|bulb|part)\b/.test(lower)) return true;
  return false;
}

function isBook(lower: string): boolean {
  if (/^(book|schedule)\b/.test(lower)) return true;
  if (/someone to (clean|fix|repair)/.test(lower)) return true;
  if (/\bappointment\b/.test(lower)) return true;
  return false;
}

function isSymptom(lower: string): boolean {
  return /\b(chirp\w*|beep\w*|tastes|damp|cycles|filter light|light is out|burning|spark\w*|sounding)\b/.test(lower);
}

function isBriefing(lower: string): boolean {
  return /what needs|needs doing|what should i|briefing|what(?:'s| is) due|status of|anything due|on the list|what do i need/.test(
    lower,
  );
}

export function parseUtterance(utterance: string, state: DialogueState = emptyDialogue()): ParsedUtterance {
  const text = stripWake(utterance).replace(/\s+/g, " ").trim();
  const lower = text.toLowerCase();

  if (matchesHazard(lower)) {
    return { intent: "symptom", slots: { symptom: text, sound: "alarm", query: extractQuery(text) }, codeTurn: false, guard: "hazard" };
  }

  if (/^confirm by voice$/i.test(text)) {
    return { intent: "confirm", slots: {}, codeTurn: false, guard: null };
  }

  const code = matchCode(text);
  if (code) return { intent: "confirm", slots: code, codeTurn: true, guard: null };

  if (state.clarify?.stage === "sound") {
    const sound = soundOf(lower) ?? (/chirp|short/.test(lower) ? "chirp" : "unknown");
    return {
      intent: "symptom",
      slots: { sound, symptom: sound === "chirp" ? "chirp" : text, query: extractQuery(text) },
      codeTurn: false,
      guard: sound === "alarm" ? "hazard" : null,
    };
  }

  if (state.clarify?.stage === "appliance") {
    const query = /\bbed/.test(lower) ? "main bedroom" : /\bhall/.test(lower) ? "hallway smoke alarm" : text;
    return {
      intent: "symptom",
      slots: { query, symptom: state.clarify.symptom, sound: "chirp" },
      codeTurn: false,
      guard: null,
    };
  }

  if (/^(cancel|never mind|nevermind|stop|do not order|don't order|no thanks)\b/.test(lower)) {
    return { intent: "cancel", slots: {}, codeTurn: false, guard: null };
  }
  if (/\bswapped\b/.test(lower) || /^(done|all done|mark done|finished)\b/.test(lower)) {
    return { intent: "done", slots: {}, codeTurn: false, guard: null };
  }

  const registered = parseRegister(text);
  if (registered) return { intent: "register", slots: registered, codeTurn: false, guard: null };

  if (/\bwhen\b/.test(lower) && /\b(due|need|flush)\b/.test(lower)) {
    const query = extractQuery(text);
    return { intent: "ask_due", slots: { query, item: inferItem(lower, query) }, codeTurn: false, guard: null };
  }
  if (isBook(lower)) {
    const query = extractQuery(text) ?? "dryer";
    const range = /next week/.test(lower) ? "next_week" : /tomorrow/.test(lower) ? "tomorrow" : /today/.test(lower) ? "today" : "next_week";
    return { intent: "book_service", slots: { query, item: inferItem(lower, query) ?? "vent_cleaning", range }, codeTurn: false, guard: null };
  }
  if (isReorder(lower)) {
    const query = extractQuery(text);
    return { intent: "reorder_part", slots: { query, item: inferItem(lower, query) }, codeTurn: false, guard: null };
  }
  if (isChooseSlot(lower)) return { intent: "choose_slot", slots: slotSlots(lower), codeTurn: false, guard: null };
  if (isChooseOption(lower)) return { intent: "choose_option", slots: { option: optionName(text) }, codeTurn: false, guard: null };
  if (isSymptom(lower)) {
    const query = extractQuery(text);
    return {
      intent: "symptom",
      slots: { query, symptom: text, sound: soundOf(lower), item: inferItem(lower, query) },
      codeTurn: false,
      guard: null,
    };
  }
  if (/coming up|upcoming/.test(lower)) return { intent: "upcoming", slots: {}, codeTurn: false, guard: null };
  if (isBriefing(lower) || lower === "") return { intent: "briefing", slots: {}, codeTurn: false, guard: null };
  if (/^(help|what can you|how does this work)\b/.test(lower)) return { intent: "help", slots: {}, codeTurn: false, guard: null };
  return { intent: "out_of_scope", slots: {}, codeTurn: false, guard: "scope" };
}

function cloneState(state: DialogueState): DialogueState {
  return structuredClone(state);
}

function decayOptions(state: DialogueState, keep: boolean): void {
  if (keep || state.pendingOptions === null) return;
  state.optionsTurnsLeft -= 1;
  if (state.optionsTurnsLeft <= 0) {
    state.pendingOptions = null;
    state.optionsTurnsLeft = 0;
  }
}

interface RunContext {
  clock: Clock;
  timeZone: string;
  today: string;
  callTool: ToolCaller;
  steps: TraceStep[];
  state: DialogueState;
  unreachable: boolean;
}

async function callTool(ctx: RunContext, name: string, args: Record<string, unknown>): Promise<ToolResponse | null> {
  const redacted = redactValue(args) as Record<string, unknown>;
  const request = { method: "tools/call", params: { name, arguments: redacted } };
  try {
    const result = await ctx.callTool(name, args);
    ctx.steps.push({
      method: "tools/call",
      tool: name,
      args: redacted,
      httpStatus: result.httpStatus,
      ms: result.ms,
      sessionPrefix: result.sessionPrefix ?? "",
      protocol: result.protocol ?? PROTOCOL_LABEL,
      status: result.isError ? "failed" : "done",
      rawRequest: request,
      rawResponse: redactValue(result.raw ?? { isError: result.isError, text: result.text, structuredContent: result.structuredContent }),
    });
    return result;
  } catch {
    ctx.unreachable = true;
    ctx.steps.push({
      method: "tools/call",
      tool: name,
      args: redacted,
      httpStatus: 0,
      ms: 0,
      sessionPrefix: "",
      protocol: PROTOCOL_LABEL,
      status: "failed",
      rawRequest: request,
      rawResponse: { error: "unreachable" },
    });
    return null;
  }
}

function skip(ctx: RunContext, name: string): void {
  ctx.steps.push({
    method: "tools/call",
    tool: name,
    args: {},
    httpStatus: 0,
    ms: 0,
    sessionPrefix: "",
    protocol: PROTOCOL_LABEL,
    status: "skipped",
    rawRequest: { method: "tools/call", params: { name, arguments: {} } },
    rawResponse: null,
  });
}

function rememberAppliance(state: DialogueState, appliance: Record<string, unknown>): void {
  state.lastAppliance = {
    id: textOf(appliance.id),
    spokenName: textOf(appliance.spokenName),
    maker: textOf(appliance.maker),
    model: textOf(appliance.model),
    product: textOf(appliance.product),
    location: textOf(appliance.location),
  };
}

function itemForAppliance(appliance: NonNullable<DialogueState["lastAppliance"]>, hinted?: string): string {
  if (hinted) return hinted;
  if (appliance.product === "fridge") return "water_filter";
  if (appliance.product === "furnace") return "air_filter";
  if (appliance.product === "dryer") return "vent_cleaning";
  if (appliance.product.includes("smoke")) return "battery";
  if (appliance.product.includes("porch") || appliance.product.includes("light")) return "bulb";
  if (appliance.product.includes("water")) return "flush";
  return "water_filter";
}

function fitsLine(appliance: NonNullable<DialogueState["lastAppliance"]>): string {
  return `Fits your ${appliance.maker} ${appliance.model}`;
}

function storeParts(state: DialogueState, applianceId: string, item: string, options: Record<string, unknown>[]): void {
  state.pendingOptions = options.slice(0, 3).map((option) => ({
    kind: "part" as const,
    id: textOf(option.optionId),
    name: textOf(option.name),
    applianceId,
    item,
    recommended: option.recommended === true,
    partKind: textOf(option.kind),
  }));
  state.optionsTurnsLeft = 3;
  state.pendingQuote = null;
  state.awaitingCode = false;
}

function storeSlots(state: DialogueState, applianceId: string, item: string, slots: Record<string, unknown>[], timeZone: string): void {
  state.pendingOptions = slots.slice(0, 3).map((slot) => {
    const start = textOf(slot.start);
    return {
      kind: "service" as const,
      id: textOf(slot.slotId),
      name: textOf(slot.provider),
      applianceId,
      item,
      weekday: formatWeekdayLong(textOf(slot.date) || ymdOfIso(start, timeZone)),
      daypart: daypartOf(start, timeZone),
      provider: textOf(slot.provider),
    };
  });
  state.optionsTurnsLeft = 3;
  state.pendingQuote = null;
  state.awaitingCode = false;
}

function storeQuote(state: DialogueState, structured: Record<string, unknown>, item?: string): void {
  state.pendingQuote = {
    quoteId: textOf(structured.quoteId),
    kind: textOf(structured.kind) === "service" ? "service" : "part",
    overCap: structured.overCap === true,
    totalUsd: textOf(structured.totalUsd),
    capUsd: textOf(structured.capUsd),
    ...(typeof structured.overByUsd === "string" ? { overByUsd: structured.overByUsd } : {}),
    ...(typeof structured.eta === "string" ? { eta: structured.eta } : {}),
    lines: Array.isArray(structured.lines) ? structured.lines : [],
    ...(asRecord(structured.slot) ? { slot: asRecord(structured.slot) ?? undefined } : {}),
    ...(item ? { item } : {}),
  };
  state.pendingOptions = null;
  state.optionsTurnsLeft = 0;
  state.awaitingCode = true;
}

function composeBriefing(structured: Record<string, unknown>, today: string): string {
  const attention = asArray(structured.attention);
  const progress = asArray(structured.inProgress);
  const dryer = attention.find((row) => row.item === "vent_cleaning" && row.bucket === "overdue");
  const fridge = attention.find((row) => row.item === "water_filter" && row.bucket === "due_today");
  if (dryer && fridge) {
    const overdue = dryer.daysOverdue === 21 ? "three weeks" : `${String(dryer.daysOverdue ?? "some")} days`;
    return `Good morning, the dryer vent cleaning is ${overdue} overdue and your fridge water filter is due today. Want me to handle them?`;
  }
  const shipped = progress.find((row) => row.kind === "order" && row.status === "shipped");
  const booking = progress.find((row) => row.kind === "booking");
  if (shipped && booking && attention.length === 0) {
    const eta = textOf(shipped.eta);
    const arrive = eta !== "" && daysBetween(today, eta) === 1 ? "tomorrow" : eta !== "" ? formatShortDate(eta) : "soon";
    const start = textOf(booking.windowStart);
    const when = start !== "" ? titleCase(formatWeekdayLong(ymdOfIso(start, SIM_TIME_ZONE))) : "the scheduled day";
    const noun = shipped.item === "water_filter" ? "fridge filter" : textOf(shipped.name) || "order";
    const job = booking.item === "vent_cleaning" ? "dryer vent cleaning" : textOf(booking.name) || "appointment";
    return `Good morning. Your ${noun} has shipped and arrives ${arrive}, and the ${job} is booked for ${when}.`;
  }
  if (attention.length === 0) return "Good morning. Nothing needs attention right now.";
  const phrases = attention.slice(0, 2).map((row) => {
    const name = `${textOf(row.spokenName)} ${humanItem(textOf(row.item))}`.trim();
    if (row.bucket === "due_today") return `your ${name} is due today`;
    return `your ${name} is overdue`;
  });
  const joined = phrases.length === 2 ? `${phrases[0]} and ${phrases[1]}` : phrases[0];
  return `Good morning. ${titleCase(joined ?? "Something")} needs a look. Want me to handle it?`;
}

function composeUpcoming(structured: Record<string, unknown>): string {
  const upcoming = asArray(structured.upcoming);
  if (upcoming.length === 0) return "Nothing is coming up in the next two weeks.";
  const phrases = upcoming.slice(0, 2).map((row) => {
    const name = `${textOf(row.spokenName)} ${humanItem(textOf(row.item))}`.trim();
    return `${name} on ${formatShortDate(textOf(row.due))}`;
  });
  return `Coming up: ${phrases.join(", and ")}.`;
}

function composeDue(structured: Record<string, unknown>, appliance: NonNullable<DialogueState["lastAppliance"]>): string {
  const row = asArray(structured.attention)[0] ?? asArray(structured.upcoming)[0];
  if (!row) return `Your ${appliance.spokenName} has nothing due in the next year.`;
  const item = humanItem(textOf(row.item));
  if (row.bucket === "due_today") return `Your ${appliance.spokenName} ${item} is due today.`;
  const when = formatMonthYear(textOf(row.due));
  if (row.item === "flush") return `Your ${appliance.spokenName} is due for a flush in ${when}.`;
  return `Your ${appliance.spokenName} ${item} is due in ${when}.`;
}

function composeParts(appliance: NonNullable<DialogueState["lastAppliance"]>, structured: Record<string, unknown>): string {
  const options = asArray(structured.options);
  const recommended = options.find((option) => option.recommended === true) ?? options[0];
  if (!recommended) return "No matching part is available to buy.";
  const count = options.length;
  const countWord = count === 1 ? "One" : count === 2 ? "Two" : count === 3 ? "Three" : String(count);
  const noun = count === 1 ? "option fits" : appliance.product === "fridge" ? "filters fit" : "options fit";
  const certified = recommended.certified === true ? "certified " : "";
  const when = formatWeekdayLong(textOf(recommended.eta));
  return `${countWord} ${noun} your ${appliance.maker} ${appliance.model}, and the ${certified}${textOf(recommended.name)} is ${speechMoney(textOf(recommended.priceUsd))}, arriving ${titleCase(when)}. Want that one?`;
}

function composeCheckout(quote: PendingQuote, timeZone: string): string {
  if (quote.overCap) {
    const verb = quote.kind === "service" ? "book it anyway" : "order it anyway";
    return `That's ${speechMoney(quote.totalUsd)}, which is ${speechMoney(quote.overByUsd)} over your ${speechMoney(quote.capUsd)} limit. To ${verb}, say 'approve' and your code.`;
  }
  if (quote.kind === "service" && quote.slot) {
    const start = textOf(quote.slot.start);
    const end = textOf(quote.slot.end);
    const when = start ? `${titleCase(formatWeekdayLong(ymdOfIso(start, timeZone)))}, ${windowPhrase(start, end, timeZone)}` : "that time";
    return `That's ${speechMoney(quote.totalUsd)} for ${when}. Say your purchase code to confirm.`;
  }
  const eta = quote.eta ? `${titleCase(formatWeekdayLong(quote.eta))}, ${formatMonthDay(quote.eta)}` : "soon";
  return `That's ${speechMoney(quote.totalUsd)}, arriving ${eta}. Say your purchase code to confirm.`;
}

function composeConfirmed(structured: Record<string, unknown>, quote: PendingQuote, timeZone: string): string {
  if (structured.kind === "booking" || quote.kind === "service") {
    const slot = asRecord(structured.slot) ?? quote.slot ?? {};
    const start = textOf(slot.start);
    const end = textOf(slot.end);
    const when = start
      ? `${titleCase(formatWeekdayLong(ymdOfIso(start, timeZone)))}, ${formatMonthDay(ymdOfIso(start, timeZone))}, ${windowPhrase(start, end, timeZone)}`
      : "that time";
    return `Booked for ${when}. It's on your schedule.`;
  }
  const eta = textOf(structured.eta) || quote.eta || "";
  const day = eta ? titleCase(formatWeekdayLong(eta)) : "the delivery day";
  if ((quote.item ?? "").includes("filter") || quote.kind === "part") {
    return `Ordered. I'll remind you to swap it on ${day}.`;
  }
  return `Ordered. I'll remind you when it arrives on ${day}.`;
}

function supplyClause(onHand: NonNullable<DialogueState["lastOnHand"]>): string {
  const place = onHand.location ? ` on the ${onHand.location.toLowerCase()}` : "";
  if (onHand.item === "battery" || /9v/i.test(onHand.name)) {
    const noun = onHand.qty === 1 ? "9-volt battery" : "9-volt batteries";
    return `${qtyWord(onHand.qty)} ${noun}${place}`;
  }
  return `${qtyWord(onHand.qty)} ${onHand.name}${place}`;
}

function composeOwned(cause: string, onHand: NonNullable<DialogueState["lastOnHand"]>, sound: Slots["sound"]): string {
  const stock = supplyClause(onHand);
  if (cause === "low_battery" || onHand.item === "battery") {
    const lead = sound === "chirp" ? "That chirp usually means a low battery" : "That usually means a low battery";
    return `${lead}, and you have ${stock}. Nothing to buy, so I added a task.`;
  }
  return `You have ${stock}. Nothing to buy, so I added a task.`;
}

function composeDone(structured: Record<string, unknown>, item: string): string {
  const inventory = asRecord(structured.inventoryAfter);
  const qty = typeof inventory?.qty === "number" ? inventory.qty : undefined;
  const nextDue = textOf(structured.nextDue);
  const when = nextDue ? formatMonthYear(nextDue) : "later";
  if (item === "battery" && qty !== undefined) {
    const left = qty === 1 ? "One 9-volt left" : `${titleCase(qtyWord(qty))} 9-volt batteries left`;
    return `Nice. ${left}, and the next battery change is due ${when}.`;
  }
  return `Nice. I logged that, and the next one is due ${when}.`;
}

function failureReply(result: ToolResponse): string {
  const code = errorCode(result.structuredContent);
  const message = result.text.trim();
  if (code === "QUOTE_EXPIRED") return `${message} I can price it again.`;
  if (code === "APPLIANCE_NOT_FOUND") return message.endsWith(".") ? message : `${message}.`;
  return message;
}

function publicSlots(slots: Slots): Slots {
  if (slots.code === undefined) return slots;
  return { ...slots, code: "••••" };
}

function finish(
  parsed: ParsedUtterance,
  state: DialogueState,
  reply: string,
  extra: Partial<TurnResult> & { displayUtterance: string },
): TurnResult {
  return {
    reply,
    alert: extra.alert ?? null,
    card: extra.card ?? null,
    state,
    intent: parsed.intent,
    slots: publicSlots(parsed.slots),
    guards: extra.guards ?? [],
    steps: extra.steps ?? [],
    displayUtterance: extra.displayUtterance,
    codeTurn: parsed.codeTurn,
    unreachable: extra.unreachable ?? false,
  };
}

function unreachableResult(parsed: ParsedUtterance, state: DialogueState, ctx: RunContext, displayUtterance: string): TurnResult {
  return finish(parsed, state, "I couldn't reach the home server. Press Retry.", {
    displayUtterance,
    steps: ctx.steps,
    unreachable: true,
    guards: [],
  });
}

async function resolveQuery(ctx: RunContext, query: string): Promise<Record<string, unknown> | "stop" | null> {
  const result = await callTool(ctx, "resolve_appliance", { query });
  if (result === null) return "stop";
  if (result.isError) return null;
  return result.structuredContent;
}

async function runBriefing(ctx: RunContext, horizon: number, applianceId?: string): Promise<{ reply: string; card: CardPayload } | "stop"> {
  const args: Record<string, unknown> = { horizonDays: horizon };
  if (applianceId) args.applianceId = applianceId;
  const result = await callTool(ctx, "get_upkeep_status", args);
  if (result === null) return "stop";
  if (result.isError) return { reply: failureReply(result), card: { uri: CARD_URIS.status, tool: "get_upkeep_status", structuredContent: result.structuredContent, context: {} } };
  const reply = applianceId && ctx.state.lastAppliance
    ? composeDue(result.structuredContent, ctx.state.lastAppliance)
    : horizon > 14
      ? composeDue(result.structuredContent, ctx.state.lastAppliance ?? {
          id: "",
          spokenName: "appliance",
          maker: "",
          model: "",
          product: "",
          location: "",
        })
      : composeBriefing(result.structuredContent, ctx.today);
  return {
    reply,
    card: { uri: CARD_URIS.status, tool: "get_upkeep_status", structuredContent: result.structuredContent, context: {} },
  };
}

export async function executeTurn(input: {
  utterance: string;
  state: DialogueState;
  clock: Clock;
  callTool: ToolCaller;
}): Promise<TurnResult> {
  const state = cloneState(input.state);
  const parsed = parseUtterance(input.utterance, state);
  const displayUtterance = parsed.codeTurn ? "••••" : stripWake(input.utterance).replace(/\s+/g, " ").trim();
  const ctx: RunContext = {
    clock: input.clock,
    timeZone: input.clock.timeZone ?? SIM_TIME_ZONE,
    today: ymdFromClock(input.clock),
    callTool: input.callTool,
    steps: [],
    state,
    unreachable: false,
  };

  if (parsed.guard === "hazard") {
    state.clarify = null;
    return finish(parsed, state, HAZARD_REPLY, { displayUtterance, alert: HAZARD_REPLY, guards: ["Hazard guard"], steps: [] });
  }
  if (parsed.guard === "scope") {
    decayOptions(state, false);
    return finish(parsed, state, SCOPE_REPLY, { displayUtterance, guards: ["Scope guard"], steps: [] });
  }

  if (parsed.intent === "help") {
    decayOptions(state, false);
    return finish(parsed, state, SCOPE_REPLY, { displayUtterance, steps: [] });
  }

  if (parsed.intent === "cancel") {
    const pending = state.pendingQuote !== null || state.pendingOptions !== null;
    state.pendingQuote = null;
    state.pendingOptions = null;
    state.optionsTurnsLeft = 0;
    state.awaitingCode = false;
    state.clarify = null;
    return finish(parsed, state, pending ? CANCEL_REPLY : "There's nothing to cancel.", { displayUtterance, steps: [] });
  }

  if (parsed.intent === "confirm") {
    if (!parsed.slots.code) {
      if (state.pendingQuote !== null) {
        state.awaitingCode = true;
        return finish(parsed, state, "Say your purchase code to confirm.", { displayUtterance, steps: [] });
      }
      return finish(parsed, state, NO_CODE_REPLY, { displayUtterance, steps: [] });
    }
    if (state.pendingQuote === null) {
      return finish(parsed, state, NO_CODE_REPLY, { displayUtterance, steps: [] });
    }
    const quote = state.pendingQuote;
    const args: Record<string, unknown> = { quoteId: quote.quoteId, code: parsed.slots.code ?? "" };
    if (parsed.slots.approve === true) args.approveOverCap = true;
    const result = await callTool(ctx, "confirm_purchase", args);
    if (result === null) return unreachableResult(parsed, state, ctx, displayUtterance);
    if (result.isError) {
      const code = errorCode(result.structuredContent);
      if (code !== "QUOTE_NOT_FOUND" && code !== "QUOTE_EXPIRED" && code !== "QUOTE_LOCKED") {
        state.awaitingCode = true;
      } else {
        state.pendingQuote = null;
        state.awaitingCode = false;
      }
      return finish(parsed, state, failureReply(result), { displayUtterance, steps: ctx.steps });
    }
    const reply = composeConfirmed(result.structuredContent, quote, ctx.timeZone);
    const card: CardPayload = {
      uri: CARD_URIS.receipt,
      tool: "confirm_purchase",
      structuredContent: result.structuredContent,
      context: { lines: quote.lines, totalUsd: quote.totalUsd, item: quote.item ?? "" },
    };
    state.pendingQuote = null;
    state.awaitingCode = false;
    return finish(parsed, state, reply, { displayUtterance, card, steps: ctx.steps });
  }

  if (parsed.intent === "choose_option" || parsed.intent === "choose_slot") {
    const chosen = pickOption(state.pendingOptions, parsed);
    if (chosen === null || state.pendingOptions === null) {
      decayOptions(state, false);
      return finish(parsed, state, "I don't have options open. Tell me what to look up.", { displayUtterance, steps: [] });
    }
    const result = await prepareChosen(ctx, chosen);
    if (result === null) return unreachableResult(parsed, state, ctx, displayUtterance);
    if (result.isError) return finish(parsed, state, failureReply(result), { displayUtterance, steps: ctx.steps });
    storeQuote(state, result.structuredContent, chosen.item);
    const quote = state.pendingQuote;
    if (quote === null) return finish(parsed, state, result.text, { displayUtterance, steps: ctx.steps });
    return finish(parsed, state, composeCheckout(quote, ctx.timeZone), {
      displayUtterance,
      steps: ctx.steps,
      card: { uri: CARD_URIS.checkout, tool: "prepare_checkout", structuredContent: result.structuredContent, context: {} },
    });
  }

  if (parsed.intent === "done") {
    decayOptions(state, false);
    const task = state.lastTask;
    if (task?.applianceId == null || task.item == null) {
      return finish(parsed, state, "Tell me which chore you finished.", { displayUtterance, steps: [] });
    }
    const result = await callTool(ctx, "log_maintenance", {
      applianceId: task.applianceId,
      item: task.item,
      consumeInventory: true,
    });
    if (result === null) return unreachableResult(parsed, state, ctx, displayUtterance);
    if (result.isError) return finish(parsed, state, failureReply(result), { displayUtterance, steps: ctx.steps });
    state.lastTask = { ...task, title: task.title };
    return finish(parsed, state, composeDone(result.structuredContent, task.item), {
      displayUtterance,
      steps: ctx.steps,
      card: {
        uri: CARD_URIS.task,
        tool: "log_maintenance",
        structuredContent: result.structuredContent,
        context: { done: true, applianceName: state.lastAppliance?.spokenName ?? "", title: task.title },
      },
    });
  }

  if (parsed.intent === "symptom" && state.clarify?.stage === "sound" && parsed.slots.sound !== "chirp") {
    return finish(parsed, state, SOUND_QUESTION, { displayUtterance, steps: [] });
  }

  if (parsed.intent === "symptom") {
    const symptomText = parsed.slots.symptom ?? input.utterance;
    const smoke = /smoke|alarm/.test(`${parsed.slots.query ?? ""} ${symptomText}`.toLowerCase());
    if (smoke && parsed.slots.sound !== "chirp" && state.clarify?.stage !== "appliance") {
      state.clarify = { stage: "sound", symptom: symptomText };
      return finish(parsed, state, SOUND_QUESTION, { displayUtterance, steps: [] });
    }
    if (state.clarify?.stage === "sound" && parsed.slots.sound === "chirp" && parsed.slots.query === undefined) {
      state.clarify = { stage: "appliance", symptom: "chirp" };
      return finish(parsed, state, WHICH_ALARM, { displayUtterance, steps: [] });
    }
    const query = parsed.slots.query ?? state.lastAppliance?.spokenName;
    if (!query) {
      state.clarify = { stage: "appliance", symptom: parsed.slots.symptom ?? "chirp" };
      return finish(parsed, state, WHICH_ALARM, { displayUtterance, steps: [] });
    }
    const resolved = await resolveQuery(ctx, query);
    if (resolved === "stop") return unreachableResult(parsed, state, ctx, displayUtterance);
    if (resolved === null) {
      const failed = ctx.steps.at(-1);
      return finish(parsed, state, failed ? "I couldn't match that appliance." : "I couldn't match that appliance.", { displayUtterance, steps: ctx.steps });
    }
    if (resolved.status === "ambiguous") {
      state.clarify = { stage: "appliance", symptom: parsed.slots.sound === "chirp" ? "chirp" : symptomText };
      skip(ctx, "diagnose_symptom");
      return finish(parsed, state, WHICH_ALARM, { displayUtterance, steps: ctx.steps });
    }
    const appliance = asRecord(resolved.appliance);
    if (appliance === null) return finish(parsed, state, "I couldn't match that appliance.", { displayUtterance, steps: ctx.steps });
    rememberAppliance(state, appliance);
    state.clarify = null;
    const diagnosed = await callTool(ctx, "diagnose_symptom", { applianceId: textOf(appliance.id), symptom: symptomText });
    if (diagnosed === null) return unreachableResult(parsed, state, ctx, displayUtterance);
    if (diagnosed.isError) return finish(parsed, state, failureReply(diagnosed), { displayUtterance, steps: ctx.steps });
    if (diagnosed.structuredContent.hazard === true) {
      return finish(parsed, state, HAZARD_REPLY, { displayUtterance, alert: HAZARD_REPLY, guards: ["Hazard guard"], steps: ctx.steps });
    }
    const item = textOf(diagnosed.structuredContent.item) || parsed.slots.item || itemForAppliance(state.lastAppliance!, parsed.slots.item);
    if (item === "") return finish(parsed, state, textOf(diagnosed.text) || "I couldn't match that symptom to a known cause.", { displayUtterance, steps: ctx.steps });
    const parts = await callTool(ctx, "find_parts", { applianceId: textOf(appliance.id), item });
    if (parts === null) return unreachableResult(parsed, state, ctx, displayUtterance);
    if (parts.isError) return finish(parsed, state, failureReply(parts), { displayUtterance, steps: ctx.steps });
    const onHand = asRecord(parts.structuredContent.onHand);
    state.lastOnHand = {
      name: textOf(onHand?.name) || (item === "battery" ? "9V battery" : humanItem(item)),
      qty: typeof onHand?.qty === "number" ? onHand.qty : 0,
      location: typeof onHand?.location === "string" ? onHand.location : null,
      item,
    };
    if (parts.structuredContent.recommendedAction === "use_on_hand" && state.lastOnHand.qty > 0) {
      const title = `Swap ${textOf(appliance.spokenName)} ${humanItem(item)}`;
      const created = await callTool(ctx, "create_task", {
        title,
        applianceId: textOf(appliance.id),
        item,
        dueDate: ctx.today,
        notes: `${state.lastOnHand.name} x${state.lastOnHand.qty}, ${state.lastOnHand.location ?? ""}`.trim(),
      });
      if (created === null) return unreachableResult(parsed, state, ctx, displayUtterance);
      if (created.isError) return finish(parsed, state, failureReply(created), { displayUtterance, steps: ctx.steps });
      const task = asRecord(created.structuredContent.task);
      state.lastTask = {
        taskId: textOf(created.structuredContent.taskId),
        applianceId: textOf(appliance.id),
        item,
        title: textOf(task?.title) || title,
      };
      return finish(parsed, state, composeOwned(textOf(diagnosed.structuredContent.cause), state.lastOnHand, parsed.slots.sound), {
        displayUtterance,
        steps: ctx.steps,
        card: {
          uri: CARD_URIS.task,
          tool: "create_task",
          structuredContent: created.structuredContent,
          context: { applianceName: textOf(appliance.spokenName), onHand: state.lastOnHand, done: false, title },
        },
      });
    }
    storeParts(state, textOf(appliance.id), item, asArray(parts.structuredContent.options));
    return finish(parsed, state, composeParts(state.lastAppliance!, parts.structuredContent), {
      displayUtterance,
      steps: ctx.steps,
      card: {
        uri: CARD_URIS.options,
        tool: "find_parts",
        structuredContent: parts.structuredContent,
        context: { fitsLine: fitsLine(state.lastAppliance!), mode: "parts" },
      },
    });
  }

  if (parsed.intent === "reorder_part") {
    const query = parsed.slots.query;
    if (!query) return finish(parsed, state, "Which appliance should I order for?", { displayUtterance, steps: [] });
    const resolved = await resolveQuery(ctx, query);
    if (resolved === "stop") return unreachableResult(parsed, state, ctx, displayUtterance);
    if (resolved === null) return finish(parsed, state, "I couldn't match that appliance.", { displayUtterance, steps: ctx.steps });
    if (resolved.status === "ambiguous") {
      return finish(parsed, state, textOf(resolved.speech) || WHICH_ALARM, { displayUtterance, steps: ctx.steps });
    }
    const appliance = asRecord(resolved.appliance);
    if (appliance === null) return finish(parsed, state, "I couldn't match that appliance.", { displayUtterance, steps: ctx.steps });
    rememberAppliance(state, appliance);
    const item = itemForAppliance(state.lastAppliance!, parsed.slots.item);
    const parts = await callTool(ctx, "find_parts", { applianceId: textOf(appliance.id), item });
    if (parts === null) return unreachableResult(parsed, state, ctx, displayUtterance);
    if (parts.isError) return finish(parsed, state, failureReply(parts), { displayUtterance, steps: ctx.steps });
    const onHand = asRecord(parts.structuredContent.onHand);
    if (parts.structuredContent.recommendedAction === "use_on_hand" && typeof onHand?.qty === "number" && onHand.qty > 0) {
      state.lastOnHand = {
        name: textOf(onHand.name) || humanItem(item),
        qty: onHand.qty,
        location: typeof onHand.location === "string" ? onHand.location : null,
        item,
      };
      const title = `Swap ${textOf(appliance.spokenName)} ${humanItem(item)}`;
      const created = await callTool(ctx, "create_task", {
        title,
        applianceId: textOf(appliance.id),
        item,
        dueDate: ctx.today,
      });
      if (created === null) return unreachableResult(parsed, state, ctx, displayUtterance);
      state.lastTask = { taskId: textOf(created.structuredContent.taskId), applianceId: textOf(appliance.id), item, title };
      return finish(parsed, state, `You already have ${supplyClause(state.lastOnHand)}. Nothing to buy, so I added a task.`, {
        displayUtterance,
        steps: ctx.steps,
        card: {
          uri: CARD_URIS.task,
          tool: "create_task",
          structuredContent: created.structuredContent,
          context: { applianceName: textOf(appliance.spokenName), onHand: state.lastOnHand, done: false, title },
        },
      });
    }
    storeParts(state, textOf(appliance.id), item, asArray(parts.structuredContent.options));
    return finish(parsed, state, composeParts(state.lastAppliance!, parts.structuredContent), {
      displayUtterance,
      steps: ctx.steps,
      card: {
        uri: CARD_URIS.options,
        tool: "find_parts",
        structuredContent: parts.structuredContent,
        context: { fitsLine: fitsLine(state.lastAppliance!), mode: "parts" },
      },
    });
  }

  if (parsed.intent === "book_service") {
    const query = parsed.slots.query ?? "dryer";
    const resolved = await resolveQuery(ctx, query);
    if (resolved === "stop") return unreachableResult(parsed, state, ctx, displayUtterance);
    if (resolved === null || resolved.status === "ambiguous") {
      return finish(parsed, state, resolved && resolved.status === "ambiguous" ? textOf(resolved.speech) : "I couldn't match that appliance.", {
        displayUtterance,
        steps: ctx.steps,
      });
    }
    const appliance = asRecord(resolved.appliance);
    if (appliance === null) return finish(parsed, state, "I couldn't match that appliance.", { displayUtterance, steps: ctx.steps });
    rememberAppliance(state, appliance);
    const item = parsed.slots.item ?? "vent_cleaning";
    const range = parsed.slots.range === "today"
      ? { from: ctx.today, to: ctx.today }
      : parsed.slots.range === "tomorrow"
        ? { from: addDays(ctx.today, 1), to: addDays(ctx.today, 1) }
        : nextWeekRange(ctx.today);
    const found = await callTool(ctx, "find_service_slots", {
      applianceId: textOf(appliance.id),
      item,
      from: range.from,
      to: range.to,
    });
    if (found === null) return unreachableResult(parsed, state, ctx, displayUtterance);
    if (found.isError) return finish(parsed, state, failureReply(found), { displayUtterance, steps: ctx.steps });
    const slots = asArray(found.structuredContent.slots);
    storeSlots(state, textOf(appliance.id), item, slots, ctx.timeZone);
    const earliest = slots[0];
    if (!earliest) return finish(parsed, state, "No appointments are open in that range.", { displayUtterance, steps: ctx.steps });
    const countWord = slots.length === 3 ? "three" : slots.length === 2 ? "two" : slots.length === 1 ? "one" : String(slots.length);
    const start = textOf(earliest.start);
    const end = textOf(earliest.end);
    const reply = `I found ${countWord} openings next week. The earliest is ${titleCase(formatWeekdayLong(textOf(earliest.date)))}, ${windowPhrase(start, end, ctx.timeZone)}, with ${textOf(earliest.provider)} for ${speechMoney(textOf(earliest.priceUsd))}.`;
    return finish(parsed, state, reply, {
      displayUtterance,
      steps: ctx.steps,
      card: {
        uri: CARD_URIS.options,
        tool: "find_service_slots",
        structuredContent: found.structuredContent,
        context: { mode: "slots", fitsLine: textOf(appliance.spokenName) },
      },
    });
  }

  if (parsed.intent === "register") {
    const maker = parsed.slots.maker ?? "";
    const model = parsed.slots.model ?? "";
    const location = parsed.slots.location ?? "";
    const product = parsed.slots.product ?? "appliance";
    if (maker === "" || model === "" || location === "") {
      return finish(parsed, state, "Tell me the type, maker, model, and location.", { displayUtterance, steps: [] });
    }
    const result = await callTool(ctx, "register_appliance", { type: product, maker, model, location });
    if (result === null) return unreachableResult(parsed, state, ctx, displayUtterance);
    if (result.isError) return finish(parsed, state, failureReply(result), { displayUtterance, steps: ctx.steps });
    const schedule = asArray(result.structuredContent.schedule)[0];
    const nextDue = textOf(schedule?.nextDue);
    const item = textOf(schedule?.item);
    state.lastAppliance = {
      id: textOf(result.structuredContent.applianceId),
      spokenName: product,
      maker,
      model,
      product,
      location,
    };
    const when = nextDue ? formatMonthYear(nextDue) : "later";
    const action = item === "flush" ? "flush it" : `handle the ${humanItem(item || "upkeep")}`;
    const reply = `Added your ${maker} ${model} ${product} in the ${location}. I'll remind you to ${action} in ${when}.`;
    return finish(parsed, state, reply, { displayUtterance, steps: ctx.steps });
  }

  if (parsed.intent === "ask_due") {
    const query = parsed.slots.query ?? state.lastAppliance?.spokenName;
    if (!query) return finish(parsed, state, "Which appliance should I check?", { displayUtterance, steps: [] });
    const resolved = await resolveQuery(ctx, query);
    if (resolved === "stop") return unreachableResult(parsed, state, ctx, displayUtterance);
    if (resolved === null || resolved.status === "ambiguous") {
      return finish(parsed, state, resolved && resolved.status === "ambiguous" ? textOf(resolved.speech) : "I couldn't match that appliance.", {
        displayUtterance,
        steps: ctx.steps,
      });
    }
    const appliance = asRecord(resolved.appliance);
    if (appliance === null) return finish(parsed, state, "I couldn't match that appliance.", { displayUtterance, steps: ctx.steps });
    rememberAppliance(state, appliance);
    const status = await callTool(ctx, "get_upkeep_status", { horizonDays: 400, applianceId: textOf(appliance.id) });
    if (status === null) return unreachableResult(parsed, state, ctx, displayUtterance);
    if (status.isError) return finish(parsed, state, failureReply(status), { displayUtterance, steps: ctx.steps });
    return finish(parsed, state, composeDue(status.structuredContent, state.lastAppliance!), {
      displayUtterance,
      steps: ctx.steps,
      card: { uri: CARD_URIS.status, tool: "get_upkeep_status", structuredContent: status.structuredContent, context: {} },
    });
  }

  if (parsed.intent === "upcoming") {
    const result = await runBriefing(ctx, 14);
    if (result === "stop") return unreachableResult(parsed, state, ctx, displayUtterance);
    return finish(parsed, state, composeUpcoming(result.card.structuredContent), { displayUtterance, card: result.card, steps: ctx.steps });
  }

  const briefing = await runBriefing(ctx, 14);
  if (briefing === "stop") return unreachableResult(parsed, state, ctx, displayUtterance);
  return finish(parsed, state, briefing.reply, { displayUtterance, card: briefing.card, steps: ctx.steps });
}

function pickOption(options: PendingOption[] | null, parsed: ParsedUtterance): PendingOption | null {
  if (options === null || options.length === 0) return null;
  if (parsed.intent === "choose_slot" || options[0]?.kind === "service") {
    if (parsed.slots.earliest) return options[0] ?? null;
    const weekday = parsed.slots.weekday;
    const daypart = parsed.slots.daypart;
    const named = options.find((option) => {
      if (option.kind !== "service") return false;
      if (weekday && option.weekday !== weekday) return false;
      if (daypart && option.daypart !== daypart) return false;
      return weekday !== undefined || daypart !== undefined;
    });
    if (named) return named;
  }
  const query = parsed.slots.option ?? "";
  if (query === "" || /^(yes|yeah|yep)[.!]?$/i.test(query)) {
    return options.find((option) => option.recommended) ?? options[0] ?? null;
  }
  if (query.toLowerCase() === "oem") return options.find((option) => option.partKind === "oem") ?? null;
  const key = normKey(query);
  return (
    options.find((option) => {
      const name = normKey(option.name);
      return name.includes(key) || key.includes(name) || (option.provider ? normKey(option.provider).includes(key) : false);
    }) ?? null
  );
}

async function prepareChosen(ctx: RunContext, chosen: PendingOption): Promise<ToolResponse | null> {
  if (chosen.kind === "service") {
    return callTool(ctx, "prepare_checkout", { items: [{ type: "service", slotId: chosen.id }] });
  }
  return callTool(ctx, "prepare_checkout", {
    items: [{ type: "part", optionId: chosen.id, qty: 1, forApplianceId: chosen.applianceId ?? "" }],
  });
}
