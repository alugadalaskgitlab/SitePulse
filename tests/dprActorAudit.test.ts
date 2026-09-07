import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("DPR authenticated actor audit trail", () => {
  const migration = readFileSync("migrations/0024_dpr_actor_audit.sql", "utf8").trim().split("\n");
  const schema = readFileSync("shared/schema.ts", "utf8");
  const routes = readFileSync("server/routes.ts", "utf8");
  const storage = readFileSync("server/storage.ts", "utf8");
  const header = readFileSync("client/src/components/ReportHeader.tsx", "utf8");

  it("uses one additive-only migration with no guessed backfill", () => {
    expect(migration).toEqual([
      "ALTER TABLE dprs ADD COLUMN IF NOT EXISTS last_edited_by_user_id integer;",
      "ALTER TABLE dprs ADD COLUMN IF NOT EXISTS last_edited_at timestamp;",
      "ALTER TABLE dprs ADD COLUMN IF NOT EXISTS submitted_by_user_id integer;",
    ]);
    expect(migration.every(line => line.startsWith("ALTER TABLE dprs ADD COLUMN IF NOT EXISTS"))).toBe(true);
    expect(migration.join("\n")).not.toMatch(/\b(DROP|UPDATE|INSERT|DELETE|RENAME)\b/i);
    expect(schema).toContain('authorUserId: integer("author_user_id")');
    expect(schema).toContain('lastEditedByUserId: integer("last_edited_by_user_id")');
    expect(schema).toContain('lastEditedAt: timestamp("last_edited_at")');
    expect(schema).toContain('submittedByUserId: integer("submitted_by_user_id")');
  });

  it("persists only authenticated request IDs for create, draft edit, and submit", () => {
    expect(routes).toContain("storage.updateDraftDpr(id, input, req.authUser?.id ?? null)");
    expect(routes).toContain("userId: req.authUser?.id ?? null");
    expect(storage).toContain("authorUserId: audit?.userId ?? null");
    expect(storage).toContain("lastEditedByUserId: actorUserId ?? null");
    expect(storage).toContain("submittedByUserId: audit?.userId ?? null");
  });

  it("preserves creator and submission facts on submitted versions", () => {
    expect(storage).toContain("authorUserId: originalAudit?.authorUserId ?? null");
    expect(storage).toContain("submittedByUserId: originalAudit?.submittedByUserId ?? null");
    expect(storage).toContain("submittedAt: originalAudit?.submittedAt ?? dateTime");
    expect(storage).toContain("createdAt: originalAudit?.createdAt ?? undefined");
    expect(storage).toContain("lastEditedByUserId: audit?.userId ?? null");
  });

  it("resolves actual user names by stored IDs and uses a neutral legacy fallback", () => {
    expect(storage).toContain("users.fullName");
    expect(storage).toContain('actorId == null ? "User unavailable"');
    expect(header).toContain('authorName || "User unavailable"');
    expect(header).toContain('lastEditedByName || "User unavailable"');
    expect(header).toContain('submittedByName || "User unavailable"');
    expect(header).not.toContain('"Admin"');
  });

  it("shows the required lifecycle wording for draft and submitted DPRs", () => {
    expect(header).toContain("Draft created by");
    expect(header).toContain("Last edited by");
    expect(header).toContain("Submitted by");
    expect(header).toContain("—");
    expect(header).not.toContain("dprStatus === \"draft\" && createdAt");
  });
});