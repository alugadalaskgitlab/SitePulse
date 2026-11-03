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
  roles,
  userRoles,
  userTickChanges,
  roleTicks,
  userPermissions,
  userSiteAccess,
  type User,
  type UserDevice,
} from "@shared/schema";
import {
  SECTION_KEYS,
  type SectionKey,
  type PermissionMatrix,
  emptyMatrix,
  fullMatrix,
  applyRoleTemplate,
  ROLE_TEMPLATES,
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
import { canLegacySection } from "@shared/featureAccess";
import {
  computePersonalChangesForLegacy,
  getRoleSetupPreview,
  getRolesWithTicks,
  loadFeatureAccessState,
  markRolesConfigured,
  removeRole,
  renameRole,
  saveRoleFeatureTicks,
  saveUserFeatureAccess,
  seedDefaultRoles,
} from "./featureAccess";
import { FEATURES, FEATURE_ACTIONS, ROLE_NAMES, SUGGESTED_NEW_ROW_ROLE_TICKS, can as canFeature, type EntryScope, type FeatureAction, type FeatureId, type FeatureTicks, type PersonalTickChanges } from "@shared/featureAccess";
import { eq, and, isNull, desc } from "drizzle-orm";

// Task #280 — identifier accepts either an email address or a phone number.
const loginSchema = z.object({
  identifier: z.string().min(1, "Enter your email or phone number"),
  password: z.string().min(1),
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
    approve: z.boolean().optional(),
    notify: z.boolean().optional(),
  }),
);

const businessRoleSchema = z.string().refine(
  value => value === "administrator" || value === "custom" || ROLE_TEMPLATES.some(role => role.id === value),
  "Unknown business role",
).nullable();
const reviewedPermissionsSchema = z.object({
  matrix: permissionMatrixSchema,
  businessRole: businessRoleSchema.optional(),
}).strict();

// Guided-creation extension: role template + explicit site access are applied
// in the SAME request so a new account is never silently left half-configured.
const siteAccessChoiceSchema = z.object({
  mode: z.enum(["all", "selected", "none"]),
  siteIds: z.array(z.number().int().positive()).optional(),
});

const createUserSchema = z.object({
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(1),
  isAdmin: z.boolean().optional(),
  isOwner: z.boolean().optional(),
  isFieldEngineer: z.boolean().optional(),
  notificationsEnabled: z.boolean().optional(),
  sessionPolicy: z.enum(["strict", "sticky"]).optional(),
  isActive: z.boolean().optional(),
  // Guided flow (all optional — the legacy bare create still works)
  roleTemplate: z.string().optional(),
  permissions: permissionMatrixSchema.optional(),
  siteAccess: siteAccessChoiceSchema.optional(),
  roleIds: z.array(z.number().int().positive()).optional(),
  reportsToUserId: z.number().int().positive().nullable().optional(),
  entryScope: z.enum(["own", "team", "all"]).optional(),
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
  isOwner: z.boolean().optional(),
  isFieldEngineer: z.boolean().optional(),
  notificationsEnabled: z.boolean().optional(),
  sessionPolicy: z.enum(["strict", "sticky"]).optional(),
  canManagePermissions: z.boolean().optional(),
  permissionManagerScope: z.enum(["full", "partial"]).optional(),
  reportsToUserId: z.number().int().positive().nullable().optional(),
  entryScope: z.enum(["own", "team", "all"]).optional(),
});

const passwordResetSchema = z.object({
  newPassword: z.string().min(8),
});

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
        featureAccess: await loadFeatureAccessState(user.id, matrix),
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
        featureAccess: await loadFeatureAccessState(sess.user.id, matrix),
      });
    } catch (err) {
      console.error("[/api/auth/session]", err);
      res.status(500).json({ error: "server_error" });
    }
  };
  app.get("/api/auth/me", sessionHandler);
  app.get("/api/auth/session", sessionHandler);

  // Self-service: any authenticated user may update their own display name.
  app.patch("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser!;
      const input = z.object({ fullName: z.string().min(1, "Name cannot be empty") }).parse(req.body);
      const updated = await updateUserProfile(actor.id, { fullName: input.fullName });
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json({ ok: true, fullName: updated.fullName });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "invalid_request", details: err.errors });
      console.error("[PATCH /api/auth/me]", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  // Self-service: any authenticated user may update only their own notify flags,
  // but only for sections where they already have view or create access.
  // All other permission bits and out-of-scope sections are left untouched.
  app.put("/api/auth/me/notify-preferences", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser!;
      const notifyPatch = z.record(z.string(), z.boolean()).parse(req.body);
      const matrix = await loadUserPermissionsMatrix(actor.id);
      for (const k of SECTION_KEYS) {
        if (!(k in notifyPatch)) continue;
        const row = matrix[k];
        // Admins may toggle any section; others only where they have view or create.
        const eligible = actor.isAdmin || (row.view || row.create);
        if (!eligible) continue;
        matrix[k] = { ...row, notify: !!notifyPatch[k] };
      }
      await setUserPermissions(actor.id, matrix);
      res.json({ ok: true, matrix });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "invalid_request", details: err.errors });
      console.error("[PUT /api/auth/me/notify-preferences]", err);
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
        featureAccess: await loadFeatureAccessState(u.id, matrix),
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

  // User management is gated by the same feature/action resolver as ordinary
  // pages and APIs. Admin account status is not a post-setup permission grant.
  const requireUserMgmt = (action: "view" | "create" | "edit") =>
    (req: Request, res: Response, next: NextFunction) => {
      if (!req.authUser) return res.status(401).json({ error: "not_authenticated" });
      const m = req.authPermissions;
      if (m && canLegacySection(
        req.authUser, m, "user_management", action,
        req.authFeatureAccess ?? { rolesConfigured: false, legacyPermissions: m },
        req.path,
      )) return next();
      return res.status(403).json({ error: "forbidden", section: "user_management", action });
    };
  const requireDeviceMgmt = (action: "view" | "edit") =>
    (req: Request, res: Response, next: NextFunction) => {
      if (!req.authUser) return res.status(401).json({ error: "not_authenticated" });
      if (req.authUser.isOwner) return next();
      return res.status(403).json({ error: "owner_required", section: "device_approval", action });
    };

  const featureTicksSchema = z.record(z.record(z.boolean()));
  const roleScopeSchema = z.enum(["own", "team", "all"]);
  const validateTicks = (raw: Record<string, Record<string, boolean>>): FeatureTicks => {
    const output: FeatureTicks = {};
    for (const [feature, actions] of Object.entries(raw)) {
      const definition = FEATURES.find(item => item.id === feature);
      if (!definition) throw new Error(`Unknown feature: ${feature}`);
      for (const [action, granted] of Object.entries(actions)) {
        if (!(FEATURE_ACTIONS as readonly string[]).includes(action)) throw new Error(`Unknown action: ${action}`);
        output[feature as FeatureId] ??= {};
        output[feature as FeatureId]![action as FeatureAction] = granted;
      }
    }
    return output;
  };

  app.get("/api/access-control/roles", requireAuth, requireUserMgmt("view"), async (_req, res) => {
    try {
      res.json({ roles: await getRolesWithTicks() });
    } catch (err) {
      console.error("[GET /api/access-control/roles]", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  // Seed is an explicit Owner action. Production never seeds these rows during startup.
  app.post("/api/access-control/roles/seed", requireAuth, requireAdmin, async (_req, res) => {
    try {
      await seedDefaultRoles();
      res.json({ ok: true, roles: await getRolesWithTicks() });
    } catch (err) {
      console.error("[POST /api/access-control/roles/seed]", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/access-control/roles/apply-suggested-ticks", requireAuth, requireAdmin, async (req, res) => {
    if (!req.authUser?.isOwner) return res.status(403).json({ error: "owner_required" });
    try {
      z.object({ confirm: z.literal(true) }).parse(req.body);
      const grantedCount = await db.transaction(async tx => {
        const roleRows = await tx.select({ id: roles.id, name: roles.name }).from(roles);
        const inserts = roleRows.flatMap(role => {
          const suggested = SUGGESTED_NEW_ROW_ROLE_TICKS[role.name as keyof typeof SUGGESTED_NEW_ROW_ROLE_TICKS];
          if (!suggested) return [];
          return Object.entries(suggested).flatMap(([feature, actions]) =>
            Object.entries(actions ?? {})
              .filter(([, granted]) => granted === true)
              .map(([action]) => ({
                roleId: role.id,
                feature,
                action,
                granted: true,
              })),
          );
        });
        if (inserts.length) {
          await tx.insert(roleTicks).values(inserts).onConflictDoUpdate({
            target: [roleTicks.roleId, roleTicks.feature, roleTicks.action],
            set: { granted: true },
          });
        }
        return inserts.length;
      });
      res.json({ ok: true, grantedCount });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "confirmation_required" });
      console.error("[POST /api/access-control/roles/apply-suggested-ticks]", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/access-control/roles", requireAuth, requireAdmin, async (req, res) => {
    try {
      const input = z.object({ name: z.string().trim().min(1).max(80), scopeDefault: roleScopeSchema }).parse(req.body);
      const [created] = await db.insert(roles).values(input).returning();
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "invalid_request", details: err.errors });
      console.error("[POST /api/access-control/roles]", err);
      res.status(409).json({ error: "role_name_must_be_unique" });
    }
  });

  app.patch("/api/access-control/roles/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = z.object({
        name: z.string().trim().min(1).max(80),
        scopeDefault: roleScopeSchema,
        ticks: featureTicksSchema,
      }).parse(req.body);
      const cleanTicks = validateTicks(input.ticks);
      const [updated] = await db.update(roles).set({
        name: input.name,
        scopeDefault: input.scopeDefault,
      }).where(eq(roles.id, id)).returning();
      if (!updated) return res.status(404).json({ error: "not_found" });
      await saveRoleFeatureTicks(id, cleanTicks);
      res.json({ ok: true, role: { ...updated, ticks: cleanTicks } });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "invalid_request", details: err.errors });
      console.error("[PATCH /api/access-control/roles/:id]", err);
      res.status(409).json({ error: "role_name_must_be_unique" });
    }
  });

  app.delete("/api/access-control/roles/:id", requireAuth, requireAdmin, async (req, res) => {
    const status = await removeRole(Number(req.params.id));
    if (status === "missing") return res.status(404).json({ error: "not_found" });
    if (status === "in_use") return res.status(409).json({ error: "role_has_holders" });
    res.json({ ok: true });
  });

  app.get("/api/access-control/setup-preview", requireAuth, requireAdmin, async (_req, res) => {
    try {
      res.json(await getRoleSetupPreview());
    } catch (err) {
      console.error("[GET /api/access-control/setup-preview]", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/access-control/setup", requireAuth, requireAdmin, async (req, res) => {
    try {
      const input = z.object({
        users: z.array(z.object({
          userId: z.number().int().positive(),
          roleIds: z.array(z.number().int().positive()),
          isOwner: z.boolean(),
          canUnlockRecords: z.boolean().optional(),
          adminChoiceConfirmed: z.boolean().optional(),
        })),
      }).strict().parse(req.body);
      if (await (await import("./featureAccess")).rolesHaveBeenConfigured()) {
        return res.status(409).json({ error: "roles_already_setup" });
      }
      const activeUsers = await db.select().from(users).where(eq(users.isActive, true));
      const byId = new Map(activeUsers.map(user => [user.id, user]));
      const submittedIds = new Set(input.users.map(user => user.userId));
      if (submittedIds.size !== input.users.length || activeUsers.some(user => !submittedIds.has(user.id))) {
        return res.status(400).json({ error: "all_active_users_required" });
      }
      const ownersAfter = input.users.filter(user => user.isOwner).length;
      if (ownersAfter < 1) return res.status(400).json({ error: "at_least_one_owner_required" });
      if (input.users.some(user => user.userId === req.authUser!.id && !user.isOwner)) {
        return res.status(400).json({ error: "owners_cannot_restrict_themselves" });
      }
      const availableRoles = await getRolesWithTicks();
      const roleById = new Map(availableRoles.map(role => [role.id, role]));
      const planned: Array<{
        selection: (typeof input.users)[number];
        current: (typeof activeUsers)[number];
        selectedRoles: NonNullable<ReturnType<typeof roleById.get>>[];
        changes: PersonalTickChanges;
      }> = [];
      for (const selection of input.users) {
        const current = byId.get(selection.userId)!;
        const selectedRoles = selection.roleIds.map(id => roleById.get(id));
        if (selectedRoles.some(role => !role)) return res.status(400).json({ error: "unknown_role" });
        if (current.isAdmin && !selection.isOwner && (!selection.adminChoiceConfirmed || selectedRoles.length === 0)) {
          return res.status(400).json({ error: "admin_must_become_owner_or_have_role", userId: current.id });
        }
        const legacy = await loadUserPermissionsMatrix(current.id);
        const validSelectedRoles = selectedRoles as NonNullable<ReturnType<typeof roleById.get>>[];
        const changes = computePersonalChangesForLegacy(legacy, validSelectedRoles.map(role => role.ticks));
        planned.push({ selection, current, selectedRoles: validSelectedRoles, changes });
      }
      for (const { selection, current, selectedRoles, changes } of planned) {
        await saveUserFeatureAccess(current.id, selection.roleIds, changes);
        const firstRole = selectedRoles[0];
        await db.update(users).set({
          isOwner: selection.isOwner,
          entryScope: current.entryScope ?? firstRole?.scopeDefault ?? "all",
          ...(current.isAdmin && !selection.isOwner ? { allSitesAccess: true } : {}),
          canUnlockRecords: selection.canUnlockRecords ?? current.canUnlockRecords,
        }).where(eq(users.id, current.id));
        if (current.isOwner !== selection.isOwner) {
          await storage.logAudit({
            module: "user_access",
            transactionId: current.id,
            action: "edit",
            userId: req.authUser!.id,
            userName: req.authUser!.fullName,
            userRole: "owner",
            oldValues: { isOwner: current.isOwner },
            newValues: { isOwner: selection.isOwner },
            reason: "Feature access role setup",
          });
        }
        const canUnlockRecords = selection.canUnlockRecords ?? current.canUnlockRecords;
        if (current.canUnlockRecords !== canUnlockRecords) {
          await storage.logAudit({
            module: "user_access",
            transactionId: current.id,
            action: "edit",
            userId: req.authUser!.id,
            userName: req.authUser!.fullName,
            userRole: "owner",
            oldValues: { canUnlockRecords: current.canUnlockRecords },
            newValues: { canUnlockRecords },
            reason: "Owner changed record-unlock permission during role setup",
          });
        }
      }
      await markRolesConfigured();
      res.json({ ok: true, rolesConfigured: true });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "invalid_request", details: err.errors });
      console.error("[POST /api/access-control/setup]", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/api/auth/users/:id/feature-access", requireAuth, requireUserMgmt("view"), async (req, res) => {
    const id = Number(req.params.id);
    const target = await getUserById(id);
    if (!target) return res.status(404).json({ error: "not_found" });
    if (!req.authUser!.isOwner && (req.authUser!.id === id || target.isOwner)) {
      return res.status(403).json({ error: "cannot_edit_self_or_owner" });
    }
    const [access, availableRoles, legacy] = await Promise.all([
      (async () => {
        const state = await import("./featureAccess");
        return state.getUserFeatureAccess(id);
      })(),
      getRolesWithTicks(),
      loadUserPermissionsMatrix(id),
    ]);
    const accessState = await (await import("./featureAccess")).loadFeatureAccessState(id, legacy);
    res.json({
      ...access,
      roles: availableRoles,
      legacyMatrix: legacy,
      licensedModules: accessState.licensedModules,
      canUnlockRecords: target.canUnlockRecords,
      rolesConfigured: await (await import("./featureAccess")).rolesHaveBeenConfigured(),
    });
  });

  app.put("/api/auth/users/:id/feature-access", requireAuth, requireUserMgmt("edit"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const target = await getUserById(id);
      const actor = req.authUser!;
      if (!target) return res.status(404).json({ error: "not_found" });
      if (!actor.isOwner && (actor.id === id || target.isOwner)) {
        return res.status(403).json({ error: "cannot_edit_self_or_owner" });
      }
      if (!await (await import("./featureAccess")).rolesHaveBeenConfigured()) {
        return res.status(409).json({ error: "roles_not_configured" });
      }
      const input = z.object({
        roleIds: z.array(z.number().int().positive()),
        personalChanges: featureTicksSchema,
      }).strict().parse(req.body);
      const changes = validateTicks(input.personalChanges);
      const availableRoles = await getRolesWithTicks();
      const roleById = new Map(availableRoles.map(role => [role.id, role]));
      const selectedRoles = input.roleIds.map(roleId => roleById.get(roleId));
      if (selectedRoles.some(role => !role)) return res.status(400).json({ error: "unknown_role" });
      if (!actor.isOwner) {
        const actorState = req.authFeatureAccess ?? { rolesConfigured: true };
        for (const role of selectedRoles) {
          for (const feature of FEATURES) {
            for (const action of feature.actions) {
              if (role!.ticks[feature.id]?.[action] && !canFeature(actor, feature.id, action, actorState)) {
                return res.status(403).json({ error: "cannot_grant_unheld_permission", feature: feature.id, action });
              }
            }
          }
        }
        for (const feature of FEATURES) {
          for (const action of feature.actions) {
            if (changes[feature.id]?.[action] === true && !canFeature(actor, feature.id, action, actorState)) {
              return res.status(403).json({ error: "cannot_grant_unheld_permission", feature: feature.id, action });
            }
          }
        }
      }
      await saveUserFeatureAccess(id, input.roleIds, changes);
      res.json({ ok: true, roleIds: input.roleIds, personalChanges: changes });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "invalid_request", details: err.errors });
      console.error("[PUT /api/auth/users/:id/feature-access]", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.patch("/api/auth/users/:id/record-unlock", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = z.object({ canUnlockRecords: z.boolean() }).strict().parse(req.body);
      const target = await getUserById(id);
      if (!target) return res.status(404).json({ error: "not_found" });
      if (target.canUnlockRecords !== input.canUnlockRecords) {
        await db.update(users).set({ canUnlockRecords: input.canUnlockRecords }).where(eq(users.id, id));
        await storage.logAudit({
          module: "user_access",
          transactionId: id,
          action: "edit",
          userId: req.authUser!.id,
          userName: req.authUser!.fullName,
          userRole: "owner",
          oldValues: { canUnlockRecords: target.canUnlockRecords },
          newValues: { canUnlockRecords: input.canUnlockRecords },
          reason: "Owner changed record-unlock permission",
        });
      }
      res.json({ ok: true, canUnlockRecords: input.canUnlockRecords });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "invalid_request", details: err.errors });
      console.error("[PATCH /api/auth/users/:id/record-unlock]", err);
      res.status(500).json({ error: "server_error" });
    }
  });

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

  // ── Guided setup helpers (creation + retry share these) ────────────────────
  // Cap a requested matrix to the actor's own permissions for partial
  // permission managers — a manager can never grant more than they hold.
  const coerceAndCapMatrix = (req: Request, parsed: Record<string, any>): PermissionMatrix => {
    const actor = req.authUser!;
    const actorMatrix = !(actor.isAdmin && !req.authFeatureAccess?.rolesConfigured) &&
      actor.canManagePermissions && actor.permissionManagerScope === "partial"
      ? req.authPermissions
      : null;
    const matrix: PermissionMatrix = emptyMatrix();
    for (const k of SECTION_KEYS) {
      const val = parsed[k];
      const actorRow = actorMatrix ? actorMatrix[k] : null;
      matrix[k] = {
        view: !!val?.view && (actorRow ? !!actorRow.view : true),
        create: !!val?.create && (actorRow ? !!actorRow.create : true),
        edit: !!val?.edit && (actorRow ? !!actorRow.edit : true),
        delete: !!val?.delete && (actorRow ? !!actorRow.delete : true),
        view_reports: !!val?.view_reports && (actorRow ? !!actorRow.view_reports : true),
        export: !!val?.export && (actorRow ? !!actorRow.export : true),
        approve: !!val?.approve && (actorRow ? !!actorRow.approve : true),
        notify: !!val?.notify && (actorRow ? !!actorRow.notify : true),
      };
    }
    return matrix;
  };

  // A non-admin actor may only hand out site scope they themselves hold.
  // Returns an error string, or null when the assignment is allowed.
  const checkSiteScopeAllowed = async (req: Request, choice: { mode: string; siteIds?: number[] }): Promise<string | null> => {
    const actor = req.authUser!;
    if (actor.isOwner || (actor.isAdmin && !req.authFeatureAccess?.rolesConfigured)) return null;
    const actorSites = await storage.getUserPermittedSiteIds(
      actor.id,
      !!req.authFeatureAccess?.rolesConfigured,
    );
    if (actorSites === null) return null; // actor has authorised all-sites scope
    if (choice.mode === "all") return "cannot_grant_all_sites_beyond_own_scope";
    if (choice.mode === "selected") {
      const allowed = new Set(actorSites);
      const outside = (choice.siteIds ?? []).filter((id) => !allowed.has(id));
      if (outside.length > 0) return "site_ids_beyond_own_scope";
    }
    return null;
  };

  /**
   * Applies template/permissions + site access to an existing user and marks
   * setup complete only when every step succeeded. Returns the per-step record
   * so the client can show exactly which step failed and offer Retry.
   */
  const applyGuidedSetup = async (
    req: Request,
    userId: number,
    isPrivilegedUser: boolean,
    rolesConfigured: boolean,
    opts: { roleTemplate?: string; permissions?: Record<string, any>; siteAccess?: { mode: "all" | "selected" | "none"; siteIds?: number[] } },
  ) => {
    const steps: Record<string, "ok" | "failed" | "skipped"> = { permissions: "skipped", siteAccess: "skipped", completion: "skipped" };
    let failedError: string | null = null;

    // Feature roles replace the legacy matrix. Preserve it unchanged once roles
    // are configured; only the Owner-selected feature roles are authoritative.
    if (rolesConfigured) {
      steps.permissions = "skipped";
    } else {
      try {
        if (isPrivilegedUser) {
          await setUserPermissions(userId, fullMatrix(), "administrator");
        } else if (opts.permissions) {
          const role = opts.roleTemplate === undefined ? undefined : businessRoleSchema.parse(opts.roleTemplate);
          await setUserPermissions(userId, coerceAndCapMatrix(req, opts.permissions), role);
        } else if (opts.roleTemplate && opts.roleTemplate !== "custom") {
          if (!ROLE_TEMPLATES.some((t) => t.id === opts.roleTemplate)) throw new Error("unknown_role_template");
          // Partial managers cannot apply templates broader than their own scope.
          await setUserPermissions(userId, coerceAndCapMatrix(req, applyRoleTemplate(opts.roleTemplate)), opts.roleTemplate);
        } else {
          await setUserPermissions(userId, emptyMatrix(), opts.roleTemplate === "custom" ? "custom" : undefined);
        }
        steps.permissions = "ok";
      } catch (e: any) {
        steps.permissions = "failed";
        failedError = failedError ?? (e?.message === "unknown_role_template" ? "unknown_role_template" : "permissions_failed");
      }
    }

    // Step: site access — an EXPLICIT choice is always recorded.
    try {
      const choice = opts.siteAccess ?? { mode: "none" as const };
      const scopeErr = await checkSiteScopeAllowed(req, choice);
      if (scopeErr) throw new Error(scopeErr);
      if (choice.mode === "all") {
        await storage.setUserAllSitesAccess(userId, true);
      } else if (choice.mode === "selected") {
        if (!choice.siteIds || choice.siteIds.length === 0) throw new Error("site_ids_required");
        await storage.setUserAllSitesAccess(userId, false);
        await storage.setUserSiteAccess(userId, choice.siteIds);
      } else {
        // "none" — explicit no-access; account stays Setup incomplete.
        await storage.setUserAllSitesAccess(userId, false);
        await storage.setUserSiteAccess(userId, []);
      }
      steps.siteAccess = "ok";
    } catch (e: any) {
      steps.siteAccess = "failed";
      failedError = failedError ?? (e?.message || "site_access_failed");
    }

    // Step: completion state. Privileged users are complete by definition; a "none"
    // choice deliberately leaves the account Setup incomplete.
    const mode = opts.siteAccess?.mode ?? "none";
    const permissionsReady = rolesConfigured || steps.permissions === "ok";
    const complete = isPrivilegedUser || (permissionsReady && steps.siteAccess === "ok" && mode !== "none");
    try {
      await storage.setUserSetupComplete(userId, complete);
      steps.completion = "ok";
    } catch {
      steps.completion = "failed";
      failedError = failedError ?? "completion_failed";
    }
    return { steps, setupComplete: complete, error: failedError };
  };

  app.post("/api/auth/users", requireAuth, requireUserMgmt("create"), async (req, res) => {
    try {
      const input = createUserSchema.parse(req.body);
      const rolesConfigured = await (await import("./featureAccess")).rolesHaveBeenConfigured();
      if (input.isOwner && !req.authUser!.isOwner) {
        return res.status(403).json({ error: "owner_required" });
      }
      if (rolesConfigured && !input.isOwner && !input.roleIds?.length) {
        return res.status(400).json({ error: "role_required" });
      }
      if (input.reportsToUserId != null && !await getUserById(input.reportsToUserId)) {
        return res.status(400).json({ error: "reports_to_user_not_found" });
      }
      let selectedRoles: Awaited<ReturnType<typeof getRolesWithTicks>> = [];
      if (rolesConfigured && input.roleIds?.length) {
        const availableRoles = await getRolesWithTicks();
        selectedRoles = availableRoles.filter(role => input.roleIds!.includes(role.id));
        if (selectedRoles.length !== input.roleIds.length) return res.status(400).json({ error: "unknown_role" });
        if (!req.authUser!.isOwner) {
          const actorState = req.authFeatureAccess ?? { rolesConfigured: true };
          for (const role of selectedRoles) {
            for (const feature of FEATURES) {
              for (const action of feature.actions) {
                if (role.ticks[feature.id]?.[action] && !canFeature(req.authUser!, feature.id, action, actorState)) {
                  return res.status(403).json({ error: "cannot_grant_unheld_permission", feature: feature.id, action });
                }
              }
            }
          }
        }
      }
      // The legacy Admin flag does not grant authority to create another
      // privileged account; only an Owner may assign it.
      if (input.isAdmin && !req.authUser!.isOwner) {
        return res.status(403).json({ error: "cannot_create_admin_users" });
      }
      // Check uniqueness for email and phone separately BEFORE creating —
      // guarantees a Retry after a partial failure never duplicates a user.
      if (input.email) {
        const existing = await getUserByEmail(input.email);
        if (existing) return res.status(409).json({ error: "email_exists", existingUserId: existing.id, existingSetupComplete: (existing as any).setupComplete !== false });
      }
      if (input.phone) {
        const existingPhone = await getUserByPhone(input.phone);
        if (existingPhone) return res.status(409).json({ error: "phone_exists", existingUserId: existingPhone.id, existingSetupComplete: (existingPhone as any).setupComplete !== false });
      }
      const { roleTemplate, permissions, siteAccess, roleIds, ...profile } = input;
      const u = await createUserRow({
        ...profile,
        email: input.email || null,
        phone: input.phone || null,
      });
      // New non-admin accounts start Setup-incomplete (no site access) until
      // the guided setup below succeeds — never silently unrestricted.
      if (!(u.isOwner || (u.isAdmin && !rolesConfigured))) {
        await storage.setUserSetupComplete(u.id, false);
      }

      if (rolesConfigured && roleIds?.length) {
        await saveUserFeatureAccess(u.id, roleIds, {});
      }
      const setup = await applyGuidedSetup(req, u.id, !!u.isOwner || (!!u.isAdmin && !rolesConfigured), rolesConfigured, {
        roleTemplate,
        permissions: rolesConfigured ? emptyMatrix() : permissions,
        siteAccess,
      });
      if (input.isOwner) {
        await storage.logAudit({
          module: "user_access",
          transactionId: u.id,
          action: "create",
          userId: req.authUser!.id,
          userName: req.authUser!.fullName,
          userRole: req.authUser!.isOwner ? "owner" : "user",
          oldValues: { isOwner: false },
          newValues: { isOwner: true },
          reason: "Owner account created from the person form",
        });
      }
      const anyFailed = Object.values(setup.steps).includes("failed");
      res.status(201).json({
        ...toSafeUser((await getUserById(u.id))!),
        setupComplete: setup.setupComplete,
        setupSteps: setup.steps,
        setupError: setup.error,
        setupOk: !anyFailed,
      });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "invalid_request", details: err.errors });
      console.error("[POST /api/auth/users]", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  // Retry guided setup on an existing (possibly Setup-incomplete) user —
  // never creates a duplicate account.
  app.post("/api/auth/users/:id/complete-setup", requireAuth, requireUserMgmt("create"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const u = await getUserById(id);
      if (!u) return res.status(404).json({ error: "not_found" });
      const rolesConfigured = await (await import("./featureAccess")).rolesHaveBeenConfigured();
      // Owner accounts are immutable here. The Admin flag is privileged only
      // before feature roles are configured.
      if (!req.authUser!.isOwner && (u.isOwner || (!rolesConfigured && u.isAdmin))) {
        return res.status(403).json({ error: "cannot_edit_admin_users" });
      }
      const body = z.object({
        roleTemplate: z.string().optional(),
        permissions: permissionMatrixSchema.optional(),
        siteAccess: siteAccessChoiceSchema.optional(),
      }).parse(req.body);
      const setup = await applyGuidedSetup(req, id, !!u.isOwner || (!!u.isAdmin && !rolesConfigured), rolesConfigured, body);
      const anyFailed = Object.values(setup.steps).includes("failed");
      res.json({ ok: !anyFailed, setupComplete: setup.setupComplete, setupSteps: setup.steps, setupError: setup.error });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "invalid_request", details: err.errors });
      console.error("[complete-setup]", err);
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

      // Privilege-escalation guards (pre-deployment security review):
      // non-admin actors — including permission managers — can never modify
      // admin/owner accounts, nor grant/change privileged flags.
      const actor = req.authUser!;
      const rolesConfigured = await (await import("./featureAccess")).rolesHaveBeenConfigured();
      if (!actor.isOwner) {
        if (current.isOwner || (!rolesConfigured && current.isAdmin)) {
          return res.status(403).json({ error: "cannot_edit_admin_users" });
        }
        if (
          input.isAdmin !== undefined || input.isOwner !== undefined ||
          input.canManagePermissions !== undefined || input.permissionManagerScope !== undefined
        ) {
          return res.status(403).json({ error: "cannot_change_privileged_flags" });
        }
      }
      if (input.reportsToUserId === id) {
        return res.status(400).json({ error: "cannot_report_to_self" });
      }
      if (input.reportsToUserId != null && !await getUserById(input.reportsToUserId)) {
        return res.status(400).json({ error: "reports_to_user_not_found" });
      }
      if (input.isOwner === false && current.isOwner) {
        const activeOwners = await db.select({ id: users.id }).from(users)
          .where(and(eq(users.isOwner, true), eq(users.isActive, true)));
        if (activeOwners.length <= 1) {
          return res.status(409).json({ error: "cannot_demote_last_owner" });
        }
      }

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
      if (input.isOwner !== undefined && input.isOwner !== current.isOwner) {
        await storage.logAudit({
          module: "user_access",
          transactionId: id,
          action: "edit",
          userId: actor.id,
          userName: actor.fullName,
          userRole: actor.isOwner ? "owner" : "user",
          oldValues: { isOwner: current.isOwner },
          newValues: { isOwner: input.isOwner },
          reason: "Owner status changed from the person editor",
        });
      }

      // Subscriptions are intentionally kept in the DB when notifications are
      // toggled off. getActivePushSubscriptions() already filters by
      // notificationsEnabled at send-time, so no push will be delivered while
      // the flag is off. Keeping subscriptions means toggling back on
      // immediately restores delivery without requiring every device to
      // re-subscribe.

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
    res.json({ matrix, isAdmin: u.isAdmin, businessRole: u.businessRole });
  });

  app.put("/api/auth/users/:id/permissions", requireAuth, requireUserMgmt("edit"), async (req, res) => {
    try {
      if (await (await import("./featureAccess")).rolesHaveBeenConfigured()) {
        return res.status(409).json({ error: "roles_configured_use_feature_access" });
      }
      const id = Number(req.params.id);
      const u = await getUserById(id);
      if (!u) return res.status(404).json({ error: "not_found" });

      // Permission managers cannot modify admin users.
      const actor = req.authUser!;
      if (!actor.isAdmin && u.isAdmin) {
        return res.status(403).json({ error: "forbidden", message: "Cannot modify permissions for an admin user." });
      }

      const reviewed = Object.prototype.hasOwnProperty.call(req.body ?? {}, "matrix")
        ? reviewedPermissionsSchema.parse(req.body) : null;
      const parsed = reviewed ? reviewed.matrix : permissionMatrixSchema.parse(req.body);
      // Coerce into a full matrix (only known sections) with defaults.
      const matrix: PermissionMatrix = emptyMatrix();
      // For partial permission managers: cap each grant to what they themselves have.
      const actorMatrix = !actor.isAdmin && actor.canManagePermissions && actor.permissionManagerScope === "partial"
        ? req.authPermissions
        : null;

      for (const k of SECTION_KEYS) {
        const val = parsed[k];
        const actorRow = actorMatrix ? actorMatrix[k] : null;
        matrix[k] = {
          view: !!val?.view && (actorRow ? !!actorRow.view : true),
          create: !!val?.create && (actorRow ? !!actorRow.create : true),
          edit: !!val?.edit && (actorRow ? !!actorRow.edit : true),
          delete: !!val?.delete && (actorRow ? !!actorRow.delete : true),
          view_reports: !!val?.view_reports && (actorRow ? !!actorRow.view_reports : true),
          export: !!val?.export && (actorRow ? !!actorRow.export : true),
          approve: !!val?.approve && (actorRow ? !!actorRow.approve : true),
          notify: !!val?.notify && (actorRow ? !!actorRow.notify : true),
        };
      }
      await setUserPermissions(id, matrix, reviewed?.businessRole);
      res.json({ ok: true, matrix, businessRole: reviewed?.businessRole === undefined ? u.businessRole : reviewed.businessRole });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "invalid_request", details: err.errors });
      console.error("[PUT /api/auth/users/:id/permissions]", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  // Site Access (Permission System v2)
  app.get("/api/auth/users/:id/site-access", requireAuth, requireUserMgmt("view"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const u = await getUserById(id);
      if (!u) return res.status(404).json({ error: "not_found" });
      const rows = await storage.getUserSiteAccess(id);
      const siteIds = rows.map((r) => r.siteId);
      // allSites is now the EXPLICIT recorded grant (or admin/owner), never
      // inferred from zero rows.
      const allSites = !!(u as any).allSitesAccess || !!(u.isAdmin && !req.authFeatureAccess?.rolesConfigured) || !!(u as any).isOwner;
      res.json({ siteIds, allSites, setupComplete: (u as any).setupComplete !== false });
    } catch (err) {
      console.error("[GET /api/auth/users/:id/site-access]", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.put("/api/auth/users/:id/site-access", requireAuth, requireUserMgmt("edit"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const u = await getUserById(id);
      if (!u) return res.status(404).json({ error: "not_found" });
      // Non-admin actors can never alter admin/owner site scope.
      if (!req.authUser!.isOwner &&
          (u.isOwner || (!req.authFeatureAccess?.rolesConfigured && u.isAdmin))) {
        return res.status(403).json({ error: "cannot_edit_admin_users" });
      }
      const parsed = z.object({
        siteIds: z.array(z.number().int().positive()),
        allSites: z.boolean().optional(),
      }).parse(req.body);
      const mode = parsed.allSites ? "all" : parsed.siteIds.length > 0 ? "selected" : "none";
      const scopeErr = await checkSiteScopeAllowed(req, { mode, siteIds: parsed.siteIds });
      if (scopeErr) return res.status(403).json({ error: scopeErr });
      if (parsed.allSites) {
        await storage.setUserAllSitesAccess(id, true); // also clears selected rows
      } else {
        await storage.setUserAllSitesAccess(id, false);
        await storage.setUserSiteAccess(id, parsed.siteIds);
      }
      // Granting real access resolves a Setup-incomplete account; removing all
      // access does NOT silently re-mark completed users (admin does that via
      // the audit/resolution flow deliberately).
      if ((parsed.allSites || parsed.siteIds.length > 0) && (u as any).setupComplete === false) {
        await storage.setUserSetupComplete(id, true);
      }
      res.json({ ok: true, siteIds: parsed.allSites ? [] : parsed.siteIds, allSites: !!parsed.allSites });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "invalid_request", details: err.errors });
      console.error("[PUT /api/auth/users/:id/site-access]", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  // Read-only pre-enforcement audit: non-admin users with zero site-access
  // rows and no explicit all-sites grant — accounts that previously relied on
  // the unsafe "zero rows = all sites" fallback. Admin resolves each via the
  // existing site-access editor / all-sites grant / deactivate.
  app.get("/api/auth/users/site-access-audit", requireAuth, requireUserMgmt("view"), async (req, res) => {
    try {
      const all = await db.select().from(users);
      const results = [] as any[];
      for (const u of all) {
        if (u.isOwner || (u.isAdmin && !req.authFeatureAccess?.rolesConfigured)) continue;
        if ((u as any).allSitesAccess) continue;
        const rows = await storage.getUserSiteAccess(u.id);
        if (rows.length > 0) continue;
        results.push({
          id: u.id,
          fullName: u.fullName,
          email: u.email,
          phone: u.phone,
          isActive: u.isActive,
          isFieldEngineer: u.isFieldEngineer,
          setupComplete: (u as any).setupComplete !== false,
          reliedOnLegacyAllSites: true, // zero rows previously meant unrestricted
        });
      }
      res.json({ ambiguousUsers: results, count: results.length, activeCount: results.filter((r) => r.isActive).length });
    } catch (err) {
      console.error("[site-access-audit]", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/auth/users/:id/copy-permissions", requireAuth, requireUserMgmt("edit"), async (req, res) => {
    try {
      if (await (await import("./featureAccess")).rolesHaveBeenConfigured()) {
        return res.status(409).json({ error: "roles_configured_use_feature_access" });
      }
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
  if (!req.authUser.isOwner) {
    res.status(403).json({ error: "owner_required" });
    return false;
  }
  return true;
}

function hasSectionAccess(req: Request, sections: SectionKey[], action: string): boolean {
  const user = req.authUser;
  const matrix = req.authPermissions;
  if (!user || !matrix) return false;
  const state = req.authFeatureAccess ?? { rolesConfigured: false, legacyPermissions: matrix };
  return sections.some(section => canLegacySection(user, matrix, section, action, state, req.path));
}

export function assertEdit(req: Request, res: Response, section: SectionKey): boolean {
  if (!req.authUser) {
    res.status(401).json({ error: "not_authenticated" });
    return false;
  }
  if (!hasSectionAccess(req, [section], "edit")) {
    res.status(403).json({ error: "forbidden", section, action: "edit" });
    return false;
  }
  return true;
}

export function assertEditEither(req: Request, res: Response, ...sections: SectionKey[]): boolean {
  if (!req.authUser) {
    res.status(401).json({ error: "not_authenticated" });
    return false;
  }
  if (!hasSectionAccess(req, sections, "edit")) {
    res.status(403).json({ error: "forbidden", sections, action: "edit" });
    return false;
  }
  return true;
}

export function assertCreate(req: Request, res: Response, section: SectionKey): boolean {
  if (!req.authUser) {
    res.status(401).json({ error: "not_authenticated" });
    return false;
  }
  if (!hasSectionAccess(req, [section], "create")) {
    res.status(403).json({ error: "forbidden", section, action: "create" });
    return false;
  }
  return true;
}

export function assertCreateOrEdit(req: Request, res: Response, section: SectionKey): boolean {
  if (!req.authUser) {
    res.status(401).json({ error: "not_authenticated" });
    return false;
  }
  if (!hasSectionAccess(req, [section], "create") && !hasSectionAccess(req, [section], "edit")) {
    res.status(403).json({ error: "forbidden", section, action: "create_or_edit" });
    return false;
  }
  return true;
}

export function assertCreateEither(req: Request, res: Response, ...sections: SectionKey[]): boolean {
  if (!req.authUser) {
    res.status(401).json({ error: "not_authenticated" });
    return false;
  }
  if (!hasSectionAccess(req, sections, "create")) {
    res.status(403).json({ error: "forbidden", sections, action: "create" });
    return false;
  }
  return true;
}

export function assertView(req: Request, res: Response, section: SectionKey): boolean {
  if (!req.authUser) {
    res.status(401).json({ error: "not_authenticated" });
    return false;
  }
  if (!hasSectionAccess(req, [section], "view")) {
    res.status(403).json({ error: "forbidden", section, action: "view" });
    return false;
  }
  return true;
}

export function assertReportExport(req: Request, res: Response, ...sections: SectionKey[]): boolean {
  if (!req.authUser) {
    res.status(401).json({ error: "not_authenticated" });
    return false;
  }
  if (!hasSectionAccess(req, sections, "export")) {
    res.status(403).json({ error: "forbidden", sections, action: "export" });
    return false;
  }
  return true;
}

export function assertViewEither(req: Request, res: Response, ...sections: SectionKey[]): boolean {
  if (!req.authUser) {
    res.status(401).json({ error: "not_authenticated" });
    return false;
  }
  if (!hasSectionAccess(req, sections, "view")) {
    res.status(403).json({ error: "forbidden", sections, action: "view" });
    return false;
  }
  return true;
}

export function assertApprove(req: Request, res: Response, section: SectionKey): boolean {
  if (!req.authUser) {
    res.status(401).json({ error: "not_authenticated" });
    return false;
  }
  if (!hasSectionAccess(req, [section], "approve")) {
    res.status(403).json({ error: "forbidden", section, action: "approve" });
    return false;
  }
  return true;
}

// Destructive actions are independently delegated, never inherited from Edit.
export function assertDelete(req: Request, res: Response, section: SectionKey): boolean {
  return assertDeleteEither(req, res, section);
}

export function assertDeleteEither(req: Request, res: Response, ...sections: SectionKey[]): boolean {
  if (!req.authUser) {
    res.status(401).json({ error: "not_authenticated" });
    return false;
  }
  if (!hasSectionAccess(req, sections, "delete")) {
    res.status(403).json({ error: "forbidden", sections, action: "delete" });
    return false;
  }
  return true;
}

export function assertExport(req: Request, res: Response, section: SectionKey): boolean {
  return assertReportExport(req, res, section);
}

export function assertDeleteOrCancel(req: Request, res: Response, section: SectionKey): boolean {
  return assertDelete(req, res, section);
}

export function currentUserName(req: Request): string {
  return req.authUser?.fullName || "Unknown";
}

