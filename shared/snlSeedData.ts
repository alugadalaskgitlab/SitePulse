// MoRTH SDB 2nd Revision 2019 — 5 validated sample items
// Source: PDF extraction + manual OCR verification
// All quantities: Medium project category unless noted.
// Shift = 8 hours. derivedPerUnit = quantityPerShift / shiftOutput.

export const MORTH_SDB_SOURCE = {
  code: "MORTH_SDB_2019",
  name: "Standard Data Book for Analysis of Rates — 2nd Revision 2019",
  authority: "Ministry of Road Transport & Highways",
  department: "MoRTH",
  year: 2019,
  version: "2nd Revision",
  country: "India",
  notes: "Covers Earthwork, Sub-Bases, Bases, Bituminous, Concrete, Structures, Buildings, Bridges. Chapter structure: Ch.3 Earthwork, Ch.4 Sub-Bases/Bases, Ch.5 Bituminous, Ch.6 Concrete Pavement, Ch.7+ Structures.",
};

// ─── ITEM 1: EMBANKMENT 3.16 ───────────────────────────────────────────────
export const EMBANKMENT_ITEM = {
  itemCode: "3.16",
  description: "Construction of embankment with approved material obtained from borrow pits including clearing of borrow areas, excavation in all types of soils, carriage, spreading in layers and compacting to achieve the desired compaction for embankment as per Table 300-2.",
  shortLabel: "Embankment (Borrow Pit)",
  unit: "CUM",
  workCategory: "EARTHWORK",
  workSubCategory: "Embankment",
  chapterNo: "3",
  chapterTitle: "Earthwork, Erosion Control and Drainage",
  sourcePage: "66",
  specClause: "Clause 305",
  isMixSpecific: false,
  hasGradingVariants: false,
  notes: "Labour rows (Mate 0.040, Mazdoor 1.000) read from adjacent block 3.19 — verify at page 66. Tipper formula: 450 × 1.75 × L2 (soil bulk density ≈ 1.75 T/CUM, L2 = lead from borrow pit in km).",
};

export const EMBANKMENT_PRODUCTIVITY = [
  { projectCategory: "LARGE",  shiftOutput: 450, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 56.25 },
  { projectCategory: "MEDIUM", shiftOutput: 450, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 56.25 },
  { projectCategory: "SMALL",  shiftOutput: 450, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 56.25 },
];

export const EMBANKMENT_LABOUR = [
  { projectCategory: "ALL", sortOrder: 1, designation: "Mate",              skillTier: "SUPERVISORY", unit: "day", quantityPerShift: 0.040, shiftOutputRef: 450, derivedPerUnit: 0.040 / 450 },
  { projectCategory: "ALL", sortOrder: 2, designation: "Mazdoor",           skillTier: "UNSKILLED",   unit: "day", quantityPerShift: 1.000, shiftOutputRef: 450, derivedPerUnit: 1.000 / 450 },
];

export const EMBANKMENT_EQUIPMENT = [
  { projectCategory: "LARGE",  sortOrder: 1, equipmentType: "Hydraulic Excavator", equipmentSpec: "1.2 CUM bucket", purpose: "excavation", unit: "hrs", quantityPerShift: 5.048, formulaType: "FIXED", shiftOutputRef: 450, derivedPerUnit: 5.048 / 450 },
  { projectCategory: "MEDIUM", sortOrder: 1, equipmentType: "Hydraulic Excavator", equipmentSpec: "1.1 CUM bucket", purpose: "excavation", unit: "hrs", quantityPerShift: 5.813, formulaType: "FIXED", shiftOutputRef: 450, derivedPerUnit: 5.813 / 450 },
  { projectCategory: "SMALL",  sortOrder: 1, equipmentType: "Hydraulic Excavator", equipmentSpec: "0.9 CUM bucket", purpose: "excavation", unit: "hrs", quantityPerShift: 8.127, formulaType: "FIXED", shiftOutputRef: 450, derivedPerUnit: 8.127 / 450 },
  { projectCategory: "LARGE",  sortOrder: 2, equipmentType: "Tipper",              equipmentSpec: "18 CUM",         purpose: "transport",  unit: "t.km", quantityPerShift: null,  formulaType: "LEAD_VARIABLE", formulaExpr: "450*1.75*L2", shiftOutputRef: 450, derivedPerUnit: null, notes: "787.5×L2 t.km/shift" },
  { projectCategory: "MEDIUM", sortOrder: 2, equipmentType: "Tipper",              equipmentSpec: "14 CUM",         purpose: "transport",  unit: "t.km", quantityPerShift: null,  formulaType: "LEAD_VARIABLE", formulaExpr: "450*1.75*L2", shiftOutputRef: 450, derivedPerUnit: null, notes: "787.5×L2 t.km/shift" },
  { projectCategory: "SMALL",  sortOrder: 2, equipmentType: "Tipper",              equipmentSpec: "10 CUM",         purpose: "transport",  unit: "t.km", quantityPerShift: null,  formulaType: "LEAD_VARIABLE", formulaExpr: "450*1.75*L2", shiftOutputRef: 450, derivedPerUnit: null },
  { projectCategory: "LARGE",  sortOrder: 3, equipmentType: "Tipper",              equipmentSpec: "18 CUM (L/U)",   purpose: "loading",    unit: "hrs", quantityPerShift: 5.048, formulaType: "FIXED", shiftOutputRef: 450, derivedPerUnit: 5.048 / 450 },
  { projectCategory: "MEDIUM", sortOrder: 3, equipmentType: "Tipper",              equipmentSpec: "14 CUM (L/U)",   purpose: "loading",    unit: "hrs", quantityPerShift: 5.813, formulaType: "FIXED", shiftOutputRef: 450, derivedPerUnit: 5.813 / 450 },
  { projectCategory: "SMALL",  sortOrder: 3, equipmentType: "Tipper",              equipmentSpec: "10 CUM (L/U)",   purpose: "loading",    unit: "hrs", quantityPerShift: 8.127, formulaType: "FIXED", shiftOutputRef: 450, derivedPerUnit: 8.127 / 450 },
  { projectCategory: "LARGE",  sortOrder: 4, equipmentType: "Motor Grader",        equipmentSpec: "4.30m blade",    purpose: "grading",    unit: "hrs", quantityPerShift: 2.177, formulaType: "FIXED", shiftOutputRef: 450, derivedPerUnit: 2.177 / 450 },
  { projectCategory: "MEDIUM", sortOrder: 4, equipmentType: "Motor Grader",        equipmentSpec: "3.70m blade",    purpose: "grading",    unit: "hrs", quantityPerShift: 2.626, formulaType: "FIXED", shiftOutputRef: 450, derivedPerUnit: 2.626 / 450 },
  { projectCategory: "SMALL",  sortOrder: 4, equipmentType: "Motor Grader",        equipmentSpec: "3.35m blade",    purpose: "grading",    unit: "hrs", quantityPerShift: 2.929, formulaType: "FIXED", shiftOutputRef: 450, derivedPerUnit: 2.929 / 450 },
  { projectCategory: "LARGE",  sortOrder: 5, equipmentType: "Water Tanker",        equipmentSpec: "16 KL",          purpose: "watering",   unit: "hrs", quantityPerShift: null,  formulaType: "LEAD_FORMULA", formulaExpr: "0.273*L1+0.945", shiftOutputRef: 450, derivedPerUnit: null },
  { projectCategory: "MEDIUM", sortOrder: 5, equipmentType: "Water Tanker",        equipmentSpec: "12 KL",          purpose: "watering",   unit: "hrs", quantityPerShift: null,  formulaType: "LEAD_FORMULA", formulaExpr: "0.365*L1+1.260", shiftOutputRef: 450, derivedPerUnit: null },
  { projectCategory: "SMALL",  sortOrder: 5, equipmentType: "Water Tanker",        equipmentSpec: "6 KL",           purpose: "watering",   unit: "hrs", quantityPerShift: null,  formulaType: "LEAD_FORMULA", formulaExpr: "0.729*L1+2.520", shiftOutputRef: 450, derivedPerUnit: null },
  { projectCategory: "ALL",    sortOrder: 6, equipmentType: "Vibratory Roller",    equipmentSpec: "11T",            purpose: "compaction", unit: "hrs", quantityPerShift: 2.184, formulaType: "FIXED", shiftOutputRef: 450, derivedPerUnit: 2.184 / 450 },
];

export const EMBANKMENT_MATERIALS = [
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 1, materialName: "Borrowed Earth (borrow pit)", materialCategory: "BULK_FILL", unit: "CUM", quantityPerShift: 450, shiftOutputRef: 450, derivedPerUnit: 1.000, isDesignSpecific: false, notes: "Compensation for earth taken from private land" },
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 2, materialName: "Water",                        materialCategory: "WATER",     unit: "KL",  quantityPerShift: 39.375, shiftOutputRef: 450, derivedPerUnit: 39.375 / 450, isDesignSpecific: false, notes: "Compaction water, 5% extra moisture" },
];

// ─── ITEM 2: GSB 4.01A ─────────────────────────────────────────────────────
export const GSB_ITEM = {
  itemCode: "4.01A",
  description: "Granular Sub-Base with Graded Material (Table 400-1) — Plant Mix Method: providing close graded material, mixing in a mechanical mix plant at OMC, carriage of mixed material to work site, spreading in uniform layers with motor grader on prepared surface and compacting with vibratory power roller to achieve the desired density as per Clause 401.",
  shortLabel: "GSB — Plant Mix Method",
  unit: "CUM",
  workCategory: "SUBBASE",
  workSubCategory: "Granular Sub-Base",
  chapterNo: "4",
  chapterTitle: "Sub-Bases, Bases (Non-Bituminous) and Shoulders",
  sourcePage: "85",
  specClause: "Clause 401",
  isMixSpecific: false,
  hasGradingVariants: true,
  notes: "6 grading variants (Table 400-1). Mate quantity for Medium reads 0.080 vs 0.060 for Large/Small — possible OCR issue, verify at p.85. Large plant hrs not captured by OCR.",
};

export const GSB_PRODUCTIVITY = [
  { projectCategory: "LARGE",  shiftOutput: 400, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 50 },
  { projectCategory: "MEDIUM", shiftOutput: 400, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 50 },
  { projectCategory: "SMALL",  shiftOutput: 400, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 50 },
];

export const GSB_LABOUR = [
  { projectCategory: "ALL", sortOrder: 1, designation: "Mate",            skillTier: "SUPERVISORY", unit: "day", quantityPerShift: 0.060, shiftOutputRef: 400, derivedPerUnit: 0.060 / 400 },
  { projectCategory: "ALL", sortOrder: 2, designation: "Mazdoor Skilled", skillTier: "SKILLED",     unit: "day", quantityPerShift: 1.000, shiftOutputRef: 400, derivedPerUnit: 1.000 / 400 },
  { projectCategory: "ALL", sortOrder: 3, designation: "Mazdoor",         skillTier: "UNSKILLED",   unit: "day", quantityPerShift: 1.000, shiftOutputRef: 400, derivedPerUnit: 1.000 / 400 },
];

export const GSB_EQUIPMENT = [
  { projectCategory: "LARGE",  sortOrder: 1, equipmentType: "WMM Mixing Plant",    equipmentSpec: "250 TPH",       purpose: "mixing",     unit: "hrs", quantityPerShift: null,   formulaType: "FIXED", shiftOutputRef: 400, derivedPerUnit: null, notes: "Hours not captured by OCR — verify p.85" },
  { projectCategory: "MEDIUM", sortOrder: 1, equipmentType: "WMM Mixing Plant",    equipmentSpec: "200 TPH",       purpose: "mixing",     unit: "hrs", quantityPerShift: 5.600,  formulaType: "FIXED", shiftOutputRef: 400, derivedPerUnit: 5.600 / 400 },
  { projectCategory: "SMALL",  sortOrder: 1, equipmentType: "WMM Mixing Plant",    equipmentSpec: "100 TPH",       purpose: "mixing",     unit: "hrs", quantityPerShift: 11.200, formulaType: "FIXED", shiftOutputRef: 400, derivedPerUnit: 11.200 / 400 },
  { projectCategory: "LARGE",  sortOrder: 2, equipmentType: "Electric Generator",  equipmentSpec: "125 KVA",       purpose: "power",      unit: "hrs", quantityPerShift: 4.480,  formulaType: "FIXED", shiftOutputRef: 400, derivedPerUnit: 4.480 / 400 },
  { projectCategory: "MEDIUM", sortOrder: 2, equipmentType: "Electric Generator",  equipmentSpec: "100 KVA",       purpose: "power",      unit: "hrs", quantityPerShift: 5.600,  formulaType: "FIXED", shiftOutputRef: 400, derivedPerUnit: 5.600 / 400 },
  { projectCategory: "SMALL",  sortOrder: 2, equipmentType: "Electric Generator",  equipmentSpec: "62.5 KVA",      purpose: "power",      unit: "hrs", quantityPerShift: 11.200, formulaType: "FIXED", shiftOutputRef: 400, derivedPerUnit: 11.200 / 400 },
  { projectCategory: "LARGE",  sortOrder: 3, equipmentType: "Front End Loader",    equipmentSpec: "3.1 CUM",       purpose: "feeding",    unit: "hrs", quantityPerShift: 9.502,  formulaType: "FIXED", shiftOutputRef: 400, derivedPerUnit: 9.502 / 400 },
  { projectCategory: "MEDIUM", sortOrder: 3, equipmentType: "Front End Loader",    equipmentSpec: "2.1 CUM",       purpose: "feeding",    unit: "hrs", quantityPerShift: 14.047, formulaType: "FIXED", shiftOutputRef: 400, derivedPerUnit: 14.047 / 400 },
  { projectCategory: "SMALL",  sortOrder: 3, equipmentType: "Front End Loader",    equipmentSpec: "1 CUM",         purpose: "feeding",    unit: "hrs", quantityPerShift: 29.371, formulaType: "FIXED", shiftOutputRef: 400, derivedPerUnit: 29.371 / 400 },
  { projectCategory: "LARGE",  sortOrder: 4, equipmentType: "Tipper",              equipmentSpec: "18 CUM",        purpose: "transport",  unit: "t.km", quantityPerShift: null,  formulaType: "LEAD_VARIABLE", formulaExpr: "840*L1", shiftOutputRef: 400, derivedPerUnit: null },
  { projectCategory: "MEDIUM", sortOrder: 4, equipmentType: "Tipper",              equipmentSpec: "14 CUM",        purpose: "transport",  unit: "t.km", quantityPerShift: null,  formulaType: "LEAD_VARIABLE", formulaExpr: "840*L1", shiftOutputRef: 400, derivedPerUnit: null },
  { projectCategory: "SMALL",  sortOrder: 4, equipmentType: "Tipper",              equipmentSpec: "10 CUM",        purpose: "transport",  unit: "t.km", quantityPerShift: null,  formulaType: "LEAD_VARIABLE", formulaExpr: "840*L1", shiftOutputRef: 400, derivedPerUnit: null },
  { projectCategory: "LARGE",  sortOrder: 5, equipmentType: "Tipper",              equipmentSpec: "18 CUM (L/U)", purpose: "loading",    unit: "hrs", quantityPerShift: 4.449,  formulaType: "FIXED", shiftOutputRef: 400, derivedPerUnit: 4.449 / 400 },
  { projectCategory: "MEDIUM", sortOrder: 5, equipmentType: "Tipper",              equipmentSpec: "14 CUM (L/U)", purpose: "loading",    unit: "hrs", quantityPerShift: 5.600,  formulaType: "FIXED", shiftOutputRef: 400, derivedPerUnit: 5.600 / 400 },
  { projectCategory: "SMALL",  sortOrder: 5, equipmentType: "Tipper",              equipmentSpec: "10 CUM (L/U)", purpose: "loading",    unit: "hrs", quantityPerShift: 11.200, formulaType: "FIXED", shiftOutputRef: 400, derivedPerUnit: 11.200 / 400 },
  { projectCategory: "LARGE",  sortOrder: 6, equipmentType: "Motor Grader",        equipmentSpec: "4.30m blade",   purpose: "spreading",  unit: "hrs", quantityPerShift: null,   formulaType: "FIXED", shiftOutputRef: 400, derivedPerUnit: null, notes: "Hours not captured by OCR" },
  { projectCategory: "MEDIUM", sortOrder: 6, equipmentType: "Motor Grader",        equipmentSpec: "3.70m blade",   purpose: "spreading",  unit: "hrs", quantityPerShift: 3.391,  formulaType: "FIXED", shiftOutputRef: 400, derivedPerUnit: 3.391 / 400 },
  { projectCategory: "SMALL",  sortOrder: 6, equipmentType: "Motor Grader",        equipmentSpec: "3.35m blade",   purpose: "spreading",  unit: "hrs", quantityPerShift: 4.339,  formulaType: "FIXED", shiftOutputRef: 400, derivedPerUnit: 4.339 / 400 },
  { projectCategory: "ALL",    sortOrder: 7, equipmentType: "Vibratory Roller",    equipmentSpec: "",              purpose: "compaction", unit: "hrs", quantityPerShift: 2.589,  formulaType: "FIXED", shiftOutputRef: 400, derivedPerUnit: 2.589 / 400 },
];

export const GSB_MATERIALS = [
  // Grading-I: 27.5-22.5-12.5-37.5
  { projectCategory: "ALL", gradingVariant: "Grading-I", sortOrder: 1, materialName: "Aggregate 53–26.5mm @ 27.5%",    materialCategory: "AGGREGATE", sieveFromMm: 53,   sieveToMm: 26.5, pctByWeight: 27.5, unit: "CUM", quantityPerShift: 148.077, shiftOutputRef: 400, derivedPerUnit: 148.077 / 400 },
  { projectCategory: "ALL", gradingVariant: "Grading-I", sortOrder: 2, materialName: "Aggregate 26.5–9.5mm @ 22.5%",  materialCategory: "AGGREGATE", sieveFromMm: 26.5, sieveToMm: 9.5,  pctByWeight: 22.5, unit: "CUM", quantityPerShift: 121.154, shiftOutputRef: 400, derivedPerUnit: 121.154 / 400 },
  { projectCategory: "ALL", gradingVariant: "Grading-I", sortOrder: 3, materialName: "Aggregate 9.5–4.75mm @ 12.5%",  materialCategory: "AGGREGATE", sieveFromMm: 9.5,  sieveToMm: 4.75, pctByWeight: 12.5, unit: "CUM", quantityPerShift: 67.308,  shiftOutputRef: 400, derivedPerUnit: 67.308 / 400 },
  { projectCategory: "ALL", gradingVariant: "Grading-I", sortOrder: 4, materialName: "Aggregate <4.75mm @ 37.5%",     materialCategory: "AGGREGATE", sieveFromMm: null, sieveToMm: 4.75, pctByWeight: 37.5, unit: "CUM", quantityPerShift: 201.923, shiftOutputRef: 400, derivedPerUnit: 201.923 / 400 },
  { projectCategory: "ALL", gradingVariant: "Grading-I", sortOrder: 5, materialName: "Water",                         materialCategory: "WATER",     unit: "KL",  quantityPerShift: 67.200, shiftOutputRef: 400, derivedPerUnit: 67.200 / 400 },
  // Grading-II: 35-12.5-52.5
  { projectCategory: "ALL", gradingVariant: "Grading-II", sortOrder: 1, materialName: "Aggregate 26.5–9.5mm @ 35%",   materialCategory: "AGGREGATE", sieveFromMm: 26.5, sieveToMm: 9.5,  pctByWeight: 35.0, unit: "CUM", quantityPerShift: 117.788, shiftOutputRef: 400, derivedPerUnit: 117.788 / 400 },
  { projectCategory: "ALL", gradingVariant: "Grading-II", sortOrder: 2, materialName: "Aggregate 9.5–4.75mm @ 12.5%", materialCategory: "AGGREGATE", sieveFromMm: 9.5,  sieveToMm: 4.75, pctByWeight: 12.5, unit: "CUM", quantityPerShift: 42.067,  shiftOutputRef: 400, derivedPerUnit: 42.067 / 400 },
  { projectCategory: "ALL", gradingVariant: "Grading-II", sortOrder: 3, materialName: "Aggregate <4.75mm @ 52.5%",    materialCategory: "AGGREGATE", sieveFromMm: null, sieveToMm: 4.75, pctByWeight: 52.5, unit: "CUM", quantityPerShift: 176.683, shiftOutputRef: 400, derivedPerUnit: 176.683 / 400 },
  { projectCategory: "ALL", gradingVariant: "Grading-II", sortOrder: 4, materialName: "Water",                        materialCategory: "WATER",     unit: "KL",  quantityPerShift: 67.200, shiftOutputRef: 400, derivedPerUnit: 67.200 / 400 },
  // Grading-III: 68-12-20
  { projectCategory: "ALL", gradingVariant: "Grading-III", sortOrder: 1, materialName: "Aggregate 26.5–9.5mm @ 68%",  materialCategory: "AGGREGATE", sieveFromMm: 26.5, sieveToMm: 9.5,  pctByWeight: 68.0, unit: "CUM", quantityPerShift: 228.846, shiftOutputRef: 400, derivedPerUnit: 228.846 / 400 },
  { projectCategory: "ALL", gradingVariant: "Grading-III", sortOrder: 2, materialName: "Aggregate 9.5–4.75mm @ 12%",  materialCategory: "AGGREGATE", sieveFromMm: 9.5,  sieveToMm: 4.75, pctByWeight: 12.0, unit: "CUM", quantityPerShift: 40.385,  shiftOutputRef: 400, derivedPerUnit: 40.385 / 400 },
  { projectCategory: "ALL", gradingVariant: "Grading-III", sortOrder: 3, materialName: "Aggregate <4.75mm @ 20%",     materialCategory: "AGGREGATE", sieveFromMm: null, sieveToMm: 4.75, pctByWeight: 20.0, unit: "CUM", quantityPerShift: 67.308,  shiftOutputRef: 400, derivedPerUnit: 67.308 / 400 },
  { projectCategory: "ALL", gradingVariant: "Grading-III", sortOrder: 4, materialName: "Water",                       materialCategory: "WATER",     unit: "KL",  quantityPerShift: 67.200, shiftOutputRef: 400, derivedPerUnit: 67.200 / 400 },
  // Grading-IV: 64-11-25
  { projectCategory: "ALL", gradingVariant: "Grading-IV", sortOrder: 1, materialName: "Aggregate 26.5–9.5mm @ 64%",  materialCategory: "AGGREGATE", sieveFromMm: 26.5, sieveToMm: 9.5,  pctByWeight: 64.0, unit: "CUM", quantityPerShift: 215.385, shiftOutputRef: 400, derivedPerUnit: 215.385 / 400 },
  { projectCategory: "ALL", gradingVariant: "Grading-IV", sortOrder: 2, materialName: "Aggregate 9.5–4.75mm @ 11%",  materialCategory: "AGGREGATE", sieveFromMm: 9.5,  sieveToMm: 4.75, pctByWeight: 11.0, unit: "CUM", quantityPerShift: 37.019,  shiftOutputRef: 400, derivedPerUnit: 37.019 / 400 },
  { projectCategory: "ALL", gradingVariant: "Grading-IV", sortOrder: 3, materialName: "Aggregate <4.75mm @ 25%",     materialCategory: "AGGREGATE", sieveFromMm: null, sieveToMm: 4.75, pctByWeight: 25.0, unit: "CUM", quantityPerShift: 84.135,  shiftOutputRef: 400, derivedPerUnit: 84.135 / 400 },
  { projectCategory: "ALL", gradingVariant: "Grading-IV", sortOrder: 4, materialName: "Water",                       materialCategory: "WATER",     unit: "KL",  quantityPerShift: 67.200, shiftOutputRef: 400, derivedPerUnit: 67.200 / 400 },
  // Grading-V: 27.5-22.5-12.5-37.5 (53mm top size)
  { projectCategory: "ALL", gradingVariant: "Grading-V", sortOrder: 1, materialName: "Aggregate 53–26.5mm @ 27.5%",  materialCategory: "AGGREGATE", sieveFromMm: 53,   sieveToMm: 26.5, pctByWeight: 27.5, unit: "CUM", quantityPerShift: 92.548,  shiftOutputRef: 400, derivedPerUnit: 92.548 / 400 },
  { projectCategory: "ALL", gradingVariant: "Grading-V", sortOrder: 2, materialName: "Aggregate 26.5–9.5mm @ 22.5%", materialCategory: "AGGREGATE", sieveFromMm: 26.5, sieveToMm: 9.5,  pctByWeight: 22.5, unit: "CUM", quantityPerShift: 75.721,  shiftOutputRef: 400, derivedPerUnit: 75.721 / 400 },
  { projectCategory: "ALL", gradingVariant: "Grading-V", sortOrder: 3, materialName: "Aggregate 9.5–4.75mm @ 12.5%", materialCategory: "AGGREGATE", sieveFromMm: 9.5,  sieveToMm: 4.75, pctByWeight: 12.5, unit: "CUM", quantityPerShift: 42.067,  shiftOutputRef: 400, derivedPerUnit: 42.067 / 400 },
  { projectCategory: "ALL", gradingVariant: "Grading-V", sortOrder: 4, materialName: "Aggregate <4.75mm @ 37.5%",    materialCategory: "AGGREGATE", sieveFromMm: null, sieveToMm: 4.75, pctByWeight: 37.5, unit: "CUM", quantityPerShift: 126.202, shiftOutputRef: 400, derivedPerUnit: 126.202 / 400 },
  { projectCategory: "ALL", gradingVariant: "Grading-V", sortOrder: 5, materialName: "Water",                        materialCategory: "WATER",     unit: "KL",  quantityPerShift: 67.200, shiftOutputRef: 400, derivedPerUnit: 67.200 / 400 },
];

// ─── ITEM 3: WMM 4.14 ──────────────────────────────────────────────────────
export const WMM_ITEM = {
  itemCode: "4.14",
  description: "Wet Mix Macadam (Plant Mix Method) — Providing, laying, spreading and compacting graded stone aggregate to wet mix macadam specification including premixing the material with water at OMC in mechanical mix plant, carriage of mixed material by tipper to site, laying in uniform layers with grader in sub-base/base course on prepared surface and compacting with vibratory roller to achieve the desired density. Laying using Grader.",
  shortLabel: "WMM — Plant Mix Method",
  unit: "CUM",
  workCategory: "BASE_COURSE",
  workSubCategory: "Wet Mix Macadam",
  chapterNo: "4",
  chapterTitle: "Sub-Bases, Bases (Non-Bituminous) and Shoulders",
  sourcePage: "120",
  specClause: "Clause 406",
  isMixSpecific: false,
  hasGradingVariants: false,
  notes: "Cleanest OCR of all 5 items. Aggregate gradation per MoRTH Table 400-13.",
};

export const WMM_PRODUCTIVITY = [
  { projectCategory: "LARGE",  shiftOutput: 225, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 28.125 },
  { projectCategory: "MEDIUM", shiftOutput: 225, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 28.125 },
  { projectCategory: "SMALL",  shiftOutput: 225, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 28.125 },
];

export const WMM_LABOUR = [
  { projectCategory: "ALL", sortOrder: 1, designation: "Mate",            skillTier: "SUPERVISORY", unit: "day", quantityPerShift: 0.160, shiftOutputRef: 225, derivedPerUnit: 0.160 / 225 },
  { projectCategory: "ALL", sortOrder: 2, designation: "Mazdoor Skilled", skillTier: "SKILLED",     unit: "day", quantityPerShift: 1.000, shiftOutputRef: 225, derivedPerUnit: 1.000 / 225 },
  { projectCategory: "ALL", sortOrder: 3, designation: "Mazdoor",         skillTier: "UNSKILLED",   unit: "day", quantityPerShift: 3.000, shiftOutputRef: 225, derivedPerUnit: 3.000 / 225 },
];

export const WMM_EQUIPMENT = [
  { projectCategory: "LARGE",  sortOrder: 1, equipmentType: "WMM Mixing Plant",   equipmentSpec: "250 TPH",       purpose: "mixing",    unit: "hrs", quantityPerShift: 2.640,  formulaType: "FIXED", shiftOutputRef: 225, derivedPerUnit: 2.640 / 225 },
  { projectCategory: "MEDIUM", sortOrder: 1, equipmentType: "WMM Mixing Plant",   equipmentSpec: "200 TPH",       purpose: "mixing",    unit: "hrs", quantityPerShift: 3.300,  formulaType: "FIXED", shiftOutputRef: 225, derivedPerUnit: 3.300 / 225 },
  { projectCategory: "SMALL",  sortOrder: 1, equipmentType: "WMM Mixing Plant",   equipmentSpec: "100 TPH",       purpose: "mixing",    unit: "hrs", quantityPerShift: 6.600,  formulaType: "FIXED", shiftOutputRef: 225, derivedPerUnit: 6.600 / 225 },
  { projectCategory: "LARGE",  sortOrder: 2, equipmentType: "Electric Generator", equipmentSpec: "125 KVA",       purpose: "power",     unit: "hrs", quantityPerShift: 2.640,  formulaType: "FIXED", shiftOutputRef: 225, derivedPerUnit: 2.640 / 225 },
  { projectCategory: "MEDIUM", sortOrder: 2, equipmentType: "Electric Generator", equipmentSpec: "100 KVA",       purpose: "power",     unit: "hrs", quantityPerShift: 3.300,  formulaType: "FIXED", shiftOutputRef: 225, derivedPerUnit: 3.300 / 225 },
  { projectCategory: "SMALL",  sortOrder: 2, equipmentType: "Electric Generator", equipmentSpec: "62.5 KVA",      purpose: "power",     unit: "hrs", quantityPerShift: 6.600,  formulaType: "FIXED", shiftOutputRef: 225, derivedPerUnit: 6.600 / 225 },
  { projectCategory: "LARGE",  sortOrder: 3, equipmentType: "Front End Loader",   equipmentSpec: "3.1 CUM",       purpose: "feeding",   unit: "hrs", quantityPerShift: 2.640,  formulaType: "FIXED", shiftOutputRef: 225, derivedPerUnit: 2.640 / 225 },
  { projectCategory: "MEDIUM", sortOrder: 3, equipmentType: "Front End Loader",   equipmentSpec: "2.1 CUM",       purpose: "feeding",   unit: "hrs", quantityPerShift: 3.300,  formulaType: "FIXED", shiftOutputRef: 225, derivedPerUnit: 3.300 / 225 },
  { projectCategory: "SMALL",  sortOrder: 3, equipmentType: "Front End Loader",   equipmentSpec: "1 CUM",         purpose: "feeding",   unit: "hrs", quantityPerShift: 6.600,  formulaType: "FIXED", shiftOutputRef: 225, derivedPerUnit: 6.600 / 225 },
  { projectCategory: "LARGE",  sortOrder: 4, equipmentType: "Tipper",             equipmentSpec: "18 CUM",        purpose: "transport", unit: "t.km", quantityPerShift: null,  formulaType: "LEAD_VARIABLE", formulaExpr: "495*L2", shiftOutputRef: 225, derivedPerUnit: null },
  { projectCategory: "MEDIUM", sortOrder: 4, equipmentType: "Tipper",             equipmentSpec: "14 CUM",        purpose: "transport", unit: "t.km", quantityPerShift: null,  formulaType: "LEAD_VARIABLE", formulaExpr: "495*L2", shiftOutputRef: 225, derivedPerUnit: null },
  { projectCategory: "SMALL",  sortOrder: 4, equipmentType: "Tipper",             equipmentSpec: "10 CUM",        purpose: "transport", unit: "t.km", quantityPerShift: null,  formulaType: "LEAD_VARIABLE", formulaExpr: "495*L2", shiftOutputRef: 225, derivedPerUnit: null },
  { projectCategory: "LARGE",  sortOrder: 5, equipmentType: "Tipper",             equipmentSpec: "18 CUM (L/U)", purpose: "loading",   unit: "hrs", quantityPerShift: 2.640,  formulaType: "FIXED", shiftOutputRef: 225, derivedPerUnit: 2.640 / 225 },
  { projectCategory: "MEDIUM", sortOrder: 5, equipmentType: "Tipper",             equipmentSpec: "14 CUM (L/U)", purpose: "loading",   unit: "hrs", quantityPerShift: 3.300,  formulaType: "FIXED", shiftOutputRef: 225, derivedPerUnit: 3.300 / 225 },
  { projectCategory: "SMALL",  sortOrder: 5, equipmentType: "Tipper",             equipmentSpec: "10 CUM (L/U)", purpose: "loading",   unit: "hrs", quantityPerShift: 6.600,  formulaType: "FIXED", shiftOutputRef: 225, derivedPerUnit: 6.600 / 225 },
  { projectCategory: "LARGE",  sortOrder: 6, equipmentType: "Motor Grader",       equipmentSpec: "4.30m blade",   purpose: "spreading", unit: "hrs", quantityPerShift: 1.815,  formulaType: "FIXED", shiftOutputRef: 225, derivedPerUnit: 1.815 / 225 },
  { projectCategory: "MEDIUM", sortOrder: 6, equipmentType: "Motor Grader",       equipmentSpec: "3.70m blade",   purpose: "spreading", unit: "hrs", quantityPerShift: 2.189,  formulaType: "FIXED", shiftOutputRef: 225, derivedPerUnit: 2.189 / 225 },
  { projectCategory: "SMALL",  sortOrder: 6, equipmentType: "Motor Grader",       equipmentSpec: "3.35m blade",   purpose: "spreading", unit: "hrs", quantityPerShift: 2.441,  formulaType: "FIXED", shiftOutputRef: 225, derivedPerUnit: 2.441 / 225 },
  { projectCategory: "ALL",    sortOrder: 7, equipmentType: "Vibratory Roller",   equipmentSpec: "",              purpose: "compaction",unit: "hrs", quantityPerShift: 1.456,  formulaType: "FIXED", shiftOutputRef: 225, derivedPerUnit: 1.456 / 225 },
];

export const WMM_MATERIALS = [
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 1, materialName: "Aggregate 45–22.4mm @ 30%",      materialCategory: "AGGREGATE", sieveFromMm: 45,   sieveToMm: 22.4, pctByWeight: 30, unit: "CUM", quantityPerShift: 95.192,  shiftOutputRef: 225, derivedPerUnit: 95.192 / 225 },
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 2, materialName: "Aggregate 22.4–2.36mm @ 40%",    materialCategory: "AGGREGATE", sieveFromMm: 22.4, sieveToMm: 2.36, pctByWeight: 40, unit: "CUM", quantityPerShift: 126.923, shiftOutputRef: 225, derivedPerUnit: 126.923 / 225 },
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 3, materialName: "Aggregate 2.36mm–75μm @ 30%",    materialCategory: "AGGREGATE", sieveFromMm: 2.36, sieveToMm: 0.075,pctByWeight: 30, unit: "CUM", quantityPerShift: 95.192,  shiftOutputRef: 225, derivedPerUnit: 95.192 / 225 },
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 4, materialName: "Water",                           materialCategory: "WATER",     unit: "KL",  quantityPerShift: 59.400, shiftOutputRef: 225, derivedPerUnit: 59.400 / 225 },
];

// ─── ITEM 4: DBM 5.04B ─────────────────────────────────────────────────────
export const DBM_ITEM = {
  itemCode: "5.04B",
  description: "Dense Graded Bituminous Macadam Grading-II — Providing and laying dense graded bituminous macadam with higher capacity batch type Hot Mix Plant using crushed aggregates of specified grading, premixed with bituminous binder @ 4.5% by weight of total mix and filler, transporting the hot mix to work site, laying with a hydrostatic paver finisher with sensor control to the required grade, level and alignment, rolling with smooth wheeled, vibratory and tandem rollers to achieve the desired compaction as per MoRTH Specification Clause No. 505, complete in all respects.",
  shortLabel: "DBM Grading-II (26.5mm)",
  unit: "CUM",
  workCategory: "BITUMINOUS",
  workSubCategory: "Dense Bituminous Macadam",
  chapterNo: "5",
  chapterTitle: "Bases and Surface Courses (Bituminous)",
  sourcePage: "147",
  specClause: "Clause 505",
  isMixSpecific: true,
  hasGradingVariants: true,
  notes: "Equipment/labour are standard SDB. Materials (binder %, aggregate grading) must come from project JMF. Binder: SDB shows 4.0% by mass (18.018T on 450.45T mix); description states 4.5% — verify at p.147.",
};

export const DBM_PRODUCTIVITY = [
  { projectCategory: "LARGE",  shiftOutput: 195, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 24.375 },
  { projectCategory: "MEDIUM", shiftOutput: 195, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 24.375 },
  { projectCategory: "SMALL",  shiftOutput: 195, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 24.375 },
];

export const DBM_LABOUR = [
  { projectCategory: "ALL", sortOrder: 1, designation: "Mate",            skillTier: "SUPERVISORY", unit: "day", quantityPerShift: 0.440, shiftOutputRef: 195, derivedPerUnit: 0.440 / 195 },
  { projectCategory: "ALL", sortOrder: 2, designation: "Mazdoor",         skillTier: "UNSKILLED",   unit: "day", quantityPerShift: 6.000, shiftOutputRef: 195, derivedPerUnit: 6.000 / 195 },
  { projectCategory: "ALL", sortOrder: 3, designation: "Mazdoor Skilled", skillTier: "SKILLED",     unit: "day", quantityPerShift: 5.000, shiftOutputRef: 195, derivedPerUnit: 5.000 / 195 },
];

export const DBM_EQUIPMENT = [
  { projectCategory: "LARGE",  sortOrder: 1, equipmentType: "Hot Mix Plant",          equipmentSpec: "200 TPH",         purpose: "mixing",     unit: "hrs", quantityPerShift: 3.003,  formulaType: "FIXED", shiftOutputRef: 195, derivedPerUnit: 3.003 / 195 },
  { projectCategory: "MEDIUM", sortOrder: 1, equipmentType: "Hot Mix Plant",          equipmentSpec: "160 TPH",         purpose: "mixing",     unit: "hrs", quantityPerShift: 3.754,  formulaType: "FIXED", shiftOutputRef: 195, derivedPerUnit: 3.754 / 195 },
  { projectCategory: "SMALL",  sortOrder: 1, equipmentType: "Hot Mix Plant",          equipmentSpec: "120 TPH",         purpose: "mixing",     unit: "hrs", quantityPerShift: 5.005,  formulaType: "FIXED", shiftOutputRef: 195, derivedPerUnit: 5.005 / 195 },
  { projectCategory: "ALL",    sortOrder: 2, equipmentType: "Mechanical Broom",       equipmentSpec: "2.1m width",      purpose: "cleaning",   unit: "hrs", quantityPerShift: 0.663,  formulaType: "FIXED", shiftOutputRef: 195, derivedPerUnit: 0.663 / 195 },
  { projectCategory: "ALL",    sortOrder: 3, equipmentType: "Air Compressor",         equipmentSpec: "250 CFM",         purpose: "cleaning",   unit: "hrs", quantityPerShift: 0.663,  formulaType: "FIXED", shiftOutputRef: 195, derivedPerUnit: 0.663 / 195 },
  { projectCategory: "LARGE",  sortOrder: 4, equipmentType: "Paver Finisher",         equipmentSpec: "240 HP hydrostatic", purpose: "laying", unit: "hrs", quantityPerShift: 3.003,  formulaType: "FIXED", shiftOutputRef: 195, derivedPerUnit: 3.003 / 195 },
  { projectCategory: "MEDIUM", sortOrder: 4, equipmentType: "Paver Finisher",         equipmentSpec: "240 HP hydrostatic", purpose: "laying", unit: "hrs", quantityPerShift: 3.754,  formulaType: "FIXED", shiftOutputRef: 195, derivedPerUnit: 3.754 / 195 },
  { projectCategory: "SMALL",  sortOrder: 4, equipmentType: "Paver Finisher",         equipmentSpec: "174 HP hydrostatic", purpose: "laying", unit: "hrs", quantityPerShift: 5.005,  formulaType: "FIXED", shiftOutputRef: 195, derivedPerUnit: 5.005 / 195 },
  { projectCategory: "LARGE",  sortOrder: 5, equipmentType: "Electric Generator",     equipmentSpec: "500 KVA",         purpose: "power",      unit: "hrs", quantityPerShift: 3.003,  formulaType: "FIXED", shiftOutputRef: 195, derivedPerUnit: 3.003 / 195 },
  { projectCategory: "MEDIUM", sortOrder: 5, equipmentType: "Electric Generator",     equipmentSpec: "400 KVA",         purpose: "power",      unit: "hrs", quantityPerShift: 3.754,  formulaType: "FIXED", shiftOutputRef: 195, derivedPerUnit: 3.754 / 195 },
  { projectCategory: "SMALL",  sortOrder: 5, equipmentType: "Electric Generator",     equipmentSpec: "350 KVA",         purpose: "power",      unit: "hrs", quantityPerShift: 5.005,  formulaType: "FIXED", shiftOutputRef: 195, derivedPerUnit: 5.005 / 195 },
  { projectCategory: "LARGE",  sortOrder: 6, equipmentType: "Front End Loader",       equipmentSpec: "3.1 CUM",         purpose: "feeding",    unit: "hrs", quantityPerShift: 5.138,  formulaType: "FIXED", shiftOutputRef: 195, derivedPerUnit: 5.138 / 195 },
  { projectCategory: "MEDIUM", sortOrder: 6, equipmentType: "Front End Loader",       equipmentSpec: "2.1 CUM",         purpose: "feeding",    unit: "hrs", quantityPerShift: 7.508,  formulaType: "FIXED", shiftOutputRef: 195, derivedPerUnit: 7.508 / 195 },
  { projectCategory: "SMALL",  sortOrder: 6, equipmentType: "Front End Loader",       equipmentSpec: "1 CUM",           purpose: "feeding",    unit: "hrs", quantityPerShift: 15.882, formulaType: "FIXED", shiftOutputRef: 195, derivedPerUnit: 15.882 / 195 },
  { projectCategory: "ALL",    sortOrder: 7, equipmentType: "Tipper",                 equipmentSpec: "transport",       purpose: "transport",  unit: "t.km", quantityPerShift: null, formulaType: "LEAD_VARIABLE", formulaExpr: "450.45*L1", shiftOutputRef: 195, derivedPerUnit: null },
  { projectCategory: "LARGE",  sortOrder: 8, equipmentType: "Tipper",                 equipmentSpec: "18 CUM (L/U)",   purpose: "loading",    unit: "hrs", quantityPerShift: 6.006,  formulaType: "FIXED", shiftOutputRef: 195, derivedPerUnit: 6.006 / 195 },
  { projectCategory: "MEDIUM", sortOrder: 8, equipmentType: "Tipper",                 equipmentSpec: "14 CUM (L/U)",   purpose: "loading",    unit: "hrs", quantityPerShift: 7.508,  formulaType: "FIXED", shiftOutputRef: 195, derivedPerUnit: 7.508 / 195 },
  { projectCategory: "SMALL",  sortOrder: 8, equipmentType: "Tipper",                 equipmentSpec: "10 CUM (L/U)",   purpose: "loading",    unit: "hrs", quantityPerShift: 10.010, formulaType: "FIXED", shiftOutputRef: 195, derivedPerUnit: 10.010 / 195 },
  { projectCategory: "ALL",    sortOrder: 9, equipmentType: "Smooth Steel Tandem Roller", equipmentSpec: "static+vibratory", purpose: "compaction", unit: "hrs", quantityPerShift: 9.663, formulaType: "FIXED", shiftOutputRef: 195, derivedPerUnit: 9.663 / 195 },
];

export const DBM_MATERIALS = [
  // Grading-II (26.5mm nominal) — SDB default, use JMF for actual project
  { projectCategory: "ALL", gradingVariant: "Grading-II", sortOrder: 1, materialName: "Bitumen @ 4.0% of mix",         materialCategory: "BINDER",    unit: "MT",  quantityPerShift: 18.018, shiftOutputRef: 195, derivedPerUnit: 18.018 / 195, isDesignSpecific: true, notes: "Verify: description says 4.5%, computed value is 4.0% — use JMF" },
  { projectCategory: "ALL", gradingVariant: "Grading-II", sortOrder: 2, materialName: "Aggregate 25–10mm @ 28%",       materialCategory: "AGGREGATE", sieveFromMm: 25,   sieveToMm: 10,   pctByWeight: 28, unit: "CUM", quantityPerShift: 80.300,  shiftOutputRef: 195, derivedPerUnit: 80.300 / 195, isDesignSpecific: true },
  { projectCategory: "ALL", gradingVariant: "Grading-II", sortOrder: 3, materialName: "Aggregate 10–4.75mm @ 28%",     materialCategory: "AGGREGATE", sieveFromMm: 10,   sieveToMm: 4.75, pctByWeight: 28, unit: "CUM", quantityPerShift: 80.300,  shiftOutputRef: 195, derivedPerUnit: 80.300 / 195, isDesignSpecific: true },
  { projectCategory: "ALL", gradingVariant: "Grading-II", sortOrder: 4, materialName: "Aggregate <4.75mm @ 40%",       materialCategory: "AGGREGATE", sieveFromMm: null, sieveToMm: 4.75, pctByWeight: 40, unit: "CUM", quantityPerShift: 114.715, shiftOutputRef: 195, derivedPerUnit: 114.715 / 195, isDesignSpecific: true },
  { projectCategory: "ALL", gradingVariant: "Grading-II", sortOrder: 5, materialName: "Filler @ 2% of aggregate wt",   materialCategory: "FILLER",    unit: "CUM", quantityPerShift: 8.604,  shiftOutputRef: 195, derivedPerUnit: 8.604 / 195, isDesignSpecific: true },
  // Grading-I (37.5mm nominal)
  { projectCategory: "ALL", gradingVariant: "Grading-I", sortOrder: 1, materialName: "Bitumen @ 4.0% of mix",          materialCategory: "BINDER",    unit: "MT",  quantityPerShift: 18.018, shiftOutputRef: 195, derivedPerUnit: 18.018 / 195, isDesignSpecific: true },
  { projectCategory: "ALL", gradingVariant: "Grading-I", sortOrder: 2, materialName: "Aggregate 37.5–25mm @ 22%",      materialCategory: "AGGREGATE", sieveFromMm: 37.5, sieveToMm: 25,   pctByWeight: 22, unit: "CUM", quantityPerShift: 63.423,  shiftOutputRef: 195, derivedPerUnit: 63.423 / 195, isDesignSpecific: true },
  { projectCategory: "ALL", gradingVariant: "Grading-I", sortOrder: 3, materialName: "Aggregate 25–10mm @ 14%",        materialCategory: "AGGREGATE", sieveFromMm: 25,   sieveToMm: 10,   pctByWeight: 14, unit: "CUM", quantityPerShift: 37.477,  shiftOutputRef: 195, derivedPerUnit: 37.477 / 195, isDesignSpecific: true },
  { projectCategory: "ALL", gradingVariant: "Grading-I", sortOrder: 4, materialName: "Aggregate 10–4.75mm @ 19%",      materialCategory: "AGGREGATE", sieveFromMm: 10,   sieveToMm: 4.75, pctByWeight: 19, unit: "CUM", quantityPerShift: 54.775,  shiftOutputRef: 195, derivedPerUnit: 54.775 / 195, isDesignSpecific: true },
  { projectCategory: "ALL", gradingVariant: "Grading-I", sortOrder: 5, materialName: "Aggregate <4.75mm @ 44%",        materialCategory: "AGGREGATE", sieveFromMm: null, sieveToMm: 4.75, pctByWeight: 44, unit: "CUM", quantityPerShift: 126.847, shiftOutputRef: 195, derivedPerUnit: 126.847 / 195, isDesignSpecific: true },
  { projectCategory: "ALL", gradingVariant: "Grading-I", sortOrder: 6, materialName: "Filler @ 2% of aggregate wt",    materialCategory: "FILLER",    unit: "CUM", quantityPerShift: 8.649,  shiftOutputRef: 195, derivedPerUnit: 8.649 / 195, isDesignSpecific: true },
];

// ─── ITEM 5: BC 5.05 ───────────────────────────────────────────────────────
export const BC_ITEM = {
  itemCode: "5.05",
  description: "Bituminous Concrete — Providing bituminous concrete with higher capacity batch type hot mix plant using crushed aggregates of specified grading, premixed with bituminous binder @ 5.2% (Grading-I) / 5.4% (Grading-II) of mix and filler, transporting the hot mix to work site, laying with a hydrostatic paver finisher with sensor control to the required grade, level and alignment, rolling with smooth wheeled, vibratory and tandem rollers to achieve the desired compaction as per MoRTH Specification Clause No. 507, complete in all respects.",
  shortLabel: "Bituminous Concrete (BC)",
  unit: "CUM",
  workCategory: "BITUMINOUS",
  workSubCategory: "Bituminous Concrete",
  chapterNo: "5",
  chapterTitle: "Bases and Surface Courses (Bituminous)",
  sourcePage: "149",
  specClause: "Clause 507",
  isMixSpecific: true,
  hasGradingVariants: true,
  notes: "Key differences from DBM: tandem roller 16.902 vs 9.663 hrs (BC needs more passes), adds Pneumatic Tyre Roller not in DBM, more broom time (1.624 vs 0.663 hrs). Both Grading-I and Grading-II fully captured.",
};

export const BC_PRODUCTIVITY = [
  { projectCategory: "LARGE",  shiftOutput: 191, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 23.875 },
  { projectCategory: "MEDIUM", shiftOutput: 191, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 23.875 },
  { projectCategory: "SMALL",  shiftOutput: 191, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 23.875 },
];

export const BC_LABOUR = [
  { projectCategory: "ALL", sortOrder: 1, designation: "Mate",            skillTier: "SUPERVISORY", unit: "day", quantityPerShift: 0.440, shiftOutputRef: 191, derivedPerUnit: 0.440 / 191 },
  { projectCategory: "ALL", sortOrder: 2, designation: "Mazdoor",         skillTier: "UNSKILLED",   unit: "day", quantityPerShift: 6.000, shiftOutputRef: 191, derivedPerUnit: 6.000 / 191 },
  { projectCategory: "ALL", sortOrder: 3, designation: "Mazdoor Skilled", skillTier: "SKILLED",     unit: "day", quantityPerShift: 5.000, shiftOutputRef: 191, derivedPerUnit: 5.000 / 191 },
];

export const BC_EQUIPMENT = [
  { projectCategory: "LARGE",  sortOrder: 1, equipmentType: "Hot Mix Plant",              equipmentSpec: "200 TPH",              purpose: "mixing",     unit: "hrs", quantityPerShift: 3.005,  formulaType: "FIXED", shiftOutputRef: 191, derivedPerUnit: 3.005 / 191 },
  { projectCategory: "MEDIUM", sortOrder: 1, equipmentType: "Hot Mix Plant",              equipmentSpec: "160 TPH",              purpose: "mixing",     unit: "hrs", quantityPerShift: 3.756,  formulaType: "FIXED", shiftOutputRef: 191, derivedPerUnit: 3.756 / 191 },
  { projectCategory: "SMALL",  sortOrder: 1, equipmentType: "Hot Mix Plant",              equipmentSpec: "120 TPH",              purpose: "mixing",     unit: "hrs", quantityPerShift: 5.008,  formulaType: "FIXED", shiftOutputRef: 191, derivedPerUnit: 5.008 / 191 },
  { projectCategory: "ALL",    sortOrder: 2, equipmentType: "Mechanical Broom",           equipmentSpec: "2.1m width",           purpose: "cleaning",   unit: "hrs", quantityPerShift: 1.624,  formulaType: "FIXED", shiftOutputRef: 191, derivedPerUnit: 1.624 / 191 },
  { projectCategory: "ALL",    sortOrder: 3, equipmentType: "Air Compressor",             equipmentSpec: "250 CFM",              purpose: "cleaning",   unit: "hrs", quantityPerShift: 1.624,  formulaType: "FIXED", shiftOutputRef: 191, derivedPerUnit: 1.624 / 191 },
  { projectCategory: "LARGE",  sortOrder: 4, equipmentType: "Paver Finisher",             equipmentSpec: "240 HP hydrostatic",   purpose: "laying",     unit: "hrs", quantityPerShift: 3.005,  formulaType: "FIXED", shiftOutputRef: 191, derivedPerUnit: 3.005 / 191 },
  { projectCategory: "MEDIUM", sortOrder: 4, equipmentType: "Paver Finisher",             equipmentSpec: "240 HP hydrostatic",   purpose: "laying",     unit: "hrs", quantityPerShift: 3.756,  formulaType: "FIXED", shiftOutputRef: 191, derivedPerUnit: 3.756 / 191 },
  { projectCategory: "SMALL",  sortOrder: 4, equipmentType: "Paver Finisher",             equipmentSpec: "174 HP hydrostatic",   purpose: "laying",     unit: "hrs", quantityPerShift: 5.008,  formulaType: "FIXED", shiftOutputRef: 191, derivedPerUnit: 5.008 / 191 },
  { projectCategory: "LARGE",  sortOrder: 5, equipmentType: "Electric Generator",         equipmentSpec: "500 KVA",              purpose: "power",      unit: "hrs", quantityPerShift: 3.005,  formulaType: "FIXED", shiftOutputRef: 191, derivedPerUnit: 3.005 / 191 },
  { projectCategory: "MEDIUM", sortOrder: 5, equipmentType: "Electric Generator",         equipmentSpec: "400 KVA",              purpose: "power",      unit: "hrs", quantityPerShift: 3.756,  formulaType: "FIXED", shiftOutputRef: 191, derivedPerUnit: 3.756 / 191 },
  { projectCategory: "SMALL",  sortOrder: 5, equipmentType: "Electric Generator",         equipmentSpec: "250 KVA",              purpose: "power",      unit: "hrs", quantityPerShift: 5.008,  formulaType: "FIXED", shiftOutputRef: 191, derivedPerUnit: 5.008 / 191 },
  { projectCategory: "LARGE",  sortOrder: 6, equipmentType: "Front End Loader",           equipmentSpec: "3.1 CUM",              purpose: "feeding",    unit: "hrs", quantityPerShift: 5.004,  formulaType: "FIXED", shiftOutputRef: 191, derivedPerUnit: 5.004 / 191 },
  { projectCategory: "MEDIUM", sortOrder: 6, equipmentType: "Front End Loader",           equipmentSpec: "2.1 CUM",              purpose: "feeding",    unit: "hrs", quantityPerShift: 7.378,  formulaType: "FIXED", shiftOutputRef: 191, derivedPerUnit: 7.378 / 191 },
  { projectCategory: "SMALL",  sortOrder: 6, equipmentType: "Front End Loader",           equipmentSpec: "1 CUM",                purpose: "feeding",    unit: "hrs", quantityPerShift: 15.553, formulaType: "FIXED", shiftOutputRef: 191, derivedPerUnit: 15.553 / 191 },
  { projectCategory: "ALL",    sortOrder: 7, equipmentType: "Tipper",                     equipmentSpec: "transport",            purpose: "transport",  unit: "t.km", quantityPerShift: null, formulaType: "LEAD_VARIABLE", formulaExpr: "450.76*L1", shiftOutputRef: 191, derivedPerUnit: null },
  { projectCategory: "LARGE",  sortOrder: 8, equipmentType: "Tipper",                     equipmentSpec: "18 CUM (L/U)",        purpose: "loading",    unit: "hrs", quantityPerShift: 6.010,  formulaType: "FIXED", shiftOutputRef: 191, derivedPerUnit: 6.010 / 191 },
  { projectCategory: "MEDIUM", sortOrder: 8, equipmentType: "Tipper",                     equipmentSpec: "14 CUM (L/U)",        purpose: "loading",    unit: "hrs", quantityPerShift: 7.513,  formulaType: "FIXED", shiftOutputRef: 191, derivedPerUnit: 7.513 / 191 },
  { projectCategory: "SMALL",  sortOrder: 8, equipmentType: "Tipper",                     equipmentSpec: "10 CUM (L/U)",        purpose: "loading",    unit: "hrs", quantityPerShift: 10.017, formulaType: "FIXED", shiftOutputRef: 191, derivedPerUnit: 10.017 / 191 },
  { projectCategory: "ALL",    sortOrder: 9, equipmentType: "Smooth Steel Tandem Roller", equipmentSpec: "static+vibratory",    purpose: "compaction", unit: "hrs", quantityPerShift: 16.902, formulaType: "FIXED", shiftOutputRef: 191, derivedPerUnit: 16.902 / 191, notes: "BC needs ~2× roller passes vs DBM" },
  { projectCategory: "LARGE",  sortOrder: 10, equipmentType: "Pneumatic Tyre Roller",     equipmentSpec: "",                    purpose: "compaction", unit: "hrs", quantityPerShift: 2.404,  formulaType: "FIXED", shiftOutputRef: 191, derivedPerUnit: 2.404 / 191, notes: "BC only — not used in DBM" },
  { projectCategory: "MEDIUM", sortOrder: 10, equipmentType: "Pneumatic Tyre Roller",     equipmentSpec: "",                    purpose: "compaction", unit: "hrs", quantityPerShift: 3.005,  formulaType: "FIXED", shiftOutputRef: 191, derivedPerUnit: 3.005 / 191 },
  { projectCategory: "SMALL",  sortOrder: 10, equipmentType: "Pneumatic Tyre Roller",     equipmentSpec: "",                    purpose: "compaction", unit: "hrs", quantityPerShift: 4.007,  formulaType: "FIXED", shiftOutputRef: 191, derivedPerUnit: 4.007 / 191 },
];

export const BC_MATERIALS = [
  // Grading-I (19mm nominal, bitumen 5.2%)
  { projectCategory: "ALL", gradingVariant: "Grading-I", sortOrder: 1, materialName: "Bitumen @ 5.2% of mix",       materialCategory: "BINDER",    unit: "MT",  quantityPerShift: 23.440, shiftOutputRef: 191, derivedPerUnit: 23.440 / 191, isDesignSpecific: true },
  { projectCategory: "ALL", gradingVariant: "Grading-I", sortOrder: 2, materialName: "Aggregate 20–10mm @ 38%",     materialCategory: "AGGREGATE", sieveFromMm: 20,   sieveToMm: 10,   pctByWeight: 38, unit: "CUM", quantityPerShift: 108.255, shiftOutputRef: 191, derivedPerUnit: 108.255 / 191, isDesignSpecific: true },
  { projectCategory: "ALL", gradingVariant: "Grading-I", sortOrder: 3, materialName: "Aggregate 10–5mm @ 17%",      materialCategory: "AGGREGATE", sieveFromMm: 10,   sieveToMm: 5,    pctByWeight: 17, unit: "CUM", quantityPerShift: 48.430,  shiftOutputRef: 191, derivedPerUnit: 48.430 / 191, isDesignSpecific: true },
  { projectCategory: "ALL", gradingVariant: "Grading-I", sortOrder: 4, materialName: "Aggregate <5mm @ 43%",        materialCategory: "AGGREGATE", sieveFromMm: null, sieveToMm: 5,    pctByWeight: 43, unit: "CUM", quantityPerShift: 122.499, shiftOutputRef: 191, derivedPerUnit: 122.499 / 191, isDesignSpecific: true },
  { projectCategory: "ALL", gradingVariant: "Grading-I", sortOrder: 5, materialName: "Filler @ 2% of aggregate wt", materialCategory: "FILLER",    unit: "CUM", quantityPerShift: 8.546,  shiftOutputRef: 191, derivedPerUnit: 8.546 / 191, isDesignSpecific: true },
  // Grading-II (13mm nominal, bitumen 5.4%)
  { projectCategory: "ALL", gradingVariant: "Grading-II", sortOrder: 1, materialName: "Bitumen @ 5.4% of mix",      materialCategory: "BINDER",    unit: "MT",  quantityPerShift: 24.341, shiftOutputRef: 191, derivedPerUnit: 24.341 / 191, isDesignSpecific: true },
  { projectCategory: "ALL", gradingVariant: "Grading-II", sortOrder: 2, materialName: "Aggregate 13.2–10mm @ 21%",  materialCategory: "AGGREGATE", sieveFromMm: 13.2, sieveToMm: 10,   pctByWeight: 21, unit: "CUM", quantityPerShift: 59.699,  shiftOutputRef: 191, derivedPerUnit: 59.699 / 191, isDesignSpecific: true },
  { projectCategory: "ALL", gradingVariant: "Grading-II", sortOrder: 3, materialName: "Aggregate 10–5mm @ 17%",     materialCategory: "AGGREGATE", sieveFromMm: 10,   sieveToMm: 5,    pctByWeight: 17, unit: "CUM", quantityPerShift: 48.327,  shiftOutputRef: 191, derivedPerUnit: 48.327 / 191, isDesignSpecific: true },
  { projectCategory: "ALL", gradingVariant: "Grading-II", sortOrder: 4, materialName: "Aggregate <5mm @ 60%",        materialCategory: "AGGREGATE", sieveFromMm: null, sieveToMm: 5,    pctByWeight: 60, unit: "CUM", quantityPerShift: 170.568, shiftOutputRef: 191, derivedPerUnit: 170.568 / 191, isDesignSpecific: true },
  { projectCategory: "ALL", gradingVariant: "Grading-II", sortOrder: 5, materialName: "Filler @ 2% of aggregate wt", materialCategory: "FILLER",   unit: "CUM", quantityPerShift: 8.528,  shiftOutputRef: 191, derivedPerUnit: 8.528 / 191, isDesignSpecific: true },
];
