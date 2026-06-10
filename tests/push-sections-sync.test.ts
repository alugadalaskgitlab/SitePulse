import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { PUSH_ACTIVE_SECTIONS } from "../shared/permissions";

/**
 * Static-analysis guard: every section key passed to sendPushToSection() in
 * server/routes.ts must be listed in PUSH_ACTIVE_SECTIONS (shared/permissions.ts).
 *
 * If this test fails after adding a new push call, add the section key to
 * PUSH_ACTIVE_SECTIONS so the notification-preferences page shows it to users.
 */
describe("PUSH_ACTIVE_SECTIONS coverage", () => {
  it("contains every section key used in sendPushToSection() calls in server/routes.ts", () => {
    const routesPath = resolve(__dirname, "../server/routes.ts");
    const source = readFileSync(routesPath, "utf-8");

    // Match sendPushToSection("some_key", ...) — capture the first string argument.
    const pattern = /sendPushToSection\(\s*"([^"]+)"/g;
    const keysInRoutes = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(source)) !== null) {
      keysInRoutes.add(match[1]);
    }

    expect(keysInRoutes.size).toBeGreaterThan(0);

    const missing = [...keysInRoutes].filter(
      (key) => !PUSH_ACTIVE_SECTIONS.has(key as never)
    );

    expect(
      missing,
      `The following section keys appear in sendPushToSection() calls but are missing from PUSH_ACTIVE_SECTIONS in shared/permissions.ts:\n  ${missing.join("\n  ")}\n\nAdd them to PUSH_ACTIVE_SECTIONS so users can subscribe to those alerts.`
    ).toEqual([]);
  });
});
