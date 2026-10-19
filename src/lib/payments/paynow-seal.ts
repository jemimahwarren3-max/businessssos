import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function sealKey(): Buffer {
  const secret = process.env["SESSION_SECRET"]?.trim() ?? "";
  if (secret.length < 16) {
    throw new Error("SESSION_SECRET must be set before storing shop Paynow keys.");
  }
  return createHash("sha256").update(`store-paynow:${secret}`).digest();
}

export function sealPaynowSecrets(input: {
  integrationId: string;
  integrationKey: string;
}): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealKey(), iv);
  const encoded = Buffer.concat([cipher.update(JSON.stringify(input), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encoded]).toString("base64url");
}

export function openPaynowSecrets(blob: string): { integrationId: string; integrationKey: string } {
  const buf = Buffer.from(blob, "base64url");
  if (buf.length < 29) throw new Error("Shop Paynow credentials could not be read.");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encoded = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", sealKey(), iv);
  decipher.setAuthTag(tag);
  const json = Buffer.concat([decipher.update(encoded), decipher.final()]).toString("utf8");
  const parsed = JSON.parse(json) as { integrationId?: string; integrationKey?: string };
  if (!parsed.integrationId?.trim() || !parsed.integrationKey?.trim()) {
    throw new Error("Shop Paynow credentials could not be read.");
  }
  return {
    integrationId: parsed.integrationId.trim(),
    integrationKey: parsed.integrationKey.trim(),
  };
}
