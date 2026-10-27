/** Detect Kwetuu runtime: browser, Tauri desktop, or Capacitor native shell. */

export type KwetuuPlatform = "web" | "desktop" | "android" | "ios";

let cached: KwetuuPlatform | undefined;

function detectFromWindow(): KwetuuPlatform {
  if (typeof window === "undefined") return "web";
  const w = window as Window & {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
    Capacitor?: { getPlatform?: () => string; isNativePlatform?: () => boolean };
  };
  if (w.__TAURI_INTERNALS__ || w.__TAURI__) return "desktop";
  const cap = w.Capacitor;
  if (cap?.isNativePlatform?.()) {
    const p = cap.getPlatform?.() ?? "android";
    if (p === "ios") return "ios";
    return "android";
  }
  return "web";
}

export function getKwetuuPlatform(): KwetuuPlatform {
  if (cached === undefined) cached = detectFromWindow();
  return cached;
}

export function isNativeShell(): boolean {
  const p = getKwetuuPlatform();
  return p === "desktop" || p === "android" || p === "ios";
}

export function isDesktopShell(): boolean {
  return getKwetuuPlatform() === "desktop";
}

export function isMobileShell(): boolean {
  const p = getKwetuuPlatform();
  return p === "android" || p === "ios";
}

/** Reset for unit tests only. */
export function resetKwetuuPlatformCacheForTests() {
  cached = undefined;
}
