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
  return "MISCELLANEOUS";
}
