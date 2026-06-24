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
import { eq, and, inArray } from "drizzle-orm";
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

// ─── Scorer ───────────────────────────────────────────────────────────────────

interface ScoredCandidate {
  snlItemId: number;
  snlItemCode: string;
  score: number;
}

function scoreCandidate(
  boq: { itemCode: string | null; description: string; unit: string; workCategory: string | null },
  snl: { id: number; itemCode: string; description: string; shortLabel: string | null; unit: string; workCategory: string }
): number {
  let score = 0;

  // ── 1. Item code / chapter match (weight 0.40) ──
  const boqCode = (boq.itemCode ?? "").trim().toLowerCase();
  const snlCode = snl.itemCode.trim().toLowerCase();

  if (boqCode && snlCode) {
    if (boqCode === snlCode) {
      score += 0.40; // exact
    } else {
      const boqChapter = chapterOf(boq.itemCode);
      const snlChapter = chapterOf(snl.itemCode);
      if (boqChapter && snlChapter && boqChapter === snlChapter) {
        score += 0.20; // same chapter
      }
    }
  }

  // ── 2. Work category match (weight 0.30) ──
  // Use the BOQ's explicit category first; fall back to inference from its description.
  const effectiveBoqCategory = boq.workCategory ?? inferWorkCategory(boq.description);
  const categoryMatches = !!effectiveBoqCategory && effectiveBoqCategory === snl.workCategory;
  if (categoryMatches) {
    score += 0.30;
  }

  // ── 3. Description keyword overlap (weight 0.10, reduced to make room for shortLabel) ──
  const boqTokens = tokenize(boq.description);
  const snlDescTokens = tokenize(snl.description);
  score += 0.10 * jaccard(boqTokens, snlDescTokens);

  // ── 4. ShortLabel keyword coverage (weight 0.15) ──
  // Measures what fraction of the SNL shortLabel's distinctive keywords appear in the BOQ description.
  // More focused than full Jaccard: shortLabels are intentionally seeded with BOQ-typical vocabulary.
  const snlLabelTokens = tokenize(snl.shortLabel ?? "");
  let shortLabelCoverage = 0;
  if (snlLabelTokens.size > 0) {
    let hits = 0;
    for (const t of snlLabelTokens) if (boqTokens.has(t)) hits++;
    shortLabelCoverage = hits / snlLabelTokens.size;
    score += 0.15 * shortLabelCoverage;
  }

  // ── 5. Unit match (weight 0.05) ──
  const unitMatches = normalizeUnit(boq.unit) === normalizeUnit(snl.unit);
  if (unitMatches) {
    score += 0.05;
  }

  // ── 6. Trifecta bonus (+0.40) ──
  // Fires when all three soft signals align: category, shortLabel keyword presence, and unit.
  // This pushes items with strong non-code evidence into the confident-mapped tier (≥ 0.80)
  // even when BOQ item codes are absent — designed specifically for earthwork-style items
  // where MoRTH SNL language differs from typical tender BOQ language.
  if (categoryMatches && shortLabelCoverage > 0.40 && unitMatches) {
    score += 0.40;
  }

  return Math.min(score, 1);
}

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

  for (const boqRow of boqRows) {
    try {
      // ── 0. Deterministic SNL-code match (highest priority) ──────────────
      // Try the explicit SNL code first, then fall back to the BOQ item code.
      // If the BOQ row carries an explicit SDB/SNL norm code, map straight to
      // the SNL item with that exact item_code. No fuzzy description parsing.
      const explicitCode = (boqRow.snlCode ?? "").trim().toLowerCase()
        || (boqRow.itemCode ?? "").trim().toLowerCase();
      if (explicitCode) {
        const directSnl = snlRows.find(
          (s) => s.itemCode.trim().toLowerCase() === explicitCode,
        );
        if (directSnl) {
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

      // Determine effective category — explicit or inferred from description keywords.
      // This lets us narrow the candidate pool even when BOQ items lack a workCategory field.
      const effectiveCat = boqRow.workCategory ?? inferWorkCategory(boqRow.description);

      // Score all SNL candidates in the same work category first (faster, more relevant)
      const sameCatCandidates = effectiveCat
        ? snlRows.filter(s => s.workCategory === effectiveCat)
        : snlRows;

      const sameCatSorted: ScoredCandidate[] = (sameCatCandidates.length > 0 ? sameCatCandidates : snlRows)
        .map(snl => ({
          snlItemId: snl.id,
          snlItemCode: snl.itemCode,
          score: scoreCandidate(boqRow, snl),
        }))
        .sort((a, b) => b.score - a.score);

      // If the best same-category match is below 0.35, try cross-category search
      // (e.g. SITE_CLEARANCE scarifying may match EARTHWORK SNL items on keywords)
      let candidates = sameCatSorted;
      if (effectiveCat && sameCatCandidates.length > 0 && (!sameCatSorted[0] || sameCatSorted[0].score < 0.35)) {
        const crossCatCandidates = snlRows
          .filter(s => s.workCategory !== effectiveCat)
          .map(snl => ({
            snlItemId: snl.id,
            snlItemCode: snl.itemCode,
            score: scoreCandidate(boqRow, snl) * 0.80, // penalty for category mismatch
          }))
          .sort((a, b) => b.score - a.score);
        // Merge: same-cat candidates go first if any scored >= 0.30, else cross-cat may win
        candidates = [...sameCatSorted, ...crossCatCandidates].sort((a, b) => b.score - a.score);
      }

      const top = candidates[0];

      if (!top || top.score < 0.35) {
        // No match
        await db
          .update(boqItems)
          .set({ mappingStatus: "unmapped" })
          .where(eq(boqItems.id, boqRow.id));
        continue;
      }

      if (top.score >= 0.80) {
        // Confident match — save mapping + apply recipes
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
            notes: `Auto-mapped (score ${top.score.toFixed(2)})`,
          })
          .onConflictDoUpdate({
            target: snlBoqMappings.boqItemId,
            set: {
              snlItemId: top.snlItemId,
              isAutoMapped: true,
              confidenceScore: top.score,
              mappedAt: new Date(),
              notes: `Auto-mapped (score ${top.score.toFixed(2)})`,
            },
          });

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
        // Candidate match — save as suggestion only, don't apply recipes
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
            notes: `Suggested (score ${top.score.toFixed(2)}) — review needed`,
          })
          .onConflictDoUpdate({
            target: snlBoqMappings.boqItemId,
            set: {
              snlItemId: top.snlItemId,
              isAutoMapped: true,
              confidenceScore: top.score,
              mappedAt: new Date(),
              notes: `Suggested (score ${top.score.toFixed(2)}) — review needed`,
            },
          });

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

  // Reset all to unmapped first
  await db
    .update(boqItems)
    .set({ mappingStatus: "unmapped" })
    .where(eq(boqItems.boqProjectId, boqProjectId));

  await autoMapBoqItems(ids);
  return { remapped: ids.length };
}
