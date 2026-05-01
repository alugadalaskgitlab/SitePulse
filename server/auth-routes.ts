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

import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "./db";
import { storage } from "./storage";
import {
  userDevices,
  userSessions,
  users,
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
} from "@shared/permissions";
import {
  setSessionCookie,
  clearSessionCookie,
  setDeviceCookie,
  clearDeviceCookie,
  hashPassword,
  verifyPassword,
  signToken,
  verifySignedToken,
  loadUserPermissionsMatrix,
  setUserPermissions,
  toSafeUser,
  getUserById,
  getUserByEmail,
  getUserByPhone,
  getUserByIdentifier,
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

// Task #280 — identifier accepts either an email address or a phone number.
const loginSchema = z.object({
  identifier: z.string().min(1, "Enter your email or phone number"),
  password: z.string().min(1),
});

const createUserSchema = z.object({
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(1),
  isAdmin: z.boolean().optional(),
  notificationsEnabled: z.boolean().optional(),
  sessionPolicy: z.enum(["strict", "sticky"]).optional(),
}).superRefine((d, ctx) => {
  const hasEmail = !!d.email && d.email.trim().length > 0;
  const hasPhone = !!d.phone && d.phone.trim().length > 0;
  if (!hasEmail && !hasPhone) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At least one of email or phone is required", path: ["email"] });
  }
});

const patchUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  isAdmin: z.boolean().optional(),
  notificationsEnabled: z.boolean().optional(),
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
    delete: z.boolean().optional(),
    view_reports: z.boolean().optional(),
    export: z.boolean().optional(),
  }),
);


export function registerAuthRoutes(app: Express) {
  // -----------------------------------------------------------------
  // Public endpoints (no auth required).
  // -----------------------------------------------------------------

  app.post("/api/auth/login", async (req, res) => {
    try {
      const input = loginSchema.parse(req.body);
      const user = await getUserByIdentifier(input.identifier);
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

      // Auto-approve is reserved for the genuine bootstrap recovery path:
      // ONLY when (a) the user signing in matches BOOTSTRAP_ADMIN_EMAIL,
      // AND (b) there is not a single approved device anywhere in the
      // system yet. Any other admin must wait for an existing admin to
      // approve their device. This closes the prior security hole where
      // every admin could self-approve their first device.
      const bootstrapEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
      const isBootstrapUser = !!bootstrapEmail && !!user.email && user.email.toLowerCase() === bootstrapEmail;
      let autoApprove = false;
      if (isBootstrapUser && user.isAdmin) {
        const [anyApproved] = await db.select({ id: userDevices.id }).from(userDevices)
          .where(eq(userDevices.status, "approved")).limit(1);
        autoApprove = !anyApproved;
      }

      const ua = String(req.headers["user-agent"] || "");
      const ip = getClientIp(req);
      // Pass the raw cookie device (regardless of which user it belongs to).
      // ensureDeviceForUser uses the presence of *any* cookie as proof that
      // this is a previously-used browser, which is required to safely reuse
      // an existing approved device by user-agent (see auth.ts step 2 for
      // the security rationale).
      const { device, setNewCookie } = await ensureDeviceForUser({
        userId: user.id,
        existingDevice,
        deviceLabel: describeUserAgent(ua),
        userAgent: ua,
        ipAddress: ip,
        autoApprove,
      });

      // Cross-user safety: if the browser already had an APPROVED device
      // cookie for some OTHER user, do NOT rotate that cookie just because
      // we minted (or reused) a pending device for the new login. Rotating
      // in that case strands the original user (their cookie now points at
      // a pending device they can't approve from a logged-out state).
      // Instead, hand the pending device's signed token back in the body.
      // The client uses it to poll device-status and to claim the device
      // once an admin approves it; only at that point does the cookie
      // rotate.
      //
      // ensureDeviceForUser already prefers an existing approved device for
      // (userId, userAgent) on this browser, so the device returned here may
      // be approved even though the cookie still points at a different user.
      // In that case device.status === "approved", the condition below is
      // false, the cookie rotates to the user's own approved device, and the
      // user logs straight in — no pending screen, no approval loop.
      const preserveExistingCookie =
        setNewCookie &&
        device.status === "pending" &&
        deviceLookup.kind === "approved" &&
        deviceLookup.device.userId !== user.id;

      if (setNewCookie && !preserveExistingCookie) {
        setDeviceCookie(res, device.deviceToken);
      }

      if (device.status === "pending") {
        return res.status(202).json({
          status: "device_pending",
          deviceLabel: device.deviceLabel,
          user: { email: user.email, fullName: user.fullName },
          // Only present when we suppressed the cookie rotation. The client
          // uses this token to poll for approval and to claim the device
          // without overwriting the existing approved-user cookie.
          pendingDeviceToken: preserveExistingCookie ? signToken(device.deviceToken) : undefined,
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

  // Session info — both /api/auth/me and the spec-named /api/auth/session
  // resolve to the same handler so older callers and the documented
  // contract both work. Returns 401 with a reason string if the session
  // is invalid; the client uses that reason to drive the idle/revoked UX.
  const sessionHandler = async (req: import("express").Request, res: import("express").Response) => {
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
      console.error("[/api/auth/session]", err);
      res.status(500).json({ error: "server_error" });
    }
  };
  app.get("/api/auth/me", sessionHandler);
  app.get("/api/auth/session", sessionHandler);

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
  // Accepts an optional ?token=<signed> query param so the cross-user login
  // flow (which deliberately does NOT rotate the device cookie) can poll the
  // status of the freshly-minted pending device without disturbing the
  // existing approved-user cookie.
  app.get("/api/auth/device-status", async (req, res) => {
    const tokenParam = typeof req.query.token === "string" ? req.query.token : undefined;
    if (tokenParam) {
      const raw = verifySignedToken(tokenParam);
      if (!raw) return res.json({ status: "none" });
      const [device] = await db.select().from(userDevices).where(eq(userDevices.deviceToken, raw));
      if (!device) return res.json({ status: "none" });
      return res.json({ status: device.status, deviceLabel: device.deviceLabel });
    }
    const lookup = await lookupDeviceFromCookie(req.headers.cookie);
    if (lookup.kind === "missing") return res.json({ status: "none" });
    res.json({
      status: lookup.device.status,
      deviceLabel: lookup.device.deviceLabel,
    });
  });

  // Companion to the above. After polling sees the device move to "approved",
  // the client posts the same signed token here. We verify the device really
  // is approved, mint a session, rotate the device + session cookies to the
  // newly-approved device, and return the standard logged-in payload. This
  // is the ONLY moment in the cross-user flow where we overwrite the
  // existing approved-user device cookie — and only after admin approval.
  app.post("/api/auth/claim-device", async (req, res) => {
    try {
      const tokenParam = typeof req.body?.token === "string" ? req.body.token : "";
      const raw = verifySignedToken(tokenParam);
      if (!raw) return res.status(400).json({ error: "invalid_token" });
      const [device] = await db.select().from(userDevices).where(eq(userDevices.deviceToken, raw));
      if (!device) return res.status(404).json({ error: "device_not_found" });
      if (device.status === "revoked") {
        return res.status(403).json({ status: "device_revoked", deviceLabel: device.deviceLabel });
      }
      if (device.status !== "approved") {
        return res.status(202).json({ status: "device_pending", deviceLabel: device.deviceLabel });
      }
      const u = await getUserById(device.userId);
      if (!u) return res.status(404).json({ error: "user_not_found" });
      if (!u.isActive) return res.status(403).json({ error: "user_inactive" });

      setDeviceCookie(res, device.deviceToken);
      const { token } = await createSession({ userId: u.id, deviceId: device.id });
      setSessionCookie(res, token);

      const matrix = await loadUserPermissionsMatrix(u.id);
      res.json({
        status: "ok",
        user: toSafeUser(u),
        permissions: matrix,
        device: { id: device.id, label: device.deviceLabel, status: device.status },
      });
    } catch (err) {
      console.error("[/api/auth/claim-device]", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  // -----------------------------------------------------------------
  // Authenticated endpoints (admin-only user/device management).
  // -----------------------------------------------------------------

  // Matrix-based gates. The "user_management" / "device_approval" sections
  // are first-class entries in the permission matrix. A user with isAdmin=true
  // automatically has every section ticked, so admins always pass; non-admins
  // only get in if the matrix grants the action explicitly. This is the
  // "no roles, pure per-user matrix" requirement from Task #229.
  const requireUserMgmt = (action: "view" | "create" | "edit") =>
    (req: Request, res: Response, next: NextFunction) => {
      if (!req.authUser) return res.status(401).json({ error: "not_authenticated" });
      if (req.authUser.isAdmin) return next();
      const m = req.authPermissions;
      if (m && m["user_management"] && m["user_management"][action]) return next();
      return res.status(403).json({ error: "forbidden", section: "user_management", action });
    };
  const requireDeviceMgmt = (action: "view" | "edit") =>
    (req: Request, res: Response, next: NextFunction) => {
      if (!req.authUser) return res.status(401).json({ error: "not_authenticated" });
      if (req.authUser.isAdmin) return next();
      const m = req.authPermissions;
      if (m && m["device_approval"] && m["device_approval"][action]) return next();
      return res.status(403).json({ error: "forbidden", section: "device_approval", action });
    };

  app.get("/api/auth/users", requireAuth, requireUserMgmt("view"), async (_req, res) => {
    const list = await listAllUsers();
    res.json(list);
  });

  // Lightweight {id, fullName} list available to any authenticated user.
  // Names of co-workers who saved a record aren't sensitive — they're
  // already shown elsewhere in the UI (e.g. "Last saved by <name>").
  app.get("/api/auth/users/basic", requireAuth, async (_req, res) => {
    try {
      const list = await listAllUsers();
      res.json(list.map((u) => ({ id: u.id, fullName: u.fullName })));
    } catch (err) {
      console.error("[GET /api/auth/users/basic]", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/auth/users", requireAuth, requireUserMgmt("create"), async (req, res) => {
    try {
      const input = createUserSchema.parse(req.body);
      // Check uniqueness for email and phone separately.
      if (input.email) {
        const existing = await getUserByEmail(input.email);
        if (existing) return res.status(409).json({ error: "email_exists" });
      }
      if (input.phone) {
        const existingPhone = await getUserByPhone(input.phone);
        if (existingPhone) return res.status(409).json({ error: "phone_exists" });
      }
      const u = await createUserRow({
        ...input,
        email: input.email || null,
        phone: input.phone || null,
      });
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

  app.patch("/api/auth/users/:id", requireAuth, requireUserMgmt("edit"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = patchUserSchema.parse(req.body);

      // Load the current user record so we can enforce invariants.
      const current = await getUserById(id);
      if (!current) return res.status(404).json({ error: "not_found" });

      // Guard: at least one of email/phone must remain set after the patch.
      // `undefined` means "no change"; `null` / empty string means "clear".
      const resultEmail = input.email !== undefined
        ? (input.email || null)
        : current.email;
      const resultPhone = input.phone !== undefined
        ? (input.phone || null)
        : current.phone;
      if (!resultEmail && !resultPhone) {
        return res.status(400).json({ error: "at_least_one_contact_required", message: "User must have at least one of email or phone." });
      }

      // Pre-flight uniqueness checks to return 409 instead of a raw DB error.
      if (input.email && input.email !== current.email) {
        const conflict = await getUserByEmail(input.email);
        if (conflict && conflict.id !== id) return res.status(409).json({ error: "email_exists" });
      }
      if (input.phone && input.phone !== current.phone) {
        const conflict = await getUserByPhone(input.phone);
        if (conflict && conflict.id !== id) return res.status(409).json({ error: "phone_exists" });
      }

      // Don't let an admin demote / disable the last remaining admin.
      if (input.isAdmin === false || input.isActive === false) {
        if (current.isAdmin) {
          const activeAdmins = await db.select({ id: users.id }).from(users)
            .where(and(eq(users.isAdmin, true), eq(users.isActive, true)));
          if (activeAdmins.length <= 1 && activeAdmins[0]?.id === id) {
            return res.status(409).json({ error: "cannot_demote_last_admin" });
          }
        }
      }
      const updated = await updateUserProfile(id, input);
      if (!updated) return res.status(404).json({ error: "not_found" });

      // When notifications are explicitly turned off, delete all push
      // subscriptions for this user so stale rows don't silently re-activate
      // if the flag is later re-enabled. The user must subscribe again.
      if (input.notificationsEnabled === false && current.notificationsEnabled === true) {
        await storage.deletePushSubscriptionsByUserId(id).catch((e) =>
          console.error("[PATCH /api/auth/users/:id] push cleanup error:", e),
        );
      }

      res.json(toSafeUser(updated));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "invalid_request", details: err.errors });
      console.error("[PATCH /api/auth/users/:id]", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/auth/users/:id/password", requireAuth, requireUserMgmt("edit"), async (req, res) => {
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

  app.get("/api/auth/users/:id/permissions", requireAuth, requireUserMgmt("view"), async (req, res) => {
    const id = Number(req.params.id);
    const u = await getUserById(id);
    if (!u) return res.status(404).json({ error: "not_found" });
    const matrix = await loadUserPermissionsMatrix(id);
    res.json({ matrix, isAdmin: u.isAdmin });
  });

  app.put("/api/auth/users/:id/permissions", requireAuth, requireUserMgmt("edit"), async (req, res) => {
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
          delete: !!val?.delete,
          view_reports: !!val?.view_reports,
          export: !!val?.export,
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

  app.post("/api/auth/users/:id/copy-permissions", requireAuth, requireUserMgmt("edit"), async (req, res) => {
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

  app.get("/api/auth/devices", requireAuth, requireDeviceMgmt("view"), async (req, res) => {
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

  app.post("/api/auth/devices/:id/approve", requireAuth, requireDeviceMgmt("edit"), async (req, res) => {
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

  app.post("/api/auth/devices/:id/revoke", requireAuth, requireDeviceMgmt("edit"), async (req, res) => {
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

}

// =================================================================
// Auth helpers used by routes.ts for session-based access control.
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

export function assertCreate(req: Request, res: Response, section: SectionKey): boolean {
  if (!req.authUser) {
    res.status(401).json({ error: "not_authenticated" });
    return false;
  }
  if (req.authUser.isAdmin) return true;
  const m = req.authPermissions;
  if (!m || !m[section] || !m[section].create) {
    res.status(403).json({ error: "forbidden", section, action: "create" });
    return false;
  }
  return true;
}

export function assertView(req: Request, res: Response, section: SectionKey): boolean {
  if (!req.authUser) {
    res.status(401).json({ error: "not_authenticated" });
    return false;
  }
  if (req.authUser.isAdmin) return true;
  const m = req.authPermissions;
  if (!m || !m[section] || !m[section].view) {
    res.status(403).json({ error: "forbidden", section, action: "view" });
    return false;
  }
  return true;
}

export function currentUserName(req: Request): string {
  return req.authUser?.fullName || "Unknown";
}

