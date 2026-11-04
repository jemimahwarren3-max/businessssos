import { describe, expect, it } from "vitest";
import { friendlyDate, friendlyDateTime } from "@/lib/format";

describe("friendlyDate", () => {
  it("formats a date string", () => {
    expect(friendlyDate("2024-06-15T00:00:00Z")).toBe("Jun 15, 2024");
  });

  it("formats a Date object", () => {
    expect(friendlyDate(new Date("2024-01-01T00:00:00Z"))).toBe("Jan 1, 2024");
  });
});

describe("friendlyDateTime", () => {
  it("includes weekday, date and time", () => {
    const result = friendlyDateTime("2024-06-15T10:30:00Z", "Africa/Harare");
    expect(result).toMatch(/Sat/);
    expect(result).toMatch(/15/);
    expect(result).toMatch(/Jun/);
    expect(result).toMatch(/12:30/);
  });
});
