/** Full document navigation so the browser applies Set-Cookie before the next route guard runs. */
export function navigateAfterAuth(path: string): void {
  if (typeof window === "undefined") return;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  window.location.assign(normalized);
}
