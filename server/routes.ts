import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import * as xlsx from 'xlsx';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import { createDprRequestSchema, createPlantReportRequestSchema, insertAdminNotificationSchema, insertMaterialIssueSchema, insertMaterialReturnSchema, insertMaterialOpeningStockSchema, insertSiteMaterialTripSchema, insertSiteSchema, insertBitumenDipReadingSchema, insertLdoFlowReadingSchema, insertLdoDipReadingSchema, insertPersonnelSchema, createPurchaseIndentRequestSchema, createDieselRequirementRequestSchema, createVendorBillRequestSchema } from "@shared/schema";
import { sendPushToAll, sendTestPush } from "./push";
import { canonicalizeMachineType } from "@shared/canonicalize";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

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
      const id = Number(req.params.id);
      const { pin, data } = req.body;
      
      if (!pin || typeof pin !== "string" || pin.length < 4) {
        return res.status(400).json({ message: "Valid admin PIN is required" });
      }
      
      const isAdmin = await storage.verifyPin("admin", pin);
      if (!isAdmin) {
        return res.status(403).json({ message: "Invalid admin PIN" });
      }

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
      const pinValid = (managerPin && pin === managerPin) || (adminPin && pin === adminPin);
      if (!pinValid) {
        return res.status(403).json({ message: "Invalid PIN" });
      }
      const sub = await storage.createPushSubscription({
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        label: req.body.label || null,
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

  // PIN verification route
  const pinVerifySchema = z.object({
    pin: z.string().length(4),
  });

  app.post("/api/auth/verify-pin", async (req, res) => {
    try {
      const input = pinVerifySchema.parse(req.body);
      const isManager = await storage.verifyPin("manager", input.pin);
      const isAdmin = await storage.verifyPin("admin", input.pin);
      
      if (isAdmin) {
        return res.json({ role: "admin", valid: true });
      } else if (isManager) {
        return res.json({ role: "manager", valid: true });
      } else {
        return res.json({ role: null, valid: false });
      }
    } catch (err) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Change Admin PIN (admin only)
  const changePinSchema = z.object({
    currentPin: z.string().length(4),
    newPin: z.string().length(4),
  });

  app.post("/api/admin/change-pin", async (req, res) => {
    try {
      const input = changePinSchema.parse(req.body);
      
      const isAdmin = await storage.verifyPin("admin", input.currentPin);
      if (!isAdmin) {
        return res.status(403).json({ message: "Invalid current admin PIN" });
      }
      
      await storage.setSetting("admin_pin", input.newPin);
      res.json({ message: "Admin PIN updated successfully" });
    } catch (err) {
      res.status(500).json({ message: "Failed to update PIN" });
    }
  });

  // Change Manager PIN (admin only)
  app.post("/api/admin/change-manager-pin", async (req, res) => {
    try {
      const input = changePinSchema.parse(req.body);
      
      // Admin PIN required to change manager PIN
      const isAdmin = await storage.verifyPin("admin", input.currentPin);
      if (!isAdmin) {
        return res.status(403).json({ message: "Invalid admin PIN" });
      }
      
      await storage.setSetting("manager_pin", input.newPin);
      res.json({ message: "Manager PIN updated successfully" });
    } catch (err) {
      res.status(500).json({ message: "Failed to update PIN" });
    }
  });


  // Create a new version of DPR with edited data
  // Creates a copy with timestamp instead of overwriting original
  const versionSchema = z.object({
    pin: z.string().min(0),
    editedBy: z.enum(["manager", "admin", "engineer"]),
    data: createDprRequestSchema,
    clientTimestamp: z.string().optional(),
  });

  app.post("/api/dprs/:id/version", async (req, res) => {
    try {
      const originalId = Number(req.params.id);
      const input = versionSchema.parse(req.body);
      
      if (input.editedBy === "engineer") {
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
      } else {
        const isValid = await storage.verifyPin(input.editedBy, input.pin);
        if (!isValid) {
          return res.status(403).json({ message: "Invalid PIN for editing" });
        }
      }
      
      const newVersion = await storage.createVersionDpr(originalId, input.data, input.editedBy, input.clientTimestamp);
      
      await storage.createNotification({
        type: "info",
        title: "DPR Updated",
        message: `DPR for ${input.data.site} (${input.data.date}) was edited by ${input.editedBy}`,
        isRead: 0,
      });
      sendPushToAll("DPR Updated", `${input.editedBy} edited DPR for ${input.data.site} (${input.data.date})`, "/site-reports").catch(() => {});
      
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

  // Clone DPR (for manager edits as copies)
  // Requires manager or admin role with PIN verification
  const cloneSchema = z.object({
    editedBy: z.enum(["manager", "admin"]),
    pin: z.string().length(4),
    clientTimestamp: z.string().optional(),
  });
  
  app.post("/api/dprs/:id/clone", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = cloneSchema.parse(req.body);
      
      // Server-side PIN validation using database
      const isValid = await storage.verifyPin(input.editedBy, input.pin);
      if (!isValid) {
        return res.status(403).json({ message: "Invalid PIN for role verification" });
      }
      
      const cloned = await storage.cloneDpr(id, input.editedBy, input.clientTimestamp);
      if (!cloned) {
        return res.status(404).json({ message: "Original DPR not found" });
      }
      
      await storage.createNotification({
        type: "success",
        title: "DPR Cloned",
        message: `DPR cloned for ${cloned.site} (${cloned.date}) by ${input.editedBy}`,
        isRead: 0,
      });
      sendPushToAll("DPR Cloned", `${cloned.site} - ${cloned.date}`, "/site-reports").catch(() => {});
      
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

  // Delete DPR (admin only with PIN verification)
  const deleteSchema = z.object({
    pin: z.string().length(4),
  });

  app.delete("/api/dprs/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = deleteSchema.parse(req.body);
      
      // Server-side PIN validation - admin only using database
      const isAdmin = await storage.verifyPin("admin", input.pin);
      if (!isAdmin) {
        return res.status(403).json({ message: "Invalid admin PIN for deletion" });
      }
      
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
    editedBy: z.enum(["manager", "admin"]),
    pin: z.string().length(4),
  });

  app.post("/api/plant/:id/clone", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = plantCloneSchema.parse(req.body);
      
      // Server-side PIN validation using database
      const isValid = await storage.verifyPin(input.editedBy, input.pin);
      if (!isValid) {
        return res.status(403).json({ message: "Invalid PIN for role verification" });
      }
      
      const cloned = await storage.clonePlantReport(id, input.editedBy);
      if (!cloned) {
        return res.status(404).json({ message: "Original plant report not found" });
      }
      sendPushToAll("Plant Report Cloned", `Plant report cloned by ${input.editedBy}`, "/plant").catch(() => {});
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

  const plantDeleteSchema = z.object({
    pin: z.string().length(4),
  });

  app.delete("/api/plant/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = plantDeleteSchema.parse(req.body);
      
      // Server-side PIN validation - admin only using database
      const isAdmin = await storage.verifyPin("admin", input.pin);
      if (!isAdmin) {
        return res.status(403).json({ message: "Invalid admin PIN for deletion" });
      }
      
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
      
      await storage.createNotification({
        type: "success",
        title: "Mix Dispatched",
        message: `Truck dispatch: ${result.dispatch.loadWeight} MT dispatched on ${result.dispatch.date}`,
        isRead: 0,
      });
      sendPushToAll("Dispatch Recorded", `${result.dispatch.loadWeight} MT dispatched on ${result.dispatch.date}`, "/plant").catch(() => {});
      
      res.status(201).json(result);
    } catch (err) {
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
      
      // Get the most recent entry for this equipment (includes same-day entries)
      const previousBalance = filteredUsage.length > 0 ? filteredUsage[0].closingDiesel || 0 : 0;
      const previousClosingReading = filteredUsage.length > 0 ? filteredUsage[0].closingReading || 0 : 0;
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
      const updated = await storage.updateEquipmentUsage(id, req.body);
      if (!updated) {
        return res.status(404).json({ message: "Equipment usage not found" });
      }
      const eqName = req.body.equipmentName || `Equipment #${req.body.equipmentId || id}`;
      sendPushToAll("Equipment Updated", `${eqName} - Closing: ${req.body.closingReading ?? 'N/A'}`, "/plant/equipment-usage").catch(() => {});
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update equipment usage" });
    }
  });

  app.delete("/api/plant-module/equipment-usage/:id", async (req, res) => {
    try {
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

  // Generator Logs
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

      if (!pin || typeof pin !== "string") {
        return res.status(400).json({ message: "PIN is required" });
      }

      const isAdmin = await storage.verifyPin("admin", pin);
      const isManager = await storage.verifyPin("manager", pin);
      if (!isAdmin && !isManager) {
        return res.status(403).json({ message: "Invalid PIN" });
      }

      const approvedBy = isAdmin ? "ADMIN" : "MANAGER";

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
      const { pin, reason } = req.body;

      if (!pin || typeof pin !== "string") {
        return res.status(400).json({ message: "PIN is required" });
      }

      const isAdmin = await storage.verifyPin("admin", pin);
      const isManager = await storage.verifyPin("manager", pin);
      if (!isAdmin && !isManager) {
        return res.status(403).json({ message: "Invalid PIN" });
      }

      const rejectedBy = isAdmin ? "ADMIN" : "MANAGER";

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
      const { pin, reason } = req.body;

      if (!pin || typeof pin !== "string") {
        return res.status(400).json({ message: "PIN is required" });
      }
      if (!reason || typeof reason !== "string" || !reason.trim()) {
        return res.status(400).json({ message: "Cancellation reason is required" });
      }

      const isAdmin = await storage.verifyPin("admin", pin);
      const isManager = await storage.verifyPin("manager", pin);
      if (!isAdmin && !isManager) {
        return res.status(403).json({ message: "Invalid PIN" });
      }

      const cancelledBy = isAdmin ? "ADMIN" : "MANAGER";
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
      const { pin, reason } = req.body;

      if (!pin || typeof pin !== "string") {
        return res.status(400).json({ message: "PIN is required" });
      }
      if (!reason || typeof reason !== "string" || !reason.trim()) {
        return res.status(400).json({ message: "Reason is required" });
      }

      const isAdmin = await storage.verifyPin("admin", pin);
      if (!isAdmin) {
        return res.status(403).json({ message: "Admin PIN required for force close" });
      }

      const indent = await storage.forceCloseIndent(id, "ADMIN", reason);
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
      const { pin, ...data } = req.body;
      if (!pin) return res.status(403).json({ message: "PIN required to edit indent" });

      const existing = await storage.getPurchaseIndent(id);
      if (!existing) return res.status(404).json({ message: "Purchase indent not found" });

      if (existing.status !== "pending") {
        const isAdmin = await storage.verifyPin("admin", pin);
        if (!isAdmin) return res.status(403).json({ message: "Admin PIN required to edit non-pending indent" });
      } else {
        const role = await storage.verifyPin("manager", pin) ? "manager" : (await storage.verifyPin("admin", pin) ? "admin" : null);
        if (!role) return res.status(403).json({ message: "Invalid manager/admin PIN" });
      }

      const validatedData = createPurchaseIndentRequestSchema.parse(data);
      const indent = await storage.updatePurchaseIndent(id, validatedData);
      if (!indent) return res.status(404).json({ message: "Purchase indent not found" });
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
      const id = Number(req.params.id);
      const { pin } = req.body;
      if (!pin) return res.status(403).json({ message: "Admin PIN required to delete indent" });
      const isAdmin = await storage.verifyPin("admin", pin);
      if (!isAdmin) return res.status(403).json({ message: "Invalid admin PIN" });

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
      const { pin, approvedItems } = req.body;

      if (!pin || typeof pin !== "string") {
        return res.status(400).json({ message: "PIN is required" });
      }

      const isAdmin = await storage.verifyPin("admin", pin);
      const isManager = await storage.verifyPin("manager", pin);
      if (!isAdmin && !isManager) {
        return res.status(403).json({ message: "Invalid PIN" });
      }

      const approvedBy = isAdmin ? "ADMIN" : "MANAGER";

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
      const { pin, reason } = req.body;

      if (!pin || typeof pin !== "string") {
        return res.status(400).json({ message: "PIN is required" });
      }

      const isAdmin = await storage.verifyPin("admin", pin);
      const isManager = await storage.verifyPin("manager", pin);
      if (!isAdmin && !isManager) {
        return res.status(403).json({ message: "Invalid PIN" });
      }

      const rejectedBy = isAdmin ? "ADMIN" : "MANAGER";

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
      const { pin, ...data } = req.body;
      if (!pin) return res.status(403).json({ message: "PIN required to edit diesel requirement" });

      const existing = await storage.getDieselRequirement(id);
      if (!existing) return res.status(404).json({ message: "Diesel requirement not found" });

      if (existing.status !== "pending") {
        const isAdmin = await storage.verifyPin("admin", pin);
        if (!isAdmin) return res.status(403).json({ message: "Admin PIN required to edit non-pending diesel requirement" });
      } else {
        const role = await storage.verifyPin("manager", pin) ? "manager" : (await storage.verifyPin("admin", pin) ? "admin" : null);
        if (!role) return res.status(403).json({ message: "Invalid manager/admin PIN" });
      }

      const validatedData = createDieselRequirementRequestSchema.parse(data);
      const requirement = await storage.updateDieselRequirement(id, validatedData);
      if (!requirement) return res.status(404).json({ message: "Diesel requirement not found" });
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
      const id = Number(req.params.id);
      const { pin } = req.body;
      if (!pin) return res.status(403).json({ message: "Admin PIN required to delete diesel requirement" });
      const isAdmin = await storage.verifyPin("admin", pin);
      if (!isAdmin) return res.status(403).json({ message: "Invalid admin PIN" });

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
      const bills = await storage.getVendorBills();
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
      };
      res.json(summary);
    } catch (err) {
      console.error("Error fetching vendor bills summary:", err);
      res.status(500).json({ message: "Failed to fetch vendor bills summary" });
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
      const { pin, ...billData } = req.body;
      const input = createVendorBillRequestSchema.parse(billData);

      const existing = await storage.getVendorBill(id);
      if (!existing) {
        return res.status(404).json({ message: "Vendor bill not found" });
      }

      if (existing.status === "verified" || existing.status === "approved" || existing.status === "paid") {
        if (!pin) {
          return res.status(403).json({ message: "Admin PIN required to edit verified/approved/paid bills" });
        }
        const isAdmin = await storage.verifyPin("admin", pin);
        if (!isAdmin) {
          return res.status(403).json({ message: "Invalid admin PIN" });
        }
        input.status = "draft";
      }

      const bill = await storage.updateVendorBill(id, input);
      if (!bill) {
        return res.status(404).json({ message: "Vendor bill not found" });
      }
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
        actor: z.string().min(1),
        pin: z.string().optional(),
      });
      const { status, actor, pin } = statusSchema.parse(req.body);

      if (status === "verified" || status === "approved") {
        if (!pin) {
          return res.status(400).json({ message: "PIN is required for verification/approval" });
        }
        const role = status === "verified" ? "manager" : "admin";
        const isValid = await storage.verifyPin(role, pin);
        if (!isValid) {
          const isOtherValid = await storage.verifyPin(role === "manager" ? "admin" : "manager", pin);
          if (!isOtherValid) {
            return res.status(403).json({ message: `Invalid PIN for ${status}` });
          }
        }
      }

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
        const map: Record<string, string> = { equipment: "EQUIPMENT HIRE", material: "MATERIAL SUPPLY", transport: "TRANSPORT", all: "ALL", other: "OTHER / MISCELLANEOUS" };
        return map[type.toLowerCase()] || type.toUpperCase();
      };
      const getCategoryLabel = (cat: string) => {
        const map: Record<string, string> = { equipment: "EQUIP", material: "MATL", transport: "TRNS" };
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

      const pdfCategories = ["equipment", "material", "transport", "other"];
      const pdfCatLabels: Record<string, string> = { equipment: "EQUIPMENT", material: "MATERIAL", transport: "TRANSPORT", other: "OTHER" };
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

          const catGstRate = cat === "equipment" ? (bill as any).gstRateEquipment : cat === "material" ? (bill as any).gstRateMaterial : cat === "transport" ? (bill as any).gstRateTransport : 0;
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
        const pdfIsAllType = bill.billType?.toLowerCase() === "all";
        const pdfUsePerGroupGst = pdfIsAllType || shouldGroupPdf;
        const pSingleGstRate = !pdfUsePerGroupGst
          ? (bill.billType?.toLowerCase() === "equipment" ? (bill as any).gstRateEquipment
            : bill.billType?.toLowerCase() === "material" ? (bill as any).gstRateMaterial
            : bill.billType?.toLowerCase() === "transport" ? (bill as any).gstRateTransport : 0) || 0
          : 0;
        const pSingleGstAmt = pSingleGstRate ? (bill.totalAmount || 0) * pSingleGstRate / 100 : 0;
        const pTotalGst = pdfUsePerGroupGst ? pGstEq + pGstMat + pGstTr : pSingleGstAmt;
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
      const pin = req.body?.pin as string | undefined;

      const bill = await storage.getVendorBill(id);
      if (!bill) {
        return res.status(404).json({ message: "Vendor bill not found" });
      }

      if (!pin) {
        return res.status(403).json({ message: "Admin PIN required to delete bills" });
      }
      const isAdmin = await storage.verifyPin("admin", pin);
      if (!isAdmin) {
        return res.status(403).json({ message: "Invalid admin PIN" });
      }

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
      const { tables, pin } = req.body;
      if (!pin) return res.status(400).json({ message: "PIN required" });
      const isValid = await storage.verifyPin("admin", pin);
      if (!isValid) return res.status(403).json({ message: "Invalid admin PIN" });
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
      const { pin } = req.body;
      if (!pin) return res.status(400).json({ message: "PIN required" });
      const isValid = await storage.verifyPin("admin", pin);
      if (!isValid) return res.status(403).json({ message: "Invalid admin PIN" });
      await storage.resetAllSequences();
      res.json({ success: true, message: "All sequences reset successfully" });
    } catch (err) {
      console.error("Error resetting sequences:", err);
      res.status(500).json({ message: "Failed to reset sequences" });
    }
  });

  app.post("/api/admin/import-data", async (req, res) => {
    try {
      const { data, pin } = req.body;
      if (!pin) return res.status(400).json({ message: "PIN required" });
      const isValid = await storage.verifyPin("admin", pin);
      if (!isValid) return res.status(403).json({ message: "Invalid admin PIN" });
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
}
