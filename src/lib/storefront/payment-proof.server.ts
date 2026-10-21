import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError } from "@/lib/business.server";

export const PAYMENT_PROOF_BUCKET = "payment-proofs";
const MAX_BYTES = 5 * 1024 * 1024;

export type SniffedFile = {
  mime: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  ext: "jpg" | "png" | "webp" | "pdf";
};

export function sniffPaymentProof(bytes: Uint8Array): SniffedFile {
  if (bytes.length < 12 || bytes.length > MAX_BYTES) {
    throw new AppError("Use a JPEG, PNG, WebP, or PDF under 5 MB.");
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { mime: "image/png", ext: "png" };
  }
  const riff = String.fromCharCode(...bytes.slice(0, 4));
  const webp = String.fromCharCode(...bytes.slice(8, 12));
  if (riff === "RIFF" && webp === "WEBP") {
    return { mime: "image/webp", ext: "webp" };
  }
  const head = String.fromCharCode(...bytes.slice(0, 5));
  if (head === "%PDF-") {
    return { mime: "application/pdf", ext: "pdf" };
  }
  throw new AppError("Use a JPEG, PNG, WebP, or PDF under 5 MB.");
}

export function decodeProofBase64(base64: string): Uint8Array {
  const cleaned = base64.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  if (!cleaned || cleaned.length > 7_000_000) {
    throw new AppError("That file is too large.");
  }
  const buffer = Buffer.from(cleaned, "base64");
  return new Uint8Array(buffer);
}

export async function storePaymentProofFile(input: {
  businessId: string;
  orderId: string;
  bytes: Uint8Array;
}): Promise<{ storagePath: string; mime: string }> {
  const sniffed = sniffPaymentProof(input.bytes);
  const storagePath = `${input.businessId}/${input.orderId}/${randomUUID()}.${sniffed.ext}`;
  const { error } = await supabaseAdmin.storage
    .from(PAYMENT_PROOF_BUCKET)
    .upload(storagePath, input.bytes, {
      contentType: sniffed.mime,
      upsert: false,
    });
  if (error) {
    console.error("[kwetuu] payment proof upload", error);
    throw new AppError("The screenshot could not be stored. Try again.");
  }
  return { storagePath, mime: sniffed.mime };
}

export async function signedPaymentProofUrl(
  storagePath: string | null | undefined,
): Promise<string | null> {
  if (!storagePath) return null;
  const { data, error } = await supabaseAdmin.storage
    .from(PAYMENT_PROOF_BUCKET)
    .createSignedUrl(storagePath, 120);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
