import type { Express, Request, Response } from "express";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  auditLogs,
  vendorAliases,
  vendorBillItems,
  vendorBills,
  vendorRateCards,
  vendors,
} from "@shared/schema";
import {
  buildRateCardTidyGroups,
  buildUnlinkedRateCardGroups,
  normalizeRateCardTidyUnit,
  planRateCardTidyOperations,
  type RateCardTidyCard,
  type RateCardTidyDecision,
  type RateCardTidyVendor,
} from "@shared/vendorRateCardTidy";
import { db } from "./db";

type TidySnapshot = { cards: RateCardTidyCard[]; vendors: RateCardTidyVendor[] };
type AuditActor = { id: number; fullName: string };
type TidyAudit = {
  transactionId: number;
  oldValues: unknown;
  newValues: unknown;
  reason: string;
};

export type RateCardTidyRepository = {
  loadSnapshotForUpdate(): Promise<TidySnapshot>;
  updateCard(id: number, patch: Partial<RateCardTidyCard>): Promise<RateCardTidyCard>;
  deleteCard(id: number): Promise<RateCardTidyCard>;
  addAudit(log: TidyAudit & { actor: AuditActor }): Promise<void>;
};

export function rateCardTidyVersion(snapshot: TidySnapshot): string {
  const cards = [...snapshot.cards].sort((a, b) => a.id - b.id).map(card => ({
    id: card.id, vendorName: card.vendorName, vendorId: card.vendorId,
    category: card.category, itemKey: card.itemKey, itemLabel: card.itemLabel,
    unit: card.unit, rate: Number(card.rate), notes: card.notes ?? null,
    leadDistanceKm: card.leadDistanceKm ?? null, payloadMt: card.payloadMt ?? null,
    ratePerKm: card.ratePerKm ?? null, updatedAt: card.updatedAt instanceof Date ? card.updatedAt.toISOString() : card.updatedAt ?? null,
  }));
  const masters = [...snapshot.vendors].sort((a, b) => a.id - b.id).map(vendor => ({
    id: vendor.id, name: vendor.name, isActive: vendor.isActive ?? null,
  }));
  // The token is not a security credential; it only detects stale previews.
  return JSON.stringify({ cards, masters });
}

export function findPossibleRateCardBillMatch(
  card: RateCardTidyCard,
  vendorNames: string[],
  bills: Array<{ id: number; billNo: string; billDate: string | Date; vendorName: string; vendorId: number | null; isDeleted?: boolean | null; isCancelled?: boolean | null }>,
  lines: Array<{ billId: number; description: string; category: string | null; unit: string | null; rate: number | null }>,
) {
  const names = new Set(vendorNames.map(nameKey));
  const billById = new Map(bills.filter(bill =>
    bill.isDeleted !== true && bill.isCancelled !== true &&
    ((card.vendorId != null && bill.vendorId === card.vendorId) ||
      (bill.vendorId == null && names.has(nameKey(bill.vendorName)))),
  ).map(bill => [bill.id, bill]));
  const wantedCategory = normalizeCategory(card.category);
  const wantedUnit = normalizeRateCardTidyUnit(card.unit);
  const wantedTokens = itemTokens(`${card.itemLabel || ""} ${card.itemKey}`);
  const candidates = lines.flatMap(line => {
    const bill = billById.get(line.billId);
    if (!bill || line.rate == null || normalizeCategory(line.category) !== wantedCategory ||
        normalizeRateCardTidyUnit(line.unit) !== wantedUnit) return [];
    const lineTokens = itemTokens(line.description);
    const overlap = wantedTokens.filter(token => lineTokens.includes(token)).length;
    if (!overlap) return [];
    const similarity = overlap / Math.min(wantedTokens.length || 1, lineTokens.length || 1);
    if (similarity < 0.65) return [];
    return [{ bill, line, similarity }];
  });
  candidates.sort((a, b) =>
    b.similarity - a.similarity ||
    String(b.bill.billDate).localeCompare(String(a.bill.billDate)) ||
    a.bill.id - b.bill.id,
  );
  const match = candidates[0];
  return match ? {
    billNo: match.bill.billNo,
    billDate: match.bill.billDate,
    description: match.line.description,
    unit: match.line.unit,
    rate: Number(match.line.rate),
  } : null;
}

function nameKey(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

function normalizeCategory(value: unknown) {
  const category = nameKey(value).replace(/[^A-Z]/g, "");
  if (category === "LABOR") return "LABOUR";
  if (category.includes("TRANSPORT")) return "TRANSPORT";
  if (category.includes("EQUIPMENT") || category.includes("MACHINERY")) return "EQUIPMENT";
  if (category.includes("LABOUR")) return "LABOUR";
  if (category.includes("MATERIAL")) return "MATERIAL";
  return category;
}

function itemTokens(value: string) {
  const stop = new Set(["DAILY", "DAY", "DAYS", "HIRE", "HOURLY", "HOUR", "HOURS", "HRS", "TRIP", "TRIPS", "TRANSPORT", "MAT", "EQ", "LAB"]);
  return Array.from(new Set<string>(nameKey(value).replace(/[^A-Z0-9]+/g, " ").split(/\s+/).filter(token => token && !stop.has(token))));
}

function mergeNotes(rows: RateCardTidyCard[]): string | null {
  const notes = Array.from(new Set<string>(rows.flatMap(row => (row.notes ?? "").split(/\r?\n/).map(note => note.trim()).filter(Boolean))));
  return notes.length ? notes.join("\n") : null;
}

function nonNullFromKeeper(rows: RateCardTidyCard[], keeper: RateCardTidyCard, field: "leadDistanceKm" | "payloadMt" | "ratePerKm") {
  if (keeper[field] != null) return keeper[field]!;
  return rows.find(row => row[field] != null)?.[field] ?? null;
}

export async function applyRateCardTidyPlan(
  repository: RateCardTidyRepository,
  input: { previewVersion: string; reason: string; decisions: RateCardTidyDecision[] },
  actor: AuditActor,
) {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("A reason of at least 3 characters is required.");
  const snapshot = await repository.loadSnapshotForUpdate();
  if (rateCardTidyVersion(snapshot) !== input.previewVersion) {
    throw new Error("Rate cards or Vendor Master changed after preview. Refresh and review again.");
  }
  const groups = buildRateCardTidyGroups(snapshot.cards, snapshot.vendors);
  const operations = planRateCardTidyOperations(groups, input.decisions);
  let mergedRows = 0;
  let changedRates = 0;
  for (const operation of operations) {
    const keeper = operation.rows.find(row => row.id === operation.keepCardId)!;
    const target = {
      ...keeper,
      vendorName: operation.vendorName,
      vendorId: operation.vendorId,
      rate: operation.rate,
      notes: mergeNotes(operation.rows),
      leadDistanceKm: nonNullFromKeeper(operation.rows, keeper, "leadDistanceKm"),
      payloadMt: nonNullFromKeeper(operation.rows, keeper, "payloadMt"),
      ratePerKm: nonNullFromKeeper(operation.rows, keeper, "ratePerKm"),
      updatedAt: new Date(),
    };
    const changed = target.vendorName !== keeper.vendorName || target.vendorId !== keeper.vendorId ||
      Number(target.rate) !== Number(keeper.rate) || target.notes !== (keeper.notes ?? null) ||
      target.leadDistanceKm !== (keeper.leadDistanceKm ?? null) ||
      target.payloadMt !== (keeper.payloadMt ?? null) || target.ratePerKm !== (keeper.ratePerKm ?? null);
    const saved = changed ? await repository.updateCard(keeper.id, target) : keeper;
    if (changed) {
      await repository.addAudit({
        transactionId: keeper.id,
        oldValues: keeper,
        newValues: {
          operation: "tidy_kept_row",
          choice: operation.choice,
          selectedRate: operation.rate,
          keptRow: saved,
        },
        reason,
        actor,
      });
      if (Number(target.rate) !== Number(keeper.rate)) changedRates++;
    }
    for (const duplicate of operation.rows.filter(row => row.id !== keeper.id)) {
      const deleted = await repository.deleteCard(duplicate.id);
      await repository.addAudit({
        transactionId: duplicate.id,
        oldValues: deleted,
        newValues: {
          operation: "tidy_merged_duplicate",
          choice: operation.choice,
          keptRow: saved,
          selectedRate: operation.rate,
        },
        reason,
        actor,
      });
      mergedRows++;
    }
  }
  return {
    mergedRows,
    mergedGroups: operations.length,
    changedRates,
    deferredConflicts: input.decisions.filter(decision => decision.action === "defer").length,
  };
}

function ownerOnly(req: Request, res: Response): boolean {
  if (req.authUser?.isOwner === true) return true;
  res.status(403).json({ message: "Only the Owner can tidy or link vendor rate cards." });
  return false;
}

const decisionsSchema = z.array(z.discriminatedUnion("action", [
  z.object({ key: z.string().min(1), action: z.literal("defer") }).strict(),
  z.object({ key: z.string().min(1), action: z.literal("keep"), keepCardId: z.number().int().positive() }).strict(),
  z.object({ key: z.string().min(1), action: z.literal("custom"), rate: z.number().finite().positive() }).strict(),
]));
const applySchema = z.object({
  previewVersion: z.string().min(1),
  reason: z.string().trim().min(3).max(1000),
  decisions: decisionsSchema,
}).strict().superRefine((value, ctx) => {
  const keys = value.decisions.map(decision => decision.key);
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", message: "Duplicate conflict decisions." });
});
const linkSchema = z.object({
  nameKey: z.string().trim().min(1).max(250),
  vendorId: z.number().int().positive(),
  reason: z.string().trim().min(3).max(1000),
}).strict();

function asTidyCard(row: typeof vendorRateCards.$inferSelect): RateCardTidyCard {
  return { ...row, itemLabel: row.itemLabel ?? null, rate: Number(row.rate) };
}

async function loadSnapshot(executor: any): Promise<TidySnapshot> {
  const [cards, masterRows] = await Promise.all([
    executor.select().from(vendorRateCards).orderBy(vendorRateCards.id),
    executor.select({ id: vendors.id, name: vendors.name, isActive: vendors.isActive }).from(vendors),
  ]);
  return {
    cards: cards.map(asTidyCard),
    vendors: masterRows.map((vendor: any) => ({ id: Number(vendor.id), name: vendor.name, isActive: vendor.isActive })),
  };
}

function makeRepository(tx: any): RateCardTidyRepository {
  return {
    async loadSnapshotForUpdate() {
      const cards = await tx.select().from(vendorRateCards).orderBy(vendorRateCards.id).for("update");
      const masterRows = await tx.select({ id: vendors.id, name: vendors.name, isActive: vendors.isActive }).from(vendors);
      return {
        cards: cards.map(asTidyCard),
        vendors: masterRows.map((vendor: any) => ({ id: Number(vendor.id), name: vendor.name, isActive: vendor.isActive })),
      };
    },
    async updateCard(id, patch) {
      const [saved] = await tx.update(vendorRateCards).set({
        vendorName: patch.vendorName,
        vendorId: patch.vendorId,
        rate: Number(patch.rate),
        notes: patch.notes,
        leadDistanceKm: patch.leadDistanceKm,
        payloadMt: patch.payloadMt,
        ratePerKm: patch.ratePerKm,
        updatedAt: patch.updatedAt,
      }).where(eq(vendorRateCards.id, id)).returning();
      if (!saved) throw new Error(`Rate card #${id} changed during Apply.`);
      return asTidyCard(saved);
    },
    async deleteCard(id) {
      const [deleted] = await tx.delete(vendorRateCards).where(eq(vendorRateCards.id, id)).returning();
      if (!deleted) throw new Error(`Rate card #${id} changed during Apply.`);
      return asTidyCard(deleted);
    },
    async addAudit({ transactionId, oldValues, newValues, reason, actor }) {
      await tx.insert(auditLogs).values({
        module: "vendor_rate_card",
        transactionId,
        action: "vendor_rate_card",
        userId: actor.id,
        userName: actor.fullName,
        userRole: "owner",
        oldValues: oldValues as any,
        newValues: newValues as any,
        reason,
      });
    },
  };
}

export function registerVendorRateCardTidyRoutes(app: Express) {
  app.get("/api/vendor-rate-cards/tidy-preview", async (req, res) => {
    if (!ownerOnly(req, res)) return;
    try {
      const snapshot = await loadSnapshot(db);
      const [aliases, bills, lines] = await Promise.all([
        db.select({ alias: vendorAliases.alias, canonicalName: vendorAliases.canonicalName }).from(vendorAliases),
        db.select({
          id: vendorBills.id, billNo: vendorBills.billNo, billDate: vendorBills.billDate,
          vendorName: vendorBills.vendorName, vendorId: vendorBills.vendorId,
          isDeleted: vendorBills.isDeleted, isCancelled: vendorBills.isCancelled,
        }).from(vendorBills),
        db.select({
          billId: vendorBillItems.billId, description: vendorBillItems.description,
          category: vendorBillItems.category, unit: vendorBillItems.unit, rate: vendorBillItems.rate,
        }).from(vendorBillItems),
      ]);
      const vendorNamesById = new Map<number, string[]>();
      for (const vendor of snapshot.vendors) vendorNamesById.set(vendor.id, [vendor.name]);
      for (const alias of aliases) {
        const match = snapshot.vendors.find(v => nameKey(v.name) === nameKey(alias.canonicalName));
        if (match) vendorNamesById.get(match.id)?.push(alias.alias);
      }
      const possibleMatches = Object.fromEntries(snapshot.cards.map(card => [
        card.id,
        findPossibleRateCardBillMatch(
          card,
          card.vendorId == null ? [card.vendorName] : vendorNamesById.get(Number(card.vendorId)) ?? [],
          bills,
          lines,
        ),
      ]));
      const groups = buildRateCardTidyGroups(snapshot.cards, snapshot.vendors);
      const unlinked = buildUnlinkedRateCardGroups(snapshot.cards);
      res.json({
        previewVersion: rateCardTidyVersion(snapshot),
        sameRateGroups: groups.filter(group => group.sameRate),
        conflictingGroups: groups.filter(group => !group.sameRate),
        unlinkedGroups: unlinked,
        possibleMatches,
      });
    } catch (error) {
      console.error("Error preparing vendor rate-card tidy preview:", error);
      res.status(500).json({ message: "Failed to prepare rate-card preview" });
    }
  });

  app.post("/api/vendor-rate-cards/tidy-apply", async (req, res) => {
    if (!ownerOnly(req, res)) return;
    const parsed = applySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues.map(issue => issue.message).join("; ") });
    try {
      const result = await db.transaction(async tx => applyRateCardTidyPlan(
        makeRepository(tx),
        parsed.data,
        { id: Number(req.authUser!.id), fullName: req.authUser!.fullName },
      ));
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to apply rate-card tidy.";
      const status = /changed after preview|no longer in|changed during Apply/.test(message) ? 409 : 400;
      res.status(status).json({ message });
    }
  });

  app.post("/api/vendor-rate-cards/link-name", async (req, res) => {
    if (!ownerOnly(req, res)) return;
    const parsed = linkSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues.map(issue => issue.message).join("; ") });
    try {
      const result = await db.transaction(async tx => {
        const [vendor] = await tx.select({ id: vendors.id, name: vendors.name, isActive: vendors.isActive })
          .from(vendors).where(eq(vendors.id, parsed.data.vendorId)).limit(1);
        if (!vendor?.isActive) return { missingVendor: true as const };
        const rows = await tx.select().from(vendorRateCards)
          .where(and(
            isNull(vendorRateCards.vendorId),
            sql`UPPER(regexp_replace(TRIM(${vendorRateCards.vendorName}), '[[:space:]]+', ' ', 'g')) = ${parsed.data.nameKey}`,
          ))
          .orderBy(vendorRateCards.id)
          .for("update");
        if (!rows.length) return { noRows: true as const };
        const ids = rows.map(row => row.id);
        const updated = await tx.update(vendorRateCards).set({ vendorId: vendor.id, updatedAt: new Date() })
          .where(and(inArray(vendorRateCards.id, ids), isNull(vendorRateCards.vendorId))).returning();
        if (updated.length !== rows.length) throw new Error("The unlinked group changed. Refresh and try again.");
        const updatedById = new Map(updated.map(row => [row.id, row]));
        for (const oldRow of rows) {
          await tx.insert(auditLogs).values({
            module: "vendor_rate_card",
            transactionId: oldRow.id,
            action: "vendor_rate_card",
            userId: req.authUser!.id,
            userName: req.authUser!.fullName,
            userRole: "owner",
            oldValues: oldRow as any,
            newValues: {
              operation: "link_unlinked_rate_card",
              linkedVendor: { id: vendor.id, name: vendor.name },
              keptSavedName: oldRow.vendorName,
              updatedRow: updatedById.get(oldRow.id),
            } as any,
            reason: parsed.data.reason,
          });
        }
        return { linkedRows: updated.length, vendorId: vendor.id, vendorName: vendor.name };
      });
      if ("missingVendor" in result) return res.status(404).json({ message: "Choose an active Vendor Master record." });
      if ("noRows" in result) return res.status(409).json({ message: "No unlinked rate cards remain for this saved name." });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to link rate cards.";
      res.status(/changed/.test(message) ? 409 : 500).json({ message });
    }
  });
}

