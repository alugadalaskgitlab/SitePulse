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
} from "@shared/permissions";
import { and, eq, isNull, desc } from "drizzle-orm";
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

function signToken(token: string): string {
  const hmac = crypto.createHmac("sha256", getSessionSecret()).update(token).digest("hex");
  return `${token}.${hmac}`;
}

function verifySignedToken(val: string | undefined): string | null {
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
        view_reports: r.canViewReports,
      };
    }
  }
  return matrix;
}

export async function setUserPermissions(userId: number, matrix: PermissionMatrix): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(userPermissions).where(eq(userPermissions.userId, userId));
    const rows = SECTION_KEYS.map((k) => {
      const p = matrix[k] || { view: false, create: false, edit: false, view_reports: false };
      return {
        userId,
        sectionKey: k,
        canView: !!p.view,
        canCreate: !!p.create,
        canEdit: !!p.edit,
        canViewReports: !!p.view_reports,
      };
    });
    if (rows.length) await tx.insert(userPermissions).values(rows);
  });
}

export function userHasPermission(
  userOrAdmin: { isAdmin: boolean },
  matrix: PermissionMatrix,
  section: SectionKey,
  action: Action,
): boolean {
  if (userOrAdmin.isAdmin) return true;
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

export async function listAllUsers(): Promise<SafeUser[]> {
  const rows = await db.select().from(users).orderBy(desc(users.isAdmin), users.fullName);
  return rows.map(toSafeUser);
}

export async function createUserRow(input: {
  email: string;
  password: string;
  fullName: string;
  isAdmin?: boolean;
  canUnlockRecords?: boolean;
  sessionPolicy?: SessionPolicy;
}): Promise<User> {
  const passwordHash = await hashPassword(input.password);
  const [row] = await db.insert(users).values({
    email: input.email.trim().toLowerCase(),
    passwordHash,
    fullName: input.fullName.trim(),
    isActive: true,
    isAdmin: !!input.isAdmin,
    canUnlockRecords: !!input.canUnlockRecords,
    sessionPolicy: input.sessionPolicy ?? "strict",
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
  email: string;
  isActive: boolean;
  isAdmin: boolean;
  canUnlockRecords: boolean;
  sessionPolicy: SessionPolicy;
}>): Promise<User | undefined> {
  const update: Record<string, unknown> = {};
  if (patch.fullName !== undefined) update.fullName = patch.fullName.trim();
  if (patch.email !== undefined) update.email = patch.email.trim().toLowerCase();
  if (patch.isActive !== undefined) update.isActive = patch.isActive;
  if (patch.isAdmin !== undefined) update.isAdmin = patch.isAdmin;
  if (patch.canUnlockRecords !== undefined) update.canUnlockRecords = patch.canUnlockRecords;
  if (patch.sessionPolicy !== undefined) update.sessionPolicy = patch.sessionPolicy;
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

export async function ensureDeviceForUser(input: {
  userId: number;
  existingDevice: UserDevice | null;
  deviceLabel: string;
  userAgent?: string;
  ipAddress?: string;
  autoApprove?: boolean;
}): Promise<{ device: UserDevice; setNewCookie: boolean }> {
  // If we already have a device for THIS user, reuse it.
  if (input.existingDevice && input.existingDevice.userId === input.userId) {
    await db.update(userDevices)
      .set({ lastSeenAt: new Date(), userAgent: input.userAgent, ipAddress: input.ipAddress })
      .where(eq(userDevices.id, input.existingDevice.id));
    const [refreshed] = await db.select().from(userDevices).where(eq(userDevices.id, input.existingDevice.id));
    return { device: refreshed, setNewCookie: false };
  }
  // Otherwise create a new device row + new cookie token.
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
  if (policy === "strict") {
    if (now - lastActivityMs > STRICT_IDLE_MINUTES * 60 * 1000) return { kind: "expired" };
  } else {
    if (now - loginMs > STICKY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000) return { kind: "expired" };
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
  // Estimator portal — separate auth.
  "/api/estimator/session",
]);

export function isPublicApiPath(path: string): boolean {
  if (PUBLIC_API_PATHS.has(path)) return true;
  if (path.startsWith("/api/estimator/")) return true;
  return false;
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
      canUnlockRecords: true,
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
    canUnlockRecords: true,
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
