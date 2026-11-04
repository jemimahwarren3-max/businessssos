import { test as base, expect, type Page } from "@playwright/test";
import path from "node:path";

const authDir = path.join(import.meta.dirname, ".auth");

type Fixtures = {
  ownerPage: ReturnType<typeof base.extend> extends infer T ? T : never;
};

export const test = base.extend<Fixtures>({
  storageState: path.join(authDir, "owner.json"),
});

export { expect };

/** AppShell page titles are h1. Empty states are h2 and must not match the same locator. */
export function pageHeading(page: Page, name: string | RegExp) {
  return page.getByRole("heading", { name, level: 1 });
}
