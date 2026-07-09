// Real-login auth module for the SiteLog app (Task #229).
// Replaces the localStorage-based AccessContext + hardcoded ADMIN_PIN.
// Estimator-portal PIN-based auth is intentionally untouched.
//
// Cookie strategy:
//   - hlc_dev (90-day): identifies the device, signed with SESSION_SECRET.
//                       Server looks up the device row and gates by status.
//   - hlc_sess (session cookie, no Max-Age): per-login session token. Server
//                       enforces the user's session_policy (idle / max age).
//
// Permissions:
//   - Admin users (is_admin=true) bypass per-section permission checks but
//     still go through device approval and session expiry.
//   - All other users need an active row in user_permissions for the section
//     they're touching, with the appropriate action flag set.

import { db } from "./db";
import {
  users,
  userPermissions,
  userDevices,
  userSessions,
  appSettings,
  type User,
  type SafeUser,
  type UserPermission,
  type UserDevice,
} from "@shared/schema";
import {
  SECTION_KEYS,
  type SectionKey,
  type Action,
  type PermissionMatrix,
  emptyMatrix,
  fullMatrix,
  type SessionPolicy,
  STRICT_IDLE_MINUTES,
  STICKY_MAX_AGE_DAYS,
  DEVICE_COOKIE_DAYS,
  SESSION_COOKIE_NAME,
  DEVICE_COOKIE_NAME,
  getIdleTimeoutMs,
  getMaxAgeMs,
} from "@shared/permissions";
import { and, eq, gt, isNull, desc, sql } from "drizzle-orm";
import * as crypto from "crypto";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";

const BCRYPT_ROUNDS = 12;

function getSessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET environment variable is not set");
  return s;
}

// =================================================================
// Cookie helpers (HMAC-signed, same pattern as estimator cookie).
// =================================================================

export function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k.trim() === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export function signToken(token: string): string {
  const hmac = crypto.createHmac("sha256", getSessionSecret()).update(token).digest("hex");
  return `${token}.${hmac}`;
}

export function verifySignedToken(val: string | undefined): string | null {
  if (!val) return null;
  const dot = val.indexOf(".");
  if (dot < 0) return null;
  const token = val.slice(0, dot);
  const hmac = val.slice(dot + 1);
  let secret: string;
  try { secret = getSessionSecret(); } catch { return null; }
  const expected = crypto.createHmac("sha256", secret).update(token).digest("hex");
  // Constant-time compare.
  if (hmac.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < hmac.length; i++) diff |= hmac.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  return token;
}

function randomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function setSessionCookie(res: Response, token: string) {
  // Session cookie: no Max-Age → browser discards on close → tab/browser
  // close = logout (matches both "strict" and "sticky" policies).
  const val = encodeURIComponent(signToken(token));
  res.setHeader("Set-Cookie", appendCookie(res, `${SESSION_COOKIE_NAME}=${val}; Path=/; SameSite=Lax; HttpOnly`));
}

export function clearSessionCookie(res: Response) {
  res.setHeader("Set-Cookie", appendCookie(res, `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly`));
}

export function setDeviceCookie(res: Response, token: string) {
  const val = encodeURIComponent(signToken(token));
  const maxAge = DEVICE_COOKIE_DAYS * 24 * 60 * 60;
  res.setHeader("Set-Cookie", appendCookie(res, `${DEVICE_COOKIE_NAME}=${val}; Path=/; Max-Age=${maxAge}; SameSite=Lax; HttpOnly`));
}

export function clearDeviceCookie(res: Response) {
  res.setHeader("Set-Cookie", appendCookie(res, `${DEVICE_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly`));
}

// Express's setHeader replaces existing values. Keep prior Set-Cookie values
// when stacking multiple cookies in a single response.
function appendCookie(res: Response, value: string): string | string[] {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) return value;
  if (Array.isArray(existing)) return [...existing, value];
  return [String(existing), value];
}

// =================================================================
// Password helpers.
// =================================================================

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  try { return await bcrypt.compare(plain, hash); } catch { return false; }
}

// =================================================================
// Permission helpers.
// =================================================================

export async function loadUserPermissionsMatrix(userId: number): Promise<PermissionMatrix> {
  const rows: UserPermission[] = await db.select().from(userPermissions).where(eq(userPermissions.userId, userId));
  const matrix = emptyMatrix();
  for (const r of rows) {
    if ((SECTION_KEYS as readonly string[]).includes(r.sectionKey)) {
      const k = r.sectionKey as SectionKey;
      matrix[k] = {
        view: r.canView,
        create: r.canCreate,
        edit: r.canEdit,
        delete: r.canDelete,
        view_reports: r.canViewReports,
        export: r.canExport,
        approve: r.canApprove,
        notify: r.canNotify,
      };
    }
  }
  return matrix;
}

export async function setUserPermissions(userId: number, matrix: PermissionMatrix): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(userPermissions).where(eq(userPermissions.userId, userId));
    const rows = SECTION_KEYS.map((k) => {
      const p = matrix[k] || { view: false, create: false, edit: false, delete: false, view_reports: false, export: false, approve: false, notify: false };
      return {
        userId,
        sectionKey: k,
        canView: !!p.view,
        canCreate: !!p.create,
        canEdit: !!p.edit,
        canDelete: !!p.delete,
        canViewReports: !!p.view_reports,
        canExport: !!p.export,
        canApprove: !!p.approve,
        canNotify: !!p.notify,
      };
    });
    if (rows.length) await tx.insert(userPermissions).values(rows);
  });
}

export function userHasPermission(
  userOrAdmin: { isAdmin: boolean; isOwner?: boolean },
  matrix: PermissionMatrix,
  section: SectionKey,
  action: Action,
): boolean {
  if (userOrAdmin.isAdmin || userOrAdmin.isOwner) return true;
  const sec = matrix[section];
  if (!sec) return false;
  return !!sec[action];
}

// =================================================================
// User CRUD core.
// =================================================================

export function toSafeUser(u: User): SafeUser {
  const { passwordHash: _ph, ...safe } = u;
  return safe;
}

export async function getUserById(id: number): Promise<User | undefined> {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  return u;
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const norm = email.trim().toLowerCase();
  const [u] = await db.select().from(users).where(eq(users.email, norm));
  return u;
}

export async function getUserByPhone(phone: string): Promise<User | undefined> {
  const norm = phone.trim();
  const [u] = await db.select().from(users).where(eq(users.phone, norm));
  return u;
}

// Task #280 — resolve a login identifier that may be an email address or a
// phone number. If the identifier contains "@" it's treated as email;
// otherwise it's treated as phone.
export async function getUserByIdentifier(identifier: string): Promise<User | undefined> {
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) return getUserByEmail(trimmed);
  return getUserByPhone(trimmed);
}

export async function listAllUsers(): Promise<SafeUser[]> {
  const rows = await db.select().from(users).orderBy(desc(users.isAdmin), users.fullName);
  return rows.map(toSafeUser);
}

export async function createUserRow(input: {
  email?: string | null;
  phone?: string | null;
  password: string;
  fullName: string;
  isAdmin?: boolean;
  isFieldEngineer?: boolean;
  notificationsEnabled?: boolean;
  sessionPolicy?: SessionPolicy;
}): Promise<User> {
  const passwordHash = await hashPassword(input.password);
  const [row] = await db.insert(users).values({
    email: input.email ? input.email.trim().toLowerCase() : null,
    phone: input.phone ? input.phone.trim() : null,
    passwordHash,
    fullName: input.fullName.trim(),
    isActive: true,
    isAdmin: !!input.isAdmin,
    isFieldEngineer: !!input.isFieldEngineer,
    notificationsEnabled: !!input.notificationsEnabled,
    sessionPolicy: input.sessionPolicy ?? (input.isAdmin ? "1h" : "7d"),
  }).returning();
  return row;
}

export async function updateUserPassword(userId: number, newPassword: string): Promise<void> {
  const passwordHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  // Invalidate every existing session for this user so the new password
  // takes effect everywhere.
  await db.update(userSessions)
    .set({ loggedOutAt: new Date() })
    .where(and(eq(userSessions.userId, userId), isNull(userSessions.loggedOutAt)));
}

export async function updateUserProfile(userId: number, patch: Partial<{
  fullName: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  isAdmin: boolean;
  isFieldEngineer: boolean;
  notificationsEnabled: boolean;
  sessionPolicy: SessionPolicy;
  canManagePermissions: boolean;
  permissionManagerScope: string;
}>): Promise<User | undefined> {
  const update: Record<string, unknown> = {};
  if (patch.fullName !== undefined) update.fullName = patch.fullName.trim();
  if (patch.email !== undefined) update.email = patch.email ? patch.email.trim().toLowerCase() : null;
  if (patch.phone !== undefined) update.phone = patch.phone ? patch.phone.trim() : null;
  if (patch.isActive !== undefined) update.isActive = patch.isActive;
  if (patch.isAdmin !== undefined) update.isAdmin = patch.isAdmin;
  if (patch.isFieldEngineer !== undefined) update.isFieldEngineer = patch.isFieldEngineer;
  if (patch.notificationsEnabled !== undefined) update.notificationsEnabled = patch.notificationsEnabled;
  if (patch.sessionPolicy !== undefined) update.sessionPolicy = patch.sessionPolicy;
  if (patch.canManagePermissions !== undefined) update.canManagePermissions = patch.canManagePermissions;
  if (patch.permissionManagerScope !== undefined) update.permissionManagerScope = patch.permissionManagerScope;
  if (Object.keys(update).length === 0) return getUserById(userId);
  const [row] = await db.update(users).set(update).where(eq(users.id, userId)).returning();
  return row;
}

// =================================================================
// Device + session core.
// =================================================================

export type DeviceLookupResult =
  | { kind: "approved"; device: UserDevice }
  | { kind: "pending"; device: UserDevice }
  | { kind: "revoked"; device: UserDevice }
  | { kind: "missing" };

export async function lookupDeviceFromCookie(cookieHeader: string | undefined): Promise<DeviceLookupResult> {
  const raw = parseCookie(cookieHeader, DEVICE_COOKIE_NAME);
  if (!raw) return { kind: "missing" };
  const token = verifySignedToken(raw);
  if (!token) return { kind: "missing" };
  const [device] = await db.select().from(userDevices).where(eq(userDevices.deviceToken, token));
  if (!device) return { kind: "missing" };
  if (device.status === "approved") return { kind: "approved", device };
  if (device.status === "revoked") return { kind: "revoked", device };
  return { kind: "pending", device };
}

// How long a pending device row is considered "recent" enough to reuse
// instead of inserting a fresh duplicate. Repeated login attempts within
// this window for the same (userId, userAgent) keep landing on the same
// pending row, so admins see one approval request rather than a pile.
const PENDING_DEVICE_REUSE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function ensureDeviceForUser(input: {
  userId: number;
  // The device the cookie currently points at, if any. Pass the RAW cookie
  // device regardless of which user it belongs to — the function uses the
  // presence of *any* cookie as proof this is a previously-used browser
  // (required to safely reuse an existing approved device by user-agent).
  existingDevice: UserDevice | null;
  deviceLabel: string;
  userAgent?: string;
  ipAddress?: string;
  autoApprove?: boolean;
}): Promise<{ device: UserDevice; setNewCookie: boolean }> {
  // 1. If the browser cookie already points at a device for THIS user,
  // reuse it as-is and don't rotate the cookie.
  // Exception: in bootstrap auto-approve mode (BOOTSTRAP_ADMIN_EMAIL with
  // zero approved devices anywhere), a stale same-user PENDING or REVOKED
  // cookie must NOT short-circuit recovery — fall through so we mint a
  // fresh approved device row. Only an already-approved same-user cookie
  // is honored under autoApprove.
  if (input.existingDevice && input.existingDevice.userId === input.userId) {
    const stuckUnderBootstrap =
      !!input.autoApprove && input.existingDevice.status !== "approved";
    if (!stuckUnderBootstrap) {
      // If the cookie's device is pending or revoked AND we have a user-agent,
      // check whether this user already has an approved device for the same
      // browser. If so, silently upgrade to it — this fixes the case where
      // repeated login attempts or a server restart leaves the cookie pointing
      // at a newer pending row while an older approved row for the same
      // (userId, userAgent) still exists.
      if (input.userAgent && input.existingDevice.status !== "approved") {
        const [approvedForUa] = await db
          .select()
          .from(userDevices)
          .where(
            and(
              eq(userDevices.userId, input.userId),
              eq(userDevices.userAgent, input.userAgent),
              eq(userDevices.status, "approved"),
            ),
          )
          .orderBy(desc(userDevices.approvedAt), desc(userDevices.lastSeenAt))
          .limit(1);
        if (approvedForUa) {
          await db.update(userDevices)
            .set({ lastSeenAt: new Date(), ipAddress: input.ipAddress })
            .where(eq(userDevices.id, approvedForUa.id));
          const [refreshed] = await db.select().from(userDevices).where(eq(userDevices.id, approvedForUa.id));
          return { device: refreshed, setNewCookie: true };
        }
      }
      await db.update(userDevices)
        .set({ lastSeenAt: new Date(), userAgent: input.userAgent, ipAddress: input.ipAddress })
        .where(eq(userDevices.id, input.existingDevice.id));
      const [refreshed] = await db.select().from(userDevices).where(eq(userDevices.id, input.existingDevice.id));
      return { device: refreshed, setNewCookie: false };
    }
  }

  // 2. Cross-user / shared-browser path. The only legitimate scenario this
  // branch targets is: this physical browser was already trusted (an admin
  // approved a device on it for some user A), and now user X — who also
  // has an approved or recent-pending device on this browser — is logging
  // in. We require the cookie to be APPROVED (and implicitly for a
  // different user, since branch 1 caught the same-user case). A pending
  // or revoked cookie is NOT browser proof — it just means someone tried
  // to log in here once. Without this restriction, an attacker who
  // possessed any cookie at all (including their own pending request)
  // plus a victim's password + matching User-Agent could bypass device
  // approval entirely. The bootstrap auto-approve path also skips this
  // branch so recovery always mints a fresh approved row.
  const browserAlreadyTrusted =
    !!input.existingDevice && input.existingDevice.status === "approved";
  const allowUaReuse = browserAlreadyTrusted && !input.autoApprove && !!input.userAgent;

  if (allowUaReuse) {
    // 2a. Approved device for this user on this browser → reuse and let
    // the caller rotate the cookie to it. This is what unsticks users from
    // the "Waiting for approval" loop after their device was approved.
    const [approvedMatch] = await db
      .select()
      .from(userDevices)
      .where(
        and(
          eq(userDevices.userId, input.userId),
          eq(userDevices.userAgent, input.userAgent!),
          eq(userDevices.status, "approved"),
        ),
      )
      .orderBy(desc(userDevices.lastSeenAt), desc(userDevices.approvedAt))
      .limit(1);
    if (approvedMatch) {
      await db.update(userDevices)
        .set({ lastSeenAt: new Date(), ipAddress: input.ipAddress, userAgent: input.userAgent })
        .where(eq(userDevices.id, approvedMatch.id));
      const [refreshed] = await db.select().from(userDevices).where(eq(userDevices.id, approvedMatch.id));
      return { device: refreshed, setNewCookie: true };
    }

    // 2b. Recently-requested pending device for this user on this browser
    // → reuse it instead of inserting another duplicate pending row.
    const recentCutoff = new Date(Date.now() - PENDING_DEVICE_REUSE_WINDOW_MS);
    const [pendingMatch] = await db
      .select()
      .from(userDevices)
      .where(
        and(
          eq(userDevices.userId, input.userId),
          eq(userDevices.userAgent, input.userAgent!),
          eq(userDevices.status, "pending"),
          gt(userDevices.requestedAt, recentCutoff),
        ),
      )
      .orderBy(desc(userDevices.requestedAt))
      .limit(1);
    if (pendingMatch) {
      await db.update(userDevices)
        .set({ lastSeenAt: new Date(), ipAddress: input.ipAddress })
        .where(eq(userDevices.id, pendingMatch.id));
      const [refreshed] = await db.select().from(userDevices).where(eq(userDevices.id, pendingMatch.id));
      return { device: refreshed, setNewCookie: true };
    }
  }

  // 3. No reusable device found. Create a fresh device row + new cookie token.
  const token = randomToken();
  const status = input.autoApprove ? "approved" : "pending";
  const [device] = await db.insert(userDevices).values({
    userId: input.userId,
    deviceToken: token,
    deviceLabel: input.deviceLabel.slice(0, 200),
    userAgent: input.userAgent?.slice(0, 500),
    ipAddress: input.ipAddress?.slice(0, 64),
    status,
    approvedAt: input.autoApprove ? new Date() : null,
    approvedByUserId: input.autoApprove ? input.userId : null,
    lastSeenAt: new Date(),
  }).returning();
  return { device, setNewCookie: true };
}

export async function createSession(input: {
  userId: number;
  deviceId: number;
}): Promise<{ token: string }> {
  const token = randomToken();
  await db.insert(userSessions).values({
    userId: input.userId,
    deviceId: input.deviceId,
    sessionToken: token,
    loginAt: new Date(),
    lastActivityAt: new Date(),
  });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, input.userId));
  return { token };
}

export type SessionLookup =
  | { kind: "ok"; user: User; sessionId: number; deviceId: number }
  | { kind: "expired" }
  | { kind: "logged_out" }
  | { kind: "missing" }
  | { kind: "device_revoked" }
  | { kind: "user_inactive" };

export async function lookupSessionFromCookie(cookieHeader: string | undefined): Promise<SessionLookup> {
  const raw = parseCookie(cookieHeader, SESSION_COOKIE_NAME);
  if (!raw) return { kind: "missing" };
  const token = verifySignedToken(raw);
  if (!token) return { kind: "missing" };
  const [sess] = await db.select().from(userSessions).where(eq(userSessions.sessionToken, token));
  if (!sess) return { kind: "missing" };
  if (sess.loggedOutAt) return { kind: "logged_out" };
  const [u] = await db.select().from(users).where(eq(users.id, sess.userId));
  if (!u) return { kind: "missing" };
  if (!u.isActive) return { kind: "user_inactive" };
  // Verify device still approved.
  const [dev] = await db.select().from(userDevices).where(eq(userDevices.id, sess.deviceId));
  if (!dev) return { kind: "missing" };
  if (dev.status !== "approved") return { kind: "device_revoked" };
  // Enforce session policy.
  const now = Date.now();
  const lastActivityMs = sess.lastActivityAt.getTime();
  const loginMs = sess.loginAt.getTime();
  const policy = u.sessionPolicy as SessionPolicy;
  const idleMs = getIdleTimeoutMs(policy);
  if (idleMs !== null) {
    if (now - lastActivityMs > idleMs) return { kind: "expired" };
  } else {
    const maxAge = getMaxAgeMs(policy, loginMs);
    if (maxAge !== null) {
      if (now - loginMs > maxAge) return { kind: "expired" };
    } else {
      // Unknown/unrecognised policy value — fail closed with a 1-hour idle limit
      // rather than allowing an indefinitely-valid session.
      const FALLBACK_IDLE_MS = 60 * 60 * 1000;
      if (now - lastActivityMs > FALLBACK_IDLE_MS) return { kind: "expired" };
    }
  }
  return { kind: "ok", user: u, sessionId: sess.id, deviceId: sess.deviceId };
}

export async function touchSessionActivity(sessionId: number, deviceId: number): Promise<void> {
  await db.update(userSessions).set({ lastActivityAt: new Date() }).where(eq(userSessions.id, sessionId));
  await db.update(userDevices).set({ lastSeenAt: new Date() }).where(eq(userDevices.id, deviceId));
}

export async function logoutSessionByToken(cookieHeader: string | undefined): Promise<void> {
  const raw = parseCookie(cookieHeader, SESSION_COOKIE_NAME);
  if (!raw) return;
  const token = verifySignedToken(raw);
  if (!token) return;
  await db.update(userSessions)
    .set({ loggedOutAt: new Date() })
    .where(eq(userSessions.sessionToken, token));
}

export async function logoutAllSessionsForDevice(deviceId: number): Promise<void> {
  await db.update(userSessions)
    .set({ loggedOutAt: new Date() })
    .where(and(eq(userSessions.deviceId, deviceId), isNull(userSessions.loggedOutAt)));
}

// =================================================================
// Express middleware
// =================================================================

declare module "express-serve-static-core" {
  interface Request {
    authUser?: User;
    authPermissions?: PermissionMatrix;
    authSessionId?: number;
    authDeviceId?: number;
  }
}

// Unauthenticated endpoints. Estimator portal uses a separate cookie and is
// kept entirely outside this module.
export const PUBLIC_API_PATHS = new Set<string>([
  "/api/auth/login",
  "/api/auth/me",
  "/api/auth/logout",
  "/api/auth/device-status",
  // Feature flags — read before the user is authenticated.
  "/api/config",
  // Estimator portal — separate auth.
  "/api/estimator/session",
  // Estimator guide PDF — gated by estimator admin cookie inside the handler.
  "/api/admin/estimator-guide.pdf",
]);

export function isPublicApiPath(path: string): boolean {
  if (PUBLIC_API_PATHS.has(path)) return true;
  if (path.startsWith("/api/estimator/")) return true;
  return false;
}

// Paths where we try to populate req.authUser if a session exists, but
// don't block the request if no session is present.  Used for the mix
// calculator API so both estimator-portal users (cookie only) and
// logged-in main-app users (session cookie) can reach the same handlers.
export function isOptionalAuthPath(path: string): boolean {
  if (path.startsWith("/api/mix-estimates")) return true;
  if (path.startsWith("/api/price-scenarios")) return true;
  return false;
}

// Like requireAuth but never returns 401 — it simply skips populating
// req.authUser when no valid session is found.
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const sess = await lookupSessionFromCookie(req.headers.cookie);
    if (sess.kind === "ok") {
      req.authUser = sess.user;
      req.authSessionId = sess.sessionId;
      req.authDeviceId = sess.deviceId;
      req.authPermissions = await loadUserPermissionsMatrix(sess.user.id);
      touchSessionActivity(sess.sessionId, sess.deviceId).catch(() => {});
    }
  } catch {
    // silently ignore — treat as unauthenticated
  }
  next();
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
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
    req.authUser = sess.user;
    req.authSessionId = sess.sessionId;
    req.authDeviceId = sess.deviceId;
    req.authPermissions = await loadUserPermissionsMatrix(sess.user.id);
    // Touch activity asynchronously (not awaited) — never blocks the request.
    touchSessionActivity(sess.sessionId, sess.deviceId).catch(() => {});
    next();
  } catch (err) {
    console.error("requireAuth error:", err);
    res.status(500).json({ error: "auth_internal_error" });
  }
}

export function requirePermission(section: SectionKey, action: Action) {
  return function (req: Request, res: Response, next: NextFunction) {
    const u = req.authUser;
    const m = req.authPermissions;
    if (!u || !m) return res.status(401).json({ error: "not_authenticated" });
    if (u.isAdmin) return next();
    if (m[section] && m[section][action]) return next();
    return res.status(403).json({ error: "forbidden", section, action });
  };
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser) return res.status(401).json({ error: "not_authenticated" });
  if (!req.authUser.isAdmin) return res.status(403).json({ error: "admin_required" });
  next();
}

// =================================================================
// Bootstrap admin (runs at server startup).
// =================================================================

export async function ensureBootstrapAdmin(): Promise<void> {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "";
  // If no admin exists at all, the bootstrap secrets MUST be present.
  const [existingAdmin] = await db.select().from(users).where(eq(users.isAdmin, true)).limit(1);
  if (existingAdmin) return;
  if (!email || !password) {
    console.warn("[auth] No admin user exists yet, but BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD are not set. The login screen will be unusable until you provide them and restart.");
    return;
  }
  if (password.length < 8) {
    console.warn("[auth] BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters. Refusing to create bootstrap admin.");
    return;
  }
  // Make sure no user with that email exists already (defensive).
  const existingByEmail = await getUserByEmail(email);
  if (existingByEmail) {
    // Promote them to admin so the operator can sign in.
    await db.update(users).set({
      isAdmin: true,
      isActive: true,
    }).where(eq(users.id, existingByEmail.id));
    await setUserPermissions(existingByEmail.id, fullMatrix());
    console.log(`[auth] Promoted existing user ${email} to admin (bootstrap).`);
    return;
  }
  const u = await createUserRow({
    email,
    password,
    fullName: "Administrator",
    isAdmin: true,
    sessionPolicy: "sticky",
  });
  await setUserPermissions(u.id, fullMatrix());
  console.log(`[auth] Bootstrap admin created: ${email}`);
}

// =================================================================
// Misc helpers used by routes.ts
// =================================================================

export function describeUserAgent(ua: string | undefined): string {
  if (!ua) return "Unknown device";
  const s = ua.toLowerCase();
  let os = "Unknown OS";
  if (s.includes("windows")) os = "Windows";
  else if (s.includes("mac os x") || s.includes("macintosh")) os = "macOS";
  else if (s.includes("android")) os = "Android";
  else if (s.includes("iphone") || s.includes("ipad") || s.includes("ios")) os = "iOS";
  else if (s.includes("linux")) os = "Linux";
  let browser = "Browser";
  if (s.includes("edg/")) browser = "Edge";
  else if (s.includes("chrome/") && !s.includes("edg/")) browser = "Chrome";
  else if (s.includes("firefox/")) browser = "Firefox";
  else if (s.includes("safari/") && !s.includes("chrome/")) browser = "Safari";
  return `${browser} on ${os}`;
}

export function getClientIp(req: Request): string | undefined {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || undefined;
}

// Task #278 — one-time migration: when the schema added separate
// `can_delete` and `can_export` columns (both default false), existing rows
// had the new columns zeroed out. This migration propagates the prior combined
// values: can_delete ← can_edit, can_export ← can_view_reports for every row.
// A flag in app_settings ensures it runs exactly once — subsequent startups
// are a no-op so intentional "edit without delete" splits set by an admin
// after the migration are never overwritten.
const SPLIT_PERMS_FLAG = "perm_v278_split_done";
// Task #280 — one-time flag recording that the email-nullable / phone-login
// schema transition has been applied. No data transformation is needed because
// all pre-existing rows have a valid email and NULL phone, which is still
// valid under the new schema. The flag just confirms the migration ran so
// future restarts skip it immediately.
const PHONE_LOGIN_MIGRATION_FLAG = "phone_login_v280_done";

export async function migrateEmailPhoneSchema(): Promise<{ skipped: boolean }> {
  // IDEMPOTENCY: category (B) — IDEMPOTENT OPERATION.
  // Primary guard: app_settings key stored in PHONE_LOGIN_MIGRATION_FLAG.
  // This migration performs no data writes — it only records that the schema
  // transition has been acknowledged.  If the flag is deleted and it re-runs,
  // it simply inserts the flag again with no side-effects.
  const existing = await db.select().from(appSettings).where(eq(appSettings.key, PHONE_LOGIN_MIGRATION_FLAG));
  if (existing.length > 0) {
    console.log("migrateEmailPhoneSchema: already applied, skipping.");
    return { skipped: true };
  }
  // Mark the migration as applied. No row-level changes required — all existing
  // users have a non-null email and a null phone, which satisfies the new
  // "at least one of email/phone must be set" constraint without modification.
  await db.insert(appSettings).values({ key: PHONE_LOGIN_MIGRATION_FLAG, value: new Date().toISOString() });
  console.log("migrateEmailPhoneSchema: schema transition recorded (email nullable, phone column enabled).");
  return { skipped: false };
}

const PLANT_SUB_PERMS_FLAG = "perm_v313_plant_sub_perms_done";

export async function backfillPlantSubPermissions(): Promise<{ inserted: number; skipped: boolean }> {
  // IDEMPOTENCY: category (B) — IDEMPOTENT OPERATION.
  // Primary guard: app_settings key stored in PLANT_SUB_PERMS_FLAG.
  // The INSERT uses ON CONFLICT DO NOTHING, so re-running after the flag is
  // deleted inserts zero rows (the permission rows already exist) and merely
  // re-writes the flag.  No data is duplicated or overwritten.
  const existing = await db.select().from(appSettings).where(eq(appSettings.key, PLANT_SUB_PERMS_FLAG));
  if (existing.length > 0) {
    console.log("backfillPlantSubPermissions: already applied, skipping.");
    return { inserted: 0, skipped: true };
  }
  const plantSubKeys = ["plant_variance", "plant_audit", "plant_diesel_proc", "plant_bitumen", "plant_ldo"];
  let totalInserted = 0;
  await db.transaction(async (tx) => {
    for (const newKey of plantSubKeys) {
      const result = await tx.execute(sql`
        INSERT INTO user_permissions (user_id, section_key, can_view, can_create, can_edit, can_delete, can_view_reports, can_export)
        SELECT user_id, ${newKey}, can_view, can_create, can_edit, can_delete, can_view_reports, can_export
        FROM user_permissions
        WHERE section_key = 'plant_stock'
        ON CONFLICT (user_id, section_key) DO NOTHING
        RETURNING id
      `);
      totalInserted += result.rows.length;
    }
    await tx.insert(appSettings).values({ key: PLANT_SUB_PERMS_FLAG, value: new Date().toISOString() });
  });
  console.log(`backfillPlantSubPermissions: inserted ${totalInserted} new permission rows.`);
  return { inserted: totalInserted, skipped: false };
}

export async function backfillSplitPermissions(): Promise<{ deleteUpdated: number; exportUpdated: number; skipped: boolean }> {
  // IDEMPOTENCY: category (C) — DOCUMENTED RISK.
  // Primary guard: app_settings key stored in SPLIT_PERMS_FLAG.
  //
  // If the flag is deleted and this migration re-runs, the UPDATE logic is:
  //   can_delete ← can_edit   WHERE can_delete = false AND can_edit = true
  //   can_export ← can_view_reports  WHERE can_export = false AND can_view_reports = true
  //
  // RISK: if an admin intentionally set can_delete=false while can_edit=true
  // (a deliberate "edit but no delete" split) AFTER the original migration ran,
  // a spurious re-run would silently re-set can_delete=true for those rows,
  // undoing the admin's intentional restriction.  The same applies to
  // can_export / can_view_reports splits.
  //
  // Mitigation: this is bounded to users that have can_edit=true but
  // can_delete=false at the time of re-run.  If you need to perform a manual
  // DB reset, preserve the app_settings migration flag row (key=SPLIT_PERMS_FLAG)
  // or manually re-apply any intentional permission splits afterward.
  const existing = await db.select().from(appSettings).where(eq(appSettings.key, SPLIT_PERMS_FLAG));
  if (existing.length > 0) {
    console.log("backfillSplitPermissions: already applied, skipping.");
    return { deleteUpdated: 0, exportUpdated: 0, skipped: true };
  }
  const result = await db.transaction(async (tx) => {
    const deleteRows = await tx.update(userPermissions)
      .set({ canDelete: sql`${userPermissions.canEdit}` })
      .where(and(eq(userPermissions.canDelete, false), eq(userPermissions.canEdit, true)))
      .returning({ id: userPermissions.id });
    const exportRows = await tx.update(userPermissions)
      .set({ canExport: sql`${userPermissions.canViewReports}` })
      .where(and(eq(userPermissions.canExport, false), eq(userPermissions.canViewReports, true)))
      .returning({ id: userPermissions.id });
    await tx.insert(appSettings).values({ key: SPLIT_PERMS_FLAG, value: new Date().toISOString() });
    return { deleteUpdated: deleteRows.length, exportUpdated: exportRows.length, skipped: false };
  });
  console.log(`backfillSplitPermissions: delete updated ${result.deleteUpdated}, export updated ${result.exportUpdated}`);
  return result;
}
