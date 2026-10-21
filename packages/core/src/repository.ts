import type {
  Appliance,
  AuditEvent,
  Booking,
  BookingStatus,
  CatalogModel,
  Chip,
  HazardRule,
  Household,
  IdKind,
  InventoryItem,
  ItemHow,
  JsonValue,
  Order,
  OrderStatus,
  PartOption,
  Preferences,
  Quote,
  QuoteKind,
  QuoteStatus,
  Schedule,
  ScheduleTrigger,
  SeedVersion,
  ServiceSlot,
  SimSnapshot,
  Symptom,
  Task,
  TaskStatus,
} from "./types";

export interface AppliancePatch {
  spokenName?: string;
  maker?: string;
  model?: string;
  modelDetail?: string | null;
  product?: string;
  location?: string;
}

export interface NewSchedule {
  item: string;
  how: ItemHow;
  everyDays: number | null;
  trigger: ScheduleTrigger;
  lastDone?: string | null;
  nextDue?: string | null;
  spec?: string | null;
  maxMerv?: number | null;
}

export interface NewAppliance {
  spokenName: string;
  maker: string;
  model: string;
  modelDetail?: string | null;
  product: string;
  location: string;
  schedule?: NewSchedule | null;
}

export interface SchedulePatch {
  item?: string;
  how?: ItemHow;
  everyDays?: number | null;
  trigger?: ScheduleTrigger;
  lastDone?: string | null;
  nextDue?: string | null;
  spec?: string | null;
  maxMerv?: number | null;
}

export interface NewInventoryItem {
  id: string;
  item: string;
  name: string;
  spec?: string | null;
  qty: number;
  location: string;
  receivedNotInstalled?: number;
}

export interface InventoryPatch {
  item?: string;
  name?: string;
  spec?: string | null;
  qty?: number;
  location?: string;
  receivedNotInstalled?: number;
}

export interface NewOrder {
  quoteId?: string | null;
  status?: OrderStatus;
  applianceId?: string | null;
  optionId?: string | null;
  qty: number;
  totalUsd: string;
  placedAt?: string;
  shipOn?: string | null;
  eta?: string | null;
  taskId?: string | null;
}

export interface OrderPatch {
  quoteId?: string | null;
  status?: OrderStatus;
  applianceId?: string | null;
  optionId?: string | null;
  qty?: number;
  totalUsd?: string;
  placedAt?: string;
  shipOn?: string | null;
  eta?: string | null;
  taskId?: string | null;
}

export interface NewBooking {
  quoteId?: string | null;
  status?: BookingStatus;
  applianceId?: string | null;
  slotId: string;
  provider: string;
  service: string;
  windowStart: string;
  windowEnd: string;
  totalUsd: string;
  placedAt?: string;
}

export interface BookingPatch {
  quoteId?: string | null;
  status?: BookingStatus;
  applianceId?: string | null;
  slotId?: string;
  provider?: string;
  service?: string;
  windowStart?: string;
  windowEnd?: string;
  totalUsd?: string;
  placedAt?: string;
}

export interface NewTask {
  title: string;
  applianceId?: string | null;
  item?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  status?: TaskStatus;
  createdAt?: string;
}

export interface TaskPatch {
  title?: string;
  applianceId?: string | null;
  item?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  status?: TaskStatus;
  createdAt?: string;
  closedAt?: string | null;
}

export interface NewQuote {
  kind: QuoteKind;
  lines: JsonValue[];
  totalUsd: string;
  capUsd: string;
  overCap: boolean;
  expiresAt: string;
  createdAt?: string;
}

export interface QuotePatch {
  kind?: QuoteKind;
  lines?: JsonValue[];
  totalUsd?: string;
  capUsd?: string;
  overCap?: boolean;
  expiresAt?: string;
  attempts?: number;
  locked?: boolean;
  status?: QuoteStatus;
  createdAt?: string;
  confirmedAt?: string | null;
  resultKind?: "order" | "booking" | null;
  resultId?: string | null;
}

export interface NewAudit {
  action: string;
  entityType: string;
  entityId: string;
  detail?: { [key: string]: JsonValue };
  at?: string;
}

export interface Repository {
  readonly path: string;
  now(): string;
  advanceDays(days: number): string;
  set(iso: string): string;
  reset(): { now: string; seed: SeedVersion };
  snapshot(): SimSnapshot;
  allocateId(kind: IdKind): string;
  close(): void;

  getHousehold(): Household;
  getPreferences(): Preferences;

  listAppliances(): Appliance[];
  getAppliance(id: string): Appliance | null;
  insertAppliance(input: NewAppliance): Appliance;
  updateAppliance(id: string, patch: AppliancePatch): Appliance;

  listSchedule(): Schedule[];
  getSchedule(applianceId: string): Schedule | null;
  updateSchedule(applianceId: string, patch: SchedulePatch): Schedule;

  listInventory(): InventoryItem[];
  getInventory(id: string): InventoryItem | null;
  insertInventory(input: NewInventoryItem): InventoryItem;
  updateInventory(id: string, patch: InventoryPatch): InventoryItem;

  listParts(): PartOption[];
  getPart(id: string): PartOption | null;
  listSymptoms(): Symptom[];
  listHazards(): HazardRule[];
  listServiceSlots(): ServiceSlot[];
  getServiceSlot(id: string): ServiceSlot | null;
  listCatalogModels(): CatalogModel[];
  findCatalogModel(maker: string, model: string): CatalogModel | null;
  listChips(): Chip[];

  listOrders(): Order[];
  getOrder(id: string): Order | null;
  insertOrder(input: NewOrder): Order;
  updateOrder(id: string, patch: OrderPatch): Order;

  listBookings(): Booking[];
  getBooking(id: string): Booking | null;
  insertBooking(input: NewBooking): Booking;
  updateBooking(id: string, patch: BookingPatch): Booking;

  listTasks(): Task[];
  getTask(id: string): Task | null;
  insertTask(input: NewTask): Task;
  updateTask(id: string, patch: TaskPatch): Task;

  listQuotes(): Quote[];
  getQuote(id: string): Quote | null;
  insertQuote(input: NewQuote): Quote;
  updateQuote(id: string, patch: QuotePatch): Quote;

  listAudit(): AuditEvent[];
  appendAudit(input: NewAudit): AuditEvent;
}
