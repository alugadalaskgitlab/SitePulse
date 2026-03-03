import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import * as xlsx from 'xlsx';
import { createDprRequestSchema, createPlantReportRequestSchema, insertAdminNotificationSchema, insertMaterialIssueSchema, insertMaterialReturnSchema, insertMaterialOpeningStockSchema, insertSiteMaterialTripSchema, insertSiteSchema, insertBitumenDipReadingSchema, insertLdoFlowReadingSchema, insertLdoDipReadingSchema, insertPersonnelSchema } from "@shared/schema";
import { sendPushToAll, sendTestPush } from "./push";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

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

  // Get all site material trips (with optional filters)
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
}
