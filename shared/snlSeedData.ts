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
  shortLabel: "Embankment Construction | forming embankment excavated material borrow fill compaction sub grade subgrade compacted vibratory",
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
  workCategory: "SUBBASE_BASE",
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
  workCategory: "SUBBASE_BASE",
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

// ─── ITEM 6: CLEARING & GRUBBING 2.01 ──────────────────────────────────────
export const CLEARING_GRUBBING_ITEM = {
  itemCode: "2.01",
  description: "Clearing and grubbing road land including uprooting rank vegetation, grass, brushwood, trees of girth upto 300mm, stumps, removal of rubbish, and disposal of unserviceable material and stacking of serviceable material as directed, up to a lead of 1000m, by mechanical means.",
  shortLabel: "Clearing & Grubbing",
  unit: "SQM",
  workCategory: "SITE_CLEARANCE",
  workSubCategory: "Clearing and Grubbing",
  chapterNo: "2",
  chapterTitle: "Site Clearance",
  sourcePage: "36",
  specClause: "Clause 201",
  isMixSpecific: false,
  hasGradingVariants: false,
  notes: "Output per shift depends on vegetation density. Medium = 5000 SQM/8-hr shift for light-medium vegetation with dozer.",
};

export const CLEARING_GRUBBING_PRODUCTIVITY = [
  { projectCategory: "LARGE",  shiftOutput: 6000, shiftHours: 8, outputUnit: "SQM", derivedPerHour: 750 },
  { projectCategory: "MEDIUM", shiftOutput: 5000, shiftHours: 8, outputUnit: "SQM", derivedPerHour: 625 },
  { projectCategory: "SMALL",  shiftOutput: 3500, shiftHours: 8, outputUnit: "SQM", derivedPerHour: 437.5 },
];

export const CLEARING_GRUBBING_LABOUR = [
  { projectCategory: "ALL", sortOrder: 1, designation: "Mate",    skillTier: "SUPERVISORY", unit: "day", quantityPerShift: 0.100, shiftOutputRef: 5000, derivedPerUnit: 0.100 / 5000 },
  { projectCategory: "ALL", sortOrder: 2, designation: "Mazdoor", skillTier: "UNSKILLED",   unit: "day", quantityPerShift: 4.000, shiftOutputRef: 5000, derivedPerUnit: 4.000 / 5000 },
];

export const CLEARING_GRUBBING_EQUIPMENT = [
  { projectCategory: "LARGE",  sortOrder: 1, equipmentType: "Dozer", equipmentSpec: "D7 class 180HP",  purpose: "clearing", unit: "hrs", quantityPerShift: 8.0, formulaType: "FIXED", shiftOutputRef: 6000, derivedPerUnit: 8.0 / 6000 },
  { projectCategory: "MEDIUM", sortOrder: 1, equipmentType: "Dozer", equipmentSpec: "D6 class 130HP",  purpose: "clearing", unit: "hrs", quantityPerShift: 8.0, formulaType: "FIXED", shiftOutputRef: 5000, derivedPerUnit: 8.0 / 5000 },
  { projectCategory: "SMALL",  sortOrder: 1, equipmentType: "Dozer", equipmentSpec: "D5 class 105HP",  purpose: "clearing", unit: "hrs", quantityPerShift: 8.0, formulaType: "FIXED", shiftOutputRef: 3500, derivedPerUnit: 8.0 / 3500 },
  { projectCategory: "LARGE",  sortOrder: 2, equipmentType: "Tipper", equipmentSpec: "10 CUM (debris)", purpose: "disposal", unit: "hrs", quantityPerShift: 4.0, formulaType: "FIXED", shiftOutputRef: 6000, derivedPerUnit: 4.0 / 6000 },
  { projectCategory: "MEDIUM", sortOrder: 2, equipmentType: "Tipper", equipmentSpec: "10 CUM (debris)", purpose: "disposal", unit: "hrs", quantityPerShift: 4.0, formulaType: "FIXED", shiftOutputRef: 5000, derivedPerUnit: 4.0 / 5000 },
  { projectCategory: "SMALL",  sortOrder: 2, equipmentType: "Tipper", equipmentSpec: "10 CUM (debris)", purpose: "disposal", unit: "hrs", quantityPerShift: 3.0, formulaType: "FIXED", shiftOutputRef: 3500, derivedPerUnit: 3.0 / 3500 },
];

export const CLEARING_GRUBBING_MATERIALS: never[] = [];

// ─── ITEM 7: DISMANTLING EXISTING PAVEMENT 2.04 ────────────────────────────
export const DISMANTLING_PAVEMENT_ITEM = {
  itemCode: "2.04",
  description: "Dismantling existing flexible/rigid pavement including breaking, removal, loading of dismantled materials into tippers and disposal upto a lead of 1000m, including stacking of serviceable materials as directed.",
  shortLabel: "Dismantling Existing Pavement",
  unit: "SQM",
  workCategory: "SITE_CLEARANCE",
  workSubCategory: "Dismantling Pavement",
  chapterNo: "2",
  chapterTitle: "Site Clearance",
  sourcePage: "38",
  specClause: "Clause 202",
  isMixSpecific: false,
  hasGradingVariants: false,
  notes: "Output = 2000 SQM/8-hr shift using backhoe loader for scarification and debris removal.",
};

export const DISMANTLING_PAVEMENT_PRODUCTIVITY = [
  { projectCategory: "LARGE",  shiftOutput: 2500, shiftHours: 8, outputUnit: "SQM", derivedPerHour: 312.5 },
  { projectCategory: "MEDIUM", shiftOutput: 2000, shiftHours: 8, outputUnit: "SQM", derivedPerHour: 250 },
  { projectCategory: "SMALL",  shiftOutput: 1200, shiftHours: 8, outputUnit: "SQM", derivedPerHour: 150 },
];

export const DISMANTLING_PAVEMENT_LABOUR = [
  { projectCategory: "ALL", sortOrder: 1, designation: "Mate",            skillTier: "SUPERVISORY", unit: "day", quantityPerShift: 0.100, shiftOutputRef: 2000, derivedPerUnit: 0.100 / 2000 },
  { projectCategory: "ALL", sortOrder: 2, designation: "Mazdoor Skilled", skillTier: "SKILLED",     unit: "day", quantityPerShift: 2.000, shiftOutputRef: 2000, derivedPerUnit: 2.000 / 2000 },
  { projectCategory: "ALL", sortOrder: 3, designation: "Mazdoor",         skillTier: "UNSKILLED",   unit: "day", quantityPerShift: 5.000, shiftOutputRef: 2000, derivedPerUnit: 5.000 / 2000 },
];

export const DISMANTLING_PAVEMENT_EQUIPMENT = [
  { projectCategory: "LARGE",  sortOrder: 1, equipmentType: "Backhoe Loader", equipmentSpec: "1.0 CUM", purpose: "breaking", unit: "hrs", quantityPerShift: 8.0, formulaType: "FIXED", shiftOutputRef: 2500, derivedPerUnit: 8.0 / 2500 },
  { projectCategory: "MEDIUM", sortOrder: 1, equipmentType: "Backhoe Loader", equipmentSpec: "0.9 CUM", purpose: "breaking", unit: "hrs", quantityPerShift: 8.0, formulaType: "FIXED", shiftOutputRef: 2000, derivedPerUnit: 8.0 / 2000 },
  { projectCategory: "SMALL",  sortOrder: 1, equipmentType: "Backhoe Loader", equipmentSpec: "0.6 CUM", purpose: "breaking", unit: "hrs", quantityPerShift: 8.0, formulaType: "FIXED", shiftOutputRef: 1200, derivedPerUnit: 8.0 / 1200 },
  { projectCategory: "ALL",    sortOrder: 2, equipmentType: "Tipper",         equipmentSpec: "10 CUM",  purpose: "disposal", unit: "hrs", quantityPerShift: 5.0, formulaType: "FIXED", shiftOutputRef: 2000, derivedPerUnit: 5.0 / 2000 },
];

export const DISMANTLING_PAVEMENT_MATERIALS: never[] = [];

// ─── ITEM 8: FORMATION EXCAVATION 3.01 ─────────────────────────────────────
export const FORMATION_EXCAVATION_ITEM = {
  itemCode: "3.01",
  description: "Roadway excavation including cutting in all types of soils, excavating in cutting including trimming of slopes, spreading in uniform layers or loading into tippers for disposal/embankment filling as directed, all complete.",
  shortLabel: "Formation Excavation (Cut) | earthwork excavation road soils roadway mechanical cutting",
  unit: "CUM",
  workCategory: "EARTHWORK",
  workSubCategory: "Formation Cutting",
  chapterNo: "3",
  chapterTitle: "Earthwork, Erosion Control and Drainage",
  sourcePage: "58",
  specClause: "Clause 301",
  isMixSpecific: false,
  hasGradingVariants: false,
  notes: "Same equipment as Embankment 3.16. Output 450 CUM/shift. Material = excavated soil disposed or used for embankment — no material cost.",
};

export const FORMATION_EXCAVATION_PRODUCTIVITY = [
  { projectCategory: "LARGE",  shiftOutput: 450, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 56.25 },
  { projectCategory: "MEDIUM", shiftOutput: 450, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 56.25 },
  { projectCategory: "SMALL",  shiftOutput: 450, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 56.25 },
];

export const FORMATION_EXCAVATION_LABOUR = [
  { projectCategory: "ALL", sortOrder: 1, designation: "Mate",    skillTier: "SUPERVISORY", unit: "day", quantityPerShift: 0.040, shiftOutputRef: 450, derivedPerUnit: 0.040 / 450 },
  { projectCategory: "ALL", sortOrder: 2, designation: "Mazdoor", skillTier: "UNSKILLED",   unit: "day", quantityPerShift: 2.000, shiftOutputRef: 450, derivedPerUnit: 2.000 / 450 },
];

export const FORMATION_EXCAVATION_EQUIPMENT = [
  { projectCategory: "LARGE",  sortOrder: 1, equipmentType: "Hydraulic Excavator", equipmentSpec: "1.2 CUM bucket", purpose: "excavation", unit: "hrs", quantityPerShift: 5.048,  formulaType: "FIXED",         shiftOutputRef: 450, derivedPerUnit: 5.048 / 450 },
  { projectCategory: "MEDIUM", sortOrder: 1, equipmentType: "Hydraulic Excavator", equipmentSpec: "1.1 CUM bucket", purpose: "excavation", unit: "hrs", quantityPerShift: 5.813,  formulaType: "FIXED",         shiftOutputRef: 450, derivedPerUnit: 5.813 / 450 },
  { projectCategory: "SMALL",  sortOrder: 1, equipmentType: "Hydraulic Excavator", equipmentSpec: "0.9 CUM bucket", purpose: "excavation", unit: "hrs", quantityPerShift: 8.127,  formulaType: "FIXED",         shiftOutputRef: 450, derivedPerUnit: 8.127 / 450 },
  { projectCategory: "LARGE",  sortOrder: 2, equipmentType: "Tipper",              equipmentSpec: "18 CUM",         purpose: "transport",  unit: "t.km", quantityPerShift: null,  formulaType: "LEAD_VARIABLE", formulaExpr: "450*1.80*L2", shiftOutputRef: 450, derivedPerUnit: null },
  { projectCategory: "MEDIUM", sortOrder: 2, equipmentType: "Tipper",              equipmentSpec: "14 CUM",         purpose: "transport",  unit: "t.km", quantityPerShift: null,  formulaType: "LEAD_VARIABLE", formulaExpr: "450*1.80*L2", shiftOutputRef: 450, derivedPerUnit: null },
  { projectCategory: "SMALL",  sortOrder: 2, equipmentType: "Tipper",              equipmentSpec: "10 CUM",         purpose: "transport",  unit: "t.km", quantityPerShift: null,  formulaType: "LEAD_VARIABLE", formulaExpr: "450*1.80*L2", shiftOutputRef: 450, derivedPerUnit: null },
  { projectCategory: "LARGE",  sortOrder: 3, equipmentType: "Tipper",              equipmentSpec: "18 CUM (L/U)",   purpose: "loading",    unit: "hrs", quantityPerShift: 5.048,  formulaType: "FIXED",         shiftOutputRef: 450, derivedPerUnit: 5.048 / 450 },
  { projectCategory: "MEDIUM", sortOrder: 3, equipmentType: "Tipper",              equipmentSpec: "14 CUM (L/U)",   purpose: "loading",    unit: "hrs", quantityPerShift: 5.813,  formulaType: "FIXED",         shiftOutputRef: 450, derivedPerUnit: 5.813 / 450 },
  { projectCategory: "SMALL",  sortOrder: 3, equipmentType: "Tipper",              equipmentSpec: "10 CUM (L/U)",   purpose: "loading",    unit: "hrs", quantityPerShift: 8.127,  formulaType: "FIXED",         shiftOutputRef: 450, derivedPerUnit: 8.127 / 450 },
];

export const FORMATION_EXCAVATION_MATERIALS: never[] = [];

// ─── ITEM 9: SUB-GRADE PREPARATION 3.10 ────────────────────────────────────
export const SUBGRADE_PREPARATION_ITEM = {
  itemCode: "3.10",
  description: "Preparation and consolidation of sub-grade: scarifying the existing ground to a depth of 50mm, adding water as necessary, mixing, grading and compacting to achieve specified density as per Table 300-2. Includes trimming of slopes and dressing.",
  shortLabel: "Sub-grade Preparation | sub grade subgrade construction consolidation compaction preparation",
  unit: "SQM",
  workCategory: "EARTHWORK",
  workSubCategory: "Sub-grade Preparation",
  chapterNo: "3",
  chapterTitle: "Earthwork, Erosion Control and Drainage",
  sourcePage: "75",
  specClause: "Clause 309",
  isMixSpecific: false,
  hasGradingVariants: false,
  notes: "Output = 5000 SQM/8-hr shift. Grader trims, roller compacts.",
};

export const SUBGRADE_PREPARATION_PRODUCTIVITY = [
  { projectCategory: "LARGE",  shiftOutput: 6000, shiftHours: 8, outputUnit: "SQM", derivedPerHour: 750 },
  { projectCategory: "MEDIUM", shiftOutput: 5000, shiftHours: 8, outputUnit: "SQM", derivedPerHour: 625 },
  { projectCategory: "SMALL",  shiftOutput: 3500, shiftHours: 8, outputUnit: "SQM", derivedPerHour: 437.5 },
];

export const SUBGRADE_PREPARATION_LABOUR = [
  { projectCategory: "ALL", sortOrder: 1, designation: "Mate",    skillTier: "SUPERVISORY", unit: "day", quantityPerShift: 0.040, shiftOutputRef: 5000, derivedPerUnit: 0.040 / 5000 },
  { projectCategory: "ALL", sortOrder: 2, designation: "Mazdoor", skillTier: "UNSKILLED",   unit: "day", quantityPerShift: 2.000, shiftOutputRef: 5000, derivedPerUnit: 2.000 / 5000 },
];

export const SUBGRADE_PREPARATION_EQUIPMENT = [
  { projectCategory: "LARGE",  sortOrder: 1, equipmentType: "Motor Grader",     equipmentSpec: "4.30m blade",  purpose: "grading",    unit: "hrs", quantityPerShift: 3.000, formulaType: "FIXED", shiftOutputRef: 6000, derivedPerUnit: 3.000 / 6000 },
  { projectCategory: "MEDIUM", sortOrder: 1, equipmentType: "Motor Grader",     equipmentSpec: "3.70m blade",  purpose: "grading",    unit: "hrs", quantityPerShift: 3.000, formulaType: "FIXED", shiftOutputRef: 5000, derivedPerUnit: 3.000 / 5000 },
  { projectCategory: "SMALL",  sortOrder: 1, equipmentType: "Motor Grader",     equipmentSpec: "3.35m blade",  purpose: "grading",    unit: "hrs", quantityPerShift: 3.500, formulaType: "FIXED", shiftOutputRef: 3500, derivedPerUnit: 3.500 / 3500 },
  { projectCategory: "ALL",    sortOrder: 2, equipmentType: "Vibratory Roller", equipmentSpec: "11T",          purpose: "compaction", unit: "hrs", quantityPerShift: 2.500, formulaType: "FIXED", shiftOutputRef: 5000, derivedPerUnit: 2.500 / 5000 },
  { projectCategory: "LARGE",  sortOrder: 3, equipmentType: "Water Tanker",     equipmentSpec: "16 KL",        purpose: "watering",   unit: "hrs", quantityPerShift: null,  formulaType: "LEAD_FORMULA", formulaExpr: "0.273*L1+0.945", shiftOutputRef: 5000, derivedPerUnit: null },
  { projectCategory: "MEDIUM", sortOrder: 3, equipmentType: "Water Tanker",     equipmentSpec: "12 KL",        purpose: "watering",   unit: "hrs", quantityPerShift: null,  formulaType: "LEAD_FORMULA", formulaExpr: "0.365*L1+1.260", shiftOutputRef: 5000, derivedPerUnit: null },
  { projectCategory: "SMALL",  sortOrder: 3, equipmentType: "Water Tanker",     equipmentSpec: "6 KL",         purpose: "watering",   unit: "hrs", quantityPerShift: null,  formulaType: "LEAD_FORMULA", formulaExpr: "0.729*L1+2.520", shiftOutputRef: 3500, derivedPerUnit: null },
];

export const SUBGRADE_PREPARATION_MATERIALS = [
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 1, materialName: "Water", materialCategory: "WATER", unit: "KL", quantityPerShift: 12.500, shiftOutputRef: 5000, derivedPerUnit: 12.500 / 5000, isDesignSpecific: false },
];

// ─── ITEM 10: PRIME COAT 5.01 ───────────────────────────────────────────────
export const PRIME_COAT_ITEM = {
  itemCode: "5.01",
  description: "Providing and applying primer coat with low viscosity bituminous material on prepared granular surface (GSB/WMM) including cleaning of road surface and spraying of primer @ 0.70–1.00 kg/SQM using a mechanical distributor, as per Clause 502.",
  shortLabel: "Prime Coat (Emulsion SS-1)",
  unit: "SQM",
  workCategory: "BITUMINOUS",
  workSubCategory: "Prime Coat",
  chapterNo: "5",
  chapterTitle: "Bases and Surface Courses (Bituminous)",
  sourcePage: "133",
  specClause: "Clause 502",
  isMixSpecific: false,
  hasGradingVariants: false,
  notes: "Application rate 0.90 kg/SQM of SS-1 emulsion (includes 30% dilution). Output = 10000 SQM/shift.",
};

export const PRIME_COAT_PRODUCTIVITY = [
  { projectCategory: "LARGE",  shiftOutput: 12000, shiftHours: 8, outputUnit: "SQM", derivedPerHour: 1500 },
  { projectCategory: "MEDIUM", shiftOutput: 10000, shiftHours: 8, outputUnit: "SQM", derivedPerHour: 1250 },
  { projectCategory: "SMALL",  shiftOutput: 7000,  shiftHours: 8, outputUnit: "SQM", derivedPerHour: 875 },
];

export const PRIME_COAT_LABOUR = [
  { projectCategory: "ALL", sortOrder: 1, designation: "Mate",            skillTier: "SUPERVISORY", unit: "day", quantityPerShift: 0.200, shiftOutputRef: 10000, derivedPerUnit: 0.200 / 10000 },
  { projectCategory: "ALL", sortOrder: 2, designation: "Mazdoor Skilled", skillTier: "SKILLED",     unit: "day", quantityPerShift: 1.000, shiftOutputRef: 10000, derivedPerUnit: 1.000 / 10000 },
  { projectCategory: "ALL", sortOrder: 3, designation: "Mazdoor",         skillTier: "UNSKILLED",   unit: "day", quantityPerShift: 2.000, shiftOutputRef: 10000, derivedPerUnit: 2.000 / 10000 },
];

export const PRIME_COAT_EQUIPMENT = [
  { projectCategory: "ALL", sortOrder: 1, equipmentType: "Bitumen Pressure Distributor", equipmentSpec: "4000 L tank",  purpose: "spraying",  unit: "hrs", quantityPerShift: 8.0, formulaType: "FIXED", shiftOutputRef: 10000, derivedPerUnit: 8.0 / 10000 },
  { projectCategory: "ALL", sortOrder: 2, equipmentType: "Air Compressor",               equipmentSpec: "250 CFM",       purpose: "cleaning",  unit: "hrs", quantityPerShift: 1.5, formulaType: "FIXED", shiftOutputRef: 10000, derivedPerUnit: 1.5 / 10000 },
  { projectCategory: "ALL", sortOrder: 3, equipmentType: "Mechanical Broom",             equipmentSpec: "2.1m width",    purpose: "cleaning",  unit: "hrs", quantityPerShift: 1.5, formulaType: "FIXED", shiftOutputRef: 10000, derivedPerUnit: 1.5 / 10000 },
];

export const PRIME_COAT_MATERIALS = [
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 1, materialName: "Bituminous Emulsion SS-1 @ 0.90 kg/SQM", materialCategory: "BINDER", unit: "MT", quantityPerShift: 9.000, shiftOutputRef: 10000, derivedPerUnit: 9.000 / 10000, isDesignSpecific: false, notes: "@ 0.90 kg/SQM including 30% dilution" },
];

// ─── ITEM 11: TACK COAT 5.02 ────────────────────────────────────────────────
export const TACK_COAT_ITEM = {
  itemCode: "5.02",
  description: "Providing and applying tack coat with bituminous emulsion (RS-1) @ 0.25–0.30 kg/SQM on previously prepared bituminous or granular surface using mechanical distributor, complete as per Clause 503.",
  shortLabel: "Tack Coat (Emulsion RS-1)",
  unit: "SQM",
  workCategory: "BITUMINOUS",
  workSubCategory: "Tack Coat",
  chapterNo: "5",
  chapterTitle: "Bases and Surface Courses (Bituminous)",
  sourcePage: "134",
  specClause: "Clause 503",
  isMixSpecific: false,
  hasGradingVariants: false,
  notes: "Application rate 0.30 kg/SQM of RS-1 emulsion. Output = 15000 SQM/shift.",
};

export const TACK_COAT_PRODUCTIVITY = [
  { projectCategory: "LARGE",  shiftOutput: 18000, shiftHours: 8, outputUnit: "SQM", derivedPerHour: 2250 },
  { projectCategory: "MEDIUM", shiftOutput: 15000, shiftHours: 8, outputUnit: "SQM", derivedPerHour: 1875 },
  { projectCategory: "SMALL",  shiftOutput: 10000, shiftHours: 8, outputUnit: "SQM", derivedPerHour: 1250 },
];

export const TACK_COAT_LABOUR = [
  { projectCategory: "ALL", sortOrder: 1, designation: "Mate",    skillTier: "SUPERVISORY", unit: "day", quantityPerShift: 0.100, shiftOutputRef: 15000, derivedPerUnit: 0.100 / 15000 },
  { projectCategory: "ALL", sortOrder: 2, designation: "Mazdoor", skillTier: "UNSKILLED",   unit: "day", quantityPerShift: 2.000, shiftOutputRef: 15000, derivedPerUnit: 2.000 / 15000 },
];

export const TACK_COAT_EQUIPMENT = [
  { projectCategory: "ALL", sortOrder: 1, equipmentType: "Bitumen Pressure Distributor", equipmentSpec: "4000 L tank", purpose: "spraying", unit: "hrs", quantityPerShift: 8.0, formulaType: "FIXED", shiftOutputRef: 15000, derivedPerUnit: 8.0 / 15000 },
];

export const TACK_COAT_MATERIALS = [
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 1, materialName: "Bituminous Emulsion RS-1 @ 0.30 kg/SQM", materialCategory: "BINDER", unit: "MT", quantityPerShift: 4.500, shiftOutputRef: 15000, derivedPerUnit: 4.500 / 15000, isDesignSpecific: false, notes: "@ 0.30 kg/SQM undiluted" },
];

// ─── ITEM 12: BITUMINOUS MACADAM (BM) 5.01B ─────────────────────────────────
export const BM_ITEM = {
  itemCode: "5.01B",
  description: "Bituminous Macadam — Providing and laying bituminous macadam with crushed aggregates and bituminous binder @ 3.5% by weight of total mix, mixed in hot mix plant, transported to site, laid with mechanical paver and compacted with smooth wheeled roller as per Clause 504.",
  shortLabel: "Bituminous Macadam (BM)",
  unit: "CUM",
  workCategory: "BITUMINOUS",
  workSubCategory: "Bituminous Macadam",
  chapterNo: "5",
  chapterTitle: "Bases and Surface Courses (Bituminous)",
  sourcePage: "140",
  specClause: "Clause 504",
  isMixSpecific: true,
  hasGradingVariants: true,
  notes: "Base course binder layer. Binder content lower than DBM (~3.5%). Grading-I (40mm nominal) and Grading-II (26.5mm nominal).",
};

export const BM_PRODUCTIVITY = [
  { projectCategory: "LARGE",  shiftOutput: 210, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 26.25 },
  { projectCategory: "MEDIUM", shiftOutput: 210, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 26.25 },
  { projectCategory: "SMALL",  shiftOutput: 170, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 21.25 },
];

export const BM_LABOUR = [
  { projectCategory: "ALL", sortOrder: 1, designation: "Mate",            skillTier: "SUPERVISORY", unit: "day", quantityPerShift: 0.440, shiftOutputRef: 210, derivedPerUnit: 0.440 / 210 },
  { projectCategory: "ALL", sortOrder: 2, designation: "Mazdoor",         skillTier: "UNSKILLED",   unit: "day", quantityPerShift: 6.000, shiftOutputRef: 210, derivedPerUnit: 6.000 / 210 },
  { projectCategory: "ALL", sortOrder: 3, designation: "Mazdoor Skilled", skillTier: "SKILLED",     unit: "day", quantityPerShift: 4.000, shiftOutputRef: 210, derivedPerUnit: 4.000 / 210 },
];

export const BM_EQUIPMENT = [
  { projectCategory: "LARGE",  sortOrder: 1, equipmentType: "Hot Mix Plant",      equipmentSpec: "200 TPH",            purpose: "mixing",     unit: "hrs", quantityPerShift: 2.800, formulaType: "FIXED", shiftOutputRef: 210, derivedPerUnit: 2.800 / 210 },
  { projectCategory: "MEDIUM", sortOrder: 1, equipmentType: "Hot Mix Plant",      equipmentSpec: "160 TPH",            purpose: "mixing",     unit: "hrs", quantityPerShift: 3.500, formulaType: "FIXED", shiftOutputRef: 210, derivedPerUnit: 3.500 / 210 },
  { projectCategory: "SMALL",  sortOrder: 1, equipmentType: "Hot Mix Plant",      equipmentSpec: "120 TPH",            purpose: "mixing",     unit: "hrs", quantityPerShift: 4.700, formulaType: "FIXED", shiftOutputRef: 170, derivedPerUnit: 4.700 / 170 },
  { projectCategory: "ALL",    sortOrder: 2, equipmentType: "Air Compressor",     equipmentSpec: "250 CFM",            purpose: "cleaning",   unit: "hrs", quantityPerShift: 0.500, formulaType: "FIXED", shiftOutputRef: 210, derivedPerUnit: 0.500 / 210 },
  { projectCategory: "LARGE",  sortOrder: 3, equipmentType: "Paver Finisher",     equipmentSpec: "240 HP hydrostatic", purpose: "laying",     unit: "hrs", quantityPerShift: 2.800, formulaType: "FIXED", shiftOutputRef: 210, derivedPerUnit: 2.800 / 210 },
  { projectCategory: "MEDIUM", sortOrder: 3, equipmentType: "Paver Finisher",     equipmentSpec: "174 HP hydrostatic", purpose: "laying",     unit: "hrs", quantityPerShift: 3.500, formulaType: "FIXED", shiftOutputRef: 210, derivedPerUnit: 3.500 / 210 },
  { projectCategory: "SMALL",  sortOrder: 3, equipmentType: "Paver Finisher",     equipmentSpec: "174 HP hydrostatic", purpose: "laying",     unit: "hrs", quantityPerShift: 4.700, formulaType: "FIXED", shiftOutputRef: 170, derivedPerUnit: 4.700 / 170 },
  { projectCategory: "ALL",    sortOrder: 4, equipmentType: "Tipper",             equipmentSpec: "transport",          purpose: "transport",  unit: "t.km", quantityPerShift: null, formulaType: "LEAD_VARIABLE", formulaExpr: "430*L1", shiftOutputRef: 210, derivedPerUnit: null },
  { projectCategory: "LARGE",  sortOrder: 5, equipmentType: "Tipper",             equipmentSpec: "18 CUM (L/U)",      purpose: "loading",    unit: "hrs", quantityPerShift: 5.600, formulaType: "FIXED", shiftOutputRef: 210, derivedPerUnit: 5.600 / 210 },
  { projectCategory: "MEDIUM", sortOrder: 5, equipmentType: "Tipper",             equipmentSpec: "14 CUM (L/U)",      purpose: "loading",    unit: "hrs", quantityPerShift: 7.000, formulaType: "FIXED", shiftOutputRef: 210, derivedPerUnit: 7.000 / 210 },
  { projectCategory: "SMALL",  sortOrder: 5, equipmentType: "Tipper",             equipmentSpec: "10 CUM (L/U)",      purpose: "loading",    unit: "hrs", quantityPerShift: 9.400, formulaType: "FIXED", shiftOutputRef: 170, derivedPerUnit: 9.400 / 170 },
  { projectCategory: "ALL",    sortOrder: 6, equipmentType: "Smooth Steel Tandem Roller", equipmentSpec: "static+vibratory", purpose: "compaction", unit: "hrs", quantityPerShift: 8.400, formulaType: "FIXED", shiftOutputRef: 210, derivedPerUnit: 8.400 / 210 },
];

export const BM_MATERIALS = [
  { projectCategory: "ALL", gradingVariant: "Grading-II", sortOrder: 1, materialName: "Bitumen @ 3.5% of mix",       materialCategory: "BINDER",    unit: "MT",  quantityPerShift: 16.100, shiftOutputRef: 210, derivedPerUnit: 16.100 / 210, isDesignSpecific: true },
  { projectCategory: "ALL", gradingVariant: "Grading-II", sortOrder: 2, materialName: "Aggregate 25–10mm @ 30%",     materialCategory: "AGGREGATE", sieveFromMm: 25, sieveToMm: 10, pctByWeight: 30, unit: "CUM", quantityPerShift: 88.200, shiftOutputRef: 210, derivedPerUnit: 88.200 / 210, isDesignSpecific: true },
  { projectCategory: "ALL", gradingVariant: "Grading-II", sortOrder: 3, materialName: "Aggregate 10–4.75mm @ 30%",   materialCategory: "AGGREGATE", sieveFromMm: 10, sieveToMm: 4.75, pctByWeight: 30, unit: "CUM", quantityPerShift: 88.200, shiftOutputRef: 210, derivedPerUnit: 88.200 / 210, isDesignSpecific: true },
  { projectCategory: "ALL", gradingVariant: "Grading-II", sortOrder: 4, materialName: "Aggregate <4.75mm @ 38%",     materialCategory: "AGGREGATE", sieveFromMm: null, sieveToMm: 4.75, pctByWeight: 38, unit: "CUM", quantityPerShift: 111.720, shiftOutputRef: 210, derivedPerUnit: 111.720 / 210, isDesignSpecific: true },
  { projectCategory: "ALL", gradingVariant: "Grading-II", sortOrder: 5, materialName: "Filler @ 2%",                 materialCategory: "FILLER",    unit: "CUM", quantityPerShift: 7.800, shiftOutputRef: 210, derivedPerUnit: 7.800 / 210, isDesignSpecific: true },
];

// ─── ITEM 13: PCC M10 6.01 ──────────────────────────────────────────────────
export const PCC_M10_ITEM = {
  itemCode: "6.01",
  description: "Providing and laying plain cement concrete M10 (nominal mix 1:3:6 using OPC 43 grade cement) in foundations, bed concrete, lean concrete and unreinforced slabs including formwork, placing, vibrating and curing as per relevant IS codes.",
  shortLabel: "PCC M10 (Lean/Bed Concrete)",
  unit: "CUM",
  workCategory: "CONCRETE",
  workSubCategory: "Plain Cement Concrete",
  chapterNo: "6",
  chapterTitle: "Cement Concrete Pavement and Related Works",
  sourcePage: "165",
  specClause: "IS 456 / IRC:44",
  isMixSpecific: false,
  hasGradingVariants: false,
  notes: "Nominal mix 1:3:6. Cement: ~220 kg/CUM (4.4 bags). Sand 0.46 CUM, CA 20mm 0.92 CUM. Output = 60 CUM/8-hr shift.",
};

export const PCC_M10_PRODUCTIVITY = [
  { projectCategory: "LARGE",  shiftOutput: 80, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 10 },
  { projectCategory: "MEDIUM", shiftOutput: 60, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 7.5 },
  { projectCategory: "SMALL",  shiftOutput: 40, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 5 },
];

export const PCC_M10_LABOUR = [
  { projectCategory: "ALL", sortOrder: 1, designation: "Mate",            skillTier: "SUPERVISORY", unit: "day", quantityPerShift: 0.400, shiftOutputRef: 60, derivedPerUnit: 0.400 / 60 },
  { projectCategory: "ALL", sortOrder: 2, designation: "Mason",           skillTier: "SKILLED",     unit: "day", quantityPerShift: 2.000, shiftOutputRef: 60, derivedPerUnit: 2.000 / 60 },
  { projectCategory: "ALL", sortOrder: 3, designation: "Mazdoor Skilled", skillTier: "SKILLED",     unit: "day", quantityPerShift: 4.000, shiftOutputRef: 60, derivedPerUnit: 4.000 / 60 },
  { projectCategory: "ALL", sortOrder: 4, designation: "Mazdoor",         skillTier: "UNSKILLED",   unit: "day", quantityPerShift: 8.000, shiftOutputRef: 60, derivedPerUnit: 8.000 / 60 },
];

export const PCC_M10_EQUIPMENT = [
  { projectCategory: "ALL", sortOrder: 1, equipmentType: "Concrete Mixer",    equipmentSpec: "10/7 (0.28 CUM)", purpose: "mixing",     unit: "hrs", quantityPerShift: 7.0, formulaType: "FIXED", shiftOutputRef: 60, derivedPerUnit: 7.0 / 60 },
  { projectCategory: "ALL", sortOrder: 2, equipmentType: "Needle Vibrator",   equipmentSpec: "40mm dia",        purpose: "compaction", unit: "hrs", quantityPerShift: 7.0, formulaType: "FIXED", shiftOutputRef: 60, derivedPerUnit: 7.0 / 60 },
  { projectCategory: "ALL", sortOrder: 3, equipmentType: "Water Pump",        equipmentSpec: "5 HP",            purpose: "curing",     unit: "hrs", quantityPerShift: 2.0, formulaType: "FIXED", shiftOutputRef: 60, derivedPerUnit: 2.0 / 60 },
];

export const PCC_M10_MATERIALS = [
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 1, materialName: "OPC 43 Cement",        materialCategory: "CEMENT",    unit: "MT",  quantityPerShift: 13.200, shiftOutputRef: 60, derivedPerUnit: 13.200 / 60, isDesignSpecific: false, notes: "220 kg/CUM" },
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 2, materialName: "Fine Aggregate (Sand)", materialCategory: "AGGREGATE", unit: "CUM", quantityPerShift: 27.600, shiftOutputRef: 60, derivedPerUnit: 27.600 / 60, isDesignSpecific: false, notes: "0.46 CUM/CUM" },
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 3, materialName: "Coarse Aggregate 20mm", materialCategory: "AGGREGATE", unit: "CUM", quantityPerShift: 55.200, shiftOutputRef: 60, derivedPerUnit: 55.200 / 60, isDesignSpecific: false, notes: "0.92 CUM/CUM" },
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 4, materialName: "Water",                 materialCategory: "WATER",     unit: "KL",  quantityPerShift: 6.600,  shiftOutputRef: 60, derivedPerUnit: 6.600 / 60,  isDesignSpecific: false, notes: "0.11 KL/CUM (w/c ~0.50)" },
];

// ─── ITEM 14: RCC M25 6.02 ──────────────────────────────────────────────────
export const RCC_M25_ITEM = {
  itemCode: "6.02",
  description: "Providing and laying reinforced cement concrete M25 (design mix using OPC 43/53 grade cement) in structures including formwork, reinforcement binding, concreting, vibrating and curing as per IS 456 and project drawings.",
  shortLabel: "RCC M25 (Structural Concrete)",
  unit: "CUM",
  workCategory: "CONCRETE",
  workSubCategory: "Reinforced Cement Concrete",
  chapterNo: "6",
  chapterTitle: "Cement Concrete Pavement and Related Works",
  sourcePage: "170",
  specClause: "IS 456 / IRC:112",
  isMixSpecific: false,
  hasGradingVariants: false,
  notes: "Design mix M25: Cement 400 kg/CUM, FA 0.44 CUM, CA 20mm 0.77 CUM. Output = 45 CUM/8-hr shift including formwork and reinforcement activities.",
};

export const RCC_M25_PRODUCTIVITY = [
  { projectCategory: "LARGE",  shiftOutput: 55, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 6.875 },
  { projectCategory: "MEDIUM", shiftOutput: 45, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 5.625 },
  { projectCategory: "SMALL",  shiftOutput: 30, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 3.75 },
];

export const RCC_M25_LABOUR = [
  { projectCategory: "ALL", sortOrder: 1, designation: "Mate",            skillTier: "SUPERVISORY", unit: "day", quantityPerShift: 0.400, shiftOutputRef: 45, derivedPerUnit: 0.400 / 45 },
  { projectCategory: "ALL", sortOrder: 2, designation: "Mason",           skillTier: "SKILLED",     unit: "day", quantityPerShift: 3.000, shiftOutputRef: 45, derivedPerUnit: 3.000 / 45 },
  { projectCategory: "ALL", sortOrder: 3, designation: "Bar Bender",      skillTier: "SKILLED",     unit: "day", quantityPerShift: 2.000, shiftOutputRef: 45, derivedPerUnit: 2.000 / 45 },
  { projectCategory: "ALL", sortOrder: 4, designation: "Mazdoor Skilled", skillTier: "SKILLED",     unit: "day", quantityPerShift: 5.000, shiftOutputRef: 45, derivedPerUnit: 5.000 / 45 },
  { projectCategory: "ALL", sortOrder: 5, designation: "Mazdoor",         skillTier: "UNSKILLED",   unit: "day", quantityPerShift: 10.000, shiftOutputRef: 45, derivedPerUnit: 10.000 / 45 },
];

export const RCC_M25_EQUIPMENT = [
  { projectCategory: "LARGE",  sortOrder: 1, equipmentType: "Transit Mixer",  equipmentSpec: "7 CUM",  purpose: "mixing",     unit: "hrs", quantityPerShift: 7.0, formulaType: "FIXED", shiftOutputRef: 55, derivedPerUnit: 7.0 / 55 },
  { projectCategory: "MEDIUM", sortOrder: 1, equipmentType: "Concrete Mixer", equipmentSpec: "10/7",   purpose: "mixing",     unit: "hrs", quantityPerShift: 7.0, formulaType: "FIXED", shiftOutputRef: 45, derivedPerUnit: 7.0 / 45 },
  { projectCategory: "SMALL",  sortOrder: 1, equipmentType: "Concrete Mixer", equipmentSpec: "10/7",   purpose: "mixing",     unit: "hrs", quantityPerShift: 7.0, formulaType: "FIXED", shiftOutputRef: 30, derivedPerUnit: 7.0 / 30 },
  { projectCategory: "ALL",    sortOrder: 2, equipmentType: "Needle Vibrator", equipmentSpec: "40mm",  purpose: "compaction", unit: "hrs", quantityPerShift: 7.0, formulaType: "FIXED", shiftOutputRef: 45, derivedPerUnit: 7.0 / 45 },
  { projectCategory: "ALL",    sortOrder: 3, equipmentType: "Water Pump",      equipmentSpec: "5 HP",  purpose: "curing",     unit: "hrs", quantityPerShift: 3.0, formulaType: "FIXED", shiftOutputRef: 45, derivedPerUnit: 3.0 / 45 },
];

export const RCC_M25_MATERIALS = [
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 1, materialName: "OPC 43/53 Cement",     materialCategory: "CEMENT",    unit: "MT",  quantityPerShift: 18.000, shiftOutputRef: 45, derivedPerUnit: 18.000 / 45, isDesignSpecific: false, notes: "400 kg/CUM" },
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 2, materialName: "Fine Aggregate (Sand)", materialCategory: "AGGREGATE", unit: "CUM", quantityPerShift: 19.800, shiftOutputRef: 45, derivedPerUnit: 19.800 / 45, isDesignSpecific: false, notes: "0.44 CUM/CUM" },
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 3, materialName: "Coarse Aggregate 20mm", materialCategory: "AGGREGATE", unit: "CUM", quantityPerShift: 34.650, shiftOutputRef: 45, derivedPerUnit: 34.650 / 45, isDesignSpecific: false, notes: "0.77 CUM/CUM" },
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 4, materialName: "Water",                 materialCategory: "WATER",     unit: "KL",  quantityPerShift: 7.200,  shiftOutputRef: 45, derivedPerUnit: 7.200 / 45,  isDesignSpecific: false, notes: "0.16 KL/CUM (w/c ~0.40)" },
];

// ─── ITEM 16: GSB MIX-IN-PLACE / DIRECT CRUSHER 4.01B ──────────────────────
export const GSB_DIRECT_ITEM = {
  itemCode: "4.01B",
  description: "Granular Sub-Base with Graded Material (Table 400-1) — Mix-in-Place Method using Rotavator: providing and laying HBG/crushed stone aggregate or graded material directly from quarry/crusher as sub-base material, spreading in uniform layers with motor grader on prepared surface, mixing in-situ with water at OMC using tractor-towed rotavator, and compacting with vibratory power roller to achieve desired density. Mix in place method without WMM/GSB plant, material supplied direct from quarry or crusher to work site, as per Clause 401.",
  shortLabel: "GSB — Mix-in-Place / Direct Crusher",
  unit: "CUM",
  workCategory: "SUBBASE_BASE",
  workSubCategory: "Granular Sub-Base",
  chapterNo: "4",
  chapterTitle: "Sub-Bases, Bases (Non-Bituminous) and Shoulders",
  sourcePage: "88",
  specClause: "Clause 401",
  isMixSpecific: false,
  hasGradingVariants: false,
  notes: "Mix-in-place method using Rotavator — no separate mixing plant required. Material delivered direct from quarry/crusher to site. Output approx 350 CUM/8-hr shift (lower than plant mix due to in-situ mixing constraints).",
};

export const GSB_DIRECT_PRODUCTIVITY = [
  { projectCategory: "LARGE",  shiftOutput: 400, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 50 },
  { projectCategory: "MEDIUM", shiftOutput: 350, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 43.75 },
  { projectCategory: "SMALL",  shiftOutput: 250, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 31.25 },
];

export const GSB_DIRECT_LABOUR = [
  { projectCategory: "ALL", sortOrder: 1, designation: "Mate",            skillTier: "SUPERVISORY", unit: "day", quantityPerShift: 0.060, shiftOutputRef: 350, derivedPerUnit: 0.060 / 350 },
  { projectCategory: "ALL", sortOrder: 2, designation: "Tractor Driver",  skillTier: "SKILLED",     unit: "day", quantityPerShift: 1.000, shiftOutputRef: 350, derivedPerUnit: 1.000 / 350 },
  { projectCategory: "ALL", sortOrder: 3, designation: "Mazdoor",         skillTier: "UNSKILLED",   unit: "day", quantityPerShift: 2.000, shiftOutputRef: 350, derivedPerUnit: 2.000 / 350 },
];

export const GSB_DIRECT_EQUIPMENT = [
  { projectCategory: "ALL",    sortOrder: 1, equipmentType: "Motor Grader",     equipmentSpec: "3.70m blade",  purpose: "spreading",  unit: "hrs", quantityPerShift: 4.000, formulaType: "FIXED", shiftOutputRef: 350, derivedPerUnit: 4.000 / 350 },
  { projectCategory: "ALL",    sortOrder: 2, equipmentType: "Rotavator",         equipmentSpec: "Tractor-towed 2.4m", purpose: "mixing",  unit: "hrs", quantityPerShift: 6.000, formulaType: "FIXED", shiftOutputRef: 350, derivedPerUnit: 6.000 / 350 },
  { projectCategory: "ALL",    sortOrder: 3, equipmentType: "Vibratory Roller",  equipmentSpec: "10–12T",       purpose: "compaction", unit: "hrs", quantityPerShift: 3.500, formulaType: "FIXED", shiftOutputRef: 350, derivedPerUnit: 3.500 / 350 },
  { projectCategory: "LARGE",  sortOrder: 4, equipmentType: "Water Tanker",      equipmentSpec: "12 KL",        purpose: "watering",   unit: "hrs", quantityPerShift: null,  formulaType: "LEAD_FORMULA", formulaExpr: "0.365*L1+1.260", shiftOutputRef: 350, derivedPerUnit: null },
  { projectCategory: "MEDIUM", sortOrder: 4, equipmentType: "Water Tanker",      equipmentSpec: "12 KL",        purpose: "watering",   unit: "hrs", quantityPerShift: null,  formulaType: "LEAD_FORMULA", formulaExpr: "0.365*L1+1.260", shiftOutputRef: 350, derivedPerUnit: null },
  { projectCategory: "SMALL",  sortOrder: 4, equipmentType: "Water Tanker",      equipmentSpec: "6 KL",         purpose: "watering",   unit: "hrs", quantityPerShift: null,  formulaType: "LEAD_FORMULA", formulaExpr: "0.729*L1+2.520", shiftOutputRef: 350, derivedPerUnit: null },
];

export const GSB_DIRECT_MATERIALS = [
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 1, materialName: "Graded Stone Aggregate (Crusher to Site)", materialCategory: "AGGREGATE", unit: "CUM", quantityPerShift: 350, shiftOutputRef: 350, derivedPerUnit: 1.000, isDesignSpecific: false, notes: "Aggregate supplied directly from quarry/crusher, no plant processing" },
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 2, materialName: "Water",                                    materialCategory: "WATER",     unit: "KL",  quantityPerShift: 52.5,  shiftOutputRef: 350, derivedPerUnit: 52.5 / 350, isDesignSpecific: false },
];

// ─── ITEM 17: SCARIFYING EXISTING BT SURFACE 2.05 ──────────────────────────
export const SCARIFYING_BT_ITEM = {
  itemCode: "2.05",
  description: "Scarifying the existing bituminous road surface by mechanical means using motor grader with scarifier attachment, cutting and loosening old BT/asphalt surface to specified depth, removing loosened bituminous material, loading into tippers for disposal to designated leads and lifts. Includes cleaning, trimming and making good as directed by Engineer-in-Charge, complete.",
  shortLabel: "Scarifying Existing BT Surface",
  unit: "SQM",
  workCategory: "SITE_CLEARANCE",
  workSubCategory: "Scarifying BT Surface",
  chapterNo: "2",
  chapterTitle: "Site Clearance & Dismantling",
  sourcePage: "45",
  specClause: "Clause 305.4.3",
  isMixSpecific: false,
  hasGradingVariants: false,
  notes: "Output ≈ 2000 SQM/8-hr shift using grader with scarifier. Depth typically 50–75mm. Tipper for disposal of scarified material.",
};

export const SCARIFYING_BT_PRODUCTIVITY = [
  { projectCategory: "LARGE",  shiftOutput: 2500, shiftHours: 8, outputUnit: "SQM", derivedPerHour: 312.5 },
  { projectCategory: "MEDIUM", shiftOutput: 2000, shiftHours: 8, outputUnit: "SQM", derivedPerHour: 250 },
  { projectCategory: "SMALL",  shiftOutput: 1200, shiftHours: 8, outputUnit: "SQM", derivedPerHour: 150 },
];

export const SCARIFYING_BT_LABOUR = [
  { projectCategory: "ALL", sortOrder: 1, designation: "Mate",            skillTier: "SUPERVISORY", unit: "day", quantityPerShift: 0.100, shiftOutputRef: 2000, derivedPerUnit: 0.100 / 2000 },
  { projectCategory: "ALL", sortOrder: 2, designation: "Mazdoor Skilled", skillTier: "SKILLED",     unit: "day", quantityPerShift: 1.000, shiftOutputRef: 2000, derivedPerUnit: 1.000 / 2000 },
  { projectCategory: "ALL", sortOrder: 3, designation: "Mazdoor",         skillTier: "UNSKILLED",   unit: "day", quantityPerShift: 3.000, shiftOutputRef: 2000, derivedPerUnit: 3.000 / 2000 },
];

export const SCARIFYING_BT_EQUIPMENT = [
  { projectCategory: "LARGE",  sortOrder: 1, equipmentType: "Motor Grader with Scarifier", equipmentSpec: "4.30m blade", purpose: "scarifying", unit: "hrs", quantityPerShift: 8.0, formulaType: "FIXED", shiftOutputRef: 2500, derivedPerUnit: 8.0 / 2500 },
  { projectCategory: "MEDIUM", sortOrder: 1, equipmentType: "Motor Grader with Scarifier", equipmentSpec: "3.70m blade", purpose: "scarifying", unit: "hrs", quantityPerShift: 8.0, formulaType: "FIXED", shiftOutputRef: 2000, derivedPerUnit: 8.0 / 2000 },
  { projectCategory: "SMALL",  sortOrder: 1, equipmentType: "Motor Grader with Scarifier", equipmentSpec: "3.35m blade", purpose: "scarifying", unit: "hrs", quantityPerShift: 8.0, formulaType: "FIXED", shiftOutputRef: 1200, derivedPerUnit: 8.0 / 1200 },
  { projectCategory: "ALL",    sortOrder: 2, equipmentType: "Tipper",                      equipmentSpec: "10 CUM",       purpose: "disposal",   unit: "hrs", quantityPerShift: 5.0, formulaType: "FIXED", shiftOutputRef: 2000, derivedPerUnit: 5.0 / 2000 },
];

export const SCARIFYING_BT_MATERIALS: never[] = [];

// ─── ITEM 18: EARTHEN SHOULDERS 4.20 ────────────────────────────────────────
export const SHOULDERS_ITEM = {
  itemCode: "4.20",
  description: "Construction of earthen shoulders with approved borrow material or excavated soil including compacting in layers to achieve specified density, shaping to specified camber and cross-slope with motor grader, trimming, dressing and all complete as per Clause 315 and drawings.",
  shortLabel: "Earthen Shoulders",
  unit: "CUM",
  workCategory: "SHOULDERS_MEDIANS",
  workSubCategory: "Earthen Shoulder",
  chapterNo: "4",
  chapterTitle: "Sub-Bases, Bases (Non-Bituminous) and Shoulders",
  sourcePage: "130",
  specClause: "Clause 315",
  isMixSpecific: false,
  hasGradingVariants: false,
  notes: "Earthen shoulder compaction similar to embankment (Clause 305). Output ≈ 400 CUM/8-hr shift with grader + roller.",
};

export const SHOULDERS_PRODUCTIVITY = [
  { projectCategory: "LARGE",  shiftOutput: 450, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 56.25 },
  { projectCategory: "MEDIUM", shiftOutput: 400, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 50 },
  { projectCategory: "SMALL",  shiftOutput: 280, shiftHours: 8, outputUnit: "CUM", derivedPerHour: 35 },
];

export const SHOULDERS_LABOUR = [
  { projectCategory: "ALL", sortOrder: 1, designation: "Mate",    skillTier: "SUPERVISORY", unit: "day", quantityPerShift: 0.040, shiftOutputRef: 400, derivedPerUnit: 0.040 / 400 },
  { projectCategory: "ALL", sortOrder: 2, designation: "Mazdoor", skillTier: "UNSKILLED",   unit: "day", quantityPerShift: 2.000, shiftOutputRef: 400, derivedPerUnit: 2.000 / 400 },
];

export const SHOULDERS_EQUIPMENT = [
  { projectCategory: "LARGE",  sortOrder: 1, equipmentType: "Motor Grader",     equipmentSpec: "4.30m blade",  purpose: "shaping",    unit: "hrs", quantityPerShift: 3.000, formulaType: "FIXED", shiftOutputRef: 450, derivedPerUnit: 3.000 / 450 },
  { projectCategory: "MEDIUM", sortOrder: 1, equipmentType: "Motor Grader",     equipmentSpec: "3.70m blade",  purpose: "shaping",    unit: "hrs", quantityPerShift: 3.500, formulaType: "FIXED", shiftOutputRef: 400, derivedPerUnit: 3.500 / 400 },
  { projectCategory: "SMALL",  sortOrder: 1, equipmentType: "Motor Grader",     equipmentSpec: "3.35m blade",  purpose: "shaping",    unit: "hrs", quantityPerShift: 4.000, formulaType: "FIXED", shiftOutputRef: 280, derivedPerUnit: 4.000 / 280 },
  { projectCategory: "ALL",    sortOrder: 2, equipmentType: "Vibratory Roller", equipmentSpec: "10T",          purpose: "compaction", unit: "hrs", quantityPerShift: 2.500, formulaType: "FIXED", shiftOutputRef: 400, derivedPerUnit: 2.500 / 400 },
  { projectCategory: "LARGE",  sortOrder: 3, equipmentType: "Water Tanker",     equipmentSpec: "12 KL",        purpose: "watering",   unit: "hrs", quantityPerShift: null,  formulaType: "LEAD_FORMULA", formulaExpr: "0.365*L1+1.260", shiftOutputRef: 400, derivedPerUnit: null },
  { projectCategory: "MEDIUM", sortOrder: 3, equipmentType: "Water Tanker",     equipmentSpec: "12 KL",        purpose: "watering",   unit: "hrs", quantityPerShift: null,  formulaType: "LEAD_FORMULA", formulaExpr: "0.365*L1+1.260", shiftOutputRef: 400, derivedPerUnit: null },
  { projectCategory: "SMALL",  sortOrder: 3, equipmentType: "Water Tanker",     equipmentSpec: "6 KL",         purpose: "watering",   unit: "hrs", quantityPerShift: null,  formulaType: "LEAD_FORMULA", formulaExpr: "0.729*L1+2.520", shiftOutputRef: 280, derivedPerUnit: null },
];

export const SHOULDERS_MATERIALS = [
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 1, materialName: "Borrow Material / Earth (shoulders)", materialCategory: "BULK_FILL", unit: "CUM", quantityPerShift: 400, shiftOutputRef: 400, derivedPerUnit: 1.000, isDesignSpecific: false },
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 2, materialName: "Water",                               materialCategory: "WATER",     unit: "KL",  quantityPerShift: 24.000, shiftOutputRef: 400, derivedPerUnit: 24.000 / 400, isDesignSpecific: false },
];

// ─── ITEM 15: PIPE CULVERT (RCC NP3 600mm) 7.09.1 ──────────────────────────
export const PIPE_CULVERT_ITEM = {
  itemCode: "7.09.1",
  description: "Providing and laying NP3 class RCC hume pipe 600mm internal diameter including jointing with cement mortar 1:2, laying on PCC M10 bedding, backfilling and compaction, all complete as per drawings and IS 458.",
  shortLabel: "RCC Hume Pipe 600mm NP3",
  unit: "RM",
  workCategory: "DRAINAGE",
  workSubCategory: "Pipe Culvert",
  chapterNo: "7",
  chapterTitle: "Drainage, Erosion Control and Waterways",
  sourcePage: "210",
  specClause: "IS 458 / Clause 701",
  isMixSpecific: false,
  hasGradingVariants: false,
  notes: "Output = 40 RM/8-hr shift including trenching, bedding, laying and jointing. Excavator does trenching.",
};

export const PIPE_CULVERT_PRODUCTIVITY = [
  { projectCategory: "LARGE",  shiftOutput: 50, shiftHours: 8, outputUnit: "RM", derivedPerHour: 6.25 },
  { projectCategory: "MEDIUM", shiftOutput: 40, shiftHours: 8, outputUnit: "RM", derivedPerHour: 5 },
  { projectCategory: "SMALL",  shiftOutput: 25, shiftHours: 8, outputUnit: "RM", derivedPerHour: 3.125 },
];

export const PIPE_CULVERT_LABOUR = [
  { projectCategory: "ALL", sortOrder: 1, designation: "Mate",            skillTier: "SUPERVISORY", unit: "day", quantityPerShift: 0.200, shiftOutputRef: 40, derivedPerUnit: 0.200 / 40 },
  { projectCategory: "ALL", sortOrder: 2, designation: "Mason",           skillTier: "SKILLED",     unit: "day", quantityPerShift: 2.000, shiftOutputRef: 40, derivedPerUnit: 2.000 / 40 },
  { projectCategory: "ALL", sortOrder: 3, designation: "Mazdoor Skilled", skillTier: "SKILLED",     unit: "day", quantityPerShift: 3.000, shiftOutputRef: 40, derivedPerUnit: 3.000 / 40 },
  { projectCategory: "ALL", sortOrder: 4, designation: "Mazdoor",         skillTier: "UNSKILLED",   unit: "day", quantityPerShift: 6.000, shiftOutputRef: 40, derivedPerUnit: 6.000 / 40 },
];

export const PIPE_CULVERT_EQUIPMENT = [
  { projectCategory: "ALL", sortOrder: 1, equipmentType: "Hydraulic Excavator", equipmentSpec: "0.9 CUM (trench)", purpose: "excavation", unit: "hrs", quantityPerShift: 4.0, formulaType: "FIXED", shiftOutputRef: 40, derivedPerUnit: 4.0 / 40 },
  { projectCategory: "ALL", sortOrder: 2, equipmentType: "Crane/Pipe Layer",    equipmentSpec: "5T capacity",      purpose: "laying",     unit: "hrs", quantityPerShift: 6.0, formulaType: "FIXED", shiftOutputRef: 40, derivedPerUnit: 6.0 / 40 },
  { projectCategory: "ALL", sortOrder: 3, equipmentType: "Concrete Mixer",      equipmentSpec: "10/7",             purpose: "bedding",    unit: "hrs", quantityPerShift: 2.0, formulaType: "FIXED", shiftOutputRef: 40, derivedPerUnit: 2.0 / 40 },
];

export const PIPE_CULVERT_MATERIALS = [
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 1, materialName: "RCC Hume Pipe NP3 600mm dia", materialCategory: "PIPE",    unit: "RM",  quantityPerShift: 40.000, shiftOutputRef: 40, derivedPerUnit: 1.000, isDesignSpecific: false },
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 2, materialName: "OPC 43 Cement (bedding)",     materialCategory: "CEMENT",  unit: "MT",  quantityPerShift: 0.900,  shiftOutputRef: 40, derivedPerUnit: 0.900 / 40, isDesignSpecific: false, notes: "PCC M10 bedding + joint mortar" },
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 3, materialName: "Fine Aggregate (Sand)",       materialCategory: "AGGREGATE", unit: "CUM", quantityPerShift: 0.600, shiftOutputRef: 40, derivedPerUnit: 0.600 / 40, isDesignSpecific: false },
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 4, materialName: "Coarse Aggregate 20mm",       materialCategory: "AGGREGATE", unit: "CUM", quantityPerShift: 1.200, shiftOutputRef: 40, derivedPerUnit: 1.200 / 40, isDesignSpecific: false },
];

// ─── MoRTH 9.2: NP4 pipes, first-class bedding, single row ─────────────────
// Source workbook: MoRTH Standard Data Book Road & Bridge, sheet 13, items 9.2.
// The workbook supplies a generic laying output of 12.5 m (five 2.5 m pipes);
// it does not provide plant-hours, so no equipment is inferred here.
const NP4_SINGLE_ROW_PRODUCTIVITY = [
  { projectCategory: "ALL", shiftOutput: 12.5, shiftHours: 8, outputUnit: "RM", derivedPerHour: 12.5 / 8 },
];
const NP4_SINGLE_ROW_EQUIPMENT: never[] = [];

export const PIPE_CULVERT_NP4_1000MM_ITEM = {
  itemCode: "9.2-NP4-1000", description: "Laying reinforced cement concrete pipe NP4 / prestressed concrete pipe 1000mm dia on first class bedding in single row including fixing collar with cement mortar 1:2.", shortLabel: "RCC Pipe NP4 1000mm — single row", unit: "RM", workCategory: "CROSS_DRAINAGE", workSubCategory: "Pipe Culvert", chapterNo: "9", chapterTitle: "Pipe Culverts", sourcePage: "Workbook sheet 9", specClause: "MoRTH 9.2", sector: "STRUCTURE", isMixSpecific: false, hasGradingVariants: false, notes: "Source material code M-149; output stated as 12.5 m/shift.",
};
export const PIPE_CULVERT_NP4_1000MM_PRODUCTIVITY = NP4_SINGLE_ROW_PRODUCTIVITY;
export const PIPE_CULVERT_NP4_1000MM_LABOUR = [
  { projectCategory: "ALL", sortOrder: 1, designation: "Mate", skillTier: "SUPERVISORY", unit: "day", quantityPerShift: 0.18, shiftOutputRef: 12.5, derivedPerUnit: 0.18 / 12.5 },
  { projectCategory: "ALL", sortOrder: 2, designation: "Mason", skillTier: "SKILLED", unit: "day", quantityPerShift: 0.5, shiftOutputRef: 12.5, derivedPerUnit: 0.5 / 12.5 },
  { projectCategory: "ALL", sortOrder: 3, designation: "Mazdoor", skillTier: "UNSKILLED", unit: "day", quantityPerShift: 4, shiftOutputRef: 12.5, derivedPerUnit: 4 / 12.5 },
];
export const PIPE_CULVERT_NP4_1000MM_EQUIPMENT = NP4_SINGLE_ROW_EQUIPMENT;
export const PIPE_CULVERT_NP4_1000MM_MATERIALS = [
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 1, materialName: "Sand at site (M-005)", materialCategory: "AGGREGATE", unit: "CUM", quantityPerShift: 0.07, shiftOutputRef: 12.5, derivedPerUnit: 0.07 / 12.5, isDesignSpecific: false },
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 2, materialName: "Cement at site (M-081)", materialCategory: "CEMENT", unit: "MT", quantityPerShift: 0.05, shiftOutputRef: 12.5, derivedPerUnit: 0.05 / 12.5, isDesignSpecific: false },
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 3, materialName: "RCC Pipe NP4 1000mm dia (M-149)", materialCategory: "PIPE", unit: "RM", quantityPerShift: 12.5, shiftOutputRef: 12.5, derivedPerUnit: 1, isDesignSpecific: false },
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 4, materialName: "Granular material passing 5.6mm sieve for bedding (M-009)", materialCategory: "AGGREGATE", unit: "CUM", quantityPerShift: 4.5, shiftOutputRef: 12.5, derivedPerUnit: 4.5 / 12.5, isDesignSpecific: false },
];

export const PIPE_CULVERT_NP4_1200MM_ITEM = {
  ...PIPE_CULVERT_NP4_1000MM_ITEM, itemCode: "9.2-NP4-1200", description: "Laying reinforced cement concrete pipe NP4 / prestressed concrete pipe 1200mm dia on first class bedding in single row including fixing collar with cement mortar 1:2.", shortLabel: "RCC Pipe NP4 1200mm — single row", notes: "Source material code M-150; output stated as 12.5 m/shift.",
};
export const PIPE_CULVERT_NP4_1200MM_PRODUCTIVITY = NP4_SINGLE_ROW_PRODUCTIVITY;
export const PIPE_CULVERT_NP4_1200MM_LABOUR = [
  { projectCategory: "ALL", sortOrder: 1, designation: "Mate", skillTier: "SUPERVISORY", unit: "day", quantityPerShift: 0.28, shiftOutputRef: 12.5, derivedPerUnit: 0.28 / 12.5 },
  { projectCategory: "ALL", sortOrder: 2, designation: "Mason", skillTier: "SKILLED", unit: "day", quantityPerShift: 1, shiftOutputRef: 12.5, derivedPerUnit: 1 / 12.5 },
  { projectCategory: "ALL", sortOrder: 3, designation: "Mazdoor", skillTier: "UNSKILLED", unit: "day", quantityPerShift: 6, shiftOutputRef: 12.5, derivedPerUnit: 6 / 12.5 },
];
export const PIPE_CULVERT_NP4_1200MM_EQUIPMENT = NP4_SINGLE_ROW_EQUIPMENT;
export const PIPE_CULVERT_NP4_1200MM_MATERIALS = [
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 1, materialName: "Sand at site (M-005)", materialCategory: "AGGREGATE", unit: "CUM", quantityPerShift: 0.09, shiftOutputRef: 12.5, derivedPerUnit: 0.09 / 12.5, isDesignSpecific: false },
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 2, materialName: "Cement at site (M-081)", materialCategory: "CEMENT", unit: "MT", quantityPerShift: 0.07, shiftOutputRef: 12.5, derivedPerUnit: 0.07 / 12.5, isDesignSpecific: false },
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 3, materialName: "RCC Pipe NP4 1200mm dia (M-150)", materialCategory: "PIPE", unit: "RM", quantityPerShift: 12.5, shiftOutputRef: 12.5, derivedPerUnit: 1, isDesignSpecific: false },
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 4, materialName: "Granular material passing 5-6mm sieve for bedding (M-009)", materialCategory: "AGGREGATE", unit: "CUM", quantityPerShift: 5, shiftOutputRef: 12.5, derivedPerUnit: 5 / 12.5, isDesignSpecific: false },
];

export const PIPE_CULVERT_NP4_300MM_ITEM = {
  ...PIPE_CULVERT_NP4_1000MM_ITEM, itemCode: "9.2-NP4-300", description: "Laying reinforced cement concrete pipe NP4 / prestressed concrete pipe 300mm dia on first class bedding in single row including fixing collar with cement mortar 1:2.", shortLabel: "RCC Pipe NP4 300mm — single row", notes: "Source material code M-151 is present in the workbook input catalogue; no diameter-specific 9.2 labour or bedding norm is supplied.",
};
export const PIPE_CULVERT_NP4_300MM_PRODUCTIVITY = NP4_SINGLE_ROW_PRODUCTIVITY;
export const PIPE_CULVERT_NP4_300MM_LABOUR: never[] = [];
export const PIPE_CULVERT_NP4_300MM_EQUIPMENT = NP4_SINGLE_ROW_EQUIPMENT;
export const PIPE_CULVERT_NP4_300MM_MATERIALS = [
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 1, materialName: "RCC Pipe NP4 300mm dia (M-151)", materialCategory: "PIPE", unit: "RM", quantityPerShift: 12.5, shiftOutputRef: 12.5, derivedPerUnit: 1, isDesignSpecific: false },
];

// ─── MoRTH 9.3: NP4 pipes, first-class bedding, double row ─────────────────
// The same workbook explicitly provides 1000mm/M-149 and 1200mm/M-150 variants.
// Output is 12.5m of culvert; pipe consumption is 25m because two rows are laid.
export const PIPE_CULVERT_NP4_1000MM_DOUBLE_ITEM = {
  ...PIPE_CULVERT_NP4_1000MM_ITEM,
  itemCode: "9.3-NP4-1000",
  description: "Laying reinforced cement concrete pipe NP4 / prestressed concrete pipe 1000mm dia on first class bedding in double row including fixing collar with cement mortar 1:2.",
  shortLabel: "RCC Pipe NP4 1000mm — double row",
  specClause: "MoRTH 9.3",
  notes: "Source material code M-149; output 12.5 m/shift using 25 m of pipe in two rows.",
};
export const PIPE_CULVERT_NP4_1000MM_DOUBLE_PRODUCTIVITY = NP4_SINGLE_ROW_PRODUCTIVITY;
export const PIPE_CULVERT_NP4_1000MM_DOUBLE_LABOUR = [
  { projectCategory: "ALL", sortOrder: 1, designation: "Mate", skillTier: "SUPERVISORY", unit: "day", quantityPerShift: 0.36, shiftOutputRef: 12.5, derivedPerUnit: 0.36 / 12.5 },
  { projectCategory: "ALL", sortOrder: 2, designation: "Mason", skillTier: "SKILLED", unit: "day", quantityPerShift: 1, shiftOutputRef: 12.5, derivedPerUnit: 1 / 12.5 },
  { projectCategory: "ALL", sortOrder: 3, designation: "Mazdoor", skillTier: "UNSKILLED", unit: "day", quantityPerShift: 8, shiftOutputRef: 12.5, derivedPerUnit: 8 / 12.5 },
];
export const PIPE_CULVERT_NP4_1000MM_DOUBLE_EQUIPMENT = NP4_SINGLE_ROW_EQUIPMENT;
export const PIPE_CULVERT_NP4_1000MM_DOUBLE_MATERIALS = [
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 1, materialName: "Sand at site (M-005)", materialCategory: "AGGREGATE", unit: "CUM", quantityPerShift: 0.14, shiftOutputRef: 12.5, derivedPerUnit: 0.14 / 12.5, isDesignSpecific: false },
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 2, materialName: "Cement at site (M-081)", materialCategory: "CEMENT", unit: "MT", quantityPerShift: 0.1, shiftOutputRef: 12.5, derivedPerUnit: 0.1 / 12.5, isDesignSpecific: false },
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 3, materialName: "RCC Pipe NP4 1000mm dia (M-149)", materialCategory: "PIPE", unit: "RM", quantityPerShift: 25, shiftOutputRef: 12.5, derivedPerUnit: 2, isDesignSpecific: false },
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 4, materialName: "Granular material passing 5.6mm sieve for bedding (M-009)", materialCategory: "AGGREGATE", unit: "CUM", quantityPerShift: 12.5, shiftOutputRef: 12.5, derivedPerUnit: 1, isDesignSpecific: false },
];

export const PIPE_CULVERT_NP4_1200MM_DOUBLE_ITEM = {
  ...PIPE_CULVERT_NP4_1000MM_DOUBLE_ITEM,
  itemCode: "9.3-NP4-1200",
  description: "Laying reinforced cement concrete pipe NP4 / prestressed concrete pipe 1200mm dia on first class bedding in double row including fixing collar with cement mortar 1:2.",
  shortLabel: "RCC Pipe NP4 1200mm — double row",
  notes: "Source material code M-150; output 12.5 m/shift using 25 m of pipe in two rows.",
};
export const PIPE_CULVERT_NP4_1200MM_DOUBLE_PRODUCTIVITY = NP4_SINGLE_ROW_PRODUCTIVITY;
export const PIPE_CULVERT_NP4_1200MM_DOUBLE_LABOUR = [
  { projectCategory: "ALL", sortOrder: 1, designation: "Mate", skillTier: "SUPERVISORY", unit: "day", quantityPerShift: 0.56, shiftOutputRef: 12.5, derivedPerUnit: 0.56 / 12.5 },
  { projectCategory: "ALL", sortOrder: 2, designation: "Mason", skillTier: "SKILLED", unit: "day", quantityPerShift: 2, shiftOutputRef: 12.5, derivedPerUnit: 2 / 12.5 },
  { projectCategory: "ALL", sortOrder: 3, designation: "Mazdoor", skillTier: "UNSKILLED", unit: "day", quantityPerShift: 12, shiftOutputRef: 12.5, derivedPerUnit: 12 / 12.5 },
];
export const PIPE_CULVERT_NP4_1200MM_DOUBLE_EQUIPMENT = NP4_SINGLE_ROW_EQUIPMENT;
export const PIPE_CULVERT_NP4_1200MM_DOUBLE_MATERIALS = [
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 1, materialName: "Sand at site (M-005)", materialCategory: "AGGREGATE", unit: "CUM", quantityPerShift: 0.18, shiftOutputRef: 12.5, derivedPerUnit: 0.18 / 12.5, isDesignSpecific: false },
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 2, materialName: "Cement at site (M-081)", materialCategory: "CEMENT", unit: "MT", quantityPerShift: 0.14, shiftOutputRef: 12.5, derivedPerUnit: 0.14 / 12.5, isDesignSpecific: false },
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 3, materialName: "RCC Pipe NP4 1200mm dia (M-150)", materialCategory: "PIPE", unit: "RM", quantityPerShift: 25, shiftOutputRef: 12.5, derivedPerUnit: 2, isDesignSpecific: false },
  { projectCategory: "ALL", gradingVariant: null, sortOrder: 4, materialName: "Granular material passing 5-6mm sieve for bedding (M-009)", materialCategory: "AGGREGATE", unit: "CUM", quantityPerShift: 13.75, shiftOutputRef: 12.5, derivedPerUnit: 1.1, isDesignSpecific: false },
];
