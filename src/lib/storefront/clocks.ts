export const SHOP_TIMEZONE = "Africa/Harare";

export const WEEKDAYS = [
  { weekday: 1, label: "Monday", short: "Mon" },
  { weekday: 2, label: "Tuesday", short: "Tue" },
  { weekday: 3, label: "Wednesday", short: "Wed" },
  { weekday: 4, label: "Thursday", short: "Thu" },
  { weekday: 5, label: "Friday", short: "Fri" },
  { weekday: 6, label: "Saturday", short: "Sat" },
  { weekday: 7, label: "Sunday", short: "Sun" },
] as const;

export type WeeklyHour = { weekday: number; open: string; close: string };
export type CollectionWindow = { weekday: number; start: string; end: string };

export type ClockDelivery = {
  prepMinutes: number;
  cutoff: string;
  cutoffTime?: string | null;
  collectionWindows: string;
  timezone?: string;
  weeklyHours?: WeeklyHour[];
  windows?: CollectionWindow[];
};

export type CollectionSlot = { at: string; label: string; weekday: number; start: string };

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function shopTimezone(delivery: Pick<ClockDelivery, "timezone">): string {
  return delivery.timezone === "UTC" ? "UTC" : SHOP_TIMEZONE;
}

export function parseHhmm(raw: string | null | undefined): { h: number; m: number } | null {
  const match = HHMM.exec((raw ?? "").trim());
  if (!match) return null;
  return { h: Number(match[1]), m: Number(match[2]) };
}

export function minutesOf(raw: string | null | undefined): number | null {
  const parsed = parseHhmm(raw);
  return parsed ? parsed.h * 60 + parsed.m : null;
}

export function cutoffMinutes(delivery: ClockDelivery): number | null {
  return minutesOf(delivery.cutoffTime) ?? minutesOf(delivery.cutoff);
}

function offsetMs(tz: string): number {
  return tz === "UTC" ? 0 : 2 * 60 * 60 * 1000;
}

function offsetLabel(tz: string): string {
  return tz === "UTC" ? "+00:00" : "+02:00";
}

export function localParts(now: Date, tz: string) {
  const local = new Date(now.getTime() + offsetMs(tz));
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    weekday: ((local.getUTCDay() + 6) % 7) + 1,
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function addDays(year: number, month: number, day: number, extra: number) {
  const utc = Date.UTC(year, month - 1, day + extra);
  const next = new Date(utc);
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
    weekday: ((next.getUTCDay() + 6) % 7) + 1,
  };
}

function hourRow(hours: WeeklyHour[] | undefined, weekday: number): WeeklyHour | null {
  return (hours ?? []).find((row) => row.weekday === weekday) ?? null;
}

export function hasStructuredHours(delivery: ClockDelivery): boolean {
  return (delivery.weeklyHours ?? []).length > 0;
}

export function hasCollectionWindows(delivery: ClockDelivery): boolean {
  return (delivery.windows ?? []).length > 0;
}

export function isOpenAt(delivery: ClockDelivery, weekday: number, minutes: number): boolean {
  const hours = delivery.weeklyHours ?? [];
  if (hours.length === 0) return true;
  const row = hourRow(hours, weekday);
  if (!row) return false;
  const open = minutesOf(row.open);
  const close = minutesOf(row.close);
  if (open == null || close == null || close <= open) return false;
  return minutes >= open && minutes < close;
}

export function placeOrderBlockedReason(
  delivery: ClockDelivery,
  fulfilment: "pickup" | "delivery" | "quote",
  now = new Date(),
): string | null {
  if (fulfilment === "quote") return null;
  const tz = shopTimezone(delivery);
  const local = localParts(now, tz);
  const windows = hasCollectionWindows(delivery);
  if (fulfilment === "pickup" && windows) return null;
  if (hasStructuredHours(delivery) && !isOpenAt(delivery, local.weekday, local.minutes)) {
    return "This shop is closed right now.";
  }
  const cutoff = cutoffMinutes(delivery);
  if (cutoff != null && local.minutes >= cutoff) {
    return "The order cut-off for today has passed.";
  }
  const prep = Math.max(0, delivery.prepMinutes || 0);
  if (prep > 0 && hasStructuredHours(delivery)) {
    const ready = local.minutes + prep;
    const row = hourRow(delivery.weeklyHours, local.weekday);
    const close = minutesOf(row?.close);
    if (close != null && ready > close) {
      return "There is not enough time left today to prepare this order.";
    }
  }
  return null;
}

export function upcomingCollectionSlots(
  delivery: ClockDelivery,
  now = new Date(),
  days = 7,
): CollectionSlot[] {
  const windows = delivery.windows ?? [];
  if (windows.length === 0) return [];
  const tz = shopTimezone(delivery);
  const local = localParts(now, tz);
  const prep = Math.max(0, delivery.prepMinutes || 0);
  const earliest = now.getTime() + prep * 60 * 1000;
  const cutoff = cutoffMinutes(delivery);
  const slots: CollectionSlot[] = [];
  for (let extra = 0; extra < days; extra++) {
    const date = addDays(local.year, local.month, local.day, extra);
    if (extra === 0 && cutoff != null && local.minutes >= cutoff) continue;
    for (const window of windows) {
      if (window.weekday !== date.weekday) continue;
      const start = minutesOf(window.start);
      const end = minutesOf(window.end);
      if (start == null || end == null || end <= start) continue;
      if (!isOpenAt(delivery, date.weekday, start)) continue;
      const iso = `${ymd(date.year, date.month, date.day)}T${window.start}:00${offsetLabel(tz)}`;
      const atMs = new Date(iso).getTime();
      if (Number.isNaN(atMs) || atMs < earliest) continue;
      const day = WEEKDAYS.find((item) => item.weekday === date.weekday);
      slots.push({
        at: new Date(iso).toISOString(),
        label: `${day?.label ?? "Day"} ${window.start} to ${window.end}`,
        weekday: date.weekday,
        start: window.start,
      });
    }
  }
  return slots;
}

export function clocksCopy(delivery: ClockDelivery): string[] {
  const lines: string[] = [];
  if (delivery.prepMinutes > 0) {
    lines.push(`Preparation time is ${delivery.prepMinutes} minutes.`);
  }
  const cutoff = delivery.cutoffTime || (parseHhmm(delivery.cutoff) ? delivery.cutoff : "");
  if (cutoff) {
    lines.push(`Order cut-off is ${cutoff} ${shopTimezone(delivery)} time.`);
  } else if (delivery.cutoff.trim()) {
    lines.push(`Order cut-off note: ${delivery.cutoff}. This text is not a clock.`);
  }
  if (hasCollectionWindows(delivery)) {
    lines.push("Collection is only during the listed windows.");
  } else if (delivery.collectionWindows.trim()) {
    lines.push(
      `Collection note: ${delivery.collectionWindows}. Choose structured windows to enforce this.`,
    );
  }
  if (hasStructuredHours(delivery)) {
    lines.push("Orders that need same-day prep are refused when the shop is closed.");
  }
  return lines;
}
