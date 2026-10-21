/** Seed clock: Wednesday 21 October 2026, 09:00, US Pacific. */
export const DEFAULT_SIM_START = "2026-10-21T09:00:00-07:00";

export const MIN_ADVANCE_DAYS = 1;
export const MAX_ADVANCE_DAYS = 400;

export type ClockErrorCode = "CLOCK_ADVANCE_OUT_OF_RANGE" | "CLOCK_NOT_LATER" | "CLOCK_INVALID";

export class ClockError extends Error {
  readonly code: ClockErrorCode;

  constructor(code: ClockErrorCode, message: string) {
    super(message);
    this.name = "ClockError";
    this.code = code;
  }
}

const CANONICAL_ISO =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?(Z|[+-]\d{2}:\d{2})$/;

const TIMESTAMP_ISO =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/;

export function assertCanonicalIso(iso: string): string {
  const trimmed = iso.trim();
  if (!CANONICAL_ISO.test(trimmed) || Number.isNaN(Date.parse(trimmed))) {
    throw new ClockError("CLOCK_INVALID", `Invalid sim clock: ${iso}`);
  }
  return trimmed;
}

export function assertAdvanceDays(days: number): void {
  if (!Number.isInteger(days) || days < MIN_ADVANCE_DAYS || days > MAX_ADVANCE_DAYS) {
    throw new ClockError(
      "CLOCK_ADVANCE_OUT_OF_RANGE",
      `advanceDays requires an integer from ${MIN_ADVANCE_DAYS} to ${MAX_ADVANCE_DAYS}`,
    );
  }
}

/** Instant milliseconds for an ISO timestamp that is strictly later than `currentIso`. */
export function assertLaterInstant(currentIso: string, nextIso: string): number {
  if (typeof nextIso !== "string" || !TIMESTAMP_ISO.test(nextIso.trim())) {
    throw new ClockError("CLOCK_INVALID", "set requires an ISO time later than now");
  }
  const current = Date.parse(currentIso);
  const next = Date.parse(nextIso.trim());
  if (Number.isNaN(current) || Number.isNaN(next)) {
    throw new ClockError("CLOCK_INVALID", "set requires an ISO time later than now");
  }
  if (next <= current) {
    throw new ClockError("CLOCK_NOT_LATER", "set requires an ISO time later than now");
  }
  return next;
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

function formatOffset(minutesEast: number): string {
  const sign = minutesEast >= 0 ? "+" : "-";
  const abs = Math.abs(minutesEast);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Offset of `timeZone` at `instant`, in minutes east of UTC. Pacific daylight is -420. */
export function zoneOffsetMinutes(timeZone: string, instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - instant.getTime()) / 60000);
}

function formatLocal(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  milli: number,
  offsetMinutes: number,
): string {
  const frac = milli === 0 ? "" : `.${pad(milli, 3)}`;
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}${frac}${formatOffset(offsetMinutes)}`;
}

/** Format an instant in `timeZone`, keeping the offset that zone uses on that date. */
export function formatInZone(instantMs: number, timeZone: string): string {
  const offset = zoneOffsetMinutes(timeZone, new Date(instantMs));
  const local = new Date(instantMs + offset * 60000);
  return formatLocal(
    local.getUTCFullYear(),
    local.getUTCMonth() + 1,
    local.getUTCDate(),
    local.getUTCHours(),
    local.getUTCMinutes(),
    local.getUTCSeconds(),
    local.getUTCMilliseconds(),
    offset,
  );
}

/**
 * Add calendar days to the local date in an ISO timestamp.
 * The clock time is kept. The offset is the household zone's offset on the new date,
 * so a Pacific clock moves from -07:00 to -08:00 when it crosses the autumn change.
 */
export function addCalendarDays(iso: string, days: number, timeZone: string): string {
  const match = CANONICAL_ISO.exec(iso);
  if (!match) throw new ClockError("CLOCK_INVALID", `Invalid sim clock: ${iso}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const milli = match[7] ? Number(match[7]) : 0;
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  const nextYear = shifted.getUTCFullYear();
  const nextMonth = shifted.getUTCMonth() + 1;
  const nextDay = shifted.getUTCDate();
  const guess = Date.UTC(nextYear, nextMonth - 1, nextDay, hour, minute, second, milli);
  let offset = zoneOffsetMinutes(timeZone, new Date(guess));
  let instant = guess - offset * 60000;
  const resolved = zoneOffsetMinutes(timeZone, new Date(instant));
  if (resolved !== offset) {
    offset = resolved;
    instant = guess - offset * 60000;
  }
  return formatLocal(nextYear, nextMonth, nextDay, hour, minute, second, milli, offset);
}
