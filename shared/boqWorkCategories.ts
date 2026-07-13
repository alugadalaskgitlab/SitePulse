import { classifyWorkType } from "./workTypeRecipes";

export interface BoqWorkCategory {
  code: string;
  label: string;
  sortOrder: number;
}

export const BOQ_WORK_CATEGORIES: BoqWorkCategory[] = [
  { code: "PRELIM",            label: "Preliminaries & Mobilization",      sortOrder: 1 },
  { code: "SITE_CLEARANCE",    label: "Site Clearance & Dismantling",      sortOrder: 2 },
  { code: "EARTHWORK",         label: "Earthwork",                         sortOrder: 3 },
  { code: "SUBBASE_BASE",      label: "Sub-base & Base Courses",           sortOrder: 4 },
  { code: "BITUMINOUS",        label: "Bituminous Works",                  sortOrder: 5 },
  { code: "CONCRETE",          label: "Cement Concrete Works",             sortOrder: 6 },
  { code: "DRAINAGE",          label: "Drainage & Storm Water",            sortOrder: 7 },
  { code: "SHOULDERS_MEDIANS", label: "Shoulders & Medians",               sortOrder: 8 },
  { code: "ROAD_FURNITURE",    label: "Road Furniture & Safety",           sortOrder: 9 },
  { code: "CROSS_DRAINAGE",    label: "Cross Drainage & Minor Bridges",    sortOrder: 10 },
  { code: "MAJOR_BRIDGES",     label: "Major Bridges & Structures",        sortOrder: 11 },
  { code: "BUILDINGS",         label: "Buildings & Utilities",             sortOrder: 12 },
  { code: "ELECTRICAL",        label: "Electrical Works",                  sortOrder: 13 },
  { code: "ENVIRONMENTAL",     label: "Environmental & Slope Protection",  sortOrder: 14 },
  { code: "MISCELLANEOUS",     label: "Miscellaneous Works",               sortOrder: 15 },
];

export const BOQ_WORK_CATEGORY_MAP = new Map<string, BoqWorkCategory>(
  BOQ_WORK_CATEGORIES.map(c => [c.code, c])
);

export function getWorkCategoryLabel(code: string | null | undefined): string {
  if (!code) return "Uncategorized";
  return BOQ_WORK_CATEGORY_MAP.get(code)?.label ?? code;
}

export function suggestWorkCategory(itemCode: string | null | undefined): string | null {
  if (!itemCode) return null;
  const clean = itemCode.trim();
  const chapterMatch = clean.match(/^(\d+)[.\-_]/);
  if (!chapterMatch) {
    const digitOnly = clean.match(/^(\d+)$/);
    if (!digitOnly) return null;
    const ch = parseInt(digitOnly[1]);
    return mapChapterToCategory(ch);
  }
  const ch = parseInt(chapterMatch[1]);
  return mapChapterToCategory(ch);
}

function mapChapterToCategory(ch: number): string | null {
  if (ch === 1)  return "PRELIM";
  if (ch === 2)  return "SITE_CLEARANCE";
  if (ch === 3)  return "EARTHWORK";
  if (ch === 4)  return "SUBBASE_BASE";
  if (ch === 5)  return "BITUMINOUS";
  if (ch === 6)  return "CONCRETE";
  if (ch === 7)  return "DRAINAGE";
  if (ch === 8)  return "ROAD_FURNITURE";
  if (ch === 9)  return "CROSS_DRAINAGE";
  if (ch === 10) return "MAJOR_BRIDGES";
  if (ch === 11) return "BUILDINGS";
  if (ch === 12) return "ELECTRICAL";
  if (ch === 13) return "ENVIRONMENTAL";
  return null;
}

// Mapping from workTypeRecipes WorkType string → BOQ work category code.
// Keep in sync with WorkType union in workTypeRecipes.ts.
const WORK_TYPE_TO_BOQ_CATEGORY: Record<string, string> = {
  clearing_grubbing:        "SITE_CLEARANCE",
  dismantling:              "SITE_CLEARANCE",
  roadway_excavation:       "EARTHWORK",
  earthwork:                "EARTHWORK",
  gsb:                      "SUBBASE_BASE",
  wmm:                      "SUBBASE_BASE",
  dlc:                      "SUBBASE_BASE",
  prime_coat:               "BITUMINOUS",
  tack_coat:                "BITUMINOUS",
  bituminous_base:          "BITUMINOUS",
  bituminous_wearing:       "BITUMINOUS",
  pqc:                      "CONCRETE",
  pcc:                      "CONCRETE",
  rcc:                      "CONCRETE",
  reinforcement:            "CONCRETE",
  drain_masonry:            "DRAINAGE",
  chute_drain:              "DRAINAGE",
  dissipation_chamber:      "DRAINAGE",
  drainage_spout:           "DRAINAGE",
  weep_holes:               "DRAINAGE",
  excavation_structure:     "CROSS_DRAINAGE",
  backfill_structure:       "CROSS_DRAINAGE",
  filter_media:             "CROSS_DRAINAGE",
  stone_pitching:           "CROSS_DRAINAGE",
  pipe_culvert:             "CROSS_DRAINAGE",
  waterproofing_structure:  "CROSS_DRAINAGE",
  retaining_wall_structure: "CROSS_DRAINAGE",
  turfing:                  "ENVIRONMENTAL",
  bridge_bearing:           "MAJOR_BRIDGES",
  bridge_finishing:         "MAJOR_BRIDGES",
  expansion_joint:          "MAJOR_BRIDGES",
  approach_slab:            "MAJOR_BRIDGES",
  bridge_crash_barrier:     "MAJOR_BRIDGES",
};

/**
 * Suggest a BOQ work category code from an item description (and optional unit).
 * Works even when itemCode is absent — suitable for code-less BOQ imports.
 *
 * Priority:
 *   1. classifyWorkType() from workTypeRecipes — deterministic keyword classifier
 *   2. Additional keyword checks for types not covered by recipes
 *      (shoulders/medians, road furniture, electrical, environmental, etc.)
 *
 * Returns null only when no confident match is found.
 * Does NOT overwrite a manually-selected category — callers must check before applying.
 */
export function suggestWorkCategoryFromDescription(
  description: string | null | undefined,
  unit?: string | null,
): string | null {
  if (!description) return null;

  const wt = classifyWorkType(description, unit ?? "");
  if (wt && WORK_TYPE_TO_BOQ_CATEGORY[wt]) {
    return WORK_TYPE_TO_BOQ_CATEGORY[wt];
  }

  const d = description.toLowerCase();

  // Shoulders & medians
  if (/\bshoulder\b|earthen\s*shoulder|granular\s*shoulder|paved\s*shoulder|shoulder\s*(fill|construction|treatment|earthwork)/i.test(d))
    return "SHOULDERS_MEDIANS";
  if (/\bmedian\b/i.test(d) && !/kerb/i.test(d))
    return "SHOULDERS_MEDIANS";

  // Road furniture & safety
  if (/crash\s*barrier|guard\s*rail|metal\s*beam|delineator|road\s*stud|cat[\s-]*eye|thermoplastic|road\s*marking|kilometre\s*stone|hectometre\s*stone|boundary\s*stone/i.test(d))
    return "ROAD_FURNITURE";
  if (/traffic\s*sign|sign\s*board|cautionary|mandatory|informatory|chevron\s*sign|\bparapet\b|\brailing\b/i.test(d))
    return "ROAD_FURNITURE";

  // Electrical & utilities
  if (/\belectrical\b|street\s*light|solar\s*light|high\s*mast|cable\s*duct|transformer|dg\s*set|generator\s*set|power\s*supply|switch\s*board/i.test(d))
    return "ELECTRICAL";

  // Environmental & slope protection
  if (/turfing|turf\s*work|sodding|plantation|tree\s*planting|bio[\s-]?engineering|geo[\s-]?textile|slope\s*protection|erosion\s*control|coir\s*mat/i.test(d))
    return "ENVIRONMENTAL";

  // Buildings & utilities
  if (/\btoll\s*plaza\b|rest\s*area|truck\s*lay-?by|control\s*room|labour\s*camp|site\s*office|compound\s*wall/i.test(d))
    return "BUILDINGS";
  if (/\bbuilding\b/i.test(d) && !/\bbuilding\s*(up|of\s*embankment)/i.test(d))
    return "BUILDINGS";

  // Preliminary & mobilisation
  if (/\bpreliminar|\bmobiliz|\bdemobiliz|survey\s*work|establishment\s*of\s*camp|site\s*establishment/i.test(d))
    return "PRELIM";

  // Site clearance fallback for patterns workTypeRecipes may have skipped
  if (/\bgrub(bing)?\b|\bsite\s*clear|\bvegetation\s*remov|removal\s*of\s*(trees?|stumps?|bushes?|shrubs?)|scarif(ying|ication)/i.test(d))
    return "SITE_CLEARANCE";

  return null;
}
