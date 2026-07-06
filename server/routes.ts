import type { Express } from "express";
import type { Server } from "http";
import { storage, StockShortageError } from "./storage";
import { autoMapBoqItems, remapBoqProject, autoMapAllUnmappedItems, autoMapProjectWithSummary, backfillCompositeDetection, classifyBoqItem, getSectorMultiplier } from "./snlAutoMapper";
import { api } from "@shared/routes";
import { z } from "zod";
import * as xlsx from 'xlsx';
import multer from 'multer';
import { importSdbXlsx, buildImportTemplate } from './snlImporter';
import { importMorthSdbXlsx, isMorthFormat } from './snlMorthParser';
import PDFDocument from 'pdfkit';
import { pipeOperatorManualPdf } from './operator-manual-pdf';
import { pipeAdminGuidePdf } from './admin-guide-pdf';
import { pipeEstimatorGuidePdf } from './estimator-guide-pdf';
import archiver from 'archiver';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { createDprRequestSchema, createPlantReportRequestSchema, insertAdminNotificationSchema, insertMaterialIssueSchema, insertMaterialReturnSchema, insertMaterialOpeningStockSchema, insertSiteMaterialTripSchema, insertSiteSchema, insertBitumenDipReadingSchema, insertLdoFlowReadingSchema, insertLdoDipReadingSchema, insertPersonnelSchema, createPurchaseIndentRequestSchema, createDieselRequirementRequestSchema, createVendorBillRequestSchema, insertPlantSettingsSchema, insertMaterialReceiptSchema, LABOUR_CATEGORIES, LABOUR_GENDERS, insertRmcMixDesignSchema, insertRmcBatchRecordSchema, insertRmcCubeTestSchema, insertRmcRawMaterialReceiptSchema, dieselRequirements as dieselRequirementsTable, purchaseIndents as purchaseIndentsTable, sites as sitesTable, createIrnRequestSchema, storesVerifyIrnSchema, approveIrnSchema, recordIrnIssueSchema, truckDispatches as truckDispatchesTable, parties as partiesTable, mixTemplates as mixTemplatesTable, plantMaterials, stockBalances, internalRequisitions, internalRequisitionItems, boqItems, snlBoqMappings, snlItems } from "@shared/schema";
import { db } from "./db";
import { isNull, inArray as drizzleInArray, sql, and, or, eq, gt, gte, lte, asc } from "drizzle-orm";
import { getVolumeAtDepth, getUsableVolume, BITUMEN_DENSITY_KG_PER_LITER } from "@shared/bitumen-dip-chart";
import { calculateBomDemand, deriveMaterialsFromLayerConfig, normaliseMixType, computeShortageRow, type LayerConfig } from "@shared/planningEngine";
import { autoSequenceStructureBars, type SequenceableBar, type EquipmentInput } from "@shared/structureSequencing";
import { isStructureTypeLabel, isChainageLabel, isChainageFromLabel, isChainageToLabel } from "@shared/structureImportLabels";
import { classifyWorkType, STANDARD_CONCRETE_DESIGNS, isStructureOrLocationScheduledItem } from "@shared/workTypeRecipes";
import { parseTankConfig, calculateVolumeAtDepth as calcTankVol } from "@shared/tank-calibration";
import { sendPushToAll, sendPushToAudience, sendPushToSection, sendPushToRaiser, sendTestPush } from "./push";
import { canonicalizeMachineType } from "@shared/canonicalize";
import { aggregateGstBreakdown, computeBillGstByCategory, type GstCategory } from "@shared/vendor-bill-gst";
import { requireAuth, isPublicApiPath, isOptionalAuthPath, optionalAuth, lookupSessionFromCookie, loadUserPermissionsMatrix } from "./auth";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage/routes";
import { insertAttachmentSchema, attachmentModuleTypes } from "@shared/schema";
import {
  registerAuthRoutes,
  assertAdmin,
  assertEdit,
  assertView,
  assertAuthed,
  assertCreate,
  assertApprove,
  currentUserName,
} from "./auth-routes";
import { registerManagementReportRoutes } from "./management-report";

const ESTIMATOR_COOKIE = 'hlc_est_role';

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k.trim() === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

// Auth helper for mix-calculator write endpoints.
// Accepts EITHER: estimator admin cookie (for estimator-portal users)
// OR: main-app user with mix_calculator permission (for the given action).
type MixCalcAction = 'create' | 'edit' | 'delete';
function assertMixCalcWrite(req: Request, res: Response, action: MixCalcAction): boolean {
  // 1. Estimator admin cookie is always accepted for writes
  const cookieVal = parseCookie(req.headers.cookie, ESTIMATOR_COOKIE);
  const estimatorRole = verifyRoleCookie(cookieVal);
  if (estimatorRole === 'admin') return true;

  // 2. Main-app user must be authenticated and have the right mix_calculator permission
  if (!req.authUser) {
    res.status(401).json({ message: "Authentication required" });
    return false;
  }
  if (req.authUser.isAdmin) return true;
  const perm = req.authPermissions?.["mix_calculator"];
  const allowed = action === 'create' ? !!perm?.create
    : action === 'edit' ? (!!perm?.edit || !!perm?.create)
    : !!perm?.delete;
  if (!allowed) {
    res.status(403).json({ message: "You don't have permission to perform this action." });
    return false;
  }
  return true;
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

// Feature flag: set ENABLE_RMC=true in the environment to enable the RMC plant module.
// In production, leave this unset (or set to 'false') to hide the RMC module entirely.
const RMC_ENABLED = process.env.ENABLE_RMC === "true";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  async function getCompanyConfig() {
    const companyName = process.env.COMPANY_NAME
      ?? (await storage.getSetting("company_name"))
      ?? "High Lane Constructions Pvt Ltd";
    const companyShortName = process.env.COMPANY_SHORT_NAME
      ?? (await storage.getSetting("company_short_name"))
      ?? companyName.split(/\s+/).filter(Boolean).map((w: string) => w[0]).join("").toUpperCase().slice(0, 5);
    const appTagline = process.env.APP_TAGLINE
      ?? (await storage.getSetting("app_tagline"))
      ?? "Live Ops. Not Just Logs.";
    const logoFile = process.env.COMPANY_LOGO_FILE
      ?? (await storage.getSetting("company_logo_file"))
      ?? "hlc-logo.jpg";
    return { companyName, companyShortName, appTagline, logoFile };
  }

  function getCompanyLogoPath(logoFile: string): string {
    const p = path.join(process.cwd(), "client", "public", logoFile);
    return fs.existsSync(p) ? p : "";
  }

  // ============================================
  // FEATURE CONFIG — returns runtime feature flags to the frontend
  // ============================================
  app.get("/api/config", async (_req, res) => {
    try {
      const cfg = await getCompanyConfig();
      res.json({ rmcEnabled: RMC_ENABLED, ...cfg });
    } catch {
      res.json({ rmcEnabled: RMC_ENABLED, companyName: "High Lane Constructions Pvt Ltd", companyShortName: "HLC", appTagline: "Live Ops. Not Just Logs.", logoFile: "hlc-logo.jpg" });
    }
  });

  app.get("/api/admin/branding", requireAuth, async (_req, res) => {
    try {
      const cfg = await getCompanyConfig();
      res.json(cfg);
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Failed to load branding config" });
    }
  });

  app.post("/api/admin/branding", requireAuth, async (req, res) => {
    try {
      const { companyName, companyShortName, appTagline, logoFile } = req.body;
      if (typeof companyName === "string" && companyName.trim())
        await storage.setSetting("company_name", companyName.trim());
      if (typeof companyShortName === "string" && companyShortName.trim())
        await storage.setSetting("company_short_name", companyShortName.trim().toUpperCase());
      if (typeof appTagline === "string")
        await storage.setSetting("app_tagline", appTagline.trim());
      if (typeof logoFile === "string" && logoFile.trim())
        await storage.setSetting("company_logo_file", logoFile.trim());
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Failed to save branding config" });
    }
  });

  // ============================================
  // AUTH ROUTES (Task #229) — registered first so they're not gated by
  // the requireAuth middleware below. Estimator portal also uses its own
  // cookie and is bypassed in isPublicApiPath().
  // ============================================
  registerAuthRoutes(app);
  registerManagementReportRoutes(app);

  // Object storage: presigned-upload + object-serving routes for the
  // reusable Attachment System. Require login to view/upload any object —
  // gate BEFORE registering so it applies to the "/objects" GET route too
  // (that route lives outside "/api" and would otherwise bypass auth).
  app.use("/objects", requireAuth);
  app.use("/api/uploads", requireAuth);
  registerObjectStorageRoutes(app);

  // Global API auth middleware. Applies to every /api/* request except the
  // public auth + estimator endpoints. Populates req.authUser, req.authPermissions.
  // NOTE: req.path is mount-relative (e.g. "/auth/login") because we mount at
  // "/api". Use req.originalUrl (sans query) so isPublicApiPath sees the full
  // "/api/..." path it's defined against. Otherwise estimator + login routes
  // would be force-blocked by requireAuth.
  app.use("/api", (req, res, next) => {
    const fullPath = (req.originalUrl || req.url).split("?")[0];
    if (isPublicApiPath(fullPath)) return next();
    // Optional auth: try to populate req.authUser but don't block if no session.
    // Used for mix-calculator APIs so both estimator-portal users and
    // logged-in main-app users can reach the same handlers.
    if (isOptionalAuthPath(fullPath)) return optionalAuth(req, res, next);
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

  app.get('/mix-calculator', async (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const root = process.env.NODE_ENV === 'production'
      ? path.join(process.cwd(), 'dist', 'public')
      : path.join(process.cwd(), 'client', 'public');

    // Estimator admin cookie → full access, no injection needed.
    const estCookieVal = parseCookie(req.headers.cookie, ESTIMATOR_COOKIE);
    const estRole = verifyRoleCookie(estCookieVal);
    if (estRole === 'admin') {
      return res.sendFile('mix-calculator.html', { root });
    }

    // Check main-app session regardless of whether an estimator manager cookie
    // exists — the session may grant a higher role (e.g. create/edit → 'admin')
    // that would otherwise be blocked by a stale manager cookie.
    let mainAppRole: 'admin' | 'manager' | null = null;
    try {
      const sess = await lookupSessionFromCookie(req.headers.cookie);
      if (sess.kind === 'ok') {
        const matrix = await loadUserPermissionsMatrix(sess.user.id);
        const mp = matrix['mix_calculator'];
        const canAccess = sess.user.isAdmin || mp?.view || mp?.create || mp?.edit;
        if (canAccess) {
          mainAppRole = (sess.user.isAdmin || mp?.create || mp?.edit) ? 'admin' : 'manager';
        }
      }
    } catch {
      // ignore — fall through to estimator cookie check
    }

    // Effective role = highest privilege between main-app session and estimator cookie.
    const effectiveRole: 'admin' | 'manager' | null =
      mainAppRole === 'admin' ? 'admin'
      : estRole === 'manager' ? 'manager'
      : mainAppRole;

    if (!effectiveRole) {
      // Not authenticated via either route — redirect to estimator login.
      const returnTo = encodeURIComponent(req.originalUrl || '/mix-calculator');
      return res.redirect(302, `/estimator-login?returnTo=${returnTo}`);
    }

    // Inject window.__serverRole when the main-app session provides access OR
    // when it upgrades the role above the estimator cookie (manager → admin).
    const needsInjection = !estRole || (mainAppRole === 'admin' && estRole === 'manager');
    if (needsInjection) {
      const htmlPath = path.join(root, 'mix-calculator.html');
      let html = fs.readFileSync(htmlPath, 'utf-8');
      html = html.replace(
        '<script>\n(function(){',
        `<script>window.__serverRole='${effectiveRole}';</script>\n<script>\n(function(){`
      );
      return res.send(html);
    }

    // Estimator manager cookie with no higher main-app role — serve as-is.
    return res.sendFile('mix-calculator.html', { root });
  });

  // Permission System v2 helper — resolves permitted site names for the current user.
  // Returns null for admins or users with no site restrictions (all sites).
  // Returns string[] of permitted site names when the user is restricted.
  async function getPermittedSiteNames(req: Express.Request): Promise<string[] | null> {
    if (!req.authUser || req.authUser.isAdmin) return null;
    const permittedIds = await storage.getUserPermittedSiteIds(req.authUser.id);
    if (permittedIds === null) return null;
    const allSites = await storage.getSites();
    return allSites.filter((s) => permittedIds.includes(s.id)).map((s) => s.name);
  }

  // List DPRs with filters
  app.get(api.dprs.list.path, async (req, res) => {
    try {
      const permittedSiteNames = await getPermittedSiteNames(req);
      const filters: { site?: string; engineer?: string; dateFrom?: string; dateTo?: string; permittedSiteNames?: string[] } = {
        site: req.query.site as string | undefined,
        engineer: req.query.engineer as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        ...(permittedSiteNames !== null ? { permittedSiteNames } : {}),
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
      const permittedSiteNames = await getPermittedSiteNames(req);
      let dprs = await storage.getDprsWithDetails();
      if (permittedSiteNames !== null) {
        const nameSet = new Set(permittedSiteNames);
        dprs = dprs.filter((d) => nameSet.has(d.site));
      }
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
      let materialLogs = await storage.getSiteMaterialLogs(filters);
      // Permission System v2: filter to permitted sites
      const permittedSiteNames = await getPermittedSiteNames(req);
      if (permittedSiteNames !== null) {
        const nameSet = new Set(permittedSiteNames);
        materialLogs = materialLogs.filter((r) => nameSet.has(r.site));
      }
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
      const permittedSiteNames = await getPermittedSiteNames(req);
      const filters = {
        site: req.query.site as string | undefined,
        material: req.query.material as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        supplier: req.query.supplier as string | undefined,
        workType: req.query.workType as string | undefined,
        ...(permittedSiteNames !== null ? { permittedSiteNames } : {}),
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
      const permittedSiteNames = await getPermittedSiteNames(req);
      const filters = {
        site: req.query.site as string | undefined,
        material: req.query.material as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        ...(permittedSiteNames !== null ? { permittedSiteNames } : {}),
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
      if (!assertCreate(req, res, "site_materials")) return;
      const input = insertSiteMaterialTripSchema.parse(req.body);
      const trip = await storage.createSiteMaterialTrip(input);
      sendPushToSection("site_materials", "Site Material Trip Added", `${input.material || 'Material'} - ${input.site || ''}`, "/site-reports").catch(() => {});
      res.status(201).json(trip);
    } catch (err) {
      console.error("Error creating site material trip:", err);
      res.status(500).json({ message: "Failed to create site material trip" });
    }
  });

  // Update a site material trip
  app.patch("/api/site-material-trips/:id", async (req, res) => {
    try {
      if (!assertEdit(req, res, "site_materials")) return;
      const id = Number(req.params.id);
      const input = insertSiteMaterialTripSchema.partial().parse(req.body);
      const trip = await storage.updateSiteMaterialTrip(id, input);
      sendPushToSection("site_materials", "Site Material Trip Updated", `Trip #${id} updated`, "/site-reports").catch(() => {});
      res.json(trip);
    } catch (err) {
      console.error("Error updating site material trip:", err);
      res.status(500).json({ message: "Failed to update site material trip" });
    }
  });

  // Delete a site material trip
  app.delete("/api/site-material-trips/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const id = Number(req.params.id);
      await storage.deleteSiteMaterialTrip(id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting site material trip:", err);
      res.status(500).json({ message: "Failed to delete site material trip" });
    }
  });

  // Site Material Stock & Reconciliation (per site: ordered / delivered / consumed / lying)
  app.get("/api/site-material-stock", async (req, res) => {
    try {
      const permittedSiteNames = await getPermittedSiteNames(req);
      const rows = await storage.getSiteMaterialReconciliation(
        permittedSiteNames !== null ? { permittedSiteNames } : {},
      );
      res.json(rows);
    } catch (err) {
      console.error("Error computing site material stock:", err);
      res.status(500).json({ message: "Failed to compute site material stock" });
    }
  });

  // ============================================
  // SITES MASTER
  // ============================================

  app.get("/api/sites", async (req, res) => {
    try {
      let sitesList = await storage.getSites();
      // Permission System v2: non-admin users with explicit site-access
      // restrictions should only see their permitted sites. Users with no
      // restriction rows (including managers) continue to see all sites.
      if (req.authUser && !req.authUser.isAdmin) {
        const permittedIds = await storage.getUserPermittedSiteIds(req.authUser.id);
        if (permittedIds !== null) {
          const idSet = new Set(permittedIds);
          sitesList = sitesList.filter((s) => idSet.has(s.id));
        }
      }
      res.json(sitesList);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch sites" });
    }
  });

  app.post("/api/sites", async (req, res) => {
    try {
      if (!assertCreate(req, res, "admin_settings")) return;
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
      if (!assertEdit(req, res, "admin_settings")) return;
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
      if (!assertAdmin(req, res)) return;
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
      if (!assertCreate(req, res, "admin_settings")) return;
      const count = await storage.seedSitesFromDprs();
      res.json({ seeded: count });
    } catch (err) {
      res.status(500).json({ message: "Failed to seed sites" });
    }
  });

  // ============================================
  // REUSABLE ATTACHMENT SYSTEM (Task #1249)
  // One shared table/API backs all module attachments (DPR photos, material
  // receipt/site purchase proof, equipment breakdown/maintenance evidence,
  // etc). Do NOT build per-module upload endpoints — extend moduleType here.
  // ============================================

  app.get("/api/attachments", async (req, res) => {
    try {
      const moduleType = String(req.query.moduleType || "");
      const linkedRecordId = Number(req.query.linkedRecordId);
      if (!moduleType || !Number.isFinite(linkedRecordId)) {
        return res.status(400).json({ message: "moduleType and linkedRecordId are required" });
      }
      const list = await storage.getAttachments(moduleType, linkedRecordId);
      res.json(list);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch attachments" });
    }
  });

  app.post("/api/attachments", async (req, res) => {
    try {
      if (!req.authUser) return res.status(401).json({ message: "not_authenticated" });
      const parsed = insertAttachmentSchema.parse(req.body);
      if (!(attachmentModuleTypes as readonly string[]).includes(parsed.moduleType)) {
        return res.status(400).json({ message: `Invalid moduleType. Must be one of: ${attachmentModuleTypes.join(", ")}` });
      }
      if (!parsed.objectPath.startsWith("/objects/")) {
        return res.status(400).json({ message: "objectPath must reference an uploaded object" });
      }
      const ALLOWED_MIME_PREFIXES = ["image/", "application/pdf"];
      if (parsed.mimeType && !ALLOWED_MIME_PREFIXES.some((p) => parsed.mimeType!.startsWith(p))) {
        return res.status(400).json({ message: "Only image or PDF attachments are allowed" });
      }
      const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
      if (parsed.fileSize && parsed.fileSize > MAX_FILE_SIZE) {
        return res.status(400).json({ message: "File is too large. Maximum size is 15MB." });
      }
      const record = await storage.createAttachment({ ...parsed, uploadedBy: req.authUser.id });
      res.status(201).json(record);
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ message: "Invalid data", errors: err.errors });
      res.status(500).json({ message: "Failed to save attachment" });
    }
  });

  app.delete("/api/attachments/:id", async (req, res) => {
    try {
      if (!req.authUser) return res.status(401).json({ message: "not_authenticated" });
      const deleted = await storage.deleteAttachment(Number(req.params.id));
      if (!deleted) return res.status(404).json({ message: "Attachment not found" });
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to delete attachment" });
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
      if (!req.authUser) return res.status(401).json({ message: "not_authenticated" });
      // Personnel can be added either from the Master Data screen
      // (master_personnel.create) or as a quick-add while filing a DPR
      // (site_dprs.create) — a field engineer submitting a DPR needs to be
      // able to add a person on the fly without master-data access.
      const m = req.authPermissions;
      const canViaMaster = req.authUser.isAdmin || !!m?.master_personnel?.create;
      const canViaDpr = req.authUser.isAdmin || !!m?.site_dprs?.create;
      if (!canViaMaster && !canViaDpr) {
        return res.status(403).json({ message: "You don't have permission to add personnel.", error: "forbidden", section: "master_personnel", action: "create" });
      }
      const parsed = insertPersonnelSchema.parse(req.body);
      const existingList = await storage.getPersonnel(true);
      const dup = existingList.find(
        (p) => p.name.trim().toLowerCase() === parsed.name.trim().toLowerCase()
      );
      if (dup) {
        return res.status(409).json({
          message: `${dup.name} already exists as ${dup.role}. Select them from the list instead of adding a duplicate.`,
          existingPersonnel: dup,
        });
      }
      const person = await storage.createPersonnel(parsed);
      res.status(201).json(person);
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ message: "Invalid data", errors: err.errors });
      if (err?.code === "23505") {
        return res.status(409).json({ message: "A person with this name already exists. Please select them from the list instead." });
      }
      res.status(500).json({ message: "Failed to create personnel" });
    }
  });

  app.patch("/api/personnel/:id", async (req, res) => {
    try {
      if (!assertEdit(req, res, "master_personnel")) return;
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
      if (!assertEdit(req, res, "master_personnel")) return;
      const updated = await storage.togglePersonnelActive(Number(req.params.id));
      if (!updated) return res.status(404).json({ message: "Personnel not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to toggle personnel status" });
    }
  });

  app.delete("/api/personnel/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const id = Number(req.params.id);
      const hasHistory = await storage.hasPersonnelUsageHistory(id);
      if (hasHistory) {
        return res.status(409).json({ message: "This personnel record has existing shift-log or DPR entries and cannot be deleted. Use the Deactivate option instead to hide them from active lists." });
      }
      const deleted = await storage.deletePersonnel(id);
      if (!deleted) return res.status(404).json({ message: "Personnel not found" });
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to delete personnel" });
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
        workType: req.query.workType as string | undefined,
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
      sendPushToSection("site_materials", "Site Purchase Updated", `Purchase #${id} updated by admin`, "/site-reports").catch(() => {});
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
      if (!assertCreate(req, res, "admin_settings")) return;
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
      if (!assertEdit(req, res, "dashboard")) return;
      await storage.markNotificationRead(Number(req.params.id));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  app.patch("/api/notifications/read-all", async (req, res) => {
    try {
      if (!assertEdit(req, res, "dashboard")) return;
      await storage.markAllNotificationsRead();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to mark all notifications as read" });
    }
  });

  app.delete("/api/notifications/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
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

  app.post("/api/push/subscribe", requireAuth, async (req, res) => {
    try {
      if (!assertEdit(req, res, "dashboard")) return;
      const user = req.authUser;
      // Only allow subscribe if the admin has enabled notifications for this user.
      if (!user?.notificationsEnabled && !user?.isAdmin) {
        return res.status(403).json({ message: "notifications_disabled", detail: "Push notifications are not enabled for your account. Ask an admin to enable them." });
      }
      const { subscription } = req.body;
      if (!subscription) {
        return res.status(400).json({ message: "Subscription data required" });
      }
      if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
        return res.status(400).json({ message: "Invalid subscription data — missing endpoint or keys" });
      }
      // Role is derived from the authenticated session — cannot be spoofed.
      const role = user?.isAdmin ? "admin" : "manager";
      const sub = await storage.createPushSubscription({
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        label: req.body.label || null,
        role,
        userId: user?.id ?? null,
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
      if (!assertEdit(req, res, "dashboard")) return;
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

  app.get("/api/push/subscriptions", requireAuth, async (req, res) => {
    if (!assertView(req, res, "user_management")) return;
    try {
      const subs = await storage.getAllPushSubscriptions();
      const counts: Record<number, number> = {};
      for (const s of subs) {
        if (s.userId != null) {
          counts[s.userId] = (counts[s.userId] ?? 0) + 1;
        }
      }
      const result = Object.entries(counts).map(([userId, count]) => ({
        userId: Number(userId),
        count,
      }));
      res.json(result);
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
    // Permission System v2: check that the requesting user can access this DPR's site
    const permittedSiteNames = await getPermittedSiteNames(req);
    if (permittedSiteNames !== null && !permittedSiteNames.includes(dpr.site)) {
      return res.status(403).json({ message: 'Access denied for this site' });
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
      if (!assertCreate(req, res, "site_dprs")) return;
      const input = api.dprs.create.input.parse(req.body);
      const dpr = await storage.createDpr(input, input.clientTimestamp);
      await storage.createNotification({ type: "success", title: "New DPR Submitted", message: `${input.engineer || 'Engineer'} submitted DPR for ${input.site} (${input.date})`, isRead: 0 });
      sendPushToSection("site_dprs", "New DPR Submitted", `${input.engineer || 'Engineer'} - ${input.site} - ${input.date}`, "/site-reports").catch(() => {});
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
      const permittedSiteNames = await getPermittedSiteNames(req);
      const dprs = await storage.getDprs(
        permittedSiteNames !== null ? { permittedSiteNames } : undefined
      );
      
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

  // Task #287 — Restore PIN-change endpoints. These were removed in Task #229
  // but AdminSettings.tsx still calls them. Page access is already gated to
  // admins via RBAC, so no currentPin verification is needed here.
  app.post('/api/admin/change-pin', async (req, res) => {
    if (!assertAdmin(req, res)) return;
    const { newPin } = req.body || {};
    if (!newPin || typeof newPin !== 'string' || !/^\d{4}$/.test(newPin)) {
      return res.status(400).json({ message: 'PIN must be exactly 4 digits.' });
    }
    await storage.setSetting('admin_pin', newPin);
    res.json({ ok: true });
  });

  app.post('/api/admin/change-manager-pin', async (req, res) => {
    if (!assertAdmin(req, res)) return;
    const { newPin } = req.body || {};
    if (!newPin || typeof newPin !== 'string' || !/^\d{4}$/.test(newPin)) {
      return res.status(400).json({ message: 'PIN must be exactly 4 digits.' });
    }
    await storage.setSetting('manager_pin', newPin);
    res.json({ ok: true });
  });

  // Task #605 — Configurable "Received By" defaults per LDO tank.
  // GET is available to all authenticated users so the material-issue form can
  // read the configured defaults without requiring an admin role.
  app.get('/api/admin/ldo-received-by', async (req, res) => {
    if (!assertAuthed(req, res)) return;
    const [tank1, tank2] = await Promise.all([
      storage.getSetting('ldo_tank1_received_by'),
      storage.getSetting('ldo_tank2_received_by'),
    ]);
    res.json({ tank1: tank1 ?? null, tank2: tank2 ?? null });
  });

  app.post('/api/admin/ldo-received-by', async (req, res) => {
    if (!assertAdmin(req, res)) return;
    const { tank1, tank2 } = req.body || {};
    if (tank1 !== undefined) {
      if (typeof tank1 !== 'string') return res.status(400).json({ message: 'tank1 must be a string.' });
      await storage.setSetting('ldo_tank1_received_by', tank1.trim());
    }
    if (tank2 !== undefined) {
      if (typeof tank2 !== 'string') return res.status(400).json({ message: 'tank2 must be a string.' });
      await storage.setSetting('ldo_tank2_received_by', tank2.trim());
    }
    res.json({ ok: true });
  });

  // Operator instruction manual — PDF download (admin only)
  app.get('/api/admin/operator-manual.pdf', async (req, res) => {
    if (!assertAdmin(req, res)) return;
    const plantName = typeof req.query.plant === 'string' ? req.query.plant.trim() : undefined;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="plant-operator-guide.pdf"');
    try {
      const _omCfg = await getCompanyConfig();
      await pipeOperatorManualPdf(res, plantName || _omCfg.companyName, _omCfg.logoFile);
    } catch (err) {
      console.error('Operator manual PDF generation failed:', err);
      if (!res.headersSent) res.status(500).json({ message: 'Failed to generate PDF' });
    }
  });

  // Estimator Portal guide — PDF download (estimator admin cookie, not main session).
  // Path is listed in PUBLIC_API_PATHS so requireAuth is bypassed.
  // Role is validated directly from the estimator cookie inside the handler.
  app.get('/api/admin/estimator-guide.pdf', async (req, res) => {
    const cookieVal = parseCookie(req.headers.cookie, ESTIMATOR_COOKIE);
    const role = verifyRoleCookie(cookieVal);
    if (role !== 'admin') {
      return res.status(401).json({ error: 'Estimator admin access required' });
    }
    const plantName = typeof req.query.plant === 'string' ? req.query.plant.trim() : undefined;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="estimator-portal-guide.pdf"');
    try {
      const _egCfg = await getCompanyConfig();
      await pipeEstimatorGuidePdf(res, plantName || _egCfg.companyName, _egCfg.logoFile);
    } catch (err) {
      console.error('Estimator guide PDF generation failed:', err);
      if (!res.headersSent) res.status(500).json({ message: 'Failed to generate PDF' });
    }
  });

  // Admin & Manager guide — PDF download (admin and manager).
  // All authenticated session users are either admin or manager; assertAuthed
  // is the correct gate here — see the role derivation in push subscribe route.
  app.get('/api/admin/admin-guide.pdf', async (req, res) => {
    if (!assertAuthed(req, res)) return;
    const plantName = typeof req.query.plant === 'string' ? req.query.plant.trim() : undefined;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="plant-admin-guide.pdf"');
    try {
      const _agCfg = await getCompanyConfig();
      await pipeAdminGuidePdf(res, plantName || _agCfg.companyName, _agCfg.logoFile);
    } catch (err) {
      console.error('Admin guide PDF generation failed:', err);
      if (!res.headersSent) res.status(500).json({ message: 'Failed to generate PDF' });
    }
  });

  // NOTE (Task #248): The /api/plant-module/alert-thresholds and
  // /api/plant-module/variance-highlight-threshold endpoints were removed
  // along with the underlying admin-tunable alert layer. The Heating Trends
  // report still flags hot-oil and shift-meter mismatch days, but it now
  // uses fixed inline guard rails computed inside getHeatingTrends.


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

      // A new DPR version is a create-shaped action, but it requires edit
      // rights on the parent record too. Gate on edit (the stricter of the
      // two) since revising a DPR is logically an edit.
      if (!assertEdit(req, res, "site_dprs")) return;

      // Permission System v2: check site access BEFORE parsing body so a
      // restricted user cannot probe other sites even with a malformed payload.
      const versionOriginal = await storage.getDpr(originalId);
      if (!versionOriginal) {
        return res.status(404).json({ message: "DPR not found" });
      }
      {
        const permittedSiteNames = await getPermittedSiteNames(req);
        if (permittedSiteNames !== null && !permittedSiteNames.includes(versionOriginal.site)) {
          return res.status(403).json({ message: "Access denied for this site" });
        }
      }

      const input = versionSchema.parse(req.body);
      const editedBy = input.editedBy || "engineer";

      if (editedBy === "engineer") {
        const equipment = Array.isArray(versionOriginal.equipment) ? versionOriginal.equipment : [];
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
      sendPushToSection("site_dprs", "DPR Updated", `${actor} edited DPR for ${input.data.site} (${input.data.date})`, "/site-reports").catch(() => {});

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

      // Permission System v2: check site access before cloning
      const cloneSource = await storage.getDpr(id);
      if (!cloneSource) {
        return res.status(404).json({ message: "Original DPR not found" });
      }
      {
        const permittedSiteNames = await getPermittedSiteNames(req);
        if (permittedSiteNames !== null && !permittedSiteNames.includes(cloneSource.site)) {
          return res.status(403).json({ message: "Access denied for this site" });
        }
      }

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
      sendPushToSection("site_dprs", "DPR Cloned", `${cloned.site} - ${cloned.date}`, "/site-reports").catch(() => {});

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
      sendPushToSection("site_dprs", "DPR Deleted", `${dprToDelete?.site || 'unknown'} - ${dprToDelete?.date || ''}`, "/site-reports").catch(() => {});
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
      if (!assertCreate(req, res, "admin_settings")) return;
      const input = createPlantReportRequestSchema.parse(req.body);
      const report = await storage.createPlantReport(input);
      sendPushToSection("plant_daily_reports", "Plant Report Created", `Plant report for ${input.date}`, "/plant").catch(() => {});
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
      sendPushToSection("plant_daily_reports", "Plant Report Cloned", `Plant report cloned by ${currentUserName(req)}`, "/plant").catch(() => {});
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
      if (!assertEdit(req, res, "admin_settings")) return;
      const id = Number(req.params.id);
      const input = createPlantReportRequestSchema.parse(req.body);
      const updated = await storage.updatePlantReport(id, input);
      if (!updated) {
        return res.status(404).json({ message: "Plant report not found" });
      }
      sendPushToSection("plant_daily_reports", "Plant Report Updated", `Plant report ${id} updated`, "/plant").catch(() => {});
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
      sendPushToSection("plant_daily_reports", "Plant Report Deleted", `Plant report ${id} deleted`, "/plant").catch(() => {});
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
      if (!assertCreate(req, res, "master_parties")) return;
      const party = await storage.createParty(req.body);
      res.status(201).json(party);
    } catch (err) {
      res.status(500).json({ message: "Failed to create party" });
    }
  });

  app.patch("/api/plant-module/parties/:id", async (req, res) => {
    try {
      if (!assertEdit(req, res, "master_parties")) return;
      const party = await storage.updateParty(Number(req.params.id), req.body);
      if (!party) return res.status(404).json({ message: "Party not found" });
      res.json(party);
    } catch (err) {
      res.status(500).json({ message: "Failed to update party" });
    }
  });

  app.delete("/api/plant-module/parties/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
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
      if (!assertCreate(req, res, "master_materials")) return;
      const material = await storage.createPlantMaterial(req.body);
      res.status(201).json(material);
    } catch (err) {
      res.status(500).json({ message: "Failed to create material" });
    }
  });

  app.patch("/api/plant-module/materials/:id", async (req, res) => {
    try {
      if (!assertEdit(req, res, "master_materials")) return;
      const material = await storage.updatePlantMaterial(Number(req.params.id), req.body);
      if (!material) return res.status(404).json({ message: "Material not found" });
      res.json(material);
    } catch (err) {
      res.status(500).json({ message: "Failed to update material" });
    }
  });

  app.delete("/api/plant-module/materials/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
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
      if (!assertCreate(req, res, "master_materials")) return;
      const result = await storage.createMixType(req.body);
      res.status(201).json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to create mix type" });
    }
  });

  app.patch("/api/plant-module/mix-types/:id", async (req, res) => {
    try {
      if (!assertEdit(req, res, "master_materials")) return;
      const result = await storage.updateMixType(Number(req.params.id), req.body);
      if (!result) return res.status(404).json({ message: "Mix type not found" });
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to update mix type" });
    }
  });

  app.delete("/api/plant-module/mix-types/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
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

  // Validate mix template component bounds before persist
  const mixTemplateComponentSchema = z.object({
    materialId: z.number().int().positive(),
    percent: z.number().min(0).max(100).optional(),
    uom: z.string().optional(),
    moistureContent: z.number().min(0).max(30, { message: "Moisture content must be between 0 and 30%" }).optional().default(0),
    wastageFactor: z.number().min(0).max(20, { message: "Wastage factor must be between 0 and 20%" }).optional().default(0),
  });
  const validateComponents = (components: unknown): string | null => {
    if (!Array.isArray(components)) return null;
    for (const c of components) {
      const result = mixTemplateComponentSchema.safeParse(c);
      if (!result.success) return result.error.errors[0]?.message ?? "Invalid component data";
    }
    return null;
  };

  app.post("/api/plant-module/mix-templates", async (req, res) => {
    try {
      if (!assertCreate(req, res, "master_materials")) return;
      const { components, ...template } = req.body;
      const validationError = validateComponents(components);
      if (validationError) return res.status(400).json({ message: validationError });
      const result = await storage.createMixTemplate(template, components);
      res.status(201).json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to create mix template" });
    }
  });

  app.patch("/api/plant-module/mix-templates/:id", async (req, res) => {
    try {
      if (!assertEdit(req, res, "master_materials")) return;
      const { components, ...template } = req.body;
      const validationError = validateComponents(components);
      if (validationError) return res.status(400).json({ message: validationError });
      const result = await storage.updateMixTemplate(Number(req.params.id), template, components);
      if (!result) return res.status(404).json({ message: "Mix template not found" });
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to update mix template" });
    }
  });

  app.delete("/api/plant-module/mix-templates/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const deleted = await storage.deleteMixTemplate(Number(req.params.id));
      if (!deleted) return res.status(404).json({ message: "Mix template not found" });
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to delete mix template" });
    }
  });

  app.post("/api/plant-module/mix-templates/:id/rebuild-ledger", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const templateId = Number(req.params.id);
      const bodySchema = z.object({
        fromDateTime: z.string().regex(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
          "fromDateTime must be in YYYY-MM-DDTHH:MM format"
        ),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid request body" });
      }
      const result = await storage.rebuildDispatchLedgerForTemplate({ templateId, fromDateTime: parsed.data.fromDateTime });
      res.json(result);
    } catch (err) {
      console.error("Error rebuilding dispatch ledger:", err);
      res.status(500).json({ message: "Failed to rebuild dispatch ledger" });
    }
  });

  // Equipment Master
  app.get("/api/plant-module/equipment", async (req, res) => {
    try {
      const includeInactive = req.query.includeInactive === "true";
      const plantNameFilter = req.query.plantName as string | undefined;
      const equipmentList = await storage.getEquipmentMaster(includeInactive, plantNameFilter);
      res.json(equipmentList);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch equipment" });
    }
  });

  app.post("/api/plant-module/equipment", async (req, res) => {
    try {
      if (!assertCreate(req, res, "master_equipment")) return;
      const equipment = await storage.createEquipment(req.body);
      res.status(201).json(equipment);
    } catch (err) {
      res.status(500).json({ message: "Failed to create equipment" });
    }
  });

  app.patch("/api/plant-module/equipment/:id", async (req, res) => {
    try {
      if (!assertEdit(req, res, "master_equipment")) return;
      const equipment = await storage.updateEquipment(Number(req.params.id), req.body);
      if (!equipment) return res.status(404).json({ message: "Equipment not found" });
      res.json(equipment);
    } catch (err) {
      res.status(500).json({ message: "Failed to update equipment" });
    }
  });

  app.delete("/api/plant-module/equipment/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const id = Number(req.params.id);
      const hasHistory = await storage.hasEquipmentUsageHistory(id);
      if (hasHistory) {
        return res.status(409).json({ message: "This equipment has existing usage records and cannot be deleted. Use the Deactivate option instead to hide it from active lists." });
      }
      const deleted = await storage.deleteEquipment(id);
      if (!deleted) return res.status(404).json({ message: "Equipment not found" });
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to delete equipment" });
    }
  });

  app.patch("/api/plant-module/equipment/:id/toggle-active", async (req, res) => {
    try {
      if (!assertEdit(req, res, "master_equipment")) return;
      const id = Number(req.params.id);
      const allEquipment = await storage.getEquipmentMaster(true);
      const equip = allEquipment.find(e => e.id === id);
      if (!equip) return res.status(404).json({ message: "Equipment not found" });
      const newStatus = equip.isActive === 1 ? 0 : 1;
      const updated = await storage.updateEquipment(id, { isActive: newStatus } as any);
      if (!updated) return res.status(404).json({ message: "Equipment not found" });
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
      if (!assertCreate(req, res, "plant_materials")) return;
      const body = { ...req.body };
      if (typeof body.isPlantCommon === 'boolean') {
        body.isPlantCommon = body.isPlantCommon ? 1 : 0;
      }
      const input = insertMaterialReceiptSchema.parse(body);
      const receipt = await storage.createMaterialReceipt(input);
      
      await storage.createNotification({
        type: "info",
        title: "Material Receipt Added",
        message: `New material receipt: ${receipt.quantity} ${receipt.uom} received on ${receipt.date}`,
        isRead: 0,
      });
      sendPushToSection("plant_materials", "Material Receipt", `${receipt.quantity} ${receipt.uom} received on ${receipt.date}`, "/plant").catch(() => {});
      
      res.status(201).json(receipt);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid receipt data", errors: err.errors });
      console.error("Error creating material receipt:", err);
      res.status(500).json({ message: "Failed to create material receipt" });
    }
  });

  app.put("/api/plant-module/material-receipts/:id", async (req, res) => {
    try {
      if (!assertEdit(req, res, "plant_materials")) return;
      const body = { ...req.body };
      if (typeof body.isPlantCommon === 'boolean') {
        body.isPlantCommon = body.isPlantCommon ? 1 : 0;
      }
      const input = insertMaterialReceiptSchema.partial().parse(body);
      const updated = await storage.updateMaterialReceipt(Number(req.params.id), input);
      if (!updated) return res.status(404).json({ message: "Receipt not found" });
      sendPushToSection("plant_materials", "Material Receipt Updated", `Receipt #${req.params.id} updated`, "/plant").catch(() => {});
      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid receipt data", errors: err.errors });
      console.error("Error updating material receipt:", err);
      res.status(500).json({ message: "Failed to update material receipt" });
    }
  });

  app.delete("/api/plant-module/material-receipts/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const deleted = await storage.deleteMaterialReceipt(Number(req.params.id));
      if (!deleted) return res.status(404).json({ message: "Receipt not found" });
      sendPushToSection("plant_materials", "Material Receipt Deleted", `Receipt #${req.params.id} deleted`, "/plant").catch(() => {});
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to delete material receipt" });
    }
  });

  app.get("/api/plant-module/next-receipt-number", async (req, res) => {
    try {
      const materialId = req.query.materialId ? Number(req.query.materialId) : null;
      if (!materialId || isNaN(materialId)) return res.status(400).json({ error: "materialId required" });
      const number = await storage.generateReceiptNoForMaterial(materialId);
      res.json({ number });
    } catch (err) {
      console.error("GET /api/plant-module/next-receipt-number:", err);
      res.status(500).json({ error: "Failed to generate receipt number" });
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
      if (!assertCreate(req, res, "plant_materials")) return;
      const input = insertMaterialIssueSchema.parse(req.body);
      const issue = await storage.createMaterialIssue(input);
      
      await storage.createNotification({
        type: "warning",
        title: "Material Issue",
        message: `Material issued: ${issue.quantity} ${issue.uom} to ${issue.issuedTo} on ${issue.date}`,
        isRead: 0,
      });
      sendPushToSection("plant_materials", "Material Issued", `${issue.quantity} ${issue.uom} to ${issue.issuedTo}`, "/plant").catch(() => {});
      
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
      if (!assertEdit(req, res, "plant_materials")) return;
      const input = insertMaterialIssueSchema.partial().parse(req.body);
      const updated = await storage.updateMaterialIssue(Number(req.params.id), input);
      if (!updated) return res.status(404).json({ message: "Issue not found" });
      sendPushToSection("plant_materials", "Material Issue Updated", `Issue #${req.params.id} updated`, "/plant").catch(() => {});
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
      if (!assertAdmin(req, res)) return;
      const deleted = await storage.deleteMaterialIssue(Number(req.params.id));
      if (!deleted) return res.status(404).json({ message: "Issue not found" });
      sendPushToSection("plant_materials", "Material Issue Deleted", `Issue #${req.params.id} deleted`, "/plant").catch(() => {});
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
      if (!assertCreate(req, res, "plant_materials")) return;
      const input = insertMaterialReturnSchema.parse(req.body);
      const result = await storage.createMaterialReturn(input);

      await storage.createNotification({
        type: "info",
        title: "Material Returned",
        message: `Material returned: ${result.quantity} ${result.uom} from issue #${result.originalIssueId} on ${result.date}`,
        isRead: 0,
      });
      sendPushToSection("plant_materials", "Material Returned", `${result.quantity} ${result.uom} returned on ${result.date}`, "/plant/material-returns").catch(() => {});

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
      if (!assertEdit(req, res, "plant_materials")) return;
      const input = insertMaterialReturnSchema.partial().parse(req.body);
      const updated = await storage.updateMaterialReturn(Number(req.params.id), input);
      if (!updated) return res.status(404).json({ message: "Return not found" });
      sendPushToSection("plant_materials", "Material Return Updated", `Return #${req.params.id} updated`, "/plant/material-returns").catch(() => {});
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
      if (!assertAdmin(req, res)) return;
      const deleted = await storage.deleteMaterialReturn(Number(req.params.id));
      if (!deleted) return res.status(404).json({ message: "Return not found" });
      sendPushToSection("plant_materials", "Material Return Deleted", `Return #${req.params.id} deleted`, "/plant/material-returns").catch(() => {});
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
      if (!assertCreate(req, res, "plant_stock")) return;
      const input = insertMaterialOpeningStockSchema.parse(req.body);
      const stock = await storage.createMaterialOpeningStock(input);
      sendPushToSection("plant_stock", "Opening Stock Set", `Opening stock entry created`, "/plant").catch(() => {});
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
      if (!assertEdit(req, res, "plant_stock")) return;
      const input = insertMaterialOpeningStockSchema.partial().parse(req.body);
      const updated = await storage.updateMaterialOpeningStock(Number(req.params.id), input);
      if (!updated) return res.status(404).json({ message: "Opening stock not found" });
      sendPushToSection("plant_stock", "Opening Stock Updated", `Opening stock #${req.params.id} updated`, "/plant").catch(() => {});
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
      if (!assertAdmin(req, res)) return;
      const deleted = await storage.deleteMaterialOpeningStock(Number(req.params.id));
      if (!deleted) return res.status(404).json({ message: "Opening stock not found" });
      sendPushToSection("plant_stock", "Opening Stock Deleted", `Opening stock #${req.params.id} deleted`, "/plant").catch(() => {});
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
      if (!assertCreate(req, res, "plant_production")) return;
      const result = await storage.createTruckDispatchWithStockDeduction(req.body);
      const dispatch = result.dispatch;
      await storage.createNotification({
        type: "success",
        title: "Mix Dispatched",
        message: `Truck dispatch: ${dispatch.loadWeight} MT dispatched on ${dispatch.date}`,
        isRead: 0,
      });
      sendPushToSection("plant_production", "Dispatch Recorded", `${dispatch.loadWeight} MT dispatched on ${dispatch.date}`, "/plant").catch(() => {});

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
      if (!assertEdit(req, res, "plant_production")) return;
      const id = parseInt(req.params.id);
      const { adjustedBy, overrideTolerance, ...dispatchData } = req.body;
      
      // Server-side tolerance validation for actual consumption values.
      //
      // Bug fix: the frontend always sends the field (even when empty), so
      // the value arrives as `null`, not `undefined`. The original guard used
      // `!== undefined`, which evaluated `true` for null and triggered the
      // check — computing ((null - theoretical) / theoretical) * 100 = -100%,
      // which always exceeded the ±10% band and blocked the save.
      //
      // Fix: use `!= null` (loose equality) so both `null` and `undefined`
      // correctly skip the tolerance block when no actual value was entered.
      const TOLERANCE_PERCENT = 10;
      // Admin/manager override: if the client sends overrideTolerance=true and
      // the authenticated user is an admin, skip the tolerance block entirely
      // and annotate the record so the deviation is auditable.
      const isAdminOverride = overrideTolerance === true && req.authUser?.isAdmin;
      if (overrideTolerance === true && !req.authUser?.isAdmin) {
        return res.status(403).json({ message: "Only admins can override the tolerance limit." });
      }

      // Fetch the current dispatch once — used both for tolerance validation
      // and for preserving existing shortageWarning data when logging an override.
      const allDispatches = await storage.getTruckDispatches({});
      const currentDispatch = allDispatches.find(d => d.id === id);
      const templates = await storage.getMixTemplates();

      if (!isAdminOverride && (dispatchData.actualBitumenPercent != null || dispatchData.actualLdoQty != null)) {
        if (currentDispatch) {
          // Prefer the incoming mixTemplateId so an edit that simultaneously
          // changes the template is validated against the NEW template's
          // theoretical values, not the old saved one.
          const templateId = dispatchData.mixTemplateId ?? currentDispatch.mixTemplateId;
          const template = templates.find(t => t.id === templateId);
          if (template) {
            const loadWeight = dispatchData.loadWeight ?? currentDispatch.loadWeight;
            const theoreticalBitumenPercent = template.bitumenPercent || 0;
            const theoreticalLdoQty = loadWeight * (template.ldoNorm || 6);

            // Validate bitumen % — guard against divide-by-zero on zero theoretical
            if (dispatchData.actualBitumenPercent != null && theoreticalBitumenPercent > 0) {
              const bitumenVariance = ((dispatchData.actualBitumenPercent - theoreticalBitumenPercent) / theoreticalBitumenPercent) * 100;
              if (Math.abs(bitumenVariance) > TOLERANCE_PERCENT) {
                return res.status(400).json({
                  message: `Bitumen variance (${bitumenVariance.toFixed(1)}%) exceeds ±${TOLERANCE_PERCENT}% tolerance. Please contact admin.`,
                });
              }
            }

            // Validate LDO qty — guard against divide-by-zero on zero theoretical
            if (dispatchData.actualLdoQty != null && theoreticalLdoQty > 0) {
              const ldoVariance = ((dispatchData.actualLdoQty - theoreticalLdoQty) / theoreticalLdoQty) * 100;
              if (Math.abs(ldoVariance) > TOLERANCE_PERCENT) {
                return res.status(400).json({
                  message: `LDO variance (${ldoVariance.toFixed(1)}%) exceeds ±${TOLERANCE_PERCENT}% tolerance. Please contact admin.`,
                });
              }
            }
          }
        }
      }

      // When an admin overrides the tolerance, stamp an audit note into
      // shortageWarning so the out-of-tolerance save is always traceable.
      // IMPORTANT: always read existing shortageWarning from the persisted
      // dispatch record, NOT from the incoming client payload (which does not
      // carry shortageWarning), so existing shortage metadata is preserved.
      //
      // Only write the audit entry when at least one submitted value actually
      // exceeds the tolerance band — prevents misleading entries when the flag
      // is sent via direct API with in-tolerance values.
      if (isAdminOverride && currentDispatch) {
        const templateId = dispatchData.mixTemplateId ?? currentDispatch.mixTemplateId;
        const template = templates.find(t => t.id === templateId);
        const loadWeight = dispatchData.loadWeight ?? currentDispatch.loadWeight;
        const overrideNote: Record<string, unknown> = {
          type: "tolerance_override",
          overriddenBy: req.authUser?.email ?? "admin",
          overriddenAt: new Date().toISOString(),
        };
        let actuallyOutOfTolerance = false;
        if (template) {
          const theoreticalBitumenPercent = template.bitumenPercent || 0;
          const theoreticalLdoQty = loadWeight * (template.ldoNorm || 6);
          if (dispatchData.actualBitumenPercent != null && theoreticalBitumenPercent > 0) {
            const bv = ((dispatchData.actualBitumenPercent - theoreticalBitumenPercent) / theoreticalBitumenPercent) * 100;
            overrideNote.bitumenActual = dispatchData.actualBitumenPercent;
            overrideNote.bitumenTheoretical = theoreticalBitumenPercent;
            overrideNote.bitumenVariancePct = Number(bv.toFixed(2));
            if (Math.abs(bv) > TOLERANCE_PERCENT) actuallyOutOfTolerance = true;
          }
          if (dispatchData.actualLdoQty != null && theoreticalLdoQty > 0) {
            const lv = ((dispatchData.actualLdoQty - theoreticalLdoQty) / theoreticalLdoQty) * 100;
            overrideNote.ldoActual = dispatchData.actualLdoQty;
            overrideNote.ldoTheoretical = theoreticalLdoQty;
            overrideNote.ldoVariancePct = Number(lv.toFixed(2));
            if (Math.abs(lv) > TOLERANCE_PERCENT) actuallyOutOfTolerance = true;
          }
        }
        if (actuallyOutOfTolerance) {
          const existingWarning: unknown[] = (() => {
            try { return JSON.parse(currentDispatch.shortageWarning || "[]"); } catch { return []; }
          })();
          existingWarning.push(overrideNote);
          dispatchData.shortageWarning = JSON.stringify(existingWarning);
        }
      }

      const updated = await storage.updateTruckDispatch(id, dispatchData, adjustedBy || "operator");
      if (!updated) {
        return res.status(404).json({ message: "Dispatch not found" });
      }
      sendPushToSection("plant_production", "Dispatch Updated", `Dispatch #${id} updated`, "/plant").catch(() => {});
      res.json(updated);
    } catch (err) {
      console.error("Update dispatch error:", err);
      res.status(500).json({ message: "Failed to update dispatch" });
    }
  });

  app.delete("/api/plant-module/dispatches/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteTruckDispatch(id);
      if (!deleted) {
        return res.status(404).json({ message: "Dispatch not found" });
      }
      sendPushToSection("plant_production", "Dispatch Deleted", `Dispatch #${id} deleted`, "/plant").catch(() => {});
      res.status(204).send();
    } catch (err) {
      console.error("Delete dispatch error:", err);
      res.status(500).json({ message: "Failed to delete dispatch" });
    }
  });

  // Recalculate all dispatch consumption from mix templates
  app.post("/api/plant-module/dispatches/recalculate-all", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
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
      if (!assertView(req, res, "plant_variance")) return;
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
      if (!assertView(req, res, "plant_audit")) return;
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
      if (!assertCreate(req, res, "plant_equipment")) return;
      const usage = await storage.createEquipmentUsage(req.body);
      const eqName = req.body.equipmentName || `Equipment #${req.body.equipmentId}`;
      sendPushToSection("plant_equipment", "Equipment Entry", `${eqName} - Opening: ${req.body.openingReading ?? 'N/A'}`, "/plant/equipment-usage").catch(() => {});
      res.status(201).json(usage);
    } catch (err) {
      res.status(500).json({ message: "Failed to create equipment usage" });
    }
  });

  app.put("/api/plant-module/equipment-usage/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (!assertEdit(req, res, "plant_equipment")) return;
      const updated = await storage.updateEquipmentUsage(id, req.body);
      if (!updated) {
        return res.status(404).json({ message: "Equipment usage not found" });
      }
      const eqName = req.body.equipmentName || `Equipment #${req.body.equipmentId || id}`;
      sendPushToSection("plant_equipment", "Equipment Updated", `${eqName} - Closing: ${req.body.closingReading ?? 'N/A'}`, "/plant/equipment-usage").catch(() => {});
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
      sendPushToSection("plant_equipment", "Equipment Entry Deleted", `Equipment usage #${id} deleted`, "/plant/equipment-usage").catch(() => {});
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
      if (!assertCreate(req, res, "plant_equipment")) return;
      const log = await storage.createGeneratorLog(req.body);
      sendPushToSection("plant_generator_logs", "Generator Log Added", `Generator log for ${req.body.date || 'today'}`, "/plant").catch(() => {});
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
      if (!assertCreate(req, res, "plant_equipment")) return;
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
      if (!assertAdmin(req, res)) return;
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
      if (!assertAdmin(req, res)) return;
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
      if (!assertAdmin(req, res)) return;
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
  // Auth: session-role check via assertAdmin (no legacy PIN field).
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

  // Create a forward inter-party stock transfer (e.g. returning borrowed material to HLC).
  // Accessible to any user with plant_stock create permission (includes managers).
  const stockTransferSchema = z.object({
    materialId: z.number().int().positive(),
    fromPartyId: z.number().int().positive(),
    toPartyId: z.number().int().positive(),
    quantity: z.number().positive(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
    notes: z.string().optional(),
  }).refine((d) => d.fromPartyId !== d.toPartyId, {
    message: "From and To parties must differ",
    path: ["toPartyId"],
  });

  app.post("/api/plant-module/stock-transfer", async (req, res) => {
    try {
      if (!assertCreate(req, res, "plant_stock")) return;
      const parsed = stockTransferSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid request" });
      }
      const { materialId, fromPartyId, toPartyId, quantity, date, notes } = parsed.data;
      const actorName = currentUserName(req);
      const result = await storage.createStockTransfer({
        materialId,
        fromPartyId,
        toPartyId,
        quantity,
        date,
        notes,
        actorName: actorName.trim() || undefined,
      });
      console.info(
        `[StockTransfer] actor="${actorName.trim()}" materialId=${materialId} ` +
        `from=${fromPartyId} to=${toPartyId} qty=${quantity} date=${date} ` +
        `at=${new Date().toISOString()}`
      );
      res.json({
        message: "Stock transfer recorded and balances updated",
        outEntry: result.outEntry,
        inEntry: result.inEntry,
        reconciled: result.reconciled,
      });
    } catch (err: any) {
      console.error("Stock transfer error:", err);
      res.status(500).json({ message: err.message || "Failed to create stock transfer" });
    }
  });

  // Admin: rewrite the historical `balance_after` column for a given material,
  // chronologically per (party, material). Used to clean up displays after
  // legacy data moves. Auth: session-role check via assertAdmin (no legacy PIN field).
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
      const [batches, dupActivity, aliasActivity] = await Promise.all([
        storage.getRecentShiftLogManpowerRelabelBatches(30),
        storage.getRecentShiftLogManpowerDupActivity(30),
        storage.getRecentShiftLogManpowerAliasActivity(30),
      ]);
      res.json({ merges: batches, dupActivity, aliasActivity });
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
      // Audit write is best-effort: only log when the row was newly inserted
      // (no-op on already-saved pairs so the activity feed mirrors real state
      // changes). Snapshot the storage-side normalized tokens so a revert can
      // round-trip them through delete/add cleanly.
      if (result.added && result.alias) {
        try {
          await storage.addShiftLogManpowerAliasActivity({
            actor: actor.trim(),
            action: "add",
            kind: k,
            tokenA: result.alias.tokenA,
            tokenB: result.alias.tokenB,
          });
        } catch (auditErr) {
          console.error("shift-log-manpower add-custom-alias audit write failed:", auditErr);
        }
      }
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
      // Audit write is best-effort: only log when a row was actually deleted.
      // Snapshot the (tokenA, tokenB, kind) tuple from the deleted row so the
      // revert button can re-add the exact same entry even after this audit
      // row is the only remaining trace of it.
      if (result.removed && result.tokenA && result.tokenB && result.kind) {
        const k =
          result.kind === "suppress_learned" ? "suppress_learned"
          : result.kind === "suppress_learned_pair" ? "suppress_learned_pair"
          : "alias";
        try {
          await storage.addShiftLogManpowerAliasActivity({
            actor: actor.trim(),
            action: "remove",
            kind: k,
            tokenA: result.tokenA,
            tokenB: result.tokenB,
          });
        } catch (auditErr) {
          console.error("shift-log-manpower delete-custom-alias audit write failed:", auditErr);
        }
      }
      res.json({ removed: result.removed });
    } catch (err) {
      console.error("shift-log-manpower delete-custom-alias error:", err);
      const msg = err instanceof Error ? err.message : "Failed to delete custom alias";
      res.status(400).json({ message: msg });
    }
  });

  // Admin: bulk-revert multiple alias-activity entries in one round-trip.
  // Accepts an array of activity objects; for each "add" entry the alias is
  // deleted, for each "remove" entry the alias is re-added.  One audit row is
  // written per successfully-reverted entry.
  app.post("/api/plant-module/shift-log-manpower/bulk-revert-alias-activity", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const { activities } = req.body || {};
      const actor = currentUserName(req);
      if (!Array.isArray(activities) || activities.length === 0) {
        return res.status(400).json({ message: "activities[] is required and must be non-empty" });
      }
      const valid = activities
        .filter((a: unknown) => {
          if (!a || typeof a !== "object") return false;
          const obj = a as Record<string, unknown>;
          return (
            (obj.action === "add" || obj.action === "remove") &&
            (obj.kind === "alias" || obj.kind === "suppress_learned" || obj.kind === "suppress_learned_pair") &&
            typeof obj.tokenA === "string" && obj.tokenA.trim().length > 0 &&
            typeof obj.tokenB === "string" && obj.tokenB.trim().length > 0
          );
        })
        .map((a: unknown) => {
          const obj = a as Record<string, unknown>;
          return {
            action: obj.action as "add" | "remove",
            kind: obj.kind as "alias" | "suppress_learned" | "suppress_learned_pair",
            tokenA: String(obj.tokenA).trim(),
            tokenB: String(obj.tokenB).trim(),
          };
        });
      if (valid.length === 0) {
        return res.status(400).json({ message: "No valid activity entries in activities[]" });
      }
      const result = await storage.bulkRevertShiftLogManpowerAliasActivities({ actor: actor.trim(), activities: valid });
      console.info(
        `[ShiftLogManpowerCustomAlias] actor="${actor.trim()}" role=admin ` +
        `at=${new Date().toISOString()} bulk-revert reverted=${result.reverted} skipped=${result.skipped}`
      );
      res.json(result);
    } catch (err) {
      console.error("shift-log-manpower bulk-revert-alias-activity error:", err);
      const msg = err instanceof Error ? err.message : "Failed to bulk-revert alias activities";
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

  // Per-tank bitumen balance — returns { tank1: MT, tank2: MT }
  app.get("/api/plant-module/bitumen-tank-balances", async (req, res) => {
    try {
      const partyId = req.query.partyId !== undefined ? Number(req.query.partyId) : undefined;
      const result = await storage.getBitumenTankBalances(partyId ?? null);
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch bitumen tank balances" });
    }
  });

  // Party Supply Obligation Statement
  app.get("/api/plant-module/party-statement", requireAuth, async (req, res) => {
    try {
      const partyId = Number(req.query.partyId);
      const materialId = Number(req.query.materialId);
      if (!partyId || !materialId) return res.status(400).json({ message: "partyId and materialId are required" });
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const result = await storage.getPartyStatement(partyId, materialId, dateFrom, dateTo);
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to generate party statement" });
    }
  });

  // HLC Borrow Reconciliation — admin only
  app.get("/api/plant-module/hlc-borrow-reconciliation", requireAuth, async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const partyId = Number(req.query.partyId);
      const materialId = Number(req.query.materialId);
      if (!partyId || !materialId) return res.status(400).json({ message: "partyId and materialId are required" });
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const result = await storage.getHlcBorrowReconciliation(partyId, materialId, dateFrom, dateTo);
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to generate HLC borrow reconciliation" });
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
      if (!assertView(req, res, "plant_bitumen")) return;
      const filters = {
        tankNumber: req.query.tankNumber ? parseInt(req.query.tankNumber as string) : undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        readingType: req.query.readingType as string | undefined,
        plantName: req.query.plantName as string | undefined,
      };
      const readings = await storage.getBitumenDipReadings(filters);
      res.json(readings);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch bitumen dip readings" });
    }
  });

  app.post("/api/plant-module/bitumen-dip-readings", async (req, res) => {
    try {
      if (!assertCreate(req, res, "plant_bitumen")) return;
      const parsed = insertBitumenDipReadingSchema.parse(req.body);
      const reading = await storage.createBitumenDipReading(parsed);
      sendPushToSection("plant_bitumen", "Bitumen Dip Reading", `Tank ${parsed.tankNumber} - ${parsed.depthCm}cm`, "/plant/bitumen-stock").catch(() => {});
      res.status(201).json(reading);
    } catch (err: any) {
      if (err?.code === "DUPLICATE_BITUMEN_DIP" || err?.constraint === "bitumen_dip_readings_date_tank_type_plant_uq") {
        return res.status(409).json({ message: err.message || "A reading for this date, tank, and type already exists. Please edit the existing entry instead." });
      }
      res.status(400).json({ message: err.message || "Failed to create bitumen dip reading" });
    }
  });

  app.patch("/api/plant-module/bitumen-dip-readings/:id", async (req, res) => {
    try {
      if (!assertEdit(req, res, "plant_bitumen")) return;
      const id = parseInt(req.params.id);
      const result = await storage.updateBitumenDipReading(id, req.body);
      if (!result) return res.status(404).json({ message: "Reading not found" });
      sendPushToSection("plant_bitumen", "Bitumen Dip Updated", `Tank ${req.body.tankNumber || ''} reading updated`, "/plant/bitumen-stock").catch(() => {});
      res.json(result);
    } catch (err: any) {
      if (err?.code === "DUPLICATE_BITUMEN_DIP" || err?.constraint === "bitumen_dip_readings_date_tank_type_plant_uq" || err?.message?.includes("bitumen_dip_readings_date_tank_type_plant_uq")) {
        return res.status(409).json({ message: err.message || "A reading for this date, tank, and type already exists. Please edit the existing entry instead." });
      }
      res.status(400).json({ message: err.message || "Failed to update bitumen dip reading" });
    }
  });

  app.delete("/api/plant-module/bitumen-dip-readings/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteBitumenDipReading(id);
      if (!deleted) return res.status(404).json({ message: "Reading not found" });
      sendPushToSection("plant_bitumen", "Bitumen Dip Deleted", `Bitumen dip reading #${id} deleted`, "/plant/bitumen-stock").catch(() => {});
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
      if (!assertView(req, res, "plant_ldo")) return;
      const filters = {
        tankNumber: req.query.tankNumber ? parseInt(req.query.tankNumber as string) : undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        readingType: req.query.readingType as string | undefined,
        plantName: req.query.plantName as string | undefined,
      };
      const readings = await storage.getLdoFlowReadings(filters);
      res.json(readings);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch LDO flow readings" });
    }
  });

  const ldoFlowReadingCreateSchema = insertLdoFlowReadingSchema.extend({
    dryerFedFrom: z.enum(["TANK_1", "TANK_2"]).nullable().optional(),
  });
  type LdoFlowReadingCreate = Omit<z.infer<typeof ldoFlowReadingCreateSchema>, "dryerFedFrom"> & {
    dryerFedFrom?: string | null;
  };

  app.post("/api/plant-module/ldo-flow-readings", async (req, res) => {
    try {
      if (!assertCreate(req, res, "plant_ldo")) return;
      const parsed: LdoFlowReadingCreate = ldoFlowReadingCreateSchema.parse(req.body);
      const reading = await storage.createLdoFlowReading(parsed);
      sendPushToSection("plant_ldo", "LDO Flow Reading", `Meter: ${parsed.meterReading || 'N/A'}`, "/plant/ldo-flow-meter").catch(() => {});
      res.status(201).json(reading);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to create LDO flow reading" });
    }
  });

  const ldoFlowReadingPatchSchema = insertLdoFlowReadingSchema.partial().extend({
    dryerFedFrom: z.enum(["TANK_1", "TANK_2"]).nullable().optional(),
  });
  type LdoFlowReadingPatch = Omit<z.infer<typeof ldoFlowReadingPatchSchema>, "dryerFedFrom"> & {
    dryerFedFrom?: string | null;
  };

  app.patch("/api/plant-module/ldo-flow-readings/:id", async (req, res) => {
    try {
      if (!assertEdit(req, res, "plant_ldo")) return;
      const id = parseInt(req.params.id);
      const parsed: LdoFlowReadingPatch = ldoFlowReadingPatchSchema.parse(req.body);
      const result = await storage.updateLdoFlowReading(id, parsed);
      if (!result) return res.status(404).json({ message: "Reading not found" });
      sendPushToSection("plant_ldo", "LDO Flow Updated", `LDO flow reading #${id} updated`, "/plant/ldo-flow-meter").catch(() => {});
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to update LDO flow reading" });
    }
  });

  app.delete("/api/plant-module/ldo-flow-readings/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteLdoFlowReading(id);
      if (!deleted) return res.status(404).json({ message: "Reading not found" });
      sendPushToSection("plant_ldo", "LDO Flow Deleted", `LDO flow reading #${id} deleted`, "/plant/ldo-flow-meter").catch(() => {});
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete LDO flow reading" });
    }
  });

  // Orphaned LDO flow readings — rows that reference a deleted heating session
  app.get("/api/plant-module/ldo-orphaned-rows", async (req, res) => {
    try {
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const plant = req.query.plant as string | undefined;
      const rows = await storage.getOrphanedLdoFlowRows({ dateFrom, dateTo, plant });
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch orphaned LDO rows" });
    }
  });

  app.delete("/api/plant-module/ldo-orphaned-rows", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const plant = req.query.plant as string | undefined;
      const result = await storage.deleteOrphanedLdoFlowRows({ dateFrom, dateTo, plant });
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to delete orphaned LDO rows" });
    }
  });

  // ============================================
  // LDO FLOW METER BACKFILL (admin-only)
  // Lets an admin enter historical Tank-1/Tank-2 opening + closing meters
  // for past dates so Daily Plant Reports can compute LDO L/MT, stocks and
  // reconciliation off real numbers. Idempotent: re-saving the same date/
  // tank replaces the prior backfill row, never the shift-log/heating row.
  // ============================================

  const ldoBackfillGetSchema = z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD"),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to must be YYYY-MM-DD"),
    plant: z.string().trim().min(1).optional(),
  });

  // Rows may have both opening and closing as null — that's a valid "clear
  // any existing backfill cells for this (date, plant, tank)" instruction
  // (the storage layer will delete and not re-insert).
  const ldoBackfillRowSchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
    plant: z.string().trim().min(1),
    tank: z.union([z.literal(1), z.literal(2)]),
    opening: z.union([z.number().finite().nonnegative(), z.null()]).optional(),
    closing: z.union([z.number().finite().nonnegative(), z.null()]).optional(),
    remarks: z.union([z.string(), z.null()]).optional().transform(v => (v && v.trim()) ? v.trim() : null),
    dryerFedFrom: z.enum(["TANK_1", "TANK_2"]).optional(),
  });

  const ldoBackfillPostSchema = z.object({
    plant: z.string().trim().min(1),
    rows: z.array(ldoBackfillRowSchema).min(1),
  });

  app.get("/api/plant-module/ldo-backfill", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const parsed = ldoBackfillGetSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues.map(i => i.message).join("; ") });
      }
      const { from, to, plant } = parsed.data;
      const rows = await storage.getLdoFlowReadingsForBackfill({ dateFrom: from, dateTo: to, plant });
      res.json(rows);
    } catch (err) {
      console.error("Failed to load LDO backfill data", err);
      res.status(500).json({ message: "Failed to load LDO backfill data" });
    }
  });

  app.post("/api/plant-module/ldo-backfill", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const actor = currentUserName(req);
      const parsed = ldoBackfillPostSchema.safeParse(req.body);
      if (!parsed.success) {
        console.warn(
          `[LdoBackfill] actor="${actor.trim()}" rejected reason="invalid payload" ` +
          `issues="${parsed.error.issues.map(i => `${i.path.join(".")}:${i.message}`).join("|")}"`
        );
        return res.status(400).json({ message: parsed.error.issues.map(i => i.message).join("; ") });
      }
      // Normalize: force per-row plant to the request-level plant so saves
      // are scoped consistently (UI sends a single plant per save anyway).
      const rows = parsed.data.rows.map(r => ({ ...r, plant: parsed.data.plant }));
      const result = await storage.upsertLdoFlowReadingsBackfill(rows, actor);
      const dates = rows.map(r => r.date).sort();
      const range = dates.length ? `${dates[0]}..${dates[dates.length - 1]}` : "n/a";
      console.info(
        `[LdoBackfill] actor="${actor.trim()}" role=admin plant="${parsed.data.plant}" ` +
        `at=${new Date().toISOString()} range=${range} requested=${rows.length} ` +
        `inserted=${result.inserted} deleted=${result.deleted} skipped=${result.skipped} ` +
        `conflicts=${result.conflicts.length}`
      );
      res.json({ message: "LDO backfill saved", actor, plant: parsed.data.plant, ...result });
    } catch (err: any) {
      console.error("Failed to save LDO backfill", err);
      res.status(500).json({ message: err?.message || "Failed to save LDO backfill" });
    }
  });

  // ============================================
  // LDO DIP READINGS
  // ============================================

  app.get("/api/plant-module/ldo-dip-readings", async (req, res) => {
    try {
      if (!assertView(req, res, "plant_ldo")) return;
      const filters = {
        tankNumber: req.query.tankNumber ? parseInt(req.query.tankNumber as string) : undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        readingType: req.query.readingType as string | undefined,
        plant: req.query.plant as string | undefined,
      };
      const readings = await storage.getLdoDipReadings(filters);
      res.json(readings);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch LDO dip readings" });
    }
  });

  app.post("/api/plant-module/ldo-dip-readings", async (req, res) => {
    try {
      if (!assertCreate(req, res, "plant_ldo")) return;
      const parsed = insertLdoDipReadingSchema.parse(req.body);
      const reading = await storage.createLdoDipReading(parsed);
      sendPushToSection("plant_ldo", "LDO Dip Reading", `Tank ${parsed.tankNumber} - ${parsed.depthCm}cm`, "/plant/ldo-flow-meter").catch(() => {});
      res.status(201).json(reading);
    } catch (err: any) {
      if (err?.code === "DUPLICATE_LDO_DIP" || err?.constraint === "ldo_dip_readings_date_tank_type_plant_uq") {
        return res.status(409).json({ message: err.message || "A dip reading for this tank, date, and type already exists." });
      }
      res.status(400).json({ message: err.message || "Failed to create LDO dip reading" });
    }
  });

  app.patch("/api/plant-module/ldo-dip-readings/:id", async (req, res) => {
    try {
      if (!assertEdit(req, res, "plant_ldo")) return;
      const id = parseInt(req.params.id);
      const result = await storage.updateLdoDipReading(id, req.body);
      if (!result) return res.status(404).json({ message: "Reading not found" });
      sendPushToSection("plant_ldo", "LDO Dip Updated", `LDO dip reading #${id} updated`, "/plant/ldo-flow-meter").catch(() => {});
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to update LDO dip reading" });
    }
  });

  app.delete("/api/plant-module/ldo-dip-readings/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteLdoDipReading(id);
      if (!deleted) return res.status(404).json({ message: "Reading not found" });
      sendPushToSection("plant_ldo", "LDO Dip Deleted", `LDO dip reading #${id} deleted`, "/plant/ldo-flow-meter").catch(() => {});
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete LDO dip reading" });
    }
  });

  // ============================================
  // LDO DIP BACKFILL (admin-only)
  // Lets an admin enter historical Tank-1/Tank-2 dip-stick readings
  // for past dates so stock reconciliation (book vs physical) is complete
  // for the same range covered by the LDO meter backfill.
  // Idempotent: re-saving the same date/tank replaces the prior backfill row,
  // never an operator-entered manual row.
  // ============================================

  // openingDepth/closingDepth are optional: absent = leave that reading type
  // unchanged; null = explicitly delete; number = upsert with new value.
  const ldoDipBackfillRowSchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
    plant: z.string().trim().min(1),
    tank: z.union([z.literal(1), z.literal(2)]),
    // Optional: absent means "no change for this reading type"; null means "delete this reading type"
    openingDepth: z.union([z.number().finite().nonnegative(), z.null()]).optional(),
    closingDepth: z.union([z.number().finite().nonnegative(), z.null()]).optional(),
    remarks: z.union([z.string(), z.null()]).optional().transform(v => (v && v.trim()) ? v.trim() : null),
  });

  const ldoDipBackfillPostSchema = z.object({
    plant: z.string().trim().min(1),
    rows: z.array(ldoDipBackfillRowSchema).min(1),
  });

  app.post("/api/admin/backfill-dispatch-notes", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const actor = currentUserName(req);
      const result = await storage.backfillDispatchNotes();
      console.info(
        `[backfillDispatchNotes] actor="${actor.trim()}" at=${new Date().toISOString()} ` +
        `updated=${result.updated} skipped=${result.skipped} errors=${result.errors}`
      );
      res.json({ message: "Dispatch notes backfill complete", ...result });
    } catch (err: any) {
      console.error("Failed to backfill dispatch notes", err);
      res.status(500).json({ message: err?.message || "Failed to backfill dispatch notes" });
    }
  });

  app.get("/api/plant-module/ldo-dip-backfill", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const parsed = ldoBackfillGetSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues.map(i => i.message).join("; ") });
      }
      const { from, to, plant } = parsed.data;
      const rows = await storage.getLdoDipReadingsForBackfill({ dateFrom: from, dateTo: to, plant });
      res.json(rows);
    } catch (err) {
      console.error("Failed to load LDO dip backfill data", err);
      res.status(500).json({ message: "Failed to load LDO dip backfill data" });
    }
  });

  app.post("/api/plant-module/ldo-dip-backfill", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const actor = currentUserName(req);
      const parsed = ldoDipBackfillPostSchema.safeParse(req.body);
      if (!parsed.success) {
        console.warn(
          `[LdoDipBackfill] actor="${actor.trim()}" rejected reason="invalid payload" ` +
          `issues="${parsed.error.issues.map(i => `${i.path.join(".")}:${i.message}`).join("|")}"`
        );
        return res.status(400).json({ message: parsed.error.issues.map(i => i.message).join("; ") });
      }
      // Normalize: force per-row plant to the request-level plant so saves
      // are scoped consistently (UI sends a single plant per save anyway).
      const rows = parsed.data.rows.map(r => ({ ...r, plant: parsed.data.plant }));
      const result = await storage.upsertLdoDipReadingsBackfill(rows, actor);
      const dates = rows.map(r => r.date).sort();
      const range = dates.length ? `${dates[0]}..${dates[dates.length - 1]}` : "n/a";
      console.info(
        `[LdoDipBackfill] actor="${actor.trim()}" role=admin plant="${parsed.data.plant}" ` +
        `at=${new Date().toISOString()} range=${range} requested=${rows.length} ` +
        `inserted=${result.inserted} deleted=${result.deleted} skipped=${result.skipped} ` +
        `conflicts=${result.conflicts.length}`
      );
      res.json({ message: "LDO dip backfill saved", actor, plant: parsed.data.plant, ...result });
    } catch (err: any) {
      console.error("Failed to save LDO dip backfill", err);
      res.status(500).json({ message: err?.message || "Failed to save LDO dip backfill" });
    }
  });

  // ============================================
  // LDO BOOK-VS-PHYSICAL RECONCILIATION REPORT
  // Returns per-day rows comparing book stock (meter-based) to physical
  // stock (dip-stick based) for a given plant and date range.
  // Accessible to any authenticated user with plant_stock view rights.
  // ============================================

  // LDO Contractor Consumption Report — theoretical norm-based LDO per contractor
  app.get("/api/plant-module/ldo-reports/contractor", async (req, res) => {
    try {
      if (!assertView(req, res, "plant_stock")) return;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const data = await storage.getLdoContractorConsumption({ dateFrom, dateTo });
      res.json(data);
    } catch (e) {
      console.error("/api/plant-module/ldo-reports/contractor error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/plant-module/ldo-reconciliation", async (req, res) => {
    try {
      if (!assertView(req, res, "plant_stock")) return;
      const dateFrom = (req.query.dateFrom as string | undefined) || "";
      const dateTo = (req.query.dateTo as string | undefined) || "";
      const plant = (req.query.plant as string | undefined) || "Main Plant";

      if (!dateFrom || !dateTo) {
        return res.status(400).json({ message: "dateFrom and dateTo are required" });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
        return res.status(400).json({ message: "dates must be YYYY-MM-DD" });
      }
      if (dateFrom > dateTo) {
        return res.status(400).json({ message: "dateFrom must not be after dateTo" });
      }

      const rows = await storage.computeLdoReconciliation({ dateFrom, dateTo, plant });
      res.json(rows);
    } catch (err: any) {
      console.error("Failed to compute LDO reconciliation", err);
      res.status(500).json({ message: err?.message || "Failed to compute LDO reconciliation" });
    }
  });

  // ============================================
  // PLANT SHIFT LOG (operator daily log)
  // ============================================

  // ============================================
  // PLANT SETTINGS — per-plant tank calibration (Task #253)
  // bitumen tank litres-per-cm + density. Read by Shift Log + Daily Report
  // to derive bitumen MT from operator dip readings (single source of truth).
  // ============================================

  app.get("/api/plant-module/plant-settings", async (_req, res) => {
    try {
      const all = await storage.listPlantSettings();
      res.json(all);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch plant settings" });
    }
  });

  app.get("/api/plant-module/plant-settings/:plantName", async (req, res) => {
    try {
      const plantName = decodeURIComponent(req.params.plantName);
      const row = await storage.getPlantSettings(plantName);
      // Return null-fields object so the client always knows the shape and can
      // surface "no calibration" rather than a 404 (calibration is optional).
      if (!row) {
        return res.json({
          plantName,
          bitumenTank1LitresPerCm: null,
          bitumenTank2LitresPerCm: null,
          bitumenDensityKgPerL: null,
        });
      }
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch plant settings" });
    }
  });

  app.put("/api/plant-module/plant-settings/:plantName", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const plantName = decodeURIComponent(req.params.plantName).trim();
      if (!plantName) return res.status(400).json({ message: "plantName is required" });
      const parsed = insertPlantSettingsSchema.parse({
        plantName,
        plantType: req.body?.plantType ?? "hma",
        siteId: req.body?.siteId ?? null,
        primaryPartyId: req.body?.primaryPartyId ?? null,
        bitumenTank1LitresPerCm: req.body?.bitumenTank1LitresPerCm ?? null,
        bitumenTank2LitresPerCm: req.body?.bitumenTank2LitresPerCm ?? null,
        bitumenDensityKgPerL: req.body?.bitumenDensityKgPerL ?? null,
        tankConfig: req.body?.tankConfig ?? null,
      } as any);
      const saved = await storage.upsertPlantSettings(parsed);
      res.json(saved);
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ message: "Invalid data", errors: err.errors });
      res.status(500).json({ message: err.message || "Failed to save plant settings" });
    }
  });

  app.delete("/api/plant-module/plant-settings/:plantName", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const plantName = decodeURIComponent(req.params.plantName).trim();
      if (!plantName) return res.status(400).json({ message: "plantName is required" });
      await storage.deletePlantSettings(plantName);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to delete plant settings" });
    }
  });

  app.post("/api/plant-module/plant-settings/:plantName/rename", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const oldName = decodeURIComponent(req.params.plantName).trim();
      const newName = (req.body?.newName ?? "").trim();
      if (!oldName) return res.status(400).json({ message: "plantName is required" });
      if (!newName) return res.status(400).json({ message: "newName is required" });
      if (oldName === newName) return res.status(400).json({ message: "New name must be different from current name" });
      const renamed = await storage.renamePlantSettings(oldName, newName);
      res.json(renamed);
    } catch (err: any) {
      if (err?.message?.includes("already exists")) return res.status(409).json({ message: err.message });
      if (err?.message?.includes("not found")) return res.status(404).json({ message: err.message });
      res.status(500).json({ message: err.message || "Failed to rename plant settings" });
    }
  });

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
      // Permission gate: derive create-vs-edit from actual persistence state,
      // NOT from the presence of `id` in the request body. `upsertPlantShiftLog`
      // matches existing rows by (date, plantName) and ignores `id` for matching,
      // so a client could otherwise bypass the gate by toggling `id` either way:
      // an edit-only user sending no `id` could overwrite an existing row, and
      // a create-only user sending a fake `id` could insert a brand-new row.
      const dateForLookup = parsed.date;
      const plantForLookup = parsed.plantName || "Main Plant";
      const existingRow = dateForLookup
        ? await storage.getPlantShiftLogByDate(dateForLookup, undefined, plantForLookup)
        : null;
      const existingId = existingRow?.id ?? null;
      if (existingId) {
        if (!assertEdit(req, res, "plant_shift_logs")) return;
      } else {
        if (!assertCreate(req, res, "plant_shift_logs")) return;
      }
      // Shift logs are inherently multi-edit records (opening readings at shift
      // start, closing readings at shift end). The isFinalized /
      // FINALIZED_LOCKED gate inside upsertPlantShiftLog (with authorizedRole
      // bypass) is the correct re-edit guard for shift logs.
      const editedBy = parsed.editedBy || currentUserName(req) || "operator";
      const authorizedRole: "admin" | "manager" | null = "manager";
      try {
        const saved = await storage.upsertPlantShiftLog(parsed, editedBy, authorizedRole);
        sendPushToSection("plant_shift_logs", "Plant Shift Log Saved", `${saved.date} – ${saved.shiftCode}`, `/plant/shift-log/${saved.date}`).catch(() => {});
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
      if (!assertEdit(req, res, "plant_shift_logs")) return;
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

  // Task #334 — Inline dryer-source fix from mismatch toast. Patches just the
  // dryerFedFrom field on a single shift log without a full upsert cycle.
  app.patch("/api/plant-module/shift-logs/:id/dryer-source", async (req, res) => {
    try {
      if (!assertEdit(req, res, "plant_shift_logs")) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid shift log ID" });
      const bodySchema = z.object({ dryerFedFrom: z.enum(["TANK_1", "TANK_2"]) });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
      }
      const ok = await storage.patchShiftLogDryerSource(id, parsed.data.dryerFedFrom);
      if (!ok) return res.status(404).json({ message: "Shift log not found" });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to patch shift log dryer source" });
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
  const renderDailyPlantPdfBody = async (doc: PDFKit.PDFDocument, date: string, summary: any) => {
      // Header with company logo (matches DPR/bill print style)
      const _dprCfg = await getCompanyConfig();
      const _dprLogoPath = getCompanyLogoPath(_dprCfg.logoFile);
      try {
        if (_dprLogoPath) {
          doc.image(_dprLogoPath, 40, 35, { width: 50, height: 50 });
        }
      } catch {}
      doc.fontSize(16).font("Helvetica-Bold").text("Daily Plant Report", 100, 40);
      doc.fontSize(11).font("Helvetica").text(_dprCfg.companyName, 100, 60);
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

      // Load per-plant tank config once — used by both Consumption Summary and Tank Status sections
      const pSettings = await storage.getPlantSettings(summary.plantName);
      const pTankConfig = parseTankConfig(pSettings?.tankConfig ?? null);
      const bitumenVolForTank = (tank: 1 | 2, depth: number): number => {
        const cfg = tank === 1 ? pTankConfig?.bitumen1 : pTankConfig?.bitumen2;
        return cfg ? calcTankVol(cfg, depth) : getVolumeAtDepth(depth);
      };

      // ── Consumption Summary — fetches the same index row used by the
      // on-screen PlantDailyReports page so displayed numbers align closely.
      {
        const [idxRow] = await storage.getDailyPlantReportIndex({
          from: date, to: date, plant: summary.plantName,
        });

        section("Consumption Summary");

        const fmtL = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)} L`);

        // LDO breakdown: heating sessions / boiler meter / dryer meter
        const ldoHeatingL: number | null = idxRow?.ldoHeatingSessionLitres ?? null;
        const sessionsCount: number = idxRow?.sessionsCount ?? 0;
        const ldoBoilerL: number | null = idxRow?.ldoBoilerLitres ?? null;
        const ldoDryerL: number | null = idxRow?.ldoDryerLitres ?? null;

        doc.fontSize(10).font("Helvetica-Bold").text("LDO:", { continued: false });
        doc.fontSize(10).font("Helvetica").text(
          `  Heating: ${ldoHeatingL != null ? `${ldoHeatingL.toFixed(1)} L${sessionsCount > 0 ? ` (${sessionsCount}x)` : ""}` : "\u2014"}    Boiler: ${fmtL(ldoBoilerL)}    Dryer: ${fmtL(ldoDryerL)}`
        );

        // DG diesel from heating sessions (same source as index); show session count when available
        const dgDieselL: number | null = idxRow?.dgDieselLitres ?? null;
        const dgSessionStr = sessionsCount > 0 ? ` (${sessionsCount}x)` : "";
        doc.fontSize(10).font("Helvetica-Bold").text("DG Diesel:", { continued: true });
        doc.font("Helvetica").text(`  ${dgDieselL != null ? `${dgDieselL.toFixed(1)} L${dgSessionStr}` : "\u2014"}`);

        // Bitumen: template vs actual (from shift-log dip readings, same as index)
        const dipToMt = (tank: 1 | 2, dip: number | null | undefined): number =>
          dip == null ? 0 : bitumenVolForTank(tank, dip) * BITUMEN_DENSITY_KG_PER_LITER / 1000;
        const t1Opening = idxRow?.bitumenTank1OpeningDip ?? null;
        const t1Closing = idxRow?.bitumenTank1ClosingDip ?? null;
        const t2Opening = idxRow?.bitumenTank2OpeningDip ?? null;
        const t2Closing = idxRow?.bitumenTank2ClosingDip ?? null;
        const t1HasBoth = t1Opening != null && t1Closing != null;
        const t2HasBoth = t2Opening != null && t2Closing != null;
        let bitumenActualMt: number | null = null;
        if (t1HasBoth || t2HasBoth) {
          bitumenActualMt = 0;
          if (t1HasBoth) bitumenActualMt += Math.max(0, dipToMt(1, t1Opening) - dipToMt(1, t1Closing));
          if (t2HasBoth) bitumenActualMt += Math.max(0, dipToMt(2, t2Opening) - dipToMt(2, t2Closing));
        }
        const templateMt: number | null = idxRow?.bitumenTemplateMt ?? null;
        const bitVarPct = (bitumenActualMt != null && templateMt != null && templateMt > 0)
          ? (bitumenActualMt - templateMt) / templateMt * 100
          : null;
        const templateStr = templateMt != null ? `${templateMt.toFixed(2)} MT` : "\u2014";
        const actualStr = bitumenActualMt != null ? `${bitumenActualMt.toFixed(2)} MT` : "\u2014";
        const varStr = bitVarPct != null
          ? ` (${bitVarPct > 0 ? "+" : ""}${bitVarPct.toFixed(1)}%)`
          : "";
        doc.fontSize(10).font("Helvetica-Bold").text("Bitumen:", { continued: true });
        doc.font("Helvetica").text(`  Tmpl ${templateStr}  /  Actual ${actualStr}${varStr}`);
      }

      section(`LDO Consumption (Shift Meters / Source: ${summary.ldo.source})`);
      line("Boiler Meter (L)", summary.ldo.consumedT1L?.toFixed(1) ?? "—");
      line("Dryer Meter (L)", summary.ldo.consumedT2L?.toFixed(1) ?? "—");
      line("Total (L)", summary.ldo.consumedTotalL?.toFixed(1) ?? "—");
      line("L / Hour (combined)", summary.ldo.lPerHour ?? "—");
      line("Dryer L / MT Production", summary.ldo.dryerLPerMT ?? "—");
      line("Boiler L / MT Production", summary.ldo.boilerLPerMT ?? "—");
      const dryerFedFromLabel = summary.ldo.dryerFedFrom === "TANK_1" ? "Tank 1" : summary.ldo.dryerFedFrom === "TANK_2" ? "Tank 2" : null;
      if (dryerFedFromLabel) {
        line("Dryer fed from", dryerFedFromLabel);
      } else {
        // Highlight missing dryer routing so reviewers notice it immediately.
        doc.fontSize(10).font("Helvetica-Bold").text("Dryer fed from: ", { continued: true });
        doc.fillColor("#CC0000").font("Helvetica-Oblique").text("Not set — dryer routing unknown");
        doc.fillColor("#000000");
      }
      line("Tank 1 stock used (L)", summary.ldo.tank1DeductedL?.toFixed(1) ?? "—");
      line("Tank 2 stock used (L)", summary.ldo.tank2DeductedL?.toFixed(1) ?? "—");
      if (summary.ldo.dipDeltaT1L != null || summary.ldo.dipDeltaT2L != null) {
        const DIP_THRESHOLD_L = 200;
        doc.moveDown(0.3).fontSize(9).font("Helvetica-Bold").text("Dip-stick cross-check (shift log opening − closing)");
        doc.font("Helvetica").fontSize(10);
        if (summary.ldo.dipDeltaT1L != null) {
          line("Boiler Dip Δ (L)", summary.ldo.dipDeltaT1L.toFixed(1));
          if (summary.ldo.consumedT1L != null) {
            const varL = Math.round((summary.ldo.consumedT1L - summary.ldo.dipDeltaT1L) * 10) / 10;
            const isHigh = Math.abs(varL) > DIP_THRESHOLD_L;
            if (isHigh) {
              doc.fontSize(10).font("Helvetica-Bold").text(`Meter vs Dip T1: `, { continued: true });
              doc.fillColor("#CC0000").text(`${varL > 0 ? "+" : ""}${varL} L — gap exceeds ${DIP_THRESHOLD_L} L`);
              doc.fillColor("#000000").font("Helvetica");
            } else {
              line("Meter vs Dip T1", `${varL > 0 ? "+" : ""}${varL} L`);
            }
          }
        }
        if (summary.ldo.dipDeltaT2L != null) {
          line("Dryer Dip Δ (L)", summary.ldo.dipDeltaT2L.toFixed(1));
          if (summary.ldo.consumedT2L != null) {
            const varL = Math.round((summary.ldo.consumedT2L - summary.ldo.dipDeltaT2L) * 10) / 10;
            const isHigh = Math.abs(varL) > DIP_THRESHOLD_L;
            if (isHigh) {
              doc.fontSize(10).font("Helvetica-Bold").text(`Meter vs Dip T2: `, { continued: true });
              doc.fillColor("#CC0000").text(`${varL > 0 ? "+" : ""}${varL} L — gap exceeds ${DIP_THRESHOLD_L} L`);
              doc.fillColor("#000000").font("Helvetica");
            } else {
              line("Meter vs Dip T2", `${varL > 0 ? "+" : ""}${varL} L`);
            }
          }
        }
      }

      section("Bitumen Tank Status");
      line("Tank 1 Temp (°C)", summary.shift?.bitumenTank1Temp);
      line("Tank 2 Temp (°C)", summary.shift?.bitumenTank2Temp);
      const fmtDipMt = (n: number | null) => (n == null ? "—" : `${n.toFixed(2)} MT`);
      const dipToRow = (label: string, tank: 1 | 2, dip: number | null | undefined) => {
        if (dip == null) { line(label, "—"); return; }
        const cfg = tank === 1 ? pTankConfig?.bitumen1 : pTankConfig?.bitumen2;
        const deadDepth = cfg?.deadStockDepthCm ?? 12.5;
        const totalVol = cfg ? calcTankVol(cfg, dip) : getVolumeAtDepth(dip);
        const deadVol = cfg ? calcTankVol(cfg, deadDepth) : getUsableVolume(0);
        const usableVol = Math.max(0, totalVol - deadVol);
        const deadVolDisplay = Math.round(totalVol - usableVol);
        const totalMt = totalVol * BITUMEN_DENSITY_KG_PER_LITER / 1000;
        const usableMt = usableVol * BITUMEN_DENSITY_KG_PER_LITER / 1000;
        line(`${label} — Dip (cm)`, dip.toFixed(1));
        line(`${label} — Total`, `${fmtDipMt(totalMt)} (${Math.round(totalVol).toLocaleString()} L)`);
        line(`${label} — Usable`, `${fmtDipMt(usableMt)} (${Math.round(usableVol).toLocaleString()} L)`);
        line(`${label} — Dead Stock`, `${deadVolDisplay.toLocaleString()} L`);
      };
      dipToRow("Tank 1 Opening", 1, summary.shift?.bitumenTank1OpeningDip ?? null);
      dipToRow("Tank 1 Closing", 1, summary.shift?.bitumenTank1ClosingDip ?? null);
      dipToRow("Tank 2 Opening", 2, summary.shift?.bitumenTank2OpeningDip ?? null);
      dipToRow("Tank 2 Closing", 2, summary.shift?.bitumenTank2ClosingDip ?? null);

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
        // Task #254 — surface the attribution range so the PDF documents
        // why pre-heating from earlier dates rolls into this production day.
        const attrLabel = bh.attributionFromDate
          ? `after ${bh.attributionFromDate} through ${bh.attributionToDate || date}`
          : `on or before ${bh.attributionToDate || date}`;
        line("Sessions Attributed", attrLabel);
        line("Total Heating Hours", bh.totalHours);
        line("Sessions LDO (L)", bh.sessionsLdoT1L?.toFixed(1) ?? "—");
        line(
          "Boiler-during-production LDO (L)",
          bh.boilerRunsDuringProduction ? (bh.boilerDuringProductionL?.toFixed(1) ?? "0.0") : "off",
        );
        line("Total Boiler LDO (L)", bh.totalBoilerLdoL?.toFixed(1) ?? "—");
        line("Boiler L / Hour", bh.lPerHour ?? "—");
        line("Boiler L / MT Production", bh.lPerMT ?? "—");
        line("Dryer L / MT Production", summary.ldo.dryerLPerMT ?? "—");
        line("DG Diesel Attributable (L)", bh.dgDieselL?.toFixed(1) ?? "—");
        line("Shift Log Boiler Meter LDO (L)", bh.shiftLogT1L?.toFixed(1) ?? "—");
        if (bh.mismatchL != null && Math.abs(bh.mismatchL) > 5) {
          line("⚠ Reconciliation mismatch (L)", `${bh.mismatchL > 0 ? "+" : ""}${bh.mismatchL}`);
        }
        if (bh.sessions?.length) {
          // Task #254 — pretty session-type labels in the PDF as well.
          const labelOf = (t: string) =>
            t === "NIGHT_PREHEAT" ? "Pre-heating" :
            t === "DAY_MAINTENANCE" ? "Production heating" : t;
          for (const s of bh.sessions) {
            const priorTag = s.date && bh.attributionToDate && s.date !== bh.attributionToDate ? "  [prior]" : "";
            doc.fontSize(9).font("Helvetica").text(
              `• ${s.date || "—"}  ${labelOf(s.sessionType)}  ${s.startTime || "—"}→${s.endTime || "—"}  ${s.durationHours ?? 0}h  LDO ${s.ldoTank1Consumed?.toFixed(1) ?? 0}L  DG ${s.dgDieselConsumed?.toFixed(1) ?? 0}L  ${s.staffName || ""}${s.isFinalized ? "  [Finalized]" : ""}${priorTag}`
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
    const _coverCfg = await getCompanyConfig();
    const _coverLogoPath = getCompanyLogoPath(_coverCfg.logoFile);
    return await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margin: 36 });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      try {
        try { if (_coverLogoPath) doc.image(_coverLogoPath, 36, 32, { width: 46, height: 46 }); } catch {}
        doc.fontSize(16).font("Helvetica-Bold").text("Daily Plant Reports — Cover Sheet", 92, 36);
        doc.fontSize(10).font("Helvetica").text(_coverCfg.companyName, 92, 56);
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
      (async () => {
        try {
          await renderDailyPlantPdfBody(doc, date, summary);
          doc.end();
        } catch (e) { reject(e); }
      })();
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
        const _csvCfg = await getCompanyConfig();
        const lines: string[] = [];
        // Cover header — mirrors the cover-sheet PDF top strip.
        lines.push(toLine(["Daily Plant Reports — Cover Sheet"]));
        lines.push(toLine([_csvCfg.companyName]));
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
      const _xlsxCfg = await getCompanyConfig();
      const wb = xlsx.utils.book_new();
      const summaryAoa: any[][] = [
        ["Daily Plant Reports — Cover Sheet"],
        [_xlsxCfg.companyName],
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

  // Bulk PDF export — accepts a list of (date, plant) entries and streams ONE
  // STORE-mode ZIP (via `archiver`) containing all PDFs (across plants), built
  // and appended one at a time so peak memory stays flat regardless of entry
  // count. The per-date success/failure list is recorded in a `manifest.json`
  // file embedded inside the ZIP (the response body is already streaming, so
  // it's no longer possible to set per-entry headers after the fact). The
  // `X-Bulk-Total` response header still carries the requested entry count up
  // front so the client can show a progress label before parsing the ZIP.
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
      // Sanity guard: with archiver streaming the response, memory stays flat
      // regardless of entry count — but keep a generous upper bound to prevent
      // a runaway request from holding a request slot for hours.
      const MAX_ENTRIES = 1000;
      if (entries.length > MAX_ENTRIES) {
        return res.status(400).json({ message: `Too many reports (${entries.length}). Max ${MAX_ENTRIES} per ZIP — narrow the date range and try again.` });
      }

      type Status = { date: string; plant: string; ok: boolean; error?: string; bytes?: number };
      const status: Status[] = [];
      const slugPlant = (p: string) => p.replace(/[^A-Za-z0-9._-]+/g, "_");
      const sortedDates = entries.map((e) => e.date).sort();
      const fromD = sortedDates[0];
      const toD = sortedDates[sortedDates.length - 1];
      const filename = `daily-plant-reports-${fromD}_to_${toD}.zip`;

      // Send headers up-front so we can stream the ZIP body straight to the
      // client without buffering it. The X-Bulk-Total header lets the client
      // show "N PDFs queued" before the download finishes; the per-entry
      // succeeded/failed status is recorded in `manifest.json` inside the ZIP
      // (which the client extracts after the download completes).
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("X-Bulk-Total", String(entries.length));
      res.setHeader("Access-Control-Expose-Headers", "X-Bulk-Total, Content-Disposition");

      // STORE-mode ZIP (matches the previous hand-rolled encoder — PDFs barely
      // benefit from DEFLATE, and STORE keeps CPU low during a year-long export).
      const archive = archiver("zip", { store: true });
      let aborted = false;
      archive.on("error", (err: any) => {
        console.error("Bulk ZIP archiver error", err);
        try { if (!res.writableEnded) res.destroy(err); } catch { /* ignore */ }
      });
      // Warning events are non-fatal (e.g. file stat issues we don't trigger here).
      archive.on("warning", (err: any) => {
        if (err?.code !== "ENOENT") console.warn("Bulk ZIP archiver warning", err);
      });
      res.on("close", () => {
        if (!res.writableEnded) {
          aborted = true;
          try { archive.abort(); } catch { /* ignore */ }
        }
      });
      archive.pipe(res);

      // Append a buffer entry and wait for archiver to finish writing it before
      // we move on. This caps in-flight memory at ~one PDF (≈150-200 KB).
      const appendBuffer = (data: Buffer, name: string) =>
        new Promise<void>((resolve, reject) => {
          const onEntry = () => {
            archive.removeListener("error", onError);
            resolve();
          };
          const onError = (err: Error) => {
            archive.removeListener("entry", onEntry);
            reject(err);
          };
          archive.once("entry", onEntry);
          archive.once("error", onError);
          archive.append(data, { name });
        });

      try {
        // Cover sheet — a single index PDF listing every (date, plant) row with
        // totals + party/mix breakdown so accountants can scan the export
        // without opening each per-day PDF. Empty days render as "—". Built
        // from getDailyPlantReportIndex (same shape as the Daily Reports list).
        try {
          const indexRows = await storage.getDailyPlantReportIndex({ from: fromD, to: toD });
          const indexByKey = new Map(indexRows.map((r) => [`${r.date}|${r.plantName}`, r]));
          const coverBuf = await buildBulkZipCoverSheetPdf(entries, indexByKey, fromD, toD);
          // 00- prefix keeps it sorted to the top in most ZIP viewers.
          await appendBuffer(coverBuf, "00-cover-sheet.pdf");
        } catch (err: any) {
          const msg = err?.message || String(err);
          await appendBuffer(Buffer.from(`Failed to build cover sheet: ${msg}`), "00-cover-sheet-ERROR.txt");
        }

        // Build PDFs one at a time and stream each into the archive. The buffer
        // for each PDF is released as soon as archiver consumes it, so peak
        // memory stays flat regardless of how many dates are exported.
        for (const e of entries) {
          if (aborted) break;
          try {
            const buf = await buildDailyPlantReportPdfBuffer(e.date, e.plant);
            await appendBuffer(buf, `daily-plant-report-${slugPlant(e.plant)}-${e.date}.pdf`);
            status.push({ date: e.date, plant: e.plant, ok: true, bytes: buf.length });
          } catch (err: any) {
            const msg = err?.message || String(err);
            await appendBuffer(Buffer.from(`Failed to build PDF for ${e.plant} on ${e.date}: ${msg}`), `ERROR-${slugPlant(e.plant)}-${e.date}.txt`);
            status.push({ date: e.date, plant: e.plant, ok: false, error: msg });
          }
        }

        if (!aborted) {
          const manifest = {
            generatedAt: new Date().toISOString(),
            total: status.length,
            succeeded: status.filter((s) => s.ok).length,
            failed: status.filter((s) => !s.ok).length,
            entries: status,
          };
          await appendBuffer(Buffer.from(JSON.stringify(manifest, null, 2)), "manifest.json");
          await archive.finalize();
        }
      } catch (err: any) {
        console.error("Bulk ZIP streaming error", err);
        try { archive.abort(); } catch { /* ignore */ }
        if (!res.writableEnded) {
          try { res.destroy(err); } catch { /* ignore */ }
        }
      }
    } catch (err: any) {
      console.error("Bulk ZIP error", err);
      if (!res.headersSent) {
        res.status(500).json({ message: err.message || "Failed to build bulk ZIP" });
      } else if (!res.writableEnded) {
        try { res.destroy(err); } catch { /* ignore */ }
      }
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

      await renderDailyPlantPdfBody(doc, date, summary);
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
      // Task #254 — when `servedByProductionDate=YYYY-MM-DD` is supplied we
      // return all heating sessions attributed to that production day (i.e.
      // every session run since the prior production day, overnight pre-heat
      // included). The Plant Shift Log "Heating Sessions for this Production"
      // card uses this so its L/MT matches the Daily Plant Report. Other
      // callers (Heating Sessions list, Trends) keep using strict-by-date.
      const servedByProd = req.query.servedByProductionDate as string | undefined;
      if (servedByProd) {
        const plantName = (req.query.plant as string | undefined) || "Main Plant";
        const rows = await storage.getHeatingSessionsForProductionDay(plantName, servedByProd);
        return res.json(rows);
      }
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

  // Task #219 — Per-(date, plant) Boiler Meter reconciliation across heating
  // sessions, the shift log meter and the LDO Flow Meter ledger. The heating
  // sessions list calls this for the visible date range so it can flag days
  // where the three sources have drifted beyond the 5L tolerance. Declared
  // BEFORE the `/heating-sessions/:id` route so Express does not try to
  // parse "reconciliation" as an :id.
  app.get("/api/plant-module/heating-sessions/reconciliation", async (req, res) => {
    try {
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      if (!dateFrom || !dateTo) {
        return res.status(400).json({ message: "dateFrom and dateTo are required" });
      }
      const plantName = (req.query.plant as string | undefined) || undefined;
      const rows = await storage.getBoilerMeterReconciliation({ dateFrom, dateTo, plantName });
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch reconciliation" });
    }
  });

  // Task #300 — Dryer-source mismatch audit across shift logs and heating
  // sessions for the same (date, plant). Declared before the /:id route so
  // Express does not try to parse "dryer-source-mismatches" as an id.
  app.get("/api/plant-module/heating-sessions/dryer-source-mismatches", async (req, res) => {
    try {
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      if (!dateFrom || !dateTo) {
        return res.status(400).json({ message: "dateFrom and dateTo are required" });
      }
      const plantName = (req.query.plant as string | undefined) || undefined;
      const rows = await storage.getDryerSourceMismatches({ dateFrom, dateTo, plantName });
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch dryer source mismatches" });
    }
  });

  // Task #332 — One-click dryer-source conflict resolution. Bulk-updates
  // dryerFedFrom on a set of heating session IDs to the requested target value.
  app.patch("/api/plant-module/heating-sessions/align-dryer-source", async (req, res) => {
    try {
      if (!assertEdit(req, res, "plant_heating")) return;
      const bodySchema = z.object({
        sessionIds: z.array(z.number().int().positive()).min(1),
        targetValue: z.enum(["TANK_1", "TANK_2"]),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
      }
      const { sessionIds, targetValue } = parsed.data;
      const updatedCount = await storage.alignDryerSourceForSessions(sessionIds, targetValue);
      res.json({ updatedCount });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to align dryer source" });
    }
  });

  app.patch("/api/plant-module/heating-sessions/:id", async (req, res) => {
    try {
      if (!assertEdit(req, res, "plant_heating")) return;
      const id = parseInt(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid session id" });
      const bodySchema = z.object({
        dryerFedFrom: z.enum(["TANK_1", "TANK_2"]),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
      }
      const updatedCount = await storage.alignDryerSourceForSessions([id], parsed.data.dryerFedFrom);
      if (updatedCount === 0) return res.status(404).json({ message: "Heating session not found" });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to update heating session" });
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
      if (!assertCreate(req, res, "plant_heating")) return;
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

  app.patch("/api/plant-module/heating-sessions/:id/resync-flow", async (req, res) => {
    try {
      if (!assertEdit(req, res, "plant_heating")) return;
      const id = parseInt(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid session id" });
      const existing = await storage.getBitumenHeatingSession(id);
      if (!existing) return res.status(404).json({ message: "Heating session not found" });
      const editedBy = currentUserName(req) || "operator";
      const { upsertBitumenHeatingSessionSchema } = await import("@shared/schema");
      const parsed = upsertBitumenHeatingSessionSchema.parse({ ...existing, id });
      const authorizedRole: "admin" | "manager" | null = "manager";
      await storage.upsertBitumenHeatingSession(parsed, editedBy, authorizedRole);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to resync flow entry" });
    }
  });

  app.post("/api/plant-module/heating-sessions/:id/finalize", async (req, res) => {
    try {
      if (!assertEdit(req, res, "plant_heating")) return;
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
        "Sessions Boiler L": r.total.ldoT1L,
        "Shift-meter Tank-1 L": r.shiftMeterT1L ?? "",
        "Mismatch L (sessions − shift)": r.mismatchL ?? "",
        "Mismatch Flag": r.mismatchFlag ? "YES" : "",
        "DG Diesel (L)": r.total.dgDieselL,
        "L/Hour (boiler)": r.total.lPerHour ?? "",
        "L/MT (sessions)": r.total.lPerMT ?? "",
        "L/MT (shift-meter)": r.shiftMeterLPerMT ?? "",
        "Target L/MT": trends.targetLPerMT,
        "Hot-oil End Avg (°C)": r.hotOilEndAvgC ?? "",
        "Hot-oil End Min (°C)": r.hotOilEndMinC ?? "",
        "Hot-oil End Max (°C)": r.hotOilEndMaxC ?? "",
        "Hot-oil Samples": r.hotOilEndSampleCount,
        "Hot-oil Below Threshold": r.hotOilEndBelowThreshold ? "YES" : "",
        "Hot-oil Threshold (°C)": trends.hotOilEndTempMinC,
        "Hot-oil Forward Avg (°C)": r.hotOilSupplyAvgC ?? "",
        "Hot-oil Return Avg (°C)": r.hotOilReturnAvgC ?? "",
        "Hot-oil Δ Avg (°C)": r.hotOilDeltaAvgC ?? "",
        "Hot-oil Δ Samples": r.hotOilDeltaSampleCount,
        "Hot-oil Δ Below Floor": r.hotOilDeltaBelowThreshold ? "YES" : "",
        "Hot-oil Δ Floor (°C)": trends.hotOilDeltaMinC,
      }));
      const summary = [{
        "Date Range": `${trends.dateFrom} to ${trends.dateTo}`,
        Plant: trends.plantName,
        Days: trends.summary.days,
        Sessions: trends.summary.sessionCount,
        "Total Hours": trends.summary.totalHours,
        "Sessions Boiler L": trends.summary.totalLdoT1L,
        "Shift-meter Tank-1 L (total)": trends.summary.totalShiftMeterT1L,
        "Days w/ Shift Meter": trends.summary.daysWithShiftMeter,
        [`Mismatch Days (>±${trends.mismatchThresholdL} L)`]: trends.summary.mismatchDays,
        "DG Diesel (L)": trends.summary.dgDieselL,
        "Production (MT)": trends.summary.totalProductionMT,
        "L/Hour": trends.summary.lPerHour ?? "",
        "L/MT (sessions)": trends.summary.lPerMT ?? "",
        "L/MT (shift-meter)": trends.summary.shiftMeterLPerMT ?? "",
        "Target L/MT": trends.targetLPerMT,
        "Hot-oil End Avg (°C)": trends.summary.hotOilEndAvgC ?? "",
        "Hot-oil End Min (°C)": trends.summary.hotOilEndMinC ?? "",
        "Hot-oil End Max (°C)": trends.summary.hotOilEndMaxC ?? "",
        "Hot-oil Threshold (°C)": trends.hotOilEndTempMinC,
        "Hot-oil Flagged Days": trends.summary.hotOilFlaggedDays,
        "Hot-oil Forward Avg (°C)": trends.summary.hotOilSupplyAvgC ?? "",
        "Hot-oil Return Avg (°C)": trends.summary.hotOilReturnAvgC ?? "",
        "Hot-oil Δ Avg (°C)": trends.summary.hotOilDeltaAvgC ?? "",
        "Hot-oil Δ Min Day Avg (°C)": trends.summary.hotOilDeltaMinObservedC ?? "",
        "Hot-oil Δ Floor (°C)": trends.hotOilDeltaMinC,
        "Hot-oil Δ Flagged Days": trends.summary.hotOilDeltaFlaggedDays,
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
  // INTERNAL REQUISITIONS (legacy alias — real routes live at /api/irn)
  // ============================================

  app.get("/api/internal-requisitions", async (req, res) => {
    try {
      if (!assertAuthed(req, res)) return;
      const { status, dateFrom, dateTo } = req.query as Record<string, string | undefined>;
      const irns = await storage.getInternalRequisitions({ status, dateFrom, dateTo });
      res.json(irns);
    } catch (err) {
      console.error("Error fetching IRNs:", err);
      res.status(500).json({ message: "Failed to fetch IRNs" });
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

  app.get("/api/purchase-indents/for-material", async (req, res) => {
    try {
      const q = ((req.query.q as string) || (req.query.name as string) || "").toLowerCase().trim();
      const indents = await storage.getPurchaseIndents();
      const activeStatuses = ["approved", "pending", "stores_check"];
      const filtered = q
        ? indents.filter(i =>
            activeStatuses.includes(i.status) &&
            i.items.some(it => (it.description || "").toLowerCase().includes(q))
          )
        : indents.filter(i => activeStatuses.includes(i.status));
      res.json(filtered);
    } catch (err) {
      console.error("Error fetching purchase indents for material:", err);
      res.status(500).json({ message: "Failed to fetch purchase indents" });
    }
  });

  app.get("/api/purchase-indents/summary", async (req, res) => {
    try {
      const all = await storage.getPurchaseIndents();
      const summary = {
        total: all.length,
        // pendingStores = legacy "pending" + stores_check with no/null storesStatus
        pending: all.filter(i => i.status === "pending" || (i.status === "stores_check" && !(i as any).storesStatus)).length,
        // storesCheck (AWAITING APPROVAL) = stores_check with storesStatus "verified" or "bypass_requested"
        storesCheck: all.filter(i => i.status === "stores_check" && ((i as any).storesStatus === "verified" || (i as any).storesStatus === "bypass_requested")).length,
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
        paymentMode: req.query.paymentMode as string | undefined,
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
      if (!assertCreate(req, res, "site_procurement")) return;
      const input = createPurchaseIndentRequestSchema.parse(req.body);
      const indent = await storage.createPurchaseIndent(input);
      sendPushToSection("purchase_indents_view", "New Purchase Indent", `${indent.indentNo} raised by ${indent.raisedBy}`, "/plant/purchase-indents").catch(() => {});
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

      if (!assertApprove(req, res, "purchase_indents_approve")) return;
      // Self-approval prevention: the approver must differ from the raiser.
      const existingIndent = await storage.getPurchaseIndent(id);
      if (!existingIndent) return res.status(404).json({ message: "Purchase indent not found" });
      if (!req.authUser?.isAdmin && existingIndent.authorUserId && existingIndent.authorUserId === req.authUser?.id) {
        return res.status(403).json({ message: "You cannot approve a record you raised." });
      }

      // Stores verification is mandatory before approval (Material Indents bypass this step).
      const storesStatus = (existingIndent as any).storesStatus;
      const piType = (existingIndent as any).piType ?? "stores";
      if (piType !== "material" && storesStatus !== "verified") {
        return res.status(400).json({
          message: "Stores verification must be completed before this indent can be approved.",
        });
      }

      const approvedBy = currentUserName(req);

      const approvedItemsSchema = z.array(z.object({
        itemId: z.number(),
        approvedQty: z.number(),
      }));
      const validatedItems = approvedItemsSchema.parse(approvedItems);

      const indent = await storage.approvePurchaseIndent(id, validatedItems, approvedBy, remarks, undefined);
      if (!indent) {
        return res.status(404).json({ message: "Purchase indent not found" });
      }
      sendPushToSection("purchase_indents_view", "Indent Approved", `${indent.indentNo} approved by ${approvedBy}`, "/plant/purchase-indents").catch(() => {});
      sendPushToRaiser(indent.authorUserId, indent.raisedBy, "Your Indent Was Approved", `${indent.indentNo} has been approved by ${approvedBy}`, "/plant/purchase-indents").catch(() => {});
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

      if (!assertApprove(req, res, "purchase_indents_approve")) return;
      const rejectedBy = currentUserName(req);

      if (!reason || typeof reason !== "string") {
        return res.status(400).json({ message: "Rejection reason is required" });
      }

      const indent = await storage.rejectPurchaseIndent(id, reason, rejectedBy);
      if (!indent) {
        return res.status(404).json({ message: "Purchase indent not found" });
      }
      sendPushToSection("purchase_indents_view", "Indent Rejected", `${indent.indentNo} rejected by ${rejectedBy}`, "/plant/purchase-indents").catch(() => {});
      sendPushToRaiser(indent.authorUserId, indent.raisedBy, "Your Indent Was Rejected", `${indent.indentNo} has been rejected by ${rejectedBy}`, "/plant/purchase-indents").catch(() => {});
      res.json(indent);
    } catch (err) {
      console.error("Error rejecting purchase indent:", err);
      res.status(500).json({ message: "Failed to reject purchase indent" });
    }
  });

  app.patch("/api/purchase-indents/:id/stores-verify", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!assertCreate(req, res, "stores_inventory")) return;

      const verifySchema = z.object({
        items: z.array(z.object({
          itemId: z.number(),
          stockStatus: z.string(),
          stockAvailableQty: z.number().optional(),
          storesItemNote: z.string().optional(),
        })),
      });

      const { items } = verifySchema.parse(req.body);
      const verifiedBy = currentUserName(req);

      const indent = await storage.verifyIndentStores(id, items, verifiedBy);
      if (!indent) return res.status(404).json({ message: "Purchase indent not found" });

      sendPushToSection("purchase_indents_view", "Stores Verified", `${indent.indentNo} verified by stores — awaiting manager approval`, "/plant/purchase-indents").catch(() => {});
      res.json(indent);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      if (err instanceof Error && err.message.startsWith("Cannot ")) return res.status(400).json({ message: err.message });
      console.error("Error verifying stores:", err);
      res.status(500).json({ message: "Failed to submit stores verification" });
    }
  });

  app.patch("/api/purchase-indents/:id/stores-bypass", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!assertCreate(req, res, "stores_inventory")) return;
      const { reason } = req.body;
      if (!reason?.trim()) {
        return res.status(400).json({ message: "Bypass reason is required" });
      }
      const bypassedBy = currentUserName(req);
      const indent = await storage.bypassIndentStores(id, reason.trim(), bypassedBy);
      if (!indent) return res.status(404).json({ message: "Purchase indent not found" });
      sendPushToSection("purchase_indents_view", "Bypass Requested", `${indent.indentNo} — stores bypass requested by ${bypassedBy}`, "/plant/purchase-indents").catch(() => {});
      res.json(indent);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Cannot ")) return res.status(400).json({ message: err.message });
      console.error("Error bypassing stores:", err);
      res.status(500).json({ message: "Failed to request stores bypass" });
    }
  });

  // ── Material Indent Routes ──────────────────────────────────────────────────

  app.post("/api/purchase-indents/:id/place-order", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!assertCreate(req, res, "site_procurement")) return;
      const actionBy = currentUserName(req);
      const { items } = req.body;
      const indent = await storage.placeOrderIndent(id, items || [], actionBy);
      if (!indent) return res.status(404).json({ message: "Indent not found" });
      res.json(indent);
    } catch (err) {
      console.error("Error placing order:", err);
      res.status(500).json({ message: "Failed to place order" });
    }
  });

  app.post("/api/purchase-indents/:id/record-material-receipt", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!assertCreate(req, res, "site_procurement")) return;
      const actionBy = currentUserName(req);
      const { items } = req.body;
      if (!items?.length) return res.status(400).json({ message: "items array is required" });
      const indent = await storage.recordMaterialIndentReceipt(id, items, actionBy);
      if (!indent) return res.status(404).json({ message: "Indent not found" });
      res.json(indent);
    } catch (err) {
      console.error("Error recording material indent receipt:", err);
      res.status(500).json({ message: "Failed to record receipt" });
    }
  });

  app.get("/api/purchase-indents/pending-for-material/:materialId", async (req, res) => {
    try {
      if (!assertAuthed(req, res)) return;
      const materialId = Number(req.params.materialId);
      const rows = await storage.getPendingIndentsForMaterial(materialId);
      res.json(rows);
    } catch (err) {
      console.error("Error fetching pending indents for material:", err);
      res.status(500).json({ message: "Failed to fetch pending indents" });
    }
  });

  app.patch("/api/purchase-indents/items/:itemId/link-receipt", async (req, res) => {
    try {
      if (!assertAuthed(req, res)) return;
      // Require create rights on either plant_stock (receipt creators) or site_procurement
      {
        const user = req.authUser!;
        const m = req.authPermissions;
        const ok = user.isAdmin
          || (m?.["plant_stock"]?.create)
          || (m?.["site_procurement"]?.create);
        if (!ok) return res.status(403).json({ error: "forbidden", message: "Requires plant_stock:create or site_procurement:create" });
      }
      const itemId = Number(req.params.itemId);
      const { receiptId } = req.body;
      if (!receiptId) return res.status(400).json({ message: "receiptId is required" });
      const actionBy = currentUserName(req);
      const item = await storage.linkReceiptToIndentItem(itemId, Number(receiptId), actionBy);
      if (!item) return res.status(404).json({ message: "Item or receipt not found" });
      res.json(item);
    } catch (err) {
      console.error("Error linking receipt to indent item:", err);
      res.status(500).json({ message: "Failed to link receipt" });
    }
  });

  // ── Internal Requisition Notes (IRN) ────────────────────────────────────────

  // Returns live stock balances joined with material names for the stores verification form.
  app.get("/api/irn/stock-lookup", async (req, res) => {
    try {
      if (!assertAuthed(req, res)) return;
      const rows = await db
        .select({
          materialId: stockBalances.materialId,
          materialName: plantMaterials.name,
          balance: stockBalances.balance,
          uom: stockBalances.uom,
          partyId: stockBalances.partyId,
          conversionFactor: plantMaterials.conversionFactor,
          conversionFromUom: plantMaterials.conversionFromUom,
          conversionToUom: plantMaterials.conversionToUom,
          bulkDensity: plantMaterials.bulkDensity,
        })
        .from(stockBalances)
        .innerJoin(plantMaterials, eq(stockBalances.materialId, plantMaterials.id));
      res.json(rows);
    } catch (err) {
      console.error("Error fetching stock lookup:", err);
      res.status(500).json({ message: "Failed to fetch stock lookup" });
    }
  });

  // Returns IRN items queued for procurement (approved IRNs with items needing a PI).
  app.get("/api/irn/procurement-queue", async (req, res) => {
    try {
      if (!assertAuthed(req, res)) return;
      const rows = await db
        .select({
          itemId: internalRequisitionItems.id,
          irnId: internalRequisitions.id,
          irnNo: internalRequisitions.irnNo,
          irnDate: internalRequisitions.date,
          raisedBy: internalRequisitions.raisedBy,
          raisedFrom: internalRequisitions.raisedFrom,
          irnStatus: internalRequisitions.status,
          material: internalRequisitionItems.material,
          qty: internalRequisitionItems.qty,
          uom: internalRequisitionItems.uom,
          urgency: internalRequisitionItems.urgency,
          purpose: internalRequisitionItems.purpose,
          needByDate: internalRequisitionItems.needByDate,
          procureQty: internalRequisitionItems.procureQty,
          itemStatus: internalRequisitionItems.itemStatus,
          storesNotes: internalRequisitionItems.storesNotes,
        })
        .from(internalRequisitionItems)
        .innerJoin(internalRequisitions, eq(internalRequisitionItems.irnId, internalRequisitions.id))
        .where(
          and(
            drizzleInArray(internalRequisitionItems.itemStatus, ["queued_procurement", "partially_issued"]),
            drizzleInArray(internalRequisitions.status, ["approved", "stores_verified"]),
            or(isNull(internalRequisitionItems.procureQty), gt(internalRequisitionItems.procureQty, 0))
          )
        )
        .orderBy(asc(internalRequisitions.date));

      // Attach linkedPiId per IRN
      const irnIds = [...new Set(rows.map(r => r.irnId))];
      const linkedPis = irnIds.length
        ? await db.select({ id: purchaseIndentsTable.id, sourceIrnId: purchaseIndentsTable.sourceIrnId })
            .from(purchaseIndentsTable)
            .where(drizzleInArray(purchaseIndentsTable.sourceIrnId, irnIds))
        : [];
      const linkedPiMap: Record<number, number> = {};
      for (const pi of linkedPis) {
        if (pi.sourceIrnId != null) linkedPiMap[pi.sourceIrnId] = pi.id;
      }

      res.json(rows.map(r => ({ ...r, linkedPiId: linkedPiMap[r.irnId] ?? null })));
    } catch (err) {
      console.error("Error fetching procurement queue:", err);
      res.status(500).json({ message: "Failed to fetch procurement queue" });
    }
  });

  // Creates a PI from all queued/partially-issued items on an approved IRN.
  app.post("/api/irn/:id/raise-pi", async (req, res) => {
    try {
      if (!assertCreate(req, res, "site_procurement")) return;
      const irnId = Number(req.params.id);
      if (isNaN(irnId)) return res.status(400).json({ message: "Invalid IRN id" });

      const irn = await storage.getInternalRequisition(irnId);
      if (!irn) return res.status(404).json({ message: "IRN not found" });
      if (!["approved", "stores_verified"].includes(irn.status)) {
        return res.status(400).json({ message: "PI can only be raised for approved or stores-verified IRNs" });
      }

      // Check if a PI already exists for this IRN
      const [existing] = await db.select({ id: purchaseIndentsTable.id })
        .from(purchaseIndentsTable)
        .where(eq(purchaseIndentsTable.sourceIrnId, irnId))
        .limit(1);
      if (existing) {
        return res.status(409).json({ message: "A PI has already been raised for this IRN", piId: existing.id });
      }

      const queuedItems = irn.items.filter(i =>
        ["queued_procurement", "partially_issued"].includes(i.itemStatus) && (i.procureQty ?? i.qty) > 0
      );
      if (!queuedItems.length) {
        return res.status(400).json({ message: "No items queued for procurement on this IRN" });
      }

      const userName = currentUserName(req);
      const indent = await storage.createPurchaseIndent({
        date: new Date().toISOString().slice(0, 10),
        indentNo: "",          // auto-generated inside createPurchaseIndent
        proposedBy: irn.raisedBy,
        raisedBy: userName,
        status: "stores_check",
        remarks: `AUTO-RAISED FROM IRN ${irn.irnNo}`,
        siteId: (irn as any).siteId ?? null,
        raisedFrom: irn.raisedFrom,
        sourceIrnId: irnId,
        items: queuedItems.map(item => ({
          description: item.material,
          qty: item.procureQty ?? item.qty,
          uom: item.uom,
          purpose: item.purpose,
          priority: item.urgency === "urgent" ? "urgent" : item.urgency === "high" ? "high" : "normal",
          requiredBy: item.needByDate ?? null,
          indentId: 0,         // filled by createPurchaseIndent
        } as any)),
      } as any);

      sendPushToSection("purchase_indents_view", "Purchase Indent Raised", `${indent.indentNo} raised from IRN ${irn.irnNo}`, "/plant/purchase-indents").catch(() => {});
      res.status(201).json(indent);
    } catch (err) {
      console.error("Error raising PI from IRN:", err);
      res.status(500).json({ message: "Failed to raise PI" });
    }
  });

  app.get("/api/irn", async (req, res) => {
    try {
      if (!assertAuthed(req, res)) return;
      const { status, dateFrom, dateTo } = req.query as Record<string, string | undefined>;
      const irns = await storage.getInternalRequisitions({ status, dateFrom, dateTo });
      res.json(irns);
    } catch (err) {
      console.error("Error fetching IRNs:", err);
      res.status(500).json({ message: "Failed to fetch IRNs" });
    }
  });

  app.get("/api/irn/:id", async (req, res) => {
    try {
      if (!assertAuthed(req, res)) return;
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid IRN id" });
      const irn = await storage.getInternalRequisition(id);
      if (!irn) return res.status(404).json({ message: "IRN not found" });
      res.json(irn);
    } catch (err) {
      console.error("Error fetching IRN:", err);
      res.status(500).json({ message: "Failed to fetch IRN" });
    }
  });

  app.post("/api/irn", async (req, res) => {
    try {
      if (!assertCreate(req, res, "irn_raise")) return;
      const parsed = createIrnRequestSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Validation error" });
      const irn = await storage.createInternalRequisition(parsed.data);
      sendPushToSection("irn_view", "New IRN Raised", `${irn.irnNo} raised by ${irn.raisedBy}`, "/irn").catch(() => {});
      res.status(201).json(irn);
    } catch (err) {
      console.error("Error creating IRN:", err);
      res.status(500).json({ message: "Failed to create IRN" });
    }
  });

  app.patch("/api/irn/:id/stores-verify", async (req, res) => {
    try {
      if (!assertCreate(req, res, "stores_inventory")) return;
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid IRN id" });
      const parsed = storesVerifyIrnSchema.safeParse({ ...req.body, verifiedBy: currentUserName(req) });
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Validation error" });

      // Server-side quantity validation: issue+queue cannot exceed requested qty
      const existingIrn = await storage.getInternalRequisition(id);
      if (!existingIrn) return res.status(404).json({ message: "IRN not found" });
      for (const vi of parsed.data.items) {
        const originalItem = (existingIrn as any).items?.find((i: any) => i.id === vi.itemId);
        if (!originalItem) continue;
        const reqQty = Number(originalItem.qty);
        const issueQ = Number(vi.issueQty ?? 0);
        const procureQ = Number(vi.procureQty ?? 0);
        if (issueQ > reqQty) {
          return res.status(400).json({
            message: `Issue qty for "${originalItem.material}" (${issueQ} ${originalItem.uom}) cannot exceed requested qty (${reqQty} ${originalItem.uom})`
          });
        }
        if (issueQ + procureQ > reqQty) {
          return res.status(400).json({
            message: `Issue + Queue qty for "${originalItem.material}" (${issueQ + procureQ} ${originalItem.uom}) cannot exceed requested qty (${reqQty} ${originalItem.uom})`
          });
        }
      }

      const irn = await storage.storesVerifyIrn(id, parsed.data);
      if (!irn) return res.status(404).json({ message: "IRN not found" });
      sendPushToSection("irn_view", "IRN Stores Verified", `${irn.irnNo} verified by stores`, "/irn").catch(() => {});
      res.json(irn);
    } catch (err) {
      console.error("Error verifying IRN:", err);
      res.status(500).json({ message: "Failed to verify IRN" });
    }
  });

  app.patch("/api/irn/:id/approve", async (req, res) => {
    try {
      if (!assertApprove(req, res, "irn_approve")) return;
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid IRN id" });
      const existing = await storage.getInternalRequisition(id);
      if (!existing) return res.status(404).json({ message: "IRN not found" });
      if (existing.status !== "stores_verified") {
        return res.status(400).json({ message: "IRN must be stores-verified before approval" });
      }
      // self-approval prevention (admins are exempt)
      const currentUserId = req.authUser?.id ?? null;
      if (!req.authUser?.isAdmin && currentUserId && existing.raisedByUserId && currentUserId === existing.raisedByUserId) {
        return res.status(403).json({ message: "You cannot approve your own requisition" });
      }
      const parsed = approveIrnSchema.safeParse({ ...req.body, actionBy: currentUserName(req) });
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Validation error" });
      const irn = await storage.approveIrn(id, parsed.data);
      if (!irn) return res.status(404).json({ message: "IRN not found" });
      if (parsed.data.action === "approve") {
        sendPushToSection("irn_view", "IRN Approved", `${irn.irnNo} approved by ${parsed.data.actionBy}`, "/irn").catch(() => {});
      } else {
        sendPushToSection("irn_view", "IRN Rejected", `${irn.irnNo} rejected by ${parsed.data.actionBy}`, "/irn").catch(() => {});
      }
      res.json(irn);
    } catch (err) {
      console.error("Error approving IRN:", err);
      res.status(500).json({ message: "Failed to process IRN approval" });
    }
  });

  app.patch("/api/irn/:id/close", async (req, res) => {
    try {
      if (!req.authUser) return res.status(401).json({ error: "not_authenticated" });
      const m = req.authPermissions;
      const canApprove = req.authUser.isAdmin || !!(m?.["irn_approve"]?.approve);
      const canStores = req.authUser.isAdmin || !!(m?.["stores_inventory"]?.create);
      if (!canApprove && !canStores) {
        return res.status(403).json({ error: "forbidden", message: "You do not have permission to close IRNs" });
      }
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid IRN id" });
      const existing = await storage.getInternalRequisition(id);
      if (!existing) return res.status(404).json({ message: "IRN not found" });
      if (existing.status !== "approved" && existing.status !== "stores_verified") {
        return res.status(400).json({ message: "Only approved or stores-verified IRNs can be closed" });
      }
      const hasUnissuedItems = existing.items.some((item: any) => item.itemStatus !== "issued");
      if (hasUnissuedItems) {
        return res.status(400).json({ message: "All items must be issued before this IRN can be closed" });
      }
      const irn = await storage.closeIrn(id, currentUserName(req));
      if (!irn) return res.status(404).json({ message: "IRN not found" });
      sendPushToSection("irn_view", "IRN Closed", `${irn.irnNo} marked as fulfilled`, "/irn").catch(() => {});
      res.json(irn);
    } catch (err) {
      console.error("Error closing IRN:", err);
      res.status(500).json({ message: "Failed to close IRN" });
    }
  });

  app.patch("/api/irn/:id/reopen", async (req, res) => {
    try {
      if (!req.authUser) return res.status(401).json({ error: "not_authenticated" });
      const m = req.authPermissions;
      const canReopen = req.authUser.isAdmin || !!(m?.["irn_approve"]?.approve);
      if (!canReopen) {
        return res.status(403).json({ error: "forbidden", message: "You do not have permission to reopen IRNs" });
      }
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid IRN id" });
      const existing = await storage.getInternalRequisition(id);
      if (!existing) return res.status(404).json({ message: "IRN not found" });
      if (existing.status !== "closed") {
        return res.status(400).json({ message: "Only closed IRNs can be reopened" });
      }
      const irn = await storage.reopenIrn(id, currentUserName(req));
      if (!irn) return res.status(404).json({ message: "IRN not found" });
      res.json(irn);
    } catch (err) {
      console.error("Error reopening IRN:", err);
      res.status(500).json({ message: "Failed to reopen IRN" });
    }
  });

  app.get("/api/irn/:id/audit-logs", async (req, res) => {
    try {
      if (!req.authUser) return res.status(401).json({ error: "not_authenticated" });
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid IRN id" });
      const logs = await storage.getIrnAuditLogs(id);
      res.json(logs);
    } catch (err) {
      console.error("Error fetching IRN audit logs:", err);
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });

  app.delete("/api/irn/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid IRN id" });
      const ok = await storage.deleteInternalRequisition(id);
      if (!ok) return res.status(404).json({ message: "IRN not found" });
      res.json({ ok: true });
    } catch (err) {
      console.error("Error deleting IRN:", err);
      res.status(500).json({ message: "Failed to delete IRN" });
    }
  });

  app.patch("/api/irn/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid IRN id" });
      const existing = await storage.getInternalRequisition(id);
      if (!existing) return res.status(404).json({ message: "IRN not found" });
      if (existing.status !== "pending_stores" && !req.authUser?.isAdmin) {
        return res.status(400).json({ message: "IRN can only be edited while pending stores verification" });
      }
      const parsed = createIrnRequestSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Validation error" });
      const irn = await storage.updateInternalRequisition(id, parsed.data);
      if (!irn) return res.status(404).json({ message: "IRN not found" });
      res.json(irn);
    } catch (err) {
      console.error("Error updating IRN:", err);
      res.status(500).json({ message: "Failed to update IRN" });
    }
  });

  app.post("/api/irn/:id/record-issue", async (req, res) => {
    try {
      if (!assertCreate(req, res, "stores_inventory")) return;
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid IRN id" });
      const parsed = recordIrnIssueSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Validation error" });
      // Vehicle fields mandatory when deliveryMode is "vehicle"
      if (parsed.data.deliveryMode === "vehicle") {
        if (!parsed.data.vehicleNo?.trim()) return res.status(400).json({ message: "Vehicle number is required for vehicle delivery" });
        if (!parsed.data.vehicleType?.trim()) return res.status(400).json({ message: "Vehicle type is required for vehicle delivery" });
        if (!parsed.data.driverName?.trim()) return res.status(400).json({ message: "Driver name is required for vehicle delivery" });
      }
      const issue = await storage.createIrnIssueVoucher(id, parsed.data);
      sendPushToSection("irn_view", "Issue Voucher Recorded", `Issue ${issue.issueNumber} recorded for IRN`, "/irn").catch(() => {});
      res.status(201).json(issue);
    } catch (err: any) {
      const msg = err?.message ?? "Failed to record issue voucher";
      if (msg.includes("must be in approved") || msg.includes("exceeds remaining balance")) {
        return res.status(400).json({ message: msg });
      }
      console.error("POST /api/irn/:id/record-issue:", err);
      res.status(500).json({ message: msg });
    }
  });

  app.get("/api/irn/:id/issue-vouchers", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid IRN id" });
      const vouchers = await storage.getIrnIssueVouchers(id);
      res.json(vouchers);
    } catch (err) {
      console.error("GET /api/irn/:id/issue-vouchers:", err);
      res.status(500).json({ message: "Failed to fetch issue vouchers" });
    }
  });

  app.get("/api/irn/:id/issue-voucher", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid IRN id" });
      const irn = await storage.getInternalRequisition(id);
      if (!irn) return res.status(404).json({ message: "IRN not found" });
      if (!["approved", "issued", "partially_issued"].includes(irn.status)) {
        return res.status(400).json({ message: "Issue voucher PDF is only available for approved or issued IRNs" });
      }

      // Optional voucherId param — prints that specific voucher's data
      const voucherIdParam = req.query.voucherId ? Number(req.query.voucherId) : null;
      let specificVoucher: any = null;
      if (voucherIdParam && !isNaN(voucherIdParam)) {
        specificVoucher = await storage.getStoreIssue(voucherIdParam);
      }
      if (!specificVoucher && !voucherIdParam) {
        // Default: latest voucher if any exist
        const allVouchers = await storage.getIrnIssueVouchers(id);
        if (allVouchers.length > 0) specificVoucher = allVouchers[allVouchers.length - 1];
      }

      const issueItems = specificVoucher
        ? specificVoucher.items.map((vi: any) => ({
            material: vi.materialText ?? vi.itemName ?? "—",
            qty: irn.items.find((i: any) => i.material === (vi.materialText ?? vi.itemName))?.qty ?? vi.qty,
            issueQty: vi.qty,
            uom: vi.uom,
          }))
        : irn.items.filter((i: any) => i.issueQty && Number(i.issueQty) > 0);
      if (issueItems.length === 0) {
        return res.status(400).json({ message: "No items flagged for issue from store" });
      }

      const fmtDate = (dateStr: string | null | undefined) => {
        if (!dateStr) return "-";
        try {
          const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
          const d = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : ""));
          if (Number.isNaN(d.getTime())) return dateStr;
          return `${String(d.getDate()).padStart(2, "0")}-${months[d.getMonth()]}-${d.getFullYear()}`;
        } catch { return dateStr; }
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
        res.setHeader("Content-Disposition", `attachment; filename="IssueVoucher-${irn.irnNo.replace(/\//g, "-")}.pdf"`);
        res.send(pdfBuffer);
      });

      const pageW = 515;
      const amber = "#d97706";
      const tableX = 40;

      const _irnCfg = await getCompanyConfig();
      const _irnLogoPath = getCompanyLogoPath(_irnCfg.logoFile);
      try {
        if (_irnLogoPath) {
          const logoWidth = 60;
          const logoX = (pageW - logoWidth) / 2 + tableX;
          const logoY = doc.y;
          doc.image(_irnLogoPath, logoX, logoY, { width: logoWidth });
          doc.y = logoY + 65;
        }
      } catch {}

      doc.fontSize(18).font("Helvetica-Bold").fillColor("#000").text(_irnCfg.companyName.toUpperCase(), { align: "center" });
      doc.moveDown(0.2);
      doc.fontSize(11).font("Helvetica").fillColor("#333").text("ISSUE VOUCHER", { align: "center" });
      doc.moveDown(0.5);

      doc.moveTo(tableX, doc.y).lineTo(tableX + pageW, doc.y).strokeColor(amber).lineWidth(2).stroke();
      doc.moveDown(0.5);

      const metaY = doc.y;
      doc.fillColor("#000").fontSize(10).font("Helvetica-Bold");
      doc.text(`IRN No: ${irn.irnNo}`, tableX, metaY);
      if (specificVoucher) {
        doc.text(`Voucher No: ${specificVoucher.issueNumber}`, tableX + 190, metaY);
        doc.text(`Date: ${fmtDate(specificVoucher.date)}`, tableX + 380, metaY);
      } else {
        doc.text(`Date: ${fmtDate(irn.date)}`, tableX + 380, metaY);
      }
      doc.moveDown(0.4);
      doc.font("Helvetica").fontSize(10);
      doc.text(`Raised By: ${irn.raisedBy}`, tableX);
      doc.text(`Section: ${irn.raisedFrom}`, tableX + 300, doc.y - 14);
      if (specificVoucher?.issuedBy || specificVoucher?.receivedBy) {
        doc.moveDown(0.2);
        doc.font("Helvetica").fontSize(10);
        if (specificVoucher.issuedBy) doc.text(`Issued By: ${specificVoucher.issuedBy}`, tableX);
        if (specificVoucher.receivedBy) doc.text(`Received By: ${specificVoucher.receivedBy}`, tableX + 300, doc.y - 14);
        if (specificVoucher.vehicleNo) {
          doc.moveDown(0.2);
          doc.text(`Vehicle: ${specificVoucher.vehicleType ?? ""} ${specificVoucher.vehicleNo}`, tableX);
          if (specificVoucher.driverName) doc.text(`Driver: ${specificVoucher.driverName}`, tableX + 300, doc.y - 14);
        }
      }
      doc.moveDown(0.8);

      const colWidths = [25, 225, 80, 80, 105];
      const headers = ["#", "Material / Description", "Qty Req.", "Issue Qty", "UOM"];
      let y = doc.y;

      doc.fillColor("#fff").rect(tableX, y, pageW, 20).fill(amber);
      doc.fillColor("#fff").fontSize(9).font("Helvetica-Bold");
      let cx = tableX;
      headers.forEach((h, i) => {
        const align = i >= 2 ? "center" : "left";
        doc.text(h, cx + 4, y + 5, { width: colWidths[i] - 8, align, lineBreak: false });
        cx += colWidths[i];
      });
      y += 20;

      issueItems.forEach((item: any, idx: number) => {
        const matText = item.material || "";
        const purposeText = item.purpose ? item.purpose : "";
        const matH = doc.heightOfString(matText, { width: colWidths[1] - 8, fontSize: 9 });
        const purposeH = purposeText ? doc.heightOfString(purposeText, { width: colWidths[1] - 8, fontSize: 7 }) + 2 : 0;
        const rowH = Math.max(20, matH + purposeH + 8);

        if (y + rowH > 720) { doc.addPage(); y = 40; }

        const bgColor = idx % 2 === 0 ? "#fff" : "#f9f9f9";
        doc.fillColor(bgColor).rect(tableX, y, pageW, rowH).fill();

        cx = tableX;
        doc.fillColor("#000").fontSize(9).font("Helvetica");
        doc.text(String(idx + 1), cx + 4, y + 4, { width: colWidths[0] - 8, align: "center", lineBreak: false });
        cx += colWidths[0];

        doc.text(matText, cx + 4, y + 4, { width: colWidths[1] - 8, align: "left", lineBreak: true });
        if (purposeText) {
          doc.fillColor("#666").fontSize(7).font("Helvetica-Oblique");
          doc.text(purposeText, cx + 4, y + 4 + matH + 1, { width: colWidths[1] - 8, align: "left", lineBreak: false });
          doc.fillColor("#000").fontSize(9).font("Helvetica");
        }
        cx += colWidths[1];

        doc.text(fmtQty(item.qty), cx + 4, y + 4, { width: colWidths[2] - 8, align: "center", lineBreak: false });
        cx += colWidths[2];

        doc.fillColor("#15803d").font("Helvetica-Bold");
        doc.text(fmtQty(item.issueQty), cx + 4, y + 4, { width: colWidths[3] - 8, align: "center", lineBreak: false });
        cx += colWidths[3];

        doc.fillColor("#000").font("Helvetica");
        doc.text(item.uom || "-", cx + 4, y + 4, { width: colWidths[4] - 8, align: "center", lineBreak: false });

        y += rowH;
      });

      doc.strokeColor("#999").lineWidth(0.5);
      doc.moveTo(tableX, y).lineTo(tableX + pageW, y).stroke();

      if (y + 24 > 720) { doc.addPage(); y = 40; }
      doc.fillColor(amber).rect(tableX, y, pageW, 24).fill();
      doc.fillColor("#fff").fontSize(10).font("Helvetica-Bold");
      doc.text(`TOTAL ISSUE ITEMS: ${issueItems.length}`, tableX + 4, y + 7, { width: pageW - 8, align: "left" });
      y += 24;

      if (irn.storesRemarks) {
        if (y + 40 > 720) { doc.addPage(); y = 40; }
        y += 16;
        doc.fillColor("#555").fontSize(9).font("Helvetica-Oblique");
        doc.text(`Stores Remarks: ${irn.storesRemarks}`, tableX, y, { width: pageW });
        y = doc.y + 8;
      }

      if (y + 140 > 720) { doc.addPage(); y = 40; }
      y += 40;

      const signCols = specificVoucher
        ? ["Raised By", "Approved By", "Issued By", "Received By"]
        : ["Raised By", "Stores Verified By", "Approved By"];
      const signAreaW = Math.floor(pageW / signCols.length);
      const signNames = specificVoucher
        ? [irn.raisedBy || "", irn.approvedBy || "", specificVoucher.issuedBy || "", specificVoucher.receivedBy || ""]
        : [irn.raisedBy || "", irn.storesVerifiedBy || "", irn.approvedBy || ""];

      doc.fillColor("#000").fontSize(9).font("Helvetica");
      signCols.forEach((col, i) => {
        doc.text(col, tableX + signAreaW * i, y, { width: signAreaW, align: "center" });
      });
      y += 40;

      signCols.forEach((_, i) => {
        const sx = tableX + signAreaW * i;
        doc.moveTo(sx + 8, y).lineTo(sx + signAreaW - 8, y).strokeColor("#000").lineWidth(0.5).stroke();
      });
      y += 6;

      doc.fontSize(9).font("Helvetica-Bold").fillColor("#000");
      signNames.forEach((name, i) => {
        doc.text(name, tableX + signAreaW * i, y, { width: signAreaW, align: "center" });
      });
      y += 14;

      doc.fontSize(8).font("Helvetica").fillColor("#555");
      if (!specificVoucher) {
        if (irn.storesVerifiedAt) {
          doc.text(new Date(irn.storesVerifiedAt).toLocaleString("en-IN"), tableX + signAreaW, y, { width: signAreaW, align: "center" });
        }
        if (irn.approvedAt) {
          doc.text(new Date(irn.approvedAt).toLocaleString("en-IN"), tableX + signAreaW * 2, y, { width: signAreaW, align: "center" });
        }
      } else if (specificVoucher.issuedAt) {
        doc.text(new Date(specificVoucher.issuedAt).toLocaleString("en-IN"), tableX + signAreaW * 2, y, { width: signAreaW, align: "center" });
      }

      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.fillColor("#555").fontSize(8).font("Helvetica");
        doc.text(`Generated: ${new Date().toLocaleString("en-IN")}`, tableX, 800, { width: pageW / 2, align: "left" });
        doc.text(`Page ${i + 1} of ${pages.count}`, tableX + pageW / 2, 800, { width: pageW / 2, align: "right" });
      }

      doc.end();
    } catch (err) {
      console.error("Error generating IRN issue voucher PDF:", err);
      res.status(500).json({ message: "Failed to generate issue voucher PDF" });
    }
  });

  app.patch("/api/purchase-indent-items/:id/procure", async (req, res) => {
    try {
      if (!assertEdit(req, res, "site_procurement")) return;
      const itemId = Number(req.params.id);
      const procureSchema = z.object({
        action: z.enum(["ordered", "received"]),
        vendor: z.string().optional(),
        rate: z.coerce.number().optional(),
        qtyPurchased: z.coerce.number().optional(),
        expectedDelivery: z.string().optional(),
        orderPlacedAt: z.string().optional(),
        paymentMode: z.string().optional(),
        billNo: z.string().optional(),
        purchaseRemarks: z.string().optional(),
        purchasedBy: z.string().optional(),
      });
      const data = procureSchema.parse(req.body);
      const actionBy = currentUserName(req);
      const item = await storage.procureItem(itemId, data, actionBy);
      if (!item) return res.status(404).json({ message: "Purchase indent item not found" });
      sendPushToSection("purchase_indents_view", "Procurement Update", `"${item.description}" marked ${data.action.toUpperCase()}${data.vendor ? ` — ${data.vendor.toUpperCase()}` : ""}`, "/plant/purchase-indents").catch(() => {});
      res.json(item);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      if (err instanceof Error && err.message.startsWith("Cannot ")) return res.status(400).json({ message: err.message });
      console.error("Error procuring item:", err);
      res.status(500).json({ message: "Failed to update procurement status" });
    }
  });

  app.post("/api/purchase-indents/:id/notify", async (req, res) => {
    try {
      if (!assertEdit(req, res, "site_procurement")) return;
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
      sendPushToSection("purchase_indents_view", "PI Review Requested", body, "/plant/purchase-indents").catch(() => {});
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

  app.get("/api/purchase-indent-items/recent-items", async (req, res) => {
    try {
      if (!assertView(req, res, "site_procurement")) return;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;
      const ids = await storage.getRecentIndentItemIds(limit);
      res.json(ids);
    } catch (err) {
      console.error("GET /api/purchase-indent-items/recent-items:", err);
      res.status(500).json({ error: "Failed to fetch recent indent items" });
    }
  });

  app.patch("/api/purchase-indent-items/:id/purchase-update", async (req, res) => {
    try {
      if (!assertEdit(req, res, "site_procurement")) return;
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
        expectedDelivery: z.string().optional(),
        orderPlacedAt: z.string().optional(),
        paymentMode: z.string().optional(),
      });
      const { actionBy, ...purchaseData } = updateSchema.parse(req.body);
      const item = await storage.updatePurchaseItemStatus(itemId, purchaseData, actionBy || "SYSTEM");
      if (!item) {
        return res.status(404).json({ message: "Purchase indent item not found" });
      }
      if (purchaseData.purchaseStatus) {
        sendPushToSection("purchase_indents_view", "Purchase Update", `Item "${item.description}" - ${purchaseData.purchaseStatus.toUpperCase()}${purchaseData.vendor ? ` from ${purchaseData.vendor.toUpperCase()}` : ""}`, "/plant/purchase-indents").catch(() => {});
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
      sendPushToSection("purchase_indents_view", "Item Cancelled", `"${item.description}" cancelled by ${cancelledBy}`, "/plant/purchase-indents").catch(() => {});
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
      if (!assertEdit(req, res, "site_procurement")) return;
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
      sendPushToSection("purchase_indents_view", "Indent Force Closed", `${indent.indentNo} force closed by ADMIN`, "/plant/purchase-indents").catch(() => {});
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

      // Permission check: non-pending records require admin.
      if (existing.status !== "pending") {
        if (!assertAdmin(req, res)) return;
      } else {
        if (!assertEdit(req, res, "site_procurement")) return;
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
  // PI ITEM TRANSACTIONS (dual-route)
  // ============================================

  app.get("/api/purchase-indents/:id/transactions", async (req, res) => {
    try {
      const indentId = Number(req.params.id);
      const txns = await storage.getPiItemTransactions(indentId);
      res.json(txns);
    } catch (err) {
      console.error("GET /api/purchase-indents/:id/transactions:", err);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  app.post("/api/purchase-indents/:id/purchaser-action", async (req, res) => {
    try {
      const indentId = Number(req.params.id);
      const actionBy = currentUserName(req);
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "items array is required" });
      }
      await storage.submitPurchaserAction(indentId, items, actionBy);
      const indent = await storage.getPurchaseIndent(indentId);
      res.json(indent);
    } catch (err) {
      console.error("POST /api/purchase-indents/:id/purchaser-action:", err);
      res.status(500).json({ message: String((err as Error).message) });
    }
  });

  app.post("/api/purchase-indent-items/:itemId/handover", async (req, res) => {
    try {
      const indentItemId = Number(req.params.itemId);
      const actionBy = currentUserName(req);
      const { indentId, handoverQty, acceptedQty, rejectedQty, handoverDate, receivedBy, storesRemarks, remarks } = req.body;
      if (!indentId || handoverQty == null || acceptedQty == null || rejectedQty == null) {
        return res.status(400).json({ message: "indentId, handoverQty, acceptedQty, rejectedQty required" });
      }
      const txn = await storage.submitHandover({ indentItemId, indentId: Number(indentId), handoverQty: Number(handoverQty), acceptedQty: Number(acceptedQty), rejectedQty: Number(rejectedQty), handoverDate, receivedBy, storesRemarks, remarks }, actionBy);
      res.json(txn);
    } catch (err) {
      console.error("POST /api/purchase-indent-items/:itemId/handover:", err);
      res.status(500).json({ message: String((err as Error).message) });
    }
  });

  app.post("/api/purchase-indents/:id/bulk-receipt", async (req, res) => {
    try {
      const indentId = Number(req.params.id);
      const actionBy = currentUserName(req);
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "items array is required" });
      }
      await storage.recordBulkMaterialReceipt(indentId, items, actionBy);
      const indent = await storage.getPurchaseIndent(indentId);
      res.json(indent);
    } catch (err) {
      console.error("POST /api/purchase-indents/:id/bulk-receipt:", err);
      res.status(500).json({ message: String((err as Error).message) });
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
      const rawRows = await storage.getDieselComparisonReport(dateFrom, dateTo);
      const dateWise = rawRows.map((row: any) => ({
        date: row.date,
        planned: row.totalPlanned,
        purchased: row.totalPurchased ?? null,
        actual: row.totalActualIssued ?? null,
      }));
      const totals = {
        totalPlanned: dateWise.reduce((s: number, r: any) => s + (r.planned || 0), 0),
        totalPurchased: dateWise.reduce((s: number, r: any) => s + (r.purchased || 0), 0),
        totalActual: dateWise.reduce((s: number, r: any) => s + (r.actual || 0), 0),
      };
      res.json({ dateWise, totals, equipmentWise: [] });
    } catch (err) {
      console.error("Error fetching diesel comparison report:", err);
      res.status(500).json({ message: "Failed to fetch diesel comparison report" });
    }
  });

  app.get("/api/diesel-requirements/recent-items", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;
      const ids = await storage.getRecentDieselItemIds(limit);
      res.json(ids);
    } catch (err) {
      console.error("GET /api/diesel-requirements/recent-items:", err);
      res.status(500).json({ error: "Failed to fetch recent diesel items" });
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
      if (!assertCreate(req, res, "site_diesel")) return;
      const input = createDieselRequirementRequestSchema.parse(req.body);
      const requirement = await storage.createDieselRequirement(input);
      sendPushToSection("diesel_req_approve", "New Diesel Requirement", `${requirement.date} - ${requirement.totalPlanned} L planned`, "/plant/diesel-requirements").catch(() => {});
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

      if (!assertApprove(req, res, "diesel_req_approve")) return;
      // Self-approval prevention.
      const existingDr = await storage.getDieselRequirement(id);
      if (!req.authUser?.isAdmin && existingDr && existingDr.authorUserId && existingDr.authorUserId === req.authUser?.id) {
        return res.status(403).json({ message: "You cannot approve a record you raised." });
      }
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
      sendPushToSection("diesel_req_raise", "Diesel Approved", `${requirement.date} - ${requirement.totalApproved} L approved by ${approvedBy}`, "/plant/diesel-requirements").catch(() => {});
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

      if (!assertApprove(req, res, "diesel_req_approve")) return;
      const rejectedBy = currentUserName(req);

      if (!reason || typeof reason !== "string") {
        return res.status(400).json({ message: "Rejection reason is required" });
      }

      const requirement = await storage.rejectDieselRequirement(id, reason, rejectedBy);
      if (!requirement) {
        return res.status(404).json({ message: "Diesel requirement not found" });
      }
      sendPushToSection("diesel_req_raise", "Diesel Rejected", `${requirement.date} rejected by ${rejectedBy}`, "/plant/diesel-requirements").catch(() => {});
      res.json(requirement);
    } catch (err) {
      console.error("Error rejecting diesel requirement:", err);
      res.status(500).json({ message: "Failed to reject diesel requirement" });
    }
  });

  app.patch("/api/diesel-requirements/:id/purchase-update", async (req, res) => {
    try {
      if (!assertEdit(req, res, "site_diesel")) return;
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

      // Permission check: non-pending records require admin.
      if (existing.status !== "pending") {
        if (!assertAdmin(req, res)) return;
      } else {
        if (!assertEdit(req, res, "site_diesel")) return;
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

      // Per-bill numbers. Bills are internal-only records, so a single GST
      // total is shown — no CGST/SGST/IGST split.
      type BillRow = {
        billNo: string; date: string; vendor: string; category: string;
        taxable: number; gst: number; total: number;
      };
      const detailRows: BillRow[] = bills.map(b => {
        const taxable = b.totalAmount || 0;
        const cat = computeBillGstByCategory(b);
        const gst = cat.equipment + cat.material + cat.transport + cat.labour + cat.other;
        return {
          billNo: b.billNo,
          date: b.billDate,
          vendor: b.vendorName,
          category: (b.billType || "other").toLowerCase(),
          taxable,
          gst,
          total: taxable + gst,
        };
      });

      const totals = aggregateGstBreakdown(bills);
      const totalTaxable = bills.reduce((s, b) => s + (b.totalAmount || 0), 0);
      const grandTotal = totalTaxable + totals.total;

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
        const _vbCsvCfg = await getCompanyConfig();
        lines.push(toLine([`${reportLabel} — Cover Sheet`]));
        lines.push(toLine([_vbCsvCfg.companyName]));
        lines.push(toLine([`Range: ${rangeLabel}`]));
        lines.push(toLine([`Vendor: ${vendorScope}`]));
        lines.push(toLine([`Status filter: ${status && status !== "all" ? status : "all"}`]));
        lines.push(toLine([`Category filter: ${categoryFilter !== "all" ? categoryFilter : "all"}`]));
        lines.push(toLine([`Bills in range: ${bills.length}`]));
        lines.push(toLine([`Totals: Taxable ${fmtNum(totalTaxable)} + GST ${fmtNum(totals.total)} = ${fmtNum(grandTotal)}`]));
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
        lines.push(toLine(["Bill No", "Date", "Vendor", "Category", "Taxable", "GST", "Total"]));
        if (detailRows.length === 0) {
          lines.push(toLine(["—", "—", "—", "—", "—", "—", "—"]));
        } else {
          for (const r of detailRows) {
            lines.push(toLine([r.billNo, r.date, r.vendor, r.category, fmtNum(r.taxable), fmtNum(r.gst), fmtNum(r.total)]));
          }
          lines.push(toLine(["TOTAL", "", "", "", fmtNum(totalTaxable), fmtNum(totals.total), fmtNum(grandTotal)]));
        }
        const body = "\uFEFF" + lines.join("\r\n") + "\r\n";
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}.csv"`);
        res.send(body);
        return;
      }

      // xlsx — Summary sheet (cover + category + vendor) and Detail sheet.
      const wb = xlsx.utils.book_new();
      const _vbXlsxCfg = await getCompanyConfig();
      const summaryAoa: any[][] = [
        [`${reportLabel} — Cover Sheet`],
        [_vbXlsxCfg.companyName],
        [`Range: ${rangeLabel}`],
        [`Vendor: ${vendorScope}`],
        [`Status filter: ${status && status !== "all" ? status : "all"}`],
        [`Category filter: ${categoryFilter !== "all" ? categoryFilter : "all"}`],
        [`Bills in range: ${bills.length}`],
        [`Totals: Taxable ${fmtNum(totalTaxable)} + GST ${fmtNum(totals.total)} = ${fmtNum(grandTotal)}`],
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
        ["Bill No", "Date", "Vendor", "Category", "Taxable", "GST", "Total"],
      ];
      if (detailRows.length === 0) {
        detailAoa.push(["—", "—", "—", "—", "—", "—", "—"]);
      } else {
        for (const r of detailRows) {
          detailAoa.push([r.billNo, r.date, r.vendor, r.category, fmtNum(r.taxable), fmtNum(r.gst), fmtNum(r.total)]);
        }
        detailAoa.push(["TOTAL", "", "", "", fmtNum(totalTaxable), fmtNum(totals.total), fmtNum(grandTotal)]);
      }
      const detailSheet = xlsx.utils.aoa_to_sheet(detailAoa);
      (detailSheet as any)["!cols"] = [
        { wch: 18 }, { wch: 12 }, { wch: 28 }, { wch: 12 },
        { wch: 14 }, { wch: 14 }, { wch: 14 },
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
      if (!assertCreate(req, res, "admin_settings")) return;
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
      if (!assertAdmin(req, res)) return;
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
      if (!assertCreate(req, res, "vendor_bills")) return;
      const input = createVendorBillRequestSchema.parse(req.body);
      const bill = await storage.createVendorBill(input);
      sendPushToSection("vendor_bills_approve", "New Vendor Bill", `${bill.billNo} - ${bill.vendorName}`, "/plant/vendor-bills").catch(() => {});
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

      // Permission check: verified/approved/paid bills require admin.
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
        if (!assertApprove(req, res, "vendor_bills_approve")) return;
        // Self-approval prevention for vendor bills.
        const vbForApproval = await storage.getVendorBill(id);
        if (!req.authUser?.isAdmin && vbForApproval && vbForApproval.authorUserId && vbForApproval.authorUserId === req.authUser?.id) {
          return res.status(403).json({ message: "You cannot approve a bill you created." });
        }
      } else if (status === "verified") {
        if (!assertApprove(req, res, "vendor_bills_verify")) return;
        // Self-approval prevention for verification too.
        const vbForVerify = await storage.getVendorBill(id);
        if (!req.authUser?.isAdmin && vbForVerify && vbForVerify.authorUserId && vbForVerify.authorUserId === req.authUser?.id) {
          return res.status(403).json({ message: "You cannot verify a bill you created." });
        }
      } else if (status === "paid") {
        if (!assertApprove(req, res, "vendor_bills_approve")) return;
      } else {
        if (!assertEdit(req, res, "vendor_bills")) return;
      }
      const actor = currentUserName(req);

      const bill = await storage.updateVendorBillStatus(id, status, actor);
      if (!bill) {
        return res.status(404).json({ message: "Vendor bill not found" });
      }
      if (status === "approved") {
        sendPushToSection("vendor_bills_raise", "Vendor Bill Approved", `${bill.billNo} approved by ${actor}`, "/plant/vendor-bills").catch(() => {});
        sendPushToRaiser(bill.authorUserId, bill.vendorName, "Your Bill Was Approved", `${bill.billNo} has been approved by ${actor}`, "/plant/vendor-bills").catch(() => {});
      } else if (status === "paid") {
        sendPushToSection("vendor_bills_raise", "Vendor Bill Paid", `${bill.billNo} marked paid by ${actor}`, "/plant/vendor-bills").catch(() => {});
        sendPushToRaiser(bill.authorUserId, bill.vendorName, "Your Bill Was Marked Paid", `${bill.billNo} has been marked as paid by ${actor}`, "/plant/vendor-bills").catch(() => {});
      } else if (status === "verified") {
        sendPushToSection("vendor_bills_approve", "Vendor Bill Verified", `${bill.billNo} verified by ${actor}`, "/plant/vendor-bills").catch(() => {});
      } else {
        sendPushToSection("vendor_bills_view", "Vendor Bill Updated", `${bill.billNo} - ${status.toUpperCase()} by ${actor}`, "/plant/vendor-bills").catch(() => {});
      }
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

      const _vbCfg = await getCompanyConfig();
      const _vbLogoPath = getCompanyLogoPath(_vbCfg.logoFile);
      try {
        if (_vbLogoPath) {
          const logoWidth = 60;
          const logoX = (pageW - logoWidth) / 2 + tableX;
          const logoY = doc.y;
          doc.image(_vbLogoPath, logoX, logoY, { width: logoWidth });
          doc.y = logoY + 65;
        }
      } catch {}
      doc.fontSize(18).font("Helvetica-Bold").fillColor("#000").text(_vbCfg.companyName.toUpperCase(), { align: "center" });
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
      if (!assertCreate(req, res, "admin_settings")) return;
      const card = await storage.upsertVendorRateCard(req.body);
      res.status(201).json(card);
    } catch (err) {
      console.error("Error creating vendor rate card:", err);
      res.status(500).json({ message: "Failed to create rate card" });
    }
  });

  app.post("/api/vendor-rate-cards/bulk-upsert", async (req, res) => {
    try {
      if (!assertCreate(req, res, "admin_settings")) return;
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
      if (!assertAdmin(req, res)) return;
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
      if (!assertCreate(req, res, "vendor_bills")) return;
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

  // One-time admin data fix — Task #427 (6mm Down ledger gap for LAXMI, dispatches 49 & 50)
  app.post("/api/admin/fix-ledger-gap-427", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const result = await storage.applyLedgerGapFix427();
      res.json(result);
    } catch (err) {
      console.error("Error applying ledger gap fix 427:", err);
      res.status(500).json({ message: "Failed to apply fix", error: String(err) });
    }
  });

  app.post("/api/admin/fix-orphan-stock-balances", async (req, res) => {
      try {
        if (!assertAdmin(req, res)) return;
        const result = await storage.fixOrphanStockBalances();
        res.json(result);
      } catch (err) {
        console.error("Error fixing orphan stock balances:", err);
        res.status(500).json({ message: "Failed to fix orphan balances", error: String(err) });
      }
    });

  // ====== SITE BACKFILL — assign siteId to historical diesel requirements & purchase indents ======

  app.get("/api/admin/site-backfill/unassigned", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const [drRows, piRows, siteRows] = await Promise.all([
        db.select({
          id: dieselRequirementsTable.id,
          date: dieselRequirementsTable.date,
          raisedBy: dieselRequirementsTable.raisedBy,
          status: dieselRequirementsTable.status,
          totalPlanned: dieselRequirementsTable.totalPlanned,
          totalApproved: dieselRequirementsTable.totalApproved,
        }).from(dieselRequirementsTable).where(isNull(dieselRequirementsTable.siteId)),
        db.select({
          id: purchaseIndentsTable.id,
          date: purchaseIndentsTable.date,
          indentNo: purchaseIndentsTable.indentNo,
          raisedBy: purchaseIndentsTable.raisedBy,
          status: purchaseIndentsTable.status,
        }).from(purchaseIndentsTable).where(isNull(purchaseIndentsTable.siteId)),
        db.select({ id: sitesTable.id, name: sitesTable.name }).from(sitesTable).orderBy(sitesTable.name),
      ]);
      res.json({ dieselRequirements: drRows, purchaseIndents: piRows, sites: siteRows });
    } catch (err) {
      console.error("Error fetching unassigned site records:", err);
      res.status(500).json({ message: "Failed to fetch unassigned records" });
    }
  });

  const assignSiteSchema = z.object({
    table: z.enum(["diesel_requirements", "purchase_indents"]),
    ids: z.array(z.number().int().positive()).min(1),
    siteId: z.number().int().positive(),
  });

  app.post("/api/admin/site-backfill/assign", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const { table, ids, siteId } = assignSiteSchema.parse(req.body);
      if (table === "diesel_requirements") {
        await db.update(dieselRequirementsTable)
          .set({ siteId })
          .where(drizzleInArray(dieselRequirementsTable.id, ids));
      } else {
        await db.update(purchaseIndentsTable)
          .set({ siteId })
          .where(drizzleInArray(purchaseIndentsTable.id, ids));
      }
      res.json({ updated: ids.length });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error assigning site to records:", err);
      res.status(500).json({ message: "Failed to assign site" });
    }
  });

    // ====== USERS DIRECTORY ======
  app.get("/api/users/directory", async (req, res) => {
    try {
      if (!assertAuthed(req, res)) return;
      const directory = await storage.getUsersDirectory();
      res.json(directory);
    } catch (err) {
      console.error("Error fetching users directory:", err);
      res.status(500).json({ message: "Failed to fetch users directory" });
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
      if (!assertMixCalcWrite(req, res, "create")) return;
      const { name, state, totalMt, totalAmt, contractorList, contractor } = req.body;
      if (!name || !state) return res.status(400).json({ message: "name and state required" });
      const createdBy = req.authUser?.id ?? null;
      const estimate = await storage.createMixEstimate({ name, state, totalMt: totalMt || 0, totalAmt: totalAmt || 0, contractorList: contractorList || "", contractor: contractor || null, createdBy });
      res.status(201).json(estimate);
    } catch (err) {
      console.error("Error creating mix estimate:", err);
      res.status(500).json({ message: "Failed to create estimate" });
    }
  });

  app.put("/api/mix-estimates/:id", async (req, res) => {
    try {
      if (!assertMixCalcWrite(req, res, "edit")) return;
      const id = parseInt(req.params.id);
      const existing = await storage.getMixEstimate(id);
      if (!existing) return res.status(404).json({ message: "Estimate not found" });
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
      if (!assertMixCalcWrite(req, res, "delete")) return;
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
      if (!assertMixCalcWrite(req, res, "create")) return;
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
      if (!assertMixCalcWrite(req, res, "edit")) return;
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
      if (!assertMixCalcWrite(req, res, "delete")) return;
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
      if (!assertMixCalcWrite(req, res, "edit")) return;
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
      if (!assertMixCalcWrite(req, res, "edit")) return;
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
      if (!assertCreate(req, res, "admin_settings")) return;
      const { name, contractor, structureType, grade, state, totalCum, totalAmt } = req.body;
      if (!name || !state) return res.status(400).json({ message: "name and state required" });
      const createdBy = req.authUser?.id ?? null;
      const estimate = await storage.createConcreteEstimate({ name, contractor: contractor || null, structureType: structureType || null, grade: grade || null, state, totalCum: totalCum || null, totalAmt: totalAmt || null, createdBy });
      res.status(201).json(estimate);
    } catch (err) {
      console.error("Error creating concrete estimate:", err);
      res.status(500).json({ message: "Failed to create estimate" });
    }
  });

  app.patch("/api/concrete-estimates/:id", async (req, res) => {
    try {
      if (!assertEdit(req, res, "admin_settings")) return;
      const id = parseInt(req.params.id);
      const existing = await storage.getConcreteEstimate(id);
      if (!existing) return res.status(404).json({ message: "Estimate not found" });
      const isAdmin = req.authUser?.isAdmin ?? false;
      const isOwner = existing.createdBy !== null && existing.createdBy === req.authUser?.id;
      if (!isAdmin && !isOwner) {
        return res.status(403).json({ message: "You can only edit your own estimates" });
      }
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
      if (!assertAdmin(req, res)) return;
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
      if (!assertCreate(req, res, "admin_settings")) return;
      const { name, contractor, structureType, state, totalLengthM, totalRmAmt } = req.body;
      if (!name || !state) return res.status(400).json({ message: "name and state required" });
      const createdBy = req.authUser?.id ?? null;
      const estimate = await storage.createConcreteEstimateV2({ name, contractor: contractor || null, structureType: structureType || null, state, totalLengthM: totalLengthM || null, totalRmAmt: totalRmAmt || null, createdBy });
      res.status(201).json(estimate);
    } catch (err) {
      console.error("Error creating concrete v2 estimate:", err);
      res.status(500).json({ message: "Failed to create estimate" });
    }
  });

  app.patch("/api/concrete/v2/estimates/:id", async (req, res) => {
    try {
      if (!assertEdit(req, res, "admin_settings")) return;
      const id = parseInt(req.params.id);
      const existing = await storage.getConcreteEstimateV2(id);
      if (!existing) return res.status(404).json({ message: "Estimate not found" });
      const isAdmin = req.authUser?.isAdmin ?? false;
      const isOwner = existing.createdBy !== null && existing.createdBy === req.authUser?.id;
      if (!isAdmin && !isOwner) {
        return res.status(403).json({ message: "You can only edit your own estimates" });
      }
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
      if (!assertAdmin(req, res)) return;
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteConcreteEstimateV2(id);
      if (!deleted) return res.status(404).json({ message: "Estimate not found" });
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting concrete v2 estimate:", err);
      res.status(500).json({ message: "Failed to delete estimate" });
    }
  });

  // ── STORES & INVENTORY ROUTES ────────────────────────────────────────────

  // Item Master
  app.get("/api/stores/items", async (req, res) => {
    try {
      if (!assertView(req, res, "stores_inventory")) return;
      const includeInactive = req.query.includeInactive === "true";
      const items = await storage.getStoreItems(includeInactive);
      res.json(items);
    } catch (err) {
      console.error("GET /api/stores/items:", err);
      res.status(500).json({ error: "Failed to fetch store items" });
    }
  });

  app.get("/api/stores/stock-balance", async (req, res) => {
    try {
      if (!assertView(req, res, "stores_inventory")) return;
      const items = await storage.getStoreItemsWithBalance();
      res.json(items);
    } catch (err) {
      console.error("GET /api/stores/stock-balance:", err);
      res.status(500).json({ error: "Failed to fetch stock balance" });
    }
  });

  app.post("/api/stores/items", async (req, res) => {
    try {
      if (!assertCreate(req, res, "stores_inventory")) return;
      const item = await storage.createStoreItem(req.body);
      res.status(201).json(item);
    } catch (err) {
      console.error("POST /api/stores/items:", err);
      res.status(500).json({ error: "Failed to create store item" });
    }
  });

  app.patch("/api/stores/items/:id", async (req, res) => {
    try {
      if (!assertEdit(req, res, "stores_inventory")) return;
      const item = await storage.updateStoreItem(parseInt(req.params.id), req.body);
      if (!item) return res.status(404).json({ error: "Not found" });
      res.json(item);
    } catch (err) {
      console.error("PATCH /api/stores/items/:id:", err);
      res.status(500).json({ error: "Failed to update store item" });
    }
  });

  app.post("/api/stores/items/:id/toggle", async (req, res) => {
    try {
      if (!assertEdit(req, res, "stores_inventory")) return;
      const item = await storage.toggleStoreItemActive(parseInt(req.params.id));
      if (!item) return res.status(404).json({ error: "Not found" });
      res.json(item);
    } catch (err) {
      console.error("POST /api/stores/items/:id/toggle:", err);
      res.status(500).json({ error: "Failed to toggle item" });
    }
  });

  // GRNs
  app.get("/api/stores/grns", async (req, res) => {
    try {
      if (!assertView(req, res, "stores_inventory")) return;
      const permittedIds = req.authUser && !req.authUser.isAdmin
        ? await storage.getUserPermittedSiteIds(req.authUser.id)
        : null;
      const grns = await storage.getStoreGrns({
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        supplier: req.query.supplier as string | undefined,
        indentRef: req.query.indentRef as string | undefined,
        siteId: req.query.siteId ? parseInt(req.query.siteId as string) : undefined,
        acceptanceStatus: req.query.acceptanceStatus as string | undefined,
        status: req.query.status as string | undefined,
        item: req.query.item as string | undefined,
        category: req.query.category as string | undefined,
        awaitingPi: req.query.awaitingPi === "true",
        ...(permittedIds !== null ? { permittedSiteIds: permittedIds } : {}),
      });
      res.json(grns);
    } catch (err) {
      console.error("GET /api/stores/grns:", err);
      res.status(500).json({ error: "Failed to fetch GRNs" });
    }
  });

  app.get("/api/stores/grns/supplier-history", async (req, res) => {
    try {
      if (!assertView(req, res, "stores_inventory")) return;
      const raw = (req.query.itemIds as string) || "";
      const itemIds = raw
        .split(",")
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n) && n > 0);
      const permittedSiteIds = req.authUser && !req.authUser.isAdmin
        ? await storage.getUserPermittedSiteIds(req.authUser.id)
        : undefined;
      const suppliers = await storage.getGrnSuppliersByItems(itemIds, permittedSiteIds ?? undefined);
      res.json(suppliers);
    } catch (err) {
      console.error("GET /api/stores/grns/supplier-history:", err);
      res.status(500).json({ error: "Failed to fetch supplier history" });
    }
  });

  app.get("/api/stores/grns/recent-items", async (req, res) => {
    try {
      if (!assertView(req, res, "stores_inventory")) return;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;
      const ids = await storage.getRecentGrnItemIds(limit);
      res.json(ids);
    } catch (err) {
      console.error("GET /api/stores/grns/recent-items:", err);
      res.status(500).json({ error: "Failed to fetch recent GRN items" });
    }
  });

  app.get("/api/stores/grns/recent-suppliers", async (req, res) => {
    try {
      if (!assertView(req, res, "stores_inventory")) return;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;
      const permittedIds = req.authUser && !req.authUser.isAdmin
        ? await storage.getUserPermittedSiteIds(req.authUser.id)
        : null;
      const suppliers = await storage.getRecentGrnSuppliers(limit, permittedIds ?? undefined);
      res.json(suppliers);
    } catch (err) {
      console.error("GET /api/stores/grns/recent-suppliers:", err);
      res.status(500).json({ error: "Failed to fetch recent GRN suppliers" });
    }
  });

  app.get("/api/stores/grns/stale", async (req, res) => {
    try {
      if (!assertView(req, res, "stores_inventory")) return;
      const rawHours = parseInt(req.query.thresholdHours as string, 10);
      const thresholdHours = Number.isFinite(rawHours) && rawHours > 0 && rawHours <= 8760 ? rawHours : 48;
      const permittedIds = req.authUser && !req.authUser.isAdmin
        ? await storage.getUserPermittedSiteIds(req.authUser.id)
        : null;
      const grns = await storage.getStaleGrns(thresholdHours, permittedIds ?? undefined);
      res.json(grns);
    } catch (err) {
      console.error("GET /api/stores/grns/stale:", err);
      res.status(500).json({ error: "Failed to fetch stale GRNs" });
    }
  });

  app.get("/api/stores/grns/:id", async (req, res) => {
    try {
      if (!assertView(req, res, "stores_inventory")) return;
      const grn = await storage.getStoreGrn(parseInt(req.params.id));
      if (!grn) return res.status(404).json({ error: "Not found" });
      // Permission System v2: check site access for detail
      if (req.authUser && !req.authUser.isAdmin && grn.siteId) {
        const permittedIds = await storage.getUserPermittedSiteIds(req.authUser.id);
        if (permittedIds !== null && !permittedIds.includes(grn.siteId)) {
          return res.status(403).json({ error: "Access denied for this site" });
        }
      }
      res.json(grn);
    } catch (err) {
      console.error("GET /api/stores/grns/:id:", err);
      res.status(500).json({ error: "Failed to fetch GRN" });
    }
  });

  app.post("/api/stores/grns", async (req, res) => {
    try {
      if (!assertCreate(req, res, "stores_inventory")) return;
      const { grn, items, grnCategory } = req.body;
      if (!grn || !items || !Array.isArray(items)) {
        return res.status(400).json({ error: "grn and items are required" });
      }

      // Server-side over-receipt guard: reject if any line would exceed its approved qty.
      // When grn.indentRef is set, all line items must carry indentItemId so the guard
      // cannot be bypassed by simply omitting the field on a crafted request.
      if (grn.indentRef) {
        const missingLink = (items as any[]).some(it => it.indentItemId == null);
        if (missingLink) {
          return res.status(400).json({ error: "All GRN line items must include indentItemId when creating against an indent" });
        }
        // Validate that every provided indentItemId actually belongs to this indent
        const validIndentItemIds = await storage.getIndentItemIdsForIndentNo(grn.indentRef);
        if (validIndentItemIds.size === 0) {
          return res.status(400).json({ error: `Indent "${grn.indentRef}" not found or has no items` });
        }
        const foreignIds = (items as any[]).filter(it => !validIndentItemIds.has(Number(it.indentItemId)));
        if (foreignIds.length > 0) {
          return res.status(400).json({ error: "One or more indentItemId values do not belong to the referenced indent" });
        }
      }
      const linkedItems = (items as any[]).filter(it => it.indentItemId != null);
      if (linkedItems.length > 0) {
        const violations = await storage.checkGrnOverReceipt(
          linkedItems.map(it => ({ indentItemId: Number(it.indentItemId), qty: parseFloat(it.qty) || 0 }))
        );
        if (violations.length > 0) {
          return res.status(422).json({ error: "Over-receipt blocked", details: violations });
        }
      }

      const result = await storage.createStoreGrn(grn, items, grnCategory || undefined);
      sendPushToSection("stores_inventory", "GRN Created", `${result.grnNo ?? "GRN"} — ${grn.supplierName ?? "Supplier"}`, "/stores").catch(() => {});
      res.status(201).json(result);
    } catch (err) {
      console.error("POST /api/stores/grns:", err);
      res.status(500).json({ error: "Failed to create GRN" });
    }
  });

  app.patch("/api/stores/grns/:id", async (req, res) => {
    try {
      if (!assertEdit(req, res, "stores_inventory")) return;
      const id = parseInt(req.params.id);
      const { acceptanceStatus, acceptanceRemarks, status, indentRef } = req.body;

      const updateData: { acceptanceStatus?: string; acceptanceRemarks?: string | null; status?: string; indentRef?: string | null } = {};

      if (acceptanceStatus !== undefined) {
        if (!["accepted", "partial", "rejected"].includes(acceptanceStatus)) {
          return res.status(400).json({ error: "Invalid acceptanceStatus value" });
        }
        updateData.acceptanceStatus = acceptanceStatus;
        updateData.acceptanceRemarks = acceptanceRemarks ?? null;
      }
      if (status !== undefined) {
        if (!["draft", "finalized"].includes(status)) {
          return res.status(400).json({ error: "Invalid status value" });
        }
        updateData.status = status;
      }
      if (indentRef !== undefined) {
        updateData.indentRef = indentRef ?? null;
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }
      const result = await storage.updateStoreGrn(id, updateData);
      if (!result) return res.status(404).json({ error: "GRN not found" });
      res.json(result);
    } catch (err) {
      console.error("PATCH /api/stores/grns/:id:", err);
      res.status(500).json({ error: "Failed to update GRN" });
    }
  });

  app.put("/api/stores/grns/:id", async (req, res) => {
    try {
      if (!assertEdit(req, res, "stores_inventory")) return;
      const id = parseInt(req.params.id);
      const { grn, items } = req.body;
      if (!grn || !items || !Array.isArray(items)) {
        return res.status(400).json({ error: "grn and items are required" });
      }
      const existing = await storage.getStoreGrn(id);
      if (!existing) return res.status(404).json({ error: "GRN not found" });
      if (existing.status !== "draft") return res.status(400).json({ error: "Only draft GRNs can be replaced" });
      const result = await storage.replaceStoreGrn(id, grn, items);
      if (!result) return res.status(404).json({ error: "GRN not found" });
      res.json(result);
    } catch (err) {
      console.error("PUT /api/stores/grns/:id:", err);
      res.status(500).json({ error: "Failed to update GRN" });
    }
  });

  app.delete("/api/stores/grns/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const deleted = await storage.deleteStoreGrn(parseInt(req.params.id));
      res.json({ success: deleted });
    } catch (err) {
      console.error("DELETE /api/stores/grns/:id:", err);
      res.status(500).json({ error: "Failed to delete GRN" });
    }
  });

  // Issue Vouchers
  app.get("/api/stores/issues/recent-items", async (req, res) => {
    try {
      if (!assertView(req, res, "stores_inventory")) return;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;
      const ids = await storage.getRecentIssueItemIds(limit);
      res.json(ids);
    } catch (err) {
      console.error("GET /api/stores/issues/recent-items:", err);
      res.status(500).json({ error: "Failed to fetch recent issue items" });
    }
  });

  app.get("/api/stores/issues", async (req, res) => {
    try {
      if (!assertView(req, res, "stores_inventory")) return;
      const permittedIds = req.authUser && !req.authUser.isAdmin
        ? await storage.getUserPermittedSiteIds(req.authUser.id)
        : null;
      const issues = await storage.getStoreIssues({
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        section: req.query.section as string | undefined,
        siteId: req.query.siteId ? parseInt(req.query.siteId as string) : undefined,
        item: req.query.item as string | undefined,
        category: req.query.category as string | undefined,
        ...(permittedIds !== null ? { permittedSiteIds: permittedIds } : {}),
      });
      res.json(issues);
    } catch (err) {
      console.error("GET /api/stores/issues:", err);
      res.status(500).json({ error: "Failed to fetch issues" });
    }
  });

  app.get("/api/stores/issues/:id", async (req, res) => {
    try {
      if (!assertView(req, res, "stores_inventory")) return;
      const issue = await storage.getStoreIssue(parseInt(req.params.id));
      if (!issue) return res.status(404).json({ error: "Not found" });
      // Permission System v2: check site access for detail
      if (req.authUser && !req.authUser.isAdmin && issue.siteId) {
        const permittedIds = await storage.getUserPermittedSiteIds(req.authUser.id);
        if (permittedIds !== null && !permittedIds.includes(issue.siteId)) {
          return res.status(403).json({ error: "Access denied for this site" });
        }
      }
      res.json(issue);
    } catch (err) {
      console.error("GET /api/stores/issues/:id:", err);
      res.status(500).json({ error: "Failed to fetch issue" });
    }
  });

  app.post("/api/stores/issues", async (req, res) => {
    try {
      if (!assertCreate(req, res, "stores_inventory")) return;
      const { issue, items } = req.body;
      if (!issue || !items || !Array.isArray(items)) {
        return res.status(400).json({ error: "issue and items are required" });
      }
      const result = await storage.createStoreIssue(issue, items);
      res.status(201).json(result);

      // After responding: check if any issued item just crossed below its minimum stock level.
      // We only notify on the crossing (was OK before, now low) to avoid spam for already-low items.
      (async () => {
        try {
          // Build a map of itemId → qty issued in this voucher
          const issuedQtyMap: Record<number, number> = {};
          for (const it of (items as { itemId: number; qty: number }[])) {
            issuedQtyMap[it.itemId] = (issuedQtyMap[it.itemId] ?? 0) + (parseFloat(String(it.qty)) || 0);
          }
          const issuedItemIds = new Set(Object.keys(issuedQtyMap).map(Number));

          // Post-issue stock summary (filtered to issued items only)
          const stockSummary = await storage.getStoreStockSummary();
          const affected = stockSummary.filter(s => issuedItemIds.has(s.itemId) && s.minStockQty != null);

          for (const item of affected) {
            const preBalance = item.balance + (issuedQtyMap[item.itemId] ?? 0);
            const wasOk = preBalance > (item.minStockQty ?? 0);
            const nowLow = item.balance <= (item.minStockQty ?? 0);
            if (wasOk && nowLow) {
              sendPushToSection("stores_inventory", "⚠ Low Stock Alert", `${item.itemName} is low — ${item.balance.toFixed(1)} ${item.uom ?? ''} remaining (min ${item.minStockQty})`, "/stores/hub").catch(() => {});
            }
          }
        } catch {
          // non-fatal — push failure must never affect the saved issue
        }
      })();
    } catch (err) {
      console.error("POST /api/stores/issues:", err);
      res.status(500).json({ error: "Failed to create issue voucher" });
    }
  });

  app.delete("/api/stores/issues/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const deleted = await storage.deleteStoreIssue(parseInt(req.params.id));
      res.json({ success: deleted });
    } catch (err) {
      console.error("DELETE /api/stores/issues/:id:", err);
      res.status(500).json({ error: "Failed to delete issue" });
    }
  });

  // Stock Summary
  app.get("/api/stores/stock-summary", async (req, res) => {
    try {
      if (!assertView(req, res, "stores_inventory")) return;
      const summary = await storage.getStoreStockSummary();
      res.json(summary);
    } catch (err) {
      console.error("GET /api/stores/stock-summary:", err);
      res.status(500).json({ error: "Failed to fetch stock summary" });
    }
  });

  // Per-item Ledger
  app.get("/api/stores/ledger/:itemId", async (req, res) => {
    try {
      if (!assertView(req, res, "stores_inventory")) return;
      const ledger = await storage.getStoreItemLedger(parseInt(req.params.itemId), {
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      });
      res.json(ledger);
    } catch (err) {
      console.error("GET /api/stores/ledger/:itemId:", err);
      res.status(500).json({ error: "Failed to fetch ledger" });
    }
  });

  // Preview next document number without incrementing
  app.get("/api/stores/next-doc-number", async (req, res) => {
    try {
      if (!assertView(req, res, "stores_inventory")) return;
      const type = req.query.type as string;
      if (type !== "GRN" && type !== "ISS") return res.status(400).json({ error: "type must be GRN or ISS" });
      const category = req.query.category as string | undefined;
      const number = await storage.generateStoreDocNumber(type, category || undefined);
      res.json({ number });
    } catch (err) {
      console.error("GET /api/stores/next-doc-number:", err);
      res.status(500).json({ error: "Failed to generate number" });
    }
  });

  // GRN counts grouped by indent reference (for PurchaseIndents traceability)
  app.get("/api/stores/indent-grn-counts", async (req, res) => {
    try {
      if (!assertView(req, res, "stores_inventory")) return;
      const counts = await storage.getStoreGrnCountsByIndentRef();
      res.json(counts);
    } catch (err) {
      console.error("GET /api/stores/indent-grn-counts:", err);
      res.status(500).json({ error: "Failed to fetch indent GRN counts" });
    }
  });

  app.get("/api/stores/indent-fulfilment-status", async (req, res) => {
    try {
      if (!assertView(req, res, "stores_inventory")) return;
      const status = await storage.getIndentFulfilmentStatus();
      res.json(status);
    } catch (err) {
      console.error("GET /api/stores/indent-fulfilment-status:", err);
      res.status(500).json({ error: "Failed to fetch indent fulfilment status" });
    }
  });

  app.get("/api/stores/indent-received-per-item", async (req, res) => {
    try {
      if (!assertView(req, res, "stores_inventory")) return;
      const indentId = Number(req.query.indentId);
      if (!indentId || isNaN(indentId)) return res.status(400).json({ error: "indentId is required" });
      // Site-scope authorization: ensure this user can see this indent's site
      if (req.authUser && !req.authUser.isAdmin) {
        const permittedIds = await storage.getUserPermittedSiteIds(req.authUser.id);
        if (permittedIds !== null) {
          const indent = await storage.getPurchaseIndent(indentId);
          if (!indent) return res.status(404).json({ error: "Indent not found" });
          if (indent.siteId && !permittedIds.includes(indent.siteId)) {
            return res.status(403).json({ error: "Access denied for this site" });
          }
        }
      }
      const data = await storage.getReceivedQtyByIndentItem(indentId);
      res.json(data);
    } catch (err) {
      console.error("GET /api/stores/indent-received-per-item:", err);
      res.status(500).json({ error: "Failed to fetch received qty per item" });
    }
  });

  // ============================================
  // EQUIPMENT MAINTENANCE & BREAKDOWN LOGS (Task #696)
  // ============================================

  app.get("/api/maintenance/logs", async (req, res) => {
    try {
      if (!assertView(req, res, "plant_equipment")) return;
      const filters = {
        equipmentId: req.query.equipmentId ? Number(req.query.equipmentId) : undefined,
        eventType: req.query.eventType as string | undefined,
        status: req.query.status as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const logs = await storage.getMaintenanceLogs(filters);
      res.json(logs);
    } catch (err) {
      console.error("GET /api/maintenance/logs:", err);
      res.status(500).json({ error: "Failed to fetch maintenance logs" });
    }
  });

  app.get("/api/maintenance/logs/:id", async (req, res) => {
    try {
      if (!assertView(req, res, "plant_equipment")) return;
      const log = await storage.getMaintenanceLog(Number(req.params.id));
      if (!log) return res.status(404).json({ error: "Not found" });
      res.json(log);
    } catch (err) {
      console.error("GET /api/maintenance/logs/:id:", err);
      res.status(500).json({ error: "Failed to fetch maintenance log" });
    }
  });

  app.post("/api/maintenance/logs", async (req, res) => {
    try {
      if (!assertCreate(req, res, "plant_equipment")) return;
      const { parts, ...logData } = req.body;
      const log = await storage.createMaintenanceLog(logData, parts || []);
      res.status(201).json(log);
    } catch (err) {
      console.error("POST /api/maintenance/logs:", err);
      res.status(500).json({ error: "Failed to create maintenance log" });
    }
  });

  app.patch("/api/maintenance/logs/:id", async (req, res) => {
    try {
      if (!assertEdit(req, res, "plant_equipment")) return;
      const updated = await storage.updateMaintenanceLog(Number(req.params.id), req.body);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (err) {
      console.error("PATCH /api/maintenance/logs/:id:", err);
      res.status(500).json({ error: "Failed to update maintenance log" });
    }
  });

  app.delete("/api/maintenance/logs/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const deleted = await storage.deleteMaintenanceLog(Number(req.params.id));
      if (!deleted) return res.status(404).json({ error: "Not found" });
      res.json({ success: true });
    } catch (err) {
      console.error("DELETE /api/maintenance/logs/:id:", err);
      res.status(500).json({ error: "Failed to delete maintenance log" });
    }
  });

  app.post("/api/maintenance/logs/:id/parts", async (req, res) => {
    try {
      if (!assertCreate(req, res, "plant_equipment")) return;
      const { parts } = req.body;
      if (!Array.isArray(parts) || parts.length === 0) {
        return res.status(400).json({ error: "parts array is required" });
      }
      const log = await storage.addMaintenanceParts(Number(req.params.id), parts);
      res.status(201).json(log);
    } catch (err) {
      console.error("POST /api/maintenance/logs/:id/parts:", err);
      res.status(500).json({ error: "Failed to add parts" });
    }
  });

  app.delete("/api/maintenance/parts/:partId", async (req, res) => {
    try {
      if (!assertEdit(req, res, "plant_equipment")) return;
      const deleted = await storage.removeMaintenancePart(Number(req.params.partId));
      if (!deleted) return res.status(404).json({ error: "Not found" });
      res.json({ success: true });
    } catch (err) {
      console.error("DELETE /api/maintenance/parts/:partId:", err);
      res.status(500).json({ error: "Failed to remove part" });
    }
  });

  app.get("/api/maintenance/health-summary", async (req, res) => {
    try {
      if (!assertView(req, res, "plant_equipment")) return;
      const summary = await storage.getEquipmentHealthSummary();
      res.json(summary);
    } catch (err) {
      console.error("GET /api/maintenance/health-summary:", err);
      res.status(500).json({ error: "Failed to fetch health summary" });
    }
  });

  app.get("/api/maintenance/open-count", async (req, res) => {
    try {
      if (!assertView(req, res, "plant_equipment")) return;
      const count = await storage.getOpenBreakdownCount();
      res.json({ count });
    } catch (err) {
      console.error("GET /api/maintenance/open-count:", err);
      res.status(500).json({ error: "Failed to fetch open count" });
    }
  });

  // Seed Data
  // ============================================
  // RMC PLANT MODULE (Task #697)
  // All /api/rmc/* routes are gated on the ENABLE_RMC environment flag.
  // Set ENABLE_RMC=true in development; leave unset in production to hide the module.
  // ============================================
  app.use("/api/rmc", (req, res, next) => {
    if (!RMC_ENABLED) return res.status(503).json({ message: "RMC module is not enabled in this environment." });
    next();
  });

  // Mix Designs
  app.get("/api/rmc/mix-designs", async (req, res) => {
    try {
      if (!assertView(req, res, "plant_production")) return;
      const plantName = req.query.plantName as string | undefined;
      const rows = await storage.getRmcMixDesigns(plantName);
      res.json(rows);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/rmc/mix-designs/:id", async (req, res) => {
    try {
      if (!assertView(req, res, "plant_production")) return;
      const row = await storage.getRmcMixDesign(Number(req.params.id));
      if (!row) return res.status(404).json({ message: "Mix design not found" });
      res.json(row);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/rmc/mix-designs", async (req, res) => {
    try {
      if (!assertCreate(req, res, "plant_production")) return;
      const data = insertRmcMixDesignSchema.parse(req.body);
      const row = await storage.createRmcMixDesign(data);
      res.status(201).json(row);
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ message: "Invalid data", errors: err.errors });
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/rmc/mix-designs/:id", async (req, res) => {
    try {
      if (!assertEdit(req, res, "plant_production")) return;
      const data = insertRmcMixDesignSchema.partial().parse(req.body);
      const row = await storage.updateRmcMixDesign(Number(req.params.id), data);
      if (!row) return res.status(404).json({ message: "Mix design not found" });
      res.json(row);
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ message: "Invalid data", errors: err.errors });
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/rmc/mix-designs/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const ok = await storage.deleteRmcMixDesign(Number(req.params.id));
      if (!ok) return res.status(404).json({ message: "Mix design not found" });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // Batch Records
  app.get("/api/rmc/today-summary", async (req, res) => {
    try {
      if (!assertView(req, res, "plant_production")) return;
      const plantName = req.query.plantName as string | undefined;
      const date = req.query.date as string | undefined;
      const summary = await storage.getRmcTodaySummary(plantName, date);
      res.json(summary);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/rmc/summary-range", async (req, res) => {
    try {
      if (!assertView(req, res, "plant_production")) return;
      const plantName = req.query.plantName as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      if (!dateFrom || !dateTo) return res.status(400).json({ message: "dateFrom and dateTo are required" });
      const rows = await storage.getRmcSummaryRange(dateFrom, dateTo, plantName);
      res.json(rows);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/rmc/batch-records", async (req, res) => {
    try {
      if (!assertView(req, res, "plant_production")) return;
      const filters = {
        plantName: req.query.plantName as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        mixDesignId: req.query.mixDesignId ? Number(req.query.mixDesignId) : undefined,
      };
      const rows = await storage.getRmcBatchRecords(filters);
      res.json(rows);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // RMC Batch Records — Excel export (must be declared before /:id)
  app.get("/api/rmc/batch-records/export", async (req, res) => {
    try {
      if (!assertView(req, res, "plant_production")) return;
      const filters = {
        plantName: req.query.plantName as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const rows = await storage.getRmcBatchRecords(filters);

      const sheetRows = rows.map(r => ({
        "Date": r.date,
        "Plant": r.plantName,
        "DC Number": r.dcNumber ?? "",
        "Grade": r.grade,
        "Batches": r.batchesCount ?? "",
        "Volume (m³)": r.totalVolumeM3,
        "Customer": r.customerName ?? "",
        "Delivery Site": r.deliverySite ?? "",
        "Truck Number": r.truckNumber ?? "",
        "Remarks": r.remarks ?? "",
      }));

      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(sheetRows);
      // Column widths
      ws["!cols"] = [
        { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 8 },
        { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 24 },
      ];
      xlsx.utils.book_append_sheet(wb, ws, "Batch Records");

      const rangeStr = filters.dateFrom && filters.dateTo
        ? `${filters.dateFrom}-to-${filters.dateTo}`
        : "all";
      const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="rmc-batch-records-${rangeStr}.xlsx"`);
      res.send(buf);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Export failed" });
    }
  });

  app.get("/api/rmc/batch-records/:id", async (req, res) => {
    try {
      if (!assertView(req, res, "plant_production")) return;
      const row = await storage.getRmcBatchRecord(Number(req.params.id));
      if (!row) return res.status(404).json({ message: "Batch record not found" });
      res.json(row);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/rmc/batch-records", async (req, res) => {
    try {
      if (!assertCreate(req, res, "plant_production")) return;
      const data = insertRmcBatchRecordSchema.parse(req.body);
      // Auto-generate a DC number if none provided
      if (!data.dcNumber) {
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const existing = await storage.getRmcBatchRecords({ plantName: data.plantName, dateFrom: now.toISOString().split('T')[0], dateTo: now.toISOString().split('T')[0] });
        const seq = String(existing.length + 1).padStart(3, '0');
        data.dcNumber = `DC-${dateStr}-${seq}`;
      }
      const row = await storage.createRmcBatchRecord(data);
      res.status(201).json(row);
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ message: "Invalid data", errors: err.errors });
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/rmc/batch-records/:id", async (req, res) => {
    try {
      if (!assertEdit(req, res, "plant_production")) return;
      const data = insertRmcBatchRecordSchema.partial().parse(req.body);
      const row = await storage.updateRmcBatchRecord(Number(req.params.id), data);
      if (!row) return res.status(404).json({ message: "Batch record not found" });
      res.json(row);
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ message: "Invalid data", errors: err.errors });
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/rmc/batch-records/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const ok = await storage.deleteRmcBatchRecord(Number(req.params.id));
      if (!ok) return res.status(404).json({ message: "Batch record not found" });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // Cube Tests
  // RMC Cube Tests — Excel export (must be declared before /:id)
  app.get("/api/rmc/cube-tests/export", async (req, res) => {
    try {
      if (!assertView(req, res, "plant_production")) return;
      const filters = {
        ageDays: req.query.ageDays ? Number(req.query.ageDays) : undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const [cubeTests, batchRecords] = await Promise.all([
        storage.getRmcCubeTests(filters),
        storage.getRmcBatchRecords({}),
      ]);
      const batchMap = new Map(batchRecords.map(b => [b.id, b]));

      const sheetRows = cubeTests.map(t => {
        const batch = batchMap.get(t.batchRecordId);
        return {
          "Sample ID": t.sampleId,
          "Grade": batch?.grade ?? "",
          "Batch Date": batch?.date ?? "",
          "Age (Days)": t.ageDays,
          "Test Date": t.testDate,
          "Strength (MPa)": t.strengthMpa,
          "Target fck (MPa)": t.targetStrength ?? "",
          "Pass / Fail": t.passFail ? t.passFail.toUpperCase() : "",
          "Remarks": t.remarks ?? "",
        };
      });

      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(sheetRows);
      ws["!cols"] = [
        { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 12 }, { wch: 28 },
      ];
      xlsx.utils.book_append_sheet(wb, ws, "Cube Tests");

      const rangeStr = filters.dateFrom && filters.dateTo
        ? `${filters.dateFrom}-to-${filters.dateTo}`
        : "all";
      const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="rmc-cube-tests-${rangeStr}.xlsx"`);
      res.send(buf);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Export failed" });
    }
  });

  app.get("/api/rmc/cube-tests/stats", async (req, res) => {
    try {
      if (!assertView(req, res, "plant_production")) return;
      const dateFrom = req.query.dateFrom as string | undefined;
      const stats = await storage.getRmcCubeTestStats(dateFrom);
      res.json(stats);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/rmc/cube-tests", async (req, res) => {
    try {
      if (!assertView(req, res, "plant_production")) return;
      const filters = {
        batchRecordId: req.query.batchRecordId ? Number(req.query.batchRecordId) : undefined,
        ageDays: req.query.ageDays ? Number(req.query.ageDays) : undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const rows = await storage.getRmcCubeTests(filters);
      res.json(rows);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/rmc/cube-tests", async (req, res) => {
    try {
      if (!assertCreate(req, res, "plant_production")) return;
      const data = insertRmcCubeTestSchema.parse(req.body);
      const row = await storage.createRmcCubeTest(data);
      res.status(201).json(row);
      if (data.passFail === "fail") {
        const ageLabel = data.ageDays != null ? `${data.ageDays}-day ` : "";
        const sampleLabel = data.sampleId ? ` (${data.sampleId})` : "";
        sendPushToAudience(
          "Cube Test Failed ⚠️",
          `${ageLabel}cube test${sampleLabel} recorded as FAIL — check /plant/rmc/cube-tests`,
          "/plant/rmc/cube-tests",
          "managers"
        ).catch((err) => console.error("[Push] Cube test fail alert error:", err));
      }
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ message: "Invalid data", errors: err.errors });
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/rmc/cube-tests/:id", async (req, res) => {
    try {
      if (!assertEdit(req, res, "plant_production")) return;
      const data = insertRmcCubeTestSchema.partial().parse(req.body);
      const row = await storage.updateRmcCubeTest(Number(req.params.id), data);
      if (!row) return res.status(404).json({ message: "Cube test not found" });
      res.json(row);
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ message: "Invalid data", errors: err.errors });
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/rmc/cube-tests/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const ok = await storage.deleteRmcCubeTest(Number(req.params.id));
      if (!ok) return res.status(404).json({ message: "Cube test not found" });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // Raw Material Receipts
  app.get("/api/rmc/raw-materials", async (req, res) => {
    try {
      if (!assertView(req, res, "plant_materials")) return;
      const filters = {
        plantName: req.query.plantName as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        category: req.query.category as string | undefined,
      };
      const rows = await storage.getRmcRawMaterialReceipts(filters);
      res.json(rows);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/rmc/raw-materials", async (req, res) => {
    try {
      if (!assertCreate(req, res, "plant_materials")) return;
      const data = insertRmcRawMaterialReceiptSchema.parse(req.body);
      const row = await storage.createRmcRawMaterialReceipt(data);
      res.status(201).json(row);
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ message: "Invalid data", errors: err.errors });
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/rmc/raw-materials/:id", async (req, res) => {
    try {
      if (!assertEdit(req, res, "plant_materials")) return;
      const data = insertRmcRawMaterialReceiptSchema.partial().parse(req.body);
      const row = await storage.updateRmcRawMaterialReceipt(Number(req.params.id), data);
      if (!row) return res.status(404).json({ message: "Receipt not found" });
      res.json(row);
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ message: "Invalid data", errors: err.errors });
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/rmc/raw-materials/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const ok = await storage.deleteRmcRawMaterialReceipt(Number(req.params.id));
      if (!ok) return res.status(404).json({ message: "Receipt not found" });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // RMC Plant Names — distinct list for dropdown
  app.get("/api/rmc/plants", async (req, res) => {
    try {
      if (!assertView(req, res, "plant_daily_reports")) return;
      const names = await storage.getDistinctRmcPlantNames();
      res.json(names);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // RMC Stock Summary
  app.get("/api/rmc/stock-summary", async (req, res) => {
    try {
      if (!assertView(req, res, "plant_materials")) return;
      const plantName = req.query.plantName as string | undefined;
      const summary = await storage.getRmcStockSummary(plantName);
      res.json(summary);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // RMC Daily Report
  app.get("/api/rmc/daily-report", async (req, res) => {
    try {
      if (!assertView(req, res, "plant_daily_reports")) return;
      const date = req.query.date as string;
      if (!date) return res.status(400).json({ message: "date query param required" });
      const plantName = req.query.plantName as string | undefined;
      const report = await storage.getRmcDailyReport(date, plantName);
      res.json(report);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // RMC Daily Report — PDF export
  app.get("/api/rmc/daily-report/pdf", async (req, res) => {
    try {
      if (!assertView(req, res, "plant_daily_reports")) return;
      const date = req.query.date as string;
      if (!date) return res.status(400).json({ message: "date query param required" });
      const plantName = (req.query.plantName as string | undefined) || undefined;
      const report = await storage.getRmcDailyReport(date, plantName);

      const doc = new PDFDocument({ size: "A4", margin: 40 });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="rmc-daily-report-${date}.pdf"`);
      doc.pipe(res);

      // ── Header ──────────────────────────────────────────────────────────
      doc.fontSize(18).font("Helvetica-Bold").text("RMC Daily Production Report", { align: "center" });
      doc.fontSize(11).font("Helvetica").text(plantName ? `Plant: ${plantName}` : "Ready Mix Concrete Plant", { align: "center" });
      doc.fontSize(10).text(`Date: ${date}    Generated: ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC`, { align: "center" });
      doc.moveDown(0.5);
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.5);

      // ── Summary stats ────────────────────────────────────────────────────
      doc.fontSize(13).font("Helvetica-Bold").text("Summary");
      doc.moveDown(0.2);
      const stats = [
        ["Total Volume", `${report.totalVolumeM3.toFixed(2)} m³`],
        ["Dispatches", String(report.batchRecords.length)],
        ["Grades Produced", String(report.gradeBreakdown.length)],
        ["Cube Tests", String(report.cubeTests.length)],
      ];
      const colW = 120;
      const startX = 40;
      let sx = startX;
      const statsY = doc.y;
      for (const [label, value] of stats) {
        doc.rect(sx, statsY, colW - 4, 40).stroke();
        doc.fontSize(8).font("Helvetica").fillColor("#555").text(label, sx + 4, statsY + 4, { width: colW - 8 });
        doc.fontSize(14).font("Helvetica-Bold").fillColor("#000").text(value, sx + 4, statsY + 16, { width: colW - 8 });
        sx += colW;
      }
      doc.y = statsY + 50;
      doc.moveDown(0.5);

      // ── Grade Breakdown ─────────────────────────────────────────────────
      if (report.gradeBreakdown.length > 0) {
        doc.fontSize(13).font("Helvetica-Bold").fillColor("#000").text("Grade-wise Production");
        doc.moveDown(0.2);
        const hY = doc.y;
        doc.rect(40, hY, 515, 18).fill("#e8e8e8").stroke();
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#000");
        doc.text("Grade", 44, hY + 4, { width: 200 });
        doc.text("Batches", 244, hY + 4, { width: 100, align: "right" });
        doc.text("Volume (m³)", 344, hY + 4, { width: 207, align: "right" });
        doc.y = hY + 20;
        for (const g of report.gradeBreakdown) {
          const ry = doc.y;
          doc.rect(40, ry, 515, 16).stroke();
          doc.fontSize(9).font("Helvetica").fillColor("#000");
          doc.text(g.grade, 44, ry + 3, { width: 200 });
          doc.text(String(g.batches), 244, ry + 3, { width: 100, align: "right" });
          doc.text(g.volumeM3.toFixed(2), 344, ry + 3, { width: 207, align: "right" });
          doc.y = ry + 18;
        }
        // Totals row
        const ty = doc.y;
        doc.rect(40, ty, 515, 16).fill("#f5f5f5").stroke();
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#000");
        doc.text("Total", 44, ty + 3, { width: 200 });
        doc.text(String(report.batchRecords.reduce((s, r) => s + (r.batchesCount ?? 0), 0)), 244, ty + 3, { width: 100, align: "right" });
        doc.text(report.totalVolumeM3.toFixed(2), 344, ty + 3, { width: 207, align: "right" });
        doc.y = ty + 22;
        doc.moveDown(0.5);
      }

      // ── Batch Dispatches ────────────────────────────────────────────────
      if (report.batchRecords.length > 0) {
        doc.fontSize(13).font("Helvetica-Bold").fillColor("#000").text("Batch Dispatches");
        doc.moveDown(0.2);
        const hY = doc.y;
        doc.rect(40, hY, 515, 18).fill("#e8e8e8").stroke();
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#000");
        doc.text("DC #", 44, hY + 4, { width: 70 });
        doc.text("Grade", 114, hY + 4, { width: 70 });
        doc.text("Customer", 184, hY + 4, { width: 140 });
        doc.text("Delivery Site", 324, hY + 4, { width: 140 });
        doc.text("Vol (m³)", 464, hY + 4, { width: 87, align: "right" });
        doc.y = hY + 20;
        for (const b of report.batchRecords) {
          const ry = doc.y;
          if (ry > 760) { doc.addPage(); }
          const ry2 = doc.y;
          doc.rect(40, ry2, 515, 16).stroke();
          doc.fontSize(8).font("Helvetica").fillColor("#000");
          doc.text(b.dcNumber || "—", 44, ry2 + 3, { width: 70 });
          doc.text(b.grade, 114, ry2 + 3, { width: 70 });
          doc.text(b.customerName || "—", 184, ry2 + 3, { width: 140 });
          doc.text(b.deliverySite || "—", 324, ry2 + 3, { width: 140 });
          doc.text(b.totalVolumeM3.toFixed(2), 464, ry2 + 3, { width: 87, align: "right" });
          doc.y = ry2 + 18;
        }
        doc.moveDown(0.5);
      }

      // ── Raw Materials Received vs Consumed ──────────────────────────────
      if (report.rawMaterialsReceived.length > 0 || report.materialConsumed.length > 0) {
        const allMats = Array.from(new Set([
          ...report.rawMaterialsReceived.map(r => r.materialName),
          ...report.materialConsumed.map(c => c.materialName),
        ]));
        const receivedMap = new Map(report.rawMaterialsReceived.map(r => [r.materialName, r.totalQty]));
        const consumedMap = new Map(report.materialConsumed.map(c => [c.materialName, c.consumedQty]));
        doc.fontSize(13).font("Helvetica-Bold").fillColor("#000").text("Raw Materials — Received vs Consumed");
        doc.moveDown(0.2);
        const hY = doc.y;
        doc.rect(40, hY, 515, 18).fill("#e8e8e8").stroke();
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#000");
        doc.text("Material", 44, hY + 4, { width: 200 });
        doc.text("Received (kg)", 244, hY + 4, { width: 110, align: "right" });
        doc.text("Consumed (kg)", 354, hY + 4, { width: 110, align: "right" });
        doc.text("Balance", 464, hY + 4, { width: 87, align: "right" });
        doc.y = hY + 20;
        for (const mat of allMats) {
          const ry = doc.y;
          if (ry > 760) { doc.addPage(); }
          const ry2 = doc.y;
          doc.rect(40, ry2, 515, 16).stroke();
          const recv = receivedMap.get(mat) ?? 0;
          const cons = consumedMap.get(mat) ?? 0;
          const bal = recv - cons;
          doc.fontSize(8).font("Helvetica").fillColor("#000");
          doc.text(mat, 44, ry2 + 3, { width: 200 });
          doc.text(recv > 0 ? recv.toFixed(2) : "—", 244, ry2 + 3, { width: 110, align: "right" });
          doc.text(cons > 0 ? cons.toFixed(2) : "—", 354, ry2 + 3, { width: 110, align: "right" });
          doc.fillColor(bal < 0 ? "#cc0000" : "#000").text((recv > 0 || cons > 0) ? bal.toFixed(2) : "—", 464, ry2 + 3, { width: 87, align: "right" });
          doc.fillColor("#000");
          doc.y = ry2 + 18;
        }
        doc.moveDown(0.5);
      }

      // ── Cube Tests ──────────────────────────────────────────────────────
      if (report.cubeTests.length > 0) {
        doc.fontSize(13).font("Helvetica-Bold").fillColor("#000").text("Cube Test Results");
        doc.moveDown(0.2);
        const hY = doc.y;
        doc.rect(40, hY, 515, 18).fill("#e8e8e8").stroke();
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#000");
        doc.text("Sample ID", 44, hY + 4, { width: 150 });
        doc.text("Age (d)", 194, hY + 4, { width: 70, align: "right" });
        doc.text("Strength (MPa)", 264, hY + 4, { width: 120, align: "right" });
        doc.text("Grade Benchmark", 384, hY + 4, { width: 80, align: "right" });
        doc.text("Result", 464, hY + 4, { width: 87, align: "right" });
        doc.y = hY + 20;
        for (const t of report.cubeTests) {
          const ry = doc.y;
          if (ry > 760) { doc.addPage(); }
          const ry2 = doc.y;
          const isFail = t.passFail === "fail";
          if (isFail) {
            doc.rect(40, ry2, 515, 16).fillAndStroke("#fff0f0", "#000000");
          } else {
            doc.rect(40, ry2, 515, 16).stroke();
          }
          const result = t.passFail === "pass" ? "PASS" : t.passFail === "fail" ? "FAIL" : "—";
          const resultColor = t.passFail === "pass" ? "#007700" : t.passFail === "fail" ? "#cc0000" : "#555";
          doc.fontSize(8).font("Helvetica").fillColor("#000");
          doc.text(t.sampleId, 44, ry2 + 3, { width: 150 });
          doc.text(String(t.ageDays), 194, ry2 + 3, { width: 70, align: "right" });
          // Highlight strength value red for failed rows
          doc.fillColor(isFail ? "#cc0000" : "#000").text(String(t.strengthMpa), 264, ry2 + 3, { width: 120, align: "right" });
          doc.fillColor("#000").text(t.targetStrength != null ? String(t.targetStrength) : "—", 384, ry2 + 3, { width: 80, align: "right" });
          doc.font("Helvetica-Bold").fillColor(resultColor).text(result, 464, ry2 + 3, { width: 87, align: "right" });
          doc.fillColor("#000");
          doc.y = ry2 + 18;
        }
        // ── Pass / Fail summary ─────────────────────────────────────────────
        const cubePassCount = report.cubeTests.filter(t => t.passFail === "pass").length;
        const cubeFailCount = report.cubeTests.filter(t => t.passFail === "fail").length;
        const cubeTested = cubePassCount + cubeFailCount;
        const cubePassRate = cubeTested > 0 ? ((cubePassCount / cubeTested) * 100).toFixed(1) : null;
        // Ensure summary row fits on the current page (needs ~30px)
        if (doc.y > 740) { doc.addPage(); }
        const sy = doc.y;
        doc.rect(40, sy, 515, 20).fill("#f5f5f5").stroke();
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#000")
          .text(`Pass: ${cubePassCount}`, 44, sy + 5, { width: 100 });
        doc.fillColor("#cc0000")
          .text(`Fail: ${cubeFailCount}`, 154, sy + 5, { width: 100 });
        if (cubePassRate !== null) {
          const rateColor = cubeFailCount === 0 ? "#007700" : cubeFailCount / cubeTested >= 0.5 ? "#cc0000" : "#996600";
          doc.fillColor(rateColor).text(`Pass Rate: ${cubePassRate}%`, 264, sy + 5, { width: 287, align: "right" });
        }
        doc.fillColor("#000");
        doc.y = sy + 26;

        // ── Grade-wise pass/fail breakdown ──────────────────────────────────
        const batchGradeMap = new Map<number, string>();
        for (const br of report.batchRecords) {
          batchGradeMap.set(br.id, br.grade);
        }
        const gradeTestMap = new Map<string, { pass: number; fail: number }>();
        for (const t of report.cubeTests) {
          if (t.passFail !== "pass" && t.passFail !== "fail") continue;
          const grade = batchGradeMap.get(t.batchRecordId);
          if (!grade) continue;
          const cur = gradeTestMap.get(grade) ?? { pass: 0, fail: 0 };
          if (t.passFail === "pass") cur.pass++;
          else cur.fail++;
          gradeTestMap.set(grade, cur);
        }
        if (gradeTestMap.size > 0) {
          const gradeRows = Array.from(gradeTestMap.entries())
            .map(([grade, counts]) => ({ grade, ...counts }))
            .sort((a, b) => a.grade.localeCompare(b.grade));
          // Sub-header
          if (doc.y > 750) { doc.addPage(); }
          const ghY = doc.y;
          doc.rect(40, ghY, 515, 16).fill("#d4e8d4").stroke();
          doc.fontSize(8).font("Helvetica-Bold").fillColor("#000");
          doc.text("Grade", 44, ghY + 3, { width: 150 });
          doc.text("Pass", 194, ghY + 3, { width: 80, align: "right" });
          doc.text("Fail", 294, ghY + 3, { width: 80, align: "right" });
          doc.text("Pass Rate", 394, ghY + 3, { width: 157, align: "right" });
          doc.y = ghY + 18;
          for (const row of gradeRows) {
            if (doc.y > 760) { doc.addPage(); }
            const gy = doc.y;
            doc.rect(40, gy, 515, 14).stroke();
            const total = row.pass + row.fail;
            const rate = ((row.pass / total) * 100).toFixed(1);
            const rateColor = row.fail === 0 ? "#007700" : row.fail / total >= 0.5 ? "#cc0000" : "#996600";
            doc.fontSize(8).font("Helvetica").fillColor("#000");
            doc.text(row.grade, 44, gy + 2, { width: 150 });
            doc.fillColor("#007700").text(String(row.pass), 194, gy + 2, { width: 80, align: "right" });
            doc.fillColor(row.fail > 0 ? "#cc0000" : "#000").text(String(row.fail), 294, gy + 2, { width: 80, align: "right" });
            doc.fillColor(rateColor).text(`${rate}%`, 394, gy + 2, { width: 157, align: "right" });
            doc.fillColor("#000");
            doc.y = gy + 16;
          }
        }
        doc.moveDown(0.5);
      }

      if (report.batchRecords.length === 0 && report.rawMaterialsReceived.length === 0 && report.cubeTests.length === 0) {
        doc.fontSize(11).font("Helvetica").fillColor("#888").text("No data recorded for this date.", { align: "center" });
      }

      doc.end();
    } catch (err: any) {
      console.error("RMC PDF error", err);
      if (!res.headersSent) res.status(500).json({ message: err.message || "Failed to generate PDF" });
    }
  });

  // RMC Daily Report — Excel export (multi-sheet)
  app.get("/api/rmc/daily-report/export", async (req, res) => {
    try {
      if (!assertView(req, res, "plant_daily_reports")) return;
      const date = req.query.date as string;
      if (!date) return res.status(400).json({ message: "date query param required" });
      const plantName = (req.query.plantName as string | undefined) || undefined;
      const report = await storage.getRmcDailyReport(date, plantName);

      const wb = xlsx.utils.book_new();

      // ── Sheet 1: Summary ──────────────────────────────────────────────────
      const cubePassCount = report.cubeTests.filter(t => t.passFail === "pass").length;
      const cubeFailCount = report.cubeTests.filter(t => t.passFail === "fail").length;
      const cubeTested = cubePassCount + cubeFailCount;
      const summaryAoa = [
        ["RMC Daily Production Report"],
        ["Date", date],
        plantName ? ["Plant", plantName] : ["Plant", "All Plants"],
        [],
        ["Metric", "Value"],
        ["Total Volume (m³)", report.totalVolumeM3],
        ["Dispatches", report.batchRecords.length],
        ["Grades Produced", report.gradeBreakdown.length],
        ["Cube Tests", report.cubeTests.length],
        ["Cube Tests — Pass", cubePassCount],
        ["Cube Tests — Fail", cubeFailCount],
        cubeTested > 0 ? ["Cube Pass Rate (%)", Number(((cubePassCount / cubeTested) * 100).toFixed(1))] : ["Cube Pass Rate (%)", "N/A"],
      ];
      const summaryWs = xlsx.utils.aoa_to_sheet(summaryAoa);
      summaryWs["!cols"] = [{ wch: 24 }, { wch: 16 }];
      xlsx.utils.book_append_sheet(wb, summaryWs, "Summary");

      // ── Sheet 2: Grade Breakdown ──────────────────────────────────────────
      if (report.gradeBreakdown.length > 0) {
        const gradeAoa = [
          ["Grade", "Batches", "Volume (m³)"],
          ...report.gradeBreakdown.map(g => [g.grade, g.batches, g.volumeM3]),
          ["Total", report.batchRecords.reduce((s, r) => s + (r.batchesCount ?? 0), 0), report.totalVolumeM3],
        ];
        const gradeWs = xlsx.utils.aoa_to_sheet(gradeAoa);
        gradeWs["!cols"] = [{ wch: 14 }, { wch: 10 }, { wch: 14 }];
        xlsx.utils.book_append_sheet(wb, gradeWs, "Grade Breakdown");
      }

      // ── Sheet 3: Batch Dispatches ─────────────────────────────────────────
      if (report.batchRecords.length > 0) {
        const batchRows = report.batchRecords.map(b => ({
          "DC Number": b.dcNumber ?? "",
          "Grade": b.grade,
          "Customer": b.customerName ?? "",
          "Delivery Site": b.deliverySite ?? "",
          "Truck Number": b.truckNumber ?? "",
          "Batches": b.batchesCount ?? "",
          "Volume (m³)": b.totalVolumeM3,
          "Remarks": b.remarks ?? "",
        }));
        const batchWs = xlsx.utils.json_to_sheet(batchRows);
        batchWs["!cols"] = [
          { wch: 14 }, { wch: 10 }, { wch: 22 }, { wch: 22 },
          { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 28 },
        ];
        xlsx.utils.book_append_sheet(wb, batchWs, "Batch Dispatches");
      }

      // ── Sheet 4: Raw Materials ────────────────────────────────────────────
      if (report.rawMaterialsReceived.length > 0 || report.materialConsumed.length > 0) {
        const allMats = Array.from(new Set([
          ...report.rawMaterialsReceived.map(r => r.materialName),
          ...report.materialConsumed.map(c => c.materialName),
        ]));
        const receivedMap = new Map(report.rawMaterialsReceived.map(r => [r.materialName, r.totalQty]));
        const consumedMap = new Map(report.materialConsumed.map(c => [c.materialName, c.consumedQty]));
        const matAoa = [
          ["Material", "Received (kg)", "Consumed (kg)", "Balance (kg)"],
          ...allMats.map(mat => {
            const recv = receivedMap.get(mat) ?? 0;
            const cons = consumedMap.get(mat) ?? 0;
            return [mat, recv || "", cons || "", recv - cons];
          }),
        ];
        const matWs = xlsx.utils.aoa_to_sheet(matAoa);
        matWs["!cols"] = [{ wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 14 }];
        xlsx.utils.book_append_sheet(wb, matWs, "Raw Materials");
      }

      // ── Sheet 5: Cube Tests ───────────────────────────────────────────────
      const batchMap = new Map(report.batchRecords.map(b => [b.id, b]));
      const cubeRows = report.cubeTests.map(t => ({
        "Sample ID": t.sampleId,
        "Grade": batchMap.get(t.batchRecordId)?.grade ?? "",
        "Age (Days)": t.ageDays,
        "Test Date": t.testDate,
        "Strength (MPa)": t.strengthMpa,
        "Target fck (MPa)": t.targetStrength ?? "",
        "Pass / Fail": t.passFail ? t.passFail.toUpperCase() : "",
        "Remarks": t.remarks ?? "",
      }));
      const cubeWs = cubeRows.length > 0
        ? xlsx.utils.json_to_sheet(cubeRows)
        : xlsx.utils.aoa_to_sheet([["Sample ID", "Grade", "Age (Days)", "Test Date", "Strength (MPa)", "Target fck (MPa)", "Pass / Fail", "Remarks"]]);
      cubeWs["!cols"] = [
        { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
        { wch: 16 }, { wch: 18 }, { wch: 12 }, { wch: 28 },
      ];
      xlsx.utils.book_append_sheet(wb, cubeWs, "Cube Tests");

      const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="rmc-daily-report-${date}.xlsx"`);
      res.send(buf);
    } catch (err: any) {
      console.error("RMC daily report Excel error", err);
      if (!res.headersSent) res.status(500).json({ message: err.message || "Export failed" });
    }
  });

  // ============================================
  // CROSS-PLANT / PROJECT DISPATCH SUMMARY REPORT
  // ============================================
  app.get("/api/reports/plant-project-dispatch-summary", async (req, res) => {
    try {
      if (!assertView(req, res, "plant_production")) return;

      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo   = req.query.dateTo   as string | undefined;
      const plantNamesRaw = req.query.plantNames as string | undefined;
      const partyIdsRaw   = req.query.partyIds   as string | undefined;

      const plantNamesFilter = plantNamesRaw
        ? plantNamesRaw.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
      const partyIdsFilter = partyIdsRaw
        ? partyIdsRaw.split(",").map((s) => parseInt(s, 10)).filter((n) => !isNaN(n))
        : [];

      const conditions: ReturnType<typeof eq>[] = [];
      if (dateFrom) conditions.push(gte(truckDispatchesTable.date, dateFrom));
      if (dateTo)   conditions.push(lte(truckDispatchesTable.date, dateTo));
      if (plantNamesFilter.length > 0) conditions.push(drizzleInArray(truckDispatchesTable.plantName, plantNamesFilter));
      if (partyIdsFilter.length > 0)   conditions.push(drizzleInArray(truckDispatchesTable.partyId,   partyIdsFilter));

      const rows = await db
        .select({
          plantName: truckDispatchesTable.plantName,
          partyId:   truckDispatchesTable.partyId,
          partyName: sql<string>`COALESCE(${partiesTable.name}, 'Unknown')`,
          loadCount: sql<number>`COUNT(*)::int`,
          totalMT:   sql<number>`ROUND(SUM(${truckDispatchesTable.loadWeight})::numeric, 2)::float`,
          mixTypes:  sql<string[]>`array_agg(DISTINCT ${mixTemplatesTable.mixType} ORDER BY ${mixTemplatesTable.mixType}) FILTER (WHERE ${mixTemplatesTable.mixType} IS NOT NULL)`,
        })
        .from(truckDispatchesTable)
        .leftJoin(partiesTable,    eq(truckDispatchesTable.partyId,       partiesTable.id))
        .leftJoin(mixTemplatesTable, eq(truckDispatchesTable.mixTemplateId, mixTemplatesTable.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .groupBy(
          truckDispatchesTable.plantName,
          truckDispatchesTable.partyId,
          sql`COALESCE(${partiesTable.name}, 'Unknown')`,
        )
        .orderBy(asc(truckDispatchesTable.plantName), asc(sql`COALESCE(${partiesTable.name}, 'Unknown')`));

      res.json(rows);
    } catch (err: any) {
      console.error("plant-project-dispatch-summary error:", err);
      res.status(500).json({ message: "Failed to generate plant-project dispatch summary" });
    }
  });

  // ============================================================
  // WORK PROGRAM & BOQ CONTROL
  // ============================================================

  // --- BOQ Projects ---

  app.get("/api/boq/projects", async (req, res) => {
    try {
      const siteId = req.query.siteId ? parseInt(req.query.siteId as string) : undefined;
      const projects = await storage.getBoqProjects(siteId);
      res.json(projects);
    } catch (err) {
      console.error("GET /api/boq/projects:", err);
      res.status(500).json({ error: "Failed to fetch BOQ projects" });
    }
  });

  app.get("/api/boq/projects/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const project = await storage.getBoqProject(id);
      if (!project) return res.status(404).json({ error: "BOQ project not found" });
      res.json(project);
    } catch (err) {
      console.error("GET /api/boq/projects/:id:", err);
      res.status(500).json({ error: "Failed to fetch BOQ project" });
    }
  });

  app.post("/api/boq/projects", async (req, res) => {
    try {
      const data = req.body;
      if (!data.name) return res.status(400).json({ error: "name is required" });
      const project = await storage.createBoqProject(data);
      res.status(201).json(project);
    } catch (err) {
      console.error("POST /api/boq/projects:", err);
      res.status(500).json({ error: "Failed to create BOQ project" });
    }
  });

  app.patch("/api/boq/projects/:id", async (req, res) => {
    try {
      if (!assertEdit(req, res, "qto_boq")) return;
      const id = parseInt(req.params.id);
      const updated = await storage.updateBoqProject(id, req.body);
      if (!updated) return res.status(404).json({ error: "BOQ project not found" });
      res.json(updated);
    } catch (err) {
      console.error("PATCH /api/boq/projects/:id:", err);
      res.status(500).json({ error: "Failed to update BOQ project" });
    }
  });

  app.delete("/api/boq/projects/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      await storage.deleteBoqProject(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      console.error("DELETE /api/boq/projects/:id:", err);
      res.status(500).json({ error: "Failed to delete BOQ project" });
    }
  });

  // --- BOQ Program Settings ---

  app.get("/api/boq/projects/:id/program-settings", async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const settings = await storage.getBoqProgramSettings(projectId);
      if (!settings) {
        return res.json({
          id: null, projectId,
          workingDaysPerMonth: 25, shiftHours: 8, doubleShift: false,
          tipperCapacityT: 8, avgTipperSpeedKmHr: 30, loadTimeMin: 5, unloadTimeMin: 5,
          hmpChainageKm: null, wmmPlantChainageKm: null, quarryChainageKm: null,
          borrowChainageKm: null, disposalChainageKm: null, rmcChainageKm: null,
          hmpToSiteKm: null, wmmPlantToSiteKm: null, quarryToSiteKm: null,
          quarryToHmpKm: null, quarryToRmcKm: null, rmcToSiteKm: null,
          borrowToSiteKm: null, disposalDistanceKm: null,
          productivityMode: "snl", productivityOverrides: null, projectStartDate: null, updatedAt: null,
        });
      }
      res.json(settings);
    } catch (err) {
      console.error("GET /api/boq/projects/:id/program-settings:", err);
      res.status(500).json({ error: "Failed to fetch program settings" });
    }
  });

  app.put("/api/boq/projects/:id/program-settings", async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);

      // Read existing settings to detect project-start-date transition (null → date)
      const existing = await storage.getBoqProgramSettings(projectId);
      const previousStartDate = (existing as any)?.projectStartDate ?? null;
      const newStartDate: string | null = req.body.projectStartDate ?? null;
      const startDateFirstSet = !previousStartDate && newStartDate;

      const settings = await storage.upsertBoqProgramSettings(projectId, req.body);

      // Sync projectStartDate → boqProjects.startDate so monthLabel works everywhere
      if (newStartDate != null) {
        await storage.updateBoqProject(projectId, { startDate: newStartDate });
      }

      // Bulk backfill: when projectStartDate is set for the first time (or changed),
      // derive and persist real calendar dates for all existing bars from their startMonth/endMonth.
      if (newStartDate && (startDateFirstSet || (previousStartDate && previousStartDate !== newStartDate))) {
        const bars = await storage.getWorkProgramBars(projectId);
        const { dateToMonthIndex: _dmi, monthIndexToDate, formatDateForInput } = await import("../shared/planningEngine.js");
        let backfilled = 0;
        for (const bar of bars) {
          const startDate = formatDateForInput(monthIndexToDate(bar.startMonth, newStartDate));
          const endDate = formatDateForInput(monthIndexToDate(bar.endMonth, newStartDate));
          await storage.updateWorkProgramBar(bar.id, { startDate, endDate, durationMode: bar.durationMode ?? "auto" });
          backfilled++;
        }
        console.log(`[backfillBarDates] project ${projectId}: backfilled ${backfilled} bars with real dates from startDate ${newStartDate}`);
      }

      res.json(settings);
    } catch (err) {
      console.error("PUT /api/boq/projects/:id/program-settings:", err);
      res.status(500).json({ error: "Failed to save program settings" });
    }
  });

  // --- BOQ Mix Template Links ---

  app.get("/api/boq/projects/:id/mix-links", async (req, res) => {
    try {
      const links = await storage.getBoqMixLinks(parseInt(req.params.id));
      res.json(links);
    } catch (err) {
      console.error("GET /api/boq/projects/:id/mix-links:", err);
      res.status(500).json({ error: "Failed to fetch mix links" });
    }
  });

  app.post("/api/boq/projects/:id/mix-links", async (req, res) => {
    try {
      if (!assertEdit(req, res, "qto_boq")) return;
      const projectId = parseInt(req.params.id);
      const link = await storage.createBoqMixLink({ ...req.body, boqProjectId: projectId });
      res.status(201).json(link);
    } catch (err) {
      console.error("POST /api/boq/projects/:id/mix-links:", err);
      res.status(500).json({ error: "Failed to create mix link" });
    }
  });

  app.put("/api/boq/projects/:id/mix-links", async (req, res) => {
    try {
      if (!assertEdit(req, res, "qto_boq")) return;
      const projectId = parseInt(req.params.id);
      const { mixType, mixTemplateId, mixTemplateName } = req.body;
      if (!mixType) return res.status(400).json({ error: "mixType is required" });
      const link = await storage.upsertBoqMixLink(projectId, { mixType, mixTemplateId, mixTemplateName });
      res.json(link);
    } catch (err) {
      console.error("PUT /api/boq/projects/:id/mix-links:", err);
      res.status(500).json({ error: "Failed to upsert mix link" });
    }
  });

  app.delete("/api/boq/projects/:id/mix-links/:linkId", async (req, res) => {
    try {
      if (!assertEdit(req, res, "qto_boq")) return;
      await storage.deleteBoqMixLink(parseInt(req.params.linkId));
      res.json({ ok: true });
    } catch (err) {
      console.error("DELETE /api/boq/projects/:id/mix-links/:linkId:", err);
      res.status(500).json({ error: "Failed to delete mix link" });
    }
  });

  app.post("/api/boq/projects/:id/duplicate", async (req, res) => {
    try {
      if (!assertEdit(req, res, "qto_boq")) return;
      const project = await storage.duplicateBoqProject(parseInt(req.params.id));
      res.status(201).json(project);
    } catch (err) {
      console.error("POST /api/boq/projects/:id/duplicate:", err);
      res.status(500).json({ error: "Failed to duplicate project" });
    }
  });

  // --- BOQ Categories ---

  app.get("/api/boq/projects/:id/categories", async (req, res) => {
    try {
      const cats = await storage.getBoqCategories(parseInt(req.params.id));
      res.json(cats);
    } catch (err) {
      console.error("GET /api/boq/projects/:id/categories:", err);
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  app.patch("/api/boq/categories/:id", async (req, res) => {
    try {
      const updated = await storage.updateBoqCategory(parseInt(req.params.id), req.body);
      if (!updated) return res.status(404).json({ error: "Category not found" });
      res.json(updated);
    } catch (err) {
      console.error("PATCH /api/boq/categories/:id:", err);
      res.status(500).json({ error: "Failed to update category" });
    }
  });

  app.delete("/api/boq/categories/:id", async (req, res) => {
    try {
      await storage.deleteBoqCategory(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      console.error("DELETE /api/boq/categories/:id:", err);
      res.status(500).json({ error: "Failed to delete category" });
    }
  });

  // --- BOQ Items ---

  app.get("/api/boq/projects/:id/items", async (req, res) => {
    try {
      const items = await storage.getBoqItems(parseInt(req.params.id));
      res.json(items);
    } catch (err) {
      console.error("GET /api/boq/projects/:id/items:", err);
      res.status(500).json({ error: "Failed to fetch BOQ items" });
    }
  });

  app.get("/api/boq/all-items", async (req, res) => {
    try {
      const projects = await storage.getBoqProjects();
      const all: Array<Record<string, unknown>> = [];
      for (const project of projects) {
        const items = await storage.getBoqItems(project.id);
        for (const item of items) {
          all.push({ ...item, projectId: project.id, projectName: project.name });
        }
      }
      res.json(all);
    } catch (err) {
      console.error("GET /api/boq/all-items:", err);
      res.status(500).json({ error: "Failed to fetch all BOQ items" });
    }
  });

  app.post("/api/boq/projects/:id/import", async (req, res) => {
    try {
      const boqProjectId = parseInt(req.params.id);
      const { items, mode = "append" } = req.body as {
        items: Array<{
          itemCode?: string;
          snlCode?: string;
          description: string;
          unit: string;
          boqQty: number;
          clientRate?: number;
          categoryName?: string;
          workCategory?: string;
          sortOrder?: number;
        }>;
        mode?: "append" | "replace";
      };
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "items array is required and must not be empty" });
      }
      const invalid = items.find((it) => !it.description || !it.unit);
      if (invalid) return res.status(400).json({ error: "Each item must have description and unit" });
      const validCategoryCodes = new Set(
        (await import("../shared/boqWorkCategories.js")).BOQ_WORK_CATEGORIES.map((c: { code: string }) => c.code)
      );
      const badCat = items.find((it) => it.workCategory && !validCategoryCodes.has(it.workCategory));
      if (badCat) {
        return res.status(400).json({ error: `Invalid workCategory code: "${badCat.workCategory}"` });
      }
      // Replace mode: delete all existing items (and their programme stretches) before importing
      let deleted = 0;
      if (mode === "replace") {
        deleted = await storage.deleteAllBoqItemsForProject(boqProjectId);
      }
      const result = await storage.importBoqItems(boqProjectId, items);
      res.status(201).json({ ...result, deleted });
      // Fire-and-forget auto-mapping using the exact IDs returned from insert
      if (result.insertedIds.length > 0) {
        autoMapBoqItems(result.insertedIds).catch(err => console.error("[autoMapper] post-import error:", err));
      }
    } catch (err) {
      console.error("POST /api/boq/projects/:id/import:", err);
      res.status(500).json({ error: "Failed to import BOQ items" });
    }
  });

  app.patch("/api/boq/items/:id", async (req, res) => {
    try {
      const updated = await storage.updateBoqItem(parseInt(req.params.id), req.body);
      if (!updated) return res.status(404).json({ error: "BOQ item not found" });
      res.json(updated);
    } catch (err) {
      console.error("PATCH /api/boq/items/:id:", err);
      res.status(500).json({ error: "Failed to update BOQ item" });
    }
  });

  app.post("/api/boq/projects/:id/cleanup-zero-qty", async (req, res) => {
    try {
      const deleted = await storage.deleteZeroQtyBoqItemsForProject(parseInt(req.params.id));
      res.json({ deleted });
    } catch (err) {
      console.error("POST /api/boq/projects/:id/cleanup-zero-qty:", err);
      res.status(500).json({ error: "Failed to clean up zero-quantity items" });
    }
  });

  app.patch("/api/boq/items/:id/work-type", async (req, res) => {
    try {
      if (!assertEdit(req, res, "qto_boq")) return;
      const id = parseInt(req.params.id);
      const { planningWorkType } = req.body as { planningWorkType: string };
      if (planningWorkType !== "road" && planningWorkType !== "structure") {
        return res.status(400).json({ error: "planningWorkType must be 'road' or 'structure'" });
      }
      await storage.updateBoqItemWorkType(id, planningWorkType);
      res.json({ ok: true, id, planningWorkType });
    } catch (err) {
      console.error("PATCH /api/boq/items/:id/work-type:", err);
      res.status(500).json({ error: "Failed to update work type" });
    }
  });

  app.patch("/api/boq/items/:id/planning-include", async (req, res) => {
    try {
      if (!assertEdit(req, res, "qto_boq")) return;
      const id = parseInt(req.params.id);
      const { includedInPlanning } = req.body as { includedInPlanning: boolean };
      if (typeof includedInPlanning !== "boolean") return res.status(400).json({ error: "includedInPlanning must be a boolean" });
      await storage.updateBoqItemPlanningInclude(id, includedInPlanning);
      res.json({ ok: true, id, includedInPlanning });
    } catch (err) {
      console.error("PATCH /api/boq/items/:id/planning-include:", err);
      res.status(500).json({ error: "Failed to update planning include flag" });
    }
  });

  app.patch("/api/boq/projects/:id/planning-include-bulk", async (req, res) => {
    try {
      if (!assertEdit(req, res, "qto_boq")) return;
      const projectId = parseInt(req.params.id);
      const { categoryId, includedInPlanning } = req.body as { categoryId: number | null; includedInPlanning: boolean };
      if (typeof includedInPlanning !== "boolean") return res.status(400).json({ error: "includedInPlanning must be a boolean" });
      const updated = await storage.bulkUpdateCategoryPlanningInclude(projectId, categoryId ?? null, includedInPlanning);
      res.json({ ok: true, updated, includedInPlanning });
    } catch (err) {
      console.error("PATCH /api/boq/projects/:id/planning-include-bulk:", err);
      res.status(500).json({ error: "Failed to bulk update planning include flag" });
    }
  });

  app.delete("/api/boq/items/:id", async (req, res) => {
    try {
      await storage.deleteBoqItem(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      console.error("DELETE /api/boq/items/:id:", err);
      res.status(500).json({ error: "Failed to delete BOQ item" });
    }
  });

  // --- BOQ Revisions ---

  app.get("/api/boq/projects/:id/revisions", async (req, res) => {
    try {
      const revisions = await storage.getBoqRevisions(parseInt(req.params.id));
      res.json(revisions);
    } catch (err) {
      console.error("GET /api/boq/projects/:id/revisions:", err);
      res.status(500).json({ error: "Failed to fetch revisions" });
    }
  });

  app.post("/api/boq/projects/:id/revisions", async (req, res) => {
    try {
      const boqProjectId = parseInt(req.params.id);
      const { label, notes, createdBy, items } = req.body as {
        label: string;
        notes?: string;
        createdBy?: string;
        items: Array<{ boqItemId: number; revisedQty: number; changeReason: string }>;
      };
      if (!label) return res.status(400).json({ error: "label is required" });
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "items array is required" });
      }
      const invalid = items.find((it) => !it.changeReason?.trim());
      if (invalid) return res.status(400).json({ error: "Each revision item must have a changeReason" });
      const revision = await storage.createBoqRevision(boqProjectId, { label, notes, createdBy }, items);
      res.status(201).json(revision);
    } catch (err) {
      console.error("POST /api/boq/projects/:id/revisions:", err);
      res.status(500).json({ error: "Failed to create revision" });
    }
  });

  app.patch("/api/boq/revisions/:id/activate", async (req, res) => {
    try {
      const { approvedBy } = req.body as { approvedBy: string };
      if (!approvedBy) return res.status(400).json({ error: "approvedBy is required" });
      const updated = await storage.activateBoqRevision(parseInt(req.params.id), approvedBy);
      if (!updated) return res.status(404).json({ error: "Revision not found or already superseded" });
      res.json(updated);
    } catch (err) {
      console.error("PATCH /api/boq/revisions/:id/activate:", err);
      res.status(500).json({ error: "Failed to activate revision" });
    }
  });

  app.delete("/api/boq/revisions/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteBoqRevision(parseInt(req.params.id));
      if (!deleted) return res.status(400).json({ error: "Only draft revisions can be deleted" });
      res.json({ ok: true });
    } catch (err) {
      console.error("DELETE /api/boq/revisions/:id:", err);
      res.status(500).json({ error: "Failed to delete revision" });
    }
  });

  // --- Work Programme Bars ---

  app.get("/api/boq/projects/:id/programme", async (req, res) => {
    try {
      const bars = await storage.getWorkProgramBars(parseInt(req.params.id));
      res.json(bars);
    } catch (err) {
      console.error("GET /api/boq/projects/:id/programme:", err);
      res.status(500).json({ error: "Failed to fetch work programme" });
    }
  });

  app.post("/api/boq/projects/:id/programme", async (req, res) => {
    try {
      const boqProjectId = parseInt(req.params.id);
      const data = { ...req.body, boqProjectId };
      if (!data.boqItemId || !data.startMonth || !data.endMonth) {
        return res.status(400).json({ error: "boqItemId, startMonth, endMonth are required" });
      }
      if (data.endMonth < data.startMonth) {
        return res.status(400).json({ error: "endMonth must be >= startMonth" });
      }
      const bar = await storage.upsertWorkProgramBar(data);
      res.status(201).json(bar);
    } catch (err) {
      console.error("POST /api/boq/projects/:id/programme:", err);
      res.status(500).json({ error: "Failed to create work programme bar" });
    }
  });

  app.post("/api/boq/projects/:id/programme/bulk", async (req, res) => {
    try {
      const boqProjectId = parseInt(req.params.id);
      const { bars } = req.body as { bars: Array<Record<string, any>> };
      if (!Array.isArray(bars) || bars.length === 0) {
        return res.status(400).json({ error: "bars array is required and must not be empty" });
      }
      let created = 0;
      for (const b of bars) {
        if (!b.boqItemId || b.startMonth == null || b.endMonth == null) continue;
        if (b.endMonth < b.startMonth) continue;
        await storage.upsertWorkProgramBar({ ...b, boqProjectId });
        created++;
      }
      res.status(201).json({ created });
    } catch (err) {
      console.error("POST /api/boq/projects/:id/programme/bulk:", err);
      res.status(500).json({ error: "Failed to bulk-create programme bars" });
    }
  });

  app.patch("/api/boq/programme/bars/:id", async (req, res) => {
    try {
      const updated = await storage.updateWorkProgramBar(parseInt(req.params.id), req.body);
      if (!updated) return res.status(404).json({ error: "Bar not found" });
      res.json(updated);
    } catch (err) {
      console.error("PATCH /api/boq/programme/bars/:id:", err);
      res.status(500).json({ error: "Failed to update bar" });
    }
  });

  app.delete("/api/boq/programme/bars/:id", async (req, res) => {
    try {
      await storage.deleteWorkProgramBar(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      console.error("DELETE /api/boq/programme/bars/:id:", err);
      res.status(500).json({ error: "Failed to delete bar" });
    }
  });

  // ── Clean road-style bars from structure items ────────────────────────────
  // Deletes auto-sequence and auto-generate bars that were incorrectly placed on
  // BOQ items that are structure-planned. An item is treated as structure-planned
  // when ANY of the following is true:
  //   - planningWorkType === "structure" (explicit or classifier-set)
  //   - it already has at least one source = "structure_import" bar
  //   - its BOQ category/section name matches a known structure section
  //     (Culverts, Bridges, Minor/Major Bridges, Drainage and Protection Works,
  //     Retaining Walls)
  //   - its description matches structure-context keywords (bearing, POT, PTFE,
  //     tar paper, expansion joint, drainage spout, weep hole, bridge numbering,
  //     bridge painting, approach slab, abutment, pier, substructure,
  //     superstructure, filter media behind abutment, wing wall, head wall,
  //     retaining wall, foundation excavation)
  // Structure-location (imported) bars are always preserved. Genuine manual bars
  // (source="manual" with a custom, non-auto-generated label) are NEVER deleted
  // silently — they are returned as `needsConfirmation` and only removed when the
  // caller re-POSTs with their ids in `confirmBarIds`.
  app.post("/api/boq/projects/:id/programme/clean-structure-bars", async (req, res) => {
    try {
      const boqProjectId = parseInt(req.params.id);
      const confirmBarIds: number[] = Array.isArray(req.body?.confirmBarIds)
        ? (req.body.confirmBarIds as any[]).map((x) => Number(x)).filter((n) => Number.isFinite(n))
        : [];
      const items = await storage.getBoqItems(boqProjectId);
      const bars  = await storage.getWorkProgramBars(boqProjectId);

      // Items that have at least one imported structure-location bar are implicitly
      // structure-planned even if planningWorkType was never set manually.
      const structureImportItemIds = new Set(
        (bars as any[])
          .filter((b) => b.source === "structure_import")
          .map((b) => b.boqItemId),
      );

      const structureItemIds = new Set([
        ...(items as any[])
          .filter((it) => isStructureOrLocationScheduledItem(it, { hasStructureImportBar: structureImportItemIds.has(it.id) }))
          .map((it) => it.id),
        ...structureImportItemIds,
      ]);

      if (structureItemIds.size === 0) {
        return res.json({ deleted: 0, needsConfirmation: [], message: "No structure-planned BOQ items found (no structure_import bars, no matching category/keywords)" });
      }

      // Regex that matches labels auto-generated by the planning engine.
      // Legacy bars created before the source column was populated often have
      // source="manual" but carry one of these auto-generated label values.
      const AUTO_LABEL_RE = /^(Full Length|Structures|Bridges|Reach \d+|Struct\. Front \d+|Bridge Grp \d+)$/;

      const toDelete: any[] = [];
      const needsConfirmation: any[] = [];

      for (const b of bars as any[]) {
        if (!structureItemIds.has(b.boqItemId)) continue;
        if (b.planningMode === "structure_location") continue; // always keep imported bars
        // Auto-sequence / auto-generate bars
        if (b.source === "auto-sequence" || b.source === "auto_generate") { toDelete.push(b); continue; }
        // Null source = legacy bar created before source column existed
        if (!b.source) { toDelete.push(b); continue; }
        // source="manual" but carrying an auto-generated label → legacy stray bar
        if (b.source === "manual" && AUTO_LABEL_RE.test(b.reachLabel ?? "")) { toDelete.push(b); continue; }
        // Genuine manual bar on a structure item — never delete silently.
        if (b.source === "manual") {
          if (confirmBarIds.includes(b.id)) {
            toDelete.push(b);
          } else {
            needsConfirmation.push({ id: b.id, boqItemId: b.boqItemId, reachLabel: b.reachLabel, startMonth: b.startMonth, endMonth: b.endMonth, plannedQty: b.plannedQty });
          }
        }
      }

      let deleted = 0;
      for (const b of toDelete) {
        await storage.deleteWorkProgramBar(b.id);
        deleted++;
      }

      const messageParts: string[] = [];
      messageParts.push(deleted ? `Removed ${deleted} road-style bar(s) from structure items` : "No stray auto-generated bars found on structure items");
      if (needsConfirmation.length) {
        messageParts.push(`${needsConfirmation.length} manually-created bar(s) on structure items need confirmation before deletion`);
      }

      res.json({
        deleted,
        needsConfirmation,
        message: messageParts.join("; "),
      });
    } catch (err) {
      console.error("POST /api/boq/projects/:id/programme/clean-structure-bars:", err);
      res.status(500).json({ error: "Failed to clean structure bars" });
    }
  });

  // --- Monthly Targets & Plan vs Actual ---

  app.get("/api/boq/projects/:id/monthly-targets", async (req, res) => {
    try {
      const targets = await storage.getMonthlyTargets(parseInt(req.params.id));
      res.json(targets);
    } catch (err) {
      console.error("GET /api/boq/projects/:id/monthly-targets:", err);
      res.status(500).json({ error: "Failed to fetch monthly targets" });
    }
  });

  app.get("/api/boq/projects/:id/plan-vs-actual", async (req, res) => {
    try {
      const asOfDate = req.query.asOf as string | undefined;
      const rows = await storage.getPlanVsActual(parseInt(req.params.id), asOfDate);
      res.json(rows);
    } catch (err) {
      console.error("GET /api/boq/projects/:id/plan-vs-actual:", err);
      res.status(500).json({ error: "Failed to fetch plan vs actual" });
    }
  });

  // --- BOQ Item Recipes (Equipment / Labour / Materials per work item) ---

  app.get("/api/boq/items/:itemId/recipes", async (req, res) => {
    try {
      const item = await storage.getBoqItemWithRecipes(parseInt(req.params.itemId));
      if (!item) return res.status(404).json({ error: "Item not found" });
      res.json(item);
    } catch (err) {
      console.error("GET /api/boq/items/:itemId/recipes:", err);
      res.status(500).json({ error: "Failed to fetch item recipes" });
    }
  });

  // All items + recipes for the Resource Review screen
  app.get("/api/boq/projects/:id/resource-review", async (req, res) => {
    try {
      res.json(await storage.getBoqItemsWithRecipes(parseInt(req.params.id)));
    } catch (err) {
      console.error("GET /api/boq/projects/:id/resource-review:", err);
      res.status(500).json({ error: "Failed to fetch resource review" });
    }
  });

  // Equipment recipe
  app.get("/api/boq/items/:itemId/equipment", async (req, res) => {
    try {
      res.json(await storage.getBoqItemEquipment(parseInt(req.params.itemId)));
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch item equipment" });
    }
  });

  app.put("/api/boq/items/:itemId/equipment", async (req, res) => {
    try {
      const rows = req.body.rows ?? [];
      const saved = await storage.upsertBoqItemEquipment(parseInt(req.params.itemId), rows);
      res.json(saved);
    } catch (err) {
      console.error("PUT /api/boq/items/:itemId/equipment:", err);
      res.status(500).json({ error: "Failed to save item equipment" });
    }
  });

  // Labour recipe
  app.get("/api/boq/items/:itemId/labour", async (req, res) => {
    try {
      res.json(await storage.getBoqItemLabour(parseInt(req.params.itemId)));
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch item labour" });
    }
  });

  app.put("/api/boq/items/:itemId/labour", async (req, res) => {
    try {
      const rows = req.body.rows ?? [];
      const saved = await storage.upsertBoqItemLabour(parseInt(req.params.itemId), rows);
      res.json(saved);
    } catch (err) {
      console.error("PUT /api/boq/items/:itemId/labour:", err);
      res.status(500).json({ error: "Failed to save item labour" });
    }
  });

  // Materials recipe
  app.get("/api/boq/items/:itemId/materials", async (req, res) => {
    try {
      res.json(await storage.getBoqItemMaterials(parseInt(req.params.itemId)));
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch item materials" });
    }
  });

  app.put("/api/boq/items/:itemId/materials", async (req, res) => {
    try {
      const rows = req.body.rows ?? [];
      const saved = await storage.upsertBoqItemMaterials(parseInt(req.params.itemId), rows);
      res.json(saved);
    } catch (err) {
      console.error("PUT /api/boq/items/:itemId/materials:", err);
      res.status(500).json({ error: "Failed to save item materials" });
    }
  });

  // Materials used in recipes across all BOQ items in a project (for suggestion strip)
  app.get("/api/boq/projects/:id/recipe-materials-used", async (req, res) => {
    try {
      res.json(await storage.getRecipeMaterialsUsed(parseInt(req.params.id)));
    } catch (err) {
      console.error("GET /api/boq/projects/:id/recipe-materials-used:", err);
      res.status(500).json({ error: "Failed to fetch recipe materials" });
    }
  });

  // ── BOM helper functions ────────────────────────────────────────────────────
  // Items that physically CONSUME no key material (demolition / removal / milling).
  // These must never demand cement/RMC/bitumen/aggregate, regardless of the words
  // (e.g. "Dismantling structures ... RCC", "Dismantling of pavements ... Concrete").
  function isNonConsumingItem(desc: string): boolean {
    return /\bdismantl|\bdemolit|\bdemolish|\bremoving\b|\bremoval\b|\bbreaking\b|\bscarif|\bmilling\b/i.test(desc);
  }

  function isMaterialDrivingLayerItem(item: any): boolean {
    const lc = item.layerConfig as LayerConfig | null;
    const desc = String(item.description ?? "").toLowerCase();
    const cat = String(item.workCategory ?? "").toLowerCase();
    if (isNonConsumingItem(desc)) return false; // demolition/removal → no key material
    if (lc?.layerType && lc.layerType !== "none") return true;
    return (
      /\bgsb\b|granular\s*sub[-\s]*base|wet\s*mix|\bwmm\b|dbm|dense\s*bituminous|bituminous\s*concrete|\bbc\b|bituminous\s*macadam|\bbm\b|sdbc|wearing\s*coat|prime\s*coat|tack\s*coat|\bpcc\b|\brcc\b|\bpqc\b|\bdlc\b|cement\s*concrete|plain\s*cement\s*concrete|reinforced\s*cement\s*concrete|pavement\s*quality\s*concrete|dry\s*lean\s*concrete|concrete\s*of\s*grade/i.test(desc) ||
      /subbase|base|bituminous|concrete/i.test(cat)
    );
  }

  function isSimpleDirectMaterialItem(item: any): boolean {
    const desc = String(item.description ?? "").toLowerCase();
    return /filter\s*media|stone\s*spalls|stone\s*pitching|boulder|pipe|np3|np4|hdpe|bearing|expansion\s*joint|joint\s*sealant|sealant|dowel|plastic\s*sheath|geotextile|separation\s*membrane|sign\s*board|stud|marker|reflector|kerb|railing|crash\s*barrier|anchor|anchorage/i.test(desc);
  }

  function isRawSdbAggregateName(name: string): boolean {
    const s = String(name ?? "").toLowerCase();
    return (
      /\d+(\.\d+)?\s*mm.*\d+(\.\d+)?\s*mm/.test(s) ||
      /below\s*\d+(\.\d+)?\s*mm/.test(s) ||
      /\d+(\.\d+)?\s*mm\s*and\s*below/.test(s) ||
      /percent|per\s*cent|gradation|graded\s*aggregate|coarse\s*graded|fine\s*graded/i.test(s)
    );
  }

  function detectConcreteGrade(text: string): string | null {
    const s = String(text ?? "").toUpperCase();
    // Accept "M15", "M-15", "M 15", "M -15", "GRADE M-25" etc. (dash/space tolerant)
    const m = s.match(/\bM[\s-]*([0-9]{2,3})\b/);
    return m ? `M${m[1]}` : null;
  }

  function isConcreteLayerOrItem(item: any): boolean {
    const lc = item.layerConfig as LayerConfig | null;
    const desc = String(item.description ?? "").toLowerCase();
    if (lc?.layerType === "concrete") return true;
    if (lc?.layerType === "bituminous") return false;
    if (isNonConsumingItem(desc)) return false;     // dismantling RCC/PQC → not a concrete pour
    if (/bitumin/i.test(desc)) return false;          // "bituminous concrete" is bituminous, not RCC
    return /\bpcc\b|\brcc\b|\bpqc\b|\bdlc\b|plain\s*cement\s*concrete|reinforced\s*cement\s*concrete|dry\s*lean\s*concrete|pavement\s*quality\s*concrete|cement\s*concrete|concrete\s*of\s*grade|grade\s*m\s*-?\s*\d{2}/i.test(desc);
  }

  function isBituminousLayerOrItem(item: any): boolean {
    const lc = item.layerConfig as LayerConfig | null;
    const desc = String(item.description ?? "").toLowerCase();
    if (lc?.layerType === "bituminous") return true;
    if (isNonConsumingItem(desc)) return false;     // dismantling bituminous layer → not a laying item
    return /dbm|dense\s*bituminous|bituminous\s*concrete|\bbc\b|bituminous\s*macadam|\bbm\b|sdbc|wearing\s*coat/i.test(desc);
  }

  // Synthesize a LayerConfig from the deterministic work-type classifier (Patch 14)
  // when an item has no manually-saved layerConfig. This unlocks the existing P2
  // derivation so concrete hits the RMC mix designs and bituminous hits the Master
  // mix templates automatically — instead of falling straight to "setup required".
  function synthLayerConfigFromWorkType(item: any): LayerConfig | null {
    const desc = String(item.description ?? "");
    const unit = String(item.unit ?? "");
    if (isNonConsumingItem(desc.toLowerCase())) return null;

    const wt = classifyWorkType(desc, unit);
    if (!wt) return null;

    const d = desc.toLowerCase();
    const thM = desc.match(/([0-9]+(?:\.[0-9]+)?)\s*mm/i);
    const detectedThk = thM ? parseFloat(thM[1]) : null;
    const srM = desc.match(/([0-9]+(?:\.[0-9]+)?)\s*kg\s*(?:per|\/)?\s*(?:sqm|sq\.?\s*m|m2|m²)/i);
    const detectedRate = srM ? parseFloat(srM[1]) : null;

    switch (wt) {
      case "earthwork":
        return { layerType: "earthwork" };
      case "gsb":
        return { layerType: "granular", mixType: "GSB", granularSource: "quarry" };
      case "wmm":
        return { layerType: "granular", mixType: "WMM", granularSource: "quarry" };
      case "prime_coat":
        return { layerType: "spray_coat", mixType: "PRIME", coverageRateKgPerSqm: detectedRate ?? 1.0, coverageMaterialName: "Primer (Bitumen Emulsion)" };
      case "tack_coat":
        return { layerType: "spray_coat", mixType: "TACK", coverageRateKgPerSqm: detectedRate ?? 0.3, coverageMaterialName: "Tack Coat (Bitumen Emulsion)" };
      case "bituminous_base":
        return {
          layerType: "bituminous",
          mixType: /\bbm\b|bituminous\s*macadam/i.test(d) && !/dense/i.test(d) ? "BM" : "DBM",
          thicknessMm: detectedThk ?? 75,
          densityTPerCum: 2.35,
        };
      case "bituminous_wearing":
        return {
          layerType: "bituminous",
          mixType: /sdbc|semi[-\s]*dense/i.test(d) ? "SDBC" : "BC",
          thicknessMm: detectedThk ?? 40,
          densityTPerCum: 2.4,
        };
      case "pcc":
      case "rcc":
      case "pqc":
      case "dlc": {
        // Only real volumetric concrete pours demand RMC. Count/lump-sum items
        // (toll booths = Nos, buildings = LS/Sqm) and pipe-laying items must NOT.
        const uNorm = unit.toUpperCase().replace(/[^A-Z0-9]/g, "");
        const isVolumetric = /^(CUM|CUB|M3|CU)$/.test(uNorm) || /cu\.?\s*m|cubic/i.test(unit);
        if (!isVolumetric) return null;
        if (/\bpipe|np\d|hume|hdpe/i.test(d)) return null;
        return {
          layerType: "concrete",
          mixType: wt === "dlc" ? "DLC" : wt === "pqc" ? "PQC" : null,
        };
      }
      case "drain_masonry":
      default:
        return null;
    }
  }

  // Composite bituminous layer parser — detects items like "40mm BC + 25mm mastic asphalt"
  // and returns each sub-layer so materials are derived independently and then combined.
  // Only applies to area-based (Sqm) items; CUM/MT items use the template directly.
  function parseCompositeLayers(
    desc: string, unit: string,
  ): Array<{thicknessMm: number; mixType: string; density: number}> | null {
    const uNorm = unit.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!/^(SQM|M2|SQMT|SQM)/.test(uNorm)) return null;
    const d = desc.toLowerCase();
    const found: Array<{thicknessMm: number; mixType: string; density: number}> = [];
    const tryExtract = (typePattern: string, mixType: string, density: number) => {
      const rx = new RegExp(
        `(\\d+)\\s*mm\\s*(?:thick\\s*)?(?:layer\\s*of\\s*)?(?:${typePattern})`, "i",
      );
      const m = d.match(rx);
      if (m) {
        const thk = parseInt(m[1], 10);
        if (thk > 0 && thk < 200 && !found.find(f => f.mixType === mixType)) {
          found.push({ thicknessMm: thk, mixType, density });
        }
      }
    };
    tryExtract("mastic", "MA", 2.30);
    tryExtract("\\bbc\\b|bituminous\\s*concrete", "BC", 2.40);
    tryExtract("sdbc|semi.?dense\\s*bituminous", "SDBC", 2.40);
    tryExtract("dense\\s*bituminous|\\bdbm\\b", "DBM", 2.35);
    tryExtract("\\bbm\\b|bituminous\\s*macadam", "BM", 2.35);
    return found.length > 1 ? found : null;
  }

  // Shared BOM expansion — resolves each BOQ item to its best material list using the
  // P1→P4 source priority. Used by BOTH /bom and /shortage-check so the two endpoints
  // can never drift apart. (Previously /shortage-check referenced an `expandedItems`
  // that only existed inside /bom → ReferenceError → empty Procurement Intelligence.)
  async function computeProjectBom(projectId: number) {
      const [allBoqItems, bars, project, allMaterials, rmcDesigns, allMixTemplates] = await Promise.all([
        storage.getBoqItemsWithRecipes(projectId),
        storage.getWorkProgramBars(projectId),
        storage.getBoqProject(projectId),
        storage.getPlantMaterials(), // for mix template component name resolution
        storage.getRmcMixDesigns(), // concrete materials source (RMC module)
        storage.getMixTemplates(),  // bituminous standard templates (Masters/HMP)
      ]);

      // Filter to items included in planning (excluded items stay in BOQ for billing only)
      const items = allBoqItems.filter(it => it.includedInPlanning !== false);

      // Build materialId → name map for resolving mix template component names
      const matNameById = new Map(allMaterials.map(m => [m.id, m.name]));

      // Collect unique mix template IDs referenced by layerConfigs
      const mixTemplateIds = new Set<number>();
      for (const item of items) {
        const lc = (item as any).layerConfig as LayerConfig | null;
        if (lc?.mixTemplateId) mixTemplateIds.add(Number(lc.mixTemplateId));
      }

      // Fetch mix-template links for this project (fallback for bituminous items without a direct mixTemplateId)
      const mixLinks = await storage.getBoqMixLinks(projectId);
      const mixTypeToTemplateId = new Map<string, number>();
      for (const link of mixLinks) {
        if (link.mixTemplateId) {
          // Index both the raw key and its normalised form so lookups succeed
          // regardless of whether links were saved as "BC" or "Bituminous Concrete".
          const raw = link.mixType.toUpperCase();
          const normalised = normaliseMixType(link.mixType);
          mixTypeToTemplateId.set(raw, link.mixTemplateId);
          if (normalised !== raw) mixTypeToTemplateId.set(normalised, link.mixTemplateId);
        }
      }
      // Also add link template IDs to the fetch set
      for (const tmplId of mixTypeToTemplateId.values()) mixTemplateIds.add(tmplId);

      // Concrete: index RMC mix designs by grade (active only) for concrete material derivation.
      const gradeToDesign = new Map<string, typeof rmcDesigns[number]>();
      for (const d of rmcDesigns) {
        if ((d as any).isActive === 0) continue;
        // Normalise "M 25" / "M-25" → "M25" so detected grades match the RMC entry.
        const g = String(d.grade ?? "").toUpperCase().replace(/[\s-]/g, "");
        if (g && !gradeToDesign.has(g)) gradeToDesign.set(g, d);
      }

      // Pre-add ALL master template IDs so mixTemplateMap gets component data for every
      // template before we decide which one wins for each mix type.
      for (const t of allMixTemplates) mixTemplateIds.add(t.id);

      // (Cross-type "first bituminous template" fallback removed — Patch 40.
      //  Items with no matching mix type now fall back to the built-in IRC default
      //  for their exact type inside deriveMaterialsFromLayerConfig.)

      // Fetch mix template data and resolve component material names in parallel
      const mixTemplateMap = new Map<number, {
        bitumenPercent: number | null;
        ldoNorm: number | null;
        binderGrade: string | null;
        densityTPerCum: number | null;
        components: Array<{ materialName: string; percent: number | null }>;
      }>();
      await Promise.all([...mixTemplateIds].map(async (mtId) => {
        const mt = await storage.getMixTemplateWithComponents(mtId);
        if (mt) {
          mixTemplateMap.set(mtId, {
            bitumenPercent: mt.template.bitumenPercent ?? null,
            ldoNorm: mt.template.ldoNorm ?? 6,
            binderGrade: (mt.template as any).binderGrade ?? null,
            densityTPerCum: (mt.template as any).densityTPerCum ?? null,
            components: mt.components.map(c => ({
              materialName: matNameById.get(c.materialId) ?? `Material #${c.materialId}`,
              percent: c.percent ?? null,
            })),
          });
        }
      }));

      // Bituminous: index STANDARD mix templates in Masters/HMP as fallback when no project
      // link exists for a mix type. "Usable" templates (components with actual percent values)
      // always beat stubs (all-null percent). This prevents a stub DBM template from
      // blocking a fully-filled DBM template with the same mixType key.
      const tmplUsableScore = (tmplId: number) =>
        (mixTemplateMap.get(tmplId)?.components ?? []).filter(c => (c.percent ?? 0) > 0).length;

      for (const t of allMixTemplates) {
        const raw = String(t.mixType ?? "").toUpperCase();
        const normalised = normaliseMixType(t.mixType ?? "");
        for (const key of Array.from(new Set([raw, normalised].filter(Boolean)))) {
          const existing = mixTypeToTemplateId.get(key);
          if (!existing) {
            mixTypeToTemplateId.set(key, t.id);
          } else if (tmplUsableScore(t.id) > tmplUsableScore(existing)) {
            // Upgrade: new candidate has more filled-in component percentages
            mixTypeToTemplateId.set(key, t.id);
          }
        }
      }

      const barItemIds = new Set(bars.map(b => b.boqItemId));

      // For each item resolve the best possible material list using source priority:
      //   P1 — manual (non-auto) rows for non-layer items
      //   P2 — layerConfig derivation (bituminous JMF / granular / spray coat / concrete mix design)
      //   P3 — setup warning if major layer item has no usable template
      //   P4 — cleaned SDB rows for simple direct-material items
      const expandedItems = items.map(item => {
        const savedLc = (item as any).layerConfig as LayerConfig | null;
        // Trust a manually-saved layer config; otherwise synthesize from the work-type classifier.
        const lc: LayerConfig | null =
          savedLc && savedLc.layerType && savedLc.layerType !== "none"
            ? savedLc
            : synthLayerConfigFromWorkType(item);
        const manualMaterials = item.materials.filter((m: any) => !m.isAuto);
        const materialDriving = isMaterialDrivingLayerItem(item);
        const simpleDirect = isSimpleDirectMaterialItem(item);
        const concreteGrade = detectConcreteGrade((item as any).description ?? "");

        // P1: manual materials trusted only when not a major material-driving layer item
        if (manualMaterials.length > 0 && !materialDriving) {
          return { ...item, materials: manualMaterials, materialSetupWarning: null, isProgrammed: barItemIds.has(item.id) };
        }

        // P2: layerConfig derivation
        if (lc && lc.layerType && lc.layerType !== "none") {
          let resolvedMixTemplateId: number | null = lc.mixTemplateId ?? null;

          if (!resolvedMixTemplateId && lc.layerType === "bituminous" && lc.mixType) {
            resolvedMixTemplateId =
              mixTypeToTemplateId.get(lc.mixType.toUpperCase()) ??
              mixTypeToTemplateId.get(normaliseMixType(lc.mixType)) ??
              null;
          }
          if (!resolvedMixTemplateId && lc.layerType === "bituminous" && (item as any).workCategory) {
            const cat = (item as any).workCategory as string;
            resolvedMixTemplateId =
              mixTypeToTemplateId.get(cat.toUpperCase()) ??
              mixTypeToTemplateId.get(normaliseMixType(cat)) ??
              null;
          }
          // NOTE: no cross-type fallback here. If no template matches this item's exact
          // mix type (BC/DBM/SDBC/BM), we intentionally leave it unresolved so the engine
          // falls back to the built-in IRC default for THAT mix type — never borrowing a
          // different type's template (which caused BC to show DBM's grade/aggregates).
          // Concrete/RMC — prefer the user's RMC module mix design (by grade), then
          // fall back to the deterministic standard design so concrete demand never
          // silently blanks out. lc.mixType carries DLC/PQC when the description has
          // no explicit M-grade.
          const concreteKey = String(concreteGrade ?? (lc as any).mixType ?? "").toUpperCase().replace(/[\s-]/g, "");
          const concreteDesign =
            lc.layerType === "concrete" && concreteKey
              ? (gradeToDesign.get(concreteKey) ?? STANDARD_CONCRETE_DESIGNS[concreteKey] ?? null)
              : null;

          // Emulsion — derive the spraying rate from the BOQ description when the layer
          // config has no explicit coverage rate (emulsion demand = rate kg/sqm × area).
          let effLc = lc;
          if (lc.layerType === "spray_coat" && !(lc.coverageRateKgPerSqm && lc.coverageRateKgPerSqm > 0)) {
            const rm = String((item as any).description ?? "").match(/([0-9]+(?:\.[0-9]+)?)\s*kg\s*(?:per|\/)?\s*(?:sqm|sq\.?\s*m|m2|m²|square\s*met)/i);
            if (rm) effLc = { ...lc, coverageRateKgPerSqm: parseFloat(rm[1]) };
          }

          const mixTemplate = resolvedMixTemplateId ? mixTemplateMap.get(resolvedMixTemplateId) : null;

          // Grade from description wins over template grade.
          // "premixed with bituminous binder of VG-30" → always → "Bitumen VG-30"
          // regardless of which VG grade the mapped template happens to have saved.
          const descBinderGrade = (() => {
            const d = String((item as any).description ?? "");
            if (/vg\s*-?\s*40|vg40/i.test(d)) return "VG-40";
            if (/vg\s*-?\s*30|vg30/i.test(d)) return "VG-30";
            if (/vg\s*-?\s*10|vg10/i.test(d)) return "VG-10";
            return null;
          })();

          // Composite item detection — e.g. "40mm BC and 25mm mastic asphalt".
          // We derive materials for each sub-layer using its own template, then combine.
          const compositeLayers =
            effLc?.layerType === "bituminous"
              ? parseCompositeLayers(String((item as any).description ?? ""), item.unit)
              : null;

          let derived: ReturnType<typeof deriveMaterialsFromLayerConfig>;
          if (compositeLayers && compositeLayers.length > 0) {
            // Normalise raw SDB/template aggregate names to IRC standard names before
            // combining sub-layer rows, so "10/12MM" from a BC template merges with
            // "10mm Aggregate" produced by the MA IRC default (and vice versa for 6mm/dust).
            const normaliseCompKey = (name: string): string => {
              const n = name.trim();
              if (/^20\s*mm$/i.test(n)) return "20mm Aggregate";
              if (/^10\/12\s*mm$|^10\s*mm\s*chips?$|^12\.?5\s*mm$/i.test(n)) return "10mm Aggregate";
              if (/^6\s*mm\s*(down|agg|chips?)?$|^6\.?3\s*mm$/i.test(n)) return "6mm Aggregate";
              if (/^dust$|^stone\s*dust$|^crusher\s*dust$|^aggregate\s*dust$/i.test(n)) return "Stone Dust";
              return n;
            };
            const combinedMap = new Map<string, { materialName: string; uom: string; qtyPerBoqUnit: number; isAuto: boolean; applicationNote?: string }>();
            for (const cl of compositeLayers) {
              const subTmplId =
                mixTypeToTemplateId.get(cl.mixType) ??
                mixTypeToTemplateId.get(normaliseMixType(cl.mixType)) ??
                null;
              const subTmpl = subTmplId ? mixTemplateMap.get(subTmplId) : null;
              const subLc: LayerConfig = {
                layerType: "bituminous",
                mixType: cl.mixType,
                thicknessMm: cl.thicknessMm,
                densityTPerCum: cl.density,
              };
              // For composite sub-layers, don't force the item-level description grade onto
              // sub-layers whose templates already specify their own binder grade (e.g. MA
              // uses VG-40 per template while BC uses VG-30 per template). Only fall back to
              // descBinderGrade when the sub-layer's template has no grade of its own.
              const subDescBinderGrade = subTmpl?.binderGrade?.trim()
                ? null
                : descBinderGrade;
              const subDerived = deriveMaterialsFromLayerConfig(
                subLc, item.unit, subTmpl ?? undefined, null, { descBinderGrade: subDescBinderGrade },
              );
              for (const dr of subDerived) {
                // Use normalised key so template names ("10/12MM", "DUST") collapse with
                // IRC generic names ("10mm Aggregate", "Stone Dust") from other sub-layers.
                const normName = normaliseCompKey(dr.materialName);
                const ex = combinedMap.get(normName);
                if (ex) { ex.qtyPerBoqUnit += dr.qtyPerBoqUnit; }
                else combinedMap.set(normName, { ...dr, materialName: normName });
              }
            }
            derived = [...combinedMap.values()] as ReturnType<typeof deriveMaterialsFromLayerConfig>;
            // Build composite label e.g. "BC+MA" from sub-layer mix types (sorted to keep canonical order)
            (item as any).__compositeLabel = compositeLayers.map(cl => cl.mixType).join("+");
          } else {
            derived = deriveMaterialsFromLayerConfig(
              effLc,
              item.unit,
              mixTemplate ?? undefined,
              concreteDesign
                ? {
                    grade: concreteDesign.grade,
                    cementContent: concreteDesign.cementContent,
                    admixtureName: concreteDesign.admixtureName,
                    admixtureDosage: concreteDesign.admixtureDosage,
                    componentProportions: concreteDesign.componentProportions as any,
                  }
                : null,
              { descBinderGrade },
            );
          }

          // --- BITUMEN BOM DIAGNOSTIC (Patch 34) ---
          if (effLc?.layerType === "bituminous") {
            console.log("[BITUMEN BOM]", JSON.stringify({
              item: `${item.itemCode ?? ""} ${item.description?.slice(0, 40)}`,
              unit: item.unit,
              composite: compositeLayers ? compositeLayers.map(c => `${c.thicknessMm}mm ${c.mixType}`) : null,
              descBinderGrade,
              resolvedTemplate: mixTemplate
                ? {
                    binderGrade: (mixTemplate as any).binderGrade ?? null,
                    bitumenPercent: (mixTemplate as any).bitumenPercent ?? null,
                    componentCount: (mixTemplate as any).components?.length ?? 0,
                  }
                : "NO TEMPLATE RESOLVED",
              derivedRows: derived.map((d: any) => ({ name: d.materialName, qtyPerBoqUnit: d.qtyPerBoqUnit })),
            }, null, 2));
          }
          // --- END DIAGNOSTIC ---

          const derivedSupplyType: "direct" | "plant" | undefined =
            lc.layerType === "granular" && lc.granularSource !== "plant" ? "direct"
            : lc.layerType === "granular" && lc.granularSource === "plant" ? "plant"
            : lc.layerType === "bituminous" ? "plant"
            : lc.layerType === "spray_coat" ? "direct"
            : lc.layerType === "concrete" ? "plant"
            : undefined;

          if (derived.length > 0) {
            const derivedRows = derived.map(dm => ({
              materialName: dm.materialName,
              uom: dm.uom,
              qtyPerBoqUnit: dm.qtyPerBoqUnit,
              wastagePct: 0,
              isClientSupplied: false,
              isAuto: true as const,
              supplyType: derivedSupplyType,
            }));

            // HMP hours correction for CUM/SQM bituminous items.
            // The HMP outputs in MT, so when the BOQ unit is SQM or CUM the saved
            // qtyPerBoqUnit falls back to a flat norm (0.00833 hrs/unit) that ignores
            // density and thickness. Correct it here: total MT of mix per BOQ unit
            // (sum of all auto MT material rows) ÷ HMP outputPerHr.
            let correctedEquipment = item.equipment as typeof item.equipment;
            if (lc?.layerType === "bituminous") {
              const boqUnitNorm = (item.unit ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
              const isAlreadyMtUnit = boqUnitNorm === "MT" || boqUnitNorm === "T";
              if (!isAlreadyMtUnit) {
                const totalMtPerBoqUnit = derived.reduce(
                  (sum: number, d: any) => (d.uom === "MT" ? sum + d.qtyPerBoqUnit : sum), 0,
                );
                if (totalMtPerBoqUnit > 0) {
                  correctedEquipment = (item.equipment as any[]).map((eq: any) => {
                    if (!/hot[\s-]?mix[\s-]?plant|hmp\b/i.test(eq.equipmentName ?? "")) return eq;
                    try {
                      const outs = typeof eq.standardOutputs === "string"
                        ? JSON.parse(eq.standardOutputs)
                        : eq.standardOutputs;
                      const mtOut = Array.isArray(outs)
                        ? outs.find((o: any) => String(o.unit ?? "").toUpperCase() === "MT")
                        : null;
                      if (mtOut?.outputPerHr > 0) {
                        const corrected = totalMtPerBoqUnit / mtOut.outputPerHr;
                        console.log(
                          `[HMP HRS FIX] ${item.itemCode} unit=${item.unit} totalMtPerBoqUnit=${totalMtPerBoqUnit.toFixed(4)} ` +
                          `outputPerHr=${mtOut.outputPerHr} old=${eq.qtyPerBoqUnit?.toFixed(5)} new=${corrected.toFixed(5)}`,
                        );
                        return { ...eq, qtyPerBoqUnit: corrected };
                      }
                    } catch { /* keep original if parse fails */ }
                    return eq;
                  });
                }
              }
            }

            return {
              ...item,
              equipment: correctedEquipment,
              materials: derivedRows.map(dm => ({
                id: 0,
                boqItemId: item.id,
                ...dm,
                sortOrder: 0,
                createdAt: null,
              })),
              derivedKeyMaterials: derivedRows,
              materialSetupWarning: null,
              isProgrammed: barItemIds.has(item.id),
              compositeLabel: (item as any).__compositeLabel ?? undefined,
            };
          }

          // P3: layer exists but no usable template — emit warning, no raw SDB fractions
          if (materialDriving) {
            return {
              ...item,
              materials: [],
              materialSetupWarning:
                lc.layerType === "bituminous"
                  ? "Mix template/JMF required for bituminous material demand"
                  : lc.layerType === "concrete"
                  ? `Concrete/RMC mix design required${concreteGrade ? ` for ${concreteGrade}` : ""}`
                  : "Material setup required for this layer item",
              isProgrammed: barItemIds.has(item.id),
            };
          }
        }

        // P3 (no layerConfig): major layer item identified by description/category.
        // Only quantity-driven layer/pour items warrant a warning — count/lump-sum
        // structures (toll booths = Nos, buildings = LS/Each) are not RMC-driven.
        const p3UNorm = String(item.unit ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        const p3IsVolUnit  = /^(CUM|CUB|M3|CU)$/.test(p3UNorm);
        const p3IsAreaUnit = /^(SQM|SM|M2|MT|TON|T)$/.test(p3UNorm);
        if (materialDriving && !simpleDirect && (p3IsVolUnit || p3IsAreaUnit)) {
          return {
            ...item,
            materials: [],
            materialSetupWarning: isConcreteLayerOrItem(item)
              ? `Concrete/RMC mix design required${concreteGrade ? ` for ${concreteGrade}` : ""}`
              : isBituminousLayerOrItem(item)
              ? "Mix template/JMF required for bituminous material demand"
              : "Layer/mix setup required for material demand",
            isProgrammed: barItemIds.has(item.id),
          };
        }

        // P4: simple direct-material or non-layer items — strip raw SDB gradation rows
        const cleanedRows = item.materials.filter((m: any) => {
          if (!m.materialName) return false;
          if (isRawSdbAggregateName(m.materialName) && !simpleDirect) return false;
          return true;
        });
        return { ...item, materials: cleanedRows, materialSetupWarning: null, isProgrammed: barItemIds.has(item.id) };
      });

      return { items, bars, project, expandedItems, excludedCount: allBoqItems.length - items.length };
  }

  // BOM demand for the whole project
  app.get("/api/boq/projects/:id/bom", async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const { items, bars, project, expandedItems, excludedCount } = await computeProjectBom(projectId);
      const barItemIds = new Set(bars.map(b => b.boqItemId));
      const hasRecipes = expandedItems.some(it => it.materials.length > 0 || it.equipment.length > 0 || it.labour.length > 0);
      console.log(`[BOM] project=${projectId} items=${items.length} bars=${bars.length} hasRecipes=${hasRecipes} excluded=${excludedCount}`);
      res.json({
        items: expandedItems,
        bars,
        roadLengthKm: project?.roadLengthKm ?? 0,
        unprogrammedItemIds: items.filter(it => !barItemIds.has(it.id)).map(it => it.id),
        hasBars: bars.length > 0,
        hasItems: items.length > 0,
        hasRecipes,
        _excludedCount: excludedCount,
      });
    } catch (err) {
      console.error("GET /api/boq/projects/:id/bom:", err);
      res.status(500).json({ error: "Failed to fetch BOM data" });
    }
  });

  // Material shortage intelligence — compares WP demand vs current stock.
  // Task #1240: extended to be time-phased (month-by-month, not just a single
  // total-qty comparison) and to net out material already covered by pending
  // PI/IRN procurement, without altering the existing PI/IRN schemas/workflow.
  app.get("/api/boq/projects/:id/shortage-check", async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const project = await storage.getBoqProject(projectId);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const [{ expandedItems, bars }, allStockBalances, allMaterials, allIndents, allIrns] = await Promise.all([
        computeProjectBom(projectId),
        storage.getStockBalances(), // all parties
        storage.getPlantMaterials(),
        storage.getPurchaseIndents(),
        storage.getInternalRequisitions(),
      ]);

      // Build name → current stock lookup (sum across all parties)
      const stockByName = new Map<string, { balance: number; uom: string }>();
      for (const mat of allMaterials) {
        const balRows = allStockBalances.filter(sb => sb.materialId === mat.id);
        const totalBalance = balRows.reduce((sum, sb) => sum + (sb.balance ?? 0), 0);
        const key = mat.name.trim().toLowerCase();
        const existing = stockByName.get(key);
        if (existing) {
          existing.balance += totalBalance;
        } else {
          stockByName.set(key, { balance: totalBalance, uom: mat.uom ?? "" });
        }
      }

      // Build name → pending procurement qty lookup. "Pending" = raised but not
      // yet fully purchased/rejected/cancelled. This is read-only netting for
      // the shortage view only — it never mutates PI/IRN records.
      const TERMINAL_PI_STATUSES = new Set(["purchased", "not_purchased", "cancelled"]);
      const pendingByName = new Map<string, number>();
      const addPending = (name: string | null | undefined, qty: number) => {
        if (!name || !(qty > 0)) return;
        const key = name.trim().toLowerCase();
        pendingByName.set(key, (pendingByName.get(key) ?? 0) + qty);
      };
      for (const pi of allIndents) {
        if (pi.status === "rejected" || pi.status === "closed") continue;
        for (const item of pi.items ?? []) {
          const itemStatus = (item.purchaseStatus ?? "").toLowerCase();
          if (TERMINAL_PI_STATUSES.has(itemStatus)) continue;
          const remaining = (item.approvedQty ?? item.qty) - (item.totalPurchasedQty ?? 0);
          addPending(item.description ?? (item as any).material, remaining);
        }
      }
      for (const irn of allIrns) {
        if (irn.status === "rejected" || irn.status === "closed") continue;
        for (const item of irn.items ?? []) {
          if (item.itemStatus !== "queued_procurement") continue;
          const remaining = (item.procureQty ?? item.qty) - (item.actualIssuedQty ?? 0);
          addPending(item.material, remaining);
        }
      }

      // Compute demand from the RESOLVED items (template/RMC-derived materials drive
      // the numbers, not the legacy saved SDB rows).
      const demand = expandedItems.length && bars.length
        ? calculateBomDemand(expandedItems as any, bars, project.totalMonths ?? 12)
        : { materials: [], equipment: [], labour: [] };

      // Determine current project month (same convention as Plan vs Actual) so
      // month-by-month shortage can flag near-term risk separately from
      // aggregate totals.
      const startDate = project.startDate ? new Date(project.startDate) : null;
      let currentMonth = 1;
      if (startDate) {
        const diffMonths = (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
        currentMonth = Math.max(1, Math.ceil(diffMonths));
      }

      // Build shortage rows — time-phased: current stock covers the earliest
      // months first (running balance), pending procurement is netted against
      // remaining demand before flagging a shortfall.
      const shortageRows = demand.materials.map(matRow => {
        const nameKey = matRow.materialName.trim().toLowerCase();
        const stock = stockByName.get(nameKey);
        const currentStock = stock?.balance ?? 0;
        const stockMatched = stockByName.has(nameKey);
        const pendingProcurement = pendingByName.get(nameKey) ?? 0;
        return computeShortageRow(matRow, currentStock, stockMatched, pendingProcurement, currentMonth);
      });

      // Sort: near-term/actionable shortage first, then aggregate shortage, then adequate
      shortageRows.sort((a, b) => (b.nearTermShortfall - a.nearTermShortfall) || (b.shortfall - a.shortfall));

      res.json({
        projectId,
        projectName: project.name,
        rows: shortageRows,
        hasBars: bars.length > 0,
        hasRecipes: expandedItems.some(it => it.materials.length > 0),
        currentMonth,
      });
    } catch (err) {
      console.error("GET /api/boq/projects/:id/shortage-check:", err);
      res.status(500).json({ error: "Failed to compute shortage check" });
    }
  });

  // ============================================
  // PLANNING MASTERS (Equipment Types + Labour Types for Work Programme)
  // ============================================

  app.get("/api/planning/equipment-types", async (req, res) => {
    try {
      const includeInactive = req.query.includeInactive === "true";
      res.json(await storage.getPlanningEquipmentTypes(includeInactive));
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch planning equipment types" });
    }
  });

  // Auto-sequence the Work Programme reach-wise with dependencies + multiple fronts.
  app.post("/api/boq/projects/:id/auto-sequence", async (req, res) => {
    try {
      if (!assertEdit(req, res, "qto_boq")) return;
      const projectId = parseInt(req.params.id);
      const { generateSequencedProgramme } = await import("@shared/programmeSequencer");
      const { calculateAutoDurationFull } = await import("@shared/planningEngine");

      const [items, project, , existingBars] = await Promise.all([
        storage.getBoqItemsWithRecipes(projectId),
        storage.getBoqProject(projectId),
        storage.getBoqProgramSettings(projectId),
        storage.getWorkProgramBars(projectId),
      ]);

      const workingHrs  = (project as any)?.workingHoursPerDay  ?? 8;
      const workingDays = (project as any)?.workingDaysPerMonth ?? 26;
      const totalMonths = (project as any)?.totalMonths         ?? 18;
      const projChFrom  = (project as any)?.chainageFrom        ?? 0;
      const projChTo    = (project as any)?.chainageTo          ?? null;
      // Prefer chainage-derived length if both endpoints are set
      const roadLengthKm = projChTo != null
        ? Math.max(0, projChTo - projChFrom)
        : (project as any)?.roadLengthKm ?? 0;
      const requestedFronts = Math.floor(Number(req.body?.fronts) || 0);
      const fronts = requestedFronts >= 1
        ? requestedFronts
        : Math.min(5, Math.max(2, Math.ceil((roadLengthKm || 24) / 12)));
      const _stagger = Number(req.body?.staggerMonths);
      const staggerMonths = !isNaN(_stagger) ? Math.max(0, _stagger) : 1;
      const _lag = Number(req.body?.lagMonths);
      const lagMonths = !isNaN(_lag) ? Math.max(0, _lag) : 0.25;
      const _strGroups = parseInt(req.body?.structureGroups);
      const structureGroups = _strGroups >= 1 ? _strGroups : fronts;
      const _brgGroups = parseInt(req.body?.bridgeGroups);
      const bridgeGroups = _brgGroups >= 1 ? _brgGroups : fronts;
      // Structure-front auto-splitting ("Struct. Front N" / "Bridge Grp N" bars) is disabled
      // by default — it produces incorrect results for projects that use per-location structure
      // bars imported from a schedule.
      // New clients send `disableStructureFronts: true` directly; legacy clients sent
      // `enableStructureFronts: false` (inverted). Prefer the explicit field; fall back to the
      // legacy inversion so older saved programme-settings still restore correctly.
      const disableStructureFronts = req.body?.disableStructureFronts !== undefined
        ? Boolean(req.body.disableStructureFronts)
        : req.body?.enableStructureFronts !== true;

      // Persist sequence options so the UI can pre-populate the dialog next time.
      await storage.upsertBoqProgramSettings(projectId, {
        sequenceOptions: {
          fronts: requestedFronts >= 1 ? fronts : null,
          staggerMonths,
          lagMonths,
          structureGroups: _strGroups >= 1 ? structureGroups : null,
          bridgeGroups: _brgGroups >= 1 ? bridgeGroups : null,
          enableStructureFronts: !disableStructureFronts,
        },
      } as any);

      // Non-destructive rerun: only remove previously auto-generated bars so that
      // any bars the planner manually placed (source = "manual") are preserved.
      // The reach-label fallback catches legacy bars created before the source column existed.
      const AUTO_LABEL_RE = /^(Full Length|Structures|Bridges|Reach \d+|Struct\. Front \d+|Bridge Grp \d+)$/;

      // When structure fronts are disabled, pre-delete auto-sequence bars that belong to
      // structure-type BOQ items NOW — outside the "no bars" safety guard — so that old
      // linear bars don't persist for items that already have imported structure_location bars.
      if (disableStructureFronts) {
        // Items with at least one structure_import bar are implicitly structure-planned
        // even if planningWorkType was never set manually.
        const structureImportIds = new Set(
          (existingBars as any[])
            .filter((b) => b.source === "structure_import")
            .map((b) => b.boqItemId),
        );
        const structureItemIds = new Set([
          ...(items as any[])
            .filter((it) => isStructureOrLocationScheduledItem(it, { hasStructureImportBar: structureImportIds.has(it.id) }))
            .map((it) => it.id),
          ...structureImportIds,
        ]);
        if (structureItemIds.size > 0) {
          const structureAutoBars = (existingBars as any[]).filter(
            (b) => structureItemIds.has(b.boqItemId) &&
                   (b.source === "auto-sequence" || b.source === "auto_generate" || !b.source ||
                    (b.source === "manual" && AUTO_LABEL_RE.test(b.reachLabel ?? ""))),
          );
          for (const b of structureAutoBars) await storage.deleteWorkProgramBar(b.id);
        }
      }

      // Derive structure-import item IDs for the seqItems filter below.
      // We recompute here (outside the if-block) so it's always available.
      const _structureImportIds = new Set(
        (existingBars as any[])
          .filter((b) => b.source === "structure_import")
          .map((b) => b.boqItemId),
      );

      // Build sequencer input — when structure fronts are disabled, exclude structure-type
      // items entirely so the sequencer only schedules road/linear work. Their bars were
      // already pre-deleted above; any imported structure_location bars are untouched.
      const seqItems = (items as any[])
        .filter((it) => {
          if ((it.currentQty ?? 0) <= 0) return false;
          if (
            disableStructureFronts &&
            isStructureOrLocationScheduledItem(it, { hasStructureImportBar: _structureImportIds.has(it.id) })
          ) return false;
          return true;
        })
        .map((it) => {
          const equipment = ((it.equipment ?? []) as any[]).map((e) => ({
            name: e.equipmentName,
            outputUnit: e.outputUnit ?? null,
            outputTheoretical: e.outputTheoretical ?? null,
            outputEfficiency: e.outputEfficiency ?? null,
            standardOutputs: e.standardOutputs ?? null,
            // Item-specific hrs/BOQ-unit rate — last-resort output source so contractor/custom
            // equipment or SDB equipment used for a unit the master doesn't define still
            // contributes to the bottleneck instead of silently dropping out.
            qtyPerBoqUnit: e.qtyPerBoqUnit != null ? Number(e.qtyPerBoqUnit) : null,
            count: e.count ?? 1,
          }));
          const dur = calculateAutoDurationFull(
            it.currentQty ?? 0,
            it.unit ?? "",
            equipment,
            workingHrs,
            workingDays,
            null,
            null,
          );
          return {
            boqItemId: it.id,
            description: it.description ?? "",
            unit: it.unit ?? "",
            totalQty: it.currentQty ?? 0,
            fullDurationMonths: dur.months > 0 ? dur.months : 1,
            // Pass stored planningWorkType so user-overridden classifications are respected
            planningWorkType: (it.planningWorkType === "road" || it.planningWorkType === "structure")
              ? it.planningWorkType as "road" | "structure"
              : undefined,
          };
        });

      const bars = generateSequencedProgramme(seqItems, {
        fronts,
        totalMonths,
        roadLengthKm,
        chainageStartKm: projChFrom,
        staggerMonths,
        lagMonths,
        structureGroups,
        bridgeGroups,
        disableStructureFronts,
      });

      // SAFETY: never wipe the existing programme unless we actually built new bars.
      if (!bars.length) {
        return res.status(422).json({
          error: `No bars generated (items with qty: ${seqItems.length}, fronts: ${fronts}). ` +
                 `Your existing programme was left untouched. Make sure BOQ items have a current quantity > 0.`,
          itemsConsidered: seqItems.length,
          fronts,
        });
      }

      // Build the full new set first; only then replace the old bars.
      let created = 0;
      const insertErrors: string[] = [];
      const autoBars = (existingBars as any[]).filter(
        (b) => b.source === "auto-sequence"
            || !b.source                                            // null = column not yet populated
            || (b.source === "manual" && AUTO_LABEL_RE.test(b.reachLabel ?? "")),
      );
      for (const b of autoBars) await storage.deleteWorkProgramBar(b.id);
      for (const b of bars) {
        try {
          await storage.upsertWorkProgramBar({ ...b, boqProjectId: projectId } as any);
          created++;
        } catch (e: any) {
          insertErrors.push(`item ${b.boqItemId}: ${e?.message ?? String(e)}`);
        }
      }
      res.json({
        success: true,
        fronts,
        totalMonths,
        bars: created,
        itemsConsidered: seqItems.length,
        errorCount: insertErrors.length,
        sampleError: insertErrors[0] ?? null,
      });
    } catch (err: any) {
      console.error("auto-sequence:", err);
      res.status(500).json({ error: `Failed to auto-sequence programme: ${err?.message ?? String(err)}` });
    }
  });

  // ── Structure Schedule Parse (server-side XLSX) ──────────────────────────────
  // Accepts a multipart file upload of an Excel workbook and returns matched rows
  // for the wizard preview step. Matching priority:
  //   P1 → boq_item_code + boq_sub_item (composite key, exact)
  //   P2 → boq_item_code alone (exact or leading-zero stripped)
  //   P3 → boq_description (partial, first 40 chars)
  // Note: boq_excel_row is stored for traceability but cannot be used as a DB
  // matching key because BOQ items do not store their original Excel row number.
  const structureUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

  app.post("/api/boq/projects/:id/parse-structure-schedule", structureUpload.single("file"), async (req, res) => {
    try {
      if (!assertEdit(req, res, "qto_boq")) return;
      if (!req.file) return res.status(400).json({ error: "No file uploaded. Send an Excel file in the 'file' field." });
      const projectId = parseInt(req.params.id);

      const allItems = await storage.getBoqItems(projectId) as any[];
      const itemByCode = new Map(allItems.map((it: any) => [String(it.itemCode ?? "").trim().toLowerCase(), it]));
      const itemByCodeSubItem = new Map<string, any>();
      for (const it of allItems) {
        if ((it as any).boqSubItem) {
          const k = `${String((it as any).itemCode ?? "").trim().toLowerCase()}::${String((it as any).boqSubItem ?? "").trim().toLowerCase()}`;
          itemByCodeSubItem.set(k, it);
        }
      }

      // Server-side XLSX parsing
      const { read, utils } = await import("xlsx");
      const wb = read(req.file.buffer, { type: "buffer", cellDates: true });

      // ── Sheet detection ────────────────────────────────────────────────────────
      // Preferred: matrix-format sheets (one column per structure, BOQ items as rows).
      // Fallback: legacy flat format — one row per structure×item, sheet named
      // "Structure_Schedule_Import".
      // Frozen 4-sheet Structure Schedule Import format (V1 planning boundary):
      // only these exact sheet names are recognised as structure/location schedules.
      const MATRIX_SHEETS = [
        "Culverts", "Drains_Retaining_Walls", "Minor_Bridges", "Major_Bridges",
      ];
      const LEGACY_SHEET = "Structure_Schedule_Import";

      const presentMatrixSheets = MATRIX_SHEETS.filter(s => wb.SheetNames.includes(s));
      const hasLegacySheet = wb.SheetNames.includes(LEGACY_SHEET);

      if (!presentMatrixSheets.length && !hasLegacySheet) {
        return res.status(422).json({
          error: "No recognised structure schedule sheet found in this workbook.",
          availableSheets: wb.SheetNames,
          hint: `Use the frozen Structure Schedule Import format with sheet(s) named: ${MATRIX_SHEETS.join(", ")} — ` +
                `or the legacy flat format with a sheet named "${LEGACY_SHEET}".`,
        });
      }

      // ── Shared BOQ matcher (used by both parsers) ──────────────────────────────
      function matchBoqItem(boqCode: string, boqSubItem: string, boqDesc: string): any {
        let found: any = null;
        if (boqCode && boqSubItem) {
          const k = `${boqCode.trim().toLowerCase()}::${boqSubItem.trim().toLowerCase()}`;
          found = itemByCodeSubItem.get(k) ?? null;
        }
        if (!found && boqCode) {
          found = itemByCode.get(boqCode.trim().toLowerCase()) ?? null;
          if (!found) {
            const stripped = boqCode.replace(/^0+/, "").trim().toLowerCase();
            found = allItems.find((it: any) =>
              String(it.itemCode ?? "").replace(/^0+/, "").trim().toLowerCase() === stripped
            ) ?? null;
          }
        }
        if (!found && boqDesc) {
          const needle = boqDesc.toLowerCase().slice(0, 40);
          found = allItems.find((it: any) =>
            (it.description ?? "").toLowerCase().includes(needle)
          ) ?? null;
        }
        return found;
      }

      // BC / wearing-coat quantities against pipe culverts are unusual — warn.
      const BC_PATTERN = /wearing\s*coat|bc\s+over|bituminous\s+concrete\s+over|bc\s+on\s+slab/i;
      const PIPE_CULVERT_PATTERN = /pipe\s+culvert|np[23]\s+pipe|rcc\s+pipe/i;

      // ── Matrix-format parser ───────────────────────────────────────────────────
      // Sheet layout:
      //   Row 1  (header):      BOQ Code | BOQ Sub Item | BOQ Description | UOM | <structId1> | <structId2> …
      //   Row 2  (meta):        Structure Type | | | | <type1> | <type2> …
      //   Row 3  (meta):        Chainage From  | | | | <from1> | <from2> …
      //   Row 4  (meta):        Chainage To    | | | | <to1>   | <to2>   … (optional for point items)
      //   Rows 5+ (data):       <code> | <sub> | <desc> | <uom> | <qty1> | <qty2> …
      //   Empty qty cells → skip that structure×item combination.
      //
      // Chainage is NEVER silently defaulted to 0: a structure column with no
      // resolvable "Chainage From" value is left with chainageFromKm = null and
      // every row for that column is flagged chainageMissing = true, which the
      // write path turns into needsReview = true instead of a fabricated 0.00 km.
      // Point items (e.g. dissipation chambers) may omit "Chainage To" entirely —
      // chainageToKm then falls back to chainageFromKm for that column.

      function parseMatrixSheet(sheetName: string): { rows: any[]; warnings: string[] } {
        const ws = wb.Sheets[sheetName];
        const raw: any[][] = utils.sheet_to_json(ws, { header: 1, defval: "", raw: false }) as any[][];
        if (!raw.length) return { rows: [], warnings: [`Sheet "${sheetName}" is empty — skipped.`] };

        const localWarnings: string[] = [];

        // Find the header row: first row whose col-0 looks like "BOQ Code"
        let hdrIdx = raw.findIndex(r =>
          /boq.?code|item.?code/i.test(String(r[0] ?? "").trim()),
        );
        if (hdrIdx < 0) hdrIdx = 0; // assume first row

        const hdrRow = raw[hdrIdx];
        // Structure IDs from col 4 onward
        const structIds: string[] = [];
        for (let c = 4; c < hdrRow.length; c++) {
          structIds.push(String(hdrRow[c] ?? "").trim());
        }
        const structCount = structIds.filter(Boolean).length;
        if (!structCount) {
          localWarnings.push(`Sheet "${sheetName}": no structure columns found after column D — skipped.`);
          return { rows: [], warnings: localWarnings };
        }

        // Read metadata rows (Structure Type, Chainage From, Chainage To) immediately
        // after the header. Header text is normalized (lowercased, non-alphanumeric
        // stripped) before matching so variants like "Chainage (Km)" or "Chainage in Km"
        // are still recognized — same approach as normHeader() in the legacy parser
        // below. See shared/structureImportLabels.ts for the matching logic + tests.
        const structTypes: string[] = new Array(structIds.length).fill("");
        const chainageFromKm: (number | null)[] = new Array(structIds.length).fill(null);
        const chainageToKm: (number | null)[]   = new Array(structIds.length).fill(null);
        let dataStart = hdrIdx + 1;
        let foundStructureTypeRow = false;
        let foundChainageFromRow = false;
        let foundChainageToRow = false;

        for (let ri = hdrIdx + 1; ri < Math.min(hdrIdx + 7, raw.length); ri++) {
          const c0Raw = String(raw[ri][0] ?? "");
          if (isStructureTypeLabel(c0Raw)) {
            foundStructureTypeRow = true;
            for (let c = 4; c < raw[ri].length; c++) {
              if (c - 4 < structIds.length) structTypes[c - 4] = String(raw[ri][c] ?? "").trim();
            }
            dataStart = Math.max(dataStart, ri + 1);
          } else if (isChainageToLabel(c0Raw)) {
            // Checked before isChainageFromLabel() since "Chainage To" is more specific
            // and isChainageFromLabel() would otherwise never see it (mutually exclusive
            // prefixes, but keep the more specific check first for clarity/safety).
            foundChainageToRow = true;
            for (let c = 4; c < raw[ri].length; c++) {
              if (c - 4 < structIds.length) {
                const cellStr = String(raw[ri][c] ?? "").trim();
                if (cellStr) {
                  const v = parseFloat(cellStr.replace(/,/g, ""));
                  chainageToKm[c - 4] = isNaN(v) ? null : v;
                }
              }
            }
            dataStart = Math.max(dataStart, ri + 1);
          } else if (isChainageFromLabel(c0Raw)) {
            foundChainageFromRow = true;
            for (let c = 4; c < raw[ri].length; c++) {
              if (c - 4 < structIds.length) {
                const cellStr = String(raw[ri][c] ?? "").trim();
                if (cellStr) {
                  const v = parseFloat(cellStr.replace(/,/g, ""));
                  chainageFromKm[c - 4] = isNaN(v) ? null : v;
                }
              }
            }
            dataStart = Math.max(dataStart, ri + 1);
          }
        }
        if (!foundStructureTypeRow) {
          localWarnings.push(`Sheet "${sheetName}": no "Structure Type" row found in the first 6 rows after the header — structure types were left blank for all columns.`);
        }
        if (!foundChainageFromRow) {
          localWarnings.push(`Sheet "${sheetName}": no "Chainage From" row found in the first 6 rows after the header — chainage was NOT imported (left blank, not defaulted to 0) and every row was marked for review.`);
        }
        // Point items (e.g. dissipation chambers) are allowed to omit "Chainage To" —
        // fall back to chainageFrom for that column instead of warning per-column.
        for (let i = 0; i < structIds.length; i++) {
          if (chainageToKm[i] == null) chainageToKm[i] = chainageFromKm[i];
        }

        const outRows: any[] = [];
        const missingChainageStructIds = new Set<string>();

        for (let ri = dataStart; ri < raw.length; ri++) {
          const row = raw[ri];
          const boqCode = String(row[0] ?? "").trim();
          const boqSubItem = String(row[1] ?? "").trim();
          const boqDesc    = String(row[2] ?? "").trim();
          const uom        = String(row[3] ?? "").trim();

          // Skip blank / metadata rows
          if (!boqCode && !boqDesc) continue;
          // Skip if col-0 looks like a metadata marker
          if (/^(structure[\s_]?type|chainage|remarks|total|sub-total)/i.test(boqCode)) continue;

          const boqItem = matchBoqItem(boqCode, boqSubItem, boqDesc);

          for (let c = 4; c < row.length; c++) {
            const colIdx = c - 4;
            const structId = structIds[colIdx];
            if (!structId) continue;

            const cellStr = String(row[c] ?? "").trim();
            if (!cellStr) continue;
            const qty = parseFloat(cellStr.replace(/,/g, ""));
            if (isNaN(qty) || qty <= 0) continue;

            const structType = structTypes[colIdx] ?? "";
            const chFrom = chainageFromKm[colIdx];
            const chTo = chainageToKm[colIdx];
            const chainageMissing = chFrom == null;
            if (chainageMissing) missingChainageStructIds.add(structId);

            // BC / wearing-coat against pipe culverts — warn but allow
            if (BC_PATTERN.test(boqDesc) && PIPE_CULVERT_PATTERN.test(structType)) {
              localWarnings.push(
                `Sheet "${sheetName}" row ${ri + 1}, ${structId} (${structType}): ` +
                `"${boqDesc}" qty ${qty} — BC/wearing coat is unusual for pipe culverts.`,
              );
            }

            outRows.push({
              rowIdx: ri + 2,
              structureId:  structId,
              structureType: structType,
              chainageFromKm: chFrom,
              chainageToKm: chTo,
              chainageMissing,
              boqItemCode:  boqCode,
              boqSubItem,
              boqExcelRow:  ri + 2,
              boqDescription: boqDesc,
              plannedQty:   qty,
              uom,
              startDate:    "",
              durationDays: 0,
              remarks:      "",
              boqItemId:    boqItem?.id ?? null,
              matchStatus:  boqItem ? "matched" : "unmatched",
              matchedItemCode: boqItem?.itemCode ?? null,
              matchedDescription: boqItem?.description?.slice(0, 80) ?? null,
              sheetName,
            });
          }
        }

        if (missingChainageStructIds.size) {
          localWarnings.push(
            `Sheet "${sheetName}": no chainage found for structure(s) ${Array.from(missingChainageStructIds).join(", ")} — ` +
            `imported with blank chainage (not defaulted to 0) and marked "needs review".`,
          );
        }

        return { rows: outRows, warnings: localWarnings };
      }

      // ── Legacy flat-format parser ──────────────────────────────────────────────
      // Columns: structure_id | structure_type | chainage_km | boq_item_code |
      //          boq_sub_item | planned_qty | uom | start_date | duration_days | remarks
      function parseLegacySheet(): { rows: any[]; warnings: string[] } {
        const ws = wb.Sheets[LEGACY_SHEET];
        const json = utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
        if (!json.length) return { rows: [], warnings: [`Sheet "${LEGACY_SHEET}" is empty.`] };

        // Normalize a header name for comparison: lowercase and strip everything
        // but letters/digits. This makes "start_date", "start date", "Start Date"
        // and camelCase "startDate" all match the same alias.
        function normHeader(s: string): string {
          return s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
        }
        function colStr(row: Record<string, unknown>, ...aliases: string[]): string {
          for (const alias of aliases) {
            const target = normHeader(alias);
            const key = Object.keys(row).find(k => normHeader(k) === target);
            if (key) return String(row[key] ?? "");
          }
          return "";
        }
        function colNum(row: Record<string, unknown>, ...aliases: string[]): number {
          const v = parseFloat(colStr(row, ...aliases).replace(/,/g, ""));
          return isNaN(v) ? 0 : v;
        }
        // Converts an Excel serial date number (days since 1899-12-30, with the
        // well-known 1900 leap-year bug) to an ISO "YYYY-MM-DD" string.
        function excelSerialToIso(serial: number): string {
          const ms = Math.round((serial - 25569) * 86400 * 1000);
          return new Date(ms).toISOString().slice(0, 10);
        }
        function colDate(row: Record<string, unknown>, ...aliases: string[]): string {
          const v = colStr(row, ...aliases).trim();
          if (!v) return "";
          if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
          // Plain numeric value → Excel serial date (only plausible date range).
          if (/^\d+(\.\d+)?$/.test(v)) {
            const serial = Number(v);
            if (serial > 20000 && serial < 80000) return excelSerialToIso(serial);
          }
          const parts = v.split(/[\/-]/);
          if (parts.length === 3) {
            const [a, b, c] = parts.map(Number);
            if (c > 31) return `${c}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
            if (a > 31) return `${a}-${String(b).padStart(2, "0")}-${String(c).padStart(2, "0")}`;
          }
          return "";
        }

        const outRows = json
          .map((row, i) => {
            const structureId    = colStr(row, "structure_id", "structure_name", "structure id");
            const boqItemCode    = colStr(row, "boq_item_code", "item_code", "item code", "boq item code");
            const boqSubItem     = colStr(row, "boq_sub_item", "sub_item", "sub item");
            const boqDescription = colStr(row, "boq_description", "description", "item description");
            const boqExcelRowRaw = Math.round(colNum(row, "boq_excel_row", "excel_row"));
            const boqExcelRow    = boqExcelRowRaw || (i + 2);
            const boqItem        = matchBoqItem(boqItemCode, boqSubItem, boqDescription);
            return {
              rowIdx: i + 2,
              structureId,
              structureType:      colStr(row, "structure_type", "type"),
              chainageKm:         colNum(row, "chainage_km", "chainage", "ch_km"),
              boqItemCode,
              boqSubItem,
              boqExcelRow,
              boqDescription,
              plannedQty:         colNum(row, "planned_qty", "quantity", "qty"),
              uom:                colStr(row, "uom", "unit"),
              startDate:          colDate(row, "start_date", "start date"),
              durationDays:       Math.round(colNum(row, "duration_days", "duration", "duration (days)")),
              remarks:            colStr(row, "remarks", "notes"),
              boqItemId:          boqItem?.id ?? null,
              matchStatus:        boqItem ? "matched" : "unmatched",
              matchedItemCode:    boqItem?.itemCode ?? null,
              matchedDescription: boqItem?.description?.slice(0, 80) ?? null,
              sheetName:          LEGACY_SHEET,
            };
          })
          .filter(r => r.structureId || r.boqDescription || r.plannedQty > 0);

        return { rows: outRows, warnings: [] };
      }

      // ── Run the appropriate parser(s) ──────────────────────────────────────────
      let allRows: any[] = [];
      const allParseWarnings: string[] = [];
      const parsedSheetNames: string[] = [];

      if (presentMatrixSheets.length) {
        for (const sn of presentMatrixSheets) {
          const { rows: sheetRows, warnings: sheetWarnings } = parseMatrixSheet(sn);
          allRows = allRows.concat(sheetRows);
          allParseWarnings.push(...sheetWarnings);
          if (sheetRows.length) parsedSheetNames.push(sn);
        }
      } else {
        const { rows: legRows, warnings: legWarnings } = parseLegacySheet();
        allRows = legRows;
        allParseWarnings.push(...legWarnings);
        parsedSheetNames.push(LEGACY_SHEET);
      }

      if (!allRows.length) {
        return res.status(422).json({
          error: "No data rows could be read from the uploaded file.",
          warnings: allParseWarnings,
          hint: "Check that BOQ item rows have numeric quantity values in the structure columns.",
        });
      }

      res.json({
        sheetNames: parsedSheetNames,
        rows: allRows,
        totalRows: allRows.length,
        warnings: allParseWarnings,
      });
    } catch (err: any) {
      console.error("POST /api/boq/projects/:id/parse-structure-schedule:", err);
      res.status(500).json({ error: `Failed to parse structure schedule: ${err?.message ?? String(err)}` });
    }
  });

  // ── Structure Schedule Auto-sequencing ───────────────────────────────────────
  // Sequences imported structure_location bars (grouped by structureId, ordered
  // by construction stage, staggered across per-structure-type "fronts") for
  // bars that have no usable date yet (scheduled = false) or were flagged
  // needsReview. Imported plannedQty is never touched. Shared by the
  // "Auto-sequence imported structure bars" button and the import-time
  // "auto_sequence" decision.
  async function runStructureAutoSequence(
    projectId: number,
    opts: { barIds?: number[]; scope?: "unscheduled" | "all" } = {},
  ): Promise<{ updated: number; structures: number; fronts: number; needsReviewCount: number }> {
    const project = await storage.getBoqProject(projectId) as any;
    const pSettings = await storage.getBoqProgramSettings(projectId) as any;
    const projectStartDate: string | null = pSettings?.projectStartDate ?? null;
    if (!projectStartDate) {
      throw new Error("Project start date must be set before auto-sequencing structures.");
    }
    const totalMonths: number = project?.totalMonths ?? 18;
    const workingDaysPerMonth: number = pSettings?.workingDaysPerMonth ?? 25;
    const workingHoursPerDay: number = pSettings?.workingHoursPerDay ?? 8;
    const productivitySettings = pSettings
      ? { mode: (pSettings.productivityMode ?? "snl") as "snl" | "company" | "project", overrides: pSettings.productivityOverrides ?? null }
      : null;

    const allBars = await storage.getWorkProgramBars(projectId) as any[];
    let targetBars = allBars.filter((b: any) => b.planningMode === "structure_location");
    if (opts.barIds?.length) {
      const idSet = new Set(opts.barIds);
      targetBars = targetBars.filter((b: any) => idSet.has(b.id));
    } else if (opts.scope !== "all") {
      targetBars = targetBars.filter((b: any) => b.scheduled === false || b.needsReview === true);
    }
    if (!targetBars.length) return { updated: 0, structures: 0, fronts: 0, needsReviewCount: 0 };

    const allItems = await storage.getBoqItems(projectId) as any[];
    const itemById = new Map(allItems.map((it: any) => [it.id, it]));

    const equipmentByBoqItemId = new Map<number, EquipmentInput[]>();
    for (const b of targetBars) {
      if (equipmentByBoqItemId.has(b.boqItemId)) continue;
      const eq = await storage.getBoqItemEquipment(b.boqItemId);
      equipmentByBoqItemId.set(b.boqItemId, (eq ?? []).map((e: any) => ({
        name: e.equipmentName,
        outputUnit: e.outputUnit ?? null,
        outputTheoretical: e.outputTheoretical ?? null,
        outputEfficiency: e.outputEfficiency ?? null,
        standardOutputs: e.standardOutputs ?? null,
        qtyPerBoqUnit: e.qtyPerBoqUnit != null ? Number(e.qtyPerBoqUnit) : null,
        count: e.count ?? 1,
      })));
    }

    const sequenceableBars: SequenceableBar[] = targetBars.map((b: any) => {
      const item = itemById.get(b.boqItemId);
      const hasValidImportedDate = b.startDate && /^\d{4}-\d{2}-\d{2}/.test(b.startDate) && b.scheduled !== false;
      return {
        id: b.id,
        boqItemId: b.boqItemId,
        structureId: b.structureId ?? null,
        structureLocType: b.structureLocType ?? null,
        structureChainageKm: b.structureChainageKm ?? null,
        chainageFrom: b.chainageFrom ?? null,
        plannedQty: b.plannedQty ?? 0,
        unit: item?.unit ?? null,
        description: item?.description ?? null,
        durationDays: b.durationDays ?? null,
        startDate: hasValidImportedDate ? b.startDate : null,
        boqExcelRow: b.boqExcelRow ?? null,
      };
    });

    const { results, structures, fronts, needsReviewCount } = autoSequenceStructureBars({
      bars: sequenceableBars,
      projectStartDate,
      workingDaysPerMonth,
      totalMonths,
      equipmentByBoqItemId,
      workingHoursPerDay,
      productivitySettings,
    });

    let updated = 0;
    for (const r of results) {
      await storage.updateWorkProgramBar(r.barId, {
        startMonth: r.startMonth,
        endMonth: r.endMonth,
        startDate: r.startDate,
        endDate: r.endDate,
        durationDays: r.durationDays,
        stage: r.stage,
        sequenceOrder: r.sequenceOrder,
        durationSource: r.durationSource,
        needsReview: r.needsReview,
        scheduled: true,
      } as any);
      updated++;
    }

    return { updated, structures, fronts, needsReviewCount };
  }

  // Standalone endpoint: "Auto-sequence imported structure bars" button.
  app.post("/api/boq/projects/:id/auto-sequence-structures", async (req, res) => {
    try {
      if (!assertEdit(req, res, "qto_boq")) return;
      const projectId = parseInt(req.params.id);
      const scope: "unscheduled" | "all" = req.body?.scope === "all" ? "all" : "unscheduled";
      const summary = await runStructureAutoSequence(projectId, { scope });
      res.json(summary);
    } catch (err: any) {
      console.error("auto-sequence-structures:", err);
      res.status(500).json({ error: `Failed to auto-sequence structures: ${err?.message ?? String(err)}` });
    }
  });

  // ── Structure Schedule Import ────────────────────────────────────────────────
  // Accepts pre-matched rows from the parse-structure-schedule endpoint (or any
  // JSON row array). Creates one work_program_bar per matched row with
  // planningMode = "structure_location". Skipped rows are reported back.
  app.post("/api/boq/projects/:id/import-structure", async (req, res) => {
    try {
      if (!assertEdit(req, res, "qto_boq")) return;
      const projectId = parseInt(req.params.id);
      const { rows, mode = "append", onMissingDates } = req.body as {
        rows: Array<{
          structureId: string;
          structureType: string;
          chainageKm?: number;
          chainageFromKm?: number | null;
          chainageToKm?: number | null;
          chainageMissing?: boolean;
          boqItemCode?: string;
          boqSubItem?: string;
          boqExcelRow?: number;
          boqDescription?: string;
          plannedQty: number;
          uom?: string;
          startDate?: string;    // ISO date "YYYY-MM-DD"
          durationDays?: number;
          remarks?: string;
          // matched BOQ item (resolved by frontend preview)
          boqItemId?: number;
        }>;
        mode?: "append" | "replace";
        // How to handle rows with no usable start date. When omitted and such
        // rows exist, the route returns a 409 asking the client to decide.
        onMissingDates?: "unscheduled" | "auto_sequence" | "cancel";
      };

      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: "rows array is required and must not be empty" });
      }

      // Pre-scan for rows with no valid, parseable start date. Quantities are
      // always imported as-is (source of truth) — this only decides how such
      // rows get placed on the Gantt.
      const isValidIsoDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}/.test(s);
      const rowsMissingDates = rows.filter(r => r.plannedQty > 0 && !isValidIsoDate(r.startDate)).length;
      if (rowsMissingDates > 0 && !onMissingDates) {
        return res.status(409).json({
          requiresDecision: true,
          missingDateRows: rowsMissingDates,
          totalRows: rows.length,
          message: `${rowsMissingDates} of ${rows.length} row(s) have no valid start date. Choose how to place them.`,
        });
      }
      if (onMissingDates === "cancel") {
        return res.status(200).json({ cancelled: true, created: 0, skipped: 0 });
      }

      // Load all BOQ items for fallback matching
      const allItems = await storage.getBoqItems(projectId) as any[];
      const itemById = new Map(allItems.map((it: any) => [it.id, it]));
      const itemByCode = new Map(allItems.map((it: any) => [String(it.itemCode ?? "").trim().toLowerCase(), it]));

      // Replace mode: wipe existing structure-location bars for this project
      if (mode === "replace") {
        await storage.deleteStructureLocationBars(projectId);
      }

      const results: { row: number; status: "created" | "skipped"; structureId?: string; reason?: string }[] = [];
      let created = 0;
      let skipped = 0;
      let unmatchedBoqRows = 0;
      let uomMismatchRows = 0;
      let missingDateRows = 0;
      const warnings: string[] = [];
      // Track imported qty per BOQ item for over-planned detection
      const importedQtyByItemId = new Map<number, number>();
      const createdBarIds: number[] = [];

      const project = await storage.getBoqProject(projectId) as any;
      const pSettings = await storage.getBoqProgramSettings(projectId) as any;
      const projectStartDate: string | null = pSettings?.projectStartDate ?? null;
      const totalMonths: number = project?.totalMonths ?? 18;
      const workingDays: number = pSettings?.workingDaysPerMonth ?? 25;
      // Project chainage bounds for range validation (null = skip)
      const projChFrom: number | null = project?.chainageFrom ?? null;
      const projChTo: number | null = project?.chainageTo ?? null;

      // Build a secondary lookup: (itemCode:subItem) composite key for when subItem is provided
      const itemByCodeSubItem = new Map<string, any>();
      for (const it of allItems) {
        if ((it as any).boqSubItem) {
          const compositeKey = `${String((it as any).itemCode ?? "").trim().toLowerCase()}::${String((it as any).boqSubItem ?? "").trim().toLowerCase()}`;
          itemByCodeSubItem.set(compositeKey, it);
        }
      }

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];

        // Validation: skip rows with no meaningful quantity
        if (!r.plannedQty || r.plannedQty <= 0) {
          results.push({ row: i + 1, status: "skipped", structureId: r.structureId, reason: "plannedQty must be > 0" });
          skipped++;
          continue;
        }

        // Unified chainage: new matrix rows carry chainageFromKm/chainageToKm/chainageMissing;
        // legacy flat-sheet rows only carry a single chainageKm — treat that as both
        // from and to (point value) for backward compatibility. Missing chainage is
        // NEVER defaulted to 0 — it stays null and the row is marked needsReview below.
        const rowChainageFrom: number | null = r.chainageFromKm ?? r.chainageKm ?? null;
        const rowChainageTo: number | null = r.chainageToKm ?? r.chainageKm ?? rowChainageFrom;
        const rowChainageMissing: boolean = r.chainageMissing === true || rowChainageFrom == null;

        // Chainage range validation (soft warning, not a skip)
        if (projChFrom != null && projChTo != null && rowChainageFrom != null) {
          if (rowChainageFrom < projChFrom - 0.1 || rowChainageFrom > projChTo + 0.1) {
            warnings.push(`Row ${i + 1} (${r.structureId}): chainage ${rowChainageFrom} km is outside project range ${projChFrom}–${projChTo} km`);
          }
        }
        if (rowChainageMissing) {
          warnings.push(`Row ${i + 1} (${r.structureId ?? "?"}): no chainage found — imported with blank chainage (not defaulted to 0) and marked "needs review".`);
        }

        // Resolve BOQ item — 4-level priority matching the parse endpoint:
        // P0 → boqItemId (pre-matched by parse endpoint, fastest path)
        // P1 → boq_excel_row + boq_item_code + boq_sub_item
        //       (uses boqItems.excelRow stored from BOQ Excel import; exact P1 when available)
        // P2 → boq_item_code + boq_sub_item composite exact
        // P3 → boq_item_code exact / leading-zero stripped
        // P4 → boq_description partial (first 40 chars, last resort)
        let boqItem: any = null;
        if (r.boqItemId && itemById.has(r.boqItemId)) {
          boqItem = itemById.get(r.boqItemId);
        } else if (r.boqExcelRow && r.boqItemCode) {
          boqItem = allItems.find((it: any) =>
            it.excelRow === r.boqExcelRow &&
            String(it.itemCode ?? "").trim().toLowerCase() === String(r.boqItemCode).trim().toLowerCase() &&
            (!r.boqSubItem || String(it.boqSubItem ?? "").trim().toLowerCase() === String(r.boqSubItem).trim().toLowerCase())
          ) ?? null;
        }
        if (!boqItem && r.boqItemCode && r.boqSubItem) {
          const compositeKey = `${String(r.boqItemCode).trim().toLowerCase()}::${String(r.boqSubItem).trim().toLowerCase()}`;
          boqItem = itemByCodeSubItem.get(compositeKey) ?? null;
        }
        if (!boqItem && r.boqItemCode) {
          boqItem = itemByCode.get(String(r.boqItemCode).trim().toLowerCase()) ?? null;
          if (!boqItem) {
            // fuzzy: strip leading zeros / spaces
            const stripped = String(r.boqItemCode).replace(/^0+/, "").trim().toLowerCase();
            boqItem = allItems.find((it: any) =>
              String(it.itemCode ?? "").replace(/^0+/, "").trim().toLowerCase() === stripped
            ) ?? null;
          }
        }
        if (!boqItem && r.boqDescription) {
          // last-resort: closest description match (first 40 chars)
          const needle = r.boqDescription.toLowerCase();
          boqItem = allItems.find((it: any) =>
            (it.description ?? "").toLowerCase().includes(needle.slice(0, 40))
          ) ?? null;
        }

        if (!boqItem) {
          results.push({ row: i + 1, status: "skipped", structureId: r.structureId, reason: `No BOQ item matched (code: ${r.boqItemCode ?? "—"})` });
          skipped++;
          unmatchedBoqRows++;
          continue;
        }

        // UOM compatibility warning (soft — don't skip, but flag)
        if (r.uom && boqItem.unit && r.uom.toLowerCase() !== boqItem.unit.toLowerCase()) {
          warnings.push(`Row ${i + 1} (${r.structureId}): UOM mismatch — sheet "${r.uom}" vs BOQ item "${boqItem.unit}"`);
          uomMismatchRows++;
        }
        // Accumulate imported qty per BOQ item for over-planned detection
        importedQtyByItemId.set(boqItem.id, (importedQtyByItemId.get(boqItem.id) ?? 0) + (r.plannedQty ?? 0));

        // Compute startMonth / endMonth from startDate + durationDays.
        // Missing or unparseable start_date is never silently defaulted to Month 1 —
        // the row is imported with its planned quantity intact but marked unscheduled
        // (placeholder position) so it can be placed by "Auto-sequence" instead.
        let startMonth = 1;
        let endMonth   = 1.1;
        const hasValidDate = r.startDate && /^\d{4}-\d{2}-\d{2}/.test(r.startDate);
        let scheduled = true;
        if (!hasValidDate) {
          missingDateRows++;
          scheduled = false;
          warnings.push(`Row ${i + 1} (${r.structureId ?? "?"}): no valid start_date — imported as unscheduled. Use "Auto-sequence imported structure bars" to place it.`);
        }
        if (hasValidDate && projectStartDate) {
          try {
            const pStart = new Date(projectStartDate);
            const sDate  = new Date(r.startDate!);
            const diffMs = sDate.getTime() - pStart.getTime();
            const diffDays = diffMs / 86400000;
            startMonth = Math.max(1, 1 + diffDays / workingDays);
            const durMonths = r.durationDays ? r.durationDays / workingDays : 1;
            endMonth = startMonth + durMonths;
            if (endMonth > totalMonths) endMonth = totalMonths;
            if (endMonth <= startMonth) endMonth = startMonth + 0.1;
            startMonth = +startMonth.toFixed(3);
            endMonth   = +endMonth.toFixed(3);
          } catch (dateErr) {
            scheduled = false;
            warnings.push(`Row ${i + 1} (${r.structureId ?? "?"}): could not parse start_date "${r.startDate}" — imported as unscheduled.`);
          }
        }

        const endDate = r.startDate && r.durationDays
          ? (() => {
              const d = new Date(r.startDate);
              d.setDate(d.getDate() + r.durationDays);
              return d.toISOString().slice(0, 10);
            })()
          : null;

        try {
          const savedBar = await storage.upsertWorkProgramBar({
            boqProjectId: projectId,
            boqItemId: boqItem.id,
            reachLabel: r.structureId,
            chainageFrom: rowChainageFrom,
            chainageTo: rowChainageTo,
            startMonth,
            endMonth,
            startDate: r.startDate ?? null,
            endDate,
            plannedQty: r.plannedQty ?? 0,
            source: "structure_import",
            planningMode: "structure_location",
            scheduled,
            durationSource: scheduled ? "imported" : null,
            needsReview: !scheduled || rowChainageMissing,
            structureId: r.structureId,
            structureLocType: r.structureType,
            structureChainageKm: rowChainageFrom,
            relativeChainageKm: (rowChainageFrom != null && project?.chainageFrom != null)
              ? Math.round((rowChainageFrom - project.chainageFrom) * 1000) / 1000
              : null,
            durationDays: r.durationDays ?? null,
            boqSubItem: r.boqSubItem ?? null,
            boqExcelRow: r.boqExcelRow ?? null,
            notes: r.remarks ?? null,
          } as any);
          created++;
          if (savedBar?.id != null) createdBarIds.push(savedBar.id);
          results.push({ row: i + 1, status: "created", structureId: r.structureId });
        } catch (e: any) {
          results.push({ row: i + 1, status: "skipped", structureId: r.structureId, reason: e?.message ?? String(e) });
          skipped++;
        }
      }

      // If the client asked to auto-sequence unscheduled rows right away, do it
      // now for just the bars created in this import.
      let autoSequenceSummary: { updated: number; structures: number; fronts: number; needsReviewCount: number } | null = null;
      if (onMissingDates === "auto_sequence" && createdBarIds.length) {
        try {
          autoSequenceSummary = await runStructureAutoSequence(projectId, { barIds: createdBarIds });
        } catch (e: any) {
          warnings.push(`Auto-sequence after import failed: ${e?.message ?? String(e)}`);
        }
      }

      // Detect over-planned BOQ items: sum of imported plannedQty > item.currentQty
      const overPlannedItems: Array<{ boqItemId: number; itemCode: string; description: string; currentQty: number; importedQty: number }> = [];
      for (const [itemId, importedQty] of importedQtyByItemId) {
        const it = itemById.get(itemId);
        if (it && it.currentQty != null && importedQty > it.currentQty * 1.05) {
          // Allow 5% tolerance before flagging
          overPlannedItems.push({
            boqItemId: itemId,
            itemCode: it.itemCode ?? "",
            description: (it.description ?? "").slice(0, 80),
            currentQty: it.currentQty,
            importedQty,
          });
        }
      }
      if (overPlannedItems.length) {
        warnings.push(`${overPlannedItems.length} BOQ item(s) have total imported quantity exceeding their BOQ quantity — check if all sub-items are correctly assigned.`);
      }

      res.status(201).json({
        created,
        skipped,
        total: rows.length,
        rowsRead: rows.length,
        rowsImported: created,
        rowsSkipped: skipped,
        unmatchedBoqRows,
        uomMismatchRows,
        missingDateRows,
        overPlannedItems,
        autoSequenceSummary,
        warnings: warnings.slice(0, 50), // cap at 50 to keep response small
        results,
      });
    } catch (err: any) {
      console.error("POST /api/boq/projects/:id/import-structure:", err);
      res.status(500).json({ error: `Failed to import structure schedule: ${err?.message ?? String(err)}` });
    }
  });

  // Restore a full programme snapshot (used by client-side Undo / Redo).
  app.post("/api/boq/projects/:id/programme/restore", async (req, res) => {
    try {
      if (!assertEdit(req, res, "qto_boq")) return;
      const projectId = parseInt(req.params.id);
      const { bars } = req.body;
      if (!Array.isArray(bars)) return res.status(400).json({ error: "bars must be an array" });
      await storage.restoreWorkProgramBars(projectId, bars);
      res.json({ success: true, restored: bars.length });
    } catch (err: any) {
      console.error("programme restore:", err);
      res.status(500).json({ error: `Failed to restore programme: ${err?.message ?? String(err)}` });
    }
  });

  // Auto-build equipment + labour recipes for every BOQ item — deterministic, no fuzzy matching.
  app.post("/api/boq/projects/:id/auto-build-recipes", async (req, res) => {
    try {
      if (!assertEdit(req, res, "qto_boq")) return;
      const projectId = parseInt(req.params.id);
      const { classifyWorkType, buildEquipmentRows, buildLabourRows, WORK_TYPE_PLAN_CATEGORY } = await import("@shared/workTypeRecipes");

      // Ensure the planning master is seeded with standard norms (idempotent).
      await storage.seedPlanningMorthDefaults();

      const [items, equipTypes, labourTypes] = await Promise.all([
        storage.getBoqItems(projectId),
        storage.getPlanningEquipmentTypes(false),
        storage.getPlanningLabourTypes(false),
      ]);

      const equipIndex = new Map<string, { id: number; outputs: Array<{ unit: string; outputPerHr: number }> }>();
      for (const t of equipTypes) equipIndex.set(t.name.toLowerCase(), { id: t.id, outputs: (t.standardOutputs ?? []) as Array<{ unit: string; outputPerHr: number }> });
      const labourIndex = new Map<string, { id: number; outputs: Array<{ unit: string; outputPerDay: number }> }>();
      for (const t of labourTypes) labourIndex.set(t.designation.toLowerCase(), { id: t.id, outputs: (t.standardOutputs ?? []) as Array<{ unit: string; outputPerDay: number }> });

      let recipied = 0;
      const unrecipied: Array<{ id: number; itemCode: string | null; description: string }> = [];
      for (const item of items) {
        // Skip items that are excluded from planning
        if ((item as any).includedInPlanning === false) continue;
        const wt = classifyWorkType(item.description ?? "", item.unit ?? "");
        if (!wt) {
          unrecipied.push({ id: item.id, itemCode: (item as any).itemCode ?? null, description: item.description ?? "" });
          continue;
        }
        const eqRows = buildEquipmentRows(wt, item.unit ?? "", equipIndex).map((r) => ({
          equipmentName: r.equipmentName,
          planningEquipmentTypeId: r.planningEquipmentTypeId,
          qtyPerBoqUnit: r.qtyPerBoqUnit,
          count: r.count,
          sortOrder: r.sortOrder,
        }));
        const labRows = buildLabourRows(wt, item.unit ?? "", labourIndex).map((r) => ({
          designation: r.designation,
          planningLabourTypeId: r.planningLabourTypeId,
          qtyPerBoqUnit: r.qtyPerBoqUnit,
          count: r.count,
          sortOrder: r.sortOrder,
        }));
        await storage.upsertBoqItemEquipment(item.id, eqRows);
        await storage.upsertBoqItemLabour(item.id, labRows);
        // Auto-set planningWorkType ("road" | "structure") based on classifier result
        const planCat = WORK_TYPE_PLAN_CATEGORY[wt];
        if (planCat) await storage.updateBoqItemWorkType(item.id, planCat);
        recipied++;
      }

      res.json({ success: true, totalItems: items.length, recipied, unrecipiedCount: unrecipied.length, unrecipied });
    } catch (err: any) {
      console.error("auto-build-recipes:", err);
      res.status(500).json({ error: `Failed to auto-build recipes: ${err?.message ?? String(err)}` });
    }
  });

  app.post("/api/planning/equipment-types", async (req, res) => {
    try {
      if (!assertEdit(req, res, "qto_boq")) return;
      const row = await storage.createPlanningEquipmentType(req.body);
      res.status(201).json(row);
    } catch (err) {
      res.status(500).json({ error: "Failed to create planning equipment type" });
    }
  });

  app.patch("/api/planning/equipment-types/:id", async (req, res) => {
    try {
      if (!assertEdit(req, res, "qto_boq")) return;
      const row = await storage.updatePlanningEquipmentType(parseInt(req.params.id), req.body);
      if (!row) return res.status(404).json({ error: "Not found" });
      res.json(row);
    } catch (err) {
      res.status(500).json({ error: "Failed to update planning equipment type" });
    }
  });

  app.delete("/api/planning/equipment-types/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const ok = await storage.deletePlanningEquipmentType(parseInt(req.params.id));
      if (!ok) return res.status(404).json({ error: "Not found" });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete planning equipment type" });
    }
  });

  app.get("/api/planning/labour-types", async (req, res) => {
    try {
      const includeInactive = req.query.includeInactive === "true";
      res.json(await storage.getPlanningLabourTypes(includeInactive));
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch planning labour types" });
    }
  });

  app.post("/api/planning/labour-types", async (req, res) => {
    try {
      if (!assertEdit(req, res, "qto_boq")) return;
      const row = await storage.createPlanningLabourType(req.body);
      res.status(201).json(row);
    } catch (err) {
      res.status(500).json({ error: "Failed to create planning labour type" });
    }
  });

  app.patch("/api/planning/labour-types/:id", async (req, res) => {
    try {
      if (!assertEdit(req, res, "qto_boq")) return;
      const row = await storage.updatePlanningLabourType(parseInt(req.params.id), req.body);
      if (!row) return res.status(404).json({ error: "Not found" });
      res.json(row);
    } catch (err) {
      res.status(500).json({ error: "Failed to update planning labour type" });
    }
  });

  app.delete("/api/planning/labour-types/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const ok = await storage.deletePlanningLabourType(parseInt(req.params.id));
      if (!ok) return res.status(404).json({ error: "Not found" });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete planning labour type" });
    }
  });

  // --- Seed MoRTH defaults ---
  app.post("/api/planning/seed-morth", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const result = await storage.seedPlanningMorthDefaults();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Seed failed" });
    }
  });

  // --- Planning Mix Templates (read-only view of plant mix templates for Layer Config) ---

  app.get("/api/planning/mix-templates", async (req, res) => {
    try {
      const templates = await storage.getMixTemplates();
      res.json(templates.map(t => ({ id: t.id, name: t.name, mixType: t.mixType, bitumenPercent: t.bitumenPercent })));
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch mix templates" });
    }
  });

  app.get("/api/planning/mix-templates/:id/components", async (req, res) => {
    try {
      const result = await storage.getMixTemplateWithComponents(parseInt(req.params.id));
      if (!result) return res.status(404).json({ error: "Template not found" });
      // Join components with plant materials to get names
      const allMaterials = await storage.getPlantMaterials();
      const matMap = new Map(allMaterials.map(m => [m.id, m.name]));
      const components = result.components.map(c => ({
        id: c.id,
        materialId: c.materialId,
        materialName: matMap.get(c.materialId) ?? `Material #${c.materialId}`,
        percent: c.percent,
        uom: c.uom,
      }));
      res.json({ template: { id: result.template.id, name: result.template.name, mixType: result.template.mixType, bitumenPercent: result.template.bitumenPercent }, components });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch mix template components" });
    }
  });

  // ─── STANDARD NORMS LIBRARY (SNL) ──────────────────────────────────────

  app.get("/api/snl/sources", async (req, res) => {
    try {
      res.json(await storage.getSnlSources());
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch SNL sources" });
    }
  });

  app.get("/api/snl/sources/:id", async (req, res) => {
    try {
      const src = await storage.getSnlSource(parseInt(req.params.id));
      if (!src) return res.status(404).json({ error: "Not found" });
      res.json(src);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch source" });
    }
  });

  app.get("/api/snl/sources/:id/items", async (req, res) => {
    try {
      const category = req.query.category as string | undefined;
      const sector = req.query.sector as string | undefined;
      res.json(await storage.getSnlItems(parseInt(req.params.id), category, sector));
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch SNL items" });
    }
  });

  // Real-SDB output-rate suggestion for the recipe editor's "missing output" prompt.
  // Only returns a value when the BOQ item is mapped to an SNL norm whose own unit
  // matches the item's unit — never fabricates a cross-unit conversion.
  app.get("/api/boq/items/:id/equipment-output-suggestion", async (req, res) => {
    try {
      const boqItemId = parseInt(req.params.id);
      const equipmentName = (req.query.equipmentName as string) || "";
      if (!equipmentName.trim()) return res.status(400).json({ error: "equipmentName required" });
      const suggestions = await storage.getSdbEquipmentOutputSuggestions(boqItemId, equipmentName);
      res.json(suggestions);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch output suggestion" });
    }
  });

  app.get("/api/snl/items/:id", async (req, res) => {
    try {
      const item = await storage.getSnlItem(parseInt(req.params.id));
      if (!item) return res.status(404).json({ error: "Not found" });
      res.json(item);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch SNL item" });
    }
  });

  app.get("/api/snl/search", async (req, res) => {
    try {
      const q = (req.query.q as string) || "";
      const category = req.query.category as string | undefined;
      const sourceId = req.query.sourceId ? parseInt(req.query.sourceId as string) : undefined;
      const sector = req.query.sector as string | undefined;
      const boqDesc = req.query.boqDesc as string | undefined;
      const items = await storage.searchSnlItems(q, category, sourceId, sector);
      if (boqDesc) {
        const boqCategory = classifyBoqItem(boqDesc);
        const enriched = items.map(item => {
          const mul = getSectorMultiplier(boqCategory, (item as any).sector ?? null);
          const categoryMatchStatus: "match" | "secondary" | "mismatch" | "unknown" =
            !(item as any).sector ? "unknown" :
            mul === 1.0 ? "match" :
            mul > 0 ? "secondary" :
            "mismatch";
          return { ...item, categoryMatchStatus };
        });
        return res.json(enriched);
      }
      res.json(items);
    } catch (err) {
      res.status(500).json({ error: "Failed to search SNL" });
    }
  });

  app.get("/api/snl/mappings/:boqItemId", async (req, res) => {
    try {
      const mapping = await storage.getSnlMapping(parseInt(req.params.boqItemId));
      res.json(mapping ?? null);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch mapping" });
    }
  });

  app.post("/api/snl/mappings", async (req, res) => {
    try {
      const { boqItemId, snlItemId, projectCategory, gradingVariant, notes } = req.body;
      if (!boqItemId || !snlItemId) return res.status(400).json({ error: "boqItemId and snlItemId required" });
      const mapping = await storage.setSnlMapping(boqItemId, {
        boqItemId, snlItemId,
        projectCategory: projectCategory ?? "MEDIUM",
        gradingVariant: gradingVariant ?? null,
        mappedBy: (req as any).user?.username ?? "unknown",
        isAutoMapped: false,
        confidenceScore: null,
        notes: notes ?? null,
      });
      res.json(mapping);
    } catch (err) {
      res.status(500).json({ error: "Failed to save mapping" });
    }
  });

  app.post("/api/snl/mappings/:boqItemId/apply", async (req, res) => {
    try {
      const boqItemId = parseInt(req.params.boqItemId);
      const { snlItemId, projectCategory, gradingVariant } = req.body;
      if (!snlItemId) return res.status(400).json({ error: "snlItemId required" });
      const user = (req as any).user?.username ?? "unknown";
      await storage.setSnlMapping(boqItemId, {
        boqItemId, snlItemId,
        projectCategory: projectCategory ?? "MEDIUM",
        gradingVariant: gradingVariant ?? null,
        mappedBy: user,
        isAutoMapped: false,
        confidenceScore: null,
        notes: null,
      });
      await storage.applySnlMappingToRecipes(boqItemId, snlItemId, projectCategory ?? "MEDIUM", gradingVariant ?? null, user);
      // Mark item as manually mapped
      await storage.updateBoqItemMappingStatus(boqItemId, "mapped");
      res.json({ success: true });
    } catch (err) {
      console.error("POST /api/snl/mappings/:boqItemId/apply:", err);
      res.status(500).json({ error: "Failed to apply mapping" });
    }
  });

  app.delete("/api/snl/mappings/:boqItemId", async (req, res) => {
    try {
      const ok = await storage.deleteSnlMapping(parseInt(req.params.boqItemId));
      res.json({ success: ok });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete mapping" });
    }
  });

  app.post("/api/boq/projects/:id/remap", async (req, res) => {
    try {
      const boqProjectId = parseInt(req.params.id);
      const result = await remapBoqProject(boqProjectId);
      res.json(result);
    } catch (err) {
      console.error("POST /api/boq/projects/:id/remap:", err);
      res.status(500).json({ error: "Failed to remap project" });
    }
  });

  app.post("/api/boq/projects/:id/snl/auto-map-all", async (req, res) => {
    try {
      const boqProjectId = parseInt(req.params.id);
      if (isNaN(boqProjectId)) return res.status(400).json({ error: "Invalid project id" });
      const summary = await autoMapProjectWithSummary(boqProjectId);
      res.json(summary);
    } catch (err) {
      console.error("POST /api/boq/projects/:id/snl/auto-map-all:", err);
      res.status(500).json({ error: "Auto-map failed" });
    }
  });

  app.post("/api/boq/projects/:id/snl/confirm-review", async (req, res) => {
    try {
      const boqProjectId = parseInt(req.params.id);
      if (isNaN(boqProjectId)) return res.status(400).json({ error: "Invalid project id" });
      // Minimum confidence to bulk-confirm. Cross-sector matches are skipped
      // (they must be manually confirmed after inspection).
      const CONFIRM_THRESHOLD = 0.50;

      // Fetch all needs_review items for this project (with description for category classification)
      const reviewItems = await db
        .select({ id: boqItems.id, description: boqItems.description })
        .from(boqItems)
        .where(and(eq(boqItems.boqProjectId, boqProjectId), eq(boqItems.mappingStatus, "needs_review")));

      if (reviewItems.length === 0) return res.json({ confirmed: 0, skipped: 0 });

      const ids = reviewItems.map(i => i.id);
      // Join snlItems to get the sector so we can skip cross-sector suggestions
      const mappings = await db
        .select({
          boqItemId: snlBoqMappings.boqItemId,
          snlItemId: snlBoqMappings.snlItemId,
          confidenceScore: snlBoqMappings.confidenceScore,
          snlSector: snlItems.sector,
        })
        .from(snlBoqMappings)
        .leftJoin(snlItems, eq(snlItems.id, snlBoqMappings.snlItemId))
        .where(drizzleInArray(snlBoqMappings.boqItemId, ids));

      const mappingMap = new Map(mappings.map(m => [m.boqItemId, m]));
      const user = (req as any).user?.username ?? "auto";

      let confirmed = 0, skipped = 0;

      for (const item of reviewItems) {
        const mapping = mappingMap.get(item.id);
        if (!mapping || mapping.confidenceScore == null || mapping.confidenceScore < CONFIRM_THRESHOLD) {
          skipped++;
          continue;
        }
        // Skip cross-sector suggestions (primary sector required for bulk-confirm)
        const boqCategory = classifyBoqItem(item.description ?? "");
        const sectorMul = getSectorMultiplier(boqCategory, mapping.snlSector);
        if (sectorMul < 1.0) {
          skipped++;
          continue;
        }
        try {
          await storage.applySnlMappingToRecipes(item.id, mapping.snlItemId, "MEDIUM", null, user);
          await storage.updateBoqItemMappingStatus(item.id, "mapped");
          confirmed++;
        } catch (err) {
          console.error(`[confirm-review] failed for boqItemId=${item.id}:`, err);
          skipped++;
        }
      }

      res.json({ confirmed, skipped });
    } catch (err) {
      console.error("POST /api/boq/projects/:id/snl/confirm-review:", err);
      res.status(500).json({ error: "Confirm review failed" });
    }
  });

  // ─── Composite BOQ component endpoints ───────────────────────────────────────

  app.get("/api/boq/items/:id/components", async (req, res) => {
    try {
      const boqItemId = parseInt(req.params.id);
      if (isNaN(boqItemId)) return res.status(400).json({ error: "Invalid item id" });
      const components = await storage.getCompositeComponents(boqItemId);
      res.json(components);
    } catch (err) {
      console.error("GET /api/boq/items/:id/components:", err);
      res.status(500).json({ error: "Failed to fetch components" });
    }
  });

  app.post("/api/boq/items/:id/components/:compId/map", async (req, res) => {
    try {
      const boqItemId = parseInt(req.params.id);
      const componentId = parseInt(req.params.compId);
      if (isNaN(boqItemId) || isNaN(componentId)) return res.status(400).json({ error: "Invalid ids" });
      const { snlItemId } = req.body;
      if (!snlItemId || typeof snlItemId !== "number") return res.status(400).json({ error: "snlItemId required" });
      const user = (req as any).user?.username ?? "user";
      await storage.applyCompositeComponentMap(componentId, snlItemId, user);
      const allDone = await storage.applyCompositeRecipesIfComplete(boqItemId, user);
      res.json({ allDone });
    } catch (err) {
      console.error("POST /api/boq/items/:id/components/:compId/map:", err);
      res.status(500).json({ error: "Failed to map component" });
    }
  });

  app.post("/api/snl/seed", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const result = await storage.seedSnlMorthSdb();
      res.json({ success: true, source: result.source.code, items: result.items });
    } catch (err) {
      console.error("POST /api/snl/seed:", err);
      res.status(500).json({ error: "Seed failed" });
    }
  });

  // ─── SNL Import (admin) ──────────────────────────────────────────────────
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

  app.post("/api/snl/import", upload.single("file"), async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      // Auto-detect MoRTH official chapter-per-sheet format
      const wb = xlsx.read(req.file.buffer, { type: 'buffer' });
      if (isMorthFormat(wb)) {
        const result = await importMorthSdbXlsx(req.file.buffer);
        return res.json(result);
      }

      const { sourceName, sourceCode, year } = req.body;
      const result = await importSdbXlsx(req.file.buffer, {
        sourceName: sourceName || undefined,
        sourceCode: sourceCode || undefined,
        year: year ? parseInt(year) : undefined,
      });
      res.json(result);
    } catch (err: any) {
      console.error("POST /api/snl/import:", err);
      res.status(500).json({ error: err.message ?? "Import failed" });
    }
  });

  app.get("/api/snl/import-template", async (_req, res) => {
    try {
      const buf = buildImportTemplate();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="SDB_Import_Template.xlsx"');
      res.send(buf);
    } catch (err) {
      console.error("GET /api/snl/import-template:", err);
      res.status(500).json({ error: "Template generation failed" });
    }
  });

  // ─── END SNL ────────────────────────────────────────────────────────────

  // Run schema migrations first (await) so the columns exist before any seed
  // function queries the affected tables, then fire the rest concurrently.
  (async () => {
    await ensureDprBoqProjectColumn();
    await ensureBoqItemNameColumn();
    await ensureBoqDprConversionFactor();
    seedDatabase();
    seedPlantMasterData();
    seedPlanningMasters();
    seedSnlItems();
    storage.backfillBoqPlanningInclude().catch(err => console.error("backfillBoqPlanningInclude failed:", err));
    storage.backfillBoqWorkType().catch(err => console.error("backfillBoqWorkType failed:", err));
  })().catch((err) => console.error("Startup tasks failed:", err));

  return httpServer;
}

async function seedPlantMasterData() {
  const existingMaterials = await storage.getPlantMaterials();
  if (existingMaterials.length === 0) {
    console.log("Seeding plant master data...");
    
    // Default materials — bulk densities per IS 2386 / IRC norms (granite/basalt; editable in Material Master)
    // conversionFactor is auto-derived from bulkDensity by storage._deriveBulkDensityConversion()
    const defaultMaterials = [
      { name: "20MM",     category: "Aggregate", defaultUom: "Ton", allowedUoms: JSON.stringify(["Ton", "MT", "CFT", "Cum", "Kg"]), bulkDensity: 1.52, conversionFromUom: "CFT" },
      { name: "10/12MM",  category: "Aggregate", defaultUom: "Ton", allowedUoms: JSON.stringify(["Ton", "MT", "CFT", "Cum", "Kg"]), bulkDensity: 1.55, conversionFromUom: "CFT" },
      { name: "6MM DOWN", category: "Aggregate", defaultUom: "Ton", allowedUoms: JSON.stringify(["Ton", "MT", "CFT", "Cum", "Kg"]), bulkDensity: 1.60, conversionFromUom: "CFT" },
      { name: "DUST",     category: "Aggregate", defaultUom: "Ton", allowedUoms: JSON.stringify(["Ton", "MT", "CFT", "Cum", "Kg"]), bulkDensity: 1.65, conversionFromUom: "CFT" },
      { name: "40MM",     category: "Aggregate", defaultUom: "Ton", allowedUoms: JSON.stringify(["Ton", "MT", "CFT", "Cum", "Kg"]), bulkDensity: 1.50, conversionFromUom: "CFT" },
      { name: "GSB",      category: "Aggregate", defaultUom: "Ton", allowedUoms: JSON.stringify(["Ton", "MT", "CFT", "Cum", "Kg"]), bulkDensity: 1.75, conversionFromUom: "CFT" },
      { name: "Filler",   category: "Aggregate", defaultUom: "MT",  allowedUoms: JSON.stringify(["MT", "Ton", "CFT", "Cum", "Kg"]), bulkDensity: 2.10, conversionFromUom: "CFT" },
      { name: "BITUMEN",  category: "Bitumen",   defaultUom: "MT",  allowedUoms: JSON.stringify(["MT", "Ton", "Kg", "Barrels"]) },
      { name: "EMULSION", category: "Bitumen",   defaultUom: "Liters", allowedUoms: JSON.stringify(["Liters", "Barrels", "Kg"]) },
      { name: "DIESEL",   category: "Utility",   defaultUom: "Liters", allowedUoms: JSON.stringify(["Liters", "Barrels", "Kg"]) },
      { name: "LDO",      category: "Utility",   defaultUom: "Liters", allowedUoms: JSON.stringify(["Liters", "Barrels", "Kg"]) },
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
    const lockStatusResult = await storage.backfillShiftLogLockStatus();
    if (lockStatusResult.updated > 0 || lockStatusResult.errors > 0) {
      console.log(`Startup: Shift-log lock_status backfill — unlocked: ${lockStatusResult.updated}, errors: ${lockStatusResult.errors}`);
    }
  } catch (err) {
    console.error("Startup: Failed to backfill shift-log lock_status:", err);
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

async function seedPlanningMasters() {
  try {
    const existing = await storage.getPlanningEquipmentTypes(true);
    if (existing.length > 0) return;

    console.log("Seeding planning equipment & labour type masters...");

    const equipmentSeed: Array<{ name: string; category: string; sortOrder: number; standardOutputs: Array<{ unit: string; outputPerHr: number }> }> = [
      { name: "Excavator",                    category: "Earthwork",  sortOrder: 1,  standardOutputs: [{ unit: "CUM", outputPerHr: 80 }] },
      { name: "Dozer / Bulldozer",             category: "Earthwork",  sortOrder: 2,  standardOutputs: [{ unit: "CUM", outputPerHr: 120 }] },
      { name: "Motor Grader",                  category: "Earthwork",  sortOrder: 3,  standardOutputs: [{ unit: "SQM", outputPerHr: 1500 }, { unit: "RM", outputPerHr: 1500 }] },
      { name: "Tractor (Dozer)",               category: "Earthwork",  sortOrder: 4,  standardOutputs: [{ unit: "CUM", outputPerHr: 60 }] },
      { name: "Paver",                         category: "Paving",     sortOrder: 5,  standardOutputs: [{ unit: "SQM", outputPerHr: 800 }] },
      { name: "Tandem Roller",                 category: "Paving",     sortOrder: 6,  standardOutputs: [{ unit: "SQM", outputPerHr: 1200 }] },
      { name: "Pneumatic Tyre Roller (PTR)",   category: "Paving",     sortOrder: 7,  standardOutputs: [{ unit: "SQM", outputPerHr: 1200 }] },
      { name: "Vibratory Roller",              category: "Paving",     sortOrder: 8,  standardOutputs: [{ unit: "SQM", outputPerHr: 1500 }] },
      { name: "Plate Compactor",               category: "Paving",     sortOrder: 9,  standardOutputs: [{ unit: "SQM", outputPerHr: 150 }] },
      { name: "Bitumen Pressure Distributor",  category: "Paving",     sortOrder: 10, standardOutputs: [{ unit: "SQM", outputPerHr: 2000 }] },
      { name: "Tipper",                        category: "Transport",  sortOrder: 11, standardOutputs: [{ unit: "CUM", outputPerHr: 60 }] },
      { name: "Water Tanker",                  category: "Transport",  sortOrder: 12, standardOutputs: [{ unit: "KL", outputPerHr: 12 }] },
      { name: "Transit Mixer",                 category: "Transport",  sortOrder: 13, standardOutputs: [{ unit: "CUM", outputPerHr: 6 }] },
      { name: "Dumper",                        category: "Transport",  sortOrder: 14, standardOutputs: [{ unit: "CUM", outputPerHr: 40 }] },
      { name: "Hot Mix Plant",                 category: "Plant",      sortOrder: 15, standardOutputs: [{ unit: "MT", outputPerHr: 70 }] },
      { name: "WMM Plant",                     category: "Plant",      sortOrder: 16, standardOutputs: [{ unit: "MT", outputPerHr: 100 }] },
      { name: "Concrete Pump",                 category: "Plant",      sortOrder: 17, standardOutputs: [{ unit: "CUM", outputPerHr: 30 }] },
      { name: "Wheel Loader / JCB",            category: "Plant",      sortOrder: 18, standardOutputs: [{ unit: "CUM", outputPerHr: 60 }] },
      { name: "DG / Generator",                category: "Support",    sortOrder: 19, standardOutputs: [] },
    ];

    for (const e of equipmentSeed) {
      await storage.createPlanningEquipmentType({ name: e.name, category: e.category, sortOrder: e.sortOrder, standardOutputs: e.standardOutputs, isActive: true });
    }

    const labourSeed: Array<{ designation: string; skillTier: string; sortOrder: number; standardOutputs: Array<{ unit: string; outputPerDay: number }> }> = [
      { designation: "Unskilled Labour",      skillTier: "Unskilled",    sortOrder: 1,  standardOutputs: [{ unit: "CUM", outputPerDay: 2.0 }, { unit: "SQM", outputPerDay: 6.0 }] },
      { designation: "Semi-skilled Labour",   skillTier: "Semi-skilled", sortOrder: 2,  standardOutputs: [{ unit: "SQM", outputPerDay: 8.0 }, { unit: "RM", outputPerDay: 15.0 }] },
      { designation: "Skilled Labour (Gen.)", skillTier: "Skilled",      sortOrder: 3,  standardOutputs: [{ unit: "CUM", outputPerDay: 1.0 }, { unit: "SQM", outputPerDay: 10.0 }] },
      { designation: "Mason",                 skillTier: "Skilled",      sortOrder: 4,  standardOutputs: [{ unit: "CUM", outputPerDay: 0.8 }, { unit: "SQM", outputPerDay: 8.0 }] },
      { designation: "Carpenter",             skillTier: "Skilled",      sortOrder: 5,  standardOutputs: [{ unit: "SQM", outputPerDay: 8.0 }, { unit: "NOS", outputPerDay: 2.0 }] },
      { designation: "Bar Bender / Fitter",   skillTier: "Skilled",      sortOrder: 6,  standardOutputs: [{ unit: "MT", outputPerDay: 0.4 }] },
      { designation: "Blacksmith",            skillTier: "Skilled",      sortOrder: 7,  standardOutputs: [{ unit: "MT", outputPerDay: 0.3 }] },
      { designation: "Welder",                skillTier: "Skilled",      sortOrder: 8,  standardOutputs: [{ unit: "MT", outputPerDay: 0.15 }, { unit: "NOS", outputPerDay: 3.0 }] },
      { designation: "Painter",               skillTier: "Skilled",      sortOrder: 9,  standardOutputs: [{ unit: "SQM", outputPerDay: 10.0 }] },
      { designation: "Plumber",               skillTier: "Skilled",      sortOrder: 10, standardOutputs: [{ unit: "RM", outputPerDay: 15.0 }, { unit: "NOS", outputPerDay: 5.0 }] },
      { designation: "Electrician",           skillTier: "Skilled",      sortOrder: 11, standardOutputs: [{ unit: "RM", outputPerDay: 20.0 }, { unit: "NOS", outputPerDay: 8.0 }] },
      { designation: "Operator (Equipment)",  skillTier: "Skilled",      sortOrder: 12, standardOutputs: [] },
      { designation: "Foreman",               skillTier: "Supervisory",  sortOrder: 13, standardOutputs: [] },
      { designation: "Supervisor / Mate",     skillTier: "Supervisory",  sortOrder: 14, standardOutputs: [] },
    ];

    for (const l of labourSeed) {
      await storage.createPlanningLabourType({ designation: l.designation, skillTier: l.skillTier, sortOrder: l.sortOrder, standardOutputs: l.standardOutputs, isActive: true });
    }

    console.log(`Planning masters seeded: ${equipmentSeed.length} equipment types, ${labourSeed.length} labour types`);
  } catch (err) {
    console.error("seedPlanningMasters failed:", err);
  }
}

// Bump this version string whenever the SNL seed data changes.
const SNL_SEED_VERSION = "v4-sdb-multi-sector";

// Bundled SDB xlsx files shipped with the app in server/seed/sdb/
const SDB_BUNDLES = [
  { file: "SDB_ROAD.xlsx",             sourceCode: "SDB_ROAD",        sourceName: "AP SDB Road Works",           year: 2024 },
  { file: "SDB_STRUCTURES.xlsx",       sourceCode: "SDB_STRUCTURES",  sourceName: "AP SDB Structures",           year: 2024 },
  { file: "SDB_IRRIGATION_CANALS.xlsx",sourceCode: "SDB_IRRIGATION",  sourceName: "AP SDB Irrigation Canals",    year: 2024 },
  { file: "SDB_GATES_HOIST.xlsx",      sourceCode: "SDB_GATES",       sourceName: "AP SDB Gates & Hoist",        year: 2024 },
];

async function seedSnlFromBundles(): Promise<void> {
  const seedDir = path.resolve(process.cwd(), "server/seed/sdb");
  const sources = await storage.getSnlSources();
  const existingCodes = new Set(sources.map(s => s.code));
  let totalNew = 0;
  for (const bundle of SDB_BUNDLES) {
    if (existingCodes.has(bundle.sourceCode)) {
      continue; // already imported — skip (re-import only via POST /api/snl/import)
    }
    const filePath = path.join(seedDir, bundle.file);
    if (!fs.existsSync(filePath)) {
      console.log(`SNL bundle seed: ${bundle.file} not found, skipping`);
      continue;
    }
    try {
      const buf = fs.readFileSync(filePath);
      const result = await importSdbXlsx(buf, {
        sourceCode: bundle.sourceCode,
        sourceName: bundle.sourceName,
        year: bundle.year,
      });
      console.log(`SNL bundle seed: ${bundle.sourceCode} — ${result.itemsInserted} items, ${result.errors.length} errors`);
      if (result.errors.length > 0) {
        result.errors.slice(0, 10).forEach(e => console.error(`  SNL import error: ${e}`));
      }
      totalNew += result.itemsInserted;
    } catch (err) {
      console.error(`SNL bundle seed: ${bundle.file} failed:`, err);
    }
  }
  if (totalNew > 0) console.log(`SNL bundle seed complete: ${totalNew} new items across all sectors`);
}

async function seedSnlItems() {
  try {
    const storedVersion = await storage.getSetting("snl_seed_version");
    if (storedVersion !== SNL_SEED_VERSION) {
      console.log(`SNL: version mismatch (have "${storedVersion}", want "${SNL_SEED_VERSION}"), re-seeding in-memory items...`);
      const result = await storage.seedSnlMorthSdb();
      await storage.setSetting("snl_seed_version", SNL_SEED_VERSION);
      console.log(`SNL in-memory seed complete: ${result.items} items from ${result.source.code}`);
    }
    // Auto-import any bundled sector files not yet in the DB
    await seedSnlFromBundles();
    // Global remap — pick up items mapped while the app was down
    autoMapAllUnmappedItems()
      .then(r => { if (r.remapped > 0) console.log(`SNL global remap: ${r.remapped} items processed`); })
      .catch(err => console.error("SNL global remap failed:", err));
    // Backfill: promote any auto-mapped items that composite detection now recognises
    backfillCompositeDetection()
      .then(r => { if (r.promoted > 0) console.log(`SNL composite backfill: ${r.promoted} items promoted`); })
      .catch(err => console.error("SNL composite backfill failed:", err));
  } catch (err) {
    console.error("seedSnlItems failed:", err);
  }
}

async function ensureDprBoqProjectColumn() {
  try {
    // 1. Add column if not already present (idempotent)
    await db.execute(sql.raw(`ALTER TABLE dprs ADD COLUMN IF NOT EXISTS boq_project_id integer`));

    // 1b. Add FK constraint (nullable, ON DELETE SET NULL so deleting a BOQ project
    //     sets the column to null rather than blocking or orphaning DPRs).
    await db.execute(sql.raw(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'dprs_boq_project_id_fkey'
        ) THEN
          ALTER TABLE dprs ADD CONSTRAINT dprs_boq_project_id_fkey
            FOREIGN KEY (boq_project_id) REFERENCES boq_projects(id) ON DELETE SET NULL;
        END IF;
      END $$
    `));

    // 2. Re-link orphaned progress entries whose boq_item_id no longer exists.
    //    boq_item_id=25 was from a now-deleted BOQ project. Item 13 is the
    //    matching "Clearing and grubbing" item in the surviving project 2.
    await db.execute(sql.raw(`
      UPDATE progress_entries
      SET boq_item_id = 13
      WHERE boq_item_id = 25
        AND NOT EXISTS (SELECT 1 FROM boq_items WHERE id = 25)
    `));

    // 3. Backfill dprs.boq_project_id for DPRs that have progress entries
    //    linked to a known BOQ item — derive the project from the item.
    await db.execute(sql.raw(`
      UPDATE dprs d
      SET boq_project_id = sub.boq_project_id
      FROM (
        SELECT DISTINCT ON (pe.dpr_id) pe.dpr_id, bi.boq_project_id
        FROM progress_entries pe
        JOIN boq_items bi ON bi.id = pe.boq_item_id
        WHERE pe.boq_item_id IS NOT NULL
        ORDER BY pe.dpr_id, bi.boq_project_id
      ) sub
      WHERE d.id = sub.dpr_id
        AND d.boq_project_id IS NULL
    `));

    console.log("dprs: boq_project_id column ensured, orphaned entries re-linked, backfill complete");
  } catch (err) {
    console.error("ensureDprBoqProjectColumn failed:", err);
  }
}

async function ensureBoqDprConversionFactor() {
  try {
    await db.execute(sql.raw(`ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS dpr_conversion_factor real`));
    // Backfill known Takkadpally items: item 13 = Clearing & Grubbing (SQM → Ha = 0.0001)
    await db.execute(sql.raw(`
      UPDATE boq_items
      SET dpr_conversion_factor = 0.0001
      WHERE id = 13
        AND dpr_conversion_factor IS NULL
    `));
    console.log("boq_items: dpr_conversion_factor column ensured");
  } catch (err) {
    console.error("ensureBoqDprConversionFactor failed:", err);
  }
}

async function ensureBoqItemNameColumn() {
  try {
    // Idempotent DDL — safe to run on every startup
    await db.execute(sql.raw(`ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS item_name text`));
    // Backfill item_name from the first 3–4 significant words of description for rows that are still null
    await db.execute(sql.raw(`
      UPDATE boq_items
      SET item_name = regexp_replace(
        trim(regexp_replace(description, '\\s+', ' ', 'g')),
        '^(\\S+(?:\\s+\\S+){0,3}).*$', '\\1', 'i'
      )
      WHERE item_name IS NULL
        AND description IS NOT NULL
        AND description <> ''
    `));
    console.log("boq_items: item_name column ensured and backfilled");
  } catch (err) {
    console.error("ensureBoqItemNameColumn failed:", err);
  }
}
