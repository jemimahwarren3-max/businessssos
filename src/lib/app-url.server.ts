export function getAppUrl(): string {
  const url = process.env["APP_URL"];
  if (!url) {
    throw new Error("Missing APP_URL environment variable — set it in your .env file.");
  }
  return url.replace(/\/+$/, "");
}
