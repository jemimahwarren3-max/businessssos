import { describe, expect, it } from "vitest";
import { isQuickAddImageFile, quickAddImageMime } from "../src/lib/quick-add-files";

describe("isQuickAddImageFile", () => {
  it("detects image files by extension and mime", () => {
    expect(isQuickAddImageFile(new File(["x"], "note.jpg", { type: "image/jpeg" }))).toBe(true);
    expect(isQuickAddImageFile(new File(["x"], "list.PNG", { type: "" }))).toBe(true);
    expect(isQuickAddImageFile(new File(["x"], "sales.csv", { type: "text/csv" }))).toBe(false);
  });
});

describe("quickAddImageMime", () => {
  it("maps mime types for the vision API", () => {
    expect(quickAddImageMime(new File([], "a.png", { type: "image/png" }))).toBe("image/png");
    expect(quickAddImageMime(new File([], "a.jpg", { type: "image/jpeg" }))).toBe("image/jpeg");
  });
});
