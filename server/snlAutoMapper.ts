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

// ── Decision thresholds ────────────────────────────────────────────────────────
const CONFIDENT_FLOOR = 0.10;       // top similarity must clear this to auto-apply a recipe
const CONFIDENT_MARGIN = 1.30;      // …and be ≥30% ahead of the 2nd-best candidate
const SUGGEST_FLOOR = 0.50;         // below 50% → unmapped / search required (not needs_review)
const UNIT_MISMATCH_PENALTY = 0.30; // multiply score when units differ (near-veto)

// ── Sector compatibility ───────────────────────────────────────────────────────
// SNL items from these sectors are considered compatible with road/structure BOQ items.
// Items from IRRIGATION, BUILDING, ELECTRICAL, GATES_HOIST, WATER sector are cross-sector
// and incur a near-veto penalty — they should never auto-confirm for a road BOQ project.
const ROAD_COMPATIBLE_SECTORS = new Set(["ROAD", "STRUCTURE", "STRUCTURES", "BRIDGE", "BRIDGES"]);

/**
 * Returns a penalty multiplier for cross-sector matches.
 * 1.0 = compatible (no penalty), 0.05 = near-veto for unrelated sectors.
 */
function sectorPenaltyFactor(snlSector: string | null | undefined): number {
  if (!snlSector) return 1.0; // unknown sector → no penalty (assume compatible)
  const s = snlSector.trim().toUpperCase();
  return ROAD_COMPATIBLE_SECTORS.has(s) ? 1.0 : 0.05;
}

// Work categories that participate in the fuzzy-scoring auto-mapper.
// Expanded from original 7 to include road furniture, drainage, and clearance items
// so kerb, crash barrier, drainage, culvert items are scored — not blanket-unmapped.
const MAJOR_AUTOMAP_CATEGORIES = new Set<string>([
  "EARTHWORK",
  "SITE_CLEARANCE",
  "SHOULDERS_MEDIANS",
  "SUBBASE_BASE",
  "BITUMINOUS",
  "CONCRETE",
  "ROAD_FURNITURE",
  "DRAINAGE",
  "CROSS_DRAINAGE",
  "MAJOR_BRIDGES",
]);

// ─── Rule-based pre-matcher ────────────────────────────────────────────────────

/**
 * Classify a BOQ item into a canonical road-BOQ tag using deterministic
 * description patterns. Returns null when no reliable rule applies.
 * Takes priority over fuzzy scoring for standard road-construction items.
 */
function classifyBoqItemForSnl(description: string): string | null {
  const d = String(description ?? "").toLowerCase();

  if (/\bgsb\b|granular\s*sub[-\s]*base/.test(d)) return "GSB";
  if (/\bwmm\b|wet\s*mix\s*macadam|wet\s*mix/.test(d)) return "WMM";
  if (/\bdbm\b|dense\s*bituminous\s*macadam/.test(d)) return "DBM";
  if (/\bsdbc\b|semi\s*dense/.test(d)) return "SDBC";
  if (/\bbc\b|bituminous\s*concrete/.test(d)) return "BC";
  if (/\bbm\b|bituminous\s*macadam/.test(d)) return "BM";
  if (/prime\s*coat/.test(d)) return "PRIME_COAT";
  if (/tack\s*coat/.test(d)) return "TACK_COAT";

  // Concrete — detect grade first, then bare type
  const gradeM = d.match(/\bm\s*([0-9]{2,3})\b/);
  if (/\bpcc\b|plain\s*cement\s*concrete/.test(d)) return gradeM ? `PCC_M${gradeM[1]}` : "PCC";
  if (/\brcc\b|reinforced\s*cement\s*concrete/.test(d)) return gradeM ? `RCC_M${gradeM[1]}` : "RCC";

  if (/\bhysd\b|\btmt\b|\breinforcement\b|reinforcing\s*steel|steel\s*reinforcement/.test(d)) return "REINFORCEMENT_STEEL";
  if (/binding\s*wire/.test(d)) return "BINDING_WIRE";
  if (/stone\s*pitching|stone\s*spalls|\bapron\b|\bboulder\b/.test(d)) return "STONE_PITCHING";
  if (/thermoplastic|road\s*marking/.test(d)) return "THERMOPLASTIC_MARKING";
  if (/kilometre\s*stone|boundary\s*stone|hectometre/.test(d)) return "ROAD_STONES";
  if (/sign\s*board|traffic\s*sign|cautionary|mandatory|informatory/.test(d)) return "SIGNAGE";
  if (/crash\s*barrier|metal\s*beam/.test(d)) return "CRASH_BARRIER";
  if (/expansion\s*joint|strip\s*seal|joint\s*sealant/.test(d)) return "JOINTS_SEALANTS";
  if (/\bbearing\b|elastomeric/.test(d)) return "BEARINGS";
  if (/\bpipe\b|\bculvert\b|\bnp3\b|\bnp4\b|\bhdpe\b/.test(d)) return "PIPE_CULVERT";

  // ── Drainage sub-types (specific rules first, generic last) ─────────────────
  if (/energy\s*dissipat/.test(d)) return "ENERGY_DISSIPATION";
  if (/chute\s*drain/.test(d)) return "CHUTE_DRAIN";
  if (/catch\s*pit|catch\s*basin|catch\s*water/.test(d)) return "CATCH_PIT";
  if (/kerb\s*(drain|channel|gutter)/.test(d)) return "KERB_DRAIN";
  if (/weep\s*hole/.test(d)) return "WEEP_HOLE";
  if (/filter\s*media|filter\s*drain|french\s*drain/.test(d)) return "FILTER_MEDIA";
  if (/\bdrain\b|open\s*drain|roadside\s*drain|side\s*drain|v[-\s]*drain/.test(d)) return "OPEN_DRAIN";

  // ── Retaining wall / structural earthwork ───────────────────────────────────
  if (/retaining\s*wall|toe\s*wall|breast\s*wall/.test(d)) return "RETAINING_WALL";

  return null;
}

// Tag → search keywords for finding the best SNL row
const RULE_TAG_KEYWORDS: Record<string, string[]> = {
  GSB:                  ["granular sub-base", "gsb", "granular subbase"],
  WMM:                  ["wet mix macadam", "wmm", "wet mix"],
  DBM:                  ["dense bituminous macadam", "dbm"],
  SDBC:                 ["semi dense bituminous", "sdbc"],
  BC:                   ["bituminous concrete"],
  BM:                   ["bituminous macadam"],
  PRIME_COAT:           ["prime coat", "priming"],
  TACK_COAT:            ["tack coat"],
  PCC:                  ["plain cement concrete", "pcc"],
  RCC:                  ["reinforced cement concrete", "rcc"],
  REINFORCEMENT_STEEL:  ["hysd", "tmt", "reinforcement", "reinforcing steel"],
  BINDING_WIRE:         ["binding wire"],
  FILTER_MEDIA:         ["filter media"],
  STONE_PITCHING:       ["stone pitching", "stone spalls", "boulder pitching"],
  THERMOPLASTIC_MARKING:["thermoplastic", "road marking"],
  ROAD_STONES:          ["kilometre stone", "boundary stone", "hectometre stone"],
  SIGNAGE:              ["sign board", "traffic sign"],
  CRASH_BARRIER:        ["crash barrier", "metal beam"],
  JOINTS_SEALANTS:      ["expansion joint", "joint sealant"],
  BEARINGS:             ["elastomeric bearing", "bearing"],
  PIPE_CULVERT:         ["hume pipe", "pipe culvert", "np3", "np4", "hdpe pipe"],
  // Drainage sub-types
  ENERGY_DISSIPATION:   ["energy dissipation", "energy dissipator", "dissipation chamber"],
  CHUTE_DRAIN:          ["chute drain", "chute drain lining", "chute"],
  CATCH_PIT:            ["catch pit", "catch basin", "catch water pit"],
  KERB_DRAIN:           ["kerb drain", "kerb channel", "kerb gutter", "kerb and channel"],
  WEEP_HOLE:            ["weep hole"],
  OPEN_DRAIN:           ["open drain", "roadside drain", "side drain", "v drain", "drain"],
  RETAINING_WALL:       ["retaining wall", "toe wall", "breast wall"],
};

/**
 * Find the best SNL row for a rule-classification tag by keyword search.
 * Grade-specific tags (PCC_M20, RCC_M25) get an extra grade match score.
 * Returns snlItemId + confidence=0.82 or null if no keyword match in corpus.
 */
function ruleMatchSnl(
  tag: string,
  snlRows: Array<{ id: number; description: string; shortLabel: string | null; unit: string }>,
): { snlItemId: number; confidence: number } | null {
  const baseTag = tag.replace(/_M\d+$/, "");
  const keywords = RULE_TAG_KEYWORDS[baseTag] ?? RULE_TAG_KEYWORDS[tag];
  if (!keywords || keywords.length === 0) return null;

  const gradeMatch = tag.match(/_M(\d+)$/);
  const grade = gradeMatch ? `m${gradeMatch[1]}` : null;

  let bestId: number | null = null;
  let bestScore = 0;

  for (const snl of snlRows) {
    const haystack = `${snl.description ?? ""} ${snl.shortLabel ?? ""}`.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (haystack.includes(kw)) score += 1;
    }
    if (score === 0) continue;
    if (grade && haystack.includes(grade)) score += 2;
    else if (grade) score -= 0.5; // mild penalty for wrong grade match

    if (score > bestScore) { bestScore = score; bestId = snl.id; }
  }

  return bestId === null ? null : { snlItemId: bestId, confidence: 0.82 };
}

/**
 * Normalise a BOQ description to a stable deduplication key.
 * Strips numbers, collapses whitespace, appends unit.
 */
function normaliseBoqDescriptionKey(desc: string, unit?: string | null): string {
  return `${String(desc ?? "")
    .toLowerCase()
    .replace(/[0-9]+(\.[0-9]+)?/g, "#")
    .replace(/\s+/g, " ")
    .trim()}|${String(unit ?? "").toLowerCase()}`;
}

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
      boqProjectId: boqItems.boqProjectId,
      itemCode: boqItems.itemCode,
      snlCode: boqItems.snlCode,
      description: boqItems.description,
      unit: boqItems.unit,
      workCategory: boqItems.workCategory,
    })
    .from(boqItems)
    .where(inArray(boqItems.id, boqItemIds));

  if (boqRows.length === 0) return;

  // Fetch all active SNL items (small enough to fit in memory).
  // sector is used to apply a near-veto penalty for cross-sector matches
  // (e.g. IRRIGATION items should not be suggested for road/structure BOQ).
  const snlRows = await db
    .select({
      id: snlItems.id,
      itemCode: snlItems.itemCode,
      description: snlItems.description,
      shortLabel: snlItems.shortLabel,
      unit: snlItems.unit,
      workCategory: snlItems.workCategory,
      sector: snlItems.sector,
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
      // ── Rule classification (used by both scope guard and rule-match) ─────
      const ruleTag = classifyBoqItemForSnl(boqRow.description);

      // No hard scope guard: items that don't match a rule tag still proceed to
      // fuzzy scoring. Only if BOTH rule and fuzzy produce nothing will the item
      // fall through to the "no usable evidence → unmapped" path in the fuzzy block.

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

      // ── 1. Rule-based pre-match (after explicit SNL-code, before fuzzy) ───
      // Filter to road/structure sector items first so rule keywords never match
      // cross-sector (e.g. irrigation) items. Fall back to full corpus only if no
      // road-compatible items exist in the loaded SDB data.
      if (ruleTag) {
        const roadCompatibleRows = snlRows.filter(s => sectorPenaltyFactor(s.sector) === 1.0);
        const ruleSearchPool = roadCompatibleRows.length > 0 ? roadCompatibleRows : snlRows;
        const ruleResult = ruleMatchSnl(ruleTag, ruleSearchPool);
        if (ruleResult) {
          const ruleSnl = snlRows.find(s => s.id === ruleResult.snlItemId)!;
          const ruleUnitOk = unitsCompatible(boqRow.unit, ruleSnl.unit);

          await db
            .insert(snlBoqMappings)
            .values({
              boqItemId: boqRow.id,
              snlItemId: ruleResult.snlItemId,
              projectCategory: "MEDIUM",
              gradingVariant: null,
              mappedBy: "rule",
              isAutoMapped: true,
              confidenceScore: ruleUnitOk ? ruleResult.confidence : ruleResult.confidence * UNIT_MISMATCH_PENALTY,
              notes: ruleUnitOk
                ? `Rule-matched tag: ${ruleTag}`
                : `Rule-matched tag: ${ruleTag} (unit mismatch — review)`,
            })
            .onConflictDoUpdate({
              target: snlBoqMappings.boqItemId,
              set: {
                snlItemId: ruleResult.snlItemId,
                isAutoMapped: true,
                confidenceScore: ruleUnitOk ? ruleResult.confidence : ruleResult.confidence * UNIT_MISMATCH_PENALTY,
                mappedBy: "rule",
                mappedAt: new Date(),
                notes: ruleUnitOk
                  ? `Rule-matched tag: ${ruleTag}`
                  : `Rule-matched tag: ${ruleTag} (unit mismatch — review)`,
              },
            });

          if (ruleUnitOk) {
            let recipesApplied = false;
            try {
              await storage.applySnlMappingToRecipes(boqRow.id, ruleResult.snlItemId, "MEDIUM", null, "rule");
              recipesApplied = true;
            } catch (recipeErr) {
              console.error(`[autoMapper] rule-match recipes failed for boqItemId=${boqRow.id}:`, recipeErr);
            }
            await db
              .update(boqItems)
              .set({ mappingStatus: recipesApplied ? "mapped" : "needs_review" })
              .where(eq(boqItems.id, boqRow.id));
          } else {
            // Unit mismatch on rule match — save suggestion but don't apply recipes
            await storage.clearBoqItemRecipes(boqRow.id);
            await db
              .update(boqItems)
              .set({ mappingStatus: "needs_review" })
              .where(eq(boqItems.id, boqRow.id));
          }
          continue; // done — skip fuzzy scoring for this row
        }
      }

      // ── 2. Semantic scoring: IDF-weighted cosine over the FULL description, unit-gated ──
      // Sector penalty: IRRIGATION/BUILDING/ELECTRICAL items get a 0.05× multiplier so
      // they never beat road/structure items in scoring and can't reach the 50% review floor.
      const boqText = richTokens(`${boqRow.description ?? ""} ${boqRow.workCategory ?? ""}`);
      const scored: ScoredCandidate[] = snlRows
        .map(snl => {
          const sim = weightedCosine(boqText, snlTokenMap.get(snl.id) ?? [], idf);
          const sectMul = sectorPenaltyFactor(snl.sector);
          const adj = unitsCompatible(boqRow.unit, snl.unit)
            ? sim * sectMul
            : sim * UNIT_MISMATCH_PENALTY * sectMul;
          return { snlItemId: snl.id, snlItemCode: snl.itemCode, score: adj };
        })
        .sort((a, b) => b.score - a.score);

      const top = scored[0];
      const second = scored[1];

      // No usable evidence → unmapped. Flush stale recipe AND stale auto-suggestion row.
      // This clears previously wrong cross-sector suggestions on re-run.
      if (!top || top.score < SUGGEST_FLOOR) {
        await storage.clearBoqItemRecipes(boqRow.id);
        await db
          .delete(snlBoqMappings)
          .where(and(eq(snlBoqMappings.boqItemId, boqRow.id), eq(snlBoqMappings.isAutoMapped, true)));
        await db.update(boqItems).set({ mappingStatus: "unmapped" }).where(eq(boqItems.id, boqRow.id));
        continue;
      }

      const topSnl = snlRows.find(s => s.id === top.snlItemId)!;
      const unitOk = unitsCompatible(boqRow.unit, topSnl.unit);
      const sectorOk = sectorPenaltyFactor(topSnl.sector) === 1.0;
      const clearlyAhead = !second || second.score <= 0 || top.score >= second.score * CONFIDENT_MARGIN;
      // Cross-sector matches are NEVER auto-applied even with high scores.
      const isConfident = unitOk && sectorOk && top.score >= CONFIDENT_FLOOR && clearlyAhead;

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

  // After all items are scored, propagate mappings to duplicate-description siblings
  // within each project. This runs for every automap entry point (startup, remap, bulk).
  const uniqueProjectIds = new Set(boqRows.map(r => r.boqProjectId).filter((id): id is number => id != null));
  for (const pid of uniqueProjectIds) {
    await propagateDuplicateMappings(pid);
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

  // Full cleanup before re-mapping: wipes stale recipes + auto snlBoqMappings rows +
  // resets mapping status to "unmapped" for every non-manually-mapped item.
  // Manual mappings are preserved untouched.
  await storage.clearAllBoqProjectRecipes(boqProjectId);

  await autoMapBoqItems(ids);
  return { remapped: ids.length };
}

// ─── Duplicate-key propagation ────────────────────────────────────────────────

/**
 * After auto-mapping, propagate a confident mapping to all other BOQ items in the
 * same project that share the same normalised description+unit key.
 * Prevents repeated confirmation clicks for identical rows (e.g. repeated
 * reinforcement tiers, repeated concrete grades, repeated kilometre-stone rows).
 */
async function propagateDuplicateMappings(boqProjectId: number): Promise<{ propagated: number }> {
  const allItems = await db
    .select({
      id: boqItems.id,
      description: boqItems.description,
      unit: boqItems.unit,
      mappingStatus: boqItems.mappingStatus,
    })
    .from(boqItems)
    .where(eq(boqItems.boqProjectId, boqProjectId));

  if (allItems.length === 0) return { propagated: 0 };

  const allMappings = await db
    .select({
      boqItemId: snlBoqMappings.boqItemId,
      snlItemId: snlBoqMappings.snlItemId,
      confidenceScore: snlBoqMappings.confidenceScore,
    })
    .from(snlBoqMappings)
    .where(inArray(snlBoqMappings.boqItemId, allItems.map(i => i.id)));

  const mappingByItemId = new Map(allMappings.map(m => [m.boqItemId, m]));

  // Group by stable key
  const groups = new Map<string, typeof allItems>();
  for (const item of allItems) {
    const key = normaliseBoqDescriptionKey(item.description, item.unit);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  let propagated = 0;

  for (const [, group] of groups) {
    if (group.length < 2) continue;
    // Find a mapped source item for this group
    const source = group.find(i => i.mappingStatus === "mapped" && mappingByItemId.has(i.id));
    if (!source) continue;
    const srcMapping = mappingByItemId.get(source.id)!;

    for (const item of group) {
      if (item.id === source.id) continue;
      if (item.mappingStatus === "mapped") continue;
      try {
        await db
          .insert(snlBoqMappings)
          .values({
            boqItemId: item.id,
            snlItemId: srcMapping.snlItemId,
            projectCategory: "MEDIUM",
            gradingVariant: null,
            mappedBy: "auto-propagated",
            isAutoMapped: true,
            confidenceScore: srcMapping.confidenceScore,
            notes: `Propagated from duplicate item #${source.id}`,
          })
          .onConflictDoUpdate({
            target: snlBoqMappings.boqItemId,
            set: {
              snlItemId: srcMapping.snlItemId,
              isAutoMapped: true,
              confidenceScore: srcMapping.confidenceScore,
              mappedBy: "auto-propagated",
              mappedAt: new Date(),
              notes: `Propagated from duplicate item #${source.id}`,
            },
          });

        let recipesApplied = false;
        try {
          await storage.applySnlMappingToRecipes(item.id, srcMapping.snlItemId, "MEDIUM", null, "auto-propagated");
          recipesApplied = true;
        } catch {
          // non-fatal — still mark mapped if mapping row was written
        }
        await db
          .update(boqItems)
          .set({ mappingStatus: recipesApplied ? "mapped" : "needs_review" })
          .where(eq(boqItems.id, item.id));
        propagated++;
      } catch (err) {
        console.error(`[autoMapper] propagation failed for boqItemId=${item.id}:`, err);
      }
    }
  }

  return { propagated };
}

// ─── Summary mapper (used by the "Auto-map Remaining" API) ───────────────────

/**
 * Auto-map all unmapped / needs_review items in a project, then run duplicate
 * propagation. Returns a summary suitable for a user-facing toast message.
 * Does NOT reset already-mapped items or manual mappings.
 */
export async function autoMapProjectWithSummary(boqProjectId: number): Promise<{
  totalItems: number;
  autoMapped: number;
  needsReview: number;
  unmapped: number;
  avgConfidence: number;
  ruleMatched: number;
}> {
  // Snapshot the pending set BEFORE running so the summary reflects only what changed.
  const pending = await db
    .select({ id: boqItems.id })
    .from(boqItems)
    .where(
      and(
        eq(boqItems.boqProjectId, boqProjectId),
        inArray(boqItems.mappingStatus, ["unmapped", "needs_review"]),
      ),
    );

  const pendingIds = pending.map(r => r.id);
  const totalItems = await db
    .select({ id: boqItems.id })
    .from(boqItems)
    .where(eq(boqItems.boqProjectId, boqProjectId))
    .then(r => r.length);

  if (pendingIds.length === 0) {
    return { totalItems, autoMapped: 0, needsReview: 0, unmapped: 0, avgConfidence: 0, ruleMatched: 0 };
  }

  // autoMapBoqItems already calls propagateDuplicateMappings internally.
  await autoMapBoqItems(pendingIds);

  // Re-read status of the formerly-pending items to accurately report what changed.
  const pendingAfter = await db
    .select({ id: boqItems.id, mappingStatus: boqItems.mappingStatus })
    .from(boqItems)
    .where(inArray(boqItems.id, pendingIds));

  const pendingMappings = await db
    .select({ boqItemId: snlBoqMappings.boqItemId, confidenceScore: snlBoqMappings.confidenceScore, mappedBy: snlBoqMappings.mappedBy })
    .from(snlBoqMappings)
    .where(inArray(snlBoqMappings.boqItemId, pendingIds));

  const mappingMap = new Map(pendingMappings.map(m => [m.boqItemId, m]));

  let autoMapped = 0, needsReview = 0, unmapped = 0, ruleMatched = 0;
  let confSum = 0, confCount = 0;

  for (const item of pendingAfter) {
    if (item.mappingStatus === "mapped") {
      autoMapped++;
      const m = mappingMap.get(item.id);
      if (m?.mappedBy === "rule" || m?.mappedBy === "auto-propagated") ruleMatched++;
      if (m?.confidenceScore != null) { confSum += m.confidenceScore; confCount++; }
    } else if (item.mappingStatus === "needs_review") {
      needsReview++;
    } else {
      unmapped++;
    }
  }

  return {
    totalItems,
    autoMapped,
    needsReview,
    unmapped,
    avgConfidence: confCount > 0 ? confSum / confCount : 0,
    ruleMatched,
  };
}
