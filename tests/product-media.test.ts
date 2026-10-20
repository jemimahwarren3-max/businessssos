import { describe, expect, it } from "vitest";
import { sniffProductImage } from "@/lib/product-media";

function jpegStub(size = 32) {
  const bytes = new Uint8Array(size);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  return bytes;
}

describe("product photo sniffing", () => {
  it("accepts a JPEG that matches its declared type", () => {
    expect(sniffProductImage(jpegStub(), "image/jpeg")).toBe("image/jpeg");
  });

  it("rejects a JPEG labelled as PNG and an oversized payload", () => {
    expect(sniffProductImage(jpegStub(), "image/png")).toBeNull();
    expect(sniffProductImage(jpegStub(12), "image/jpeg")).toBe("image/jpeg");
    const huge = new Uint8Array(2 * 1024 * 1024 + 1);
    huge[0] = 0xff;
    huge[1] = 0xd8;
    huge[2] = 0xff;
    expect(sniffProductImage(huge, "image/jpeg")).toBeNull();
  });
});
