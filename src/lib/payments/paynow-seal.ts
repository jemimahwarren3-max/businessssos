import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function legacySealKey(): Buffer {
  const secret = process.env["SESSION_SECRET"]?.trim() ?? "";
  if (secret.length < 16) {
    throw new Error("SESSION_SECRET is required to read legacy shop Paynow credentials.");
  }
  return createHash("sha256").update(`store-paynow:${secret}`).digest();
}

function configuredSealKey(variable: string): Buffer | null {
  const configured = process.env[variable]?.trim();
  if (!configured) return null;
  if (!/^[A-Za-z0-9_-]{43}$/.test(configured)) {
    throw new Error(`${variable} must be a base64url-encoded 32-byte key.`);
  }
  const key = Buffer.from(configured, "base64url");
  if (key.length !== 32) {
    throw new Error(`${variable} must be a base64url-encoded 32-byte key.`);
  }
  return key;
}

export function sealPaynowSecrets(input: {
  integrationId: string;
  integrationKey: string;
}): string {
  const key = configuredSealKey("SHOP_PAYMENT_ENCRYPTION_KEY");
  if (!key) {
    throw new Error(
      "SHOP_PAYMENT_ENCRYPTION_KEY must be set before saving shop Paynow credentials.",
    );
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encoded = Buffer.concat([cipher.update(JSON.stringify(input), "utf8"), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), encoded]).toString("base64url")}`;
}

export function hasCurrentShopPaynowEncryptionKey(): boolean {
  return configuredSealKey("SHOP_PAYMENT_ENCRYPTION_KEY") !== null;
}

export function openPaynowSecrets(blob: string): {
  integrationId: string;
  integrationKey: string;
  needsReEncryption: boolean;
} {
  const versioned = blob.startsWith("v1.");
  const buf = Buffer.from(versioned ? blob.slice(3) : blob, "base64url");
  if (buf.length < 29) throw new Error("Shop Paynow credentials could not be read.");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encoded = buf.subarray(28);
  const keys = versioned
    ? [
        { key: configuredSealKey("SHOP_PAYMENT_ENCRYPTION_KEY"), current: true },
        { key: configuredSealKey("SHOP_PAYMENT_ENCRYPTION_KEY_PREVIOUS"), current: false },
      ].filter((entry): entry is { key: Buffer; current: boolean } => entry.key !== null)
    : [{ key: legacySealKey(), current: false }];
  if (keys.length === 0) {
    throw new Error("SHOP_PAYMENT_ENCRYPTION_KEY is required to read shop Paynow credentials.");
  }
  let json: string | undefined;
  let currentKeyUsed = false;
  for (const entry of keys) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", entry.key, iv);
      decipher.setAuthTag(tag);
      json = Buffer.concat([decipher.update(encoded), decipher.final()]).toString("utf8");
      currentKeyUsed = entry.current;
      break;
    } catch {
      continue;
    }
  }
  if (json === undefined) throw new Error("Shop Paynow credentials could not be authenticated.");
  const parsed = JSON.parse(json) as { integrationId?: string; integrationKey?: string };
  if (!parsed.integrationId?.trim() || !parsed.integrationKey?.trim()) {
    throw new Error("Shop Paynow credentials could not be read.");
  }
  return {
    integrationId: parsed.integrationId.trim(),
    integrationKey: parsed.integrationKey.trim(),
    needsReEncryption: !versioned || !currentKeyUsed,
  };
}
