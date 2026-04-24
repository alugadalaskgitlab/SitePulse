// HTTP endpoints for the new SiteLog auth system (Task #229).
// All endpoints live under /api/auth/*. The estimator portal endpoints
// (/api/estimator/*) are intentionally untouched.
//
// Endpoints:
//   POST   /api/auth/login           email + password → device challenge / session
//   GET    /api/auth/me              current session / user / permissions
//   POST   /api/auth/logout          ends current session
//   GET    /api/auth/device-status   used by the pending-device screen to poll
//
//   Admin-only (gated by requireAdmin):
//   GET    /api/auth/users
//   POST   /api/auth/users           create user (sets initial password)
//   PATCH  /api/auth/users/:id
//   POST   /api/auth/users/:id/password    admin reset password
//   GET    /api/auth/users/:id/permissions
//   PUT    /api/auth/users/:id/permissions
//   POST   /api/auth/users/:id/copy-permissions  { fromUserId }
//   GET    /api/auth/devices         list all devices (filterable by status)
//   POST   /api/auth/devices/:id/approve
//   POST   /api/auth/devices/:id/revoke
//
// Locking:
//   POST   /api/auth/locks/unlock    { resourceType, resourceId, reason } — checks edit perm + canUnlockRecords

import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "./db";
import {
  userDevices,
  userSessions,
  users,
  recordUnlockLog,
  type User,
  type UserDevice,
} from "@shared/schema";
import {
  SECTION_KEYS,
  type SectionKey,
  type PermissionMatrix,
  emptyMatrix,
  fullMatrix,
  type SessionPolicy,
  LOCKABLE_RESOURCE_TYPES,
  LOCKABLE_RESOURCE_SECTION,
  type LockableResourceType,
} from "@shared/permissions";
import {
  setSessionCookie,
  clearSessionCookie,
  setDeviceCookie,
  clearDeviceCookie,
  hashPassword,
  verifyPassword,
  loadUserPermissionsMatrix,
  setUserPermissions,
  toSafeUser,
  getUserById,
  getUserByEmail,
  listAllUsers,
  createUserRow,
  updateUserPassword,
  updateUserProfile,
  ensureDeviceForUser,
  createSession,
  lookupDeviceFromCookie,
  lookupSessionFromCookie,
  logoutSessionByToken,
  describeUserAgent,
  getClientIp,
  requireAuth,
  requireAdmin,
} from "./auth";
import { eq, and, isNull, desc } from "drizzle-orm";

// Drizzle table name for each lockable resource type. Must match the
// pgTable("...") names in shared/schema.ts. Used by the unlock endpoint
// (raw SQL) and by the lock-aware helpers in routes.ts.
export const LOCKABLE_TABLE_NAMES: Record<LockableResourceType, string> = {
  dpr: "dprs",
  plant_shift_log: "plant_shift_logs",
  equipment_usage: "equipment_usage",
  purchase_indent: "purchase_indents",
  diesel_requirement: "diesel_requirements",
  vendor_bill: "vendor_bills",
};

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(1),
  isAdmin: z.boolean().optional(),
  canUnlockRecords: z.boolean().optional(),
  sessionPolicy: z.enum(["strict", "sticky"]).optional(),
});

const patchUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  isActive: z.boolean().optional(),
  isAdmin: z.boolean().optional(),
  canUnlockRecords: z.boolean().optional(),
  sessionPolicy: z.enum(["strict", "sticky"]).optional(),
});

const passwordResetSchema = z.object({
  newPassword: z.string().min(8),
});

const permissionMatrixSchema = z.record(
  z.string(),
  z.object({
    view: z.boolean().optional(),
    create: z.boolean().optional(),
    edit: z.boolean().optional(),
    view_reports: z.boolean().optional(),
  }),
);

const unlockSchema = z.object({
  resourceType: z.enum(LOCKABLE_RESOURCE_TYPES as unknown as [LockableResourceType, ...LockableResourceType[]]),
  resourceId: z.number().int().positive(),
  reason: z.string().min(10, "Reason must be at least 10 characters"),
});

export function registerAuthRoutes(app: Express) {
  // -----------------------------------------------------------------
  // Public endpoints (no auth required).
  // -----------------------------------------------------------------

  app.post("/api/auth/login", async (req, res) => {
    try {
      const input = loginSchema.parse(req.body);
      const user = await getUserByEmail(input.email);
      if (!user) return res.status(401).json({ error: "invalid_credentials" });
      if (!user.isActive) return res.status(403).json({ error: "user_inactive" });
      const ok = await verifyPassword(input.password, user.passwordHash);
      if (!ok) return res.status(401).json({ error: "invalid_credentials" });

      // Identify the requesting device (existing cookie or fresh).
      const deviceLookup = await lookupDeviceFromCookie(req.headers.cookie);
      const existingDevice =
        deviceLookup.kind === "missing" ? null
        : deviceLookup.kind === "approved" || deviceLookup.kind === "pending" || deviceLookup.kind === "revoked"
          ? deviceLookup.device
          : null;

      // Bootstrap admin (or first ever user) auto-approves their first device.
      // Admins beyond the first DO NOT auto-approve — they still need an
      // already-approved device.
      const [otherApproved] = await db.select({ id: userDevices.id }).from(userDevices)
        .where(and(eq(userDevices.userId, user.id), eq(userDevices.status, "approved"))).limit(1);
      const autoApprove = !otherApproved && user.isAdmin;

      const ua = String(req.headers["user-agent"] || "");
      const ip = getClientIp(req);
      const { device, setNewCookie } = await ensureDeviceForUser({
        userId: user.id,
        existingDevice: existingDevice && existingDevice.userId === user.id ? existingDevice : null,
        deviceLabel: describeUserAgent(ua),
        userAgent: ua,
        ipAddress: ip,
        autoApprove,
      });

      if (setNewCookie) setDeviceCookie(res, device.deviceToken);

      if (device.status === "pending") {
        return res.status(202).json({
          status: "device_pending",
          deviceLabel: device.deviceLabel,
          user: { email: user.email, fullName: user.fullName },
        });
      }
      if (device.status === "revoked") {
        return res.status(403).json({ status: "device_revoked", deviceLabel: device.deviceLabel });
      }

      // Approved → mint a session.
      const { token } = await createSession({ userId: user.id, deviceId: device.id });
      setSessionCookie(res, token);

      const matrix = await loadUserPermissionsMatrix(user.id);
      res.json({
        status: "ok",
        user: toSafeUser(user),
        permissions: matrix,
        device: { id: device.id, label: device.deviceLabel, status: device.status },
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "invalid_request", details: err.errors });
      }
      console.error("[/api/auth/login]", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      const sess = await lookupSessionFromCookie(req.headers.cookie);
      if (sess.kind !== "ok") {
        const reason =
          sess.kind === "expired" ? "session_expired"
          : sess.kind === "logged_out" ? "logged_out"
          : sess.kind === "device_revoked" ? "device_revoked"
          : sess.kind === "user_inactive" ? "user_inactive"
          : "not_authenticated";
        return res.status(401).json({ error: reason });
      }
      const matrix = await loadUserPermissionsMatrix(sess.user.id);
      res.json({
        user: toSafeUser(sess.user),
        permissions: matrix,
      });
    } catch (err) {
      console.error("[/api/auth/me]", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    try {
      await logoutSessionByToken(req.headers.cookie);
      clearSessionCookie(res);
      res.json({ ok: true });
    } catch (err) {
      console.error("[/api/auth/logout]", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  // Polled by the "device pending" screen so it can navigate away once the
  // admin approves it. Returns the current device state (no session needed).
  app.get("/api/auth/device-status", async (req, res) => {
    const lookup = await lookupDeviceFromCookie(req.headers.cookie);
    if (lookup.kind === "missing") return res.json({ status: "none" });
    res.json({
      status: lookup.device.status,
      deviceLabel: lookup.device.deviceLabel,
    });
  });

  // -----------------------------------------------------------------
  // Authenticated endpoints (admin-only user/device management).
  // -----------------------------------------------------------------

  app.get("/api/auth/users", requireAuth, requireAdmin, async (_req, res) => {
    const list = await listAllUsers();
    res.json(list);
  });

  app.post("/api/auth/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const input = createUserSchema.parse(req.body);
      const existing = await getUserByEmail(input.email);
      if (existing) return res.status(409).json({ error: "email_exists" });
      const u = await createUserRow(input);
      // Initialize an empty permission set for the new user (admins skip).
      if (!u.isAdmin) await setUserPermissions(u.id, emptyMatrix());
      else await setUserPermissions(u.id, fullMatrix());
      res.status(201).json(toSafeUser(u));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "invalid_request", details: err.errors });
      console.error("[POST /api/auth/users]", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.patch("/api/auth/users/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = patchUserSchema.parse(req.body);
      // Don't let an admin demote / disable the last remaining admin.
      if (input.isAdmin === false || input.isActive === false) {
        const target = await getUserById(id);
        if (target?.isAdmin) {
          const [otherAdmin] = await db.select({ id: users.id }).from(users)
            .where(and(eq(users.isAdmin, true), eq(users.isActive, true)))
            .limit(2);
          // Only allow if there's another active admin besides this one.
          const activeAdmins = await db.select({ id: users.id }).from(users)
            .where(and(eq(users.isAdmin, true), eq(users.isActive, true)));
          if (activeAdmins.length <= 1 && activeAdmins[0]?.id === id) {
            return res.status(409).json({ error: "cannot_demote_last_admin" });
          }
        }
      }
      const updated = await updateUserProfile(id, input);
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json(toSafeUser(updated));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "invalid_request", details: err.errors });
      console.error("[PATCH /api/auth/users/:id]", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/auth/users/:id/password", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = passwordResetSchema.parse(req.body);
      const u = await getUserById(id);
      if (!u) return res.status(404).json({ error: "not_found" });
      await updateUserPassword(id, input.newPassword);
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "invalid_request", details: err.errors });
      console.error("[POST /api/auth/users/:id/password]", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/api/auth/users/:id/permissions", requireAuth, requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const u = await getUserById(id);
    if (!u) return res.status(404).json({ error: "not_found" });
    const matrix = await loadUserPermissionsMatrix(id);
    res.json({ matrix, isAdmin: u.isAdmin });
  });

  app.put("/api/auth/users/:id/permissions", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const u = await getUserById(id);
      if (!u) return res.status(404).json({ error: "not_found" });
      const parsed = permissionMatrixSchema.parse(req.body);
      // Coerce into a full matrix (only known sections) with defaults.
      const matrix: PermissionMatrix = emptyMatrix();
      for (const k of SECTION_KEYS) {
        const val = parsed[k];
        matrix[k] = {
          view: !!val?.view,
          create: !!val?.create,
          edit: !!val?.edit,
          view_reports: !!val?.view_reports,
        };
      }
      await setUserPermissions(id, matrix);
      res.json({ ok: true, matrix });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "invalid_request", details: err.errors });
      console.error("[PUT /api/auth/users/:id/permissions]", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/auth/users/:id/copy-permissions", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const fromUserId = Number(req.body?.fromUserId);
      if (!fromUserId || Number.isNaN(fromUserId)) return res.status(400).json({ error: "invalid_request" });
      if (fromUserId === id) return res.status(400).json({ error: "cannot_copy_from_self" });
      const target = await getUserById(id);
      const source = await getUserById(fromUserId);
      if (!target || !source) return res.status(404).json({ error: "not_found" });
      const matrix = await loadUserPermissionsMatrix(fromUserId);
      await setUserPermissions(id, matrix);
      res.json({ ok: true, matrix });
    } catch (err) {
      console.error("[copy-permissions]", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/api/auth/devices", requireAuth, requireAdmin, async (req, res) => {
    const status = String(req.query.status || "").trim();
    const all = await db.select().from(userDevices).orderBy(desc(userDevices.requestedAt));
    const filtered = status ? all.filter((d) => d.status === status) : all;
    // Attach user emails / names for the admin device list view.
    const allUsers = await db.select().from(users);
    const userById = new Map(allUsers.map((u) => [u.id, { email: u.email, fullName: u.fullName }]));
    res.json(filtered.map((d) => ({
      id: d.id,
      userId: d.userId,
      userEmail: userById.get(d.userId)?.email ?? null,
      userName: userById.get(d.userId)?.fullName ?? null,
      deviceLabel: d.deviceLabel,
      userAgent: d.userAgent,
      ipAddress: d.ipAddress,
      status: d.status,
      requestedAt: d.requestedAt,
      approvedAt: d.approvedAt,
      revokedAt: d.revokedAt,
      lastSeenAt: d.lastSeenAt,
    })));
  });

  app.post("/api/auth/devices/:id/approve", requireAuth, requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const [updated] = await db.update(userDevices).set({
      status: "approved",
      approvedAt: new Date(),
      approvedByUserId: req.authUser!.id,
      revokedAt: null,
      revokedByUserId: null,
    }).where(eq(userDevices.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  });

  app.post("/api/auth/devices/:id/revoke", requireAuth, requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const [updated] = await db.update(userDevices).set({
      status: "revoked",
      revokedAt: new Date(),
      revokedByUserId: req.authUser!.id,
    }).where(eq(userDevices.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "not_found" });
    // End any active sessions for that device.
    await db.update(userSessions).set({ loggedOutAt: new Date() })
      .where(and(eq(userSessions.deviceId, id), isNull(userSessions.loggedOutAt)));
    res.json({ ok: true });
  });

  // -----------------------------------------------------------------
  // Record unlock — requires edit on the section + canUnlockRecords.
  // The next save through the regular update endpoint will atomically
  // re-lock the row (handled in routes.ts by the lock-aware update wrappers).
  // -----------------------------------------------------------------

  app.post("/api/auth/locks/unlock", requireAuth, async (req, res) => {
    try {
      const input = unlockSchema.parse(req.body);
      const u = req.authUser!;
      const matrix = req.authPermissions!;
      const section = LOCKABLE_RESOURCE_SECTION[input.resourceType];
      const hasEdit = u.isAdmin || (matrix[section]?.edit === true);
      if (!hasEdit) return res.status(403).json({ error: "forbidden_section" });
      if (!u.canUnlockRecords && !u.isAdmin) return res.status(403).json({ error: "unlock_not_allowed" });

      // Update the row using parameterized raw SQL via the pg pool
      // (drizzle's typed updates would require dispatching per-table).
      const tableName = LOCKABLE_TABLE_NAMES[input.resourceType];
      const { pool } = await import("./db");
      const result = await pool.query(
        `UPDATE ${tableName}
            SET lock_status = 'unlocked',
                unlocked_by_user_id = $1,
                unlocked_at = NOW(),
                unlock_reason = $2
          WHERE id = $3
          RETURNING id`,
        [u.id, input.reason, input.resourceId],
      );
      if (result.rowCount === 0) return res.status(404).json({ error: "not_found" });

      await db.insert(recordUnlockLog).values({
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        unlockedByUserId: u.id,
        unlockReason: input.reason,
      });
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "invalid_request", details: err.errors });
      console.error("[POST /api/auth/locks/unlock]", err);
      res.status(500).json({ error: "server_error" });
    }
  });
}

// =================================================================
// Helpers reused by routes.ts when migrating verifyPin sites.
// =================================================================

export function assertAuthed(req: Request, res: Response): User | null {
  if (!req.authUser) {
    res.status(401).json({ error: "not_authenticated" });
    return null;
  }
  return req.authUser;
}

export function assertAdmin(req: Request, res: Response): boolean {
  if (!req.authUser) {
    res.status(401).json({ error: "not_authenticated" });
    return false;
  }
  if (!req.authUser.isAdmin) {
    res.status(403).json({ error: "admin_required" });
    return false;
  }
  return true;
}

export function assertEdit(req: Request, res: Response, section: SectionKey): boolean {
  if (!req.authUser) {
    res.status(401).json({ error: "not_authenticated" });
    return false;
  }
  if (req.authUser.isAdmin) return true;
  const m = req.authPermissions;
  if (!m || !m[section] || !m[section].edit) {
    res.status(403).json({ error: "forbidden", section, action: "edit" });
    return false;
  }
  return true;
}

export function currentUserName(req: Request): string {
  return req.authUser?.fullName || "Unknown";
}

// Atomically re-lock a record after a successful save. Called by the
// lock-aware update wrappers in routes.ts.
export async function relockResource(
  resourceType: LockableResourceType,
  resourceId: number,
  authorUserId: number,
): Promise<void> {
  const tableName = LOCKABLE_TABLE_NAMES[resourceType];
  const { pool } = await import("./db");
  await pool.query(
    `UPDATE ${tableName}
        SET lock_status = 'locked',
            unlocked_by_user_id = NULL,
            unlocked_at = NULL,
            unlock_reason = NULL,
            author_user_id = COALESCE(author_user_id, $1)
      WHERE id = $2`,
    [authorUserId, resourceId],
  );
  // Also stamp the unlock log entry with relockedAt so the audit shows
  // when the one-time unlock was consumed.
  await pool.query(
    `UPDATE record_unlock_log
        SET relocked_at = NOW()
      WHERE resource_type = $1 AND resource_id = $2 AND relocked_at IS NULL`,
    [resourceType, resourceId],
  );
}

// Throws a 423 (Locked) if the row is currently locked. Caller should
// catch and translate into a JSON response. Returns true if writable.
export async function assertWritable(
  res: Response,
  resourceType: LockableResourceType,
  resourceId: number,
): Promise<boolean> {
  const tableName = LOCKABLE_TABLE_NAMES[resourceType];
  const { pool } = await import("./db");
  const r = await pool.query(`SELECT lock_status FROM ${tableName} WHERE id = $1`, [resourceId]);
  if (r.rowCount === 0) {
    res.status(404).json({ error: "not_found" });
    return false;
  }
  const status = r.rows[0]?.lock_status;
  if (status === "locked") {
    res.status(423).json({ error: "record_locked", resourceType, resourceId });
    return false;
  }
  return true;
}
