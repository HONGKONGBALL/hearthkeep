import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import {
  addCalendarDays,
  assertAdvanceDays,
  assertCanonicalIso,
  assertLaterInstant,
  DEFAULT_SIM_START,
  formatInZone,
} from "./clock";
import type {
  AppliancePatch,
  BookingPatch,
  InventoryPatch,
  NewAppliance,
  NewAudit,
  NewBooking,
  NewInventoryItem,
  NewOrder,
  NewQuote,
  NewSchedule,
  NewTask,
  OrderPatch,
  QuotePatch,
  Repository,
  SchedulePatch,
  TaskPatch,
} from "./repository";
import { defaultSeedDir, loadSeed, type SeedBundle } from "./seed";
import {
  SEED_VERSION,
  type Appliance,
  type AuditEvent,
  type Booking,
  type BookingStatus,
  type CatalogModel,
  type Chip,
  type HazardRule,
  type Household,
  type IdKind,
  type InventoryItem,
  type ItemHow,
  type JsonValue,
  type Order,
  type OrderStatus,
  type PartKind,
  type PartOption,
  type Preferences,
  type Quote,
  type QuoteKind,
  type QuoteStatus,
  type Schedule,
  type ScheduleTrigger,
  type ServiceSlot,
  type SimSnapshot,
  type Symptom,
  type Task,
  type TaskStatus,
} from "./types";

const ID_PREFIX: Record<IdKind, string> = {
  quote: "q",
  order: "ord",
  booking: "bk",
  task: "t",
  appliance: "ap",
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS id_counters (
  kind TEXT PRIMARY KEY,
  next INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS household (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  member TEXT NOT NULL,
  timezone TEXT NOT NULL,
  currency TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS preferences (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  spend_cap_usd TEXT NOT NULL,
  part_policy TEXT NOT NULL,
  selection TEXT NOT NULL,
  purchase_code_required INTEGER NOT NULL,
  coming_up_window_days INTEGER NOT NULL,
  quote_lifetime_sim_minutes INTEGER NOT NULL,
  code_attempts_per_quote INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS appliances (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  spoken_name TEXT NOT NULL,
  maker TEXT NOT NULL,
  model TEXT NOT NULL,
  model_detail TEXT,
  product TEXT NOT NULL,
  location TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS schedules (
  appliance_id TEXT PRIMARY KEY REFERENCES appliances(id),
  item TEXT NOT NULL,
  how TEXT NOT NULL,
  every_days INTEGER,
  trigger TEXT NOT NULL,
  last_done TEXT,
  next_due TEXT,
  spec TEXT,
  max_merv INTEGER
);
CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  item TEXT NOT NULL,
  name TEXT NOT NULL,
  spec TEXT,
  qty INTEGER NOT NULL,
  location TEXT NOT NULL,
  received_not_installed INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS parts (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  fits_model TEXT,
  fits_product TEXT,
  item TEXT NOT NULL,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  kind TEXT NOT NULL,
  certified INTEGER,
  price_usd TEXT NOT NULL,
  lead_days INTEGER NOT NULL,
  pack_qty INTEGER NOT NULL,
  size TEXT,
  merv INTEGER,
  spec TEXT
);
CREATE TABLE IF NOT EXISTS catalog_models (
  position INTEGER NOT NULL,
  maker TEXT NOT NULL,
  model TEXT NOT NULL,
  product TEXT NOT NULL,
  catalog_only INTEGER NOT NULL,
  item TEXT,
  how TEXT,
  every_days INTEGER,
  trigger TEXT,
  spec TEXT,
  max_merv INTEGER,
  PRIMARY KEY (maker, model)
);
CREATE TABLE IF NOT EXISTS symptoms (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  maker TEXT,
  model TEXT,
  product TEXT,
  phrases_json TEXT NOT NULL,
  result TEXT NOT NULL,
  item TEXT NOT NULL,
  hazard INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS hazards (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  applies_to TEXT NOT NULL,
  phrases_json TEXT NOT NULL,
  result TEXT NOT NULL,
  advice TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS service_slots (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  provider TEXT NOT NULL,
  service TEXT NOT NULL,
  date TEXT NOT NULL,
  weekday TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  price_usd TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chips (
  position INTEGER PRIMARY KEY,
  label TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  quote_id TEXT,
  status TEXT NOT NULL,
  appliance_id TEXT,
  option_id TEXT,
  qty INTEGER NOT NULL,
  total_usd TEXT NOT NULL,
  placed_at TEXT NOT NULL,
  ship_on TEXT,
  eta TEXT,
  task_id TEXT
);
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  quote_id TEXT,
  status TEXT NOT NULL,
  appliance_id TEXT,
  slot_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  service TEXT NOT NULL,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  total_usd TEXT NOT NULL,
  placed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  appliance_id TEXT,
  item TEXT,
  due_date TEXT,
  notes TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  closed_at TEXT
);
CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  lines_json TEXT NOT NULL,
  total_usd TEXT NOT NULL,
  cap_usd TEXT NOT NULL,
  over_cap INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  locked INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  confirmed_at TEXT,
  result_kind TEXT,
  result_id TEXT
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  detail_json TEXT NOT NULL
);
`;

type SqlValue = string | number | bigint | null;

interface ApplianceRow {
  id: string;
  spoken_name: string;
  maker: string;
  model: string;
  model_detail: string | null;
  product: string;
  location: string;
}

interface ScheduleRow {
  appliance_id: string;
  item: string;
  how: string;
  every_days: number | null;
  trigger: string;
  last_done: string | null;
  next_due: string | null;
  spec: string | null;
  max_merv: number | null;
}

interface InventoryRow {
  id: string;
  item: string;
  name: string;
  spec: string | null;
  qty: number;
  location: string;
  received_not_installed: number;
}

interface PartRow {
  id: string;
  fits_model: string | null;
  fits_product: string | null;
  item: string;
  name: string;
  brand: string;
  kind: string;
  certified: number | null;
  price_usd: string;
  lead_days: number;
  pack_qty: number;
  size: string | null;
  merv: number | null;
  spec: string | null;
}

interface CatalogRow {
  maker: string;
  model: string;
  product: string;
  catalog_only: number;
  item: string | null;
  how: string | null;
  every_days: number | null;
  trigger: string | null;
  spec: string | null;
  max_merv: number | null;
}

interface SymptomRow {
  id: string;
  maker: string | null;
  model: string | null;
  product: string | null;
  phrases_json: string;
  result: string;
  item: string;
  hazard: number;
}

interface HazardRow {
  id: string;
  applies_to: string;
  phrases_json: string;
  result: string;
  advice: string;
}

interface SlotRow {
  id: string;
  provider: string;
  service: string;
  date: string;
  weekday: string;
  start_time: string;
  end_time: string;
  window_start: string;
  window_end: string;
  price_usd: string;
}

interface OrderRow {
  id: string;
  quote_id: string | null;
  status: string;
  appliance_id: string | null;
  option_id: string | null;
  qty: number;
  total_usd: string;
  placed_at: string;
  ship_on: string | null;
  eta: string | null;
  task_id: string | null;
}

interface BookingRow {
  id: string;
  quote_id: string | null;
  status: string;
  appliance_id: string | null;
  slot_id: string;
  provider: string;
  service: string;
  window_start: string;
  window_end: string;
  total_usd: string;
  placed_at: string;
}

interface TaskRow {
  id: string;
  title: string;
  appliance_id: string | null;
  item: string | null;
  due_date: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  closed_at: string | null;
}

interface QuoteRow {
  id: string;
  kind: string;
  lines_json: string;
  total_usd: string;
  cap_usd: string;
  over_cap: number;
  expires_at: string;
  attempts: number;
  locked: number;
  status: string;
  created_at: string;
  confirmed_at: string | null;
  result_kind: string | null;
  result_id: string | null;
}

interface AuditRow {
  id: number;
  at: string;
  action: string;
  entity_type: string;
  entity_id: string;
  detail_json: string;
}

export interface StorageEnv {
  HK_DB?: string | undefined;
  HK_SIM_START?: string | undefined;
}

/** `HK_DB` defaults to `./data/hearthkeep.db`. `:memory:` is kept for tests. */
export function resolveDbPath(env: StorageEnv = {}): string {
  if (env.HK_DB === undefined || env.HK_DB.trim() === "") return "./data/hearthkeep.db";
  return env.HK_DB.trim();
}

/** `HK_SIM_START` defaults to the seed clock. A configured value is kept, offset included. */
export function resolveSimStart(env: StorageEnv = {}): string {
  if (env.HK_SIM_START === undefined || env.HK_SIM_START.trim() === "") return DEFAULT_SIM_START;
  return env.HK_SIM_START.trim();
}

export interface OpenRepositoryOptions {
  /** SQLite file path, or `:memory:`. */
  path: string;
  /** Clock used for an empty database and for reset. Defaults to the seed clock. */
  simStart?: string;
  seedDir?: string;
}

export function openRepository(options: OpenRepositoryOptions): SqliteRepository {
  const path = options.path.trim();
  if (path === "") throw new Error("SQLite path is required. Pass a file path or :memory:.");
  const seed = loadSeed(options.seedDir ?? defaultSeedDir());
  const requested = assertCanonicalIso(options.simStart ?? seed.simClockStart);
  const simStart = formatInZone(Date.parse(requested), seed.household.timezone);
  return new SqliteRepository(openDatabase(path), path, seed, simStart);
}

export function openRepositoryFromEnv(env: StorageEnv = {}, seedDir?: string): SqliteRepository {
  return openRepository({
    path: resolveDbPath(env),
    simStart: resolveSimStart(env),
    ...(seedDir === undefined ? {} : { seedDir }),
  });
}

export class SqliteRepository implements Repository {
  private closed = false;

  constructor(
    private readonly db: Database.Database,
    readonly path: string,
    private readonly seed: SeedBundle,
    private readonly simStart: string,
  ) {
    this.db.exec(SCHEMA);
    if (this.meta("seed") !== SEED_VERSION) this.reseed();
  }

  now(): string {
    const value = this.meta("clock");
    if (value === null) throw new Error("Sim clock is not loaded");
    return value;
  }

  advanceDays(days: number): string {
    assertAdvanceDays(days);
    const next = addCalendarDays(this.now(), days, this.timezone());
    this.setMeta("clock", next);
    return next;
  }

  set(iso: string): string {
    const instant = assertLaterInstant(this.now(), iso);
    const next = formatInZone(instant, this.timezone());
    this.setMeta("clock", next);
    return next;
  }

  reset(): { now: string; seed: "v1" } {
    this.reseed();
    return { now: this.simStart, seed: SEED_VERSION };
  }

  snapshot(): SimSnapshot {
    return this.transaction(() => ({
      clock: this.now(),
      appliances: this.listAppliances(),
      schedule: this.listSchedule(),
      inventory: this.listInventory(),
      orders: this.listOrders(),
      bookings: this.listBookings(),
      tasks: this.listTasks(),
      audit: this.listAudit(),
    }));
  }

  allocateId(kind: IdKind): string {
    return this.transaction(() => this.takeId(kind));
  }

  close(): void {
    if (this.closed) return;
    if (this.path !== ":memory:") this.db.pragma("wal_checkpoint(TRUNCATE)");
    this.closed = true;
    this.db.close();
  }

  getHousehold(): Household {
    const row = this.one<Household>(
      "SELECT name, member, timezone, currency FROM household WHERE id = 1",
    );
    if (!row || row.currency !== "USD") throw new Error("Household is not loaded");
    return row;
  }

  getPreferences(): Preferences {
    const row = this.one<{
      spend_cap_usd: string;
      part_policy: string;
      selection: string;
      purchase_code_required: number;
      coming_up_window_days: number;
      quote_lifetime_sim_minutes: number;
      code_attempts_per_quote: number;
    }>("SELECT * FROM preferences WHERE id = 1");
    if (!row) throw new Error("Preferences are not loaded");
    if (row.part_policy !== "oem_or_certified" || row.selection !== "cheapest_then_earliest") {
      throw new Error("Preferences in the database do not match seed v1");
    }
    return {
      spendCapUsd: row.spend_cap_usd,
      partPolicy: row.part_policy,
      selection: row.selection,
      purchaseCodeRequired: row.purchase_code_required === 1,
      comingUpWindowDays: row.coming_up_window_days,
      quoteLifetimeSimMinutes: row.quote_lifetime_sim_minutes,
      codeAttemptsPerQuote: row.code_attempts_per_quote,
    };
  }

  listAppliances(): Appliance[] {
    return this.many<ApplianceRow>("SELECT * FROM appliances ORDER BY position").map(applianceFromRow);
  }

  getAppliance(id: string): Appliance | null {
    const row = this.one<ApplianceRow>("SELECT * FROM appliances WHERE id = ?", id);
    return row ? applianceFromRow(row) : null;
  }

  insertAppliance(input: NewAppliance): Appliance {
    return this.transaction(() => {
      const id = this.takeId("appliance");
      const position = this.nextPosition("appliances");
      this.run(
        `INSERT INTO appliances(id, position, spoken_name, maker, model, model_detail, product, location)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        position,
        requiredText(input.spokenName, "spokenName"),
        requiredText(input.maker, "maker"),
        requiredText(input.model, "model"),
        input.modelDetail ?? null,
        requiredText(input.product, "product"),
        requiredText(input.location, "location"),
      );
      if (input.schedule) this.insertSchedule(id, input.schedule);
      return this.must(this.getAppliance(id), `Appliance not found: ${id}`);
    });
  }

  updateAppliance(id: string, patch: AppliancePatch): Appliance {
    const sets: Array<[string, SqlValue]> = [];
    assignText(sets, "spoken_name", patch.spokenName);
    assignText(sets, "maker", patch.maker);
    assignText(sets, "model", patch.model);
    assign(sets, "model_detail", patch.modelDetail);
    assignText(sets, "product", patch.product);
    assignText(sets, "location", patch.location);
    this.updateById("appliances", "id", id, sets, "Appliance");
    return this.must(this.getAppliance(id), `Appliance not found: ${id}`);
  }

  listSchedule(): Schedule[] {
    return this.many<ScheduleRow>(
      `SELECT schedules.* FROM schedules
       JOIN appliances ON appliances.id = schedules.appliance_id
       ORDER BY appliances.position`,
    ).map(scheduleFromRow);
  }

  getSchedule(applianceId: string): Schedule | null {
    const row = this.one<ScheduleRow>("SELECT * FROM schedules WHERE appliance_id = ?", applianceId);
    return row ? scheduleFromRow(row) : null;
  }

  updateSchedule(applianceId: string, patch: SchedulePatch): Schedule {
    const sets: Array<[string, SqlValue]> = [];
    assignText(sets, "item", patch.item);
    if (patch.how !== undefined) assign(sets, "how", howOf(patch.how));
    if (patch.everyDays !== undefined) assign(sets, "every_days", daysOf(patch.everyDays));
    if (patch.trigger !== undefined) assign(sets, "trigger", triggerOf(patch.trigger));
    assign(sets, "last_done", patch.lastDone);
    assign(sets, "next_due", patch.nextDue);
    assign(sets, "spec", patch.spec);
    if (patch.maxMerv !== undefined) assign(sets, "max_merv", patch.maxMerv);
    this.updateById("schedules", "appliance_id", applianceId, sets, "Schedule");
    return this.must(this.getSchedule(applianceId), `Schedule not found: ${applianceId}`);
  }

  listInventory(): InventoryItem[] {
    return this.many<InventoryRow>("SELECT * FROM inventory ORDER BY position").map(inventoryFromRow);
  }

  getInventory(id: string): InventoryItem | null {
    const row = this.one<InventoryRow>("SELECT * FROM inventory WHERE id = ?", id);
    return row ? inventoryFromRow(row) : null;
  }

  insertInventory(input: NewInventoryItem): InventoryItem {
    return this.transaction(() => {
      if (this.getInventory(input.id)) throw new Error(`Inventory already exists: ${input.id}`);
      this.run(
        `INSERT INTO inventory(id, position, item, name, spec, qty, location, received_not_installed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        requiredText(input.id, "id"),
        this.nextPosition("inventory"),
        requiredText(input.item, "item"),
        requiredText(input.name, "name"),
        input.spec ?? null,
        countOf(input.qty, "qty"),
        requiredText(input.location, "location"),
        countOf(input.receivedNotInstalled ?? 0, "receivedNotInstalled"),
      );
      return this.must(this.getInventory(input.id), `Inventory not found: ${input.id}`);
    });
  }

  updateInventory(id: string, patch: InventoryPatch): InventoryItem {
    const sets: Array<[string, SqlValue]> = [];
    assignText(sets, "item", patch.item);
    assignText(sets, "name", patch.name);
    assign(sets, "spec", patch.spec);
    if (patch.qty !== undefined) assign(sets, "qty", countOf(patch.qty, "qty"));
    assignText(sets, "location", patch.location);
    if (patch.receivedNotInstalled !== undefined) {
      assign(sets, "received_not_installed", countOf(patch.receivedNotInstalled, "receivedNotInstalled"));
    }
    this.updateById("inventory", "id", id, sets, "Inventory");
    return this.must(this.getInventory(id), `Inventory not found: ${id}`);
  }

  listParts(): PartOption[] {
    return this.many<PartRow>("SELECT * FROM parts ORDER BY position").map(partFromRow);
  }

  getPart(id: string): PartOption | null {
    const row = this.one<PartRow>("SELECT * FROM parts WHERE id = ?", id);
    return row ? partFromRow(row) : null;
  }

  listSymptoms(): Symptom[] {
    return this.many<SymptomRow>("SELECT * FROM symptoms ORDER BY position").map(symptomFromRow);
  }

  listHazards(): HazardRule[] {
    return this.many<HazardRow>("SELECT * FROM hazards ORDER BY position").map(hazardFromRow);
  }

  listServiceSlots(): ServiceSlot[] {
    return this.many<SlotRow>("SELECT * FROM service_slots ORDER BY position").map(slotFromRow);
  }

  getServiceSlot(id: string): ServiceSlot | null {
    const row = this.one<SlotRow>("SELECT * FROM service_slots WHERE id = ?", id);
    return row ? slotFromRow(row) : null;
  }

  listCatalogModels(): CatalogModel[] {
    return this.many<CatalogRow>("SELECT * FROM catalog_models ORDER BY position").map(catalogFromRow);
  }

  findCatalogModel(maker: string, model: string): CatalogModel | null {
    const row = this.one<CatalogRow>(
      "SELECT * FROM catalog_models WHERE maker = ? AND model = ?",
      maker,
      model,
    );
    return row ? catalogFromRow(row) : null;
  }

  listChips(): Chip[] {
    return this.many<{ position: number; label: string }>("SELECT position, label FROM chips ORDER BY position");
  }

  listOrders(): Order[] {
    return this.many<OrderRow>("SELECT * FROM orders ORDER BY rowid").map(orderFromRow);
  }

  getOrder(id: string): Order | null {
    const row = this.one<OrderRow>("SELECT * FROM orders WHERE id = ?", id);
    return row ? orderFromRow(row) : null;
  }

  insertOrder(input: NewOrder): Order {
    return this.transaction(() => {
      const id = this.takeId("order");
      this.run(
        `INSERT INTO orders(id, quote_id, status, appliance_id, option_id, qty, total_usd, placed_at, ship_on, eta, task_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        input.quoteId ?? null,
        orderStatus(input.status ?? "placed"),
        input.applianceId ?? null,
        input.optionId ?? null,
        countOf(input.qty, "qty", 1),
        money(input.totalUsd, "totalUsd"),
        input.placedAt ?? this.now(),
        input.shipOn ?? null,
        input.eta ?? null,
        input.taskId ?? null,
      );
      return this.must(this.getOrder(id), `Order not found: ${id}`);
    });
  }

  updateOrder(id: string, patch: OrderPatch): Order {
    const sets: Array<[string, SqlValue]> = [];
    assign(sets, "quote_id", patch.quoteId);
    if (patch.status !== undefined) assign(sets, "status", orderStatus(patch.status));
    assign(sets, "appliance_id", patch.applianceId);
    assign(sets, "option_id", patch.optionId);
    if (patch.qty !== undefined) assign(sets, "qty", countOf(patch.qty, "qty", 1));
    if (patch.totalUsd !== undefined) assign(sets, "total_usd", money(patch.totalUsd, "totalUsd"));
    assignText(sets, "placed_at", patch.placedAt);
    assign(sets, "ship_on", patch.shipOn);
    assign(sets, "eta", patch.eta);
    assign(sets, "task_id", patch.taskId);
    this.updateById("orders", "id", id, sets, "Order");
    return this.must(this.getOrder(id), `Order not found: ${id}`);
  }

  listBookings(): Booking[] {
    return this.many<BookingRow>("SELECT * FROM bookings ORDER BY rowid").map(bookingFromRow);
  }

  getBooking(id: string): Booking | null {
    const row = this.one<BookingRow>("SELECT * FROM bookings WHERE id = ?", id);
    return row ? bookingFromRow(row) : null;
  }

  insertBooking(input: NewBooking): Booking {
    return this.transaction(() => {
      const id = this.takeId("booking");
      this.run(
        `INSERT INTO bookings(
           id, quote_id, status, appliance_id, slot_id, provider, service, window_start, window_end, total_usd, placed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        input.quoteId ?? null,
        bookingStatus(input.status ?? "booked"),
        input.applianceId ?? null,
        requiredText(input.slotId, "slotId"),
        requiredText(input.provider, "provider"),
        requiredText(input.service, "service"),
        requiredText(input.windowStart, "windowStart"),
        requiredText(input.windowEnd, "windowEnd"),
        money(input.totalUsd, "totalUsd"),
        input.placedAt ?? this.now(),
      );
      return this.must(this.getBooking(id), `Booking not found: ${id}`);
    });
  }

  updateBooking(id: string, patch: BookingPatch): Booking {
    const sets: Array<[string, SqlValue]> = [];
    assign(sets, "quote_id", patch.quoteId);
    if (patch.status !== undefined) assign(sets, "status", bookingStatus(patch.status));
    assign(sets, "appliance_id", patch.applianceId);
    assignText(sets, "slot_id", patch.slotId);
    assignText(sets, "provider", patch.provider);
    assignText(sets, "service", patch.service);
    assignText(sets, "window_start", patch.windowStart);
    assignText(sets, "window_end", patch.windowEnd);
    if (patch.totalUsd !== undefined) assign(sets, "total_usd", money(patch.totalUsd, "totalUsd"));
    assignText(sets, "placed_at", patch.placedAt);
    this.updateById("bookings", "id", id, sets, "Booking");
    return this.must(this.getBooking(id), `Booking not found: ${id}`);
  }

  listTasks(): Task[] {
    return this.many<TaskRow>("SELECT * FROM tasks ORDER BY rowid").map(taskFromRow);
  }

  getTask(id: string): Task | null {
    const row = this.one<TaskRow>("SELECT * FROM tasks WHERE id = ?", id);
    return row ? taskFromRow(row) : null;
  }

  insertTask(input: NewTask): Task {
    return this.transaction(() => {
      const id = this.takeId("task");
      this.run(
        `INSERT INTO tasks(id, title, appliance_id, item, due_date, notes, status, created_at, closed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        id,
        requiredText(input.title, "title"),
        input.applianceId ?? null,
        input.item ?? null,
        input.dueDate ?? null,
        input.notes ?? null,
        taskStatus(input.status ?? "open"),
        input.createdAt ?? this.now(),
      );
      return this.must(this.getTask(id), `Task not found: ${id}`);
    });
  }

  updateTask(id: string, patch: TaskPatch): Task {
    const sets: Array<[string, SqlValue]> = [];
    assignText(sets, "title", patch.title);
    assign(sets, "appliance_id", patch.applianceId);
    assign(sets, "item", patch.item);
    assign(sets, "due_date", patch.dueDate);
    assign(sets, "notes", patch.notes);
    if (patch.status !== undefined) assign(sets, "status", taskStatus(patch.status));
    assignText(sets, "created_at", patch.createdAt);
    assign(sets, "closed_at", patch.closedAt);
    this.updateById("tasks", "id", id, sets, "Task");
    return this.must(this.getTask(id), `Task not found: ${id}`);
  }

  listQuotes(): Quote[] {
    return this.many<QuoteRow>("SELECT * FROM quotes ORDER BY rowid").map(quoteFromRow);
  }

  getQuote(id: string): Quote | null {
    const row = this.one<QuoteRow>("SELECT * FROM quotes WHERE id = ?", id);
    return row ? quoteFromRow(row) : null;
  }

  insertQuote(input: NewQuote): Quote {
    return this.transaction(() => {
      const id = this.takeId("quote");
      this.run(
        `INSERT INTO quotes(
           id, kind, lines_json, total_usd, cap_usd, over_cap, expires_at, attempts, locked, status, created_at,
           confirmed_at, result_kind, result_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 'open', ?, NULL, NULL, NULL)`,
        id,
        quoteKind(input.kind),
        jsonText(input.lines, "lines"),
        money(input.totalUsd, "totalUsd"),
        money(input.capUsd, "capUsd"),
        input.overCap ? 1 : 0,
        requiredText(input.expiresAt, "expiresAt"),
        input.createdAt ?? this.now(),
      );
      return this.must(this.getQuote(id), `Quote not found: ${id}`);
    });
  }

  updateQuote(id: string, patch: QuotePatch): Quote {
    const sets: Array<[string, SqlValue]> = [];
    if (patch.kind !== undefined) assign(sets, "kind", quoteKind(patch.kind));
    if (patch.lines !== undefined) assign(sets, "lines_json", jsonText(patch.lines, "lines"));
    if (patch.totalUsd !== undefined) assign(sets, "total_usd", money(patch.totalUsd, "totalUsd"));
    if (patch.capUsd !== undefined) assign(sets, "cap_usd", money(patch.capUsd, "capUsd"));
    if (patch.overCap !== undefined) assign(sets, "over_cap", patch.overCap ? 1 : 0);
    assignText(sets, "expires_at", patch.expiresAt);
    if (patch.attempts !== undefined) assign(sets, "attempts", countOf(patch.attempts, "attempts"));
    if (patch.locked !== undefined) assign(sets, "locked", patch.locked ? 1 : 0);
    if (patch.status !== undefined) assign(sets, "status", quoteStatus(patch.status));
    assignText(sets, "created_at", patch.createdAt);
    assign(sets, "confirmed_at", patch.confirmedAt);
    if (patch.resultKind !== undefined) assign(sets, "result_kind", patch.resultKind);
    assign(sets, "result_id", patch.resultId);
    this.updateById("quotes", "id", id, sets, "Quote");
    return this.must(this.getQuote(id), `Quote not found: ${id}`);
  }

  listAudit(): AuditEvent[] {
    return this.many<AuditRow>("SELECT * FROM audit ORDER BY id").map(auditFromRow);
  }

  appendAudit(input: NewAudit): AuditEvent {
    const result = this.guard()
      .prepare(
        "INSERT INTO audit(at, action, entity_type, entity_id, detail_json) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        input.at ?? this.now(),
        requiredText(input.action, "action"),
        requiredText(input.entityType, "entityType"),
        requiredText(input.entityId, "entityId"),
        JSON.stringify(input.detail ?? {}),
      );
    const id = Number(result.lastInsertRowid);
    return this.must(this.listAudit().find((event) => event.id === id), `Audit event not found: ${id}`);
  }

  private reseed(): void {
    this.transaction(() => {
      for (const table of [
        "audit",
        "quotes",
        "orders",
        "bookings",
        "tasks",
        "chips",
        "service_slots",
        "hazards",
        "symptoms",
        "parts",
        "inventory",
        "schedules",
        "appliances",
        "catalog_models",
        "preferences",
        "household",
        "id_counters",
        "meta",
      ]) {
        this.run(`DELETE FROM ${table}`);
      }
      const sequence = this.one<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'",
      );
      if (sequence) this.run("DELETE FROM sqlite_sequence WHERE name = 'audit'");
      this.insertSeed();
      for (const kind of Object.keys(ID_PREFIX) as IdKind[]) {
        this.run("INSERT INTO id_counters(kind, next) VALUES (?, 1)", kind);
      }
      this.setMeta("seed", SEED_VERSION);
      this.setMeta("clock", this.simStart);
      this.setMeta("sim_start", this.simStart);
    });
  }

  private insertSeed(): void {
    const seed = this.seed;
    this.run(
      "INSERT INTO household(id, name, member, timezone, currency) VALUES (1, ?, ?, ?, ?)",
      seed.household.name,
      seed.household.member,
      seed.household.timezone,
      seed.household.currency,
    );
    this.run(
      `INSERT INTO preferences(
         id, spend_cap_usd, part_policy, selection, purchase_code_required,
         coming_up_window_days, quote_lifetime_sim_minutes, code_attempts_per_quote
       ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
      seed.preferences.spendCapUsd,
      seed.preferences.partPolicy,
      seed.preferences.selection,
      seed.preferences.purchaseCodeRequired ? 1 : 0,
      seed.preferences.comingUpWindowDays,
      seed.preferences.quoteLifetimeSimMinutes,
      seed.preferences.codeAttemptsPerQuote,
    );
    seed.appliances.forEach((appliance, index) => {
      this.run(
        `INSERT INTO appliances(id, position, spoken_name, maker, model, model_detail, product, location)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        appliance.id,
        index + 1,
        appliance.spokenName,
        appliance.maker,
        appliance.model,
        appliance.modelDetail,
        appliance.product,
        appliance.location,
      );
      this.insertSchedule(appliance.id, appliance.schedule);
    });
    seed.catalogModels.forEach((model, index) => {
      this.run(
        `INSERT INTO catalog_models(
           position, maker, model, product, catalog_only, item, how, every_days, trigger, spec, max_merv
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        index + 1,
        model.maker,
        model.model,
        model.product,
        model.catalogOnly ? 1 : 0,
        model.schedule?.item ?? null,
        model.schedule?.how ?? null,
        model.schedule?.everyDays ?? null,
        model.schedule?.trigger ?? null,
        model.schedule?.spec ?? null,
        model.schedule?.maxMerv ?? null,
      );
    });
    seed.inventory.forEach((item, index) => {
      this.run(
        `INSERT INTO inventory(id, position, item, name, spec, qty, location, received_not_installed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        item.id,
        index + 1,
        item.item,
        item.name,
        item.spec,
        item.qty,
        item.location,
        item.receivedNotInstalled,
      );
    });
    seed.parts.forEach((part, index) => {
      this.run(
        `INSERT INTO parts(
           id, position, fits_model, fits_product, item, name, brand, kind, certified, price_usd,
           lead_days, pack_qty, size, merv, spec
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        part.id,
        index + 1,
        part.fitsModel,
        part.fitsProduct,
        part.item,
        part.name,
        part.brand,
        part.kind,
        part.certified === null ? null : part.certified ? 1 : 0,
        part.priceUsd,
        part.leadDays,
        part.packQty,
        part.size,
        part.merv,
        part.spec,
      );
    });
    seed.symptoms.forEach((symptom, index) => {
      this.run(
        `INSERT INTO symptoms(id, position, maker, model, product, phrases_json, result, item, hazard)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        symptom.id,
        index + 1,
        symptom.maker,
        symptom.model,
        symptom.product,
        JSON.stringify(symptom.phrases),
        symptom.result,
        symptom.item,
        symptom.hazard ? 1 : 0,
      );
    });
    seed.hazards.forEach((hazard, index) => {
      this.run(
        `INSERT INTO hazards(id, position, applies_to, phrases_json, result, advice)
         VALUES (?, ?, ?, ?, ?, ?)`,
        hazard.id,
        index + 1,
        hazard.appliesTo,
        JSON.stringify(hazard.phrases),
        hazard.result,
        hazard.advice,
      );
    });
    seed.slots.forEach((slot, index) => {
      this.run(
        `INSERT INTO service_slots(
           id, position, provider, service, date, weekday, start_time, end_time, window_start, window_end, price_usd
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        slot.id,
        index + 1,
        slot.provider,
        slot.service,
        slot.date,
        slot.weekday,
        slot.start,
        slot.end,
        slot.windowStart,
        slot.windowEnd,
        slot.priceUsd,
      );
    });
    seed.chips.forEach((label, index) => {
      this.run("INSERT INTO chips(position, label) VALUES (?, ?)", index + 1, label);
    });
  }

  private insertSchedule(applianceId: string, schedule: NewSchedule): void {
    this.run(
      `INSERT INTO schedules(appliance_id, item, how, every_days, trigger, last_done, next_due, spec, max_merv)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      applianceId,
      requiredText(schedule.item, "item"),
      howOf(schedule.how),
      daysOf(schedule.everyDays),
      triggerOf(schedule.trigger),
      schedule.lastDone ?? null,
      schedule.nextDue ?? null,
      schedule.spec ?? null,
      schedule.maxMerv ?? null,
    );
  }

  private takeId(kind: IdKind): string {
    const prefix = ID_PREFIX[kind];
    const row = this.one<{ next: number }>("SELECT next FROM id_counters WHERE kind = ?", kind);
    if (!row) throw new Error(`Unknown id kind: ${kind}`);
    this.run("UPDATE id_counters SET next = ? WHERE kind = ?", row.next + 1, kind);
    return `${prefix}_${String(row.next).padStart(4, "0")}`;
  }

  private nextPosition(table: "appliances" | "inventory"): number {
    const row = this.one<{ next: number }>(`SELECT COALESCE(MAX(position), 0) + 1 AS next FROM ${table}`);
    return row?.next ?? 1;
  }

  private timezone(): string {
    return this.getHousehold().timezone;
  }

  private updateById(
    table: string,
    idColumn: string,
    id: string,
    sets: Array<[string, SqlValue]>,
    label: string,
  ): void {
    if (sets.length === 0) throw new Error(`No fields to update on ${label}`);
    const sql = `UPDATE ${table} SET ${sets.map(([column]) => `${column} = ?`).join(", ")} WHERE ${idColumn} = ?`;
    const result = this.guard()
      .prepare(sql)
      .run(...sets.map(([, value]) => value), id);
    if (result.changes === 0) throw new Error(`${label} not found: ${id}`);
  }

  private meta(key: string): string | null {
    const row = this.one<{ value: string }>("SELECT value FROM meta WHERE key = ?", key);
    return row?.value ?? null;
  }

  private setMeta(key: string, value: string): void {
    this.run(
      "INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      key,
      value,
    );
  }

  private transaction<T>(fn: () => T): T {
    return this.guard().transaction(fn)();
  }

  private one<T>(sql: string, ...params: SqlValue[]): T | undefined {
    return this.guard().prepare(sql).get(...params) as T | undefined;
  }

  private many<T>(sql: string, ...params: SqlValue[]): T[] {
    return this.guard().prepare(sql).all(...params) as T[];
  }

  private run(sql: string, ...params: SqlValue[]): void {
    this.guard().prepare(sql).run(...params);
  }

  private guard(): Database.Database {
    if (this.closed) throw new Error("Repository is closed");
    return this.db;
  }

  private must<T>(value: T | null | undefined, message: string): T {
    if (value === null || value === undefined) throw new Error(message);
    return value;
  }
}

function openDatabase(path: string): Database.Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("foreign_keys = ON");
  if (path !== ":memory:") db.pragma("journal_mode = WAL");
  return db;
}

function applianceFromRow(row: ApplianceRow): Appliance {
  return {
    id: row.id,
    spokenName: row.spoken_name,
    maker: row.maker,
    model: row.model,
    modelDetail: row.model_detail,
    product: row.product,
    location: row.location,
  };
}

function scheduleFromRow(row: ScheduleRow): Schedule {
  return {
    applianceId: row.appliance_id,
    item: row.item,
    how: howOf(row.how),
    everyDays: row.every_days,
    trigger: triggerOf(row.trigger),
    lastDone: row.last_done,
    nextDue: row.next_due,
    spec: row.spec,
    maxMerv: row.max_merv,
  };
}

function inventoryFromRow(row: InventoryRow): InventoryItem {
  return {
    id: row.id,
    item: row.item,
    name: row.name,
    spec: row.spec,
    qty: row.qty,
    location: row.location,
    receivedNotInstalled: row.received_not_installed,
  };
}

function partFromRow(row: PartRow): PartOption {
  return {
    id: row.id,
    fitsModel: row.fits_model,
    fitsProduct: row.fits_product,
    item: row.item,
    name: row.name,
    brand: row.brand,
    kind: partKind(row.kind),
    certified: row.certified === null ? null : row.certified !== 0,
    priceUsd: row.price_usd,
    leadDays: row.lead_days,
    packQty: row.pack_qty,
    size: row.size,
    merv: row.merv,
    spec: row.spec,
  };
}

function catalogFromRow(row: CatalogRow): CatalogModel {
  const schedule =
    row.item === null || row.how === null || row.trigger === null
      ? null
      : {
          item: row.item,
          how: howOf(row.how),
          everyDays: row.every_days,
          trigger: triggerOf(row.trigger),
          spec: row.spec,
          maxMerv: row.max_merv,
        };
  return {
    maker: row.maker,
    model: row.model,
    product: row.product,
    catalogOnly: row.catalog_only !== 0,
    schedule,
  };
}

function symptomFromRow(row: SymptomRow): Symptom {
  return {
    id: row.id,
    maker: row.maker,
    model: row.model,
    product: row.product,
    phrases: parsePhrases(row.phrases_json),
    result: row.result,
    item: row.item,
    hazard: row.hazard !== 0,
  };
}

function hazardFromRow(row: HazardRow): HazardRule {
  return {
    id: row.id,
    appliesTo: row.applies_to,
    phrases: parsePhrases(row.phrases_json),
    result: row.result,
    hazard: true,
    advice: row.advice,
  };
}

function slotFromRow(row: SlotRow): ServiceSlot {
  return {
    id: row.id,
    provider: row.provider,
    service: row.service,
    date: row.date,
    weekday: row.weekday,
    start: row.start_time,
    end: row.end_time,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    priceUsd: row.price_usd,
  };
}

function orderFromRow(row: OrderRow): Order {
  return {
    id: row.id,
    quoteId: row.quote_id,
    status: orderStatus(row.status),
    applianceId: row.appliance_id,
    optionId: row.option_id,
    qty: row.qty,
    totalUsd: row.total_usd,
    placedAt: row.placed_at,
    shipOn: row.ship_on,
    eta: row.eta,
    taskId: row.task_id,
  };
}

function bookingFromRow(row: BookingRow): Booking {
  return {
    id: row.id,
    quoteId: row.quote_id,
    status: bookingStatus(row.status),
    applianceId: row.appliance_id,
    slotId: row.slot_id,
    provider: row.provider,
    service: row.service,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    totalUsd: row.total_usd,
    placedAt: row.placed_at,
  };
}

function taskFromRow(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    applianceId: row.appliance_id,
    item: row.item,
    dueDate: row.due_date,
    notes: row.notes,
    status: taskStatus(row.status),
    createdAt: row.created_at,
    closedAt: row.closed_at,
  };
}

function quoteFromRow(row: QuoteRow): Quote {
  const lines = JSON.parse(row.lines_json) as unknown;
  if (!Array.isArray(lines)) throw new Error(`Quote ${row.id} lines are not an array`);
  return {
    id: row.id,
    kind: quoteKind(row.kind),
    lines: lines as JsonValue[],
    totalUsd: row.total_usd,
    capUsd: row.cap_usd,
    overCap: row.over_cap !== 0,
    expiresAt: row.expires_at,
    attempts: row.attempts,
    locked: row.locked !== 0,
    status: quoteStatus(row.status),
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
    resultKind: row.result_kind === null ? null : resultKind(row.result_kind),
    resultId: row.result_id,
  };
}

function auditFromRow(row: AuditRow): AuditEvent {
  const detail = JSON.parse(row.detail_json) as unknown;
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    throw new Error(`Audit ${row.id} detail is not an object`);
  }
  return {
    id: row.id,
    at: row.at,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    detail: detail as { [key: string]: JsonValue },
  };
}

function parsePhrases(json: string): string[] {
  const parsed = JSON.parse(json) as unknown;
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) {
    throw new Error("Stored phrases are invalid");
  }
  return parsed as string[];
}

function assign(sets: Array<[string, SqlValue]>, column: string, value: SqlValue | undefined): void {
  if (value !== undefined) sets.push([column, value]);
}

function assignText(sets: Array<[string, SqlValue]>, column: string, value: string | undefined): void {
  if (value !== undefined) sets.push([column, requiredText(value, column)]);
}

function requiredText(value: string, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function money(value: string, label: string): string {
  if (!/^\d+\.\d{2}$/.test(value)) throw new Error(`${label} must be a USD amount with cents`);
  return value;
}

function countOf(value: number, label: string, min = 0): number {
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${label} must be an integer >= ${min}`);
  }
  return value;
}

function daysOf(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 1) throw new Error("everyDays must be a positive integer or null");
  return value;
}

function oneOf<T extends string>(value: string, allowed: readonly T[], label: string): T {
  if (!(allowed as readonly string[]).includes(value)) throw new Error(`Invalid ${label}: ${value}`);
  return value as T;
}

function howOf(value: string): ItemHow {
  return oneOf(value, ["part", "pro", "maintenance"] as const, "how");
}

function triggerOf(value: string): ScheduleTrigger {
  return oneOf(value, ["interval", "on_failure"] as const, "trigger");
}

function partKind(value: string): PartKind {
  return oneOf(value, ["compatible", "oem", "generic"] as const, "part kind");
}

function orderStatus(value: string): OrderStatus {
  return oneOf(value, ["placed", "shipped", "delivered", "cancelled"] as const, "order status");
}

function bookingStatus(value: string): BookingStatus {
  return oneOf(value, ["booked", "cancelled"] as const, "booking status");
}

function taskStatus(value: string): TaskStatus {
  return oneOf(value, ["open", "closed"] as const, "task status");
}

function quoteKind(value: string): QuoteKind {
  return oneOf(value, ["part", "service"] as const, "quote kind");
}

function quoteStatus(value: string): QuoteStatus {
  return oneOf(value, ["open", "confirmed", "cancelled"] as const, "quote status");
}

function resultKind(value: string): "order" | "booking" {
  return oneOf(value, ["order", "booking"] as const, "result kind");
}

function jsonText(value: JsonValue[], label: string): string {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return JSON.stringify(value);
}
