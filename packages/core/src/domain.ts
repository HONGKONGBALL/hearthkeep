/**
 * Domain rules for the fictional Hearthkeep household.
 * Prices, brands, and the demo purchase code are simulation data, not credentials.
 */
import { addCalendarDays, formatInZone } from "./clock";
import type { Repository } from "./repository";
import type {
  Appliance,
  AuditEvent,
  JsonValue,
  PartOption,
  Preferences,
  Quote,
  Schedule,
  ServiceSlot,
  Task,
} from "./types";

export const DOMAIN_ERROR_CODES = [
  "INVALID_ARGUMENT",
  "APPLIANCE_NOT_FOUND",
  "ITEM_NOT_APPLICABLE",
  "PART_NOT_COMPATIBLE",
  "POLICY_EXCLUDED",
  "SLOT_UNAVAILABLE",
  "QUOTE_NOT_FOUND",
  "QUOTE_EXPIRED",
  "QUOTE_LOCKED",
  "INVALID_PURCHASE_CODE",
  "OVER_CAP_APPROVAL_REQUIRED",
  "ORDER_NOT_CANCELLABLE",
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

/** Fictional demo code used only when HK_PURCHASE_CODE is unset. */
export const DEMO_PURCHASE_CODE = "2468";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly attemptsRemaining?: number;
  readonly details: { [key: string]: JsonValue };

  constructor(
    code: DomainErrorCode,
    message: string,
    details: { [key: string]: JsonValue } = {},
    attemptsRemaining?: number,
  ) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
    if (attemptsRemaining !== undefined) this.attemptsRemaining = attemptsRemaining;
  }
}

export interface UpkeepAttention {
  applianceId: string;
  spokenName: string;
  item: string;
  how: Schedule["how"];
  bucket: "overdue" | "due_today";
  due: string;
  daysOverdue?: number;
}

export interface UpkeepUpcoming {
  applianceId: string;
  spokenName: string;
  item: string;
  how: Schedule["how"];
  due: string;
  daysUntil: number;
}

export interface UpkeepInProgress {
  kind: "order" | "booking";
  id: string;
  status: string;
  applianceId: string | null;
  item: string | null;
  name: string;
  eta?: string;
  provider?: string;
  windowStart?: string;
  windowEnd?: string;
}

export interface UpkeepTask {
  taskId: string;
  title: string;
  applianceId: string | null;
  item: string | null;
  dueDate: string | null;
  notes: string | null;
  status: "open";
}

export interface UpkeepStatus {
  now: string;
  attention: UpkeepAttention[];
  upcoming: UpkeepUpcoming[];
  inProgress: UpkeepInProgress[];
  tasks: UpkeepTask[];
  speech: string;
}

export interface ResolvedAppliance {
  id: string;
  spokenName: string;
  maker: string;
  model: string;
  product: string;
  location: string;
}

export interface ResolveResult {
  status: "match" | "ambiguous";
  appliance?: ResolvedAppliance;
  candidates?: ResolvedAppliance[];
  speech: string;
}

export interface RegisterSchedule {
  item: string;
  how: Schedule["how"];
  everyDays: number | null;
  trigger: Schedule["trigger"];
  lastDone: string | null;
  nextDue: string | null;
  spec: string | null;
  maxMerv: number | null;
}

export interface RegisterResult {
  applianceId: string;
  created: boolean;
  scheduleSource: "catalog" | "none";
  schedule: RegisterSchedule[];
  speech: string;
}

export interface PartChoice {
  optionId: string;
  name: string;
  brand: string;
  priceUsd: string;
  eta: string;
  kind: PartOption["kind"];
  certified: boolean | null;
  recommended: boolean;
  packQty: number;
  leadDays: number;
}

export interface ExcludedPart {
  optionId: string;
  name: string;
  reason: "POLICY_UNCERTIFIED" | "EXCEEDS_MAKER_SPEC";
}

export interface OnHand {
  qty: number;
  location: string | null;
  receivedNotInstalled: number;
}

export interface FindPartsResult {
  options: PartChoice[];
  excluded: ExcludedPart[];
  onHand: OnHand;
  recommendedAction: "buy" | "use_on_hand";
  speech: string;
}

export interface Diagnosis {
  hazard: boolean;
  cause?: string;
  item?: string;
  advice: string;
  speech: string;
}

export interface ServiceSlotChoice {
  slotId: string;
  provider: string;
  date: string;
  weekday: string;
  start: string;
  end: string;
  priceUsd: string;
  overCap: boolean;
}

export interface ServiceSlotsResult {
  slots: ServiceSlotChoice[];
  speech: string;
}

export interface PartLine {
  type: "part";
  optionId: string;
  qty: number;
  forApplianceId: string;
  item: string;
  name: string;
  unitPriceUsd: string;
  lineTotalUsd: string;
  eta: string;
  leadDays: number;
}

export interface ServiceLine {
  type: "service";
  slotId: string;
  applianceId: string;
  item: string;
  provider: string;
  windowStart: string;
  windowEnd: string;
  priceUsd: string;
  lineTotalUsd: string;
}

export type CheckoutLine = PartLine | ServiceLine;

export interface CheckoutSlot {
  slotId: string;
  provider: string;
  start: string;
  end: string;
  priceUsd: string;
}

export interface CheckoutQuote {
  quoteId: string;
  kind: "part" | "service";
  lines: CheckoutLine[];
  totalUsd: string;
  capUsd: string;
  overCap: boolean;
  overByUsd?: string;
  expiresAt: string;
  eta?: string;
  slot?: CheckoutSlot;
  speech: string;
}

export interface ConfirmPurchaseResult {
  kind: "order" | "booking";
  id: string;
  orderId?: string;
  bookingId?: string;
  status: string;
  eta?: string;
  slot?: CheckoutSlot;
  mock: true;
  alreadyConfirmed?: true;
  createdTaskId?: string;
  speech: string;
}

export interface CreatedTask {
  taskId: string;
  task: Task;
  speech: string;
}

export interface InventoryAfter {
  id: string;
  item: string;
  name: string;
  qty: number;
  location: string;
  receivedNotInstalled: number;
}

export interface MaintenanceLog {
  lastDone: string;
  nextDue: string | null;
  inventoryAfter?: InventoryAfter;
  closedTaskIds: string[];
  speech: string;
}

export interface LifecycleSync {
  shipped: string[];
  delivered: string[];
}

const STOP_WORDS = new Set(["the", "a", "an", "my", "our"]);

function invalid(message: string): never {
  throw new DomainError("INVALID_ARGUMENT", message);
}

function zoneOf(repo: Repository): string {
  return repo.getHousehold().timezone;
}

function localDate(iso: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T/.exec(iso);
  if (!match) invalid("Clock time is not a household timestamp.");
  return match[1];
}

function today(repo: Repository): string {
  return localDate(repo.now());
}

function assertDate(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    invalid(`${label} must be a YYYY-MM-DD date.`);
  }
  const [year, month, day] = value.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    invalid(`${label} must be a real date.`);
  }
  return value;
}

function addDays(date: string, days: number, timeZone: string): string {
  return addCalendarDays(`${date}T12:00:00-07:00`, days, timeZone).slice(0, 10);
}

function daysBetween(fromDate: string, toDate: string): number {
  const [fy, fm, fd] = fromDate.split("-").map(Number);
  const [ty, tm, td] = toDate.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86_400_000);
}

function moneyToCents(value: string): number {
  if (!/^\d+\.\d{2}$/.test(value)) invalid(`Invalid USD amount: ${value}`);
  const [dollars, cents] = value.split(".");
  return Number(dollars) * 100 + Number(cents);
}

function centsToMoney(cents: number): string {
  const abs = Math.abs(cents);
  return `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

function humanize(item: string): string {
  return item.replaceAll("_", " ");
}

function normItem(item: string): string {
  return item.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") invalid(`${label} is required.`);
  return value.trim();
}

function requireAppliance(repo: Repository, id: unknown): Appliance {
  const applianceId = requireText(id, "applianceId");
  const appliance = repo.getAppliance(applianceId);
  if (!appliance) {
    throw new DomainError("APPLIANCE_NOT_FOUND", "I don't know that appliance yet, and I can add it if you want.");
  }
  return appliance;
}

function scheduleFor(repo: Repository, appliance: Appliance, item: string): Schedule {
  const schedule = repo.getSchedule(appliance.id);
  if (!schedule || normItem(schedule.item) !== normItem(item)) {
    throw new DomainError(
      "ITEM_NOT_APPLICABLE",
      `The ${appliance.spokenName} doesn't take a ${humanize(normItem(item))}.`,
    );
  }
  return schedule;
}

function purchaseCode(explicit?: string): string {
  if (explicit !== undefined && explicit.trim() !== "") return explicit.trim();
  const fromEnv = process.env.HK_PURCHASE_CODE;
  if (typeof fromEnv === "string" && fromEnv.trim() !== "") return fromEnv.trim();
  return DEMO_PURCHASE_CODE;
}

function detailLeaksCode(detail: { [key: string]: JsonValue }, secret: string): boolean {
  if (secret.length < 4) return false;
  return JSON.stringify(detail).includes(secret);
}

export function recordAudit(
  repo: Repository,
  action: string,
  entityType: string,
  entityId: string,
  detail: { [key: string]: JsonValue } = {},
): AuditEvent {
  const secret = purchaseCode();
  if (detailLeaksCode(detail, secret)) {
    invalid("Audit detail cannot contain a purchase code.");
  }
  return repo.appendAudit({
    action,
    entityType,
    entityId,
    detail,
    at: repo.now(),
  });
}

function partFits(part: PartOption, appliance: Appliance): boolean {
  if (part.fitsModel && part.fitsModel === appliance.model) return true;
  if (part.fitsProduct && part.fitsProduct === appliance.product) return true;
  return false;
}

function exclusionReason(part: PartOption, schedule: Schedule): ExcludedPart["reason"] | null {
  if (schedule.maxMerv !== null && part.merv !== null && part.merv > schedule.maxMerv) {
    return "EXCEEDS_MAKER_SPEC";
  }
  if (part.kind !== "oem" && part.certified === false) return "POLICY_UNCERTIFIED";
  return null;
}

function onHandFor(repo: Repository, item: string): OnHand {
  const rows = repo.listInventory().filter((row) => normItem(row.item) === normItem(item));
  const qty = rows.reduce((sum, row) => sum + row.qty, 0);
  const receivedNotInstalled = rows.reduce((sum, row) => sum + row.receivedNotInstalled, 0);
  const located = rows.find((row) => row.qty > 0);
  return { qty, location: located ? located.location : null, receivedNotInstalled };
}

function etaFor(date: string, leadDays: number, timeZone: string): string {
  return addDays(date, leadDays, timeZone);
}

function normalizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token !== "" && !STOP_WORDS.has(token));
}

function haystack(appliance: Appliance): string {
  return [appliance.spokenName, appliance.product, appliance.location, appliance.maker, appliance.model, appliance.modelDetail]
    .filter((part): part is string => typeof part === "string" && part !== "")
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
}

function toResolved(appliance: Appliance): ResolvedAppliance {
  return {
    id: appliance.id,
    spokenName: appliance.spokenName,
    maker: appliance.maker,
    model: appliance.model,
    product: appliance.product,
    location: appliance.location,
  };
}

function toRegisterSchedule(schedule: Schedule): RegisterSchedule {
  return {
    item: schedule.item,
    how: schedule.how,
    everyDays: schedule.everyDays,
    trigger: schedule.trigger,
    lastDone: schedule.lastDone,
    nextDue: schedule.nextDue,
    spec: schedule.spec,
    maxMerv: schedule.maxMerv,
  };
}

function activeOrders(repo: Repository): UpkeepInProgress[] {
  const parts = new Map(repo.listParts().map((part) => [part.id, part]));
  const openTaskIds = new Set(repo.listTasks().filter((task) => task.status === "open").map((task) => task.id));
  const rows: UpkeepInProgress[] = [];
  for (const order of repo.listOrders()) {
    const awaitingInstall = order.status === "delivered" && order.taskId !== null && openTaskIds.has(order.taskId);
    if (order.status !== "placed" && order.status !== "shipped" && !awaitingInstall) continue;
    const part = order.optionId ? parts.get(order.optionId) : undefined;
    const entry: UpkeepInProgress = {
      kind: "order",
      id: order.id,
      status: order.status,
      applianceId: order.applianceId,
      item: part ? part.item : null,
      name: part ? part.name : "order",
    };
    if (order.eta) entry.eta = order.eta;
    rows.push(entry);
  }
  for (const booking of repo.listBookings()) {
    if (booking.status !== "booked") continue;
    rows.push({
      kind: "booking",
      id: booking.id,
      status: booking.status,
      applianceId: booking.applianceId,
      item: booking.service,
      name: humanize(booking.service),
      provider: booking.provider,
      windowStart: booking.windowStart,
      windowEnd: booking.windowEnd,
    });
  }
  return rows;
}

function held(progress: UpkeepInProgress[], applianceId: string, item: string): boolean {
  return progress.some((row) => row.applianceId === applianceId && row.item === item);
}

export function getUpkeepStatus(
  repo: Repository,
  input: { horizonDays?: number; applianceId?: string } = {},
): UpkeepStatus {
  const preferences = repo.getPreferences();
  const horizon = input.horizonDays === undefined ? preferences.comingUpWindowDays : input.horizonDays;
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 400) {
    invalid("horizonDays must be an integer from 1 to 400.");
  }
  let applianceFilter: string | undefined;
  if (input.applianceId !== undefined) {
    applianceFilter = requireAppliance(repo, input.applianceId).id;
  }
  const now = repo.now();
  const dueDate = today(repo);
  const appliances = new Map(repo.listAppliances().map((appliance) => [appliance.id, appliance]));
  const progress = activeOrders(repo).filter((row) => applianceFilter === undefined || row.applianceId === applianceFilter);
  const attention: UpkeepAttention[] = [];
  const upcoming: UpkeepUpcoming[] = [];
  for (const schedule of repo.listSchedule()) {
    if (applianceFilter !== undefined && schedule.applianceId !== applianceFilter) continue;
    if (!schedule.nextDue) continue;
    if (held(progress, schedule.applianceId, schedule.item)) continue;
    const appliance = appliances.get(schedule.applianceId);
    if (!appliance) continue;
    const delta = daysBetween(dueDate, schedule.nextDue);
    if (delta < 0) {
      attention.push({
        applianceId: appliance.id,
        spokenName: appliance.spokenName,
        item: schedule.item,
        how: schedule.how,
        bucket: "overdue",
        due: schedule.nextDue,
        daysOverdue: -delta,
      });
    } else if (delta === 0) {
      attention.push({
        applianceId: appliance.id,
        spokenName: appliance.spokenName,
        item: schedule.item,
        how: schedule.how,
        bucket: "due_today",
        due: schedule.nextDue,
      });
    } else if (delta <= horizon) {
      upcoming.push({
        applianceId: appliance.id,
        spokenName: appliance.spokenName,
        item: schedule.item,
        how: schedule.how,
        due: schedule.nextDue,
        daysUntil: delta,
      });
    }
  }
  attention.sort((a, b) => a.due.localeCompare(b.due) || a.applianceId.localeCompare(b.applianceId));
  upcoming.sort((a, b) => a.due.localeCompare(b.due) || a.applianceId.localeCompare(b.applianceId));
  const tasks: UpkeepTask[] = repo
    .listTasks()
    .filter((task) => task.status === "open")
    .filter((task) => applianceFilter === undefined || task.applianceId === applianceFilter)
    .map((task) => ({
      taskId: task.id,
      title: task.title,
      applianceId: task.applianceId,
      item: task.item,
      dueDate: task.dueDate,
      notes: task.notes,
      status: "open" as const,
    }))
    .sort((a, b) => (a.dueDate ?? "9999-99-99").localeCompare(b.dueDate ?? "9999-99-99") || a.taskId.localeCompare(b.taskId));
  return {
    now,
    attention,
    upcoming,
    inProgress: progress,
    tasks,
    speech: upkeepSpeech(attention),
  };
}

function upkeepSpeech(attention: UpkeepAttention[]): string {
  if (attention.length === 0) return "Nothing needs attention right now.";
  const phrases = attention.slice(0, 2).map((item) => {
    const name = `${item.spokenName} ${humanize(item.item)}`;
    return item.bucket === "overdue" ? `${name} is overdue` : `${name} is due today`;
  });
  const sentence = phrases.length === 1 ? `The ${phrases[0]}.` : `The ${phrases[0]}, and the ${phrases[1]}.`;
  return sentence;
}

export function resolveAppliance(repo: Repository, input: { query: string }): ResolveResult {
  const query = requireText(input.query, "query");
  const tokens = normalizeQuery(query);
  if (tokens.length === 0) invalid("query needs an appliance name.");
  const matches = repo.listAppliances().filter((appliance) => {
    const text = haystack(appliance);
    return tokens.every((token) => text.includes(token));
  });
  if (matches.length === 0) {
    throw new DomainError("APPLIANCE_NOT_FOUND", `I don't know a ${query} yet, and I can add it if you want.`);
  }
  if (matches.length === 1) {
    const appliance = toResolved(matches[0]);
    return {
      status: "match",
      appliance,
      speech: `That is the ${appliance.spokenName}, a ${appliance.maker} ${appliance.model} in the ${appliance.location}.`,
    };
  }
  const candidates = matches.map(toResolved);
  const names = candidates.map((candidate) => candidate.spokenName).join(" or the ");
  return {
    status: "ambiguous",
    candidates,
    speech: `Which one, the ${names}?`,
  };
}

function findExisting(repo: Repository, maker: string, model: string, location: string): Appliance | null {
  const key = `${maker.toLowerCase()}|${model.toLowerCase()}|${location.toLowerCase()}`;
  return (
    repo.listAppliances().find((appliance) => {
      const row = `${appliance.maker.toLowerCase()}|${appliance.model.toLowerCase()}|${appliance.location.toLowerCase()}`;
      return row === key;
    }) ?? null
  );
}

function findCatalog(repo: Repository, maker: string, model: string) {
  const exact = repo.findCatalogModel(maker, model);
  if (exact) return exact;
  const makerKey = maker.toLowerCase();
  const modelKey = model.toLowerCase();
  return (
    repo.listCatalogModels().find((row) => row.maker.toLowerCase() === makerKey && row.model.toLowerCase() === modelKey) ??
    null
  );
}

export function registerAppliance(
  repo: Repository,
  input: { type: string; maker: string; model: string; location: string; installedOn?: string },
): RegisterResult {
  const type = requireText(input.type, "type");
  const maker = requireText(input.maker, "maker");
  const model = requireText(input.model, "model");
  const location = requireText(input.location, "location");
  const installedOn = input.installedOn === undefined ? today(repo) : assertDate(input.installedOn, "installedOn");
  const existing = findExisting(repo, maker, model, location);
  if (existing) {
    const schedule = repo.getSchedule(existing.id);
    const rows = schedule ? [toRegisterSchedule(schedule)] : [];
    return {
      applianceId: existing.id,
      created: false,
      scheduleSource: rows.length > 0 ? "catalog" : "none",
      schedule: rows,
      speech: `The ${existing.spokenName} is already in the home.`,
    };
  }
  const catalog = findCatalog(repo, maker, model);
  const product = catalog ? catalog.product : type.replaceAll("_", " ");
  const timeZone = zoneOf(repo);
  let scheduleInput: RegisterSchedule | null = null;
  if (catalog?.schedule) {
    const template = catalog.schedule;
    const rolls = template.trigger === "interval" && template.everyDays !== null;
    scheduleInput = {
      item: template.item,
      how: template.how,
      everyDays: template.everyDays,
      trigger: template.trigger,
      lastDone: rolls ? installedOn : null,
      nextDue: rolls && template.everyDays !== null ? addDays(installedOn, template.everyDays, timeZone) : null,
      spec: template.spec,
      maxMerv: template.maxMerv,
    };
  }
  const appliance = repo.insertAppliance({
    spokenName: product,
    maker,
    model,
    modelDetail: null,
    product,
    location,
    schedule: scheduleInput,
  });
  recordAudit(repo, "appliance_registered", "appliance", appliance.id, {
    maker,
    model,
    location,
    product,
    scheduleSource: scheduleInput ? "catalog" : "none",
  });
  const schedule = scheduleInput ? [scheduleInput] : [];
  const speech = scheduleInput
    ? `Added the ${product}. The ${humanize(scheduleInput.item)} is next due ${scheduleInput.nextDue}.`
    : `Added the ${product}. There is no schedule for that model.`;
  return {
    applianceId: appliance.id,
    created: true,
    scheduleSource: scheduleInput ? "catalog" : "none",
    schedule,
    speech,
  };
}

export function findParts(repo: Repository, input: { applianceId: string; item: string }): FindPartsResult {
  const appliance = requireAppliance(repo, input.applianceId);
  const item = normItem(requireText(input.item, "item"));
  const schedule = scheduleFor(repo, appliance, item);
  const timeZone = zoneOf(repo);
  const orderedOn = today(repo);
  const excluded: ExcludedPart[] = [];
  const options: PartChoice[] = [];
  for (const part of repo.listParts()) {
    if (normItem(part.item) !== item) continue;
    if (!partFits(part, appliance)) continue;
    const reason = exclusionReason(part, schedule);
    if (reason) {
      excluded.push({ optionId: part.id, name: part.name, reason });
      continue;
    }
    options.push({
      optionId: part.id,
      name: part.name,
      brand: part.brand,
      priceUsd: part.priceUsd,
      eta: etaFor(orderedOn, part.leadDays, timeZone),
      kind: part.kind,
      certified: part.certified,
      recommended: false,
      packQty: part.packQty,
      leadDays: part.leadDays,
    });
  }
  options.sort((a, b) => moneyToCents(a.priceUsd) - moneyToCents(b.priceUsd) || a.leadDays - b.leadDays || a.optionId.localeCompare(b.optionId));
  const onHand = onHandFor(repo, item);
  const useStock = onHand.qty > 0;
  if (!useStock && options.length > 0) options[0].recommended = true;
  const recommendedAction = useStock ? "use_on_hand" : "buy";
  const speech = useStock
    ? `You already have ${onHand.qty} on hand${onHand.location ? ` on the ${onHand.location}` : ""}. Nothing to buy.`
    : options.length > 0
      ? `${options[0].name} is ${options[0].priceUsd} dollars and arrives ${options[0].eta}.`
      : "No matching part is available to buy.";
  return { options, excluded, onHand, recommendedAction, speech };
}

function normalizePhrase(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function expandOr(tokens: string[]): string[][] {
  const at = tokens.indexOf("or");
  if (at <= 0 || at >= tokens.length - 1) return [tokens];
  const prefix = tokens.slice(0, at - 1);
  const suffix = tokens.slice(at + 2);
  return [
    [...prefix, tokens[at - 1], ...suffix],
    [...prefix, tokens[at + 1], ...suffix],
  ];
}

function wordsInOrder(text: string, tokens: string[]): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  let index = 0;
  for (const word of words) {
    const token = tokens[index];
    if (word === token || (token.length >= 4 && word.startsWith(token))) index += 1;
    if (index === tokens.length) return true;
  }
  return false;
}

function phraseMatches(symptom: string, phrase: string): boolean {
  const text = normalizePhrase(symptom);
  const alternatives = expandOr(normalizePhrase(phrase).split(/\s+/).filter(Boolean));
  return alternatives.some((tokens) => tokens.length > 0 && (text.includes(tokens.join(" ")) || wordsInOrder(text, tokens)));
}

export function diagnoseSymptom(repo: Repository, input: { applianceId: string; symptom: string }): Diagnosis {
  const appliance = requireAppliance(repo, input.applianceId);
  const symptom = requireText(input.symptom, "symptom");
  for (const hazard of repo.listHazards()) {
    if (hazard.phrases.some((phrase) => phraseMatches(symptom, phrase))) {
      const advice = "Leave the home and call emergency services. This is safety advice only.";
      return { hazard: true, advice, speech: advice };
    }
  }
  const matches = repo.listSymptoms().filter((row) => {
    if (row.maker && row.model) {
      return row.maker.toLowerCase() === appliance.maker.toLowerCase() && row.model.toLowerCase() === appliance.model.toLowerCase();
    }
    return row.product !== null && row.product.toLowerCase() === appliance.product.toLowerCase();
  });
  const found = matches.find((row) => row.phrases.some((phrase) => phraseMatches(symptom, phrase)));
  if (!found) {
    const advice = "I couldn't match that symptom to a known cause.";
    return { hazard: false, advice, speech: advice };
  }
  const advice = adviceFor(found.result);
  return { hazard: false, cause: found.result, item: found.item, advice, speech: advice };
}

function adviceFor(result: string): string {
  if (result === "low_battery") return "That sounds like a low battery.";
  if (result === "filter_due") return "That sounds like the filter is due.";
  if (result === "vent_restricted") return "That sounds like the vent is restricted.";
  if (result === "bulb_failed") return "That sounds like the bulb has failed.";
  return `That points to ${humanize(result)}.`;
}

function slotTaken(repo: Repository, slotId: string): boolean {
  return repo.listBookings().some((booking) => booking.slotId === slotId && booking.status === "booked");
}

function slotInPast(repo: Repository, slot: ServiceSlot): boolean {
  return Date.parse(slot.windowStart) <= Date.parse(repo.now());
}

export function findServiceSlots(
  repo: Repository,
  input: { applianceId: string; item: string; from: string; to: string },
): ServiceSlotsResult {
  const appliance = requireAppliance(repo, input.applianceId);
  const item = normItem(requireText(input.item, "item"));
  scheduleFor(repo, appliance, item);
  const from = assertDate(input.from, "from");
  const to = assertDate(input.to, "to");
  if (from > to) invalid("I need a date range in the future for that.");
  const dueDate = today(repo);
  if (from < dueDate || to < dueDate) invalid("I need a date range in the future for that.");
  const cap = moneyToCents(repo.getPreferences().spendCapUsd);
  const slots = repo
    .listServiceSlots()
    .filter((slot) => slot.service === item && slot.date >= from && slot.date <= to)
    .filter((slot) => !slotTaken(repo, slot.id) && !slotInPast(repo, slot))
    .sort((a, b) => a.windowStart.localeCompare(b.windowStart))
    .map((slot) => ({
      slotId: slot.id,
      provider: slot.provider,
      date: slot.date,
      weekday: slot.weekday,
      start: slot.windowStart,
      end: slot.windowEnd,
      priceUsd: slot.priceUsd,
      overCap: moneyToCents(slot.priceUsd) > cap,
    }));
  const speech = slots.length === 0 ? "No appointments are open in that range." : `${slots.length} appointments are open.`;
  return { slots, speech };
}

function applianceForService(repo: Repository, service: string): Appliance {
  const matches = repo.listAppliances().filter((appliance) => repo.getSchedule(appliance.id)?.item === service);
  if (matches.length === 0) {
    throw new DomainError("ITEM_NOT_APPLICABLE", `Nothing in the home takes ${humanize(service)}.`);
  }
  matches.sort((a, b) => {
    const left = repo.getSchedule(a.id)?.nextDue ?? "9999-99-99";
    const right = repo.getSchedule(b.id)?.nextDue ?? "9999-99-99";
    return left.localeCompare(right) || a.id.localeCompare(b.id);
  });
  return matches[0];
}

function quoteExpiry(repo: Repository, preferences: Preferences): string {
  const minutes = preferences.quoteLifetimeSimMinutes;
  return formatInZone(Date.parse(repo.now()) + minutes * 60_000, zoneOf(repo));
}

function asPartLine(value: JsonValue): PartLine | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as { [key: string]: JsonValue };
  if (row.type !== "part" || typeof row.optionId !== "string" || typeof row.forApplianceId !== "string") return null;
  if (typeof row.qty !== "number" || typeof row.item !== "string" || typeof row.lineTotalUsd !== "string") return null;
  if (typeof row.name !== "string" || typeof row.unitPriceUsd !== "string" || typeof row.eta !== "string") return null;
  if (typeof row.leadDays !== "number") return null;
  return {
    type: "part",
    optionId: row.optionId,
    qty: row.qty,
    forApplianceId: row.forApplianceId,
    item: row.item,
    name: row.name,
    unitPriceUsd: row.unitPriceUsd,
    lineTotalUsd: row.lineTotalUsd,
    eta: row.eta,
    leadDays: row.leadDays,
  };
}

function asServiceLine(value: JsonValue): ServiceLine | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as { [key: string]: JsonValue };
  if (row.type !== "service" || typeof row.slotId !== "string" || typeof row.applianceId !== "string") return null;
  if (typeof row.item !== "string" || typeof row.provider !== "string") return null;
  if (typeof row.windowStart !== "string" || typeof row.windowEnd !== "string") return null;
  if (typeof row.priceUsd !== "string" || typeof row.lineTotalUsd !== "string") return null;
  return {
    type: "service",
    slotId: row.slotId,
    applianceId: row.applianceId,
    item: row.item,
    provider: row.provider,
    windowStart: row.windowStart,
    windowEnd: row.windowEnd,
    priceUsd: row.priceUsd,
    lineTotalUsd: row.lineTotalUsd,
  };
}

export function prepareCheckout(
  repo: Repository,
  input: {
    items: Array<
      | { type: "part"; optionId: string; qty: number; forApplianceId: string }
      | { type: "service"; slotId: string }
    >;
  },
): CheckoutQuote {
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 3) {
    invalid("items must contain 1 to 3 lines.");
  }
  const kind = input.items[0]?.type;
  if (kind !== "part" && kind !== "service") invalid("Each line needs a type of part or service.");
  if (input.items.some((line) => line.type !== kind)) invalid("All lines must be the same type.");
  if (kind === "service") {
    const slotIds = input.items.map((line) => (line.type === "service" ? line.slotId : ""));
    if (new Set(slotIds).size !== slotIds.length) invalid("Each service line needs a different slot.");
  }
  const preferences = repo.getPreferences();
  const timeZone = zoneOf(repo);
  const orderedOn = today(repo);
  const lines: CheckoutLine[] = input.items.map((line) => {
    if (line.type === "part") return pricePart(repo, line, orderedOn, timeZone);
    return priceService(repo, line);
  });
  const totalCents = lines.reduce((sum, line) => sum + moneyToCents(line.lineTotalUsd), 0);
  const capCents = moneyToCents(preferences.spendCapUsd);
  const overCap = totalCents > capCents;
  const totalUsd = centsToMoney(totalCents);
  const expiresAt = quoteExpiry(repo, preferences);
  const partLines = lines.filter((line): line is PartLine => line.type === "part");
  const serviceLines = lines.filter((line): line is ServiceLine => line.type === "service");
  const eta = partLines.length > 0 ? partLines.map((line) => line.eta).sort().at(-1) : undefined;
  const firstService = serviceLines[0];
  const slot = firstService
    ? {
        slotId: firstService.slotId,
        provider: firstService.provider,
        start: firstService.windowStart,
        end: firstService.windowEnd,
        priceUsd: firstService.priceUsd,
      }
    : undefined;
  const quote = repo.insertQuote({
    kind,
    lines: lines as unknown as JsonValue[],
    totalUsd,
    capUsd: preferences.spendCapUsd,
    overCap,
    expiresAt,
    createdAt: repo.now(),
  });
  recordAudit(repo, "quote_created", "quote", quote.id, {
    quoteId: quote.id,
    kind,
    totalUsd,
    overCap,
    expiresAt,
  });
  const overByUsd = overCap ? centsToMoney(totalCents - capCents) : undefined;
  const speech = overCap
    ? `The total is $${totalUsd}, which is over your $${preferences.spendCapUsd} limit by $${overByUsd}.`
    : `The total is $${totalUsd}. This price expires in ${preferences.quoteLifetimeSimMinutes} minutes.`;
  return {
    quoteId: quote.id,
    kind,
    lines,
    totalUsd,
    capUsd: preferences.spendCapUsd,
    overCap,
    ...(overByUsd ? { overByUsd } : {}),
    expiresAt,
    ...(eta ? { eta } : {}),
    ...(slot ? { slot } : {}),
    speech,
  };
}

function pricePart(
  repo: Repository,
  line: { type: "part"; optionId: string; qty: number; forApplianceId: string },
  orderedOn: string,
  timeZone: string,
): PartLine {
  if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > 10) invalid("qty must be an integer from 1 to 10.");
  const optionId = requireText(line.optionId, "optionId");
  const appliance = requireAppliance(repo, line.forApplianceId);
  const part = repo.getPart(optionId);
  if (!part) invalid(`Unknown optionId ${optionId}.`);
  if (!partFits(part, appliance)) {
    throw new DomainError("PART_NOT_COMPATIBLE", `That filter doesn't fit your ${appliance.spokenName}.`);
  }
  const schedule = scheduleFor(repo, appliance, part.item);
  const reason = exclusionReason(part, schedule);
  if (reason) {
    const message =
      reason === "EXCEEDS_MAKER_SPEC"
        ? "That one is above the maker spec, so your rules exclude it."
        : "That one isn't certified, so your rules exclude it.";
    throw new DomainError("POLICY_EXCLUDED", message);
  }
  const lineTotalUsd = centsToMoney(moneyToCents(part.priceUsd) * line.qty);
  return {
    type: "part",
    optionId: part.id,
    qty: line.qty,
    forApplianceId: appliance.id,
    item: part.item,
    name: part.name,
    unitPriceUsd: part.priceUsd,
    lineTotalUsd,
    eta: etaFor(orderedOn, part.leadDays, timeZone),
    leadDays: part.leadDays,
  };
}

function priceService(repo: Repository, line: { type: "service"; slotId: string }): ServiceLine {
  const slotId = requireText(line.slotId, "slotId");
  const slot = repo.getServiceSlot(slotId);
  if (!slot || slotTaken(repo, slot.id) || slotInPast(repo, slot)) {
    throw new DomainError("SLOT_UNAVAILABLE", "That time was just taken.");
  }
  const appliance = applianceForService(repo, slot.service);
  return {
    type: "service",
    slotId: slot.id,
    applianceId: appliance.id,
    item: slot.service,
    provider: slot.provider,
    windowStart: slot.windowStart,
    windowEnd: slot.windowEnd,
    priceUsd: slot.priceUsd,
    lineTotalUsd: slot.priceUsd,
  };
}

function quoteExpired(quote: Quote, nowIso: string): boolean {
  return Date.parse(nowIso) > Date.parse(quote.expiresAt);
}

function confirmedResult(repo: Repository, quote: Quote): ConfirmPurchaseResult {
  if (quote.resultKind === "order" && quote.resultId) {
    const order = repo.getOrder(quote.resultId);
    if (!order) throw new DomainError("QUOTE_NOT_FOUND", "I couldn't find that price quote.");
    return {
      kind: "order",
      id: order.id,
      orderId: order.id,
      status: order.status,
      ...(order.eta ? { eta: order.eta } : {}),
      mock: true,
      alreadyConfirmed: true,
      ...(order.taskId ? { createdTaskId: order.taskId } : {}),
      speech: `That order is already placed as ${order.id}.`,
    };
  }
  if (quote.resultKind === "booking" && quote.resultId) {
    const booking = repo.getBooking(quote.resultId);
    if (!booking) throw new DomainError("QUOTE_NOT_FOUND", "I couldn't find that price quote.");
    return {
      kind: "booking",
      id: booking.id,
      bookingId: booking.id,
      status: booking.status,
      slot: {
        slotId: booking.slotId,
        provider: booking.provider,
        start: booking.windowStart,
        end: booking.windowEnd,
        priceUsd: booking.totalUsd,
      },
      mock: true,
      alreadyConfirmed: true,
      speech: `That visit is already booked as ${booking.id}.`,
    };
  }
  throw new DomainError("QUOTE_NOT_FOUND", "I couldn't find that price quote.");
}

function rejectCode(repo: Repository, quote: Quote, maxAttempts: number): never {
  const attempts = quote.attempts + 1;
  const locked = attempts >= maxAttempts;
  const attemptsRemaining = Math.max(0, maxAttempts - attempts);
  repo.updateQuote(quote.id, { attempts, locked });
  recordAudit(repo, "code_rejected", "quote", quote.id, {
    quoteId: quote.id,
    attempts,
    attemptsRemaining,
  });
  if (locked) {
    throw new DomainError("QUOTE_LOCKED", "That quote is locked after three wrong codes.", { attemptsRemaining }, attemptsRemaining);
  }
  const tries = attemptsRemaining === 1 ? "1 try" : `${attemptsRemaining} tries`;
  throw new DomainError(
    "INVALID_PURCHASE_CODE",
    `That code didn't match, and you have ${tries} left.`,
    { attemptsRemaining },
    attemptsRemaining,
  );
}

function recheckLine(repo: Repository, line: JsonValue): PartLine | ServiceLine {
  const part = asPartLine(line);
  if (part) {
    const appliance = requireAppliance(repo, part.forApplianceId);
    const found = repo.getPart(part.optionId);
    if (!found || !partFits(found, appliance)) {
      throw new DomainError("PART_NOT_COMPATIBLE", `That filter doesn't fit your ${appliance.spokenName}.`);
    }
    const schedule = scheduleFor(repo, appliance, found.item);
    if (exclusionReason(found, schedule)) {
      throw new DomainError("POLICY_EXCLUDED", "That one isn't certified, so your rules exclude it.");
    }
    return part;
  }
  const service = asServiceLine(line);
  if (!service) invalid("Quote lines are unreadable.");
  const slot = repo.getServiceSlot(service.slotId);
  if (!slot || slotTaken(repo, slot.id) || slotInPast(repo, slot)) {
    throw new DomainError("SLOT_UNAVAILABLE", "That time was just taken.");
  }
  return service;
}

export function confirmPurchase(
  repo: Repository,
  input: { quoteId: string; code: string; approveOverCap?: boolean },
  options: { purchaseCode?: string } = {},
): ConfirmPurchaseResult {
  const quoteId = requireText(input.quoteId, "quoteId");
  const quote = repo.getQuote(quoteId);
  if (!quote || quote.status === "cancelled") {
    throw new DomainError("QUOTE_NOT_FOUND", "I couldn't find that price quote.");
  }
  if (quote.status === "confirmed") return confirmedResult(repo, quote);
  if (quoteExpired(quote, repo.now())) {
    throw new DomainError("QUOTE_EXPIRED", "That price expired, and I can check again if you want.");
  }
  if (quote.locked) throw new DomainError("QUOTE_LOCKED", "That quote is locked after three wrong codes.");
  if (typeof input.code !== "string") invalid("code is required.");
  const expected = purchaseCode(options.purchaseCode);
  const preferences = repo.getPreferences();
  if (preferences.purchaseCodeRequired && input.code.trim() !== expected) {
    rejectCode(repo, quote, preferences.codeAttemptsPerQuote);
  }
  if (quote.overCap && input.approveOverCap !== true) {
    throw new DomainError("OVER_CAP_APPROVAL_REQUIRED", "That's over your limit. Say 'approve' and your code.");
  }
  const lines = quote.lines.map((line) => recheckLine(repo, line));
  if (quote.kind === "part") return placeOrder(repo, quote, lines.filter((line): line is PartLine => line.type === "part"));
  return placeBooking(repo, quote, lines.filter((line): line is ServiceLine => line.type === "service"));
}

function placeOrder(repo: Repository, quote: Quote, lines: PartLine[]): ConfirmPurchaseResult {
  if (lines.length === 0) invalid("Quote has no part lines.");
  const timeZone = zoneOf(repo);
  const placedOn = today(repo);
  const shipOn = addDays(placedOn, 1, timeZone);
  let firstOrderId = "";
  let firstTaskId = "";
  let firstEta = lines[0].eta;
  for (const line of lines) {
    const appliance = requireAppliance(repo, line.forApplianceId);
    const task = repo.insertTask({
      title: `Install ${appliance.spokenName} ${humanize(line.item)}`,
      applianceId: appliance.id,
      item: line.item,
      dueDate: line.eta,
      createdAt: repo.now(),
    });
    const order = repo.insertOrder({
      quoteId: quote.id,
      status: "placed",
      applianceId: appliance.id,
      optionId: line.optionId,
      qty: line.qty,
      totalUsd: line.lineTotalUsd,
      placedAt: repo.now(),
      shipOn,
      eta: line.eta,
      taskId: task.id,
    });
    if (!firstOrderId) {
      firstOrderId = order.id;
      firstTaskId = task.id;
      firstEta = line.eta;
    }
  }
  repo.updateQuote(quote.id, {
    status: "confirmed",
    confirmedAt: repo.now(),
    resultKind: "order",
    resultId: firstOrderId,
  });
  recordAudit(repo, "order_placed", "order", firstOrderId, {
    orderId: firstOrderId,
    quoteId: quote.id,
    totalUsd: quote.totalUsd,
    status: "placed",
    mock: true,
  });
  recordAudit(repo, "task_created", "task", firstTaskId, {
    taskId: firstTaskId,
    quoteId: quote.id,
    dueDate: firstEta,
  });
  return {
    kind: "order",
    id: firstOrderId,
    orderId: firstOrderId,
    status: "placed",
    eta: firstEta,
    mock: true,
    createdTaskId: firstTaskId,
    speech: `Ordered. Mock order ${firstOrderId} is placed.`,
  };
}

function placeBooking(repo: Repository, quote: Quote, lines: ServiceLine[]): ConfirmPurchaseResult {
  if (lines.length === 0) invalid("Quote has no service lines.");
  let first: { id: string; line: ServiceLine } | null = null;
  for (const line of lines) {
    const booking = repo.insertBooking({
      quoteId: quote.id,
      status: "booked",
      applianceId: line.applianceId,
      slotId: line.slotId,
      provider: line.provider,
      service: line.item,
      windowStart: line.windowStart,
      windowEnd: line.windowEnd,
      totalUsd: line.lineTotalUsd,
      placedAt: repo.now(),
    });
    if (!first) first = { id: booking.id, line };
  }
  if (!first) invalid("Quote has no service lines.");
  repo.updateQuote(quote.id, {
    status: "confirmed",
    confirmedAt: repo.now(),
    resultKind: "booking",
    resultId: first.id,
  });
  recordAudit(repo, "booking_placed", "booking", first.id, {
    bookingId: first.id,
    quoteId: quote.id,
    slotId: first.line.slotId,
    totalUsd: quote.totalUsd,
    status: "booked",
  });
  return {
    kind: "booking",
    id: first.id,
    bookingId: first.id,
    status: "booked",
    slot: {
      slotId: first.line.slotId,
      provider: first.line.provider,
      start: first.line.windowStart,
      end: first.line.windowEnd,
      priceUsd: first.line.priceUsd,
    },
    mock: true,
    speech: `Booked. Mock visit ${first.id} is on the calendar.`,
  };
}

export function createTask(
  repo: Repository,
  input: { title: string; applianceId?: string; item?: string; dueDate?: string; notes?: string },
): CreatedTask {
  const title = requireText(input.title, "title");
  const applianceId = input.applianceId === undefined ? null : requireAppliance(repo, input.applianceId).id;
  const dueDate = input.dueDate === undefined ? null : assertDate(input.dueDate, "dueDate");
  const item = input.item === undefined ? null : normItem(requireText(input.item, "item"));
  const notes = input.notes === undefined ? null : input.notes;
  const task = repo.insertTask({
    title,
    applianceId,
    item,
    dueDate,
    notes,
    createdAt: repo.now(),
  });
  recordAudit(repo, "task_created", "task", task.id, {
    taskId: task.id,
    title,
    ...(applianceId ? { applianceId } : {}),
    ...(item ? { item } : {}),
    ...(dueDate ? { dueDate } : {}),
  });
  return { taskId: task.id, task, speech: `Task ${task.id} is on the list.` };
}

export function logMaintenance(
  repo: Repository,
  input: { applianceId: string; item: string; doneOn?: string; consumeInventory?: boolean },
): MaintenanceLog {
  const appliance = requireAppliance(repo, input.applianceId);
  const item = normItem(requireText(input.item, "item"));
  const schedule = scheduleFor(repo, appliance, item);
  const doneOn = input.doneOn === undefined ? today(repo) : assertDate(input.doneOn, "doneOn");
  const consume = input.consumeInventory !== false;
  const timeZone = zoneOf(repo);
  const nextDue =
    schedule.trigger === "interval" && schedule.everyDays !== null ? addDays(doneOn, schedule.everyDays, timeZone) : null;
  repo.updateSchedule(appliance.id, { lastDone: doneOn, nextDue });
  let inventoryAfter: InventoryAfter | undefined;
  if (consume) {
    const row = repo
      .listInventory()
      .filter((candidate) => normItem(candidate.item) === item && candidate.qty > 0)
      .sort((a, b) => b.receivedNotInstalled - a.receivedNotInstalled)[0];
    if (row) {
      const updated = repo.updateInventory(row.id, {
        qty: row.qty - 1,
        receivedNotInstalled: Math.max(0, row.receivedNotInstalled - 1),
      });
      inventoryAfter = {
        id: updated.id,
        item: updated.item,
        name: updated.name,
        qty: updated.qty,
        location: updated.location,
        receivedNotInstalled: updated.receivedNotInstalled,
      };
    }
  }
  const closedTaskIds: string[] = [];
  for (const task of repo.listTasks()) {
    if (task.status !== "open" || task.applianceId !== appliance.id || task.item !== item) continue;
    repo.updateTask(task.id, { status: "closed", closedAt: repo.now() });
    closedTaskIds.push(task.id);
  }
  recordAudit(repo, "maintenance_logged", "appliance", appliance.id, {
    applianceId: appliance.id,
    item,
    lastDone: doneOn,
    nextDue,
    closedTaskIds,
  });
  const stockSpeech = inventoryAfter ? `, with ${inventoryAfter.qty} left` : "";
  return {
    lastDone: doneOn,
    nextDue,
    ...(inventoryAfter ? { inventoryAfter } : {}),
    closedTaskIds,
    speech: `Logged the ${appliance.spokenName} ${humanize(item)}. Next due ${nextDue ?? "when it fails"}${stockSpeech}.`,
  };
}

export function syncLifecycle(repo: Repository): LifecycleSync {
  const dueDate = today(repo);
  const shipped: string[] = [];
  const delivered: string[] = [];
  for (const order of repo.listOrders()) {
    if (order.status !== "placed" && order.status !== "shipped") continue;
    const shipOn = order.shipOn ?? addDays(localDate(order.placedAt), 1, zoneOf(repo));
    const eta = order.eta;
    const shouldDeliver = eta !== null && dueDate >= eta;
    const shouldShip = dueDate >= shipOn;
    if (order.status === "placed" && shouldShip && !shouldDeliver) {
      repo.updateOrder(order.id, { status: "shipped" });
      recordAudit(repo, "order_shipped", "order", order.id, { orderId: order.id, status: "shipped" });
      shipped.push(order.id);
      continue;
    }
    if (shouldDeliver && (order.status === "placed" || order.status === "shipped")) {
      deliverOrder(repo, order.id, order.optionId, order.qty);
      recordAudit(repo, "order_delivered", "order", order.id, { orderId: order.id, status: "delivered" });
      delivered.push(order.id);
    }
  }
  return { shipped, delivered };
}

function deliverOrder(repo: Repository, orderId: string, optionId: string | null, qty: number): void {
  repo.updateOrder(orderId, { status: "delivered" });
  if (!optionId) return;
  const part = repo.getPart(optionId);
  if (!part) return;
  const units = qty * part.packQty;
  repo.insertInventory({
    id: `inv_recv_${orderId}`,
    item: part.item,
    name: part.name,
    spec: part.spec,
    qty: units,
    location: "Received, not yet installed",
    receivedNotInstalled: units,
  });
}
