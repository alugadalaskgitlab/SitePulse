import type { InsertAuditLog } from "./schema";

type AuditActor = {
  id: number;
  fullName?: string | null;
  username?: string | null;
  role?: string | null;
  businessRole?: string | null;
  isAdmin?: boolean | null;
  isOwner?: boolean | null;
};

export type AuditRequestContext = {
  authUser?: AuditActor | null;
};

export type AuditLogWriter = {
  logAudit(entry: InsertAuditLog): Promise<unknown>;
};

export type RecordChangeInput = {
  module: string;
  transactionId: number;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  stockImpact?: string | null;
};

const REASON_REQUIRED_ACTIONS = new Set(["delete", "void", "cancel"]);

/**
 * The single audit-write seam for new audited paths.
 * Callers pass complete before/after records; this helper never projects fields.
 */
export async function recordChange(
  request: AuditRequestContext,
  storage: AuditLogWriter,
  change: RecordChangeInput,
) {
  const actor = request.authUser;
  if (!actor) throw new Error("An authenticated actor is required to record a change.");
  if (!change.module.trim()) throw new Error("An audit module is required.");
  if (!Number.isSafeInteger(change.transactionId) || change.transactionId <= 0) {
    throw new Error("A valid audit record id is required.");
  }
  if (!change.action.trim()) throw new Error("An audit action is required.");

  const reason = typeof change.reason === "string" ? change.reason.trim() : "";
  if (REASON_REQUIRED_ACTIONS.has(change.action) && !reason) {
    throw new Error(`A reason is required for ${change.action}.`);
  }

  const role = actor.isOwner
    ? "owner"
    : actor.isAdmin
      ? "admin"
      : actor.role || actor.businessRole || null;

  return storage.logAudit({
    module: change.module,
    transactionId: change.transactionId,
    action: change.action,
    userId: actor.id,
    userName: actor.fullName?.trim() || actor.username?.trim() || "Unknown",
    userRole: role,
    oldValues: change.before === undefined ? null : change.before as any,
    newValues: change.after === undefined ? null : change.after as any,
    reason: reason || null,
    stockImpact: change.stockImpact ?? null,
  });
}
