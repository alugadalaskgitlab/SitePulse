import type { Express } from "express";
import type { Server } from "http";
import { storage, StockShortageError } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import * as xlsx from 'xlsx';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { createDprRequestSchema, createPlantReportRequestSchema, insertAdminNotificationSchema, insertMaterialIssueSchema, insertMaterialReturnSchema, insertMaterialOpeningStockSchema, insertSiteMaterialTripSchema, insertSiteSchema, insertBitumenDipReadingSchema, insertLdoFlowReadingSchema, insertLdoDipReadingSchema, insertPersonnelSchema, createPurchaseIndentRequestSchema, createDieselRequirementRequestSchema, createVendorBillRequestSchema, LABOUR_CATEGORIES, LABOUR_GENDERS, EQUIPMENT_TYPES } from "@shared/schema";
import { sendPushToAll, sendTestPush } from "./push";
import { canonicalizeMachineType } from "@shared/canonicalize";
import { aggregateGstBreakdown, aggregateGstSplit, computeBillCgstSgstIgst, computeBillGstByCategory, type GstCategory } from "@shared/vendor-bill-gst";
import { requireAuth, isPublicApiPath } from "./auth";
import {
  registerAuthRoutes,
  assertAdmin,
  assertEdit,
  assertAuthed,
  currentUserName,
  relockResource,
  assertWritable,
} from "./auth-routes";
import type { LockableResourceType } from "@shared/permissions";

const ESTIMATOR_COOKIE = 'hlc_est_role';

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k.trim() === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

function getSessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET environment variable is not set');
  return s;
}

function signRole(role: string): string {
  const hmac = crypto.createHmac('sha256', getSessionSecret()).update(role).digest('hex');
  return `${role}.${hmac}`;
}

function verifyRoleCookie(val: string | undefined): 'admin' | 'manager' | null {
  if (!val) return null;
  const dot = val.indexOf('.');
  if (dot < 0) return null;
  const role = val.slice(0, dot);
  const hmac = val.slice(dot + 1);
  if (role !== 'admin' && role !== 'manager') return null;
  let secret: string;
  try { secret = getSessionSecret(); } catch { return null; }
  const expected = crypto.createHmac('sha256', secret).update(role).digest('hex');
  if (hmac !== expected) return null;
  return role as 'admin' | 'manager';
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ============================================
  // AUTH ROUTES (Task #229) — registered first so they're not gated by
  // the requireAuth middleware below. Estimator portal also uses its own
  // cookie and is bypassed in isPublicApiPath().
  // ============================================
  registerAuthRoutes(app);

  // Global API auth middleware. Applies to every /api/* request except the
  // public auth + estimator endpoints. Populates req.authUser, req.authPermissions.
  // NOTE: req.path is mount-relative (e.g. "/auth/login") because we mount at
  // "/api". Use req.originalUrl (sans query) so isPublicApiPath sees the full
  // "/api/..." path it's defined against. Otherwise estimator + login routes
  // would be force-blocked by requireAuth.
  app.use("/api", (req, res, next) => {
    const fullPath = (req.originalUrl || req.url).split("?")[0];
    if (isPublicApiPath(fullPath)) return next();
    return requireAuth(req, res, next);
  });

  // ============================================
  // ESTIMATOR PORTAL SESSION AUTH
  // ============================================

  app.post('/api/estimator/session', async (req, res) => {
    try {
      const { pin } = req.body || {};
      if (!pin || typeof pin !== 'string') {
        return res.status(400).json({ error: 'PIN required' });
      }
      const adminPin = await storage.getSetting('admin_pin');
      const managerPin = await storage.getSetting('manager_pin');
      let role: 'admin' | 'manager' | null = null;
      if (adminPin && pin === adminPin) role = 'admin';
      else if (managerPin && pin === managerPin) role = 'manager';
      if (!role) {
        return res.status(401).json({ error: 'Invalid PIN' });
      }
      const cookieVal = encodeURIComponent(signRole(role));
      const maxAge = 7 * 24 * 60 * 60;
      res.setHeader('Set-Cookie', `${ESTIMATOR_COOKIE}=${cookieVal}; Path=/; Max-Age=${maxAge}; SameSite=Lax`);
      res.json({ role });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/estimator/session', (req, res) => {
    const cookieVal = parseCookie(req.headers.cookie, ESTIMATOR_COOKIE);
    const role = verifyRoleCookie(cookieVal ? decodeURIComponent(cookieVal) : undefined);
    if (!role) return res.status(401).json({ error: 'Not authenticated' });
    res.json({ role });
  });

  app.delete('/api/estimator/session', (_req, res) => {
    res.setHeader('Set-Cookie', `${ESTIMATOR_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`);
    res.json({ success: true });
  });

  // Legacy login page redirect → new React login
  app.get('/mix-calculator/login', (req, res) => {
    const returnTo = (req.query?.returnTo as string) || '/estimator-hub';
    res.redirect(302, `/estimator-login?returnTo=${encodeURIComponent(returnTo)}`);
  });

  app.get('/mix-calculator', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const root = process.env.NODE_ENV === 'production'
      ? path.join(process.cwd(), 'dist', 'public')
      : path.join(process.cwd(), 'client', 'public');
    res.sendFile('mix-calculator.html', { root });
  });

  // List DPRs with filters
  app.get(api.dprs.list.path, async (req, res) => {
    try {
      const filters = {
        site: req.query.site as string | undefined,
        engineer: req.query.engineer as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const dprs = await storage.getDprs(filters);
      res.json(dprs);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch DPRs" });
    }
  });

  // Get all DPRs with full details (for admin reports)
  app.get("/api/dprs/with-details", async (req, res) => {
    try {
      const dprs = await storage.getDprsWithDetails();
      res.json(dprs);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch DPRs with details" });
    }
  });

  // Get site material logs with filters (for Material Summary feature)
  app.get("/api/dprs/material-summary", async (req, res) => {
    try {
      const filters = {
        site: req.query.site as string | undefined,
        material: req.query.material as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const materialLogs = await storage.getSiteMaterialLogs(filters);
      res.json(materialLogs);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch material summary" });
    }
  });

  // ============================================
  // SITE MATERIAL TRIPS (Quick Entry)
  // ============================================

  app.get("/api/materials/suppliers", async (req, res) => {
    try {
      const suppliers = await storage.getMaterialSuppliers();
      res.json(suppliers);
    } catch (err) {
      console.error("Error fetching material suppliers:", err);
      res.status(500).json({ message: "Failed to fetch material suppliers" });
    }
  });

  // Get all site material trips (with optional filters)
  app.get("/api/materials-received", async (req, res) => {
    try {
      const filters = {
        site: req.query.site as string | undefined,
        material: req.query.material as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        supplier: req.query.supplier as string | undefined,
      };
      const results = await storage.getAllMaterialsReceived(filters);
      res.json(results);
    } catch (err) {
      console.error("Error fetching materials received:", err);
      res.status(500).json({ message: "Failed to fetch materials received" });
    }
  });

  app.get("/api/site-material-trips", async (req, res) => {
    try {
      const filters = {
        site: req.query.site as string | undefined,
        material: req.query.material as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const trips = await storage.getSiteMaterialTrips(filters);
      res.json(trips);
    } catch (err) {
      console.error("Error fetching site material trips:", err);
      res.status(500).json({ message: "Failed to fetch site material trips" });
    }
  });

  // Create a new site material trip
  app.post("/api/site-material-trips", async (req, res) => {
    try {
      const input = insertSiteMaterialTripSchema.parse(req.body);
      const trip = await storage.createSiteMaterialTrip(input);
      sendPushToAll("Site Material Trip Added", `${input.material || 'Material'} - ${input.site || ''}`, "/site-reports").catch(() => {});
      res.status(201).json(trip);
    } catch (err) {
      console.error("Error creating site material trip:", err);
      res.status(500).json({ message: "Failed to create site material trip" });
    }
  });

  // Update a site material trip
  app.patch("/api/site-material-trips/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = insertSiteMaterialTripSchema.partial().parse(req.body);
      const trip = await storage.updateSiteMaterialTrip(id, input);
      sendPushToAll("Site Material Trip Updated", `Trip #${id} updated`, "/site-reports").catch(() => {});
      res.json(trip);
    } catch (err) {
      console.error("Error updating site material trip:", err);
      res.status(500).json({ message: "Failed to update site material trip" });
    }
  });

  // Delete a site material trip
  app.delete("/api/site-material-trips/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteSiteMaterialTrip(id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting site material trip:", err);
      res.status(500).json({ message: "Failed to delete site material trip" });
    }
  });

  // ============================================
  // SITES MASTER
  // ============================================

  app.get("/api/sites", async (req, res) => {
    try {
      const sitesList = await storage.getSites();
      res.json(sitesList);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch sites" });
    }
  });

  app.post("/api/sites", async (req, res) => {
    try {
      const input = insertSiteSchema.parse(req.body);
      const site = await storage.createSite(input);
      res.status(201).json(site);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create site" });
    }
  });

  app.patch("/api/sites/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const site = await storage.updateSite(id, req.body);
      if (!site) return res.status(404).json({ message: "Site not found" });
      res.json(site);
    } catch (err) {
      res.status(500).json({ message: "Failed to update site" });
    }
  });

  app.delete("/api/sites/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteSite(id);
      if (!deleted) return res.status(404).json({ message: "Site not found" });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete site" });
    }
  });

  app.post("/api/sites/seed", async (req, res) => {
    try {
      const count = await storage.seedSitesFromDprs();
      res.json({ seeded: count });
    } catch (err) {
      res.status(500).json({ message: "Failed to seed sites" });
    }
  });

  // ============================================
  // PERSONNEL MASTER
  // ============================================

  app.get("/api/personnel", async (req, res) => {
    try {
      const includeInactive = req.query.includeInactive === "true";
      const list = await storage.getPersonnel(includeInactive);
      res.json(list);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch personnel" });
    }
  });

  app.post("/api/personnel", async (req, res) => {
    try {
      const parsed = insertPersonnelSchema.parse(req.body);
      const person = await storage.createPersonnel(parsed);
      res.status(201).json(person);
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ message: "Invalid data", errors: err.errors });
      res.status(500).json({ message: "Failed to create personnel" });
    }
  });

  app.patch("/api/personnel/:id", async (req, res) => {
    try {
      const parsed = insertPersonnelSchema.partial().parse(req.body);
      const updated = await storage.updatePersonnel(Number(req.params.id), parsed);
      if (!updated) return res.status(404).json({ message: "Personnel not found" });
      res.json(updated);
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ message: "Invalid data", errors: err.errors });
      res.status(500).json({ message: "Failed to update personnel" });
    }
  });

  app.patch("/api/personnel/:id/toggle-active", async (req, res) => {
    try {
      const updated = await storage.togglePersonnelActive(Number(req.params.id));
      if (!updated) return res.status(404).json({ message: "Personnel not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to toggle personnel status" });
    }
  });

  // ============================================
  // SITE PURCHASES REPORT
  // ============================================

  app.get("/api/site-purchases", async (req, res) => {
    try {
      const filters = {
        site: req.query.site as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const purchases = await storage.getAllSitePurchases(filters);
      res.json(purchases);
    } catch (err) {
      console.error("Error fetching site purchases:", err);
      res.status(500).json({ message: "Failed to fetch site purchases" });
    }
  });

  app.put("/api/site-purchases/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const id = Number(req.params.id);
      const { data } = req.body;

      const updateSchema = z.object({
        itemDescription: z.string().optional(),
        quantity: z.number().nullable().optional(),
        uom: z.string().nullable().optional(),
        vendor: z.string().nullable().optional(),
        billNo: z.string().nullable().optional(),
        amount: z.number().nullable().optional(),
      });

      const validatedData = updateSchema.parse(data);
      
      const updated = await storage.updateSitePurchase(id, validatedData);
      if (!updated) {
        return res.status(404).json({ message: "Site purchase not found" });
      }
      sendPushToAll("Site Purchase Updated", `Purchase #${id} updated by admin`, "/site-reports").catch(() => {});
      res.json(updated);
    } catch (err: any) {
      if (err?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid data format" });
      }
      console.error("Error updating site purchase:", err);
      res.status(500).json({ message: "Failed to update site purchase" });
    }
  });

  // ============================================
  // ADMIN NOTIFICATIONS
  // ============================================
  
  app.get("/api/notifications", async (req, res) => {
    try {
      const notifications = await storage.getNotifications();
      res.json(notifications);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.get("/api/notifications/unread-count", async (req, res) => {
    try {
      const count = await storage.getUnreadNotificationCount();
      res.json({ count });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch unread count" });
    }
  });

  app.post("/api/notifications", async (req, res) => {
    try {
      const input = insertAdminNotificationSchema.parse(req.body);
      const notification = await storage.createNotification(input);
      res.status(201).json(notification);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Failed to create notification" });
    }
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      await storage.markNotificationRead(Number(req.params.id));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  app.patch("/api/notifications/read-all", async (req, res) => {
    try {
      await storage.markAllNotificationsRead();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to mark all notifications as read" });
    }
  });

  app.delete("/api/notifications/:id", async (req, res) => {
    try {
      await storage.deleteNotification(Number(req.params.id));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete notification" });
    }
  });

  // ============================================
  // PUSH NOTIFICATIONS
  // ============================================

  app.get("/api/push/vapid-key", (req, res) => {
    const key = process.env.VAPID_PUBLIC_KEY || "";
    res.json({ publicKey: key });
  });

  app.post("/api/push/subscribe", async (req, res) => {
    try {
      const { subscription, pin } = req.body;
      if (!subscription || !pin) {
        return res.status(400).json({ message: "Subscription and PIN required" });
      }
      if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
        return res.status(400).json({ message: "Invalid subscription data — missing endpoint or keys" });
      }
      const managerPin = await storage.getSetting("manager_pin");
      const adminPin = await storage.getSetting("admin_pin");
      if (!managerPin && !adminPin) {
        return res.status(500).json({ message: "No PINs configured in settings" });
      }
      const isAdminPin = !!(adminPin && pin === adminPin);
      const isManagerPin = !!(managerPin && pin === managerPin);
      if (!isAdminPin && !isManagerPin) {
        return res.status(403).json({ message: "Invalid PIN" });
      }
      // Role is derived server-side from the PIN that authenticated, not
      // from anything the client can spoof. Used to route targeted alerts
      // (e.g. persistent over-consumer) to the right audience.
      const role = isAdminPin ? "admin" : "manager";
      const sub = await storage.createPushSubscription({
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        label: req.body.label || null,
        role,
      });
      sendTestPush(subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth).catch(() => {});
      res.status(201).json(sub);
    } catch (err: any) {
      console.error("[Push] Subscribe error:", err);
      res.status(500).json({ message: err.message || "Failed to subscribe" });
    }
  });

  app.delete("/api/push/unsubscribe", async (req, res) => {
    try {
      const { endpoint } = req.body;
      if (!endpoint) {
        return res.status(400).json({ message: "Endpoint required" });
      }
      await storage.deletePushSubscriptionByEndpoint(endpoint);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to unsubscribe" });
    }
  });

  app.get("/api/push/subscriptions", async (req, res) => {
    try {
      const subs = await storage.getAllPushSubscriptions();
      res.json(subs);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch subscriptions" });
    }
  });

  // Get single DPR details
  app.get(api.dprs.get.path, async (req, res) => {
    const dpr = await storage.getDpr(Number(req.params.id));
    if (!dpr) {
      return res.status(404).json({ message: 'DPR not found' });
    }
    const progressIds = dpr.progress?.map(p => p.id) || [];
    const actPersonnel = progressIds.length > 0 ? await storage.getActivityPersonnel(progressIds) : [];
    const enrichedProgress = dpr.progress?.map(p => ({
      ...p,
      personnelIds: actPersonnel.filter(ap => ap.progressEntryId === p.id).map(ap => ap.personnelId),
    }));
    res.json({ ...dpr, progress: enrichedProgress });
  });

  // Create new DPR
  app.post(api.dprs.create.path, async (req, res) => {
    try {
      const input = api.dprs.create.input.parse(req.body);
      const dpr = await storage.createDpr(input, input.clientTimestamp);
      await storage.createNotification({ type: "success", title: "New DPR Submitted", message: `${input.engineer || 'Engineer'} submitted DPR for ${input.site} (${input.date})`, isRead: 0 });
      sendPushToAll("New DPR Submitted", `${input.engineer || 'Engineer'} - ${input.site} - ${input.date}`, "/site-reports").catch(() => {});
      res.status(201).json(dpr);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Failed to create DPR" });
    }
  });

  // Export to Excel
  app.get(api.dprs.export.path, async (req, res) => {
    try {
      const dprs = await storage.getDprs();
      
      // Simple export of just the headers for MVP
      // In a real app, we might want to flatten all details
      const ws = xlsx.utils.json_to_sheet(dprs);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "DPRs");
      
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Disposition', 'attachment; filename="dprs.xlsx"');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buf);
    } catch (err) {
      res.status(500).json({ message: "Failed to export data" });
    }
  });

  // NOTE: Legacy PIN endpoints (/api/auth/verify-pin, /api/admin/change-pin,
  // /api/admin/change-manager-pin) were removed in Task #229 in favour of
  // real email/password login + per-user permissions. The estimator portal
  // (/api/estimator/*) keeps its own PIN-based auth and is unaffected.

  // ============================================
  // PLANT ALERT THRESHOLDS (boiler / heating session post-save alerts)
  // ============================================
  // GET is open (read-only), PUT requires admin PIN.
  app.get("/api/plant-module/alert-thresholds", async (_req, res) => {
    try {
      const thresholds = await storage.getPlantAlertThresholds();
      res.json(thresholds);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch alert thresholds" });
    }
  });

  app.put("/api/plant-module/alert-thresholds", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const { plantAlertThresholdsSchema } = await import("@shared/schema");
      const { pin: _pin, ...rest } = req.body || {};
      const parsed = plantAlertThresholdsSchema.parse(rest);
      const saved = await storage.setPlantAlertThresholds(parsed);
      res.json(saved);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      res.status(500).json({ message: err?.message || "Failed to update alert thresholds" });
    }
  });

  // ============================================
  // VARIANCE HIGHLIGHT THRESHOLD (PlantEquipmentUsage daily/monthly footer)
  // ============================================
  // GET is open (read-only), PUT requires admin PIN.
  app.get("/api/plant-module/variance-highlight-threshold", async (_req, res) => {
    try {
      const [thresholdPct, overrides] = await Promise.all([
        storage.getVarianceHighlightThresholdPct(),
        storage.getVarianceHighlightThresholdOverrides(),
      ]);
      res.json({ thresholdPct, overrides });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch variance threshold" });
    }
  });

  app.put("/api/plant-module/variance-highlight-threshold", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const { thresholdPct, overrides } = req.body || {};
      let savedThreshold: number | undefined;
      if (thresholdPct !== undefined) {
        const num = Number(thresholdPct);
        if (!Number.isFinite(num) || num < 0 || num > 100) {
          return res.status(400).json({ message: "Threshold must be a number between 0 and 100", field: "thresholdPct" });
        }
        savedThreshold = await storage.setVarianceHighlightThresholdPct(num);
      }
      let savedOverrides: Record<string, number> | undefined;
      if (overrides !== undefined) {
        if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
          return res.status(400).json({ message: "Overrides must be an object", field: "overrides" });
        }
        const normalised: Record<string, number> = {};
        const allowedTypes = new Set<string>(EQUIPMENT_TYPES);
        for (const [k, v] of Object.entries(overrides as Record<string, unknown>)) {
          const key = String(k || "").trim();
          if (!key) continue;
          if (!allowedTypes.has(key)) {
            return res.status(400).json({ message: `Unknown equipment type "${key}"`, field: "overrides" });
          }
          const num = Number(v);
          if (!Number.isFinite(num) || num < 0 || num > 100) {
            return res.status(400).json({ message: `Override for "${key}" must be between 0 and 100`, field: "overrides" });
          }
          normalised[key] = num;
        }
        savedOverrides = await storage.setVarianceHighlightThresholdOverrides(normalised);
      }
      const finalThreshold = savedThreshold ?? await storage.getVarianceHighlightThresholdPct();
      const finalOverrides = savedOverrides ?? await storage.getVarianceHighlightThresholdOverrides();
      res.json({ thresholdPct: finalThreshold, overrides: finalOverrides });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to update variance threshold" });
    }
  });

  // (change-manager-pin endpoint removed — see Task #229 note above.)


  // Create a new version of DPR with edited data
  // Creates a copy with timestamp instead of overwriting original
  const versionSchema = z.object({
    pin: z.string().optional(),
    editedBy: z.enum(["manager", "admin", "engineer"]).optional(),
    data: createDprRequestSchema,
    clientTimestamp: z.string().optional(),
  });

  app.post("/api/dprs/:id/version", async (req, res) => {
    try {
      const originalId = Number(req.params.id);
      const input = versionSchema.parse(req.body);

      if (!assertEdit(req, res, "site_dprs")) return;
      const editedBy = input.editedBy || "engineer";

      if (editedBy === "engineer") {
        const original = await storage.getDpr(originalId);
        if (!original) {
          return res.status(404).json({ message: "DPR not found" });
        }
        const equipment = Array.isArray(original.equipment) ? original.equipment : [];
        const hasPendingClosing = equipment.some((e: any) =>
          e.machine && e.openingReading != null && e.closingReading == null
        );
        if (!hasPendingClosing) {
          return res.status(403).json({ message: "Engineer completion only allowed for DPRs with pending closing entries" });
        }
      }

      const newVersion = await storage.createVersionDpr(originalId, input.data, editedBy, input.clientTimestamp);

      const actor = currentUserName(req);
      await storage.createNotification({
        type: "info",
        title: "DPR Updated",
        message: `DPR for ${input.data.site} (${input.data.date}) was edited by ${actor}`,
        isRead: 0,
      });
      sendPushToAll("DPR Updated", `${actor} edited DPR for ${input.data.site} (${input.data.date})`, "/site-reports").catch(() => {});

      // Re-lock the DPR after a save (record-locking policy, Task #229)
      try { await relockResource("dpr", newVersion.id, req.authUser!.id); } catch {}

      res.status(201).json(newVersion);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Failed to create version" });
    }
  });

  // Clone DPR (for manager edits as copies). Requires the user to have edit
  // permission on the site_dprs section.
  const cloneSchema = z.object({
    editedBy: z.enum(["manager", "admin"]).optional(),
    pin: z.string().optional(),
    clientTimestamp: z.string().optional(),
  });

  app.post("/api/dprs/:id/clone", async (req, res) => {
    try {
      if (!assertEdit(req, res, "site_dprs")) return;
      const id = Number(req.params.id);
      const input = cloneSchema.parse(req.body);
      const editedBy = input.editedBy || (req.authUser?.isAdmin ? "admin" : "manager");

      const cloned = await storage.cloneDpr(id, editedBy, input.clientTimestamp);
      if (!cloned) {
        return res.status(404).json({ message: "Original DPR not found" });
      }

      const actor = currentUserName(req);
      await storage.createNotification({
        type: "success",
        title: "DPR Cloned",
        message: `DPR cloned for ${cloned.site} (${cloned.date}) by ${actor}`,
        isRead: 0,
      });
      sendPushToAll("DPR Cloned", `${cloned.site} - ${cloned.date}`, "/site-reports").catch(() => {});

      try { await relockResource("dpr", cloned.id, req.authUser!.id); } catch {}

      res.status(201).json(cloned);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Failed to clone DPR" });
    }
  });

  // Delete DPR (admin only)
  app.delete("/api/dprs/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const id = Number(req.params.id);
      const dprToDelete = await storage.getDpr(id);
      const deleted = await storage.deleteDpr(id);
      if (!deleted) {
        return res.status(404).json({ message: "DPR not found" });
      }
      await storage.createNotification({ type: "warning", title: "DPR Deleted", message: `DPR for ${dprToDelete?.site || 'unknown'} (${dprToDelete?.date || ''}) was deleted by admin`, isRead: 0 });
      sendPushToAll("DPR Deleted", `${dprToDelete?.site || 'unknown'} - ${dprToDelete?.date || ''}`, "/site-reports").catch(() => {});
      res.status(204).send();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Failed to delete DPR" });
    }
  });

  // Plant Report Routes
  app.get("/api/plant", async (req, res) => {
    try {
      const reports = await storage.getPlantReports();
      res.json(reports);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch plant reports" });
    }
  });

  app.get("/api/plant/:id", async (req, res) => {
    try {
      const report = await storage.getPlantReport(Number(req.params.id));
      if (!report) {
        return res.status(404).json({ message: "Plant report not found" });
      }
      res.json(report);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch plant report" });
    }
  });

  app.post("/api/plant", async (req, res) => {
    try {
      const input = createPlantReportRequestSchema.parse(req.body);
      const report = await storage.createPlantReport(input);
      sendPushToAll("Plant Report Created", `Plant report for ${input.date}`, "/plant").catch(() => {});
      res.status(201).json(report);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Failed to create plant report" });
    }
  });

  const plantCloneSchema = z.object({
    editedBy: z.enum(["manager", "admin"]).optional(),
    pin: z.string().optional(),
  });

  app.post("/api/plant/:id/clone", async (req, res) => {
    try {
      if (!assertEdit(req, res, "plant_shift_logs")) return;
      const id = Number(req.params.id);
      const input = plantCloneSchema.parse(req.body);
      const editedBy = input.editedBy || (req.authUser?.isAdmin ? "admin" : "manager");

      const cloned = await storage.clonePlantReport(id, editedBy);
      if (!cloned) {
        return res.status(404).json({ message: "Original plant report not found" });
      }
      sendPushToAll("Plant Report Cloned", `Plant report cloned by ${currentUserName(req)}`, "/plant").catch(() => {});
      res.status(201).json(cloned);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Failed to clone plant report" });
    }
  });

  app.patch("/api/plant/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = createPlantReportRequestSchema.parse(req.body);
      const updated = await storage.updatePlantReport(id, input);
      if (!updated) {
        return res.status(404).json({ message: "Plant report not found" });
      }
      sendPushToAll("Plant Report Updated", `Plant report ${id} updated`, "/plant").catch(() => {});
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Failed to update plant report" });
    }
  });

  app.delete("/api/plant/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const id = Number(req.params.id);
      const deleted = await storage.deletePlantReport(id);
      if (!deleted) {
        return res.status(404).json({ message: "Plant report not found" });
      }
      sendPushToAll("Plant Report Deleted", `Plant report ${id} deleted`, "/plant").catch(() => {});
      res.status(204).send();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Failed to delete plant report" });
    }
  });

  // ============================================
  // PLANT MODULE PHASE-1 - API ROUTES
  // ============================================

  // Party/Job Master
  app.get("/api/plant-module/parties", async (req, res) => {
    try {
      const partiesList = await storage.getParties();
      res.json(partiesList);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch parties" });
    }
  });

  app.post("/api/plant-module/parties", async (req, res) => {
    try {
      const party = await storage.createParty(req.body);
      res.status(201).json(party);
    } catch (err) {
      res.status(500).json({ message: "Failed to create party" });
    }
  });

  app.patch("/api/plant-module/parties/:id", async (req, res) => {
    try {
      const party = await storage.updateParty(Number(req.params.id), req.body);
      if (!party) return res.status(404).json({ message: "Party not found" });
      res.json(party);
    } catch (err) {
      res.status(500).json({ message: "Failed to update party" });
    }
  });

  app.delete("/api/plant-module/parties/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteParty(Number(req.params.id));
      if (!deleted) return res.status(404).json({ message: "Party not found" });
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to delete party" });
    }
  });

  // Plant Materials Master
  app.get("/api/plant-module/materials", async (req, res) => {
    try {
      const materials = await storage.getPlantMaterials();
      res.json(materials);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch materials" });
    }
  });

  app.post("/api/plant-module/materials", async (req, res) => {
    try {
      const material = await storage.createPlantMaterial(req.body);
      res.status(201).json(material);
    } catch (err) {
      res.status(500).json({ message: "Failed to create material" });
    }
  });

  app.patch("/api/plant-module/materials/:id", async (req, res) => {
    try {
      const material = await storage.updatePlantMaterial(Number(req.params.id), req.body);
      if (!material) return res.status(404).json({ message: "Material not found" });
      res.json(material);
    } catch (err) {
      res.status(500).json({ message: "Failed to update material" });
    }
  });

  app.delete("/api/plant-module/materials/:id", async (req, res) => {
    try {
      const deleted = await storage.deletePlantMaterial(Number(req.params.id));
      if (!deleted) return res.status(404).json({ message: "Material not found" });
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to delete material" });
    }
  });

  // Mix Types
  app.get("/api/plant-module/mix-types", async (req, res) => {
    try {
      const types = await storage.getMixTypes();
      res.json(types);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch mix types" });
    }
  });

  app.post("/api/plant-module/mix-types", async (req, res) => {
    try {
      const result = await storage.createMixType(req.body);
      res.status(201).json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to create mix type" });
    }
  });

  app.patch("/api/plant-module/mix-types/:id", async (req, res) => {
    try {
      const result = await storage.updateMixType(Number(req.params.id), req.body);
      if (!result) return res.status(404).json({ message: "Mix type not found" });
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to update mix type" });
    }
  });

  app.delete("/api/plant-module/mix-types/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteMixType(Number(req.params.id));
      if (!deleted) return res.status(404).json({ message: "Mix type not found" });
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to delete mix type" });
    }
  });

  // Mix Templates
  app.get("/api/plant-module/mix-templates", async (req, res) => {
    try {
      const templates = await storage.getMixTemplates();
      res.json(templates);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch mix templates" });
    }
  });

  app.get("/api/plant-module/mix-template-components", async (req, res) => {
    try {
      const components = await storage.getAllMixTemplateComponents();
      res.json(components);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch mix template components" });
    }
  });

  app.get("/api/plant-module/mix-templates/:id", async (req, res) => {
    try {
      const result = await storage.getMixTemplateWithComponents(Number(req.params.id));
      if (!result) return res.status(404).json({ message: "Mix template not found" });
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch mix template" });
    }
  });

  app.post("/api/plant-module/mix-templates", async (req, res) => {
    try {
      const { components, ...template } = req.body;
      const result = await storage.createMixTemplate(template, components);
      res.status(201).json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to create mix template" });
    }
  });

  app.patch("/api/plant-module/mix-templates/:id", async (req, res) => {
    try {
      const { components, ...template } = req.body;
      const result = await storage.updateMixTemplate(Number(req.params.id), template, components);
      if (!result) return res.status(404).json({ message: "Mix template not found" });
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to update mix template" });
    }
  });

  app.delete("/api/plant-module/mix-templates/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteMixTemplate(Number(req.params.id));
      if (!deleted) return res.status(404).json({ message: "Mix template not found" });
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to delete mix template" });
    }
  });

  // Equipment Master
  app.get("/api/plant-module/equipment", async (req, res) => {
    try {
      const includeInactive = req.query.includeInactive === "true";
      const equipmentList = await storage.getEquipmentMaster(includeInactive);
      res.json(equipmentList);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch equipment" });
    }
  });

  app.post("/api/plant-module/equipment", async (req, res) => {
    try {
      const equipment = await storage.createEquipment(req.body);
      res.status(201).json(equipment);
    } catch (err) {
      res.status(500).json({ message: "Failed to create equipment" });
    }
  });

  app.patch("/api/plant-module/equipment/:id", async (req, res) => {
    try {
      const equipment = await storage.updateEquipment(Number(req.params.id), req.body);
      if (!equipment) return res.status(404).json({ message: "Equipment not found" });
      res.json(equipment);
    } catch (err) {
      res.status(500).json({ message: "Failed to update equipment" });
    }
  });

  app.delete("/api/plant-module/equipment/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteEquipment(Number(req.params.id));
      if (!deleted) return res.status(404).json({ message: "Equipment not found" });
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to delete equipment" });
    }
  });

  app.patch("/api/plant-module/equipment/:id/toggle-active", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const allEquipment = await storage.getEquipmentMaster(true);
      const equip = allEquipment.find(e => e.id === id);
      if (!equip) return res.status(404).json({ message: "Equipment not found" });
      const newStatus = equip.isActive === 1 ? 0 : 1;
      const updated = await storage.updateEquipment(id, { isActive: newStatus } as any);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to toggle equipment status" });
    }
  });

  // Material Receipts
  app.get("/api/plant-module/material-receipts", async (req, res) => {
    try {
      const filters = {
        partyId: req.query.partyId ? Number(req.query.partyId) : undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const receipts = await storage.getMaterialReceipts(filters);
      res.json(receipts);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch material receipts" });
    }
  });

  app.post("/api/plant-module/material-receipts", async (req, res) => {
    try {
      const body = { ...req.body };
      if (typeof body.isPlantCommon === 'boolean') {
        body.isPlantCommon = body.isPlantCommon ? 1 : 0;
      }
      const receipt = await storage.createMaterialReceipt(body);
      
      await storage.createNotification({
        type: "info",
        title: "Material Receipt Added",
        message: `New material receipt: ${receipt.quantity} ${receipt.uom} received on ${receipt.date}`,
        isRead: 0,
      });
      sendPushToAll("Material Receipt", `${receipt.quantity} ${receipt.uom} received on ${receipt.date}`, "/plant").catch(() => {});
      
      res.status(201).json(receipt);
    } catch (err) {
      console.error("Error creating material receipt:", err);
      res.status(500).json({ message: "Failed to create material receipt" });
    }
  });

  app.put("/api/plant-module/material-receipts/:id", async (req, res) => {
    try {
      const body = { ...req.body };
      if (typeof body.isPlantCommon === 'boolean') {
        body.isPlantCommon = body.isPlantCommon ? 1 : 0;
      }
      const updated = await storage.updateMaterialReceipt(Number(req.params.id), body);
      if (!updated) return res.status(404).json({ message: "Receipt not found" });
      sendPushToAll("Material Receipt Updated", `Receipt #${req.params.id} updated`, "/plant").catch(() => {});
      res.json(updated);
    } catch (err) {
      console.error("Error updating material receipt:", err);
      res.status(500).json({ message: "Failed to update material receipt" });
    }
  });

  app.delete("/api/plant-module/material-receipts/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteMaterialReceipt(Number(req.params.id));
      if (!deleted) return res.status(404).json({ message: "Receipt not found" });
      sendPushToAll("Material Receipt Deleted", `Receipt #${req.params.id} deleted`, "/plant").catch(() => {});
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to delete material receipt" });
    }
  });

  // Material Issues (issues to sites/parties from central store)
  app.get("/api/plant-module/material-issues", async (req, res) => {
    try {
      const filters = {
        partyId: req.query.partyId ? Number(req.query.partyId) : undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const issues = await storage.getMaterialIssues(filters);
      res.json(issues);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch material issues" });
    }
  });

  app.post("/api/plant-module/material-issues", async (req, res) => {
    try {
      const input = insertMaterialIssueSchema.parse(req.body);
      const issue = await storage.createMaterialIssue(input);
      
      await storage.createNotification({
        type: "warning",
        title: "Material Issue",
        message: `Material issued: ${issue.quantity} ${issue.uom} to ${issue.issuedTo} on ${issue.date}`,
        isRead: 0,
      });
      sendPushToAll("Material Issued", `${issue.quantity} ${issue.uom} to ${issue.issuedTo}`, "/plant").catch(() => {});
      
      res.status(201).json(issue);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: err.errors });
      }
      res.status(500).json({ message: "Failed to create material issue" });
    }
  });

  app.put("/api/plant-module/material-issues/:id", async (req, res) => {
    try {
      const input = insertMaterialIssueSchema.partial().parse(req.body);
      const updated = await storage.updateMaterialIssue(Number(req.params.id), input);
      if (!updated) return res.status(404).json({ message: "Issue not found" });
      sendPushToAll("Material Issue Updated", `Issue #${req.params.id} updated`, "/plant").catch(() => {});
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: err.errors });
      }
      res.status(500).json({ message: "Failed to update material issue" });
    }
  });

  app.delete("/api/plant-module/material-issues/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteMaterialIssue(Number(req.params.id));
      if (!deleted) return res.status(404).json({ message: "Issue not found" });
      sendPushToAll("Material Issue Deleted", `Issue #${req.params.id} deleted`, "/plant").catch(() => {});
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to delete material issue" });
    }
  });

  // Material Returns
  app.get("/api/plant-module/material-returns", async (req, res) => {
    try {
      const filters = {
        materialId: req.query.materialId ? Number(req.query.materialId) : undefined,
        originalIssueId: req.query.originalIssueId ? Number(req.query.originalIssueId) : undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const returns = await storage.getMaterialReturns(filters);
      res.json(returns);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch material returns" });
    }
  });

  app.get("/api/plant-module/material-returns/returned-qty/:issueId", async (req, res) => {
    try {
      const qty = await storage.getReturnedQtyForIssue(Number(req.params.issueId));
      res.json({ returnedQty: qty });
    } catch (err) {
      res.status(500).json({ message: "Failed to get returned quantity" });
    }
  });

  app.post("/api/plant-module/material-returns", async (req, res) => {
    try {
      const input = insertMaterialReturnSchema.parse(req.body);
      const result = await storage.createMaterialReturn(input);

      await storage.createNotification({
        type: "info",
        title: "Material Returned",
        message: `Material returned: ${result.quantity} ${result.uom} from issue #${result.originalIssueId} on ${result.date}`,
        isRead: 0,
      });
      sendPushToAll("Material Returned", `${result.quantity} ${result.uom} returned on ${result.date}`, "/plant/material-returns").catch(() => {});

      res.status(201).json(result);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: err.errors });
      }
      if (err.message?.includes("exceeds remaining")) {
        return res.status(400).json({ message: err.message });
      }
      if (err.message?.includes("not found")) {
        return res.status(404).json({ message: err.message });
      }
      res.status(500).json({ message: "Failed to create material return" });
    }
  });

  app.put("/api/plant-module/material-returns/:id", async (req, res) => {
    try {
      const input = insertMaterialReturnSchema.partial().parse(req.body);
      const updated = await storage.updateMaterialReturn(Number(req.params.id), input);
      if (!updated) return res.status(404).json({ message: "Return not found" });
      sendPushToAll("Material Return Updated", `Return #${req.params.id} updated`, "/plant/material-returns").catch(() => {});
      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: err.errors });
      }
      if (err.message?.includes("exceeds remaining")) {
        return res.status(400).json({ message: err.message });
      }
      if (err.message?.includes("not found")) {
        return res.status(404).json({ message: err.message });
      }
      res.status(500).json({ message: "Failed to update material return" });
    }
  });

  app.delete("/api/plant-module/material-returns/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteMaterialReturn(Number(req.params.id));
      if (!deleted) return res.status(404).json({ message: "Return not found" });
      sendPushToAll("Material Return Deleted", `Return #${req.params.id} deleted`, "/plant/material-returns").catch(() => {});
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to delete material return" });
    }
  });

  // Material Opening Stocks
  app.get("/api/plant-module/opening-stocks", async (req, res) => {
    try {
      const filters: { materialId?: number; partyId?: number } = {
        materialId: req.query.materialId ? Number(req.query.materialId) : undefined,
      };
      // Only add partyId filter if it's a valid number (null partyId = plant common, filter separately if needed)
      if (req.query.partyId && req.query.partyId !== "null") {
        filters.partyId = Number(req.query.partyId);
      }
      const stocks = await storage.getMaterialOpeningStocks(filters);
      res.json(stocks);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch opening stocks" });
    }
  });

  app.get("/api/plant-module/opening-stocks/:id", async (req, res) => {
    try {
      const stock = await storage.getMaterialOpeningStock(Number(req.params.id));
      if (!stock) return res.status(404).json({ message: "Opening stock not found" });
      res.json(stock);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch opening stock" });
    }
  });

  app.post("/api/plant-module/opening-stocks", async (req, res) => {
    try {
      const input = insertMaterialOpeningStockSchema.parse(req.body);
      const stock = await storage.createMaterialOpeningStock(input);
      sendPushToAll("Opening Stock Set", `Opening stock entry created`, "/plant").catch(() => {});
      res.status(201).json(stock);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: err.errors });
      }
      res.status(500).json({ message: "Failed to create opening stock" });
    }
  });

  app.put("/api/plant-module/opening-stocks/:id", async (req, res) => {
    try {
      const input = insertMaterialOpeningStockSchema.partial().parse(req.body);
      const updated = await storage.updateMaterialOpeningStock(Number(req.params.id), input);
      if (!updated) return res.status(404).json({ message: "Opening stock not found" });
      sendPushToAll("Opening Stock Updated", `Opening stock #${req.params.id} updated`, "/plant").catch(() => {});
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: err.errors });
      }
      res.status(500).json({ message: "Failed to update opening stock" });
    }
  });

  app.delete("/api/plant-module/opening-stocks/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteMaterialOpeningStock(Number(req.params.id));
      if (!deleted) return res.status(404).json({ message: "Opening stock not found" });
      sendPushToAll("Opening Stock Deleted", `Opening stock #${req.params.id} deleted`, "/plant").catch(() => {});
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to delete opening stock" });
    }
  });

  // Truck Dispatches
  app.get("/api/plant-module/dispatches", async (req, res) => {
    try {
      const filters = {
        partyId: req.query.partyId ? Number(req.query.partyId) : undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const dispatches = await storage.getTruckDispatches(filters);
      res.json(dispatches);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch truck dispatches" });
    }
  });

  app.post("/api/plant-module/dispatches", async (req, res) => {
    try {
      const result = await storage.createTruckDispatchWithStockDeduction(req.body);
      const dispatch = result.dispatch;
      await storage.createNotification({
        type: "success",
        title: "Mix Dispatched",
        message: `Truck dispatch: ${dispatch.loadWeight} MT dispatched on ${dispatch.date}`,
        isRead: 0,
      });
      sendPushToAll("Dispatch Recorded", `${dispatch.loadWeight} MT dispatched on ${dispatch.date}`, "/plant").catch(() => {});

      res.status(201).json(result);
    } catch (err) {
      // Owner-stock shortage — surface to the client as 409 so the UI can
      // ask the operator for explicit consent before borrowing from HLC.
      if (err instanceof StockShortageError) {
        return res.status(409).json(err.payload);
      }
      console.error("Dispatch error:", err);
      res.status(500).json({ message: "Failed to create truck dispatch" });
    }
  });

  app.put("/api/plant-module/dispatches/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { adjustedBy, ...dispatchData } = req.body;
      
      // Server-side tolerance validation for actual consumption values
      const TOLERANCE_PERCENT = 10;
      if (dispatchData.actualBitumenPercent !== undefined || dispatchData.actualLdoQty !== undefined) {
        // Get current dispatch and mix template to calculate theoretical
        const dispatches = await storage.getTruckDispatches({});
        const currentDispatch = dispatches.find(d => d.id === id);
        if (currentDispatch) {
          const templates = await storage.getMixTemplates();
          const template = templates.find(t => t.id === currentDispatch.mixTemplateId);
          if (template) {
            const loadWeight = dispatchData.loadWeight ?? currentDispatch.loadWeight;
            const theoreticalBitumenPercent = template.bitumenPercent || 0;
            const theoreticalLdoQty = loadWeight * (template.ldoNorm || 6);
            
            // Validate bitumen tolerance (guard against divide-by-zero)
            if (dispatchData.actualBitumenPercent !== undefined && theoreticalBitumenPercent > 0) {
              const bitumenVariance = ((dispatchData.actualBitumenPercent - theoreticalBitumenPercent) / theoreticalBitumenPercent) * 100;
              if (Math.abs(bitumenVariance) > TOLERANCE_PERCENT) {
                return res.status(400).json({ 
                  message: `Bitumen variance (${bitumenVariance.toFixed(1)}%) exceeds ±${TOLERANCE_PERCENT}% tolerance. Please contact admin.` 
                });
              }
            }
            
            // Validate LDO tolerance (guard against divide-by-zero)
            if (dispatchData.actualLdoQty !== undefined && theoreticalLdoQty > 0) {
              const ldoVariance = ((dispatchData.actualLdoQty - theoreticalLdoQty) / theoreticalLdoQty) * 100;
              if (Math.abs(ldoVariance) > TOLERANCE_PERCENT) {
                return res.status(400).json({ 
                  message: `LDO variance (${ldoVariance.toFixed(1)}%) exceeds ±${TOLERANCE_PERCENT}% tolerance. Please contact admin.` 
                });
              }
            }
          }
        }
      }
      
      const updated = await storage.updateTruckDispatch(id, dispatchData, adjustedBy || "operator");
      if (!updated) {
        return res.status(404).json({ message: "Dispatch not found" });
      }
      sendPushToAll("Dispatch Updated", `Dispatch #${id} updated`, "/plant").catch(() => {});
      res.json(updated);
    } catch (err) {
      console.error("Update dispatch error:", err);
      res.status(500).json({ message: "Failed to update dispatch" });
    }
  });

  app.delete("/api/plant-module/dispatches/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteTruckDispatch(id);
      if (!deleted) {
        return res.status(404).json({ message: "Dispatch not found" });
      }
      sendPushToAll("Dispatch Deleted", `Dispatch #${id} deleted`, "/plant").catch(() => {});
      res.status(204).send();
    } catch (err) {
      console.error("Delete dispatch error:", err);
      res.status(500).json({ message: "Failed to delete dispatch" });
    }
  });

  // Recalculate all dispatch consumption from mix templates
  app.post("/api/plant-module/dispatches/recalculate-all", async (req, res) => {
    try {
      const result = await storage.recalculateAllDispatchConsumption();
      res.json(result);
    } catch (err) {
      console.error("Recalculate dispatches error:", err);
      res.status(500).json({ message: "Failed to recalculate dispatches" });
    }
  });
  
  // Variance Report - dispatches where actual differs from theoretical
  app.get("/api/plant-module/dispatches/variance-report", async (req, res) => {
    try {
      const filters = {
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const dispatches = await storage.getDispatchesWithVariance(filters);
      res.json(dispatches);
    } catch (err) {
      console.error("Variance report error:", err);
      res.status(500).json({ message: "Failed to fetch variance report" });
    }
  });
  
  // Consumption Audit Log
  app.get("/api/plant-module/consumption-audit-log", async (req, res) => {
    try {
      const filters = {
        dispatchId: req.query.dispatchId ? Number(req.query.dispatchId) : undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const auditLog = await storage.getConsumptionAuditLog(filters);
      res.json(auditLog);
    } catch (err) {
      console.error("Consumption audit log error:", err);
      res.status(500).json({ message: "Failed to fetch consumption audit log" });
    }
  });

  // Equipment Usage
  app.get("/api/plant-module/equipment-usage", async (req, res) => {
    try {
      const filters = {
        equipmentId: req.query.equipmentId ? Number(req.query.equipmentId) : undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const usage = await storage.getEquipmentUsage(filters);
      res.json(usage);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch equipment usage" });
    }
  });

  // Get previous diesel balance and closing reading for equipment (for new entry creation)
  app.get("/api/plant-module/equipment-usage/previous-balance/:equipmentId", async (req, res) => {
    try {
      const equipmentId = parseInt(req.params.equipmentId);
      const excludeId = req.query.excludeId ? parseInt(req.query.excludeId as string) : undefined;
      
      const usage = await storage.getEquipmentUsage({ equipmentId });
      // Usage is already sorted by date DESC, id DESC - so the first entry is the most recent
      
      // Filter out only the excluded entry (when editing)
      const filteredUsage = excludeId ? usage.filter(u => u.id !== excludeId) : usage;
      
      // Get the most recent entry for this equipment (includes same-day entries).
      // Prefer the operator's actual Diesel Balance in Tank dip; fall back to
      // closingDiesel when no dip was recorded.
      const last = filteredUsage.length > 0 ? filteredUsage[0] : null;
      const previousBalance = last
        ? (last.dieselBalanceInTank ?? last.closingDiesel ?? 0)
        : 0;
      const previousClosingReading = last ? last.closingReading || 0 : 0;
      res.json({ previousBalance, previousClosingReading });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch previous balance", previousBalance: 0, previousClosingReading: 0 });
    }
  });

  app.post("/api/plant-module/equipment-usage", async (req, res) => {
    try {
      const usage = await storage.createEquipmentUsage(req.body);
      const eqName = req.body.equipmentName || `Equipment #${req.body.equipmentId}`;
      sendPushToAll("Equipment Entry", `${eqName} - Opening: ${req.body.openingReading ?? 'N/A'}`, "/plant/equipment-usage").catch(() => {});
      res.status(201).json(usage);
    } catch (err) {
      res.status(500).json({ message: "Failed to create equipment usage" });
    }
  });

  app.put("/api/plant-module/equipment-usage/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (!assertEdit(req, res, "plant_equipment")) return;
      if (!(await assertWritable(res, "equipment_usage", id))) return;
      const updated = await storage.updateEquipmentUsage(id, req.body);
      if (!updated) {
        return res.status(404).json({ message: "Equipment usage not found" });
      }
      try { await relockResource("equipment_usage", id, req.authUser!.id); } catch {}
      const eqName = req.body.equipmentName || `Equipment #${req.body.equipmentId || id}`;
      sendPushToAll("Equipment Updated", `${eqName} - Closing: ${req.body.closingReading ?? 'N/A'}`, "/plant/equipment-usage").catch(() => {});
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update equipment usage" });
    }
  });

  app.delete("/api/plant-module/equipment-usage/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteEquipmentUsage(id);
      if (!deleted) {
        return res.status(404).json({ message: "Equipment usage not found" });
      }
      sendPushToAll("Equipment Entry Deleted", `Equipment usage #${id} deleted`, "/plant/equipment-usage").catch(() => {});
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to delete equipment usage" });
    }
  });

  // Distinct list of generator names for DG dropdowns. Falls back to canonical defaults if empty.
  // Returns active generators from the Equipment Master so the heating-session
  // and generator-log forms use the *same* names that appear on the Equipment
  // Usage screen. Falls back to historical generator-log names when the master
  // hasn't been populated yet.
  app.get("/api/plant-module/generators", async (_req, res) => {
    try {
      const all = await storage.getEquipmentMaster(false);
      const generators = all
        .filter((e: any) => (e.equipmentType || "").toLowerCase() === "generator")
        .map((e: any) => ({ id: e.id, name: e.name }));
      if (generators.length > 0) {
        generators.sort((a, b) => a.name.localeCompare(b.name));
        return res.json(generators);
      }
      // Legacy fallback — derive from past generator logs.
      const logs = await storage.getGeneratorLogs();
      const names = Array.from(
        new Set(
          logs
            .map((l: any) => (l.generatorName || "").toString().trim())
            .filter(Boolean)
        )
      );
      const merged = Array.from(new Set([...names, "600 KVA GENERATOR", "40-30 KVA GENERATOR"]));
      merged.sort();
      res.json(merged.map(n => ({ id: null, name: n })));
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to list generators" });
    }
  });

  app.get("/api/plant-module/generator-logs", async (req, res) => {
    try {
      const filters = {
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const logs = await storage.getGeneratorLogs(filters);
      res.json(logs);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch generator logs" });
    }
  });

  app.post("/api/plant-module/generator-logs", async (req, res) => {
    try {
      const log = await storage.createGeneratorLog(req.body);
      sendPushToAll("Generator Log Added", `Generator log for ${req.body.date || 'today'}`, "/plant").catch(() => {});
      res.status(201).json(log);
    } catch (err) {
      res.status(500).json({ message: "Failed to create generator log" });
    }
  });

  // Unified DG candidates for Heating-Session "Link existing DG" dropdown.
  // Returns ANY generator run already captured on the given date/plant —
  // whether it came via generator_logs (manual or past heating sessions)
  // OR via equipment_usage for an equipment_master row with
  // equipmentType='generator'. Equipment-usage candidates are returned
  // with source='equipment_usage' and carry equipmentUsageId so the
  // client can materialize them into generator_logs before linking.
  app.get("/api/plant-module/generator-candidates", async (req, res) => {
    try {
      const date = req.query.date as string | undefined;
      const plantName = (req.query.plant as string) || "Main Plant";
      if (!date) return res.status(400).json({ message: "date is required" });

      const [glogs, usage, equipment] = await Promise.all([
        storage.getGeneratorLogs({ dateFrom: date, dateTo: date }),
        storage.getEquipmentUsage({ dateFrom: date, dateTo: date }),
        storage.getEquipmentMaster(false),
      ]);
      const equipById = new Map<number, any>(equipment.map((e: any) => [e.id, e]));

      const fromLogs = glogs
        .filter((g: any) => !plantName || g.plantName === plantName)
        .map((g: any) => ({
          source: "generator_log" as const,
          id: g.id,
          equipmentUsageId: null as number | null,
          date: g.date,
          plantName: g.plantName,
          generatorName: g.generatorName,
          startTime: g.startTime,
          endTime: g.endTime,
          hoursRun: g.hoursRun,
          dieselConsumed: g.dieselConsumed,
          sourceHeatingSessionId: g.sourceHeatingSessionId ?? null,
        }));

      const fromUsage = (usage as any[])
        .filter(u => {
          if (plantName && u.plantName !== plantName) return false;
          const eq = equipById.get(u.equipmentId);
          return eq && String(eq.equipmentType || "").toLowerCase() === "generator";
        })
        .map(u => {
          const eq = equipById.get(u.equipmentId);
          const consumed = (u.closingDiesel != null)
            ? Math.max(0, (u.openingDiesel || 0) + (u.dieselIssued || 0) - u.closingDiesel)
            : (u.expectedDiesel ?? null);
          return {
            source: "equipment_usage" as const,
            id: null as number | null,
            equipmentUsageId: u.id,
            date: u.date,
            plantName: u.plantName,
            generatorName: eq?.name || "Generator",
            startTime: u.startTime,
            endTime: u.endTime,
            hoursRun: u.hoursOrKmRun ?? null,
            dieselConsumed: consumed,
            sourceHeatingSessionId: null,
          };
        });

      // If an equipment_usage row corresponds to a generator_log already
      // (same plant/date/generator name/start/end), drop the usage duplicate
      // so we don't show the same run twice.
      const logKey = (x: any) => `${x.plantName}|${x.generatorName}|${x.startTime || ""}|${x.endTime || ""}`;
      const logKeys = new Set(fromLogs.map(logKey));
      const usageDeduped = fromUsage.filter(u => !logKeys.has(logKey(u)));

      res.json([...fromLogs, ...usageDeduped]);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to list DG candidates" });
    }
  });

  // Materialize an equipment_usage DG row into generator_logs so it can
  // be referenced via generator_log_id FK from a heating session.
  app.post("/api/plant-module/generator-logs/from-equipment-usage", async (req, res) => {
    try {
      const id = Number(req.body?.equipmentUsageId);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "equipmentUsageId is required" });

      const usageList = await storage.getEquipmentUsage();
      const usage = (usageList as any[]).find(u => u.id === id);
      if (!usage) return res.status(404).json({ message: "Equipment usage row not found" });

      const equipment = await storage.getEquipmentMaster(false);
      const eq = (equipment as any[]).find(e => e.id === usage.equipmentId);
      if (!eq || String(eq.equipmentType || "").toLowerCase() !== "generator") {
        return res.status(400).json({ message: "Equipment is not a generator" });
      }

      // Reuse an existing mirror if we have already materialized this usage row.
      const existing = await storage.getGeneratorLogs({ dateFrom: usage.date, dateTo: usage.date });
      const match = (existing as any[]).find(g =>
        g.plantName === usage.plantName &&
        g.generatorName === eq.name &&
        (g.startTime || "") === (usage.startTime || "") &&
        (g.endTime || "") === (usage.endTime || "")
      );
      if (match) return res.json(match);

      const consumed = (usage.closingDiesel != null)
        ? Math.max(0, (usage.openingDiesel || 0) + (usage.dieselIssued || 0) - usage.closingDiesel)
        : (usage.expectedDiesel ?? 0);

      const created = await storage.createGeneratorLog({
        date: usage.date,
        generatorName: eq.name,
        startTime: usage.startTime || null,
        endTime: usage.endTime || null,
        hoursRun: usage.hoursOrKmRun ?? 0,
        openingDiesel: usage.openingDiesel ?? 0,
        dieselIssued: usage.dieselIssued ?? 0,
        closingDiesel: usage.closingDiesel ?? null,
        plantName: usage.plantName,
      } as any);

      // Hint: the closing/consumed may not match exactly if storage recalculates;
      // the heating session just needs the id to link to.
      // If the caller expects dieselConsumed to reflect usage closing, surface it.
      res.status(201).json({ ...created, dieselConsumed: created.dieselConsumed ?? consumed });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to materialize generator log" });
    }
  });

  // LDO Logs
  app.get("/api/plant-module/ldo-logs", async (req, res) => {
    try {
      const filters = {
        partyId: req.query.partyId ? Number(req.query.partyId) : undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const logs = await storage.getLdoLogs(filters);
      res.json(logs);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch LDO logs" });
    }
  });

  app.post("/api/plant-module/ldo-logs", async (req, res) => {
    try {
      const log = await storage.createLdoLog(req.body);
      sendPushToAll("LDO Log Added", `LDO log for ${req.body.date || 'today'}`, "/plant").catch(() => {});
      res.status(201).json(log);
    } catch (err) {
      res.status(500).json({ message: "Failed to create LDO log" });
    }
  });

  // Stock Balances
  app.get("/api/plant-module/stock-balances", async (req, res) => {
    try {
      const partyId = req.query.partyId !== undefined ? Number(req.query.partyId) : undefined;
      const balances = await storage.getStockBalances(partyId);
      res.json(balances);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch stock balances" });
    }
  });

  // Physical stock correction — reconcile book stock to physical measurement
  app.post("/api/plant-module/stock-correction", async (req, res) => {
    try {
      const { materialId, partyId, physicalQty, uom, date, notes, correctedBy } = req.body;
      if (!materialId || !partyId || physicalQty === undefined || !uom || !date) {
        return res.status(400).json({ message: "materialId, partyId, physicalQty, uom and date are required" });
      }
      const result = await storage.postStockCorrection({
        materialId: Number(materialId),
        partyId: Number(partyId),
        physicalQty: Number(physicalQty),
        uom,
        date,
        notes: notes || "",
        correctedBy: correctedBy || "admin",
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to post stock correction" });
    }
  });

  // Reconcile stock balances from ledger (admin maintenance endpoint)
  app.post("/api/plant-module/reconcile-stock-balances", async (req, res) => {
    try {
      const result = await storage.reconcileStockBalancesFromLedger();
      res.json({ 
        message: "Stock balances reconciled from ledger entries", 
        ...result 
      });
    } catch (err) {
      res.status(500).json({ message: "Failed to reconcile stock balances" });
    }
  });

  // Backfill missing equipment usage ledger entries (admin maintenance endpoint)
  app.post("/api/plant-module/reconcile-equipment-usage-ledger", async (req, res) => {
    try {
      // First create missing ledger entries
      const ledgerResult = await storage.reconcileEquipmentUsageLedger();
      // Then reconcile stock balances from all ledger entries
      const balanceResult = await storage.reconcileStockBalancesFromLedger();
      res.json({ 
        message: "Equipment usage ledger entries created and stock balances reconciled", 
        ledgerEntries: ledgerResult,
        stockBalances: balanceResult
      });
    } catch (err) {
      res.status(500).json({ message: "Failed to reconcile equipment usage ledger" });
    }
  });

  // Admin: preview ledger rows that match a reassignment query (read-only).
  // Body: { materialId, fromPartyId, toPartyId, transactionType?, dateFrom?, dateTo? }
  app.post("/api/plant-module/reassign-ledger/preview", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const { materialId, fromPartyId, dateFrom, dateTo, transactionType } = req.body || {};
      if (!materialId || !fromPartyId) {
        return res.status(400).json({ message: "materialId and fromPartyId are required" });
      }
      const rows = await storage.previewLedgerForReassignment({
        materialId: parseInt(materialId),
        fromPartyId: parseInt(fromPartyId),
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        transactionType: transactionType || undefined,
      });
      res.json(rows);
    } catch (err) {
      console.error("Reassign preview error:", err);
      res.status(500).json({ message: "Failed to preview ledger rows" });
    }
  });

  // Admin: actually move ledger rows from one party to another.
  // Requires admin PIN. Body adds: pin (string), toPartyId (int).
  app.post("/api/plant-module/reassign-ledger/execute", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const { materialId, fromPartyId, toPartyId, dateFrom, dateTo, transactionType } = req.body || {};
      const actor = currentUserName(req);
      if (!materialId || !fromPartyId || !toPartyId) {
        return res.status(400).json({ message: "materialId, fromPartyId and toPartyId are required" });
      }
      if (parseInt(fromPartyId) === parseInt(toPartyId)) {
        return res.status(400).json({ message: "From and To parties must differ" });
      }
      const criteria = {
        materialId: parseInt(materialId),
        fromPartyId: parseInt(fromPartyId),
        toPartyId: parseInt(toPartyId),
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        transactionType: transactionType || undefined,
      };
      const result = await storage.executeLedgerReassignment(criteria);
      // Audit log: actor name + admin role, ISO timestamp, criteria, totals.
      console.info(
        `[LedgerReassignment] actor="${actor.trim()}" role=admin ` +
        `at=${new Date().toISOString()} criteria=${JSON.stringify(criteria)} ` +
        `moved=${result.moved} totalIn=${result.totalIn} totalOut=${result.totalOut}`
      );
      res.json({
        message: "Ledger rows reassigned and balances reconciled",
        ...result,
      });
    } catch (err) {
      console.error("Reassign execute error:", err);
      res.status(500).json({ message: "Failed to reassign ledger rows" });
    }
  });

  // Admin: rewrite the historical `balance_after` column for a given material,
  // chronologically per (party, material). Used to clean up displays after
  // legacy data moves. Requires admin PIN.
  app.post("/api/plant-module/recompute-balance-after", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const { materialId } = req.body || {};
      if (!materialId) {
        return res.status(400).json({ message: "materialId is required" });
      }
      const result = await storage.recomputeBalanceAfterForMaterial(parseInt(materialId));
      res.json({ message: "balance_after recomputed", ...result });
    } catch (err) {
      console.error("recompute-balance-after error:", err);
      res.status(500).json({ message: "Failed to recompute balance_after" });
    }
  });

  // Admin: list shift-log workers tagged UNKNOWN CONTRACTOR / OTHER for review.
  app.post("/api/plant-module/shift-log-manpower/review-list", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const { dateFrom, dateTo, plantName } = req.body || {};
      const plantTrim = String(plantName || "").trim();
      const rows = await storage.listShiftLogManpowerNeedingReview({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        plantName: plantTrim || undefined,
      });
      res.json(rows);
    } catch (err) {
      console.error("shift-log-manpower review-list error:", err);
      res.status(500).json({ message: "Failed to list workers needing review" });
    }
  });

  // Admin: bulk-relabel every shift-log row of a given worker name. Also supports
  // merging multiple duplicate name spellings into a single canonical name when
  // `fromNames` (array) and `toName` are provided.
  app.post("/api/plant-module/shift-log-manpower/bulk-relabel", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const { name, fromNames, toName, contractorName, category, gender } = req.body || {};
      const actor = currentUserName(req);
      const fromList: string[] = Array.isArray(fromNames) && fromNames.length > 0
        ? fromNames.map((n: unknown) => String(n || "")).filter((n: string) => n.trim().length > 0)
        : (name ? [String(name)] : []);
      const targetName: string = (toName ? String(toName) : (name ? String(name) : "")).trim();
      if (fromList.length === 0 || !targetName || !contractorName || !category || !gender) {
        return res.status(400).json({ message: "fromNames, toName, contractorName, category and gender are required" });
      }
      const catUpper = String(category).toUpperCase().trim();
      const genUpper = String(gender).toUpperCase().trim();
      if (!(LABOUR_CATEGORIES as readonly string[]).includes(catUpper)) {
        return res.status(400).json({ message: `category must be one of: ${LABOUR_CATEGORIES.join(", ")}` });
      }
      if (!(LABOUR_GENDERS as readonly string[]).includes(genUpper)) {
        return res.status(400).json({ message: `gender must be one of: ${LABOUR_GENDERS.join(", ")}` });
      }
      const result = await storage.bulkRelabelShiftLogManpowerByName({
        fromNames: fromList,
        toName: targetName,
        contractorName: String(contractorName),
        category: String(category),
        gender: String(gender),
        actor: actor.trim(),
      });
      const isMerge = fromList.length > 1 || fromList.some(n => n.trim().toUpperCase() !== targetName.toUpperCase());
      console.info(
        `[ShiftLogManpowerRelabel] actor="${actor.trim()}" role=admin ` +
        `at=${new Date().toISOString()} ${isMerge ? "merge" : "relabel"} ` +
        `from=[${fromList.map(n => `"${n}"`).join(",")}] -> name="${targetName}" ` +
        `contractor="${contractorName}" category="${category}" gender="${gender}" updated=${result.updated} batchId=${result.batchId}`
      );
      res.json({ message: isMerge ? "Worker names merged" : "Worker rows relabeled", ...result });
    } catch (err) {
      console.error("shift-log-manpower bulk-relabel error:", err);
      const msg = err instanceof Error ? err.message : "Failed to relabel worker rows";
      res.status(500).json({ message: msg });
    }
  });

  // Admin: list recent (≤30 day) merge/relabel batches, newest first, with the
  // info needed to render an Undo button.
  app.post("/api/plant-module/shift-log-manpower/recent-merges", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const [batches, dupActivity] = await Promise.all([
        storage.getRecentShiftLogManpowerRelabelBatches(30),
        storage.getRecentShiftLogManpowerDupActivity(30),
      ]);
      res.json({ merges: batches, dupActivity });
    } catch (err) {
      console.error("shift-log-manpower recent-merges error:", err);
      res.status(500).json({ message: "Failed to load recent merges" });
    }
  });

  // Admin: undo a previous merge/relabel batch by restoring the per-row snapshot.
  app.post("/api/plant-module/shift-log-manpower/undo-merge", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const { batchId } = req.body || {};
      const actor = currentUserName(req);
      const id = Number(batchId);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ message: "Valid batchId is required" });
      }
      const result = await storage.undoShiftLogManpowerRelabelBatch({ batchId: id, actor: actor.trim() });
      console.info(
        `[ShiftLogManpowerRelabel] actor="${actor.trim()}" role=admin ` +
        `at=${new Date().toISOString()} undo batchId=${id} restored=${result.restored}`
      );
      res.json({ message: "Merge undone — original worker names restored", ...result });
    } catch (err) {
      console.error("shift-log-manpower undo-merge error:", err);
      const msg = err instanceof Error ? err.message : "Failed to undo merge";
      res.status(400).json({ message: msg });
    }
  });

  // Admin: learned name-aliases mined from past (non-undone) merge batches.
  // Returns full-name pairs and token-position pairs that were unified before;
  // the cleanup screen uses these to flag the same patterns as duplicates next
  // time they appear (e.g. once "MD KAREEM" was merged into "MOHAMMED KAREEM",
  // any future "MD ..." vs "MOHAMMED ..." pair is suggested automatically).
  app.post("/api/plant-module/shift-log-manpower/learned-aliases", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const aliases = await storage.getShiftLogManpowerLearnedAliases();
      res.json(aliases);
    } catch (err) {
      console.error("shift-log-manpower learned-aliases error:", err);
      res.status(500).json({ message: "Failed to load learned aliases" });
    }
  });

  // Admin: list custom token-equivalence aliases (and admin-suppressed learned
  // aliases). Returned as a flat list with `kind` discriminator so the cleanup
  // screen can render a Manage panel and apply both kinds to its suggester.
  app.post("/api/plant-module/shift-log-manpower/custom-aliases", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const aliases = await storage.listShiftLogManpowerCustomAliases();
      res.json(aliases);
    } catch (err) {
      console.error("shift-log-manpower custom-aliases list error:", err);
      res.status(500).json({ message: "Failed to load custom aliases" });
    }
  });

  // Admin: add a custom alias or suppress a learned alias. The same endpoint
  // covers three operations, distinguished by `kind` in the body:
  //   - "alias"                 → add an explicit token equivalence
  //   - "suppress_learned"      → mute an auto-mined token-pair
  //   - "suppress_learned_pair" → mute an auto-mined full-name pair (admin
  //                               library: prune a bad learned pattern without
  //                               undoing the merges that taught it)
  app.post("/api/plant-module/shift-log-manpower/add-custom-alias", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const { tokenA, tokenB, kind } = req.body || {};
      const actor = currentUserName(req);
      const k =
        kind === "suppress_learned" ? "suppress_learned"
        : kind === "suppress_learned_pair" ? "suppress_learned_pair"
        : "alias";
      const result = await storage.addShiftLogManpowerCustomAlias({
        tokenA: String(tokenA || ""),
        tokenB: String(tokenB || ""),
        kind: k,
        actor: actor.trim(),
      });
      console.info(
        `[ShiftLogManpowerCustomAlias] actor="${actor.trim()}" role=admin ` +
        `at=${new Date().toISOString()} add kind=${k} added=${result.added} ` +
        `tokenA=${tokenA} tokenB=${tokenB}`
      );
      res.json(result);
    } catch (err) {
      console.error("shift-log-manpower add-custom-alias error:", err);
      const msg = err instanceof Error ? err.message : "Failed to add custom alias";
      res.status(400).json({ message: msg });
    }
  });

  // Admin: delete a custom alias / unsuppress a previously-suppressed pair.
  app.post("/api/plant-module/shift-log-manpower/delete-custom-alias", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const { id } = req.body || {};
      const actor = currentUserName(req);
      const numId = Number(id);
      if (!Number.isFinite(numId) || numId <= 0) {
        return res.status(400).json({ message: "Valid id is required" });
      }
      const result = await storage.deleteShiftLogManpowerCustomAlias(numId);
      console.info(
        `[ShiftLogManpowerCustomAlias] actor="${actor.trim()}" role=admin ` +
        `at=${new Date().toISOString()} delete id=${numId} removed=${result.removed}`
      );
      res.json(result);
    } catch (err) {
      console.error("shift-log-manpower delete-custom-alias error:", err);
      const msg = err instanceof Error ? err.message : "Failed to delete custom alias";
      res.status(400).json({ message: msg });
    }
  });

  // Admin: list "not a duplicate" name-pairs that have been dismissed on the
  // worker-cleanup screen. Used to suppress repeated false-positive suggestions
  // across sessions and devices.
  app.post("/api/plant-module/shift-log-manpower/dismissed-pairs", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const { plantName } = req.body || {};
      const plant = String(plantName || "").trim();
      if (!plant) return res.status(400).json({ message: "plantName is required" });
      const pairs = await storage.listShiftLogManpowerDismissedDuplicatePairs(plant);
      res.json(pairs);
    } catch (err) {
      console.error("shift-log-manpower dismissed-pairs error:", err);
      res.status(500).json({ message: "Failed to load dismissed duplicate pairs" });
    }
  });

  // Admin: persist one or more "not a duplicate" decisions. Body: { pairs:
  // [[nameA, nameB], ...] }. Each pair is normalized (UPPER + trim) and stored
  // unordered; existing entries are preserved (ON CONFLICT DO NOTHING).
  app.post("/api/plant-module/shift-log-manpower/dismiss-pairs", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const { pairs, plantName } = req.body || {};
      const actor = currentUserName(req);
      const plant = String(plantName || "").trim();
      if (!plant) return res.status(400).json({ message: "plantName is required" });
      if (!Array.isArray(pairs) || pairs.length === 0) {
        return res.status(400).json({ message: "pairs must be a non-empty array of [nameA, nameB] tuples" });
      }
      const normalizedPairs: Array<[string, string]> = [];
      for (const p of pairs) {
        if (Array.isArray(p) && p.length === 2) {
          normalizedPairs.push([String(p[0] || ""), String(p[1] || "")]);
        }
      }
      const result = await storage.addShiftLogManpowerDismissedDuplicatePairs({
        plantName: plant,
        pairs: normalizedPairs,
        actor: actor.trim(),
      });
      if (result.added > 0) {
        // Audit write is best-effort: the underlying dismissal already
        // succeeded, so a failure here should not fail the user request.
        try {
          await storage.addShiftLogManpowerDupActivity({
            actor: actor.trim(),
            plantName: plant,
            action: "dismiss",
            pairs: result.addedPairs,
          });
        } catch (auditErr) {
          console.error("shift-log-manpower dismiss-pairs audit write failed:", auditErr);
        }
      }
      console.info(
        `[ShiftLogManpowerDismissDup] actor="${actor.trim()}" role=admin ` +
        `at=${new Date().toISOString()} plant="${plant}" dismissed=${result.added} of=${normalizedPairs.length}`
      );
      res.json({ message: "Dismissals saved", ...result });
    } catch (err) {
      console.error("shift-log-manpower dismiss-pairs error:", err);
      const msg = err instanceof Error ? err.message : "Failed to save dismissals";
      res.status(500).json({ message: msg });
    }
  });

  // Admin: undo a previous dismissal so the pair can suggest itself again.
  app.post("/api/plant-module/shift-log-manpower/restore-dismissed-pair", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const { id } = req.body || {};
      const actor = currentUserName(req);
      const pairId = Number(id);
      if (!Number.isFinite(pairId) || pairId <= 0) {
        return res.status(400).json({ message: "Valid id is required" });
      }
      const result = await storage.removeShiftLogManpowerDismissedDuplicatePair(pairId);
      if (result.removed && result.pair) {
        try {
          await storage.addShiftLogManpowerDupActivity({
            actor: actor.trim(),
            plantName: result.pair.plantName,
            action: "restore",
            pairs: [[result.pair.nameA, result.pair.nameB]],
          });
        } catch (auditErr) {
          console.error("shift-log-manpower restore-dismissed-pair audit write failed:", auditErr);
        }
      }
      console.info(
        `[ShiftLogManpowerDismissDup] actor="${actor.trim()}" role=admin ` +
        `at=${new Date().toISOString()} restored id=${pairId} removed=${result.removed}`
      );
      res.json({ message: result.removed ? "Dismissal removed" : "Dismissal not found", ...result });
    } catch (err) {
      console.error("shift-log-manpower restore-dismissed-pair error:", err);
      const msg = err instanceof Error ? err.message : "Failed to restore dismissed pair";
      res.status(400).json({ message: msg });
    }
  });

  // Admin: bulk-restore dismissed name-pairs. Either provide a list of `ids`
  // (multi-select restore from the UI) or `olderThanDays` to purge every
  // dismissal older than N days within the given plant scope. Both can be
  // combined (the intersection is deleted). Each call writes a single audit
  // line summarising the operator, plant scope and number of pairs restored.
  app.post("/api/plant-module/shift-log-manpower/bulk-restore-dismissed-pairs", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const { ids, olderThanDays, plantName } = req.body || {};
      const actor = currentUserName(req);
      const plant = String(plantName || "").trim();
      if (!plant) return res.status(400).json({ message: "plantName is required" });
      const idList = Array.isArray(ids)
        ? ids.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n) && n > 0)
        : [];
      const days = olderThanDays === undefined || olderThanDays === null || olderThanDays === ""
        ? undefined
        : Number(olderThanDays);
      if (idList.length === 0 && (days === undefined || !Number.isFinite(days) || days < 0)) {
        return res.status(400).json({ message: "Provide either ids[] or a non-negative olderThanDays" });
      }
      const result = await storage.removeShiftLogManpowerDismissedDuplicatePairsBulk({
        plantName: plant,
        ids: idList.length > 0 ? idList : undefined,
        olderThanDays: days,
      });
      if (result.removed > 0) {
        try {
          await storage.addShiftLogManpowerDupActivity({
            actor: actor.trim(),
            plantName: plant,
            action: "bulk_restore",
            pairs: result.removedPairs,
          });
        } catch (auditErr) {
          console.error("shift-log-manpower bulk-restore audit write failed:", auditErr);
        }
      }
      console.info(
        `[ShiftLogManpowerDismissDup] actor="${actor.trim()}" role=admin ` +
        `at=${new Date().toISOString()} plant="${plant}" bulk-restored=${result.removed}` +
        ` ids=[${result.removedIds.join(",")}]` +
        (days !== undefined && Number.isFinite(days) ? ` olderThanDays=${days}` : "")
      );
      res.json({
        message: result.removed > 0
          ? `Restored ${result.removed} dismissal${result.removed === 1 ? "" : "s"}`
          : "No matching dismissals found",
        ...result,
      });
    } catch (err) {
      console.error("shift-log-manpower bulk-restore-dismissed-pairs error:", err);
      const msg = err instanceof Error ? err.message : "Failed to bulk-restore dismissed pairs";
      res.status(400).json({ message: msg });
    }
  });

  // Stock Ledger
  app.get("/api/plant-module/stock-ledger", async (req, res) => {
    try {
      const filters = {
        partyId: req.query.partyId !== undefined ? Number(req.query.partyId) : undefined,
        materialId: req.query.materialId ? Number(req.query.materialId) : undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const ledger = await storage.getStockLedger(filters);
      res.json(ledger);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch stock ledger" });
    }
  });

  // All-time Stock Ledger (no date filter) for calculating true balances
  app.get("/api/plant-module/stock-ledger-all", async (req, res) => {
    try {
      const filters = {
        partyId: req.query.partyId !== undefined ? Number(req.query.partyId) : undefined,
        materialId: req.query.materialId ? Number(req.query.materialId) : undefined,
        // No date filters - fetch ALL entries
      };
      const ledger = await storage.getStockLedger(filters);
      res.json(ledger);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch all-time stock ledger" });
    }
  });

  // Aggregate balance as-of a given date (for efficient opening-balance computation)
  app.get("/api/plant-module/stock-balance-as-of", async (req, res) => {
    try {
      const date = req.query.date as string;
      if (!date) return res.status(400).json({ message: "date query parameter is required" });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ message: "date must be in YYYY-MM-DD format" });
      const partyIdRaw = req.query.partyId !== undefined ? Number(req.query.partyId) : undefined;
      const materialIdRaw = req.query.materialId ? Number(req.query.materialId) : undefined;
      if (partyIdRaw !== undefined && isNaN(partyIdRaw)) return res.status(400).json({ message: "partyId must be a number" });
      if (materialIdRaw !== undefined && isNaN(materialIdRaw)) return res.status(400).json({ message: "materialId must be a number" });
      const filters = { partyId: partyIdRaw, materialId: materialIdRaw };
      const balances = await storage.getStockBalanceAsOf(date, filters);
      res.json(balances);
    } catch (err) {
      res.status(500).json({ message: "Failed to compute stock balance as-of date" });
    }
  });

  // ============================================
  // BITUMEN DIP READINGS
  // ============================================

  app.get("/api/plant-module/bitumen-dip-readings", async (req, res) => {
    try {
      const filters = {
        tankNumber: req.query.tankNumber ? parseInt(req.query.tankNumber as string) : undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        readingType: req.query.readingType as string | undefined,
      };
      const readings = await storage.getBitumenDipReadings(filters);
      res.json(readings);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch bitumen dip readings" });
    }
  });

  app.post("/api/plant-module/bitumen-dip-readings", async (req, res) => {
    try {
      const parsed = insertBitumenDipReadingSchema.parse(req.body);
      const reading = await storage.createBitumenDipReading(parsed);
      sendPushToAll("Bitumen Dip Reading", `Tank ${parsed.tankNumber} - ${parsed.dipDepth}cm`, "/plant/bitumen-stock").catch(() => {});
      res.status(201).json(reading);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to create bitumen dip reading" });
    }
  });

  app.patch("/api/plant-module/bitumen-dip-readings/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = await storage.updateBitumenDipReading(id, req.body);
      if (!result) return res.status(404).json({ message: "Reading not found" });
      sendPushToAll("Bitumen Dip Updated", `Tank ${req.body.tankNumber || ''} reading updated`, "/plant/bitumen-stock").catch(() => {});
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to update bitumen dip reading" });
    }
  });

  app.delete("/api/plant-module/bitumen-dip-readings/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteBitumenDipReading(id);
      if (!deleted) return res.status(404).json({ message: "Reading not found" });
      sendPushToAll("Bitumen Dip Deleted", `Bitumen dip reading #${id} deleted`, "/plant/bitumen-stock").catch(() => {});
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete bitumen dip reading" });
    }
  });

  // ============================================
  // LDO FLOW METER READINGS
  // ============================================

  app.get("/api/plant-module/ldo-flow-readings", async (req, res) => {
    try {
      const filters = {
        tankNumber: req.query.tankNumber ? parseInt(req.query.tankNumber as string) : undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        readingType: req.query.readingType as string | undefined,
      };
      const readings = await storage.getLdoFlowReadings(filters);
      res.json(readings);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch LDO flow readings" });
    }
  });

  app.post("/api/plant-module/ldo-flow-readings", async (req, res) => {
    try {
      const parsed = insertLdoFlowReadingSchema.parse(req.body);
      const reading = await storage.createLdoFlowReading(parsed);
      sendPushToAll("LDO Flow Reading", `Meter: ${parsed.meterReading || 'N/A'}`, "/plant/ldo-flow-meter").catch(() => {});
      res.status(201).json(reading);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to create LDO flow reading" });
    }
  });

  app.patch("/api/plant-module/ldo-flow-readings/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = await storage.updateLdoFlowReading(id, req.body);
      if (!result) return res.status(404).json({ message: "Reading not found" });
      sendPushToAll("LDO Flow Updated", `LDO flow reading #${id} updated`, "/plant/ldo-flow-meter").catch(() => {});
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to update LDO flow reading" });
    }
  });

  app.delete("/api/plant-module/ldo-flow-readings/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteLdoFlowReading(id);
      if (!deleted) return res.status(404).json({ message: "Reading not found" });
      sendPushToAll("LDO Flow Deleted", `LDO flow reading #${id} deleted`, "/plant/ldo-flow-meter").catch(() => {});
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete LDO flow reading" });
    }
  });

  // ============================================
  // LDO DIP READINGS
  // ============================================

  app.get("/api/plant-module/ldo-dip-readings", async (req, res) => {
    try {
      const filters = {
        tankNumber: req.query.tankNumber ? parseInt(req.query.tankNumber as string) : undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        readingType: req.query.readingType as string | undefined,
      };
      const readings = await storage.getLdoDipReadings(filters);
      res.json(readings);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch LDO dip readings" });
    }
  });

  app.post("/api/plant-module/ldo-dip-readings", async (req, res) => {
    try {
      const parsed = insertLdoDipReadingSchema.parse(req.body);
      const reading = await storage.createLdoDipReading(parsed);
      sendPushToAll("LDO Dip Reading", `Tank ${parsed.tankNumber} - ${parsed.dipDepth}cm`, "/plant/ldo-flow-meter").catch(() => {});
      res.status(201).json(reading);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to create LDO dip reading" });
    }
  });

  app.patch("/api/plant-module/ldo-dip-readings/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = await storage.updateLdoDipReading(id, req.body);
      if (!result) return res.status(404).json({ message: "Reading not found" });
      sendPushToAll("LDO Dip Updated", `LDO dip reading #${id} updated`, "/plant/ldo-flow-meter").catch(() => {});
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to update LDO dip reading" });
    }
  });

  app.delete("/api/plant-module/ldo-dip-readings/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteLdoDipReading(id);
      if (!deleted) return res.status(404).json({ message: "Reading not found" });
      sendPushToAll("LDO Dip Deleted", `LDO dip reading #${id} deleted`, "/plant/ldo-flow-meter").catch(() => {});
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete LDO dip reading" });
    }
  });

  // ============================================
  // PLANT SHIFT LOG (operator daily log)
  // ============================================

  app.get("/api/plant-module/shift-logs/plants", async (_req, res) => {
    try {
      const all = await storage.getPlantShiftLogs({});
      const plants = Array.from(new Set(all.map(l => l.plantName || "Main Plant")));
      if (!plants.length) plants.push("Main Plant");
      res.json(plants);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/plant-module/shift-logs", async (req, res) => {
    try {
      const logs = await storage.getPlantShiftLogs({
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      });
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch shift logs" });
    }
  });

  app.get("/api/plant-module/shift-logs/by-date/:date", async (req, res) => {
    try {
      const plantName = (req.query.plant as string) || "Main Plant";
      const log = await storage.getPlantShiftLogByDate(req.params.date, undefined, plantName);
      if (!log) return res.status(404).json({ message: "No shift log for that date" });
      res.json(log);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch shift log" });
    }
  });

  app.get("/api/plant-module/shift-logs/:id", async (req, res) => {
    try {
      const log = await storage.getPlantShiftLog(parseInt(req.params.id));
      if (!log) return res.status(404).json({ message: "Shift log not found" });
      res.json(log);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch shift log" });
    }
  });

  app.post("/api/plant-module/shift-logs", async (req, res) => {
    try {
      const { upsertPlantShiftLogSchema } = await import("@shared/schema");
      const parsed = upsertPlantShiftLogSchema.parse(req.body);
      const incomingId = (parsed as any).id ? Number((parsed as any).id) : null;
      // Edit permission required for any save (create or update).
      if (!assertEdit(req, res, "plant_shift_logs")) return;
      // If updating an existing finalized/locked log, ensure unlocked.
      if (incomingId) {
        if (!(await assertWritable(res, "plant_shift_log", incomingId))) return;
      }
      const editedBy = parsed.editedBy || currentUserName(req) || "operator";
      const authorizedRole: "admin" | "manager" | null = "manager";
      try {
        const saved = await storage.upsertPlantShiftLog(parsed, editedBy, authorizedRole);
        try { await relockResource("plant_shift_log", saved.id, req.authUser!.id); } catch {}
        sendPushToAll("Plant Shift Log Saved", `${saved.date} – ${saved.shiftCode}`, `/plant/shift-log/${saved.date}`).catch(() => {});
        res.status(201).json(saved);
      } catch (e: any) {
        if (e?.code === "FINALIZED_LOCKED") return res.status(403).json({ code: "FINALIZED_LOCKED", message: e.message });
        throw e;
      }
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to save shift log" });
    }
  });

  app.post("/api/plant-module/shift-logs/:id/finalize", async (req, res) => {
    try {
      const finalizedBy: string = (req.body?.finalizedBy as string) || "operator";
      const id = parseInt(req.params.id);
      const updated = await storage.finalizePlantShiftLog(id, finalizedBy);
      if (!updated) return res.status(404).json({ message: "Shift log not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to finalize shift log" });
    }
  });

  app.delete("/api/plant-module/shift-logs/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const id = parseInt(req.params.id);
      const ok = await storage.deletePlantShiftLog(id);
      if (!ok) return res.status(404).json({ message: "Shift log not found" });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to delete shift log" });
    }
  });

  // ============================================
  // DAILY PLANT REPORT (management consolidated view)
  // ============================================

  app.get("/api/plant-module/daily-reports/:date", async (req, res) => {
    try {
      const plantName = (req.query.plant as string) || "Main Plant";
      const summary = await storage.getDailyPlantSummary(req.params.date, plantName);
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to build daily plant report" });
    }
  });

  // Render the Daily Plant Report into a given PDFDocument (shared by single + bulk endpoints).
  const renderDailyPlantPdfBody = (doc: PDFKit.PDFDocument, date: string, summary: any) => {
      // Header with company logo (matches DPR/bill print style)
      const logoPath = path.join(process.cwd(), "attached_assets", "1B61665A-8ECB-443A-98A5-FB3676935BB8_1_102_a_1767081845854.jpeg");
      try {
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, 40, 35, { width: 50, height: 50 });
        }
      } catch {}
      doc.fontSize(16).font("Helvetica-Bold").text("Daily Plant Report", 100, 40);
      doc.fontSize(11).font("Helvetica").text("High Lane Constructions Pvt Ltd", 100, 60);
      doc.fontSize(10).text(`Date: ${date}    Shift: ${summary.shift?.shiftCode || "DAY"}    Status: ${summary.shift?.isFinalized ? "Finalized" : (summary.shift ? "Draft" : "No log")}`, 100, 75);
      doc.moveTo(40, 95).lineTo(555, 95).stroke();
      doc.y = 105;
      doc.x = 40;

      const line = (label: string, value: string | number | null | undefined) => {
        doc.fontSize(10).font("Helvetica-Bold").text(`${label}: `, { continued: true });
        doc.font("Helvetica").text(value === null || value === undefined || value === "" ? "—" : String(value));
      };
      const section = (title: string) => {
        doc.moveDown(0.4);
        doc.fontSize(12).font("Helvetica-Bold").text(title);
        doc.moveTo(doc.x, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(0.2);
      };

      section("Shift Header");
      line("Operator", summary.shift?.operatorName);
      line("Supervisor", summary.shift?.supervisorName);
      line("Plant Start", summary.shift?.plantStartTime);
      line("Plant Stop", summary.shift?.plantStopTime);
      line("Running Hours", summary.runningHours);
      line("Productive Hours (running − idle)", summary.productiveHours);
      line("Weather", summary.shift?.weather);
      line("Ambient Temp (°C)", summary.shift?.ambientTemp);

      section("Production");
      line("Loads", summary.production.totalLoads);
      line("Total Production (MT)", summary.production.totalProductionMT?.toFixed(2));
      line("Theoretical Bitumen (MT)", summary.production.theoreticalBitumenMT?.toFixed(3));
      line("Theoretical LDO (L)", summary.production.theoreticalLdoL?.toFixed(1));

      if (summary.production.byMix?.length) {
        section("Production by Mix");
        for (const m of summary.production.byMix) {
          doc.fontSize(10).font("Helvetica").text(`• ${m.mixName} (${m.mixType})  ${m.loads} loads  ${m.mt.toFixed(2)} MT`);
        }
      }

      // Party / Mix Breakdown — mirrors the per-row breakdown shown on the
      // Daily Reports list page so archived/shared PDFs carry the same context.
      {
        const mixTypeByName = new Map<string, string>();
        for (const m of (summary.production?.byMix || []) as Array<{ mixName?: string; mixType?: string }>) {
          if (m?.mixName) mixTypeByName.set(m.mixName, m.mixType || "—");
        }
        const breakdownMap = new Map<string, { partyName: string; mixType: string; loads: number; mt: number }>();
        for (const d of (summary.dispatches || []) as Array<{ partyName?: string; mixName?: string; loadWeight?: number }>) {
          const partyName = d.partyName || "—";
          const mixType = (d.mixName ? mixTypeByName.get(d.mixName) : undefined) || "—";
          const key = `${partyName}||${mixType}`;
          const cur = breakdownMap.get(key) || { partyName, mixType, loads: 0, mt: 0 };
          cur.loads += 1;
          cur.mt += d.loadWeight || 0;
          breakdownMap.set(key, cur);
        }
        const breakdown = Array.from(breakdownMap.values()).sort((a, b) =>
          (b.mt - a.mt)
          || a.partyName.localeCompare(b.partyName)
          || a.mixType.localeCompare(b.mixType)
        );
        if (breakdown.length) {
          section("Party / Mix Breakdown");
          for (const b of breakdown) {
            const loadsLabel = `${b.loads} load${b.loads === 1 ? "" : "s"}`;
            doc.fontSize(10).font("Helvetica").text(
              `• ${b.partyName}: ${loadsLabel} / ${b.mt.toFixed(2)} MT (${b.mixType})`
            );
          }
        }
      }

      if (summary.dispatches?.length) {
        section(`Dispatches (${summary.dispatches.length})`);
        for (const d of summary.dispatches) {
          doc.fontSize(9).font("Helvetica").text(
            `${d.time || "—"}  ${d.truckNumber}  ${d.partyName}  ${d.mixName}  ${d.loadWeight?.toFixed(2)} MT  ${d.deliveryLocation || ""}`
          );
        }
      }

      if (summary.receipts?.byMaterial?.length) {
        section(`Material Receipts (${summary.receipts.totalLines} lines)`);
        for (const r of summary.receipts.byMaterial) {
          doc.fontSize(10).font("Helvetica").text(`• ${r.materialName}: ${r.quantity.toFixed(2)} ${r.uom} (${r.lines} lines)`);
        }
      }

      section(`LDO Consumption (Shift Meters / Source: ${summary.ldo.source})`);
      line("Boiler Meter (L)", summary.ldo.consumedT1L?.toFixed(1) ?? "—");
      line("Dryer Meter (L)", summary.ldo.consumedT2L?.toFixed(1) ?? "—");
      line("Total (L)", summary.ldo.consumedTotalL?.toFixed(1) ?? "—");
      line("L / Hour (combined)", summary.ldo.lPerHour ?? "—");
      line("Dryer L / MT Production", summary.ldo.dryerLPerMT ?? "—");
      line("Boiler L / MT Production", summary.ldo.boilerLPerMT ?? "—");

      section("Bitumen Tank Status");
      line("Tank 1 Temp (°C)", summary.shift?.bitumenTank1Temp);
      line("Tank 2 Temp (°C)", summary.shift?.bitumenTank2Temp);
      line("Tank 1 Approx Stock (MT)", summary.shift?.bitumenTank1StockApproxMt);
      line("Tank 2 Approx Stock (MT)", summary.shift?.bitumenTank2StockApproxMt);
      line("Tank 1 Opening Dip (cm)", summary.shift?.bitumenTank1OpeningDip);
      line("Tank 1 Closing Dip (cm)", summary.shift?.bitumenTank1ClosingDip);
      line("Tank 2 Opening Dip (cm)", summary.shift?.bitumenTank2OpeningDip);
      line("Tank 2 Closing Dip (cm)", summary.shift?.bitumenTank2ClosingDip);

      if (summary.generators?.items?.length) {
        section(`Generator Logs (${summary.generators.items.length})  Total Diesel: ${summary.generators.totalDieselConsumedL?.toFixed(1) || 0} L`);
        for (const g of summary.generators.items) {
          const variance = (g.lPerHr != null && g.efficiency != null && g.efficiency > 0)
            ? Math.round(((g.lPerHr - g.efficiency) / g.efficiency) * 1000) / 10
            : null;
          doc.fontSize(9).font("Helvetica").text(
            `${g.generatorName}  Hrs: ${g.hoursRun ?? "—"}  Open/Issued/Close: ${g.opening ?? "—"}/${g.issued}/${g.closing ?? "—"}  Consumed: ${g.consumed ?? "—"}L  L/hr derived: ${g.lPerHr ?? "—"}  L/hr recorded: ${g.efficiency ?? "—"}  Δ: ${variance != null ? variance + "%" : "—"}`
          );
        }
      }

      section(`Equipment Usage  Total Diesel Issued: ${summary.totalDieselIssued?.toFixed(1) || 0} L`);
      if (!summary.equipment.length) {
        doc.fontSize(10).font("Helvetica").text("No equipment logged.");
      } else {
        for (const e of summary.equipment) {
          doc.fontSize(9).font("Helvetica").text(
            `${e.equipmentName || `Eqp #${e.equipmentId}`}  Hrs: ${e.hours ?? "—"}  Open/Close: ${e.opening ?? "—"}/${e.closing ?? "—"}  Issued: ${e.issued ?? 0}L  Consumed: ${e.consumed ?? "—"}L  L/hr: ${e.lPerHr ?? "—"}  Op: ${e.operator ?? "—"}`
          );
        }
      }

      if (summary.manpowerByContractor?.length) {
        section("Manpower by Contractor / Category");
        let mpTotal = 0;
        for (const g of summary.manpowerByContractor) {
          doc.fontSize(10).font("Helvetica").text(
            `• ${g.contractor}  —  ${g.category} / ${g.gender}:  ${g.count}`
          );
          mpTotal += g.count;
        }
        doc.fontSize(10).font("Helvetica-Bold").text(`Total: ${mpTotal}`);
      }

      section("Manpower");
      if (!summary.manpower.length) {
        doc.fontSize(10).font("Helvetica").text("No manpower entries.");
      } else {
        for (const m of summary.manpower) {
          doc.fontSize(10).font("Helvetica").text(`• ${m.name}${m.role ? " — " + m.role : ""}`);
        }
      }

      section(`Idle Events (${summary.idle.totalMinutes} min total)`);
      if (!summary.idle.events.length) {
        doc.fontSize(10).font("Helvetica").text("No idle events.");
      } else {
        for (const ev of summary.idle.events) {
          doc.fontSize(10).font("Helvetica").text(
            `${ev.startTime} → ${ev.endTime || "ongoing"}  [${ev.reason}]  ${ev.remarks || ""}`
          );
        }
        doc.moveDown(0.2);
        doc.fontSize(10).font("Helvetica-Bold").text("By Reason:");
        for (const [reason, mins] of Object.entries(summary.idle.byReason)) {
          doc.font("Helvetica").text(`  • ${reason}: ${mins} min`);
        }
      }

      if (summary.shift?.remarks) {
        section("Remarks");
        doc.fontSize(10).font("Helvetica").text(summary.shift.remarks);
      }

      // Boiler / Heating section
      if (summary.boilerHeating) {
        const bh = summary.boilerHeating;
        section(`Boiler / Heating Sessions (${bh.sessionCount})`);
        line("Total Heating Hours", bh.totalHours);
        line("Boiler Meter LDO from Sessions (L)", bh.sessionsLdoT1L?.toFixed(1) ?? "—");
        line("Boiler L / Hour", bh.lPerHour ?? "—");
        line("Boiler L / MT Production", bh.lPerMT ?? "—");
        line("Dryer L / MT Production", summary.ldo.dryerLPerMT ?? "—");
        line("DG Diesel Attributable (L)", bh.dgDieselL?.toFixed(1) ?? "—");
        line("Shift Log Boiler Meter LDO (L)", bh.shiftLogT1L?.toFixed(1) ?? "—");
        if (bh.mismatchL != null && Math.abs(bh.mismatchL) > 5) {
          line("⚠ Reconciliation mismatch (L)", `${bh.mismatchL > 0 ? "+" : ""}${bh.mismatchL}`);
        }
        if (bh.sessions?.length) {
          for (const s of bh.sessions) {
            doc.fontSize(9).font("Helvetica").text(
              `• ${s.sessionType}  ${s.startTime || "—"}→${s.endTime || "—"}  ${s.durationHours ?? 0}h  LDO ${s.ldoTank1Consumed?.toFixed(1) ?? 0}L  DG ${s.dgDieselConsumed?.toFixed(1) ?? 0}L  ${s.staffName || ""}${s.isFinalized ? "  [Finalized]" : ""}`
            );
          }
        }
      }
  };

  // Build the bulk-ZIP cover sheet PDF: a single-page-friendly index listing each
  // requested (date, plant) row with totals + party/mix breakdown. Mirrors the
  // shape of the Daily Reports list page so the ZIP is self-contained.
  type CoverEntry = { date: string; plant: string };
  type CoverIndexRow = {
    date: string; plantName: string;
    hasDispatches: boolean; hasEquipment: boolean; hasShiftLog: boolean;
    hasBitumenDips: boolean; hasLdoMeter: boolean; hasHeatingSessions: boolean;
    totalLoads: number; totalProductionMt: number; sessionsCount: number;
    shiftLogFinalized: boolean;
    breakdown: Array<{ partyName: string; mixType: string; loads: number; mt: number }>;
  };
  const buildBulkZipCoverSheetPdf = async (
    entries: CoverEntry[],
    indexByKey: Map<string, CoverIndexRow>,
    fromD: string,
    toD: string,
  ): Promise<Buffer> => {
    return await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margin: 36 });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      try {
        const logoPath = path.join(process.cwd(), "attached_assets", "1B61665A-8ECB-443A-98A5-FB3676935BB8_1_102_a_1767081845854.jpeg");
        try { if (fs.existsSync(logoPath)) doc.image(logoPath, 36, 32, { width: 46, height: 46 }); } catch {}
        doc.fontSize(16).font("Helvetica-Bold").text("Daily Plant Reports — Cover Sheet", 92, 36);
        doc.fontSize(10).font("Helvetica").text("High Lane Constructions Pvt Ltd", 92, 56);
        const rangeLabel = fromD === toD ? fromD : `${fromD} → ${toD}`;
        doc.fontSize(10).text(`Range: ${rangeLabel}    Entries: ${entries.length}    Generated: ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC`, 92, 70);
        doc.moveTo(36, 90).lineTo(559, 90).stroke();

        // Sort entries: most recent first, then plant name (matches list page order).
        const sorted = [...entries].sort((a, b) =>
          b.date.localeCompare(a.date) || a.plant.localeCompare(b.plant)
        );

        // Column layout (page width 559 - 36 = 523 usable).
        const COL = {
          date: { x: 36, w: 78 },
          plant: { x: 116, w: 92 },
          loads: { x: 210, w: 40 },
          mt: { x: 252, w: 50 },
          breakdown: { x: 304, w: 200 },
          sessions: { x: 506, w: 53 },
        };

        const drawHeader = (y: number) => {
          doc.fontSize(9).font("Helvetica-Bold").fillColor("#000");
          doc.text("Date", COL.date.x, y, { width: COL.date.w });
          doc.text("Plant", COL.plant.x, y, { width: COL.plant.w });
          doc.text("Loads", COL.loads.x, y, { width: COL.loads.w, align: "right" });
          doc.text("MT", COL.mt.x, y, { width: COL.mt.w, align: "right" });
          doc.text("Party / Mix Breakdown", COL.breakdown.x, y, { width: COL.breakdown.w });
          doc.text("Heat Sess.", COL.sessions.x, y, { width: COL.sessions.w, align: "right" });
          doc.moveTo(36, y + 12).lineTo(559, y + 12).stroke();
          return y + 16;
        };

        let y = 100;
        y = drawHeader(y);

        // Grand totals across all entries that have data.
        let grandLoads = 0;
        let grandMt = 0;
        let grandSessions = 0;
        let daysWithData = 0;

        const PAGE_BOTTOM = 800;
        for (const e of sorted) {
          const row = indexByKey.get(`${e.date}|${e.plant}`);
          const breakdownLines: string[] = row && row.breakdown.length > 0
            ? row.breakdown.map((b) => `• ${b.partyName}: ${b.loads} load${b.loads === 1 ? "" : "s"} / ${b.mt.toFixed(2)} MT (${b.mixType})`)
            : ["—"];

          // Pre-measure the row height based on breakdown wrap.
          doc.fontSize(8).font("Helvetica");
          const breakdownText = breakdownLines.join("\n");
          const breakdownH = doc.heightOfString(breakdownText, { width: COL.breakdown.w });
          const rowH = Math.max(14, breakdownH + 4);

          if (y + rowH > PAGE_BOTTOM) {
            doc.addPage();
            y = 40;
            y = drawHeader(y);
          }

          doc.fontSize(9).font("Helvetica").fillColor("#000");
          doc.text(e.date, COL.date.x, y, { width: COL.date.w });
          doc.text(e.plant, COL.plant.x, y, { width: COL.plant.w });
          if (row && row.hasDispatches) {
            doc.text(String(row.totalLoads || 0), COL.loads.x, y, { width: COL.loads.w, align: "right" });
            doc.text(row.totalProductionMt ? row.totalProductionMt.toFixed(2) : "—", COL.mt.x, y, { width: COL.mt.w, align: "right" });
            grandLoads += row.totalLoads || 0;
            grandMt += row.totalProductionMt || 0;
            daysWithData += 1;
          } else {
            doc.text("—", COL.loads.x, y, { width: COL.loads.w, align: "right" });
            doc.text("—", COL.mt.x, y, { width: COL.mt.w, align: "right" });
          }
          doc.fontSize(8).font("Helvetica");
          doc.text(breakdownText, COL.breakdown.x, y, { width: COL.breakdown.w });
          doc.fontSize(9);
          if (row && row.sessionsCount) {
            doc.text(String(row.sessionsCount), COL.sessions.x, y, { width: COL.sessions.w, align: "right" });
            grandSessions += row.sessionsCount;
          } else {
            doc.text("—", COL.sessions.x, y, { width: COL.sessions.w, align: "right" });
          }

          y += rowH;
          doc.moveTo(36, y - 1).lineTo(559, y - 1).strokeColor("#cccccc").stroke().strokeColor("#000");
        }

        // Totals strip.
        if (y + 30 > PAGE_BOTTOM) { doc.addPage(); y = 40; }
        y += 6;
        doc.fontSize(10).font("Helvetica-Bold").fillColor("#000");
        doc.text(`Totals  —  ${entries.length} entr${entries.length === 1 ? "y" : "ies"} (${daysWithData} with data)`, COL.date.x, y, { width: COL.plant.x - COL.date.x + COL.plant.w });
        doc.text(String(grandLoads || "—"), COL.loads.x, y, { width: COL.loads.w, align: "right" });
        doc.text(grandMt ? grandMt.toFixed(2) : "—", COL.mt.x, y, { width: COL.mt.w, align: "right" });
        doc.text(String(grandSessions || "—"), COL.sessions.x, y, { width: COL.sessions.w, align: "right" });

        doc.end();
      } catch (e) { reject(e); }
    });
  };

  const buildDailyPlantReportPdfBuffer = async (date: string, plantName: string): Promise<Buffer> => {
    const summary: any = await storage.getDailyPlantSummary(date, plantName);
    return await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      try {
        renderDailyPlantPdfBody(doc, date, summary);
        doc.end();
      } catch (e) { reject(e); }
    });
  };

  // Index of historical Daily Plant Reports — every (date, plant) that has any source data.
  app.get("/api/plant-module/daily-reports-index", async (req, res) => {
    try {
      const from = (req.query.from as string) || undefined;
      const to = (req.query.to as string) || undefined;
      const plant = (req.query.plant as string) || undefined;
      // `party` and `mixType` may be repeated (?party=1&party=2) or comma-separated.
      const splitMulti = (v: unknown): string[] => {
        if (Array.isArray(v)) return v.flatMap((x) => String(x).split(",")).map((s) => s.trim()).filter(Boolean);
        if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
        return [];
      };
      const parties = splitMulti(req.query.party).map((s) => Number(s)).filter((n) => Number.isFinite(n));
      const mixTypes = splitMulti(req.query.mixType);
      const rows = await storage.getDailyPlantReportIndex({ from, to, plant, parties, mixTypes });
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to load daily reports index" });
    }
  });

  // CSV/Excel export of the Daily Reports list page — multi-day, self-contained:
  // includes a Summary section/sheet that mirrors the bulk-zip cover-sheet PDF
  // (date, plant, loads, MT, party/mix breakdown) plus a Detail section/sheet with
  // one row per (date, plant, party, mix) breakdown entry. Empty days render as "—"
  // instead of being silently dropped, matching the cover-sheet behaviour. Same
  // filter query params as /api/plant-module/daily-reports-index. `format=csv|xlsx`
  // (defaults to xlsx).
  app.get("/api/plant-module/daily-reports-export", async (req, res) => {
    try {
      const from = (req.query.from as string) || undefined;
      const to = (req.query.to as string) || undefined;
      const plant = (req.query.plant as string) || undefined;
      const splitMulti = (v: unknown): string[] => {
        if (Array.isArray(v)) return v.flatMap((x) => String(x).split(",")).map((s) => s.trim()).filter(Boolean);
        if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
        return [];
      };
      const parties = splitMulti(req.query.party).map((s) => Number(s)).filter((n) => Number.isFinite(n));
      const mixTypes = splitMulti(req.query.mixType);
      const format = (String(req.query.format || "xlsx").toLowerCase() === "csv") ? "csv" : "xlsx";

      const rows = await storage.getDailyPlantReportIndex({ from, to, plant, parties, mixTypes });
      // Match the cover-sheet sort order: most recent first, then plant name.
      const sorted = [...rows].sort((a, b) =>
        b.date.localeCompare(a.date) || a.plantName.localeCompare(b.plantName)
      );

      const grandLoads = sorted.reduce((s, r) => s + (r.totalLoads || 0), 0);
      const grandMt = sorted.reduce((s, r) => s + (r.totalProductionMt || 0), 0);
      const grandSessions = sorted.reduce((s, r) => s + (r.sessionsCount || 0), 0);
      const daysWithData = sorted.filter((r) => r.hasDispatches).length;

      const sortedDatesAll = sorted.map((r) => r.date).sort();
      const fromD = from || sortedDatesAll[0] || "";
      const toD = to || sortedDatesAll[sortedDatesAll.length - 1] || "";
      const rangeLabel = !fromD && !toD ? "all dates"
        : fromD === toD ? fromD
        : `${fromD || "…"} → ${toD || "…"}`;
      const generatedAt = new Date().toISOString().slice(0, 19).replace("T", " ") + " UTC";
      const filenameRange = fromD && toD
        ? (fromD === toD ? fromD : `${fromD}_to_${toD}`)
        : "all-dates";

      // Summary table — one row per (date, plant) with totals + breakdown joined.
      type SummaryRow = {
        Date: string; Plant: string; Loads: string | number; MT: string;
        "Party / Mix Breakdown": string; "Heat Sess.": string | number;
      };
      const summaryRows: SummaryRow[] = sorted.map((r) => ({
        Date: r.date,
        Plant: r.plantName,
        Loads: r.hasDispatches ? r.totalLoads : "—",
        MT: r.hasDispatches && r.totalProductionMt ? r.totalProductionMt.toFixed(2) : "—",
        "Party / Mix Breakdown": r.breakdown.length > 0
          ? r.breakdown.map((b) => `${b.partyName}: ${b.loads} load${b.loads === 1 ? "" : "s"} / ${b.mt.toFixed(2)} MT (${b.mixType})`).join(" | ")
          : "—",
        "Heat Sess.": r.sessionsCount || "—",
      }));

      // Detail breakdown — one row per party/mix entry. Empty days get a "—" row
      // so accountants can still see the date appears in the export.
      type DetailRow = {
        Date: string; Plant: string; Party: string; "Mix Type": string;
        Loads: string | number; MT: string;
      };
      const detailRows: DetailRow[] = sorted.flatMap((r) =>
        r.breakdown.length > 0
          ? r.breakdown.map((b) => ({
              Date: r.date, Plant: r.plantName, Party: b.partyName,
              "Mix Type": b.mixType, Loads: b.loads, MT: b.mt.toFixed(2),
            }))
          : [{ Date: r.date, Plant: r.plantName, Party: "—", "Mix Type": "—", Loads: "—", MT: "—" }]
      );

      if (format === "csv") {
        const escape = (v: any) => {
          const s = v == null ? "" : String(v);
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const toLine = (cells: any[]) => cells.map(escape).join(",");
        const lines: string[] = [];
        // Cover header — mirrors the cover-sheet PDF top strip.
        lines.push(toLine(["Daily Plant Reports — Cover Sheet"]));
        lines.push(toLine(["High Lane Constructions Pvt Ltd"]));
        lines.push(toLine([`Range: ${rangeLabel}`]));
        lines.push(toLine([`Entries: ${sorted.length} (${daysWithData} with data)`]));
        lines.push(toLine([`Totals: ${grandLoads || "—"} loads / ${grandMt ? grandMt.toFixed(2) : "—"} MT / ${grandSessions || "—"} heat sessions`]));
        lines.push(toLine([`Generated: ${generatedAt}`]));
        lines.push("");
        lines.push(toLine(["== SUMMARY =="]));
        lines.push(toLine(["Date", "Plant", "Loads", "MT", "Party / Mix Breakdown", "Heat Sess."]));
        for (const r of summaryRows) {
          lines.push(toLine([r.Date, r.Plant, r.Loads, r.MT, r["Party / Mix Breakdown"], r["Heat Sess."]]));
        }
        lines.push(toLine(["Totals", `${sorted.length} entr${sorted.length === 1 ? "y" : "ies"} (${daysWithData} with data)`, grandLoads || "—", grandMt ? grandMt.toFixed(2) : "—", "", grandSessions || "—"]));
        lines.push("");
        lines.push(toLine(["== DETAIL (party / mix breakdown) =="]));
        lines.push(toLine(["Date", "Plant", "Party", "Mix Type", "Loads", "MT"]));
        for (const r of detailRows) {
          lines.push(toLine([r.Date, r.Plant, r.Party, r["Mix Type"], r.Loads, r.MT]));
        }
        const body = "\uFEFF" + lines.join("\r\n") + "\r\n";
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="daily-plant-reports-${filenameRange}.csv"`);
        res.send(body);
        return;
      }

      // xlsx — Summary sheet (with cover header rows) + Detail sheet.
      const wb = xlsx.utils.book_new();
      const summaryAoa: any[][] = [
        ["Daily Plant Reports — Cover Sheet"],
        ["High Lane Constructions Pvt Ltd"],
        [`Range: ${rangeLabel}`],
        [`Entries: ${sorted.length} (${daysWithData} with data)`],
        [`Totals: ${grandLoads || "—"} loads / ${grandMt ? grandMt.toFixed(2) : "—"} MT / ${grandSessions || "—"} heat sessions`],
        [`Generated: ${generatedAt}`],
        [],
        ["Date", "Plant", "Loads", "MT", "Party / Mix Breakdown", "Heat Sess."],
        ...summaryRows.map((r) => [r.Date, r.Plant, r.Loads, r.MT, r["Party / Mix Breakdown"], r["Heat Sess."]]),
        [
          "Totals",
          `${sorted.length} entr${sorted.length === 1 ? "y" : "ies"} (${daysWithData} with data)`,
          grandLoads || "—",
          grandMt ? grandMt.toFixed(2) : "—",
          "",
          grandSessions || "—",
        ],
      ];
      const summarySheet = xlsx.utils.aoa_to_sheet(summaryAoa);
      // Set sensible column widths so the breakdown column stays readable.
      (summarySheet as any)["!cols"] = [
        { wch: 12 }, { wch: 18 }, { wch: 8 }, { wch: 10 }, { wch: 70 }, { wch: 10 },
      ];
      xlsx.utils.book_append_sheet(wb, summarySheet, "Summary");

      const detailSheet = xlsx.utils.json_to_sheet(detailRows, {
        header: ["Date", "Plant", "Party", "Mix Type", "Loads", "MT"],
      });
      (detailSheet as any)["!cols"] = [
        { wch: 12 }, { wch: 18 }, { wch: 24 }, { wch: 18 }, { wch: 8 }, { wch: 10 },
      ];
      xlsx.utils.book_append_sheet(wb, detailSheet, "Detail");

      const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="daily-plant-reports-${filenameRange}.xlsx"`);
      res.send(buf);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to export daily reports" });
    }
  });

  // Bulk PDF export — accepts a list of (date, plant) entries and streams ONE STORE-mode ZIP
  // containing all PDFs (across plants). Per-date success/failure is reported in two ways:
  //   1. Response headers `X-Bulk-Total`, `X-Bulk-Succeeded`, `X-Bulk-Failed` and `X-Bulk-Status`
  //      (a JSON array of { date, plant, ok, error? }).
  //   2. A `manifest.json` file embedded inside the ZIP with the same per-entry status list.
  // Backward-compat: also accepts the old { plant, dates: [...] } shape.
  app.post("/api/plant-module/daily-reports/bulk-zip", async (req, res) => {
    try {
      type Entry = { date: string; plant: string };
      let entries: Entry[] = [];
      if (Array.isArray(req.body?.entries)) {
        entries = (req.body.entries as any[])
          .map((e) => ({ date: String(e?.date || "").trim(), plant: String(e?.plant || "Main Plant").trim() || "Main Plant" }))
          .filter((e) => e.date);
      } else if (Array.isArray(req.body?.dates)) {
        const plantName = (req.body?.plant as string) || "Main Plant";
        entries = (req.body.dates as any[]).map((d) => ({ date: String(d), plant: plantName }));
      }
      if (!entries.length) {
        return res.status(400).json({ message: "Provide at least one entry" });
      }
      // Guard rail: cap each request to keep memory bounded (each PDF ≈ 150-200 KB).
      const MAX_ENTRIES = 200;
      if (entries.length > MAX_ENTRIES) {
        return res.status(400).json({ message: `Too many reports (${entries.length}). Max ${MAX_ENTRIES} per ZIP — narrow the date range and try again.` });
      }

      // Build PDFs sequentially to keep memory reasonable.
      type Status = { date: string; plant: string; ok: boolean; error?: string; bytes?: number };
      const status: Status[] = [];
      const files: Array<{ name: string; data: Buffer }> = [];
      const slugPlant = (p: string) => p.replace(/[^A-Za-z0-9._-]+/g, "_");

      // Cover sheet — a single index PDF listing every (date, plant) row with totals
      // + party/mix breakdown so accountants can scan the export without opening
      // each per-day PDF. Empty days render as "—". Built from
      // getDailyPlantReportIndex (same shape as the Daily Reports list page).
      try {
        const sortedDatesForCover = entries.map((e) => e.date).sort();
        const coverFromD = sortedDatesForCover[0];
        const coverToD = sortedDatesForCover[sortedDatesForCover.length - 1];
        const indexRows = await storage.getDailyPlantReportIndex({ from: coverFromD, to: coverToD });
        const indexByKey = new Map(indexRows.map((r) => [`${r.date}|${r.plantName}`, r]));
        const coverBuf = await buildBulkZipCoverSheetPdf(entries, indexByKey, coverFromD, coverToD);
        // 00- prefix keeps it sorted to the top in most ZIP viewers.
        files.push({ name: "00-cover-sheet.pdf", data: coverBuf });
      } catch (err: any) {
        const msg = err?.message || String(err);
        files.push({ name: "00-cover-sheet-ERROR.txt", data: Buffer.from(`Failed to build cover sheet: ${msg}`) });
      }

      for (const e of entries) {
        try {
          const buf = await buildDailyPlantReportPdfBuffer(e.date, e.plant);
          files.push({ name: `daily-plant-report-${slugPlant(e.plant)}-${e.date}.pdf`, data: buf });
          status.push({ date: e.date, plant: e.plant, ok: true, bytes: buf.length });
        } catch (err: any) {
          const msg = err?.message || String(err);
          files.push({ name: `ERROR-${slugPlant(e.plant)}-${e.date}.txt`, data: Buffer.from(`Failed to build PDF for ${e.plant} on ${e.date}: ${msg}`) });
          status.push({ date: e.date, plant: e.plant, ok: false, error: msg });
        }
      }
      const manifest = {
        generatedAt: new Date().toISOString(),
        total: status.length,
        succeeded: status.filter((s) => s.ok).length,
        failed: status.filter((s) => !s.ok).length,
        entries: status,
      };
      files.push({ name: "manifest.json", data: Buffer.from(JSON.stringify(manifest, null, 2)) });

      // Minimal STORE-mode ZIP encoder (no compression, supports any byte data).
      const crc32Table = (() => {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
          let c = n;
          for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
          t[n] = c >>> 0;
        }
        return t;
      })();
      const crc32 = (buf: Buffer): number => {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < buf.length; i++) c = (crc32Table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)) >>> 0;
        return (c ^ 0xFFFFFFFF) >>> 0;
      };

      const localParts: Buffer[] = [];
      const centralParts: Buffer[] = [];
      let offset = 0;
      for (const f of files) {
        const nameBuf = Buffer.from(f.name, "utf8");
        const crc = crc32(f.data);
        const size = f.data.length;

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0); // local header sig
        local.writeUInt16LE(20, 4);          // version needed
        local.writeUInt16LE(0x0800, 6);      // flags (UTF-8 name)
        local.writeUInt16LE(0, 8);           // method = STORE
        local.writeUInt16LE(0, 10);          // mod time
        local.writeUInt16LE(0, 12);          // mod date
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(size, 18);
        local.writeUInt32LE(size, 22);
        local.writeUInt16LE(nameBuf.length, 26);
        local.writeUInt16LE(0, 28);          // extra length
        localParts.push(local, nameBuf, f.data);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);        // version made by
        central.writeUInt16LE(20, 6);        // version needed
        central.writeUInt16LE(0x0800, 8);    // flags
        central.writeUInt16LE(0, 10);        // method
        central.writeUInt16LE(0, 12);        // mod time
        central.writeUInt16LE(0, 14);        // mod date
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(size, 20);
        central.writeUInt32LE(size, 24);
        central.writeUInt16LE(nameBuf.length, 28);
        central.writeUInt16LE(0, 30);        // extra
        central.writeUInt16LE(0, 32);        // comment
        central.writeUInt16LE(0, 34);        // disk #
        central.writeUInt16LE(0, 36);        // internal attrs
        central.writeUInt32LE(0, 38);        // external attrs
        central.writeUInt32LE(offset, 42);
        centralParts.push(central, nameBuf);

        offset += local.length + nameBuf.length + size;
      }

      const centralStart = offset;
      const centralBuf = Buffer.concat(centralParts);
      const eocd = Buffer.alloc(22);
      eocd.writeUInt32LE(0x06054b50, 0);
      eocd.writeUInt16LE(0, 4);              // disk #
      eocd.writeUInt16LE(0, 6);              // disk w/ central
      eocd.writeUInt16LE(files.length, 8);
      eocd.writeUInt16LE(files.length, 10);
      eocd.writeUInt32LE(centralBuf.length, 12);
      eocd.writeUInt32LE(centralStart, 16);
      eocd.writeUInt16LE(0, 20);             // comment length

      const zip = Buffer.concat([...localParts, centralBuf, eocd]);
      const sortedDates = entries.map((e) => e.date).sort();
      const fromD = sortedDates[0];
      const toD = sortedDates[sortedDates.length - 1];
      const filename = `daily-plant-reports-${fromD}_to_${toD}.zip`;
      const statusJson = JSON.stringify(status);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", String(zip.length));
      res.setHeader("X-Bulk-Total", String(manifest.total));
      res.setHeader("X-Bulk-Succeeded", String(manifest.succeeded));
      res.setHeader("X-Bulk-Failed", String(manifest.failed));
      // Encode as base64 to avoid header-unsafe characters in error messages.
      res.setHeader("X-Bulk-Status", Buffer.from(statusJson, "utf8").toString("base64"));
      res.setHeader("Access-Control-Expose-Headers", "X-Bulk-Total, X-Bulk-Succeeded, X-Bulk-Failed, X-Bulk-Status, Content-Disposition");
      res.end(zip);
    } catch (err: any) {
      console.error("Bulk ZIP error", err);
      res.status(500).json({ message: err.message || "Failed to build bulk ZIP" });
    }
  });

  app.get("/api/plant-module/daily-reports/:date/pdf", async (req, res) => {
    try {
      const date = req.params.date;
      const plantName = (req.query.plant as string) || "Main Plant";
      const summary: any = await storage.getDailyPlantSummary(date, plantName);

      const doc = new PDFDocument({ size: "A4", margin: 40 });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="daily-plant-report-${date}.pdf"`);
      doc.pipe(res);

      renderDailyPlantPdfBody(doc, date, summary);
      doc.end();
    } catch (err: any) {
      console.error("PDF error", err);
      res.status(500).json({ message: err.message || "Failed to generate PDF" });
    }
  });

  // ============================================
  // BITUMEN HEATING SESSIONS
  // ============================================

  app.get("/api/plant-module/heating-sessions", async (req, res) => {
    try {
      const rows = await storage.getBitumenHeatingSessions({
        date: req.query.date as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        plantName: (req.query.plant as string | undefined) || undefined,
      });
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch heating sessions" });
    }
  });

  app.get("/api/plant-module/heating-sessions/:id", async (req, res) => {
    try {
      const row = await storage.getBitumenHeatingSession(parseInt(req.params.id));
      if (!row) return res.status(404).json({ message: "Heating session not found" });
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/plant-module/heating-sessions", async (req, res) => {
    try {
      const { upsertBitumenHeatingSessionSchema } = await import("@shared/schema");
      const parsed = upsertBitumenHeatingSessionSchema.parse(req.body);
      if (parsed.id != null) {
        return res.status(400).json({ code: "ID_NOT_ALLOWED_ON_POST", message: "POST creates new sessions; use PUT /:id to update" });
      }
      const editedBy = parsed.editedBy || "operator";
      // Operator-driven save flow — no PIN gating; finalized rows can be re-edited freely.
      const authorizedRole: "admin" | "manager" | null = "manager";
      try {
        const saved = await storage.upsertBitumenHeatingSession(parsed, editedBy, authorizedRole);
        res.status(201).json(saved);
      } catch (e: any) {
        if (e?.code === "FINALIZED_LOCKED") return res.status(403).json({ code: "FINALIZED_LOCKED", message: e.message });
        if (e?.code === "GEN_LOG_ALREADY_LINKED") return res.status(409).json({ code: "GEN_LOG_ALREADY_LINKED", message: e.message });
        if (e?.code === "GEN_LOG_NOT_FOUND" || e?.code === "GEN_LOG_DATE_MISMATCH" || e?.code === "GEN_LOG_PLANT_MISMATCH"
            || e?.code === "METER_DECREASING" || e?.code === "DG_DIESEL_INCONSISTENT" || e?.code === "GEN_LOG_REQUIRED") {
          return res.status(400).json({ code: e.code, message: e.message });
        }
        throw e;
      }
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to save heating session" });
    }
  });

  app.put("/api/plant-module/heating-sessions/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (!assertEdit(req, res, "plant_heating")) return;
      const { upsertBitumenHeatingSessionSchema } = await import("@shared/schema");
      const parsed = upsertBitumenHeatingSessionSchema.parse(req.body);
      const editedBy = parsed.editedBy || currentUserName(req) || "operator";
      const authorizedRole: "admin" | "manager" | null = "manager";
      try {
        const saved = await storage.upsertBitumenHeatingSession(
          { ...parsed, id },
          editedBy,
          authorizedRole,
        );
        res.json(saved);
      } catch (e: any) {
        if (e?.code === "FINALIZED_LOCKED") return res.status(403).json({ code: "FINALIZED_LOCKED", message: e.message });
        if (e?.code === "GEN_LOG_ALREADY_LINKED") return res.status(409).json({ code: "GEN_LOG_ALREADY_LINKED", message: e.message });
        if (e?.code === "GEN_LOG_NOT_FOUND" || e?.code === "GEN_LOG_DATE_MISMATCH" || e?.code === "GEN_LOG_PLANT_MISMATCH"
            || e?.code === "METER_DECREASING" || e?.code === "DG_DIESEL_INCONSISTENT") {
          return res.status(400).json({ code: e.code, message: e.message });
        }
        throw e;
      }
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to save heating session" });
    }
  });

  app.post("/api/plant-module/heating-sessions/:id/finalize", async (req, res) => {
    try {
      const finalizedBy: string = (req.body?.finalizedBy as string) || "operator";
      const updated = await storage.finalizeBitumenHeatingSession(parseInt(req.params.id), finalizedBy);
      if (!updated) return res.status(404).json({ message: "Heating session not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/plant-module/heating-sessions/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const ok = await storage.deleteBitumenHeatingSession(parseInt(req.params.id));
      if (!ok) return res.status(404).json({ message: "Heating session not found" });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  function resolveTrendsRange(req: any): { dateFrom: string; dateTo: string; plantName: string } | { error: string } {
    const today = new Date().toISOString().slice(0, 10);
    const dateTo = (req.query.dateTo as string) || today;
    const dateFromQ = req.query.dateFrom as string | undefined;
    let dateFrom = dateFromQ;
    if (!dateFrom) {
      const d = new Date(`${dateTo}T00:00:00`);
      d.setDate(d.getDate() - 29);
      dateFrom = d.toISOString().slice(0, 10);
    }
    if (!ISO_DATE_RE.test(dateFrom) || !ISO_DATE_RE.test(dateTo)) {
      return { error: "dateFrom and dateTo must be YYYY-MM-DD" };
    }
    if (dateFrom > dateTo) {
      return { error: "dateFrom must be <= dateTo" };
    }
    const plantName = (req.query.plant as string | undefined) || "Main Plant";
    return { dateFrom, dateTo, plantName };
  }

  app.get("/api/plant-module/heating-trends", async (req, res) => {
    try {
      const r = resolveTrendsRange(req);
      if ("error" in r) return res.status(400).json({ message: r.error });
      const result = await storage.getHeatingTrends(r);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch heating trends" });
    }
  });

  app.get("/api/plant-module/heating-trends/excel", async (req, res) => {
    try {
      const r = resolveTrendsRange(req);
      if ("error" in r) return res.status(400).json({ message: r.error });
      const { dateFrom, dateTo, plantName } = r;
      const trends = await storage.getHeatingTrends({ dateFrom, dateTo, plantName });
      const sheet = trends.rows.map(r => ({
        Date: r.date,
        "Production (MT)": r.productionMT,
        "Night Sessions": r.night.count,
        "Night Hours": r.night.hours,
        "Night Boiler Meter (L)": r.night.ldoT1L,
        "Night L/Hour": r.night.lPerHour ?? "",
        "Night L/MT": r.night.lPerMT ?? "",
        "Day Sessions": r.day.count,
        "Day Hours": r.day.hours,
        "Day Boiler Meter (L)": r.day.ldoT1L,
        "Day L/Hour": r.day.lPerHour ?? "",
        "Day L/MT": r.day.lPerMT ?? "",
        "Total Sessions": r.total.count,
        "Total Hours": r.total.hours,
        "Total Boiler Meter (L)": r.total.ldoT1L,
        "DG Diesel (L)": r.total.dgDieselL,
        "L/Hour (boiler)": r.total.lPerHour ?? "",
        "L/MT (boiler)": r.total.lPerMT ?? "",
        "Target L/MT": trends.targetLPerMT,
      }));
      const summary = [{
        "Date Range": `${trends.dateFrom} to ${trends.dateTo}`,
        Plant: trends.plantName,
        Days: trends.summary.days,
        Sessions: trends.summary.sessionCount,
        "Total Hours": trends.summary.totalHours,
        "Total Boiler Meter (L)": trends.summary.totalLdoT1L,
        "DG Diesel (L)": trends.summary.dgDieselL,
        "Production (MT)": trends.summary.totalProductionMT,
        "L/Hour": trends.summary.lPerHour ?? "",
        "L/MT": trends.summary.lPerMT ?? "",
        "Target L/MT": trends.targetLPerMT,
      }];
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(summary), "Summary");
      xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(sheet), "Daily");
      const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="heating-trends-${dateFrom}-to-${dateTo}.xlsx"`);
      res.send(buf);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to export heating trends" });
    }
  });

  app.get("/api/plant-module/ldo-meter/last", async (req, res) => {
    try {
      const tank = parseInt((req.query.tank as string) || "1");
      if (tank !== 1 && tank !== 2) {
        return res.status(400).json({ code: "INVALID_TANK", message: "tank must be 1 or 2" });
      }
      const before = (req.query.before as string) || new Date().toISOString().slice(0, 16);
      const plantName = (req.query.plant as string) || "Main Plant";
      const result = await storage.getLatestLdoMeterReading(tank, before, plantName);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ============================================
  // PURCHASE INDENTS
  // ============================================

  app.get("/api/purchase-indents", async (req, res) => {
    try {
      const filters = {
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        status: req.query.status as string | undefined,
        priority: req.query.priority as string | undefined,
      };
      const indents = await storage.getPurchaseIndents(filters);
      res.json(indents);
    } catch (err) {
      console.error("Error fetching purchase indents:", err);
      res.status(500).json({ message: "Failed to fetch purchase indents" });
    }
  });

  app.get("/api/purchase-indents/summary", async (req, res) => {
    try {
      const all = await storage.getPurchaseIndents();
      const summary = {
        total: all.length,
        pending: all.filter(i => i.status === "pending").length,
        approved: all.filter(i => i.status === "approved").length,
        rejected: all.filter(i => i.status === "rejected").length,
        completed: all.filter(i => i.status === "completed").length,
      };
      res.json(summary);
    } catch (err) {
      console.error("Error fetching purchase indent summary:", err);
      res.status(500).json({ message: "Failed to fetch purchase indent summary" });
    }
  });

  app.get("/api/purchase-indents/report", async (req, res) => {
    try {
      const filters = {
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        purchaseStatus: req.query.purchaseStatus as string | undefined,
        purpose: req.query.purpose as string | undefined,
        vendor: req.query.vendor as string | undefined,
      };
      const report = await storage.getProcurementReport(filters);
      res.json(report);
    } catch (err) {
      console.error("Error fetching procurement report:", err);
      res.status(500).json({ message: "Failed to fetch procurement report" });
    }
  });

  app.get("/api/purchase-indents/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const indent = await storage.getPurchaseIndent(id);
      if (!indent) {
        return res.status(404).json({ message: "Purchase indent not found" });
      }
      res.json(indent);
    } catch (err) {
      console.error("Error fetching purchase indent:", err);
      res.status(500).json({ message: "Failed to fetch purchase indent" });
    }
  });

  app.post("/api/purchase-indents", async (req, res) => {
    try {
      const input = createPurchaseIndentRequestSchema.parse(req.body);
      const indent = await storage.createPurchaseIndent(input);
      sendPushToAll("New Purchase Indent", `${indent.indentNo} raised by ${indent.raisedBy}`, "/plant/purchase-indents").catch(() => {});
      res.status(201).json(indent);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, errors: err.errors });
      }
      console.error("Error creating purchase indent:", err);
      res.status(500).json({ message: "Failed to create purchase indent" });
    }
  });

  app.patch("/api/purchase-indents/:id/approve", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { pin, approvedItems, remarks } = req.body;

      if (!assertEdit(req, res, "site_procurement")) return;
      const approvedBy = currentUserName(req);

      const approvedItemsSchema = z.array(z.object({
        itemId: z.number(),
        approvedQty: z.number(),
      }));
      const validatedItems = approvedItemsSchema.parse(approvedItems);

      const indent = await storage.approvePurchaseIndent(id, validatedItems, approvedBy, remarks);
      if (!indent) {
        return res.status(404).json({ message: "Purchase indent not found" });
      }
      sendPushToAll("Indent Approved", `${indent.indentNo} approved by ${approvedBy}`, "/plant/purchase-indents").catch(() => {});
      res.json(indent);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error approving purchase indent:", err);
      res.status(500).json({ message: "Failed to approve purchase indent" });
    }
  });

  app.patch("/api/purchase-indents/:id/reject", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { reason } = req.body;

      if (!assertEdit(req, res, "site_procurement")) return;
      const rejectedBy = currentUserName(req);

      if (!reason || typeof reason !== "string") {
        return res.status(400).json({ message: "Rejection reason is required" });
      }

      const indent = await storage.rejectPurchaseIndent(id, reason, rejectedBy);
      if (!indent) {
        return res.status(404).json({ message: "Purchase indent not found" });
      }
      sendPushToAll("Indent Rejected", `${indent.indentNo} rejected by ${rejectedBy}`, "/plant/purchase-indents").catch(() => {});
      res.json(indent);
    } catch (err) {
      console.error("Error rejecting purchase indent:", err);
      res.status(500).json({ message: "Failed to reject purchase indent" });
    }
  });

  app.post("/api/purchase-indents/:id/notify", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const customMessage = typeof req.body?.message === "string" ? req.body.message.trim() : "";
      const indent = await storage.getPurchaseIndent(id);
      if (!indent) {
        return res.status(404).json({ message: "Purchase indent not found" });
      }
      const totalEst = indent.items.reduce((sum, item: any) => {
        const ea = item.estAmount ?? (item.estRate && item.qty ? item.estRate * item.qty : null);
        return sum + (ea || 0);
      }, 0);
      const estStr = totalEst > 0 ? ` | Est. ₹${Math.round(totalEst).toLocaleString("en-IN")}` : "";
      const baseBody = `${indent.indentNo} by ${indent.raisedBy} — ${indent.items.length} item(s)${estStr}. Pending review.`;
      const itemNotes = (indent.items as any[])
        .filter((item) => item.reviewerNote?.trim())
        .map((item, i) => `${i + 1}. ${item.description}: ${item.reviewerNote.trim()}`)
        .join(" | ");
      const combinedNote = [customMessage, itemNotes].filter(Boolean).join(" | ");
      const body = combinedNote ? `${baseBody}\n📝 ${combinedNote}` : baseBody;
      if (combinedNote) {
        await storage.setIndentNotifyMessage(id, combinedNote);
      }
      sendPushToAll("PI Review Requested", body, "/plant/purchase-indents").catch(() => {});
      await storage.createNotification({
        type: "info",
        title: "PI Review Requested",
        message: body,
        isRead: 0,
      });
      res.json({ ok: true });
    } catch (err) {
      console.error("Error notifying for purchase indent:", err);
      res.status(500).json({ message: "Failed to send notification" });
    }
  });

  app.patch("/api/purchase-indent-items/:id/purchase-update", async (req, res) => {
    try {
      const itemId = Number(req.params.id);
      const updateSchema = z.object({
        purchaseStatus: z.string().optional(),
        qtyPurchased: z.number().optional(),
        vendor: z.string().optional(),
        billNo: z.string().optional(),
        rate: z.number().optional(),
        amount: z.number().optional(),
        purchaseRemarks: z.string().optional(),
        actionBy: z.string().optional(),
      });
      const { actionBy, ...purchaseData } = updateSchema.parse(req.body);
      const item = await storage.updatePurchaseItemStatus(itemId, purchaseData, actionBy || "SYSTEM");
      if (!item) {
        return res.status(404).json({ message: "Purchase indent item not found" });
      }
      if (purchaseData.purchaseStatus) {
        sendPushToAll("Purchase Update", `Item "${item.description}" - ${purchaseData.purchaseStatus.toUpperCase()}${purchaseData.vendor ? ` from ${purchaseData.vendor.toUpperCase()}` : ""}`, "/plant/purchase-indents").catch(() => {});
      }
      res.json(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error updating purchase indent item:", err);
      res.status(500).json({ message: "Failed to update purchase indent item" });
    }
  });

  app.patch("/api/purchase-indent-items/:id/cancel", async (req, res) => {
    try {
      const itemId = Number(req.params.id);
      const { reason } = req.body;

      if (!reason || typeof reason !== "string" || !reason.trim()) {
        return res.status(400).json({ message: "Cancellation reason is required" });
      }

      if (!assertEdit(req, res, "site_procurement")) return;
      const cancelledBy = currentUserName(req);
      const item = await storage.cancelPurchaseItem(itemId, cancelledBy, reason);
      if (!item) {
        return res.status(404).json({ message: "Purchase indent item not found" });
      }
      sendPushToAll("Item Cancelled", `"${item.description}" cancelled by ${cancelledBy}`, "/plant/purchase-indents").catch(() => {});
      res.json(item);
    } catch (err: any) {
      if (err?.message?.startsWith("Cannot cancel")) {
        return res.status(400).json({ message: err.message });
      }
      console.error("Error cancelling purchase indent item:", err);
      res.status(500).json({ message: "Failed to cancel purchase indent item" });
    }
  });

  app.patch("/api/purchase-indent-items/:id/reviewer-note", async (req, res) => {
    try {
      const itemId = Number(req.params.id);
      const note = typeof req.body?.note === "string" ? req.body.note : "";
      await storage.setItemReviewerNote(itemId, note);
      res.json({ ok: true });
    } catch (err) {
      console.error("Error saving reviewer note:", err);
      res.status(500).json({ message: "Failed to save reviewer note" });
    }
  });

  app.patch("/api/purchase-indents/:id/force-close", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { reason } = req.body;

      if (!reason || typeof reason !== "string" || !reason.trim()) {
        return res.status(400).json({ message: "Reason is required" });
      }

      if (!assertAdmin(req, res)) return;

      const indent = await storage.forceCloseIndent(id, currentUserName(req), reason);
      if (!indent) {
        return res.status(404).json({ message: "Purchase indent not found" });
      }
      sendPushToAll("Indent Force Closed", `${indent.indentNo} force closed by ADMIN`, "/plant/purchase-indents").catch(() => {});
      res.json(indent);
    } catch (err: any) {
      if (err?.message?.startsWith("Cannot force close")) {
        return res.status(400).json({ message: err.message });
      }
      console.error("Error force closing purchase indent:", err);
      res.status(500).json({ message: "Failed to force close purchase indent" });
    }
  });

  app.put("/api/purchase-indents/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { pin: _pin, ...data } = req.body;

      const existing = await storage.getPurchaseIndent(id);
      if (!existing) return res.status(404).json({ message: "Purchase indent not found" });

      // Lock check (Task #229) — must be unlocked before edit.
      if (!(await assertWritable(res, "purchase_indent", id))) return;

      if (existing.status !== "pending") {
        if (!assertAdmin(req, res)) return;
      } else {
        if (!assertEdit(req, res, "site_procurement")) return;
      }

      const validatedData = createPurchaseIndentRequestSchema.parse(data);
      const indent = await storage.updatePurchaseIndent(id, validatedData);
      if (!indent) return res.status(404).json({ message: "Purchase indent not found" });

      try { await relockResource("purchase_indent", id, req.authUser!.id); } catch {}
      res.json(indent);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      if (err?.message?.startsWith("Cannot edit")) return res.status(400).json({ message: err.message });
      console.error("Error updating purchase indent:", err);
      res.status(500).json({ message: "Failed to update purchase indent" });
    }
  });

  app.delete("/api/purchase-indents/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const id = Number(req.params.id);
      const deleted = await storage.deletePurchaseIndent(id);
      if (!deleted) return res.status(404).json({ message: "Purchase indent not found" });
      res.json({ success: true });
    } catch (err: any) {
      if (err?.message?.startsWith("Cannot delete")) return res.status(400).json({ message: err.message });
      console.error("Error deleting purchase indent:", err);
      res.status(500).json({ message: "Failed to delete purchase indent" });
    }
  });

  app.get("/api/purchase-indent-items/:id/history", async (req, res) => {
    try {
      const itemId = Number(req.params.id);
      const history = await storage.getItemHistory(itemId);
      res.json(history);
    } catch (err) {
      console.error("Error fetching item history:", err);
      res.status(500).json({ message: "Failed to fetch item history" });
    }
  });

  // ============================================
  // DAILY DIESEL REQUIREMENTS
  // ============================================

  app.get("/api/diesel-requirements", async (req, res) => {
    try {
      const filters = {
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        status: req.query.status as string | undefined,
      };
      const requirements = await storage.getDieselRequirements(filters);
      res.json(requirements);
    } catch (err) {
      console.error("Error fetching diesel requirements:", err);
      res.status(500).json({ message: "Failed to fetch diesel requirements" });
    }
  });

  app.get("/api/diesel-requirements/summary", async (req, res) => {
    try {
      const all = await storage.getDieselRequirements();
      const summary = {
        total: all.length,
        pending: all.filter(r => r.status === "pending").length,
        approved: all.filter(r => r.status === "approved").length,
        rejected: all.filter(r => r.status === "rejected").length,
      };
      res.json(summary);
    } catch (err) {
      console.error("Error fetching diesel requirement summary:", err);
      res.status(500).json({ message: "Failed to fetch diesel requirement summary" });
    }
  });

  app.get("/api/diesel-requirements/comparison", async (req, res) => {
    try {
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      if (!dateFrom || !dateTo) {
        return res.status(400).json({ message: "dateFrom and dateTo are required" });
      }
      const report = await storage.getDieselComparisonReport(dateFrom, dateTo);
      res.json(report);
    } catch (err) {
      console.error("Error fetching diesel comparison report:", err);
      res.status(500).json({ message: "Failed to fetch diesel comparison report" });
    }
  });

  app.get("/api/diesel-requirements/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const requirement = await storage.getDieselRequirement(id);
      if (!requirement) {
        return res.status(404).json({ message: "Diesel requirement not found" });
      }
      res.json(requirement);
    } catch (err) {
      console.error("Error fetching diesel requirement:", err);
      res.status(500).json({ message: "Failed to fetch diesel requirement" });
    }
  });

  app.post("/api/diesel-requirements", async (req, res) => {
    try {
      const input = createDieselRequirementRequestSchema.parse(req.body);
      const requirement = await storage.createDieselRequirement(input);
      sendPushToAll("New Diesel Requirement", `${requirement.date} - ${requirement.totalPlanned} L planned`, "/plant/diesel-requirements").catch(() => {});
      res.status(201).json(requirement);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, errors: err.errors });
      }
      console.error("Error creating diesel requirement:", err);
      res.status(500).json({ message: "Failed to create diesel requirement" });
    }
  });

  app.patch("/api/diesel-requirements/:id/approve", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { approvedItems } = req.body;

      if (!assertEdit(req, res, "site_diesel")) return;
      const approvedBy = currentUserName(req);

      const approvedItemsSchema = z.array(z.object({
        itemId: z.number(),
        approvedQty: z.number(),
      }));
      const validatedItems = approvedItemsSchema.parse(approvedItems);

      const requirement = await storage.approveDieselRequirement(id, validatedItems, approvedBy);
      if (!requirement) {
        return res.status(404).json({ message: "Diesel requirement not found" });
      }
      sendPushToAll("Diesel Approved", `${requirement.date} - ${requirement.totalApproved} L approved by ${approvedBy}`, "/plant/diesel-requirements").catch(() => {});
      res.json(requirement);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error approving diesel requirement:", err);
      res.status(500).json({ message: "Failed to approve diesel requirement" });
    }
  });

  app.patch("/api/diesel-requirements/:id/reject", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { reason } = req.body;

      if (!assertEdit(req, res, "site_diesel")) return;
      const rejectedBy = currentUserName(req);

      if (!reason || typeof reason !== "string") {
        return res.status(400).json({ message: "Rejection reason is required" });
      }

      const requirement = await storage.rejectDieselRequirement(id, reason, rejectedBy);
      if (!requirement) {
        return res.status(404).json({ message: "Diesel requirement not found" });
      }
      sendPushToAll("Diesel Rejected", `${requirement.date} rejected by ${rejectedBy}`, "/plant/diesel-requirements").catch(() => {});
      res.json(requirement);
    } catch (err) {
      console.error("Error rejecting diesel requirement:", err);
      res.status(500).json({ message: "Failed to reject diesel requirement" });
    }
  });

  app.patch("/api/diesel-requirements/:id/purchase-update", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const updateSchema = z.object({
        qtyPurchased: z.number().optional(),
        supplier: z.string().optional(),
        billNo: z.string().optional(),
        rate: z.number().optional(),
        amount: z.number().optional(),
        purchasedAt: z.string().optional(),
        purchaseRemarks: z.string().optional(),
      });
      const purchaseData = updateSchema.parse(req.body);
      const requirement = await storage.updateDieselPurchase(id, purchaseData);
      if (!requirement) {
        return res.status(404).json({ message: "Diesel requirement not found" });
      }
      res.json(requirement);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error updating diesel purchase:", err);
      res.status(500).json({ message: "Failed to update diesel purchase" });
    }
  });

  app.put("/api/diesel-requirements/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { pin: _pin, ...data } = req.body;

      const existing = await storage.getDieselRequirement(id);
      if (!existing) return res.status(404).json({ message: "Diesel requirement not found" });

      if (!(await assertWritable(res, "diesel_requirement", id))) return;

      if (existing.status !== "pending") {
        if (!assertAdmin(req, res)) return;
      } else {
        if (!assertEdit(req, res, "site_diesel")) return;
      }

      const validatedData = createDieselRequirementRequestSchema.parse(data);
      const requirement = await storage.updateDieselRequirement(id, validatedData);
      if (!requirement) return res.status(404).json({ message: "Diesel requirement not found" });

      try { await relockResource("diesel_requirement", id, req.authUser!.id); } catch {}
      res.json(requirement);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      if (err?.message?.startsWith("Cannot edit")) return res.status(400).json({ message: err.message });
      console.error("Error updating diesel requirement:", err);
      res.status(500).json({ message: "Failed to update diesel requirement" });
    }
  });

  app.delete("/api/diesel-requirements/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const id = Number(req.params.id);
      const deleted = await storage.deleteDieselRequirement(id);
      if (!deleted) return res.status(404).json({ message: "Diesel requirement not found" });
      res.json({ success: true });
    } catch (err: any) {
      if (err?.message?.startsWith("Cannot delete")) return res.status(400).json({ message: err.message });
      console.error("Error deleting diesel requirement:", err);
      res.status(500).json({ message: "Failed to delete diesel requirement" });
    }
  });

  // ============================================
  // VENDOR BILLS
  // ============================================

  app.get("/api/vendor-bills", async (req, res) => {
    try {
      const filters = {
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        vendor: req.query.vendor as string | undefined,
        status: req.query.status as string | undefined,
      };
      const bills = await storage.getVendorBills(filters);
      res.json(bills);
    } catch (err) {
      console.error("Error fetching vendor bills:", err);
      res.status(500).json({ message: "Failed to fetch vendor bills" });
    }
  });

  app.get("/api/vendor-bills/summary", async (req, res) => {
    try {
      const filters = {
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        vendor: req.query.vendor as string | undefined,
        status: req.query.status as string | undefined,
      };
      const bills = await storage.getVendorBills(filters);

      const { total: totalGst, ...gstByCategory } = aggregateGstBreakdown(bills);
      const gstSplit = aggregateGstSplit(bills);

      const summary = {
        total: bills.length,
        totalAmount: bills.reduce((sum, b) => sum + (b.totalAmount || 0), 0),
        draft: bills.filter(b => b.status === "draft").length,
        draftAmount: bills.filter(b => b.status === "draft").reduce((sum, b) => sum + (b.totalAmount || 0), 0),
        verified: bills.filter(b => b.status === "verified").length,
        verifiedAmount: bills.filter(b => b.status === "verified").reduce((sum, b) => sum + (b.totalAmount || 0), 0),
        approved: bills.filter(b => b.status === "approved").length,
        approvedAmount: bills.filter(b => b.status === "approved").reduce((sum, b) => sum + (b.totalAmount || 0), 0),
        paid: bills.filter(b => b.status === "paid").length,
        paidAmount: bills.filter(b => b.status === "paid").reduce((sum, b) => sum + (b.totalAmount || 0), 0),
        gstByCategory,
        totalGst,
        gstSplit: { cgst: gstSplit.cgst, sgst: gstSplit.sgst, igst: gstSplit.igst },
        interStateBills: bills.filter(b => b.isInterState).length,
      };
      res.json(summary);
    } catch (err) {
      console.error("Error fetching vendor bills summary:", err);
      res.status(500).json({ message: "Failed to fetch vendor bills summary" });
    }
  });

  // Multi-day CSV/Excel export of GST Register / Vendor Ledger.
  // Mirrors task #193's daily-reports-export shape: a Summary cover (range,
  // vendor scope, totals, per-category breakdown, per-vendor breakdown when
  // exporting all vendors) followed by a per-bill Detail listing.
  // Filters (dateFrom/dateTo/vendor/status/category) are applied here so the
  // download mirrors what the user sees on screen.
  app.get("/api/vendor-bills/export", async (req, res) => {
    try {
      const dateFrom = (req.query.dateFrom as string) || undefined;
      const dateTo = (req.query.dateTo as string) || undefined;
      const vendor = (req.query.vendor as string) || undefined;
      const status = (req.query.status as string) || undefined;
      const categoryFilter = ((req.query.category as string) || "all").toLowerCase();
      const format = (String(req.query.format || "xlsx").toLowerCase() === "csv") ? "csv" : "xlsx";

      const billsRaw = await storage.getVendorBills({ dateFrom, dateTo, vendor, status });
      // Apply category filter the same way the UI does (combined => "all" billType).
      const bills = categoryFilter === "all"
        ? billsRaw
        : billsRaw.filter(b => {
            const target = categoryFilter === "combined" ? "all" : categoryFilter;
            return (b.billType || "").toLowerCase() === target;
          });
      // Sort newest first for both summary and detail.
      bills.sort((a, b) => (b.billDate || "").localeCompare(a.billDate || ""));

      const allVendorNames = await storage.getVendorNames();

      const vendorScope = vendor && vendor !== "all" ? vendor : "All vendors";
      const isLedger = vendor && vendor !== "all";
      const reportLabel = isLedger ? `Vendor Ledger — ${vendorScope}` : "GST Register — Category Breakdown";

      const sortedDates = bills.map(b => b.billDate).filter(Boolean).sort();
      const fromD = dateFrom || sortedDates[0] || "";
      const toD = dateTo || sortedDates[sortedDates.length - 1] || "";
      const rangeLabel = !fromD && !toD ? "all dates"
        : fromD === toD ? fromD
        : `${fromD || "…"} → ${toD || "…"}`;
      const generatedAt = new Date().toISOString().slice(0, 19).replace("T", " ") + " UTC";
      const filenameRange = fromD && toD
        ? (fromD === toD ? fromD : `${fromD}_to_${toD}`)
        : "all-dates";
      const filenameScope = isLedger ? `vendor-ledger-${vendorScope}` : "gst-register";
      const safeFilename = `${filenameScope}-${filenameRange}`.replace(/[^A-Za-z0-9._-]+/g, "_");

      // Per-bill numbers. The vendor_bills.isInterState flag (per bill) drives
      // the CGST/SGST/IGST split: inter-state bills route their entire GST to
      // IGST; intra-state bills split it as CGST = SGST = GST/2. This matches
      // computeBillCgstSgstIgst in shared/vendor-bill-gst.ts and the on-screen
      // GST register cards.
      type BillRow = {
        billNo: string; date: string; vendor: string; category: string;
        taxable: number; gst: number; cgst: number; sgst: number; igst: number; total: number;
      };
      const detailRows: BillRow[] = bills.map(b => {
        const taxable = b.totalAmount || 0;
        const cat = computeBillGstByCategory(b);
        const gst = cat.equipment + cat.material + cat.transport + cat.labour + cat.other;
        const split = computeBillCgstSgstIgst(b);
        return {
          billNo: b.billNo,
          date: b.billDate,
          vendor: b.vendorName,
          category: (b.billType || "other").toLowerCase(),
          taxable,
          gst,
          cgst: split.cgst,
          sgst: split.sgst,
          igst: split.igst,
          total: taxable + gst,
        };
      });

      const totals = aggregateGstBreakdown(bills);
      const splitTotals = aggregateGstSplit(bills);
      const totalTaxable = bills.reduce((s, b) => s + (b.totalAmount || 0), 0);
      const grandTotal = totalTaxable + totals.total;
      const interStateBillCount = bills.filter(b => b.isInterState).length;
      const splitNote = interStateBillCount === 0
        ? `GST split: intra-state (CGST = SGST = GST/2, IGST = 0). No inter-state bills in range.`
        : interStateBillCount === bills.length
        ? `GST split: inter-state (entire GST routed to IGST). All ${bills.length} bills marked inter-state.`
        : `GST split: per-bill — ${interStateBillCount} of ${bills.length} bill${bills.length === 1 ? "" : "s"} marked inter-state (IGST); the rest split as CGST = SGST = GST/2.`;

      // Category summary — always show the 4 main categories so empty buckets
      // appear as "—" rows instead of being silently dropped. "Other" is only
      // listed if it has a non-zero contribution.
      const baseCategories: GstCategory[] = ["equipment", "material", "transport", "labour"];
      const categoryList: GstCategory[] = totals.other > 0
        ? [...baseCategories, "other" as GstCategory]
        : baseCategories;
      type CatRow = { category: string; bills: number | string; taxable: number | string; gst: number | string };
      const categoryRows: CatRow[] = categoryList.map(cat => {
        const billsInCat = bills.filter(b => {
          const bt = (b.billType || "other").toLowerCase();
          if (bt === "all") {
            // Combined bill — count if it has any line item in this category.
            return (b.items || []).some(it => ((it.category || "other").toLowerCase()) === cat);
          }
          return bt === cat;
        });
        const taxable = billsInCat.reduce((s, b) => {
          const bt = (b.billType || "other").toLowerCase();
          if (bt === "all") {
            return s + (b.items || [])
              .filter(it => ((it.category || "other").toLowerCase()) === cat)
              .reduce((ss, it) => ss + (it.amount || 0), 0);
          }
          return s + (b.totalAmount || 0);
        }, 0);
        const gstAmt = totals[cat] || 0;
        const isEmpty = billsInCat.length === 0 && gstAmt === 0;
        return {
          category: cat.toUpperCase(),
          bills: isEmpty ? "—" : billsInCat.length,
          taxable: isEmpty ? "—" : taxable,
          gst: isEmpty ? "—" : gstAmt,
        };
      });

      // Vendor summary — only when exporting the full GST register. Include
      // every known vendor so vendors with no bills in range show as "—".
      type VendorRow = { vendor: string; bills: number | string; taxable: number | string; gst: number | string };
      let vendorRows: VendorRow[] = [];
      if (!isLedger) {
        const byVendor = new Map<string, typeof bills>();
        for (const b of bills) {
          const k = b.vendorName.toUpperCase();
          if (!byVendor.has(k)) byVendor.set(k, []);
          byVendor.get(k)!.push(b);
        }
        const vendorSet = new Set<string>([
          ...allVendorNames.map(v => v.toUpperCase()),
          ...Array.from(byVendor.keys()),
        ]);
        vendorRows = Array.from(vendorSet).sort().map(v => {
          const list = byVendor.get(v) || [];
          if (list.length === 0) {
            return { vendor: v, bills: "—", taxable: "—", gst: "—" };
          }
          const tx = list.reduce((s, b) => s + (b.totalAmount || 0), 0);
          const { total: g } = aggregateGstBreakdown(list);
          return { vendor: v, bills: list.length, taxable: tx, gst: g };
        });
      }

      const fmtNum = (n: number) => n.toFixed(2);
      const fmtCell = (v: number | string) => (typeof v === "number" ? fmtNum(v) : v);

      if (format === "csv") {
        const escape = (v: any) => {
          const s = v == null ? "" : String(v);
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const toLine = (cells: any[]) => cells.map(escape).join(",");
        const lines: string[] = [];
        lines.push(toLine([`${reportLabel} — Cover Sheet`]));
        lines.push(toLine(["High Lane Constructions Pvt Ltd"]));
        lines.push(toLine([`Range: ${rangeLabel}`]));
        lines.push(toLine([`Vendor: ${vendorScope}`]));
        lines.push(toLine([`Status filter: ${status && status !== "all" ? status : "all"}`]));
        lines.push(toLine([`Category filter: ${categoryFilter !== "all" ? categoryFilter : "all"}`]));
        lines.push(toLine([`Bills in range: ${bills.length}`]));
        lines.push(toLine([`Totals: Taxable ${fmtNum(totalTaxable)} + GST ${fmtNum(totals.total)} = ${fmtNum(grandTotal)}`]));
        lines.push(toLine([splitNote]));
        lines.push(toLine([`Generated: ${generatedAt}`]));
        lines.push("");
        lines.push(toLine(["== SUMMARY — GST BY CATEGORY =="]));
        lines.push(toLine(["Category", "Bills", "Taxable", "GST"]));
        for (const r of categoryRows) {
          lines.push(toLine([r.category, r.bills, fmtCell(r.taxable), fmtCell(r.gst)]));
        }
        lines.push(toLine(["TOTAL", bills.length, fmtNum(totalTaxable), fmtNum(totals.total)]));
        if (!isLedger) {
          lines.push("");
          lines.push(toLine(["== SUMMARY — BY VENDOR =="]));
          lines.push(toLine(["Vendor", "Bills", "Taxable", "GST"]));
          for (const r of vendorRows) {
            lines.push(toLine([r.vendor, r.bills, fmtCell(r.taxable), fmtCell(r.gst)]));
          }
          lines.push(toLine(["TOTAL", bills.length, fmtNum(totalTaxable), fmtNum(totals.total)]));
        }
        lines.push("");
        lines.push(toLine(["== DETAIL (every bill in range) =="]));
        lines.push(toLine(["Bill No", "Date", "Vendor", "Category", "Taxable", "CGST", "SGST", "IGST", "Total"]));
        if (detailRows.length === 0) {
          lines.push(toLine(["—", "—", "—", "—", "—", "—", "—", "—", "—"]));
        } else {
          for (const r of detailRows) {
            lines.push(toLine([r.billNo, r.date, r.vendor, r.category, fmtNum(r.taxable), fmtNum(r.cgst), fmtNum(r.sgst), fmtNum(r.igst), fmtNum(r.total)]));
          }
          lines.push(toLine(["TOTAL", "", "", "", fmtNum(totalTaxable), fmtNum(splitTotals.cgst), fmtNum(splitTotals.sgst), fmtNum(splitTotals.igst), fmtNum(grandTotal)]));
        }
        const body = "\uFEFF" + lines.join("\r\n") + "\r\n";
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}.csv"`);
        res.send(body);
        return;
      }

      // xlsx — Summary sheet (cover + category + vendor) and Detail sheet.
      const wb = xlsx.utils.book_new();
      const summaryAoa: any[][] = [
        [`${reportLabel} — Cover Sheet`],
        ["High Lane Constructions Pvt Ltd"],
        [`Range: ${rangeLabel}`],
        [`Vendor: ${vendorScope}`],
        [`Status filter: ${status && status !== "all" ? status : "all"}`],
        [`Category filter: ${categoryFilter !== "all" ? categoryFilter : "all"}`],
        [`Bills in range: ${bills.length}`],
        [`Totals: Taxable ${fmtNum(totalTaxable)} + GST ${fmtNum(totals.total)} = ${fmtNum(grandTotal)}`],
        [splitNote],
        [`Generated: ${generatedAt}`],
        [],
        ["GST by Category"],
        ["Category", "Bills", "Taxable", "GST"],
        ...categoryRows.map(r => [r.category, r.bills, fmtCell(r.taxable), fmtCell(r.gst)]),
        ["TOTAL", bills.length, fmtNum(totalTaxable), fmtNum(totals.total)],
      ];
      if (!isLedger) {
        summaryAoa.push([]);
        summaryAoa.push(["By Vendor"]);
        summaryAoa.push(["Vendor", "Bills", "Taxable", "GST"]);
        for (const r of vendorRows) {
          summaryAoa.push([r.vendor, r.bills, fmtCell(r.taxable), fmtCell(r.gst)]);
        }
        summaryAoa.push(["TOTAL", bills.length, fmtNum(totalTaxable), fmtNum(totals.total)]);
      }
      const summarySheet = xlsx.utils.aoa_to_sheet(summaryAoa);
      (summarySheet as any)["!cols"] = [
        { wch: 32 }, { wch: 10 }, { wch: 16 }, { wch: 16 },
      ];
      xlsx.utils.book_append_sheet(wb, summarySheet, "Summary");

      const detailAoa: any[][] = [
        ["Bill No", "Date", "Vendor", "Category", "Taxable", "CGST", "SGST", "IGST", "Total"],
      ];
      if (detailRows.length === 0) {
        detailAoa.push(["—", "—", "—", "—", "—", "—", "—", "—", "—"]);
      } else {
        for (const r of detailRows) {
          detailAoa.push([r.billNo, r.date, r.vendor, r.category, fmtNum(r.taxable), fmtNum(r.cgst), fmtNum(r.sgst), fmtNum(r.igst), fmtNum(r.total)]);
        }
        detailAoa.push(["TOTAL", "", "", "", fmtNum(totalTaxable), fmtNum(splitTotals.cgst), fmtNum(splitTotals.sgst), fmtNum(splitTotals.igst), fmtNum(grandTotal)]);
      }
      const detailSheet = xlsx.utils.aoa_to_sheet(detailAoa);
      (detailSheet as any)["!cols"] = [
        { wch: 18 }, { wch: 12 }, { wch: 28 }, { wch: 12 },
        { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
      ];
      xlsx.utils.book_append_sheet(wb, detailSheet, "Detail");

      const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}.xlsx"`);
      res.send(buf);
    } catch (err: any) {
      console.error("Error exporting vendor bills:", err);
      res.status(500).json({ message: err?.message || "Failed to export vendor bills" });
    }
  });

  app.get("/api/vendor-aliases", async (req, res) => {
    try {
      const aliases = await storage.getVendorAliases();
      res.json(aliases);
    } catch (err) {
      console.error("Error fetching vendor aliases:", err);
      res.status(500).json({ message: "Failed to fetch vendor aliases" });
    }
  });

  app.post("/api/vendor-aliases", async (req, res) => {
    try {
      const { canonicalName, alias } = req.body;
      if (!canonicalName || !alias) {
        return res.status(400).json({ message: "canonicalName and alias are required" });
      }
      if (canonicalName.trim().toUpperCase() === alias.trim().toUpperCase()) {
        return res.status(400).json({ message: "Alias cannot be the same as the canonical name" });
      }
      const result = await storage.addVendorAlias(canonicalName, alias);
      res.status(201).json(result);
    } catch (err: any) {
      if (err?.code === "23505") {
        return res.status(409).json({ message: "This alias already exists" });
      }
      console.error("Error adding vendor alias:", err);
      res.status(500).json({ message: "Failed to add vendor alias" });
    }
  });

  app.delete("/api/vendor-aliases/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const deleted = await storage.deleteVendorAlias(id);
      if (!deleted) {
        return res.status(404).json({ message: "Alias not found" });
      }
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting vendor alias:", err);
      res.status(500).json({ message: "Failed to delete vendor alias" });
    }
  });

  app.get("/api/vendor-bills/vendor-names", async (req, res) => {
    try {
      const names = await storage.getVendorNames();
      res.json(names);
    } catch (err) {
      console.error("Error fetching vendor names:", err);
      res.status(500).json({ message: "Failed to fetch vendor names" });
    }
  });

  app.get("/api/vendor-bills/discover-vendors", async (req, res) => {
    try {
      const billType = req.query.billType as string;
      const periodFrom = req.query.periodFrom as string;
      const periodTo = req.query.periodTo as string;
      if (!billType || !periodFrom || !periodTo) {
        return res.status(400).json({ message: "billType, periodFrom, and periodTo are required" });
      }
      const vendors = await storage.discoverVendors(billType, periodFrom, periodTo);
      res.json(vendors);
    } catch (err) {
      console.error("Error discovering vendors:", err);
      res.status(500).json({ message: "Failed to discover vendors" });
    }
  });

  app.get("/api/vendor-bills/auto-items", async (req, res) => {
    try {
      const vendorName = req.query.vendorName as string;
      const billType = req.query.billType as string;
      const periodFrom = req.query.periodFrom as string;
      const periodTo = req.query.periodTo as string;
      const entryTypeFilter = (req.query.entryTypeFilter as string) || null;
      if (!vendorName || !billType || !periodFrom || !periodTo) {
        return res.status(400).json({ message: "vendorName, billType, periodFrom, and periodTo are required" });
      }
      const items = await storage.getVendorBillAutoItems(vendorName, billType, periodFrom, periodTo, entryTypeFilter);
      res.json(items);
    } catch (err) {
      console.error("Error fetching vendor bill auto items:", err);
      res.status(500).json({ message: "Failed to fetch auto items" });
    }
  });

  app.get("/api/vendor-bills/previous-rates", async (req, res) => {
    try {
      const vendorName = req.query.vendorName as string;
      if (!vendorName) {
        return res.status(400).json({ message: "vendorName is required" });
      }
      const bills = await storage.getVendorBills();
      const vendorBills = bills
        .filter(b => b.vendorName.toUpperCase().trim() === vendorName.toUpperCase().trim() && b.items && b.items.length > 0)
        .sort((a, b) => new Date(b.billDate).getTime() - new Date(a.billDate).getTime());
      
      const rateMap: Record<string, { rate: number; leadDistance?: number }> = {};
      for (const bill of vendorBills) {
        for (const item of (bill.items || [])) {
          if (item.rate && item.rate > 0 && item.equipmentId) {
            const etMatch = (item.description || "").match(/(HOURLY HIRE|DAILY HIRE|TRIP BASED|MONTHLY HIRE|TIME\/METER|MOBILIZATION)/);
            const rawLabel = etMatch?.[1] || "OTHER";
            const normalizedLabel = rawLabel.replace(/\s+/g, "_").replace("/", "_");
            const key = `${item.equipmentId}_${normalizedLabel}`;
            if (!rateMap[key]) {
              rateMap[key] = { rate: item.rate, leadDistance: item.leadDistance || undefined };
            }
          }
        }
      }
      res.json(rateMap);
    } catch (err) {
      console.error("Error fetching previous rates:", err);
      res.status(500).json({ message: "Failed to fetch previous rates" });
    }
  });

  app.get("/api/vendor-bills/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const bill = await storage.getVendorBill(id);
      if (!bill) {
        return res.status(404).json({ message: "Vendor bill not found" });
      }
      res.json(bill);
    } catch (err) {
      console.error("Error fetching vendor bill:", err);
      res.status(500).json({ message: "Failed to fetch vendor bill" });
    }
  });

  app.post("/api/vendor-bills", async (req, res) => {
    try {
      const input = createVendorBillRequestSchema.parse(req.body);
      const bill = await storage.createVendorBill(input);
      sendPushToAll("New Vendor Bill", `${bill.billNo} - ${bill.vendorName}`, "/plant/vendor-bills").catch(() => {});
      res.status(201).json(bill);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error creating vendor bill:", err);
      res.status(500).json({ message: "Failed to create vendor bill" });
    }
  });

  app.put("/api/vendor-bills/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { pin: _pin, ...billData } = req.body;
      const input = createVendorBillRequestSchema.parse(billData);

      const existing = await storage.getVendorBill(id);
      if (!existing) {
        return res.status(404).json({ message: "Vendor bill not found" });
      }

      if (!(await assertWritable(res, "vendor_bill", id))) return;

      if (existing.status === "verified" || existing.status === "approved" || existing.status === "paid") {
        if (!assertAdmin(req, res)) return;
        input.status = "draft";
      } else {
        if (!assertEdit(req, res, "vendor_bills")) return;
      }

      const bill = await storage.updateVendorBill(id, input);
      if (!bill) {
        return res.status(404).json({ message: "Vendor bill not found" });
      }

      try { await relockResource("vendor_bill", id, req.authUser!.id); } catch {}
      res.json(bill);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error updating vendor bill:", err);
      res.status(500).json({ message: "Failed to update vendor bill" });
    }
  });

  app.patch("/api/vendor-bills/:id/status", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const statusSchema = z.object({
        status: z.enum(["draft", "verified", "approved", "paid"]),
      });
      const { status } = statusSchema.parse(req.body);

      if (status === "approved") {
        if (!assertAdmin(req, res)) return;
      } else if (status === "verified" || status === "paid") {
        if (!assertEdit(req, res, "vendor_bills")) return;
      } else {
        if (!assertEdit(req, res, "vendor_bills")) return;
      }
      const actor = currentUserName(req);

      const bill = await storage.updateVendorBillStatus(id, status, actor);
      if (!bill) {
        return res.status(404).json({ message: "Vendor bill not found" });
      }
      sendPushToAll("Vendor Bill Updated", `${bill.billNo} - ${status.toUpperCase()} by ${actor}`, "/plant/vendor-bills").catch(() => {});
      res.json(bill);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error updating vendor bill status:", err);
      res.status(500).json({ message: "Failed to update vendor bill status" });
    }
  });

  app.get("/api/vendor-bills/:id/pdf", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const bill = await storage.getVendorBill(id);
      if (!bill) {
        return res.status(404).json({ message: "Vendor bill not found" });
      }
      if (!["verified", "approved", "paid"].includes(bill.status)) {
        return res.status(400).json({ message: "PDF export is only available for verified, approved, or paid bills" });
      }

      const getBillTypeLabel = (type: string) => {
        const map: Record<string, string> = { equipment: "EQUIPMENT HIRE", material: "MATERIAL SUPPLY", transport: "TRANSPORT", labour: "LABOUR", all: "ALL", other: "OTHER / MISCELLANEOUS" };
        return map[type.toLowerCase()] || type.toUpperCase();
      };
      const getCategoryLabel = (cat: string) => {
        const map: Record<string, string> = { equipment: "EQUIP", material: "MATL", transport: "TRNS", labour: "LABOUR" };
        return map[cat] || "OTHER";
      };
      const fmtDate = (dateStr: string | null | undefined) => {
        if (!dateStr) return "-";
        try {
          const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
          const d = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : ""));
          if (Number.isNaN(d.getTime())) return dateStr;
          return `${String(d.getDate()).padStart(2, "0")}-${months[d.getMonth()]}-${d.getFullYear()}`;
        } catch { return dateStr; }
      };
      const fmtCurrency = (amt: number | null | undefined) => {
        if (amt == null) return "0.00";
        return Number(amt).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      };
      const fmtQty = (qty: number | null | undefined) => {
        if (qty == null) return "0.00";
        return Number(qty).toFixed(2);
      };

      const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => {
        const pdfBuffer = Buffer.concat(chunks);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="VendorBill-${bill.billNo}.pdf"`);
        res.send(pdfBuffer);
      });

      const pageW = 515;
      const amber = "#d97706";
      const tableX = 40;

      try {
        const logoPath = path.join(process.cwd(), "client", "public", "hlc-logo.jpg");
        if (fs.existsSync(logoPath)) {
          const logoWidth = 60;
          const logoX = (pageW - logoWidth) / 2 + tableX;
          const logoY = doc.y;
          doc.image(logoPath, logoX, logoY, { width: logoWidth });
          doc.y = logoY + 65;
        }
      } catch {}
      doc.fontSize(18).font("Helvetica-Bold").fillColor("#000").text("HIGH LANE CONSTRUCTIONS", { align: "center" });
      doc.moveDown(0.2);
      doc.fontSize(11).font("Helvetica").fillColor("#333").text("VENDOR BILL", { align: "center" });
      doc.moveDown(0.5);

      doc.moveTo(40, doc.y).lineTo(40 + pageW, doc.y).strokeColor(amber).lineWidth(2).stroke();
      doc.moveDown(0.5);

      const metaY = doc.y;
      doc.fillColor("#000").fontSize(11).font("Helvetica-Bold");
      doc.text(`Bill No: ${bill.billNo}`, 40, metaY);
      doc.text(`Date: ${fmtDate(bill.billDate)}`, 300, metaY);
      doc.moveDown(0.3);
      doc.text(`Vendor: ${bill.vendorName}`, 40);
      const statusY = doc.y;
      doc.text(`Status: ${bill.status.toUpperCase()}`, 300, statusY - 14);
      doc.moveDown(0.2);
      doc.font("Helvetica").fontSize(10).fillColor("#000");
      doc.text(`Bill Type: ${getBillTypeLabel(bill.billType)}`, 40);
      if (bill.periodFrom && bill.periodTo) {
        doc.text(`Period: ${fmtDate(bill.periodFrom)} to ${fmtDate(bill.periodTo)}`, 300, doc.y - 14);
      }
      doc.moveDown(0.8);

      const hasLeadDist = bill.items.some((it: any) => it.leadDistance && it.leadDistance > 0);
      const colWidths = hasLeadDist
        ? [20, 52, 30, 160, 35, 28, 55, 55, 80]
        : [22, 58, 35, 195, 40, 30, 55, 80];
      const headers = hasLeadDist
        ? ["#", "Date", "Type", "Description", "Qty", "Unit", "Lead KM", "Rate (Rs.)", "Amount (Rs.)"]
        : ["#", "Date", "Type", "Description", "Qty", "Unit", "Rate (Rs.)", "Amount (Rs.)"];
      const rateColIdx = hasLeadDist ? 7 : 6;
      const descColIdx = 3;
      let y = doc.y;

      doc.fillColor("#fff").rect(tableX, y, pageW, 20).fill(amber);
      doc.fillColor("#fff").fontSize(9).font("Helvetica-Bold");
      let cx = tableX;
      headers.forEach((h, i) => {
        const align = i >= rateColIdx ? "right" : "left";
        doc.text(h, cx + 4, y + 5, { width: colWidths[i] - 8, align, lineBreak: false });
        cx += colWidths[i];
      });
      y += 20;

      const inferSiteName = (desc: string, existing: string | null) => {
        if (existing) return existing;
        if (!desc) return "";
        const d = desc.toUpperCase();
        if (d.includes("(SITE-UNLINKED)")) return "SITE*";
        if (d.includes("(SITE TRIP)")) return "SITE: TRIP";
        if (d.includes("(PLANT)")) return "PLANT";
        if (d.includes("(SITE)")) return "SITE";
        return "";
      };

      const renderPdfItemRow = (item: any, idx: number) => {
        const desc = item.description || "";
        const siteLabel = inferSiteName(desc, item.siteName || null);
        const descHeight = doc.heightOfString(desc, { width: colWidths[descColIdx] - 8, fontSize: 9 });
        const siteHeight = siteLabel ? doc.heightOfString(siteLabel, { width: colWidths[descColIdx] - 8, fontSize: 7 }) + 2 : 0;
        const rowH = Math.max(18, descHeight + siteHeight + 8);

        if (y + rowH > 720) {
          doc.addPage();
          y = 40;
        }
        const bgColor = idx % 2 === 0 ? "#fff" : "#f5f5f5";
        doc.fillColor(bgColor).rect(tableX, y, pageW, rowH).fill();

        const rowData = hasLeadDist
          ? [
              String(idx + 1), fmtDate(item.date),
              item.category ? getCategoryLabel(item.category) : "-", desc,
              fmtQty(item.qty), item.unit || "",
              item.leadDistance ? `${fmtQty(item.leadDistance)} (${fmtQty(item.leadDistance * 2)})` : "-",
              fmtCurrency(item.rate), fmtCurrency(item.amount),
            ]
          : [
              String(idx + 1), fmtDate(item.date),
              item.category ? getCategoryLabel(item.category) : "-", desc,
              fmtQty(item.qty), item.unit || "",
              fmtCurrency(item.rate), fmtCurrency(item.amount),
            ];
        doc.fillColor("#000").fontSize(9);
        cx = tableX;
        rowData.forEach((cell, i) => {
          const align = i >= rateColIdx ? "right" : "left";
          const w = colWidths[i] - 8;
          if (i === descColIdx) {
            doc.text(cell, cx + 4, y + 4, { width: w, align, lineBreak: true });
            if (siteLabel) {
              doc.fillColor("#666").fontSize(7).font("Helvetica-Oblique");
              doc.text(siteLabel, cx + 4, y + 4 + descHeight + 1, { width: w, align: "left", lineBreak: false });
              doc.fillColor("#000").fontSize(9).font("Helvetica");
            }
          } else {
            doc.text(cell, cx + 4, y + 4, { width: w, align, lineBreak: false });
          }
          cx += colWidths[i];
        });
        y += rowH;
      };

      const pdfCategories = ["equipment", "material", "transport", "labour", "other"];
      const pdfCatLabels: Record<string, string> = { equipment: "EQUIPMENT", material: "MATERIAL", transport: "TRANSPORT", labour: "LABOUR", other: "OTHER" };
      const catAmounts: Record<string, number> = {};
      bill.items.forEach((item: any) => {
        const cat = item.category || "other";
        catAmounts[cat] = (catAmounts[cat] || 0) + (item.amount || 0);
      });
      const distinctCats = Object.keys(catAmounts).filter(c => catAmounts[c] !== 0);
      const shouldGroupPdf = distinctCats.length > 1;

      doc.fillColor("#000").font("Helvetica").fontSize(9);
      if (shouldGroupPdf) {
        for (const cat of pdfCategories) {
          const catItems = bill.items.filter((it: any) => (it.category || "other") === cat);
          if (catItems.length === 0) continue;
          const catTotal = catItems.reduce((s: number, it: any) => s + (it.amount || 0), 0);

          if (y + 20 > 720) { doc.addPage(); y = 40; }
          doc.fillColor("#f0f0f0").rect(tableX, y, pageW, 20).fill();
          doc.fillColor("#000").fontSize(10).font("Helvetica-Bold");
          doc.text(`${pdfCatLabels[cat]} (${catItems.length} items)`, tableX + 8, y + 5, { width: pageW - 16 });
          y += 20;
          doc.font("Helvetica").fontSize(9);

          catItems.forEach((item: any) => {
            const origIdx = bill.items.indexOf(item);
            renderPdfItemRow(item, origIdx);
          });

          if (y + 20 > 720) { doc.addPage(); y = 40; }
          doc.fillColor("#f5f5f5").rect(tableX, y, pageW, 20).fill();
          doc.fillColor("#000").fontSize(9).font("Helvetica-Bold");
          const amtW = colWidths[colWidths.length - 1];
          doc.text(`${pdfCatLabels[cat]} Sub-total`, tableX + 4, y + 5, { width: pageW - amtW - 8, align: "right" });
          doc.text(`Rs. ${fmtCurrency(catTotal)}`, tableX + pageW - amtW + 4, y + 5, { width: amtW - 8, align: "right" });
          y += 20;

          const catGstRate = cat === "equipment" ? (bill as any).gstRateEquipment : cat === "material" ? (bill as any).gstRateMaterial : cat === "transport" ? (bill as any).gstRateTransport : cat === "labour" ? (bill as any).gstRateLabour : 0;
          if (catGstRate > 0) {
            const catGstAmt = catTotal * catGstRate / 100;
            if (y + 20 > 720) { doc.addPage(); y = 40; }
            doc.fillColor("#f0fff0").rect(tableX, y, pageW, 20).fill();
            doc.fillColor("#15803d").fontSize(9).font("Helvetica-Bold");
            doc.text(`GST ON ${pdfCatLabels[cat]} @ ${catGstRate}%`, tableX + 4, y + 5, { width: pageW - amtW - 8, align: "right" });
            doc.text(`+ Rs. ${fmtCurrency(catGstAmt)}`, tableX + pageW - amtW + 4, y + 5, { width: amtW - 8, align: "right" });
            y += 20;
          }

          doc.font("Helvetica").fontSize(9);
        }
      } else {
        bill.items.forEach((item: any, idx: number) => {
          renderPdfItemRow(item, idx);
        });
      }

      doc.strokeColor("#999").lineWidth(0.5);
      doc.moveTo(tableX, y).lineTo(tableX + pageW, y).stroke();

      const totalQty = bill.items.reduce((s: number, it: any) => s + (it.qty || 0), 0);
      const totalItems = bill.items.length;

      const summaryH = 22;
      if (y + summaryH * 2 > 720) { doc.addPage(); y = 40; }

      doc.fillColor("#f5f5f5").rect(tableX, y, pageW, summaryH).fill();
      doc.fillColor("#000").fontSize(10).font("Helvetica-Bold");
      doc.text(`TOTAL ITEMS: ${totalItems}`, tableX + 4, y + 6, { width: 200 });
      doc.text(`TOTAL QTY: ${fmtQty(totalQty)}`, tableX + 200, y + 6, { width: 150 });
      y += summaryH;

      const amtColW = colWidths[colWidths.length - 1];
      doc.fillColor(amber).rect(tableX, y, pageW, summaryH).fill();
      doc.fillColor("#fff").fontSize(11).font("Helvetica-Bold");
      doc.text("TOTAL AMOUNT", tableX + 4, y + 5, { width: pageW - amtColW - 8, align: "right" });
      doc.text(`Rs. ${fmtCurrency(bill.totalAmount)}`, tableX + pageW - amtColW + 4, y + 5, { width: amtColW - 8, align: "right" });
      y += summaryH;

      {
        const pdfCatAmts: Record<string, number> = {};
        bill.items.forEach((it: any) => { const c = it.category || "other"; pdfCatAmts[c] = (pdfCatAmts[c] || 0) + (it.amount || 0); });
        const pGstEq = (bill as any).gstRateEquipment ? (pdfCatAmts["equipment"] || 0) * (bill as any).gstRateEquipment / 100 : 0;
        const pGstMat = (bill as any).gstRateMaterial ? (pdfCatAmts["material"] || 0) * (bill as any).gstRateMaterial / 100 : 0;
        const pGstTr = (bill as any).gstRateTransport ? (pdfCatAmts["transport"] || 0) * (bill as any).gstRateTransport / 100 : 0;
        const pGstLab = (bill as any).gstRateLabour ? (pdfCatAmts["labour"] || 0) * (bill as any).gstRateLabour / 100 : 0;
        const pdfIsAllType = bill.billType?.toLowerCase() === "all";
        const pdfUsePerGroupGst = pdfIsAllType || shouldGroupPdf;
        const pSingleGstRate = !pdfUsePerGroupGst
          ? (bill.billType?.toLowerCase() === "equipment" ? (bill as any).gstRateEquipment
            : bill.billType?.toLowerCase() === "material" ? (bill as any).gstRateMaterial
            : bill.billType?.toLowerCase() === "transport" ? (bill as any).gstRateTransport
            : bill.billType?.toLowerCase() === "labour" ? (bill as any).gstRateLabour : 0) || 0
          : 0;
        const pSingleGstAmt = pSingleGstRate ? (bill.totalAmount || 0) * pSingleGstRate / 100 : 0;
        const pTotalGst = pdfUsePerGroupGst ? pGstEq + pGstMat + pGstTr + pGstLab : pSingleGstAmt;
        const adjustmentAmount = (bill as any).adjustmentAmount || 0;
        const adjustmentLabel = (bill as any).adjustmentLabel || "ADVANCE DEDUCTION";
        const pTdsRate = (bill as any).tdsRate || 0;
        const pTdsAmt = pTdsRate ? (bill.totalAmount || 0) * pTdsRate / 100 : 0;
        const pHasAny = pTotalGst !== 0 || adjustmentAmount !== 0 || pTdsAmt !== 0;

        if (pHasAny) {
          if (!pdfUsePerGroupGst && pSingleGstRate > 0) {
            if (y + summaryH > 720) { doc.addPage(); y = 40; }
            doc.fillColor("#f0fff0").rect(tableX, y, pageW, summaryH).fill();
            doc.fillColor("#15803d").fontSize(10).font("Helvetica");
            doc.text(`GST @ ${pSingleGstRate}%`, tableX + 4, y + 6, { width: pageW - amtColW - 8, align: "right" });
            doc.font("Helvetica-Bold").text(`+ Rs. ${fmtCurrency(pSingleGstAmt)}`, tableX + pageW - amtColW + 4, y + 6, { width: amtColW - 8, align: "right" });
            y += summaryH;
          }
          if (pdfUsePerGroupGst && pTotalGst > 0) {
            if (y + summaryH > 720) { doc.addPage(); y = 40; }
            doc.fillColor("#f0fff0").rect(tableX, y, pageW, summaryH).fill();
            doc.fillColor("#15803d").fontSize(10).font("Helvetica-Bold");
            doc.text("TOTAL GST", tableX + 4, y + 6, { width: pageW - amtColW - 8, align: "right" });
            doc.text(`+ Rs. ${fmtCurrency(pTotalGst)}`, tableX + pageW - amtColW + 4, y + 6, { width: amtColW - 8, align: "right" });
            y += summaryH;
          }
          if (adjustmentAmount !== 0) {
            if (y + summaryH > 720) { doc.addPage(); y = 40; }
            doc.fillColor("#f0f0f0").rect(tableX, y, pageW, summaryH).fill();
            doc.fillColor("#000").fontSize(10).font("Helvetica");
            doc.text(adjustmentLabel, tableX + 4, y + 6, { width: pageW - amtColW - 8, align: "right" });
            doc.font("Helvetica-Bold").text(`Rs. ${fmtCurrency(adjustmentAmount)}`, tableX + pageW - amtColW + 4, y + 6, { width: amtColW - 8, align: "right" });
            y += summaryH;
          }
          if (pTdsAmt > 0) {
            if (y + summaryH > 720) { doc.addPage(); y = 40; }
            doc.fillColor("#fff5f5").rect(tableX, y, pageW, summaryH).fill();
            doc.fillColor("#dc2626").fontSize(10).font("Helvetica");
            doc.text(`IT TDS @ ${pTdsRate}%`, tableX + 4, y + 6, { width: pageW - amtColW - 8, align: "right" });
            doc.font("Helvetica-Bold").text(`- Rs. ${fmtCurrency(pTdsAmt)}`, tableX + pageW - amtColW + 4, y + 6, { width: amtColW - 8, align: "right" });
            y += summaryH;
          }

          const netTotal = (bill.totalAmount || 0) + pTotalGst + adjustmentAmount - pTdsAmt;
          if (y + summaryH > 720) { doc.addPage(); y = 40; }
          doc.fillColor("#1a1a1a").rect(tableX, y, pageW, summaryH).fill();
          doc.fillColor("#fff").fontSize(11).font("Helvetica-Bold");
          doc.text("NET TOTAL", tableX + 4, y + 5, { width: pageW - amtColW - 8, align: "right" });
          doc.text(`Rs. ${fmtCurrency(netTotal)}`, tableX + pageW - amtColW + 4, y + 5, { width: amtColW - 8, align: "right" });
          y += summaryH;
        }
      }

      if (bill.notes) {
        if (y + 40 > 720) { doc.addPage(); y = 40; }
        y += 10;
        doc.fillColor("#000").fontSize(10).font("Helvetica-Bold").text("Notes / Remarks:", 40, y);
        y += 14;
        doc.font("Helvetica").fontSize(10).text(bill.notes, 40, y, { width: pageW });
        y = doc.y + 10;
      }

      if (y + 120 > 720) { doc.addPage(); y = 40; }
      y += 40;

      doc.fillColor("#000").fontSize(10).font("Helvetica-Bold");
      doc.text("For HIGH LANE CONSTRUCTIONS", tableX + pageW - 200, y, { width: 200, align: "center" });
      doc.moveDown(3);
      const compSignY = doc.y;
      doc.moveTo(tableX + pageW - 200, compSignY).lineTo(tableX + pageW, compSignY).strokeColor("#000").lineWidth(0.5).stroke();
      doc.fontSize(9).font("Helvetica").fillColor("#000");
      doc.text("Authorized Signatory", tableX + pageW - 200, compSignY + 4, { width: 200, align: "center" });

      const vendorSignY = compSignY + 30;
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#000");
      doc.text("Vendor Acknowledgement", tableX, vendorSignY - 40, { width: 200, align: "center" });
      doc.moveDown(2.5);
      doc.moveTo(tableX, vendorSignY).lineTo(tableX + 200, vendorSignY).strokeColor("#000").lineWidth(0.5).stroke();
      doc.fontSize(9).font("Helvetica").fillColor("#000");
      doc.text(bill.vendorName, tableX, vendorSignY + 4, { width: 200, align: "center" });

      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.fillColor("#555").fontSize(8).font("Helvetica");
        doc.text(`Generated: ${new Date().toLocaleString("en-IN")}`, 40, 800, { width: pageW / 2, align: "left" });
        doc.text(`Page ${i + 1} of ${pages.count}`, 40 + pageW / 2, 800, { width: pageW / 2, align: "right" });
      }

      doc.end();
    } catch (err) {
      console.error("Error generating vendor bill PDF:", err);
      res.status(500).json({ message: "Failed to generate PDF" });
    }
  });

  app.delete("/api/vendor-bills/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);

      const bill = await storage.getVendorBill(id);
      if (!bill) {
        return res.status(404).json({ message: "Vendor bill not found" });
      }

      if (!assertAdmin(req, res)) return;

      const deleted = await storage.deleteVendorBill(id);
      if (!deleted) {
        return res.status(400).json({ message: "Bill cannot be deleted" });
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error("Error deleting vendor bill:", err);
      res.status(500).json({ message: err?.message || "Failed to delete vendor bill" });
    }
  });

  app.get("/api/equipment-master/canonical-types", async (req, res) => {
    try {
      const vendorName = (req.query.vendorName as string || "").trim();
      const allEquipment = await storage.getEquipmentMaster(false);
      let filtered = allEquipment.filter(e => e.ownership === "hired");
      if (vendorName) {
        const vendorVariants = await storage.resolveVendorAliases(vendorName);
        filtered = filtered.filter(e => vendorVariants.includes((e.vendorName || "").toUpperCase().trim()));
      }
      const typeSet = new Set<string>();
      for (const eq of filtered) {
        const canonical = canonicalizeMachineType(eq.name).toUpperCase().trim();
        if (canonical) typeSet.add(canonical);
      }
      res.json([...typeSet].sort());
    } catch (err) {
      console.error("Error fetching canonical equipment types:", err);
      res.status(500).json({ message: "Failed to fetch canonical types" });
    }
  });

  app.get("/api/vendor-rate-cards", async (req, res) => {
    try {
      const vendorName = req.query.vendorName as string | undefined;
      const cards = await storage.getVendorRateCards(vendorName || undefined);
      res.json(cards);
    } catch (err) {
      console.error("Error fetching vendor rate cards:", err);
      res.status(500).json({ message: "Failed to fetch rate cards" });
    }
  });

  app.get("/api/vendor-rate-cards/discover", async (req, res) => {
    try {
      const vendorName = (req.query.vendorName as string || "").trim();
      if (!vendorName) {
        return res.status(400).json({ message: "vendorName is required" });
      }
      const items = await storage.discoverVendorItems(vendorName);
      res.json(items);
    } catch (err) {
      console.error("Error discovering vendor items:", err);
      res.status(500).json({ message: "Failed to discover vendor items" });
    }
  });

  app.post("/api/vendor-rate-cards", async (req, res) => {
    try {
      const card = await storage.upsertVendorRateCard(req.body);
      res.status(201).json(card);
    } catch (err) {
      console.error("Error creating vendor rate card:", err);
      res.status(500).json({ message: "Failed to create rate card" });
    }
  });

  app.post("/api/vendor-rate-cards/bulk-upsert", async (req, res) => {
    try {
      const items = req.body.items as any[];
      const results = [];
      for (const item of items) {
        if (item.rate && item.rate > 0) {
          const card = await storage.upsertVendorRateCard(item);
          results.push(card);
        }
      }
      res.json({ upserted: results.length });
    } catch (err) {
      console.error("Error bulk upserting rate cards:", err);
      res.status(500).json({ message: "Failed to upsert rate cards" });
    }
  });

  app.delete("/api/vendor-rate-cards/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const deleted = await storage.deleteVendorRateCard(id);
      if (!deleted) return res.status(404).json({ message: "Rate card not found" });
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting vendor rate card:", err);
      res.status(500).json({ message: "Failed to delete rate card" });
    }
  });

  app.post("/api/vendor-bills/check-duplicates", async (req, res) => {
    try {
      const { vendorName, items, excludeBillId } = req.body;
      if (!vendorName || !items) return res.status(400).json({ message: "vendorName and items required" });
      const duplicates = await storage.checkDuplicateBilledItems(vendorName, items, excludeBillId ? Number(excludeBillId) : undefined);
      res.json(duplicates);
    } catch (err) {
      console.error("Error checking duplicate billed items:", err);
      res.status(500).json({ message: "Failed to check duplicates" });
    }
  });

  const EXPORTABLE_TABLES: Record<string, string> = {
    equipment_master: "Equipment Master",
    vendor_aliases: "Vendor Aliases",
    parties: "Parties",
    plant_materials: "Plant Materials",
    mix_templates: "Mix Templates & Components",
    equipment_usage: "Plant Equipment Usage",
    truck_dispatches: "Truck Dispatches",
    material_receipts: "Material Receipts",
    material_issues: "Material Issues",
    dprs: "DPRs (with all sub-tables)",
    stock_ledger: "Stock Ledger",
    stock_balances: "Stock Balances",
    vendor_bills: "Vendor Bills",
    purchase_indents: "Purchase Indents",
    diesel_requirements: "Diesel Requirements",
    sites: "Sites",
  };

  app.get("/api/admin/exportable-tables", async (_req, res) => {
    res.json(EXPORTABLE_TABLES);
  });

  app.post("/api/admin/export-data", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const { tables } = req.body;
      if (!tables || !Array.isArray(tables) || tables.length === 0) {
        return res.status(400).json({ message: "No tables selected" });
      }

      const exportData: Record<string, any> = { _exportedAt: new Date().toISOString(), _version: 1 };

      for (const table of tables) {
        const data = await storage.exportTable(table);
        if (data !== null) {
          exportData[table] = data;
        }
      }

      res.json(exportData);
    } catch (err) {
      console.error("Error exporting data:", err);
      res.status(500).json({ message: "Failed to export data" });
    }
  });

  app.post("/api/admin/reset-sequences", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      await storage.resetAllSequences();
      res.json({ success: true, message: "All sequences reset successfully" });
    } catch (err) {
      console.error("Error resetting sequences:", err);
      res.status(500).json({ message: "Failed to reset sequences" });
    }
  });

  app.post("/api/admin/import-data", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const { data } = req.body;
      if (!data || typeof data !== "object") {
        return res.status(400).json({ message: "Invalid import data" });
      }

      const results = await storage.importData(data);
      res.json(results);
    } catch (err) {
      console.error("Error importing data:", err);
      res.status(500).json({ message: "Failed to import data" });
    }
  });

  // ====== MIX ESTIMATES ======
  app.get("/api/mix-estimates", async (_req, res) => {
    try {
      const estimates = await storage.getMixEstimates();
      res.json(estimates);
    } catch (err) {
      console.error("Error fetching mix estimates:", err);
      res.status(500).json({ message: "Failed to fetch estimates" });
    }
  });

  app.get("/api/mix-estimates/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const estimate = await storage.getMixEstimate(id);
      if (!estimate) return res.status(404).json({ message: "Estimate not found" });
      res.json(estimate);
    } catch (err) {
      console.error("Error fetching mix estimate:", err);
      res.status(500).json({ message: "Failed to fetch estimate" });
    }
  });

  app.post("/api/mix-estimates", async (req, res) => {
    try {
      const { name, state, totalMt, totalAmt, contractorList, contractor } = req.body;
      if (!name || !state) return res.status(400).json({ message: "name and state required" });
      const estimate = await storage.createMixEstimate({ name, state, totalMt: totalMt || 0, totalAmt: totalAmt || 0, contractorList: contractorList || "", contractor: contractor || null });
      res.status(201).json(estimate);
    } catch (err) {
      console.error("Error creating mix estimate:", err);
      res.status(500).json({ message: "Failed to create estimate" });
    }
  });

  app.put("/api/mix-estimates/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, state, totalMt, totalAmt, contractorList, contractor } = req.body;
      if (!name || !state) return res.status(400).json({ message: "name and state required" });
      const estimate = await storage.updateMixEstimate(id, { name, state, totalMt: totalMt || 0, totalAmt: totalAmt || 0, contractorList: contractorList || "", contractor: contractor || null });
      if (!estimate) return res.status(404).json({ message: "Estimate not found" });
      res.json(estimate);
    } catch (err) {
      console.error("Error updating mix estimate:", err);
      res.status(500).json({ message: "Failed to update estimate" });
    }
  });

  app.delete("/api/mix-estimates/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteMixEstimate(id);
      if (!deleted) return res.status(404).json({ message: "Estimate not found" });
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting mix estimate:", err);
      res.status(500).json({ message: "Failed to delete estimate" });
    }
  });

  app.get("/api/price-scenarios", async (req, res) => {
    try {
      const estimateId = parseInt(req.query.estimateId as string);
      if (isNaN(estimateId)) return res.status(400).json({ message: "estimateId required" });
      const scenarios = await storage.getPriceScenarios(estimateId);
      res.json(scenarios);
    } catch (err) {
      console.error("Error fetching price scenarios:", err);
      res.status(500).json({ message: "Failed to fetch scenarios" });
    }
  });

  app.post("/api/price-scenarios", async (req, res) => {
    try {
      const { estimateId, name, revisedPrices, baseState } = req.body;
      if (!estimateId || !name) return res.status(400).json({ message: "estimateId and name required" });
      const rp = revisedPrices ? (typeof revisedPrices === "string" ? revisedPrices : JSON.stringify(revisedPrices)) : "{}";
      const bs = baseState ? (typeof baseState === "string" ? baseState : JSON.stringify(baseState)) : undefined;
      const scenario = await storage.createPriceScenario({ estimateId, name, revisedPrices: rp, ...(bs ? { baseState: bs } : {}) });
      res.status(201).json(scenario);
    } catch (err) {
      console.error("Error creating price scenario:", err);
      res.status(500).json({ message: "Failed to create scenario" });
    }
  });

  app.get("/api/price-scenarios/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const scenario = await storage.getPriceScenario(id);
      if (!scenario) return res.status(404).json({ message: "Scenario not found" });
      res.json(scenario);
    } catch (err) {
      console.error("Error fetching price scenario:", err);
      res.status(500).json({ message: "Failed to fetch scenario" });
    }
  });

  app.patch("/api/price-scenarios/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, state, baseState } = req.body;
      const updated = await storage.updatePriceScenario(id, { name, state, baseState });
      if (!updated) return res.status(404).json({ message: "Scenario not found" });
      res.json(updated);
    } catch (err) {
      console.error("Error updating price scenario:", err);
      res.status(500).json({ message: "Failed to update scenario" });
    }
  });

  app.delete("/api/price-scenarios/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deletePriceScenario(id);
      if (!deleted) return res.status(404).json({ message: "Scenario not found" });
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting price scenario:", err);
      res.status(500).json({ message: "Failed to delete scenario" });
    }
  });

  app.patch("/api/mix-estimates/rename-contractor", async (req, res) => {
    try {
      const { from, to } = req.body;
      if (!from || !to) return res.status(400).json({ message: "from and to are required" });
      const count = await storage.renameContractor(from, to);
      res.json({ updated: count });
    } catch (err) {
      console.error("Error renaming contractor:", err);
      res.status(500).json({ message: "Failed to rename contractor" });
    }
  });

  app.patch("/api/mix-estimates/rename-project", async (req, res) => {
    try {
      const { ids, to } = req.body;
      if (!Array.isArray(ids) || ids.length === 0 || !to) return res.status(400).json({ message: "ids and to are required" });
      let count = 0;
      for (const id of ids) {
        const est = await storage.getMixEstimate(id);
        if (!est) continue;
        try {
          const state = JSON.parse(est.state);
          if (!state.inputs) state.inputs = {};
          state.inputs.projName = to;
          await storage.updateMixEstimate(id, { state: JSON.stringify(state) });
          count++;
        } catch { continue; }
      }
      res.json({ updated: count });
    } catch (err) {
      console.error("Error renaming project:", err);
      res.status(500).json({ message: "Failed to rename project" });
    }
  });

  // Concrete Estimates CRUD
  app.get("/api/concrete-estimates", async (_req, res) => {
    try {
      const estimates = await storage.getConcreteEstimates();
      res.json(estimates);
    } catch (err) {
      console.error("Error fetching concrete estimates:", err);
      res.status(500).json({ message: "Failed to fetch estimates" });
    }
  });

  app.get("/api/concrete-estimates/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const estimate = await storage.getConcreteEstimate(id);
      if (!estimate) return res.status(404).json({ message: "Estimate not found" });
      res.json(estimate);
    } catch (err) {
      console.error("Error fetching concrete estimate:", err);
      res.status(500).json({ message: "Failed to fetch estimate" });
    }
  });

  app.post("/api/concrete-estimates", async (req, res) => {
    try {
      const { name, contractor, structureType, grade, state, totalCum, totalAmt } = req.body;
      if (!name || !state) return res.status(400).json({ message: "name and state required" });
      const estimate = await storage.createConcreteEstimate({ name, contractor: contractor || null, structureType: structureType || null, grade: grade || null, state, totalCum: totalCum || null, totalAmt: totalAmt || null });
      res.status(201).json(estimate);
    } catch (err) {
      console.error("Error creating concrete estimate:", err);
      res.status(500).json({ message: "Failed to create estimate" });
    }
  });

  app.patch("/api/concrete-estimates/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, contractor, structureType, grade, state, totalCum, totalAmt } = req.body;
      const estimate = await storage.updateConcreteEstimate(id, { ...(name ? { name } : {}), contractor: contractor || null, structureType: structureType || null, grade: grade || null, ...(state ? { state } : {}), totalCum: totalCum || null, totalAmt: totalAmt || null });
      if (!estimate) return res.status(404).json({ message: "Estimate not found" });
      res.json(estimate);
    } catch (err) {
      console.error("Error updating concrete estimate:", err);
      res.status(500).json({ message: "Failed to update estimate" });
    }
  });

  app.delete("/api/concrete-estimates/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteConcreteEstimate(id);
      if (!deleted) return res.status(404).json({ message: "Estimate not found" });
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting concrete estimate:", err);
      res.status(500).json({ message: "Failed to delete estimate" });
    }
  });

  // ============================================
  // CONCRETE ESTIMATES V2 (Location-Centric)
  // ============================================

  app.get("/api/concrete/v2/estimates", async (_req, res) => {
    try {
      const estimates = await storage.getConcreteEstimatesV2();
      res.json(estimates);
    } catch (err) {
      console.error("Error fetching concrete v2 estimates:", err);
      res.status(500).json({ message: "Failed to fetch estimates" });
    }
  });

  app.get("/api/concrete/v2/estimates/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const estimate = await storage.getConcreteEstimateV2(id);
      if (!estimate) return res.status(404).json({ message: "Estimate not found" });
      res.json(estimate);
    } catch (err) {
      console.error("Error fetching concrete v2 estimate:", err);
      res.status(500).json({ message: "Failed to fetch estimate" });
    }
  });

  app.post("/api/concrete/v2/estimates", async (req, res) => {
    try {
      const { name, contractor, structureType, state, totalLengthM, totalRmAmt } = req.body;
      if (!name || !state) return res.status(400).json({ message: "name and state required" });
      const estimate = await storage.createConcreteEstimateV2({ name, contractor: contractor || null, structureType: structureType || null, state, totalLengthM: totalLengthM || null, totalRmAmt: totalRmAmt || null });
      res.status(201).json(estimate);
    } catch (err) {
      console.error("Error creating concrete v2 estimate:", err);
      res.status(500).json({ message: "Failed to create estimate" });
    }
  });

  app.patch("/api/concrete/v2/estimates/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, contractor, structureType, state, totalLengthM, totalRmAmt } = req.body;
      const estimate = await storage.updateConcreteEstimateV2(id, { ...(name ? { name } : {}), contractor: contractor || null, structureType: structureType || null, ...(state ? { state } : {}), totalLengthM: totalLengthM || null, totalRmAmt: totalRmAmt || null });
      if (!estimate) return res.status(404).json({ message: "Estimate not found" });
      res.json(estimate);
    } catch (err) {
      console.error("Error updating concrete v2 estimate:", err);
      res.status(500).json({ message: "Failed to update estimate" });
    }
  });

  app.delete("/api/concrete/v2/estimates/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteConcreteEstimateV2(id);
      if (!deleted) return res.status(404).json({ message: "Estimate not found" });
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting concrete v2 estimate:", err);
      res.status(500).json({ message: "Failed to delete estimate" });
    }
  });

  // Seed Data
  seedDatabase();
  seedPlantMasterData();

  return httpServer;
}

async function seedPlantMasterData() {
  const existingMaterials = await storage.getPlantMaterials();
  if (existingMaterials.length === 0) {
    console.log("Seeding plant master data...");
    
    // Default materials - CFT included for aggregates (commonly received in CFT)
    // Conversion factor: 1 CFT = ~0.028 Ton for aggregates (varies by material density)
    const defaultMaterials = [
      { name: "20MM", category: "Aggregate", defaultUom: "Ton", allowedUoms: JSON.stringify(["Ton", "MT", "CFT", "Cum", "Kg"]), conversionFactor: 0.04, conversionFromUom: "CFT", conversionToUom: "Ton" },
      { name: "10/12MM", category: "Aggregate", defaultUom: "Ton", allowedUoms: JSON.stringify(["Ton", "MT", "CFT", "Cum", "Kg"]), conversionFactor: 0.04, conversionFromUom: "CFT", conversionToUom: "Ton" },
      { name: "6MM DOWN", category: "Aggregate", defaultUom: "Ton", allowedUoms: JSON.stringify(["Ton", "MT", "CFT", "Cum", "Kg"]), conversionFactor: 0.045, conversionFromUom: "CFT", conversionToUom: "Ton" },
      { name: "DUST", category: "Aggregate", defaultUom: "Ton", allowedUoms: JSON.stringify(["Ton", "MT", "CFT", "Cum", "Kg"]), conversionFactor: 0.05, conversionFromUom: "CFT", conversionToUom: "Ton" },
      { name: "40MM", category: "Aggregate", defaultUom: "Ton", allowedUoms: JSON.stringify(["Ton", "MT", "CFT", "Cum", "Kg"]), conversionFactor: 0.045, conversionFromUom: "CFT", conversionToUom: "Ton" },
      { name: "BITUMEN", category: "Bitumen", defaultUom: "MT", allowedUoms: JSON.stringify(["MT", "Ton", "Kg", "Barrels"]) },
      { name: "EMULSION", category: "Bitumen", defaultUom: "Liters", allowedUoms: JSON.stringify(["Liters", "Barrels", "Kg"]) },
      { name: "DIESEL", category: "Utility", defaultUom: "Liters", allowedUoms: JSON.stringify(["Liters", "Barrels", "Kg"]) },
      { name: "LDO", category: "Utility", defaultUom: "Liters", allowedUoms: JSON.stringify(["Liters", "Barrels", "Kg"]) },
    ];
    
    for (const material of defaultMaterials) {
      await storage.createPlantMaterial(material);
    }
    
    // Get materials for components
    const materials = await storage.getPlantMaterials();
    const materialMap = new Map(materials.map(m => [m.name, m.id]));
    
    // Default mix templates with aggregate proportions (% of total mix)
    // BC Standard: 20mm=30%, 10/12mm=35%, 6mm=20%, Dust=10% (aggregates=95%, Bitumen=5%)
    await storage.createMixTemplate({
      name: "BC STANDARD",
      mixType: "BC",
      bitumenPercent: 5.2,
      ldoNorm: 6, // 6 liters LDO per ton of mix
      isStandard: 1,
      notes: "Standard BC mix design"
    }, [
      { templateId: 0, materialId: materialMap.get("20MM") || 1, percent: 30, uom: "%" },
      { templateId: 0, materialId: materialMap.get("10/12MM") || 2, percent: 35, uom: "%" },
      { templateId: 0, materialId: materialMap.get("6MM DOWN") || 3, percent: 20, uom: "%" },
      { templateId: 0, materialId: materialMap.get("DUST") || 4, percent: 9.8, uom: "%" },
    ]);
    
    // DBM Standard: 20mm=40%, 10/12mm=30%, 6mm=15%, Dust=10.5% (aggregates=95.5%, Bitumen=4.5%)
    await storage.createMixTemplate({
      name: "DBM STANDARD",
      mixType: "DBM",
      bitumenPercent: 4.5,
      ldoNorm: 5, // 5 liters LDO per ton of mix
      isStandard: 1,
      notes: "Standard DBM mix design"
    }, [
      { templateId: 0, materialId: materialMap.get("20MM") || 1, percent: 40, uom: "%" },
      { templateId: 0, materialId: materialMap.get("10/12MM") || 2, percent: 30, uom: "%" },
      { templateId: 0, materialId: materialMap.get("6MM DOWN") || 3, percent: 15, uom: "%" },
      { templateId: 0, materialId: materialMap.get("DUST") || 4, percent: 10.5, uom: "%" },
    ]);
    
    // Default generators
    await storage.createEquipment({
      name: "600 KVA GENERATOR",
      equipmentType: "Generator",
      meterType: "hour_meter",
      consumptionNorm: 50,
    });
    
    await storage.createEquipment({
      name: "40-30 KVA GENERATOR",
      equipmentType: "Generator",
      meterType: "hour_meter",
      consumptionNorm: 8,
    });
    
    console.log("Plant master data seeded successfully");
  }
}

async function seedDatabase() {
  const existing = await storage.getDprs();
  if (existing.length === 0) {
    console.log("Seeding database with example DPR...");
    await storage.createDpr({
      date: new Date().toISOString().split('T')[0],
      site: "Highway 42 Project",
      engineer: "John Doe",
      progress: [
        { activity: "Scarifying", chainageFrom: "10+200", chainageTo: "10+500", length: 300, width: 7.5, quantity: 2250, uom: "sqm" },
        { activity: "BC Laying", chainageFrom: "12+000", chainageTo: "12+100", length: 100, width: 7.5, thickness: 0.04, quantity: 30, uom: "cum" }
      ],
      equipment: [
        { machine: "Paver", operator: "Mike", startTime: "08:00", endTime: "17:00", diesel: 50 },
        { machine: "Roller", operator: "Steve", startTime: "09:00", endTime: "18:00", diesel: 40 }
      ],
      labour: [
        { category: "Skilled", gender: "Male", count: 5 },
        { category: "Unskilled", gender: "Female", count: 10 }
      ],
      materials: [
        { type: "Received", material: "Bitumen", quantity: 10, uom: "MT" },
        { type: "Issued", material: "Diesel", quantity: 100, uom: "Liters" }
      ]
    });
  }

  try {
    const seeded = await storage.seedSitesFromDprs();
    if (seeded > 0) {
      console.log(`Startup: Seeded ${seeded} sites from existing DPRs`);
    }
  } catch (err) {
    console.error("Startup: Failed to seed sites:", err);
  }

  try {
    const supersededResult = await storage.migrateSupersededDprs();
    if (supersededResult.marked > 0) {
      console.log(`Startup: Marked ${supersededResult.marked} DPRs as superseded, ${supersededResult.errors} errors`);
    }
  } catch (err) {
    console.error("Startup: Failed to migrate superseded DPRs:", err);
  }

  try {
    const engineerResult = await storage.migrateEngineerNamesToPersonnelFormat();
    if (engineerResult.updated > 0 || engineerResult.unmatched > 0) {
      console.log(`Startup: Engineer names migration - updated: ${engineerResult.updated}, unmatched: ${engineerResult.unmatched}, errors: ${engineerResult.errors}`);
    }
  } catch (err) {
    console.error("Startup: Failed to migrate engineer names:", err);
  }

  try {
    const legacyManpowerResult = await storage.migrateLegacyPlantShiftLogManpower();
    if (legacyManpowerResult.updated > 0 || legacyManpowerResult.errors > 0) {
      console.log(`Startup: Plant shift-log manpower backfill - updated: ${legacyManpowerResult.updated}, skipped: ${legacyManpowerResult.skipped}, errors: ${legacyManpowerResult.errors}`);
    }
  } catch (err) {
    console.error("Startup: Failed to backfill plant shift-log manpower:", err);
  }

  try {
    const orphanResult = await storage.migrateOrphanStockToHLC();
    if (orphanResult.ledgerFixed > 0 || orphanResult.balancesMerged > 0) {
      console.log(`Startup: Migrated orphan stock to HLC - ${orphanResult.ledgerFixed} ledger entries fixed, ${orphanResult.balancesMerged} balances merged, ${orphanResult.errors} errors`);
    }
  } catch (err) {
    console.error("Startup: Failed to migrate orphan stock:", err);
  }

  try {
    const cleanupResult = await storage.cleanupSupersededDprDieselLedger();
    if (cleanupResult.removed > 0) {
      console.log(`Startup: Cleaned up ${cleanupResult.removed} duplicate diesel ledger entries from superseded DPRs, ${cleanupResult.errors} errors`);
    }
  } catch (err) {
    console.error("Startup: Failed to cleanup superseded DPR diesel ledger:", err);
  }

  try {
    const purchaseRepairResult = await storage.repairMissingSitePurchases();
    if (purchaseRepairResult.repaired > 0) {
      console.log(`Startup: Repaired ${purchaseRepairResult.repaired} missing site purchases from previous DPR versions, ${purchaseRepairResult.errors} errors`);
    }
  } catch (err) {
    console.error("Startup: Failed to repair missing site purchases:", err);
  }

  try {
    const dieselRepairResult = await storage.repairLostDieselSource();
    if (dieselRepairResult.repaired > 0) {
      console.log(`Startup: Repaired ${dieselRepairResult.repaired} equipment logs with lost diesel source, created ${dieselRepairResult.ledgerCreated} stock ledger entries, ${dieselRepairResult.errors} errors`);
    }
  } catch (err) {
    console.error("Startup: Failed to repair lost diesel source:", err);
  }

  try {
    const dprDieselResult = await storage.migrateDprPlantStockDieselToLedger();
    if (dprDieselResult.created > 0) {
      console.log(`Startup: Migrated DPR plant_stock diesel to ledger (cutoff: Feb 1, 2026) - created: ${dprDieselResult.created}, skipped: ${dprDieselResult.skipped}, errors: ${dprDieselResult.errors}`);
    }
  } catch (err) {
    console.error("Startup: Failed to migrate DPR plant_stock diesel:", err);
  }

  try {
    const recalcResult = await storage.recalculateAllDispatchConsumption();
    if (recalcResult.varianceFixed > 0) {
      console.log(`Startup: Recalculated dispatch variances - ${recalcResult.varianceFixed} fixed, ${recalcResult.updated} total, ${recalcResult.errors} errors`);
    }
  } catch (err) {
    console.error("Startup: Failed to recalculate dispatch variances:", err);
  }

  try {
    const contractorLabelResult = await storage.fixNullContractorLabels();
    console.log(`Startup: Fix null contractor labels - updated: ${contractorLabelResult.updated}`);
  } catch (err) {
    console.error("Startup: Failed to fix null contractor labels:", err);
  }

  try {
    const badStockResult = await storage.fixBadStockBalanceEntries();
    if (!badStockResult.skipped) {
      console.log(`Startup: Fix bad stock balance entries - fixed: ${badStockResult.fixed} rows`);
    }
  } catch (err) {
    console.error("Startup: Failed to fix bad stock balance entries:", err);
  }

  try {
    const labCasingResult = await storage.fixLabourContractorCasing();
    if (labCasingResult.updated > 0) {
      console.log(`Startup: Normalised labour contractor casing - updated: ${labCasingResult.updated} rows`);
    }
  } catch (err) {
    console.error("Startup: Failed to normalise labour contractor casing:", err);
  }
}
