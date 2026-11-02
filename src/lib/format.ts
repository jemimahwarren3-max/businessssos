export function formatMoney(amount: number, currency = "USD") {
  const value = Number.isFinite(amount) ? amount : 0;
  const code = currency === "ZiG" ? "ZWG" : currency;
  if (code === "ZWG") {
    return `ZiG ${value.toFixed(2)}`;
  }
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
    Number.isFinite(value) ? value : 0,
  );
}

export function formatPercent(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function friendlyDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function friendlyDateTime(value: string | Date, timeZone = "Africa/Harare") {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
}

function isInternalFrameworkError(message: string): boolean {
  return (
    message.includes("reading 'rest'") ||
    message.includes("Cannot read properties of undefined") ||
    message.includes("Cannot read properties of null") ||
    message.includes("Seroval")
  );
}

/** Server errors are already user-friendly (see business.server.ts AppError) —
 * anything else (network failures, framework errors) gets a generic fallback. */
export function readableError(error: Error, fallback: string) {
  const message = error.message ?? "";
  if (
    !message ||
    isInternalFrameworkError(message) ||
    /^failed to fetch/i.test(message) ||
    message === "HTTPError"
  ) {
    return fallback;
  }
  return message;
}
