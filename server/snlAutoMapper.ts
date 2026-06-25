/**
 * SNL Auto-Mapper
 * Automatically scores and maps BOQ items against the SNL (Standard Norms Library).
 *
 * Score breakdown (0–1):
 *   0.40 — item code / chapter prefix match
 *   0.30 — work category exact match (or inferred when BOQ has none)
 *   0.10 — description keyword (Jaccard) overlap
 *   0.15 — shortLabel keyword coverage (fraction of SNL shortLabel words present in BOQ)
 *   0.05 — unit normalization match
 *   +0.40 trifecta bonus — fires when category matches AND shortLabel coverage > 0.40 AND unit matches
 *          This bonus pushes items with strong category+label alignment into the confident-mapped tier
 *          even when BOQ item codes are absent.
 *
 * Thresholds:
 *   >= 0.80 → mapped   (auto-apply recipes)
 *   0.35–0.79 → needs_review (save candidate mapping only)
 *   < 0.35  → unmapped
 */

import { db } from "./db";
import { boqItems, snlItems, snlBoqMappings } from "@shared/schema";
import { eq, and, inArray, notInArray } from "drizzle-orm";
import { storage } from "./storage";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the","a","an","and","or","in","of","for","to","with","by","on","at","from",
  "including","including","using","shall","be","is","as","per","up","all","any",
  "each","etc","such","other","where","which","this","that","cm","mm","m","km",
  "nos","no","sqm","cum","mt","kg","lm","rm","rmt","rmt","ls","hr","hrs",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function normalizeUnit(u: string): string {
  return u.trim().toUpperCase()
    .replace(/^\d+\s+/, "")   // strip leading quantity prefix: "1 Cum" → "CUM", "2 SQM" → "SQM"
    .replace(/\bSQM\b/, "SQM")
    .replace(/\bCUM\b|M3\b/, "CUM")
    .replace(/\bMT\b|TON(S)?\b|TONNE(S)?\b/, "MT")
    .replace(/\bRM\b|RMT\b|LM\b/, "LM")
    .replace(/\bNOS\b|NO\b|NO\.\b|NUMBERS?\b/, "NOS");
}

/**
 * Extract the chapter number from an item code (e.g. "5.4.1" → "5", "3-04" → "3")
 */
function chapterOf(code: string | null | undefined): string | null {
  if (!code) return null;
  const m = code.trim().match(/^(\d+)[.\-_]/);
  if (m) return m[1];
  const d = code.trim().match(/^(\d+)$/);
  return d ? d[1] : null;
}

/**
 * Infer a work category from the BOQ description when the BOQ item has no workCategory set.
 * Returns null if no inference can be made.
 */
function inferWorkCategory(desc: string): string | null {
  const d = desc.toLowerCase();
  // Codes MUST match shared/boqWorkCategories.ts + the SNL seed workCategory values.
  // Order matters: most specific first.
  if (/\b(clear|grub|dismantl|demolish|scarif|site.?clear|vegetation)\b/.test(d)) return "SITE_CLEARANCE";
  if (/\b(excavat|earthwork|earthen|embankment|subgrade|sub.?grade|borrow.?pit|cutting|formation)\b/.test(d)) return "EARTHWORK";
  if (/\b(gsb|wmm|wet.?mix|granular|sub.?base|base.?course|crusher.?run|wbm|water.?bound)\b/.test(d)) return "SUBBASE_BASE";
  if (/\b(bituminous|bitumen|asphalt|\bdbm\b|\bbc\b|\bsdbc\b|wearing.?course|binder.?course|prime.?coat|tack.?coat|seal.?coat|mastic)\b/.test(d)) return "BITUMINOUS";
  if (/\b(concrete|rcc|pcc|cement.?concrete|reinforced|pavement.?quality|\bpqc\b|\bdlc\b)\b/.test(d)) return "CONCRETE";
  if (/\b(median|paved.?shoulder|shoulder)\b/.test(d)) return "SHOULDERS_MEDIANS";
  if (/\b(kerb|curb|road.?marking|\bsign\b|crash.?barrier|guard.?rail|delineator|road.?stud)\b/.test(d)) return "ROAD_FURNITURE";
  if (/\b(drain|catch.?pit|chute|kerb.?channel)\b/.test(d)) return "DRAINAGE";
  if (/\b(culvert|hume.?pipe|\bpipe\b)\b/.test(d)) return "CROSS_DRAINAGE";
  if (/\b(bridge|retaining.?wall|abutment|\bpier\b|deck.?slab|girder)\b/.test(d)) return "MAJOR_BRIDGES";
  return null;
}

// ─── Scorer (IDF-weighted semantic matching) ───────────────────────────────────

interface ScoredCandidate {
  snlItemId: number;
  snlItemCode: string;
  score: number;
}

// Tokens for matching: words >2 chars, minus stop-words and pure numbers.
function richTokens(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
}

// Inverse-document-frequency over the SNL corpus: generic words (high doc-freq) get a
// near-zero weight automatically; distinctive technical terms get a high weight.
function buildIdf(docs: string[][]): Map<string, number> {
  const N = docs.length || 1;
  const df = new Map<string, number>();
  for (const d of docs) for (const w of new Set(d)) df.set(w, (df.get(w) ?? 0) + 1);
  const idf = new Map<string, number>();
  for (const [w, c] of df) idf.set(w, Math.log(N / (1 + c)));
  return idf;
}

// IDF-weighted cosine similarity between two token bags.
function weightedCosine(a: string[], b: string[], idf: Map<string, number>): number {
  const wa = new Map<string, number>();
  const wb = new Map<string, number>();
  for (const t of a) { const w = idf.get(t) ?? 0; if (w > 0) wa.set(t, (wa.get(t) ?? 0) + w); }
  for (const t of b) { const w = idf.get(t) ?? 0; if (w > 0) wb.set(t, (wb.get(t) ?? 0) + w); }
  let dot = 0;
  for (const [t, va] of wa) { const vb = wb.get(t); if (vb) dot += va * vb; }
  let na = 0; for (const v of wa.values()) na += v * v;
  let nb = 0; for (const v of wb.values()) nb += v * v;
  const den = Math.sqrt(na) * Math.sqrt(nb);
  return den === 0 ? 0 : dot / den;
}

function unitsCompatible(a: string, b: string): boolean {
  return normalizeUnit(a || "") === normalizeUnit(b || "");
}

// ── Decision thresholds (calibrated on the MoRTH SDB corpus; tune after first run) ──
const CONFIDENT_FLOOR = 0.10;       // top similarity must clear this to auto-apply a recipe
const CONFIDENT_MARGIN = 1.30;      // …and be ≥30% ahead of the 2nd-best candidate
const SUGGEST_FLOOR = 0.04;         // below confident but worth offering for human review
const UNIT_MISMATCH_PENALTY = 0.30; // multiply score when units differ (near-veto)

// (Legacy weighted scorer removed — replaced by IDF-weighted cosine + unit/margin gate.)

// ─── Main mapper ──────────────────────────────────────────────────────────────

/**
 * Attempt auto-mapping for a list of BOQ item IDs.
 * Fires DB updates and (for confident matches) applies recipes.
 */
export async function autoMapBoqItems(boqItemIds: number[]): Promise<void> {
  if (boqItemIds.length === 0) return;

  // Fetch BOQ items
  const boqRows = await db
    .select({
      id: boqItems.id,
      itemCode: boqItems.itemCode,
      snlCode: boqItems.snlCode,
      description: boqItems.description,
      unit: boqItems.unit,
      workCategory: boqItems.workCategory,
    })
    .from(boqItems)
    .where(inArray(boqItems.id, boqItemIds));

  if (boqRows.length === 0) return;

  // Fetch all active SNL items (small enough to fit in memory)
  const snlRows = await db
    .select({
      id: snlItems.id,
      itemCode: snlItems.itemCode,
      description: snlItems.description,
      shortLabel: snlItems.shortLabel,
      unit: snlItems.unit,
      workCategory: snlItems.workCategory,
    })
    .from(snlItems)
    .where(eq(snlItems.isActive, true));

  if (snlRows.length === 0) {
    // No SNL data loaded — leave status as unmapped
    return;
  }

  // Precompute distinctive-token bags + IDF over the whole SNL corpus (once per run).
  const snlTokenMap = new Map<number, string[]>(
    snlRows.map(s => [s.id, richTokens(`${s.description ?? ""} ${s.shortLabel ?? ""}`)])
  );
  const idf = buildIdf([...snlTokenMap.values()]);

  // Preserve manual mappings: never overwrite or unmap user-confirmed items.
  // Also RESTORES their "mapped" status if a prior remap/reset cleared it.
  const manualRows = await db
    .select({ boqItemId: snlBoqMappings.boqItemId })
    .from(snlBoqMappings)
    .where(and(inArray(snlBoqMappings.boqItemId, boqItemIds), eq(snlBoqMappings.isAutoMapped, false)));
  const manualSet = new Set(manualRows.map((r) => r.boqItemId));

  for (const boqRow of boqRows) {
    if (manualSet.has(boqRow.id)) {
      await db
        .update(boqItems)
        .set({ mappingStatus: "mapped" })
        .where(eq(boqItems.id, boqRow.id));
      continue;
    }
    try {
      // ── 0. Deterministic SNL-code match (highest priority) ──────────────
      // Only trust an EXPLICIT SNL/SDB norm code here. The BOQ item_code is a tender bill
      // number (e.g. "5.10") that collides with unrelated MoRTH SDB codes — using it mapped
      // a filter (Cum) item to premix surfacing (SQM). Bill numbers go to semantic scoring.
      const explicitCode = (boqRow.snlCode ?? "").trim().toLowerCase();
      if (explicitCode) {
        const directSnl = snlRows.find(
          (s) => s.itemCode.trim().toLowerCase() === explicitCode,
        );
        if (directSnl && unitsCompatible(boqRow.unit, directSnl.unit)) {
          await db
            .insert(snlBoqMappings)
            .values({
              boqItemId: boqRow.id,
              snlItemId: directSnl.id,
              projectCategory: "MEDIUM",
              gradingVariant: null,
              mappedBy: "auto",
              isAutoMapped: true,
              confidenceScore: 1,
              notes: `Mapped by SNL code "${directSnl.itemCode}"`,
            })
            .onConflictDoUpdate({
              target: snlBoqMappings.boqItemId,
              set: {
                snlItemId: directSnl.id,
                isAutoMapped: true,
                confidenceScore: 1,
                mappedAt: new Date(),
                notes: `Mapped by SNL code "${directSnl.itemCode}"`,
              },
            });

          let recipesApplied = false;
          try {
            await storage.applySnlMappingToRecipes(boqRow.id, directSnl.id, "MEDIUM", null, "auto");
            recipesApplied = true;
          } catch (recipeErr) {
            console.error(`[autoMapper] code-match recipes failed for boqItemId=${boqRow.id}:`, recipeErr);
          }

          await db
            .update(boqItems)
            .set({ mappingStatus: recipesApplied ? "mapped" : "needs_review" })
            .where(eq(boqItems.id, boqRow.id));
          continue; // done — skip fuzzy scoring for this row
        }
      }

      // ── Semantic scoring: IDF-weighted cosine over the FULL description, unit-gated ──
      const boqText = richTokens(`${boqRow.description ?? ""} ${boqRow.workCategory ?? ""}`);
      const scored: ScoredCandidate[] = snlRows
        .map(snl => {
          const sim = weightedCosine(boqText, snlTokenMap.get(snl.id) ?? [], idf);
          const adj = unitsCompatible(boqRow.unit, snl.unit) ? sim : sim * UNIT_MISMATCH_PENALTY;
          return { snlItemId: snl.id, snlItemCode: snl.itemCode, score: adj };
        })
        .sort((a, b) => b.score - a.score);

      const top = scored[0];
      const second = scored[1];

      // No usable evidence → unmapped, and flush any stale auto recipe.
      if (!top || top.score < SUGGEST_FLOOR) {
        await storage.clearBoqItemRecipes(boqRow.id);
        await db.update(boqItems).set({ mappingStatus: "unmapped" }).where(eq(boqItems.id, boqRow.id));
        continue;
      }

      const topSnl = snlRows.find(s => s.id === top.snlItemId)!;
      const unitOk = unitsCompatible(boqRow.unit, topSnl.unit);
      const clearlyAhead = !second || second.score <= 0 || top.score >= second.score * CONFIDENT_MARGIN;
      const isConfident = unitOk && top.score >= CONFIDENT_FLOOR && clearlyAhead;

      const noteTxt = isConfident
        ? `Auto-mapped (sim ${top.score.toFixed(3)})`
        : `Suggested (sim ${top.score.toFixed(3)}) — review needed`;

      // Always (re)write the mapping row pointing at the best candidate.
      await db
        .insert(snlBoqMappings)
        .values({
          boqItemId: boqRow.id,
          snlItemId: top.snlItemId,
          projectCategory: "MEDIUM",
          gradingVariant: null,
          mappedBy: "auto",
          isAutoMapped: true,
          confidenceScore: top.score,
          notes: noteTxt,
        })
        .onConflictDoUpdate({
          target: snlBoqMappings.boqItemId,
          set: {
            snlItemId: top.snlItemId,
            isAutoMapped: true,
            confidenceScore: top.score,
            mappedAt: new Date(),
            notes: noteTxt,
          },
        });

      if (isConfident) {
        // Strong, unambiguous, unit-matched → apply the recipe.
        let recipesApplied = false;
        try {
          await storage.applySnlMappingToRecipes(boqRow.id, top.snlItemId, "MEDIUM", null, "auto");
          recipesApplied = true;
        } catch (recipeErr) {
          console.error(`[autoMapper] applySnlMappingToRecipes failed for boqItemId=${boqRow.id}:`, recipeErr);
        }
        await db
          .update(boqItems)
          .set({ mappingStatus: recipesApplied ? "mapped" : "needs_review" })
          .where(eq(boqItems.id, boqRow.id));
      } else {
        // Ambiguous or unit-mismatched → suggest only, DO NOT apply a recipe, and flush
        // any stale recipe so the BOM stops showing wrong materials.
        await storage.clearBoqItemRecipes(boqRow.id);
        await db
          .update(boqItems)
          .set({ mappingStatus: "needs_review" })
          .where(eq(boqItems.id, boqRow.id));
      }
    } catch (err) {
      console.error(`[autoMapper] Failed for boqItemId=${boqRow.id}:`, err);
    }
  }
}

/**
 * Re-map ALL unmapped / needs_review BOQ items across every project.
 * Called at startup after SNL seeding so existing items benefit from updated
 * SNL data and scorer logic without requiring a manual re-import.
 */
export async function autoMapAllUnmappedItems(): Promise<{ remapped: number }> {
  const rows = await db
    .select({ id: boqItems.id })
    .from(boqItems)
    .where(inArray(boqItems.mappingStatus, ["unmapped", "needs_review"]));
  if (rows.length === 0) return { remapped: 0 };
  const ids = rows.map(r => r.id);
  await autoMapBoqItems(ids);
  return { remapped: ids.length };
}

/**
 * Re-map all items in a BOQ project (reset status first, then auto-map).
 */
export async function remapBoqProject(boqProjectId: number): Promise<{ remapped: number }> {
  const rows = await db
    .select({ id: boqItems.id })
    .from(boqItems)
    .where(eq(boqItems.boqProjectId, boqProjectId));

  const ids = rows.map(r => r.id);
  if (ids.length === 0) return { remapped: 0 };

  // Reset to unmapped first — but NEVER touch manually-mapped items.
  const manualIds = (await db
    .select({ id: snlBoqMappings.boqItemId })
    .from(snlBoqMappings)
    .innerJoin(boqItems, eq(snlBoqMappings.boqItemId, boqItems.id))
    .where(and(eq(boqItems.boqProjectId, boqProjectId), eq(snlBoqMappings.isAutoMapped, false))))
    .map((r) => r.id);
  await db
    .update(boqItems)
    .set({ mappingStatus: "unmapped" })
    .where(manualIds.length > 0
      ? and(eq(boqItems.boqProjectId, boqProjectId), notInArray(boqItems.id, manualIds))
      : eq(boqItems.boqProjectId, boqProjectId));

  await autoMapBoqItems(ids);
  return { remapped: ids.length };
}
