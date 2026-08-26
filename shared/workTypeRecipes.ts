// Deterministic work-type classifier + recipe templates for BOQ item equipment/labour auto-build.
// Pure TS, no DB imports — safe to import from server, tests, or client.
// Equipment names must exactly match MORTH_EQUIPMENT_SEED names (shared/morthSeedData.ts).
// Labour designations must exactly match MORTH_LABOUR_SEED designations.

export type WorkType =
  | "clearing_grubbing"
  | "dismantling"
  | "roadway_excavation"
  | "earthwork"
  | "gsb"
  | "wmm"
  | "bituminous_base"
  | "bituminous_wearing"
  | "prime_coat"
  | "tack_coat"
  | "pcc"
  | "rcc"
  | "pqc"
  | "dlc"
  | "drain_masonry"
  | "excavation_structure"
  | "backfill_structure"
  | "filter_media"
  | "stone_pitching"
  | "pipe_culvert"
  | "reinforcement"
  | "waterproofing_structure"
  | "chute_drain"
  | "dissipation_chamber"
  | "turfing"
  | "weep_holes"
  | "retaining_wall_structure"
  | "bridge_bearing"
  | "bridge_finishing"
  | "drainage_spout"
  | "expansion_joint"
  | "approach_slab"
  | "bridge_crash_barrier";

/**
 * Maps each work type to its planning category.
 * Used by auto-build-recipes to set planningWorkType on each BOQ item.
 */
export const WORK_TYPE_PLAN_CATEGORY: Record<WorkType, "road" | "structure"> = {
  clearing_grubbing:      "road",
  dismantling:            "road",
  roadway_excavation:     "road",
  earthwork:              "road",
  gsb:                    "road",
  wmm:                    "road",
  bituminous_base:        "road",
  bituminous_wearing:     "road",
  prime_coat:             "road",
  tack_coat:              "road",
  pqc:                    "road",
  dlc:                    "road",
  pcc:                    "structure",
  rcc:                    "structure",
  drain_masonry:          "structure",
  excavation_structure:   "structure",
  backfill_structure:     "structure",
  filter_media:           "structure",
  stone_pitching:         "structure",
  pipe_culvert:           "structure",
  reinforcement:          "structure",
  waterproofing_structure: "structure",
  chute_drain:            "structure",
  dissipation_chamber:    "structure",
  turfing:                "structure",
  weep_holes:             "structure",
  retaining_wall_structure: "structure",
  bridge_bearing:         "structure",
  bridge_finishing:       "structure",
  drainage_spout:         "structure",
  expansion_joint:        "structure",
  approach_slab:          "structure",
  bridge_crash_barrier:   "structure",
};

/**
 * Maps high-level BOQ work category codes to the planning track ("road" | "structure").
 * Used when classifyWorkType() is unavailable — e.g. for SNL-mapped items or items where
 * workCategory was set manually but no description regex matched.
 */
export const WORK_CAT_PLAN_CATEGORY: Record<string, "road" | "structure"> = {
  EARTHWORK:         "road",
  SITE_CLEARANCE:    "road",
  SUBBASE_BASE:      "road",
  BITUMINOUS:        "road",
  SHOULDERS_MEDIANS: "road",
  ROAD_FURNITURE:    "road",
  PRELIM:            "road",
  ELECTRICAL:        "road",
  BUILDINGS:         "road",
  ENVIRONMENTAL:     "road",
  DRAINAGE:          "structure",
  CROSS_DRAINAGE:    "structure",
  MAJOR_BRIDGES:     "structure",
  CONCRETE:          "structure",
};

/**
 * Maps BOQ work category codes to the most representative WorkType when
 * classifyWorkType() returns null.  Used as a secondary fallback by
 * resolveWorkType() so items with a valid workCategory always get a recipe
 * rather than appearing in the "unrecipied" list.
 *
 * Categories with multiple subtypes (EARTHWORK, SUBBASE_BASE, BITUMINOUS,
 * CONCRETE) are handled by sub-classification logic inside resolveWorkType().
 */
export const WORK_CAT_FALLBACK_WORK_TYPE: Partial<Record<string, WorkType>> = {
  EARTHWORK:         "earthwork",       // sub-classified by description below
  SITE_CLEARANCE:    "clearing_grubbing",
  SUBBASE_BASE:      "gsb",             // sub-classified by description below
  BITUMINOUS:        "bituminous_base", // sub-classified by description below
  CONCRETE:          "pcc",             // sub-classified by description below
  DRAINAGE:          "drain_masonry",
  CROSS_DRAINAGE:    "drain_masonry",
  SHOULDERS_MEDIANS: "earthwork",
};

// ──────────────────────────────────────────────────────────────────────────────
// SHOULDER SUB-CLASSIFICATION (Gantt month-boundary & shoulder-sequencing instruction)
// Shoulders are built ON a construction layer — they must follow that layer's
// stage, not be lumped into earthwork. Same description-based sub-classification
// pattern as the EARTHWORK / SUBBASE_BASE / BITUMINOUS blocks in resolveWorkType.
// "unclassified" = the layer genuinely cannot be determined from the description;
// the planner must confirm (never silently defaulted to earthwork).
// ──────────────────────────────────────────────────────────────────────────────

export const SHOULDER_CLASSES = ["earth", "gsb", "wmm", "dbm", "bc", "paved"] as const;
export type ShoulderClass = (typeof SHOULDER_CLASSES)[number] | "unclassified";

/** True when a BOQ description is a shoulder work item (not merely mentioning
 *  the word in another context, e.g. "watering shoulders" maintenance). */
export function isShoulderDesc(desc: string): boolean {
  return /\bshoulders?\b/i.test(desc ?? "");
}

/** Description-based shoulder layer sub-classifier. */
export function classifyShoulderLayer(desc: string): ShoulderClass {
  const d = (desc ?? "").toLowerCase();
  // Named layers take precedence — "DBM in paved shoulder" is a DBM shoulder,
  // not a generic paved shoulder.
  if (/\bbc\b|bituminous\s*concrete|\bsdbc\b|wearing\s*(course|coat)/i.test(d)) return "bc";
  if (/\bdbm\b|dense\s*(graded\s*)?bituminous|\bbm\b|binder\s*course/i.test(d)) return "dbm";
  if (/\bwmm\b|wet[\s-]*mix\s*macadam|wet[\s-]*mix/i.test(d)) return "wmm";
  if (/\bgsb\b|granular\s*sub[\s-]*base/i.test(d)) return "gsb";
  // Earth / soil / gravel / moorum shoulder — the classic embankment-stage
  // shoulder. Checked BEFORE the generic paved catch: "earthen shoulders ...
  // complete as per drawings" must stay earth, not fall into "shoulder...complete".
  if (/earth(en)?\s*shoulder|soil|gravel|moorum|murrum|granular\s*shoulder|earth|selected\s*material|filling/i.test(d)) return "earth";
  // Complete / paved / hard shoulder built as a finished unit (no single layer named)
  if (/paved\s*shoulder|hard\s*shoulder|shoulder\s*paving|complete\s*shoulder|shoulder.*(complete|in\s*all\s*layers)/i.test(d)) return "paved";
  return "unclassified";
}

/** Plain-language dependency note per shoulder class (bar detail/edit view). */
export const SHOULDER_DEPENDENCY_NOTES: Record<ShoulderClass, string> = {
  earth:        "Starts after Subgrade",
  gsb:          "Starts with/after GSB",
  wmm:          "Starts with/after WMM",
  dbm:          "Starts after carriageway DBM",
  bc:           "Starts after carriageway BC",
  paved:        "Final paved shoulder starts after BC",
  unclassified: "Shoulder sequence review required",
};

export interface WorkTypeResolution {
  workType: WorkType | null;
  /** How the work type was resolved. */
  resolvedBy: "classifier" | "workCategory" | "none";
  /** Confidence of the result. */
  confidence: "high" | "medium" | "none";
  /** Human-readable explanation shown in unrecipied diagnostic messages. */
  reason: string;
}

/**
 * Context-aware BOQ work-type resolver.
 *
 * Resolution order:
 *   1. classifyWorkType(desc, effectiveUnit) — deterministic regex (high confidence)
 *   2. workCategory → sub-classified WorkType  (medium confidence)
 *   3. null + explanation (none)
 *
 * Pass canonicalUnit when available so the regex unit checks operate on the
 * normalised form ("Cum", "MT" …) rather than the raw imported value ("1 Cum").
 *
 * A manually set or SNL-derived workCategory is used as strong matching context:
 * e.g. workCategory="EARTHWORK" + description contains "excavation" resolves to
 * roadway_excavation even when the exact regex didn't fire.
 */
export function resolveWorkType(
  description: string,
  unit: string,
  context?: {
    workCategory?: string | null;
    canonicalUnit?: string | null;
  },
): WorkTypeResolution {
  const effectiveUnit = context?.canonicalUnit ?? unit;

  // 1. Deterministic regex classifier — highest confidence.
  const wt = classifyWorkType(description, effectiveUnit);
  if (wt) {
    return {
      workType: wt,
      resolvedBy: "classifier",
      confidence: "high",
      reason: `Matched by description pattern (${wt})`,
    };
  }

  // 2. workCategory-based sub-classification — medium confidence.
  const wc = context?.workCategory;
  if (wc) {
    const d = description.toLowerCase();
    let fallback: WorkType | null = null;

    if (wc === "EARTHWORK") {
      if (/\bexcavat/i.test(d)) {
        // "road way" / "road level" / SDR signals road-formation cutting (MoRTH Cl. 301),
        // NOT structure excavation — even when "trench" appears (e.g. "trench cutting").
        const hasRoadCtx = /road[\s-]*way\b|road\s+level|\bSDR\b/i.test(d);
        const hasStructureCtx = /foundation|footing|abutment|\bpier\b|culvert|\bpit\b/i.test(d);
        const hasTrench = /\btrench\b/i.test(d);
        if ((hasStructureCtx || hasTrench) && !hasRoadCtx) {
          fallback = "excavation_structure";
        } else {
          fallback = "roadway_excavation";
        }
      } else {
        fallback = "earthwork"; // embankment / fill / subgrade / shoulders
      }
    } else if (wc === "SUBBASE_BASE") {
      fallback = /\bwmm\b|wet[\s-]*mix/i.test(d) ? "wmm" : "gsb";
    } else if (wc === "BITUMINOUS") {
      if (/\btack[\s-]*coat\b/i.test(d))       fallback = "tack_coat";
      else if (/\bprime[\s-]*coat\b|\bprimer\b/i.test(d)) fallback = "prime_coat";
      else if (/\bbc\b|\bsdbc\b|wearing/i.test(d)) fallback = "bituminous_wearing";
      else fallback = "bituminous_base";
    } else if (wc === "CONCRETE") {
      if (/\brcc\b|reinforced/i.test(d))          fallback = "rcc";
      else if (/\bpqc\b|pavement[\s-]*quality/i.test(d)) fallback = "pqc";
      else if (/\bdlc\b|dry[\s-]*lean/i.test(d))  fallback = "dlc";
      else fallback = "pcc";
    } else {
      fallback = WORK_CAT_FALLBACK_WORK_TYPE[wc] ?? null;
    }

    if (fallback) {
      return {
        workType: fallback,
        resolvedBy: "workCategory",
        confidence: "medium",
        reason: `Inferred from work category "${wc}" → ${fallback} ` +
          `(description pattern did not match; verify the generated recipe is correct)`,
      };
    }

    // workCategory known but no recipe template (ROAD_FURNITURE, ELECTRICAL, etc.)
    return {
      workType: null,
      resolvedBy: "none",
      confidence: "none",
      reason: `Work category "${wc}" has no automated recipe template — ` +
        `assign an SNL match via Auto-Map or set the recipe manually`,
    };
  }

  // 3. No category, no match.
  return {
    workType: null,
    resolvedBy: "none",
    confidence: "none",
    reason: "No work category set — assign one in BOQ Item Review, then re-run",
  };
}

interface EquipmentLine {
  name: string;               // must match MORTH_EQUIPMENT_SEED name exactly
  preferredUnit: string;      // BOQ unit to try against standard outputs
  fallbackHrsPerUnit: number; // used when master output has no matching unit
  count: number;
}

interface LabourLine {
  designation: string;          // must match MORTH_LABOUR_SEED designation exactly
  fallbackDaysPerUnit: number;  // used when master output has no matching unit
  count: number;
}

interface WorkTypeRecipe {
  equipment: EquipmentLine[];
  labour: LabourLine[];
}

// ──────────────────────────────────────────────────────────────────────────────
// CLASSIFIER
// Returns null for items that cannot be confidently classified (they go into the
// "unrecipied" list — no wrong guesses).
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Strip leading numeric prefix from BOQ unit strings and normalise to uppercase.
 * Some BOQ import formats encode quantity-in-unit (e.g. "1 Cum", "1.00 Cum").
 * Stripping the prefix lets the downstream regex checks work correctly.
 *
 * Examples:
 *   "1 Cum"   → "CUM"
 *   "1.00 Cum"→ "CUM"
 *   "1CUM"    → "CUM"
 *   "CUM"     → "CUM"
 *   "SQM"     → "SQM"
 *   "MT"      → "MT"
 */
// Import from the shared canonical-unit service and re-export so call sites that
// previously imported normaliseBoqUnit from here can also get canonicalizeUnit.
import { canonicalizeUnit } from "./boqNormalise";
export { canonicalizeUnit };

export function normaliseBoqUnit(raw: string): string {
  return canonicalizeUnit(raw).toUpperCase();
}

export function classifyWorkType(description: string, unit: string): WorkType | null {
  const d = description.toLowerCase();
  const u = normaliseBoqUnit(unit);

  // ── Clearing & Grubbing (MoRTH Cl. 201) — MUST be first check ──────────────
  if (/clearing\s*(and|&)\s*grubbing|clear\s*(and|&)\s*grub|grubbing|removal\s*of\s*(trees?|stumps?|vegetation|bushes?)|felling\s*of\s*trees?|uprooting|removal\s*of\s*shrubs?/i.test(d)) return "clearing_grubbing";

  // ── Dismantling / demolition of existing structures / pavement (MoRTH Cl. 202)
  if (/\bdismantl|\bdemolit|\bdemolish|\bscarif|\bmilling\b/i.test(d)) return "dismantling";
  if (/removing\s*(existing|old)\s*(pavement|structure|culvert|drain|wall)|removal\s*of\s*(existing|old)\s*(pavement|structure|culvert|drain|wall)/i.test(d)) return "dismantling";

  // Other removal/breaking items that are not consuming → no recipe
  // Exception: excavation items legitimately contain "removal of unsuitable soil" etc.
  if (/\bremoving\b|\bremoval\b|\bbreaking\b/i.test(d) && !/excavat/i.test(d)) return null;

  // ── Bituminous wearing ──────────────────────────────────────────────────────
  if (/\bsdbc\b|semi[-\s]*dense\s*bituminous/i.test(d)) return "bituminous_wearing";
  if (/wearing\s*coat/i.test(d) && /bitumin/i.test(d)) return "bituminous_wearing";
  // BC / Bituminous Concrete → wearing unless explicitly DBM/dense-bituminous context
  if (/bituminous\s*concrete|\bbc\b/i.test(d) && !/dense\s*bituminous|\bdbm\b/i.test(d)) return "bituminous_wearing";

  // ── Bituminous base / binder ────────────────────────────────────────────────
  if (/\bdbm\b|dense\s*bituminous/i.test(d)) return "bituminous_base";
  if (/bituminous\s*macadam|\bbm\b/i.test(d)) return "bituminous_base";

  // ── Bituminous spray works ──────────────────────────────────────────────────
  // Checked AFTER the mix layers above so a BC/DBM laying item that merely mentions
  // "after applying prime coat" / "over tack coat" is NOT misclassified as a spray coat.
  if (/tack\s*coat/i.test(d)) return "tack_coat";
  if (/prime\s*coat|primer\s*coat|\bprimer\b/i.test(d)) return "prime_coat";

  // ── Granular courses ────────────────────────────────────────────────────────
  if (/\bgsb\b|granular\s*sub[-\s]*base/i.test(d)) return "gsb";
  if (/wet\s*mix\s*macadam|\bwmm\b/i.test(d)) return "wmm";

  // ── Retaining wall — checked BEFORE concrete classification so RCC/PCC
  // retaining walls are not swept into generic "rcc"/"pcc" (they must stay in the
  // "structure" planning category and be excluded from road-reach auto-generation).
  if (/retaining\s*wall/i.test(d)) return "retaining_wall_structure";

  // ── Bridge/structure context items — checked BEFORE concrete/excavation
  // classification so e.g. "RCC approach slab" or "filter media behind abutment"
  // are not swept into generic "rcc"/"excavation_structure". These items must
  // classify by CONTEXT (never split into road Reach 1-4 bars). ────────────────

  // Bridge bearings (POT/PTFE, elastomeric, tar paper under bearings).
  // Guard "bearing" alone against false positives like "bearing capacity of soil".
  if (
    /pot[\s-]*ptfe|\bptfe\b|elastomeric\s*bearing|pot\s*bearing|bridge\s*bearing|bearing\s*plate|bearing\s*pedestal|tar\s*paper/i.test(d) ||
    (/\bbearing\b/i.test(d) && !/bearing\s*capacity/i.test(d))
  ) return "bridge_bearing";

  // Bridge numbering / bridge painting / railing (identification & finishing works).
  if (
    /bridge\s*(numbering|number\s*plate|name\s*plate)|painting\s*(of\s*)?(the\s*)?bridge|bridge\s*painting|enamel\s*paint(ing)?|\bms\s*railing\b|bridge\s*railing|railing\s*(on|over|of)\s*bridge/i.test(d)
  ) return "bridge_finishing";

  // Drainage spouts (bridge deck drainage, distinct from weep holes).
  if (/drainage?\s*spout|deck\s*spout|scupper/i.test(d)) return "drainage_spout";

  // Expansion joints (bridge/structure movement joints).
  if (/expansion\s*joint|strip\s*seal\s*joint|modular\s*joint/i.test(d)) return "expansion_joint";

  // Approach slabs (always bridge/structure-adjacent, never a road reach item).
  if (/approach\s*slab/i.test(d)) return "approach_slab";

  // Crash barrier — only when tied to bridge context (road crash barrier is a road item).
  if (/crash\s*barrier|metal\s*beam\s*crash\s*barrier|\bmbcb\b/i.test(d) && /\bbridge\b|\bviaduct\b|\bflyover\b|\bdeck\b/i.test(d)) {
    return "bridge_crash_barrier";
  }

  // Filter media / drainage layers in structures (checked before excavation_structure
  // so e.g. "filter media behind abutment" isn't swept into excavation via "abutment").
  if (/filter\s*media|filter\s*material|drainage\s*layer|granular\s*filter/i.test(d)) return "filter_media";

  // ── Concrete (order matters: pqc > dlc > rcc > pcc) ────────────────────────
  if (/\bpqc\b|pavement\s*quality\s*concrete/i.test(d)) return "pqc";
  if (/\bdlc\b|dry\s*lean\s*concrete/i.test(d)) return "dlc";
  if (/\brcc\b|reinforced\s*cement\s*concrete|reinforced\s*concrete/i.test(d)) return "rcc";
  if (
    /\bpcc\b|plain\s*cement\s*concrete|cement\s*concrete|concrete\s*of\s*grade|grade\s*m\s*-?\s*\d{2}/i.test(d) &&
    !/bitumin/i.test(d)
  ) return "pcc";

  // ── Reinforcement / rebar (check before earthwork / excavation rules) ────────
  if (
    /\bhysd\b|\btmt\b|reinforcement\s*steel|reinforcing\s*steel|steel\s*reinforcement|bar\s*bending|rebar/i.test(d) &&
    /^(MT|KG|TON|TONNE)$/i.test(u)
  ) return "reinforcement";

  // ── Structure excavation — MUST be checked BEFORE generic earthwork ─────────
  // Foundation pits, abutment trenches, pier holes, culvert cuts, etc.
  // Exclusions:
  //   · embankment items that merely cite structure excavation as a *material source*
  //   · road-way / SDR items: "trench cutting" in MoRTH Cl. 301 road earthwork descriptions
  //     is road formation cutting, NOT a culvert/foundation trench — presence of "road way"
  //     or "road level" or explicit SDR context unambiguously signals road work.
  if (
    /foundation|footing|abutment|pier|culvert|trench|pit\s*excavat|excavat.*structure|structure.*excavat|box\s*cut|excavat.*(bridge|drain|retaining\s*wall)|(bridge|drain|retaining\s*wall).*excavat/i.test(d) &&
    /^(CUM|CUB|M3|CU\.?M)$/i.test(u) &&
    !/\bembankment\b/i.test(d) &&
    !/road[\s-]*way\b|road\s+level|\bSDR\b/i.test(d)
  ) return "excavation_structure";

  // ── Roadway excavation (MoRTH Cl. 301) — cutting of hills/formation ─────────
  // Must be checked BEFORE the generic earthwork rule below.
  // Catches: roadway excavation, excavation in cutting, hill/rock cutting,
  // formation cutting, cutting in ordinary/hard/soft soil or rock.
  // Does NOT catch embankment / fill / borrow items (those fall through to earthwork).
  if (
    /road[\s-]*way\s*excavat|\bexcavat\w*\s+in\s+road[\s-]*way|\bexcavat\w*\s+in\s+(cutting|rock|ordinary|hard|soft|soil|earth)|hill\s*(cutting|excavat\w*)|rock\s*cutting|formation\s*(excavat\w*|cut(?!.*fill))|cutting\s+in\s+(ordinary|hard|soft|rock|soil|earth)|ordinary\s+(soil|earth)\s*excavat/i.test(d) &&
    /^(CUM|CUB|M3|CU\.?M)$/i.test(u) &&
    !/(?:forming|construction\s+of|constructing)\s+(?:an?\s+)?embankment\b|\bembankment\s+with\b/i.test(d)
  ) return "roadway_excavation";

  // ── Road earthwork / embankment (MoRTH Cl. 305) — fill, borrow, subgrade, shoulders ──
  if (
    /embankment|earth\s*work|earthwork|cut\s*(and|&)\s*fill|subgrade|borrow|formation\s*fill|earthen\s*shoulder/i.test(d) &&
    /^(CUM|CUB|M3|CU\.?M)$/i.test(u)
  ) return "earthwork";

  // ── Structural backfill (behind abutments, returns, wing walls) ─────────────
  if (
    /back\s*fill|backfill|back\s*filling|filling.*behind|behind.*wall|behind.*abutment/i.test(d) &&
    /^(CUM|CUB|M3|CU\.?M)$/i.test(u)
  ) return "backfill_structure";

  // ── Stone pitching (slope protection) ───────────────────────────────────────
  if (/stone\s*pitching|stone\s*apron|riprap|rip\s*rap|boulder\s*pitching/i.test(d)) return "stone_pitching";

  // ── Pipe culverts / hume pipes ───────────────────────────────────────────────
  if (/hume\s*pipe|\bnp[2-4]\b|rcc\s*pipe|spun\s*pipe|hdpe\s*pipe|culvert\s*pipe|pipe\s*culvert/i.test(d)) return "pipe_culvert";

  // ── Waterproofing treatments ─────────────────────────────────────────────────
  if (/waterproof|bituminous\s*paint|coal\s*tar|epoxy.*coat|curing\s*compound/i.test(d)) return "waterproofing_structure";

  // ── Protective / miscellaneous structure-adjacent items (V1 planning boundary) ──
  // These may only be planned from the frozen Structure Schedule Import (chainage +
  // qty scheduled there) — never auto-spread across road reaches. Checked before the
  // generic masonry fallback so they don't get mis-swept into "drain_masonry".
  if (/chute\s*drain/i.test(d)) return "chute_drain";
  if (/dissipat\w*\s*(chamber|pad|structure|basin)/i.test(d)) return "dissipation_chamber";
  if (/turfing|turf\s*work|sodding/i.test(d)) return "turfing";
  if (/weep\s*hole/i.test(d)) return "weep_holes";
  // (retaining_wall_structure and the bridge-context items — bearings, numbering/
  // painting, drainage spouts, expansion joints, approach slabs, crash barriers,
  // filter media — are all classified earlier, before the concrete/excavation
  // checks. See the "Bridge/structure context items" block above.)

  // ── Minor civil / masonry ────────────────────────────────────────────────────
  if (/masonry|brick\s*work|stone\s*work|drain.*wall|head\s*wall|wing\s*wall/i.test(d)) return "drain_masonry";

  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// STRUCTURE / LOCATION-SCHEDULED ITEM DETECTION
// Shared, context-based helper used by Auto-generate, Auto-sequence, Clean
// Structure Bars, and Work Programme coverage/status display. A stored
// `planningWorkType` field can go stale (e.g. an item was imported before a
// classifier fix, or planningWorkType was never set on legacy data) — so this
// helper ALSO checks the BOQ category/section name and the item description
// directly, every time, instead of only trusting the persisted field.
// ──────────────────────────────────────────────────────────────────────────────

// BOQ category/section names that are always structure/location-scheduled,
// regardless of the individual item's description.
export const STRUCTURE_CATEGORY_RE =
  /culvert|bridge|minor\s*bridge|major\s*bridge|drainage\s*and\s*protection|retaining\s*wall|cross\s*drainage|\bstructures?\b/i;

// Description/context keywords that mark an item as structure/location-scheduled
// even when it sits in a category that isn't obviously a "structure" section
// (e.g. a generic "Civil Works" category containing a bridge bearing line item).
export const STRUCTURE_KEYWORD_RE =
  /foundation\s*excavat|excavat.*(foundation|bridge|culvert|structure|drain|retaining\s*wall)|(foundation|bridge|culvert|structure|drain|retaining\s*wall).*excavat|\bbearing\b(?!\s*capacity)|\bpot\b|\bptfe\b|tar\s*paper|strip\s*seal|expansion\s*joint|modular\s*joint|drainage?\s*spout|deck\s*spout|scupper|weep\s*hole|weephole|bridge\s*numbering|bridge\s*painting|enamel\s*paint|\bms\s*railing\b|bridge\s*railing|approach\s*slab|filter\s*media.*abutment|\babutment\b|\bpier\b|substructure|superstructure|wing\s*wall|head\s*wall|retaining\s*wall/i;

// Crash barrier is only structure-scheduled when tied to bridge/deck context —
// a plain "metal beam crash barrier" along the road embankment is a road item.
const BRIDGE_CRASH_BARRIER_RE = /crash\s*barrier|metal\s*beam\s*crash\s*barrier|\bmbcb\b/i;
const BRIDGE_CONTEXT_RE = /\bbridge\b|\bviaduct\b|\bflyover\b|\bdeck\b/i;

export interface StructureClassifiableItem {
  planningWorkType?: string | null;
  categoryName?: string | null;
  description?: string | null;
}

/**
 * Returns true if a BOQ item must be planned as a structure/location-scheduled
 * item — i.e. never auto-split into road Reach 1/2/3/4 bars, only ever
 * programmed via the Structure Schedule Import (or shown as
 * "Not programmed — schedule/location required." until it is).
 *
 * Checks (in order, any match is sufficient):
 *   1. It already has a structure_import bar (pass via `hasStructureImportBar`).
 *   2. Its stored planningWorkType is already "structure".
 *   3. Its BOQ category/section name matches a known structure section.
 *   4. Its description matches structure-context keywords.
 *   5. Its description mentions a crash barrier in bridge/deck context.
 */
export function isStructureOrLocationScheduledItem(
  item: StructureClassifiableItem,
  opts?: { hasStructureImportBar?: boolean },
): boolean {
  if (opts?.hasStructureImportBar) return true;
  if (item.planningWorkType === "structure") return true;
  const cat = item.categoryName ?? "";
  const d = item.description ?? "";
  if (STRUCTURE_CATEGORY_RE.test(cat)) return true;
  if (STRUCTURE_KEYWORD_RE.test(d)) return true;
  if (BRIDGE_CRASH_BARRIER_RE.test(d) && BRIDGE_CONTEXT_RE.test(d)) return true;
  return false;
}

// ──────────────────────────────────────────────────────────────────────────────
// RECIPE TEMPLATES
// fallbackHrsPerUnit / fallbackDaysPerUnit are derived from MoRTH 5th Rev norms
// and serve as safe defaults when the planning master has no matching unit output.
// ──────────────────────────────────────────────────────────────────────────────
export const WORK_TYPE_RECIPES: Record<WorkType, WorkTypeRecipe> = {

  // ── Clearing & Grubbing (Ha / SQM) ───────────────────────────────────────────
  // MoRTH Cl. 201 — removal of vegetation, trees, stumps, roots from ROW.
  // Primarily manual / light machinery work.
  clearing_grubbing: {
    equipment: [
      { name: "Hydraulic Excavator (0.9 CUM)", preferredUnit: "Ha", fallbackHrsPerUnit: 8, count: 1 },
    ],
    labour: [
      { designation: "Mazdoor (Unskilled Labour)",    fallbackDaysPerUnit: 20, count: 10 },
      { designation: "Equipment Operator",             fallbackDaysPerUnit: 1,  count: 1  },
    ],
  },

  // ── Dismantling Existing Structures / Pavement (MoRTH Cl. 202) ───────────────
  // Milling, scarification, breaking of existing pavement/structures.
  dismantling: {
    equipment: [
      { name: "Hydraulic Excavator (0.9 CUM)", preferredUnit: "CUM", fallbackHrsPerUnit: 0.05, count: 1 },
    ],
    labour: [
      { designation: "Mazdoor (Unskilled Labour)",    fallbackDaysPerUnit: 0.02, count: 6 },
      { designation: "Equipment Operator",             fallbackDaysPerUnit: 0.006, count: 1 },
    ],
  },

  // ── Roadway Excavation / Cutting (CUM) ───────────────────────────────────────
  // MoRTH Cl. 301 — cutting of hills and formation to road level.
  // Excavator-led (capacity bottleneck); dozer/grader for bench and rough-trim;
  // tippers haul cut spoil directly to embankment fill area.
  // No vibratory roller — cut slopes do not require compaction pass.
  roadway_excavation: {
    equipment: [
      // Excavator: 60 CUM/hr → 1/60 = 0.0167 hr/CUM  — primary duration driver
      { name: "Hydraulic Excavator (0.9 CUM)", preferredUnit: "CUM", fallbackHrsPerUnit: 0.0167, count: 1 },
      // Grader for bench cleanup and subgrade trimming
      { name: "Motor Grader (180 HP)",         preferredUnit: "CUM", fallbackHrsPerUnit: 0.0067, count: 1 },
    ],
    labour: [
      // Operators: excavator + grader
      { designation: "Equipment Operator",       fallbackDaysPerUnit: 0.00208, count: 2 },
      // Drivers for tippers hauling spoil to fill areas
      { designation: "Driver (Tipper / Tanker)", fallbackDaysPerUnit: 0.00208, count: 4 },
    ],
  },

  // ── Earthwork / Embankment (CUM) ─────────────────────────────────────────────
  // MoRTH Cl. 305 — embankment construction with cut material or borrow.
  // Runs concurrently with roadway excavation (tippers shuttle cut→fill).
  // Roller compaction required; water tanker for OMC moisture.
  earthwork: {
    equipment: [
      // Excavator: 60 CUM/hr → 1/60 = 0.0167 hr/CUM  — primary duration driver
      { name: "Hydraulic Excavator (0.9 CUM)", preferredUnit: "CUM", fallbackHrsPerUnit: 0.0167, count: 1 },
      // Grader for spreading/finishing: 150 CUM/hr → 0.0067 hr/CUM
      { name: "Motor Grader (180 HP)",         preferredUnit: "CUM", fallbackHrsPerUnit: 0.0067, count: 1 },
      // Roller: 700 SQM/hr; at 200 mm lift 1 CUM ≈ 5 SQM → 5/700 = 0.0071 hr/CUM
      { name: "Vibratory Roller (10T)",         preferredUnit: "CUM", fallbackHrsPerUnit: 0.0071, count: 1 },
      // Water tanker for compaction moisture
      { name: "Water Tanker (6000 L)",          preferredUnit: "CUM", fallbackHrsPerUnit: 0.0333, count: 1 },
    ],
    labour: [
      // Operators for excavator + dozer + grader + roller
      // 1 operator per machine; excavator does 60×8=480 CUM/day → 1/480 days/CUM each
      { designation: "Equipment Operator",       fallbackDaysPerUnit: 0.00208, count: 4 },
      // Drivers for tippers + tanker
      { designation: "Driver (Tipper / Tanker)", fallbackDaysPerUnit: 0.00208, count: 5 },
    ],
  },

  // ── Granular Sub-Base (CUM) ──────────────────────────────────────────────────
  gsb: {
    equipment: [
      { name: "Hydraulic Excavator (0.9 CUM)", preferredUnit: "CUM", fallbackHrsPerUnit: 0.0167, count: 1 },
      { name: "Motor Grader (180 HP)",         preferredUnit: "CUM", fallbackHrsPerUnit: 0.0067, count: 1 },
      { name: "Vibratory Roller (10T)",         preferredUnit: "CUM", fallbackHrsPerUnit: 0.0071, count: 1 },
      { name: "Water Tanker (6000 L)",          preferredUnit: "CUM", fallbackHrsPerUnit: 0.0333, count: 1 },
    ],
    labour: [
      { designation: "Equipment Operator",       fallbackDaysPerUnit: 0.00208, count: 3 },
      { designation: "Driver (Tipper / Tanker)", fallbackDaysPerUnit: 0.00208, count: 4 },
    ],
  },

  // ── Wet Mix Macadam (CUM or MT) ──────────────────────────────────────────────
  // WMM Plant: 100 MT/hr. If BOQ in CUM: 1 CUM WMM ≈ 2.2 MT → 2.2/100 = 0.022 hr/CUM
  wmm: {
    equipment: [
      { name: "WMM Plant (100 T/hr)",   preferredUnit: "MT",  fallbackHrsPerUnit: 0.022,  count: 1 },
      { name: "Motor Grader (180 HP)",  preferredUnit: "CUM", fallbackHrsPerUnit: 0.0067, count: 1 },
      { name: "Vibratory Roller (10T)", preferredUnit: "CUM", fallbackHrsPerUnit: 0.0071, count: 1 },
      { name: "Water Tanker (6000 L)",  preferredUnit: "CUM", fallbackHrsPerUnit: 0.0333, count: 1 },
    ],
    labour: [
      { designation: "Equipment Operator",       fallbackDaysPerUnit: 0.00208, count: 3 },
      { designation: "Driver (Tipper / Tanker)", fallbackDaysPerUnit: 0.00208, count: 4 },
    ],
  },

  // ── Bituminous Base / Binder course (DBM, BM) — MT or SQM ──────────────────
  // Machine-executed: HMP is the bottleneck. Labourers for joint/edge work only.
  bituminous_base: {
    equipment: [
      // HMP: 120 MT/hr → 1/120 = 0.00833 hr/MT
      { name: "Hot Mix Plant (120 T/hr)",  preferredUnit: "MT",  fallbackHrsPerUnit: 0.00833, count: 1 },
      // Paver: 75 MT/hr or 800 SQM/hr
      { name: "Paver Finisher (sensor)",   preferredUnit: "MT",  fallbackHrsPerUnit: 0.01333, count: 1 },
      { name: "Vibratory Roller (10T)",    preferredUnit: "SQM", fallbackHrsPerUnit: 0.00143, count: 1 },
      { name: "Pneumatic Tyre Roller",     preferredUnit: "SQM", fallbackHrsPerUnit: 0.002,   count: 1 },
    ],
    labour: [
      // HMP+paver+2×rollers → 4 operators; HMP processes 120×8=960 MT/day → 1/960 = 0.00104
      { designation: "Equipment Operator",       fallbackDaysPerUnit: 0.00104, count: 4 },
      { designation: "Paving Gang Supervisor",   fallbackDaysPerUnit: 0.00104, count: 1 },
      // Gang of 8 for joint/edge work at ~600 MT/day paver output → 8/960 = 0.00833
      { designation: "Bituminous Laying Labour", fallbackDaysPerUnit: 0.00833, count: 8 },
      { designation: "Driver (Tipper / Tanker)", fallbackDaysPerUnit: 0.00104, count: 6 },
    ],
  },

  // ── Bituminous Wearing course (BC, SDBC, wearing coat) — MT or SQM ──────────
  bituminous_wearing: {
    equipment: [
      { name: "Hot Mix Plant (120 T/hr)",  preferredUnit: "MT",  fallbackHrsPerUnit: 0.00833, count: 1 },
      { name: "Paver Finisher (sensor)",   preferredUnit: "MT",  fallbackHrsPerUnit: 0.01333, count: 1 },
      { name: "Vibratory Roller (10T)",    preferredUnit: "SQM", fallbackHrsPerUnit: 0.00143, count: 1 },
      { name: "Pneumatic Tyre Roller",     preferredUnit: "SQM", fallbackHrsPerUnit: 0.002,   count: 1 },
    ],
    labour: [
      { designation: "Equipment Operator",       fallbackDaysPerUnit: 0.00104, count: 4 },
      { designation: "Paving Gang Supervisor",   fallbackDaysPerUnit: 0.00104, count: 1 },
      { designation: "Bituminous Laying Labour", fallbackDaysPerUnit: 0.00833, count: 8 },
      { designation: "Driver (Tipper / Tanker)", fallbackDaysPerUnit: 0.00104, count: 6 },
    ],
  },

  // ── Prime Coat (SQM) ─────────────────────────────────────────────────────────
  // Pressure distributor: 3000 SQM/hr → 1/3000 = 0.000333 hr/SQM
  prime_coat: {
    equipment: [
      { name: "Bitumen Pressure Distributor", preferredUnit: "SQM", fallbackHrsPerUnit: 0.000333, count: 1 },
    ],
    labour: [
      // 2 operators + small helper gang; distributor at 3000×8=24000 SQM/day → 1/24000 = 0.0000417
      { designation: "Equipment Operator",      fallbackDaysPerUnit: 0.0000417, count: 2 },
      { designation: "General Helper / Coolie", fallbackDaysPerUnit: 0.0000417, count: 4 },
    ],
  },

  // ── Tack Coat (SQM) ──────────────────────────────────────────────────────────
  tack_coat: {
    equipment: [
      { name: "Bitumen Pressure Distributor", preferredUnit: "SQM", fallbackHrsPerUnit: 0.000333, count: 1 },
    ],
    labour: [
      { designation: "Equipment Operator",      fallbackDaysPerUnit: 0.0000417, count: 2 },
      { designation: "General Helper / Coolie", fallbackDaysPerUnit: 0.0000417, count: 4 },
    ],
  },

  // ── Plain Cement Concrete (CUM) ──────────────────────────────────────────────
  // Transit mixer: 6 CUM/hr per mixer → 3 mixers = 18 CUM/hr effective
  // Concrete pump: 30 CUM/hr → 0.0333 hr/CUM (pump drives duration)
  pcc: {
    equipment: [
      { name: "Transit Mixer (6 CUM)", preferredUnit: "CUM", fallbackHrsPerUnit: 0.167,  count: 3 },
      { name: "Concrete Pump",         preferredUnit: "CUM", fallbackHrsPerUnit: 0.0333, count: 1 },
    ],
    labour: [
      // Pump at 30 CUM/hr × 8hr = 240 CUM/day → 1/240 = 0.00417 days/CUM per operator
      { designation: "Equipment Operator",           fallbackDaysPerUnit: 0.00417, count: 2 },
      // Mason: 2.5 CUM/day → 1/2.5 = 0.4 days/CUM
      { designation: "Mason (Form-work / Concrete)", fallbackDaysPerUnit: 0.4,     count: 5 },
      // Carpenter: 20 SQM/day; 1 CUM ≈ 4 SQM formwork → 4/20 = 0.2 days/CUM
      { designation: "Carpenter (Form-work)",        fallbackDaysPerUnit: 0.2,     count: 3 },
      { designation: "General Helper / Coolie",      fallbackDaysPerUnit: 0.4,     count: 4 },
    ],
  },

  // ── Reinforced Cement Concrete (CUM) ─────────────────────────────────────────
  // Like PCC but adds steel fixers. Typical RCC ≈ 150 kg/CUM = 0.15 MT.
  // Steel fixer: 0.5 MT/day → 0.15/0.5 = 0.3 days/CUM per fixer.
  rcc: {
    equipment: [
      { name: "Transit Mixer (6 CUM)", preferredUnit: "CUM", fallbackHrsPerUnit: 0.167,  count: 3 },
      { name: "Concrete Pump",         preferredUnit: "CUM", fallbackHrsPerUnit: 0.0333, count: 1 },
    ],
    labour: [
      { designation: "Equipment Operator",           fallbackDaysPerUnit: 0.00417, count: 2 },
      { designation: "Mason (Form-work / Concrete)", fallbackDaysPerUnit: 0.4,     count: 5 },
      { designation: "Carpenter (Form-work)",        fallbackDaysPerUnit: 0.2,     count: 3 },
      { designation: "Steel Fixer (Rebar)",          fallbackDaysPerUnit: 0.3,     count: 4 },
      { designation: "General Helper / Coolie",      fallbackDaysPerUnit: 0.4,     count: 4 },
    ],
  },

  // ── Pavement Quality Concrete (CUM) ──────────────────────────────────────────
  // Slip-form paver: 150 CUM/hr → 1/150 = 0.00667 hr/CUM (primary driver)
  // Multiple mixers to keep paver continuously fed.
  pqc: {
    equipment: [
      { name: "Concrete Paver (slip-form)", preferredUnit: "CUM", fallbackHrsPerUnit: 0.00667, count: 1 },
      { name: "Transit Mixer (6 CUM)",      preferredUnit: "CUM", fallbackHrsPerUnit: 0.167,   count: 6 },
    ],
    labour: [
      // Paver+roller+others → 4 operators; paver at 150×8=1200 CUM/day → 1/1200 = 0.000833
      { designation: "Equipment Operator",           fallbackDaysPerUnit: 0.000833, count: 4 },
      { designation: "Paving Gang Supervisor",       fallbackDaysPerUnit: 0.000833, count: 1 },
      // Edge boards only (not full shuttering)
      { designation: "Mason (Form-work / Concrete)", fallbackDaysPerUnit: 0.1,      count: 3 },
      { designation: "Driver (Tipper / Tanker)",     fallbackDaysPerUnit: 0.000833, count: 6 },
    ],
  },

  // ── Dry Lean Concrete (CUM) ──────────────────────────────────────────────────
  dlc: {
    equipment: [
      { name: "Transit Mixer (6 CUM)",  preferredUnit: "CUM", fallbackHrsPerUnit: 0.167,  count: 3 },
      { name: "Vibratory Roller (10T)", preferredUnit: "CUM", fallbackHrsPerUnit: 0.0071, count: 1 },
    ],
    labour: [
      { designation: "Equipment Operator",           fallbackDaysPerUnit: 0.00417, count: 2 },
      { designation: "Mason (Form-work / Concrete)", fallbackDaysPerUnit: 0.2,     count: 3 },
      { designation: "General Helper / Coolie",      fallbackDaysPerUnit: 0.2,     count: 6 },
    ],
  },

  // ── Drain / Masonry / Minor Civil (CUM or RM) ────────────────────────────────
  // Largely manual — mason is the bottleneck.
  drain_masonry: {
    equipment: [
      { name: "Water Tanker (6000 L)", preferredUnit: "CUM", fallbackHrsPerUnit: 0.1, count: 1 },
    ],
    labour: [
      { designation: "Mason (Form-work / Concrete)", fallbackDaysPerUnit: 0.4, count: 4 },
      { designation: "General Helper / Coolie",      fallbackDaysPerUnit: 0.4, count: 4 },
    ],
  },

  // ── Structure excavation (foundation pits, abutment, pier, culvert) ──────────
  // Smaller-scale excavator + tipper; roller not needed.
  excavation_structure: {
    equipment: [
      { name: "Hydraulic Excavator (0.9 CUM)", preferredUnit: "CUM", fallbackHrsPerUnit: 0.0167, count: 1 },
    ],
    labour: [
      { designation: "Equipment Operator",       fallbackDaysPerUnit: 0.00208, count: 1 },
      { designation: "Driver (Tipper / Tanker)", fallbackDaysPerUnit: 0.00208, count: 2 },
      { designation: "General Helper / Coolie",  fallbackDaysPerUnit: 0.00416, count: 2 },
    ],
  },

  // ── Structural backfill (behind abutments / wing walls) ──────────────────────
  // Compaction by plate-compactor / rammer — no vibratory roller in confined spaces.
  backfill_structure: {
    equipment: [
      { name: "Hydraulic Excavator (0.9 CUM)", preferredUnit: "CUM", fallbackHrsPerUnit: 0.025, count: 1 },
      { name: "Water Tanker (6000 L)",         preferredUnit: "CUM", fallbackHrsPerUnit: 0.05,  count: 1 },
    ],
    labour: [
      { designation: "Equipment Operator",      fallbackDaysPerUnit: 0.00312, count: 1 },
      { designation: "General Helper / Coolie", fallbackDaysPerUnit: 0.05,    count: 4 },
    ],
  },

  // ── Filter media / drainage layer (CUM or MT) ─────────────────────────────────
  // Manual placement with light compaction.
  filter_media: {
    equipment: [],
    labour: [
      { designation: "General Helper / Coolie", fallbackDaysPerUnit: 0.1, count: 4 },
    ],
  },

  // ── Stone pitching / riprap (SQM or CUM) ─────────────────────────────────────
  // Mason-intensive; water tanker for bond and curing.
  stone_pitching: {
    equipment: [
      { name: "Water Tanker (6000 L)", preferredUnit: "SQM", fallbackHrsPerUnit: 0.05, count: 1 },
    ],
    labour: [
      { designation: "Mason (Form-work / Concrete)", fallbackDaysPerUnit: 0.2, count: 3 },
      { designation: "General Helper / Coolie",      fallbackDaysPerUnit: 0.2, count: 3 },
    ],
  },

  // ── Pipe culverts / hume pipes (RM or Nos) ───────────────────────────────────
  // Crane + skilled labour for laying and jointing.
  pipe_culvert: {
    equipment: [
      { name: "Hydraulic Excavator (0.9 CUM)", preferredUnit: "RM", fallbackHrsPerUnit: 0.05, count: 1 },
    ],
    labour: [
      { designation: "Equipment Operator",      fallbackDaysPerUnit: 0.00625, count: 1 },
      { designation: "Mason (Form-work / Concrete)", fallbackDaysPerUnit: 0.125, count: 2 },
      { designation: "General Helper / Coolie", fallbackDaysPerUnit: 0.125,  count: 4 },
    ],
  },

  // ── Reinforcement / rebar (MT or KG) ─────────────────────────────────────────
  // Pure labour operation — bar benders and steel fixers.
  reinforcement: {
    equipment: [],
    labour: [
      { designation: "Steel Fixer (Rebar)",    fallbackDaysPerUnit: 0.3, count: 4 },
      { designation: "General Helper / Coolie", fallbackDaysPerUnit: 0.3, count: 2 },
    ],
  },

  // ── Waterproofing treatment (SQM or RM) ──────────────────────────────────────
  // Bituminous paint / epoxy coating — largely manual with spray pump.
  waterproofing_structure: {
    equipment: [],
    labour: [
      { designation: "Mason (Form-work / Concrete)", fallbackDaysPerUnit: 0.05, count: 2 },
      { designation: "General Helper / Coolie",      fallbackDaysPerUnit: 0.05, count: 2 },
    ],
  },

  // ── Chute drain (RM or CUM) — protective drainage, only planned from Structure
  // Schedule Import when scheduled with chainage + qty. Mason-intensive minor RCC/masonry.
  chute_drain: {
    equipment: [],
    labour: [
      { designation: "Mason (Form-work / Concrete)", fallbackDaysPerUnit: 0.3, count: 2 },
      { designation: "General Helper / Coolie",      fallbackDaysPerUnit: 0.3, count: 3 },
    ],
  },

  // ── Dissipation chamber / energy-dissipation pad (Nos or CUM) — point structure.
  dissipation_chamber: {
    equipment: [],
    labour: [
      { designation: "Mason (Form-work / Concrete)", fallbackDaysPerUnit: 1, count: 2 },
      { designation: "General Helper / Coolie",      fallbackDaysPerUnit: 1, count: 3 },
    ],
  },

  // ── Turfing / sodding (SQM) — manual slope protection.
  turfing: {
    equipment: [],
    labour: [
      { designation: "General Helper / Coolie", fallbackDaysPerUnit: 0.05, count: 4 },
    ],
  },

  // ── Weep holes (Nos or RM) — small drainage openings in structures/walls.
  weep_holes: {
    equipment: [],
    labour: [
      { designation: "Mason (Form-work / Concrete)", fallbackDaysPerUnit: 0.1, count: 1 },
      { designation: "General Helper / Coolie",      fallbackDaysPerUnit: 0.1, count: 1 },
    ],
  },

  // ── Retaining wall (structure category) — only planned from Structure Schedule
  // Import (Drains_Retaining_Walls sheet); never auto-spread across road reaches.
  retaining_wall_structure: {
    equipment: [
      { name: "Water Tanker (6000 L)", preferredUnit: "CUM", fallbackHrsPerUnit: 0.1, count: 1 },
    ],
    labour: [
      { designation: "Mason (Form-work / Concrete)", fallbackDaysPerUnit: 0.4, count: 4 },
      { designation: "General Helper / Coolie",      fallbackDaysPerUnit: 0.4, count: 4 },
    ],
  },

  // ── Bridge bearings (POT/PTFE, elastomeric, tar paper) — schedule-only, structure category.
  bridge_bearing: {
    equipment: [],
    labour: [
      { designation: "Mason (Form-work / Concrete)", fallbackDaysPerUnit: 0.5, count: 2 },
      { designation: "General Helper / Coolie",      fallbackDaysPerUnit: 0.5, count: 2 },
    ],
  },

  // ── Bridge numbering / bridge painting — schedule-only, structure category.
  bridge_finishing: {
    equipment: [],
    labour: [
      { designation: "General Helper / Coolie", fallbackDaysPerUnit: 0.1, count: 2 },
    ],
  },

  // ── Drainage spouts / deck scuppers — schedule-only, structure category.
  drainage_spout: {
    equipment: [],
    labour: [
      { designation: "Mason (Form-work / Concrete)", fallbackDaysPerUnit: 0.1, count: 1 },
      { designation: "General Helper / Coolie",      fallbackDaysPerUnit: 0.1, count: 1 },
    ],
  },

  // ── Expansion joints — schedule-only, structure category.
  expansion_joint: {
    equipment: [],
    labour: [
      { designation: "Mason (Form-work / Concrete)", fallbackDaysPerUnit: 0.3, count: 2 },
      { designation: "General Helper / Coolie",      fallbackDaysPerUnit: 0.3, count: 2 },
    ],
  },

  // ── Approach slabs — schedule-only, structure category.
  approach_slab: {
    equipment: [
      { name: "Water Tanker (6000 L)", preferredUnit: "CUM", fallbackHrsPerUnit: 0.1, count: 1 },
    ],
    labour: [
      { designation: "Mason (Form-work / Concrete)", fallbackDaysPerUnit: 0.4, count: 3 },
      { designation: "General Helper / Coolie",      fallbackDaysPerUnit: 0.4, count: 3 },
    ],
  },

  // ── Crash barrier in bridge/viaduct/deck context — schedule-only, structure category.
  bridge_crash_barrier: {
    equipment: [],
    labour: [
      { designation: "Mason (Form-work / Concrete)", fallbackDaysPerUnit: 0.2, count: 2 },
      { designation: "General Helper / Coolie",      fallbackDaysPerUnit: 0.2, count: 2 },
    ],
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// BUILDERS — called from the auto-build endpoint in server/routes.ts
// ──────────────────────────────────────────────────────────────────────────────

export interface BuiltEquipmentRow {
  equipmentName: string;
  planningEquipmentTypeId: number | null;
  qtyPerBoqUnit: number;
  count: number;
  sortOrder: number;
}

export interface BuiltLabourRow {
  designation: string;
  planningLabourTypeId: number | null;
  qtyPerBoqUnit: number;
  count: number;
  sortOrder: number;
}

type EquipIndexEntry = { id: number; outputs: Array<{ unit: string; outputPerHr: number }> };
type LabourIndexEntry = { id: number; outputs: Array<{ unit: string; outputPerDay: number }> };

/**
 * Build equipment rows for a BOQ item.
 * qtyPerBoqUnit = hours per 1 BOQ unit, derived from master output norms when
 * the BOQ unit matches; falls back to the recipe's hardcoded MoRTH norm otherwise.
 */
export function buildEquipmentRows(
  wt: WorkType,
  boqUnit: string,
  equipIndex: Map<string, EquipIndexEntry>,
): BuiltEquipmentRow[] {
  const recipe = WORK_TYPE_RECIPES[wt];
  if (!recipe) return [];
  const u = boqUnit.toUpperCase().trim();

  return recipe.equipment.map((line, i) => {
    const master = equipIndex.get(line.name.toLowerCase());
    let qtyPerBoqUnit = line.fallbackHrsPerUnit;

    if (master && master.outputs.length > 0) {
      // Use master output only when the BOQ unit matches exactly
      const match = master.outputs.find(o => o.unit.toUpperCase() === u);
      if (match && match.outputPerHr > 0) {
        qtyPerBoqUnit = 1 / match.outputPerHr;
      }
    }

    return {
      equipmentName: line.name,
      planningEquipmentTypeId: master?.id ?? null,
      qtyPerBoqUnit,
      count: line.count,
      sortOrder: i,
    };
  });
}

/**
 * Build labour rows for a BOQ item.
 * qtyPerBoqUnit = days per 1 BOQ unit, derived from master output norms when
 * the BOQ unit matches; falls back to the recipe's hardcoded MoRTH norm otherwise.
 */
export function buildLabourRows(
  wt: WorkType,
  boqUnit: string,
  labourIndex: Map<string, LabourIndexEntry>,
): BuiltLabourRow[] {
  const recipe = WORK_TYPE_RECIPES[wt];
  if (!recipe) return [];
  const u = boqUnit.toUpperCase().trim();

  return recipe.labour.map((line, i) => {
    const master = labourIndex.get(line.designation.toLowerCase());
    let qtyPerBoqUnit = line.fallbackDaysPerUnit;

    if (master && master.outputs.length > 0) {
      const match = master.outputs.find(o => o.unit.toUpperCase() === u);
      if (match && match.outputPerDay > 0) {
        qtyPerBoqUnit = 1 / match.outputPerDay;
      }
    }

    return {
      designation: line.designation,
      planningLabourTypeId: master?.id ?? null,
      qtyPerBoqUnit,
      count: line.count,
      sortOrder: i,
    };
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// STANDARD CONCRETE DESIGN-MIX FALLBACK (kg/m³)
// Used ONLY when the RMC module has no user-entered mix design for the grade.
// The user's RMC JMF always takes precedence. Values are conservative MoRTH/IS
// nominal site-mix approximations — replace with the project JMF for accuracy.
// ──────────────────────────────────────────────────────────────────────────────
export interface StandardConcreteDesign {
  grade: string;
  cementContent: number;
  admixtureName: string | null;
  admixtureDosage: number | null;
  componentProportions: { cement: number; fineAgg: number; coarseAgg20: number; coarseAgg10: number };
}

export const STANDARD_CONCRETE_DESIGNS: Record<string, StandardConcreteDesign> = {
  M10: { grade: "M10", cementContent: 220, admixtureName: null, admixtureDosage: null, componentProportions: { cement: 220, fineAgg: 720, coarseAgg20: 730, coarseAgg10: 490 } },
  M15: { grade: "M15", cementContent: 320, admixtureName: null, admixtureDosage: null, componentProportions: { cement: 320, fineAgg: 700, coarseAgg20: 760, coarseAgg10: 500 } },
  M20: { grade: "M20", cementContent: 360, admixtureName: null, admixtureDosage: null, componentProportions: { cement: 360, fineAgg: 680, coarseAgg20: 770, coarseAgg10: 510 } },
  M25: { grade: "M25", cementContent: 380, admixtureName: "PCE Superplasticiser", admixtureDosage: 0.8, componentProportions: { cement: 380, fineAgg: 660, coarseAgg20: 780, coarseAgg10: 520 } },
  M30: { grade: "M30", cementContent: 400, admixtureName: "PCE Superplasticiser", admixtureDosage: 1.0, componentProportions: { cement: 400, fineAgg: 650, coarseAgg20: 790, coarseAgg10: 520 } },
  M35: { grade: "M35", cementContent: 420, admixtureName: "PCE Superplasticiser", admixtureDosage: 1.0, componentProportions: { cement: 420, fineAgg: 640, coarseAgg20: 800, coarseAgg10: 530 } },
  M40: { grade: "M40", cementContent: 440, admixtureName: "PCE Superplasticiser", admixtureDosage: 1.2, componentProportions: { cement: 440, fineAgg: 620, coarseAgg20: 810, coarseAgg10: 540 } },
  M45: { grade: "M45", cementContent: 360, admixtureName: "PCE Superplasticiser", admixtureDosage: 1.0, componentProportions: { cement: 360, fineAgg: 690, coarseAgg20: 720, coarseAgg10: 480 } },
  M50: { grade: "M50", cementContent: 460, admixtureName: "PCE Superplasticiser", admixtureDosage: 1.2, componentProportions: { cement: 460, fineAgg: 600, coarseAgg20: 820, coarseAgg10: 550 } },
  PQC: { grade: "PQC (M40)", cementContent: 400, admixtureName: "PCE Superplasticiser", admixtureDosage: 1.0, componentProportions: { cement: 400, fineAgg: 650, coarseAgg20: 760, coarseAgg10: 480 } },
  DLC: { grade: "DLC (lean)", cementContent: 150, admixtureName: null, admixtureDosage: null, componentProportions: { cement: 150, fineAgg: 700, coarseAgg20: 760, coarseAgg10: 700 } },
};
