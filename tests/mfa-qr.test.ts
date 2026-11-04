import { describe, expect, it } from "vitest";
import { totpSecretGrouped, totpSecretRaw } from "@/lib/auth/mfa-display";
import { totpQrSrc } from "@/lib/auth/mfa.server";

describe("totpQrSrc", () => {
  it("encodes a raw SVG so an img tag can render it", () => {
    const src = totpQrSrc(`<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#000"/></svg>`);
    expect(src.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(src).toContain(encodeURIComponent("#000"));
  });

  it("leaves a base64 data URI alone", () => {
    const uri = "data:image/svg+xml;base64,abc";
    expect(totpQrSrc(uri)).toBe(uri);
  });

  it("re-encodes Supabase's unencoded svg+xml;utf-8 data URI so # is not a fragment", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#000"/></svg>`;
    const src = totpQrSrc(`data:image/svg+xml;utf-8,${svg}`);
    expect(src.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(src).not.toContain("#000");
    expect(src).toContain(encodeURIComponent("#000"));
  });
});

describe("totp secret display", () => {
  it("keeps the last character in the grouped key", () => {
    const secret = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    expect(totpSecretRaw(` ${secret.toLowerCase()} \n`)).toBe(secret);
    const grouped = totpSecretGrouped(secret);
    expect(grouped.replace(/\s+/g, "")).toBe(secret);
    expect(grouped.split(" ")).toHaveLength(8);
    expect(grouped.endsWith("4567")).toBe(true);

    const leftover = totpSecretGrouped(`${secret}A`);
    expect(leftover.replace(/\s+/g, "")).toBe(`${secret}A`);
    expect(leftover.endsWith("A")).toBe(true);
  });
});
