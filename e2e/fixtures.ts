import { test as base } from "@playwright/test";
import path from "node:path";

const authDir = path.join(import.meta.dirname, ".auth");

type Fixtures = {
  ownerPage: ReturnType<typeof base.extend> extends infer T ? T : never;
};

export const test = base.extend<Fixtures>({
  storageState: path.join(authDir, "owner.json"),
});

export { expect } from "@playwright/test";
