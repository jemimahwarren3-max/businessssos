import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

const SECURITY_DOCS = [
  "SECURITY_AUDIT.md",
  "THREAT_MODEL.md",
  "SECURITY_ARCHITECTURE.md",
  "ACCESS_CONTROL_MATRIX.md",
  "INCIDENT_RESPONSE.md",
  "BACKUP_AND_RECOVERY.md",
  "DEPENDENCY_SECURITY.md",
  "SECURITY_TEST_PLAN.md",
  "SECURITY_REMEDIATION_LOG.md",
  "PRODUCTION_SECURITY_CHECKLIST.md",
  "SECURITY_STATUS.md",
];

describe("security documentation programme", () => {
  it("includes the required docs/security files", () => {
    for (const name of SECURITY_DOCS) {
      expect(existsSync(join(process.cwd(), "docs/security", name))).toBe(true);
    }
  });
});
