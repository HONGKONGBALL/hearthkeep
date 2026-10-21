import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  CatalogModel,
  Household,
  InventoryItem,
  PartOption,
  Preferences,
  ScheduleTemplate,
  ServiceSlot,
  Symptom,
  HazardRule,
} from "./types";

export class SeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedError";
  }
}

export interface PolicyExample {
  orderedOn: string;
  arrives: string;
  result: "recommended" | "allowed" | "excluded";
  reason?: string;
}

export interface SeedPart extends PartOption {
  policyExample: PolicyExample;
}

export interface SeedAppliance {
  id: string;
  spokenName: string;
  maker: string;
  model: string;
  modelDetail: string | null;
  product: string;
  location: string;
  stateOnSeedDate: string | null;
  schedule: ScheduleTemplate & {
    lastDone: string | null;
    nextDue: string | null;
  };
}

export interface SeedBundle {
  simClockStart: string;
  household: Household;
  preferences: Preferences;
  /** Documented mock code from the sample data. Not written into SQLite. */
  demoPurchaseCode: string;
  appliances: SeedAppliance[];
  catalogModels: CatalogModel[];
  unknownModelSchedule: null;
  unknownModelNote: string;
  inventory: InventoryItem[];
  parts: SeedPart[];
  symptoms: Symptom[];
  hazards: HazardRule[];
  slots: ServiceSlot[];
  chips: string[];
}

export function defaultSeedDir(): string {
  const fromModule = fileURLToPath(new URL("../../../data/seed/", import.meta.url));
  if (existsSync(join(fromModule, "household.json"))) return fromModule;
  const fromCwd = join(process.cwd(), "data/seed");
  if (existsSync(join(fromCwd, "household.json"))) return fromCwd;
  throw new SeedError(`Seed directory not found at ${fromModule}`);
}

export function loadSeed(dir: string): SeedBundle {
  const householdFile = readObject(dir, "household.json");
  const appliancesFile = readObject(dir, "appliances.json");
  const inventoryFile = readObject(dir, "inventory.json");
  const partsFile = readObject(dir, "parts.json");
  const symptomsFile = readObject(dir, "symptoms.json");
  const slotsFile = readObject(dir, "service-slots.json");
  const chipsFile = readObject(dir, "chips.json");

  const householdRaw = asObject(householdFile.household, "household.json household");
  const preferencesRaw = asObject(householdFile.preferences, "household.json preferences");
  const household: Household = {
    name: text(householdRaw, "name", "household"),
    member: text(householdRaw, "member", "household"),
    timezone: text(householdRaw, "timezone", "household"),
    currency: "USD",
  };
  if (householdRaw.currency !== "USD") throw new SeedError("household currency must be USD");

  const preferences: Preferences = {
    spendCapUsd: money(text(preferencesRaw, "spendCapUsd", "preferences"), "spendCapUsd"),
    partPolicy: "oem_or_certified",
    selection: "cheapest_then_earliest",
    purchaseCodeRequired: bool(preferencesRaw.purchaseCodeRequired, "purchaseCodeRequired"),
    comingUpWindowDays: intIn(preferencesRaw.comingUpWindowDays, "comingUpWindowDays", 1, 400),
    quoteLifetimeSimMinutes: intIn(preferencesRaw.quoteLifetimeSimMinutes, "quoteLifetimeSimMinutes", 1, 24 * 60),
    codeAttemptsPerQuote: intIn(preferencesRaw.codeAttemptsPerQuote, "codeAttemptsPerQuote", 1, 10),
  };
  if (preferencesRaw.partPolicy !== "oem_or_certified") {
    throw new SeedError("preferences.partPolicy must be oem_or_certified");
  }
  if (preferencesRaw.selection !== "cheapest_then_earliest") {
    throw new SeedError("preferences.selection must be cheapest_then_earliest");
  }
  if (preferences.purchaseCodeRequired !== true) {
    throw new SeedError("preferences.purchaseCodeRequired must be true");
  }

  const appliances = asArray(appliancesFile.appliances, "appliances").map((entry, index) =>
    parseAppliance(entry, index),
  );
  const catalogModels = asArray(appliancesFile.catalogModels, "catalogModels").map((entry, index) =>
    parseCatalog(entry, index),
  );
  if (appliancesFile.unknownModelSchedule !== null) {
    throw new SeedError("unknownModelSchedule must be null");
  }
  const inventory = asArray(inventoryFile.items, "inventory").map((entry, index) =>
    parseInventory(entry, index),
  );
  const parts = asArray(partsFile.options, "parts").map((entry, index) => parsePart(entry, index));
  const symptoms = asArray(symptomsFile.symptoms, "symptoms").map((entry, index) =>
    parseSymptom(entry, index),
  );
  const hazards = asArray(symptomsFile.hazards, "hazards").map((entry, index) => parseHazard(entry, index));
  const slots = asArray(slotsFile.slots, "service slots").map((entry, index) => parseSlot(entry, index));
  const chips = asArray(chipsFile.chips, "chips").map((entry, index) => {
    if (typeof entry !== "string" || entry.trim() === "") {
      throw new SeedError(`chips[${index}] must be a non-empty string`);
    }
    return entry;
  });

  expectIds(
    "appliance",
    appliances.map((row) => row.id),
    ["ap_fridge", "ap_furnace", "ap_smoke_hall", "ap_smoke_bed", "ap_dryer", "ap_porch"],
  );
  expectIds(
    "part",
    parts.map((row) => row.id),
    ["P-CX28", "P-FGWF2", "P-ZX28", "P-LF11", "P-CF11", "P-LF13", "P-VW9V", "P-GM19"],
  );
  expectIds(
    "slot",
    slots.map((row) => row.id),
    ["S-1027A", "S-1028P", "S-1031A"],
  );
  if (chips.length !== 12) throw new SeedError(`expected 12 chips, found ${chips.length}`);

  return {
    simClockStart: text(householdFile, "simClockStart", "household.json"),
    household,
    preferences,
    demoPurchaseCode: text(preferencesRaw, "demoPurchaseCode", "preferences"),
    appliances,
    catalogModels,
    unknownModelSchedule: null,
    unknownModelNote: text(appliancesFile, "unknownModelNote", "appliances.json"),
    inventory,
    parts,
    symptoms,
    hazards,
    slots,
    chips,
  };
}

function readObject(dir: string, name: string): Record<string, unknown> {
  const path = join(dir, name);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SeedError(`Could not read ${name}: ${message}`);
  }
  const obj = asObject(parsed, name);
  const notice = obj.fictionalDataNotice;
  if (typeof notice !== "string" || !notice.startsWith("Fictional data.")) {
    throw new SeedError(`${name} must start with a fictional-data notice`);
  }
  if (obj.seed !== "v1") throw new SeedError(`${name} must be seed v1`);
  return obj;
}

function parseAppliance(value: unknown, index: number): SeedAppliance {
  const row = asObject(value, `appliances[${index}]`);
  const schedule = parseSchedule(row.schedule, `appliances[${index}].schedule`, true);
  const state = row.stateOnSeedDate;
  if (state !== null && typeof state !== "string") {
    throw new SeedError(`appliances[${index}].stateOnSeedDate must be a string or null`);
  }
  return {
    id: text(row, "id", `appliances[${index}]`),
    spokenName: text(row, "spokenName", `appliances[${index}]`),
    maker: text(row, "maker", `appliances[${index}]`),
    model: text(row, "model", `appliances[${index}]`),
    modelDetail: textOrNull(row, "modelDetail", `appliances[${index}]`),
    product: text(row, "product", `appliances[${index}]`),
    location: text(row, "location", `appliances[${index}]`),
    stateOnSeedDate: state,
    schedule,
  };
}

function parseSchedule(
  value: unknown,
  label: string,
  installed: boolean,
): SeedAppliance["schedule"] {
  const row = asObject(value, label);
  const how = text(row, "how", label);
  if (how !== "part" && how !== "pro" && how !== "maintenance") {
    throw new SeedError(`${label}.how is invalid`);
  }
  const trigger = text(row, "trigger", label);
  if (trigger !== "interval" && trigger !== "on_failure") {
    throw new SeedError(`${label}.trigger is invalid`);
  }
  return {
    item: text(row, "item", label),
    how,
    everyDays: intOrNull(row.everyDays, `${label}.everyDays`),
    trigger,
    lastDone: installed ? textOrNull(row, "lastDone", label) : null,
    nextDue: installed ? textOrNull(row, "nextDue", label) : null,
    spec: textOrNull(row, "spec", label),
    maxMerv: intOrNull(row.maxMerv, `${label}.maxMerv`),
  };
}

function parseCatalog(value: unknown, index: number): CatalogModel {
  const row = asObject(value, `catalogModels[${index}]`);
  const schedule = parseSchedule(row.schedule, `catalogModels[${index}].schedule`, false);
  return {
    maker: text(row, "maker", `catalogModels[${index}]`),
    model: text(row, "model", `catalogModels[${index}]`),
    product: text(row, "product", `catalogModels[${index}]`),
    catalogOnly: bool(row.catalogOnly, `catalogModels[${index}].catalogOnly`),
    schedule: {
      item: schedule.item,
      how: schedule.how,
      everyDays: schedule.everyDays,
      trigger: schedule.trigger,
      spec: schedule.spec,
      maxMerv: schedule.maxMerv,
    },
  };
}

function parseInventory(value: unknown, index: number): InventoryItem {
  const row = asObject(value, `inventory[${index}]`);
  return {
    id: text(row, "id", `inventory[${index}]`),
    item: text(row, "item", `inventory[${index}]`),
    name: text(row, "name", `inventory[${index}]`),
    spec: textOrNull(row, "spec", `inventory[${index}]`),
    qty: intIn(row.qty, `inventory[${index}].qty`, 0, 100000),
    location: text(row, "location", `inventory[${index}]`),
    receivedNotInstalled: intIn(
      row.receivedNotInstalled,
      `inventory[${index}].receivedNotInstalled`,
      0,
      100000,
    ),
  };
}

function parsePart(value: unknown, index: number): SeedPart {
  const row = asObject(value, `parts[${index}]`);
  const kind = text(row, "kind", `parts[${index}]`);
  if (kind !== "compatible" && kind !== "oem" && kind !== "generic") {
    throw new SeedError(`parts[${index}].kind is invalid`);
  }
  const certified = row.certified;
  if (certified !== null && typeof certified !== "boolean") {
    throw new SeedError(`parts[${index}].certified must be boolean or null`);
  }
  const exampleRaw = asObject(row.policyExample, `parts[${index}].policyExample`);
  const result = text(exampleRaw, "result", `parts[${index}].policyExample`);
  if (result !== "recommended" && result !== "allowed" && result !== "excluded") {
    throw new SeedError(`parts[${index}].policyExample.result is invalid`);
  }
  const reason = exampleRaw.reason;
  if (reason !== undefined && typeof reason !== "string") {
    throw new SeedError(`parts[${index}].policyExample.reason must be a string`);
  }
  return {
    id: text(row, "id", `parts[${index}]`),
    fitsModel: textOrNull(row, "fitsModel", `parts[${index}]`),
    fitsProduct: textOrNull(row, "fitsProduct", `parts[${index}]`),
    item: text(row, "item", `parts[${index}]`),
    name: text(row, "name", `parts[${index}]`),
    brand: text(row, "brand", `parts[${index}]`),
    kind,
    certified,
    priceUsd: money(text(row, "priceUsd", `parts[${index}]`), `parts[${index}].priceUsd`),
    leadDays: intIn(row.leadDays, `parts[${index}].leadDays`, 1, 3),
    packQty: intIn(row.packQty, `parts[${index}].packQty`, 1, 100),
    size: textOrNull(row, "size", `parts[${index}]`),
    merv: intOrNull(row.merv, `parts[${index}].merv`),
    spec: textOrNull(row, "spec", `parts[${index}]`),
    policyExample: {
      orderedOn: text(exampleRaw, "orderedOn", `parts[${index}].policyExample`),
      arrives: text(exampleRaw, "arrives", `parts[${index}].policyExample`),
      result,
      ...(typeof reason === "string" ? { reason } : {}),
    },
  };
}

function parseSymptom(value: unknown, index: number): Symptom {
  const row = asObject(value, `symptoms[${index}]`);
  return {
    id: text(row, "id", `symptoms[${index}]`),
    maker: textOrNull(row, "maker", `symptoms[${index}]`),
    model: textOrNull(row, "model", `symptoms[${index}]`),
    product: textOrNull(row, "product", `symptoms[${index}]`),
    phrases: phrases(row.phrases, `symptoms[${index}]`),
    result: text(row, "result", `symptoms[${index}]`),
    item: text(row, "item", `symptoms[${index}]`),
    hazard: bool(row.hazard, `symptoms[${index}].hazard`),
  };
}

function parseHazard(value: unknown, index: number): HazardRule {
  const row = asObject(value, `hazards[${index}]`);
  if (row.hazard !== true) throw new SeedError(`hazards[${index}].hazard must be true`);
  return {
    id: text(row, "id", `hazards[${index}]`),
    appliesTo: text(row, "appliesTo", `hazards[${index}]`),
    phrases: phrases(row.phrases, `hazards[${index}]`),
    result: text(row, "result", `hazards[${index}]`),
    hazard: true,
    advice: text(row, "advice", `hazards[${index}]`),
  };
}

function parseSlot(value: unknown, index: number): ServiceSlot {
  const row = asObject(value, `slots[${index}]`);
  return {
    id: text(row, "id", `slots[${index}]`),
    provider: text(row, "provider", `slots[${index}]`),
    service: text(row, "service", `slots[${index}]`),
    date: text(row, "date", `slots[${index}]`),
    weekday: text(row, "weekday", `slots[${index}]`),
    start: text(row, "start", `slots[${index}]`),
    end: text(row, "end", `slots[${index}]`),
    windowStart: text(row, "windowStart", `slots[${index}]`),
    windowEnd: text(row, "windowEnd", `slots[${index}]`),
    priceUsd: money(text(row, "priceUsd", `slots[${index}]`), `slots[${index}].priceUsd`),
  };
}

function expectIds(label: string, actual: string[], expected: string[]): void {
  if (actual.length !== expected.length || expected.some((id, index) => actual[index] !== id)) {
    throw new SeedError(`${label} ids do not match seed v1`);
  }
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SeedError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new SeedError(`${label} must be an array`);
  return value;
}

function text(obj: Record<string, unknown>, key: string, label: string): string {
  const value = obj[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new SeedError(`${label}.${key} must be a non-empty string`);
  }
  return value;
}

function textOrNull(obj: Record<string, unknown>, key: string, label: string): string | null {
  const value = obj[key];
  if (value === null) return null;
  if (typeof value === "string") return value;
  throw new SeedError(`${label}.${key} must be a string or null`);
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new SeedError(`${label} must be a boolean`);
  return value;
}

function intOrNull(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new SeedError(`${label} must be an integer or null`);
  }
  return value;
}

function intIn(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new SeedError(`${label} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function money(value: string, label: string): string {
  if (!/^\d+\.\d{2}$/.test(value)) throw new SeedError(`${label} must be a USD amount with cents`);
  return value;
}

function phrases(value: unknown, label: string): string[] {
  const list = asArray(value, `${label}.phrases`);
  if (list.length === 0) throw new SeedError(`${label}.phrases must not be empty`);
  return list.map((entry, index) => {
    if (typeof entry !== "string" || entry.trim() === "") {
      throw new SeedError(`${label}.phrases[${index}] must be a non-empty string`);
    }
    return entry;
  });
}
