import type { Express, Request, Response } from "express";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { assertAdmin, assertView } from "./auth-routes";
import { vendors, vendorBills, vendorBillItems, vendorRateCards, vendorAliases, purchaseIndentItems, purchaseIndents, siteMaterialTrips, sites } from "@shared/schema";
import { siteMatchesPermitted } from "@shared/siteName";

export const vendorMasterFields = z.object({
  name: z.string().trim().min(1).max(250).transform(value => value.toUpperCase()),
  businessName: z.string().trim().max(250).transform(value => value.toUpperCase()).nullish(),
  gstNumber: z.string().trim().max(50).nullish(),
  panNumber: z.string().trim().max(50).nullish(),
  address: z.string().trim().max(2000).nullish(),
  bankAccountName: z.string().trim().max(250).nullish(),
  bankAccountNumber: z.string().trim().max(100).nullish(),
  bankIfsc: z.string().trim().max(50).nullish(),
  bankName: z.string().trim().max(250).nullish(),
  contactPersonName: z.string().trim().max(250).nullish(),
  contactPhone: z.string().trim().max(100).nullish(),
  contactEmail: z.string().trim().email().max(250).or(z.literal("")).nullish(),
  isActive: z.boolean().optional(),
}).strict();
const fields = vendorMasterFields;

const roles = {
  bills: { table: vendorBills, name: vendorBills.vendorName, id: vendorBills.id, fk: vendorBills.vendorId },
  rates: { table: vendorRateCards, name: vendorRateCards.vendorName, id: vendorRateCards.id, fk: vendorRateCards.vendorId },
  indents: { table: purchaseIndentItems, name: purchaseIndentItems.vendor, id: purchaseIndentItems.id, fk: purchaseIndentItems.vendorId },
  transport: { table: siteMaterialTrips, name: siteMaterialTrips.supplier, id: siteMaterialTrips.id, fk: siteMaterialTrips.supplierVendorId },
  materialSource: { table: siteMaterialTrips, name: siteMaterialTrips.materialSourceSupplier, id: siteMaterialTrips.id, fk: siteMaterialTrips.materialSourceVendorId },
} as const;
type Role = keyof typeof roles;
const bankKeys = ["bankAccountName", "bankAccountNumber", "bankIfsc", "bankName"] as const;
export function publicVendor(v: typeof vendors.$inferSelect, sensitive: boolean) {
  if (sensitive) return v;
  const result: Record<string, unknown> = { ...v };
  for (const key of bankKeys) delete result[key];
  return result;
}
export function sameReviewIds(actualIds: number[], submittedIds: number[]): boolean {
  const actual = [...actualIds].sort((a, b) => a - b);
  const expected = Array.from(new Set(submittedIds)).sort((a, b) => a - b);
  return submittedIds.length === expected.length && actual.length === expected.length && actual.every((id, i) => id === expected[i]);
}
export function activityKind(category: string | null, billType: string): "equipment" | "material" | "transport" | "labour" {
  const type = `${category || ""} ${billType || ""}`.toLowerCase();
  return /labou?r/.test(type) ? "labour" : /transport|trip|vehicle/.test(type) ? "transport" : /equipment|hire|machinery/.test(type) ? "equipment" : "material";
}
export function proposeVendorMatch(name: string, master: { id: number; name: string }[], aliases: { alias: string; canonicalName: string }[]) {
  const matchingAliases = aliases.filter(a => a.alias.trim().toLowerCase() === name.trim().toLowerCase());
  const hint = matchingAliases.length === 1 ? matchingAliases[0].canonicalName : null;
  // Never guess when multiple master rows share the same normalized display name.
  const matches = master.filter(v => v.name.trim().toLowerCase() === (hint || name).trim().toLowerCase());
  const suggestionId = matchingAliases.length > 1 || matches.length !== 1 ? null : matches[0].id;
  return { hint, suggestionId };
}
function error(res: Response, err: unknown) {
  if (err instanceof z.ZodError) return res.status(400).json({ message: err.issues.map(i => i.message).join("; ") });
  console.error("Vendor Master:", err);
  return res.status(500).json({ message: "Vendor Master operation failed" });
}

export function registerVendorMasterRoutes(app: Express, permittedSites: (req: Request) => Promise<string[] | null>) {
  const canView = (req: Request, res: Response) => assertView(req, res, "master_parties");
  const canManage = (req: Request, res: Response) => !!req.authUser?.isOwner || assertAdmin(req, res);
  const isSensitive = (req: Request) => !!(req.authUser?.isAdmin || req.authUser?.isOwner);
  async function visibleVendorIds(req: Request): Promise<Set<number> | null> {
    const allowed = await permittedSites(req);
    if (allowed === null) return null;
    const siteRows = await db.select({ id: sites.id, name: sites.name }).from(sites);
    const byId = new Map(siteRows.map(s => [s.id, s.name]));
    const visible = (s: string | null | undefined) => !!s && siteMatchesPermitted(s, allowed);
    const ids = new Set<number>();
    const bills = await db.select({ vendorId: vendorBills.vendorId, siteId: vendorBills.siteId, siteName: vendorBillItems.siteName }).from(vendorBills)
      .leftJoin(vendorBillItems, eq(vendorBillItems.billId, vendorBills.id));
    for (const b of bills) if (b.vendorId && visible(b.siteName || (b.siteId ? byId.get(b.siteId) : null))) ids.add(b.vendorId);
    const indents = await db.select({ vendorId: purchaseIndentItems.vendorId, siteId: purchaseIndents.siteId }).from(purchaseIndentItems)
      .innerJoin(purchaseIndents, eq(purchaseIndents.id, purchaseIndentItems.indentId));
    for (const p of indents) if (p.vendorId && visible(p.siteId ? byId.get(p.siteId) : null)) ids.add(p.vendorId);
    const trips = await db.select({ site: siteMaterialTrips.site, supplierId: siteMaterialTrips.supplierVendorId, materialId: siteMaterialTrips.materialSourceVendorId }).from(siteMaterialTrips);
    for (const t of trips) if (visible(t.site)) {
      if (t.supplierId) ids.add(t.supplierId);
      if (t.materialId) ids.add(t.materialId);
    }
    return ids;
  }

  app.get("/api/vendor-master", async (req, res) => {
    if (!canView(req, res)) return;
    try {
      const permitted = await visibleVendorIds(req);
      res.json((await db.select().from(vendors).orderBy(vendors.name))
        .filter(v => permitted === null || permitted.has(v.id)).map(v => publicVendor(v, isSensitive(req))));
    } catch (e) { error(res, e); }
  });
  app.post("/api/vendor-master", async (req, res) => {
    if (!canManage(req, res)) return;
    try {
      const input = fields.parse(req.body);
      const [saved] = await db.insert(vendors).values(input).returning();
      res.status(201).json(saved);
    } catch (e) { error(res, e); }
  });
  app.patch("/api/vendor-master/:id", async (req, res) => {
    if (!canManage(req, res)) return;
    try {
      const input = fields.partial().parse(req.body);
      if (!Object.keys(input).length) return res.status(400).json({ message: "No fields supplied" });
      const [saved] = await db.update(vendors).set({ ...input, updatedAt: new Date() }).where(eq(vendors.id, Number(req.params.id))).returning();
      if (!saved) return res.status(404).json({ message: "Vendor not found" });
      res.json(saved);
    } catch (e) { error(res, e); }
  });

  app.get("/api/vendor-master/review", async (req, res) => {
    if (!canManage(req, res)) return;
    try {
      const master = await db.select({ id: vendors.id, name: vendors.name }).from(vendors);
      const aliases = await db.select().from(vendorAliases);
      const proposals = [];
      for (const role of Object.keys(roles) as Role[]) {
        const { table, name, id, fk } = roles[role];
        const rows = await db.select({ id, name }).from(table).where(isNull(fk));
        const grouped = new Map<string, number[]>();
        for (const row of rows) {
          if (!row.name?.trim()) continue;
          grouped.set(row.name, [...(grouped.get(row.name) || []), row.id]);
        }
        for (const [name, ids] of Array.from(grouped)) {
          proposals.push({ role, name, count: ids.length, ids: ids.sort((a: number,b: number) => a-b), ...proposeVendorMatch(name, master, aliases) });
        }
      }
      res.json(proposals);
    } catch (e) { error(res, e); }
  });
  app.post("/api/vendor-master/review/confirm", async (req, res) => {
    if (!canManage(req, res)) return;
    try {
      const input = z.object({
        role: z.enum(["bills", "rates", "indents", "transport", "materialSource"]),
        name: z.string().min(1),
        ids: z.array(z.number().int().positive()).min(1),
        vendorId: z.number().int().positive().optional(),
        newVendor: fields.optional(),
      }).refine(v => !!v.vendorId !== !!v.newVendor, "Select an existing vendor OR create a new one").parse(req.body);
      const { table, name, id, fk } = roles[input.role];
      const result = await db.transaction(async tx => {
        // Lock matching rows: a stale review cannot silently link a changed name or an already-linked row.
        const current = await tx.select({ id }).from(table).where(and(eq(name, input.name), isNull(fk))).for("update");
        if (!sameReviewIds(current.map(r => r.id), input.ids))
          return { conflict: true as const };
        let vendorId = input.vendorId;
        if (vendorId) {
          const [target] = await tx.select({ id: vendors.id, isActive: vendors.isActive }).from(vendors).where(eq(vendors.id, vendorId));
          if (!target?.isActive) return { missing: true as const };
        } else {
          const [created] = await tx.insert(vendors).values(input.newVendor!).returning({ id: vendors.id });
          vendorId = created.id;
        }
        const columnKey = input.role === "transport" ? "supplierVendorId"
          : input.role === "materialSource" ? "materialSourceVendorId" : "vendorId";
        // Never update by name alone: a new matching row may arrive after the
        // locked snapshot was read. Only the explicitly reviewed IDs can move.
        const updated = await tx.update(table).set({ [columnKey]: vendorId })
          .where(and(inArray(id, input.ids), eq(name, input.name), isNull(fk))).returning({ id });
        if (!sameReviewIds(updated.map(row => row.id), input.ids)) throw new Error("Vendor review changed during confirmation");
        return { vendorId, linked: updated.length };
      });
      if ("conflict" in result) return res.status(409).json({ message: "Review is stale. Refresh proposals and confirm again." });
      if ("missing" in result) return res.status(404).json({ message: "Active vendor not found" });
      res.json(result);
    } catch (e) { error(res, e); }
  });

  app.get("/api/vendor-master/:id/activity", async (req, res) => {
    if (!canView(req, res)) return;
    try {
      const vendorId = Number(req.params.id);
      const [vendor] = await db.select().from(vendors).where(eq(vendors.id, vendorId));
      if (!vendor) return res.status(404).json({ message: "Vendor not found" });
      const visible = await visibleVendorIds(req);
      if (visible !== null && !visible.has(vendorId)) return res.status(403).json({ message: "Vendor has no activity in your permitted sites" });
      const allowed = await permittedSites(req);
      const siteRows = await db.select({ id: sites.id, name: sites.name }).from(sites);
      const byId = new Map(siteRows.map(s => [s.id, s.name]));
      const grouped = new Map<string, Record<string, number>>();
      const add = (site: string | null | undefined, kind: string) => {
        const label = site || "Unassigned site";
        if (allowed !== null && (!site || !siteMatchesPermitted(site, allowed))) return;
        const counts = grouped.get(label) || { equipment: 0, material: 0, transport: 0, labour: 0 };
        counts[kind]++;
        grouped.set(label, counts);
      };
      const billRows = await db.select({ itemId: vendorBillItems.id, siteName: vendorBillItems.siteName, siteId: vendorBills.siteId, billType: vendorBills.billType, category: vendorBillItems.category })
        .from(vendorBills).leftJoin(vendorBillItems, eq(vendorBillItems.billId, vendorBills.id)).where(eq(vendorBills.vendorId, vendorId));
      for (const b of billRows) {
        if (!b.itemId) continue;
        add(b.siteName || (b.siteId ? byId.get(b.siteId) : null), activityKind(b.category, b.billType));
      }
      const piRows = await db.select({ siteId: purchaseIndents.siteId }).from(purchaseIndentItems)
        .innerJoin(purchaseIndents, eq(purchaseIndents.id, purchaseIndentItems.indentId)).where(eq(purchaseIndentItems.vendorId, vendorId));
      for (const p of piRows) add(p.siteId ? byId.get(p.siteId) : null, "material");
      const trips = await db.select({ site: siteMaterialTrips.site, supplierId: siteMaterialTrips.supplierVendorId, materialId: siteMaterialTrips.materialSourceVendorId })
        .from(siteMaterialTrips).where(eq(siteMaterialTrips.supplierVendorId, vendorId));
      for (const t of trips) add(t.site, "transport");
      const materials = await db.select({ site: siteMaterialTrips.site }).from(siteMaterialTrips).where(eq(siteMaterialTrips.materialSourceVendorId, vendorId));
      for (const t of materials) add(t.site, "material");
      // Rate cards have no site field; they are not represented as site activity.
      res.json({ vendor: publicVendor(vendor, isSensitive(req)), sites: Array.from(grouped).map(([site, counts]) => ({ site, ...counts })) });
    } catch (e) { error(res, e); }
  });
}