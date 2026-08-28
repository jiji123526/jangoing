import { parseDate } from "chrono-node";

export interface TemporalGroundingInput {
  reference_date?: string;
  timezone?: string;
}

export interface TemporalGroundingContext {
  reference_date: string;
  timezone: string;
}

function utcIsoDate(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export function localIsoDate(
  timestamp: Date,
  timezone: string,
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(timestamp);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error(`Could not derive local date for timezone ${timezone}`);
  }
  return `${year}-${month}-${day}`;
}

export function resolveTemporalGrounding(
  input: TemporalGroundingInput,
  now = new Date(),
): TemporalGroundingContext {
  const timezone = input.timezone && isValidTimezone(input.timezone)
    ? input.timezone
    : "UTC";
  return {
    reference_date: input.reference_date ?? (
      timezone === "UTC" ? utcIsoDate(now) : localIsoDate(now, timezone)
    ),
    timezone,
  };
}

function utcNoonForIsoDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function normalizeExpiryDate(
  rawValue: string | undefined,
  context: TemporalGroundingContext,
): string | undefined {
  if (!rawValue) {
    return undefined;
  }

  const value = rawValue.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsed = parseDate(
    value,
    utcNoonForIsoDate(context.reference_date),
    { forwardDate: true },
  );
  return parsed ? utcIsoDate(parsed) : undefined;
}
