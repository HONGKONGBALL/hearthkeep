import { DEFAULT_SIM_START } from "./clock";

/** MCP protocol version this server advertises. */
export const PROTOCOL_VERSION = "2025-11-25" as const;

export { DEFAULT_SIM_START, ClockError } from "./clock";
export type { ClockErrorCode } from "./clock";
export { SEED_VERSION } from "./types";
export type {
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
  PartKind,
  PartOption,
  Preferences,
  Quote,
  QuoteKind,
  QuoteStatus,
  Schedule,
  ScheduleTemplate,
  ScheduleTrigger,
  SeedVersion,
  ServiceSlot,
  SimSnapshot,
  Symptom,
  Task,
  TaskStatus,
} from "./types";
export { SeedError, defaultSeedDir, loadSeed } from "./seed";
export type { PolicyExample, SeedAppliance, SeedBundle, SeedPart } from "./seed";
export type {
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
export {
  SqliteRepository,
  openRepository,
  openRepositoryFromEnv,
  resolveDbPath,
  resolveSimStart,
} from "./sqlite-repository";
export type { OpenRepositoryOptions, StorageEnv } from "./sqlite-repository";
export { DEMO_PURCHASE_CODE, DOMAIN_ERROR_CODES, DomainError } from "./domain";
export {
  confirmPurchase,
  createTask,
  diagnoseSymptom,
  findParts,
  findServiceSlots,
  getUpkeepStatus,
  logMaintenance,
  prepareCheckout,
  recordAudit,
  registerAppliance,
  resolveAppliance,
  syncLifecycle,
} from "./domain";
export type {
  CheckoutLine,
  CheckoutQuote,
  CheckoutSlot,
  ConfirmPurchaseResult,
  CreatedTask,
  Diagnosis,
  DomainErrorCode,
  ExcludedPart,
  FindPartsResult,
  InventoryAfter,
  LifecycleSync,
  MaintenanceLog,
  OnHand,
  PartChoice,
  PartLine,
  RegisterResult,
  RegisterSchedule,
  ResolveResult,
  ResolvedAppliance,
  ServiceLine,
  ServiceSlotChoice,
  ServiceSlotsResult,
  UpkeepAttention,
  UpkeepInProgress,
  UpkeepStatus,
  UpkeepTask,
  UpkeepUpcoming,
} from "./domain";

export interface HealthReport {
  status: "ok";
  protocolVersion: typeof PROTOCOL_VERSION;
  storage: "sqlite";
  payment: "mock";
  simMode: boolean;
  simNow: string;
}

export interface HealthEnv {
  HK_SIM_MODE?: string | undefined;
  HK_SIM_START?: string | undefined;
}

/**
 * `HK_SIM_MODE` defaults to on so `npm run demo` matches the zero-key contract.
 * Only the exact value "1" enables simulation mode. "0" disables it.
 */
export function simModeFromEnv(env: HealthEnv = {}): boolean {
  return env.HK_SIM_MODE === undefined ? true : env.HK_SIM_MODE === "1";
}

/**
 * `simNow` is the clock stored in SQLite when the caller has opened the database.
 * Without that argument, `HK_SIM_START` is returned unchanged so the offset is preserved.
 */
export function healthReport(env: HealthEnv = {}, simNow?: string): HealthReport {
  const configured = env.HK_SIM_START;
  const fromEnv = configured === undefined || configured.trim() === "" ? DEFAULT_SIM_START : configured;
  return {
    status: "ok",
    protocolVersion: PROTOCOL_VERSION,
    storage: "sqlite",
    payment: "mock",
    simMode: simModeFromEnv(env),
    simNow: simNow === undefined || simNow.trim() === "" ? fromEnv : simNow,
  };
}
