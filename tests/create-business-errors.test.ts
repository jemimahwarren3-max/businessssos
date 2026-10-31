import { describe, expect, it } from "vitest";
import { userFacingDbMessage } from "@/lib/business.server";
import { readableError } from "@/lib/format";

describe("userFacingDbMessage", () => {
  it("passes through PostgREST-remapped name collisions", () => {
    expect(
      userFacingDbMessage({
        code: "P0001",
        message: "That business name is already taken. Please choose another.",
      }),
    ).toBe("That business name is already taken. Please choose another.");
  });

  it("strips ERROR: prefixes and context lines from B0001 text", () => {
    expect(
      userFacingDbMessage({
        code: "B0001",
        message:
          "ERROR: That business name is already taken. Please choose another.\nCONTEXT: PL/pgSQL function create_business_with_owner",
      }),
    ).toBe("That business name is already taken. Please choose another.");
  });

  it("surfaces signed-in B0002 errors", () => {
    expect(
      userFacingDbMessage({
        code: "B0002",
        message: "You must be signed in to create a business.",
      }),
    ).toBe("You must be signed in to create a business.");
  });

  it("does not leak raw Postgres internals", () => {
    expect(
      userFacingDbMessage({
        code: "42P01",
        message: 'relation "secret_table" does not exist',
      }),
    ).toBe("Something went wrong saving your data. Please try again.");
  });

  it("explains a stale schema cache", () => {
    expect(
      userFacingDbMessage({
        code: "PGRST202",
        message:
          "Could not find the function public.create_business_with_owner in the schema cache",
      }),
    ).toBe("Shop setup is out of date. Wait a minute and try again.");
  });
});

describe("readableError", () => {
  it("shows a real create-shop message instead of the generic toast", () => {
    expect(
      readableError(
        new Error("That business name is already taken. Please choose another."),
        "We couldn't create your business.",
      ),
    ).toBe("That business name is already taken. Please choose another.");
  });

  it("still hides seroval and undefined-rest failures", () => {
    expect(
      readableError(new Error("Cannot read properties of undefined (reading 'rest')"), "fallback"),
    ).toBe("fallback");
  });

  it("does not hide messages that merely start with a bracket", () => {
    expect(readableError(new Error("[beta] shop is ready"), "fallback")).toBe(
      "[beta] shop is ready",
    );
  });
});
