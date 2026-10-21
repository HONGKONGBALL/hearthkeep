export const SEED_VERSION = "v1" as const;

export type SeedVersion = typeof SEED_VERSION;

export type IdKind = "quote" | "order" | "booking" | "task" | "appliance";

export type ItemHow = "part" | "pro" | "maintenance";

export type ScheduleTrigger = "interval" | "on_failure";

export type PartKind = "compatible" | "oem" | "generic";

export type OrderStatus = "placed" | "shipped" | "delivered" | "cancelled";

export type BookingStatus = "booked" | "cancelled";

export type TaskStatus = "open" | "closed";

export type QuoteKind = "part" | "service";

export type QuoteStatus = "open" | "confirmed" | "cancelled";

export type JsonValue =
  | null
  | string
  | number
  | boolean
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface Household {
  name: string;
  member: string;
  timezone: string;
  currency: "USD";
}

export interface Preferences {
  spendCapUsd: string;
  partPolicy: "oem_or_certified";
  selection: "cheapest_then_earliest";
  purchaseCodeRequired: boolean;
  comingUpWindowDays: number;
  quoteLifetimeSimMinutes: number;
  codeAttemptsPerQuote: number;
}

export interface Appliance {
  id: string;
  spokenName: string;
  maker: string;
  model: string;
  modelDetail: string | null;
  product: string;
  location: string;
}

export interface Schedule {
  applianceId: string;
  item: string;
  how: ItemHow;
  everyDays: number | null;
  trigger: ScheduleTrigger;
  lastDone: string | null;
  nextDue: string | null;
  spec: string | null;
  maxMerv: number | null;
}

export interface ScheduleTemplate {
  item: string;
  how: ItemHow;
  everyDays: number | null;
  trigger: ScheduleTrigger;
  spec: string | null;
  maxMerv: number | null;
}

export interface CatalogModel {
  maker: string;
  model: string;
  product: string;
  catalogOnly: boolean;
  schedule: ScheduleTemplate | null;
}

export interface InventoryItem {
  id: string;
  item: string;
  name: string;
  spec: string | null;
  qty: number;
  location: string;
  receivedNotInstalled: number;
}

export interface PartOption {
  id: string;
  fitsModel: string | null;
  fitsProduct: string | null;
  item: string;
  name: string;
  brand: string;
  kind: PartKind;
  certified: boolean | null;
  priceUsd: string;
  leadDays: number;
  packQty: number;
  size: string | null;
  merv: number | null;
  spec: string | null;
}

export interface Symptom {
  id: string;
  maker: string | null;
  model: string | null;
  product: string | null;
  phrases: string[];
  result: string;
  item: string;
  hazard: boolean;
}

export interface HazardRule {
  id: string;
  appliesTo: string;
  phrases: string[];
  result: string;
  hazard: true;
  advice: string;
}

export interface ServiceSlot {
  id: string;
  provider: string;
  service: string;
  date: string;
  weekday: string;
  start: string;
  end: string;
  windowStart: string;
  windowEnd: string;
  priceUsd: string;
}

export interface Chip {
  position: number;
  label: string;
}

export interface Order {
  id: string;
  quoteId: string | null;
  status: OrderStatus;
  applianceId: string | null;
  optionId: string | null;
  qty: number;
  totalUsd: string;
  placedAt: string;
  shipOn: string | null;
  eta: string | null;
  taskId: string | null;
}

export interface Booking {
  id: string;
  quoteId: string | null;
  status: BookingStatus;
  applianceId: string | null;
  slotId: string;
  provider: string;
  service: string;
  windowStart: string;
  windowEnd: string;
  totalUsd: string;
  placedAt: string;
}

export interface Task {
  id: string;
  title: string;
  applianceId: string | null;
  item: string | null;
  dueDate: string | null;
  notes: string | null;
  status: TaskStatus;
  createdAt: string;
  closedAt: string | null;
}

export interface Quote {
  id: string;
  kind: QuoteKind;
  lines: JsonValue[];
  totalUsd: string;
  capUsd: string;
  overCap: boolean;
  expiresAt: string;
  attempts: number;
  locked: boolean;
  status: QuoteStatus;
  createdAt: string;
  confirmedAt: string | null;
  resultKind: "order" | "booking" | null;
  resultId: string | null;
}

export interface AuditEvent {
  id: number;
  at: string;
  action: string;
  entityType: string;
  entityId: string;
  detail: { [key: string]: JsonValue };
}

/** Fields returned by the sim snapshot. Catalog and profile are read through their own methods. */
export interface SimSnapshot {
  clock: string;
  appliances: Appliance[];
  schedule: Schedule[];
  inventory: InventoryItem[];
  orders: Order[];
  bookings: Booking[];
  tasks: Task[];
  audit: AuditEvent[];
}
