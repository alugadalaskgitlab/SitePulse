/**
 * ONE-TIME production seed: transfers "Takkadpally-sirur" BOQ project
 * from development into production.
 *
 * Guards:
 *  - Only runs when NODE_ENV === "production"
 *  - Only runs when boq_projects table is empty (idempotent)
 *
 * Remove this file and its call in index.ts once the migration is confirmed.
 */

import { pool } from "../db";

// ─── Source data (from heliumdb dev, project id=2) ──────────────────────────

const SRC_ITEMS = [
  { oldId: 13,   itemCode: "C&G",  description: "Clearing and grubbing road land including uprooting rank vegetation, grass and trees girth up to 300 mm, disposal of unserviceable materials and stacking of serviceable material to be used or auctioned, up to a lead of 1000 metres including removal and disposal of top organic soil not exceeding 150 mm in thickness.", unit: "Ha",  boqQty: 3.8,       currentQty: 3.8,       clientRate: 39807,  clientAmount: 151266.6,    sortOrder: 0,  workCategory: "SITE_CLEARANCE",  layerConfig: null,                                                                             mappingStatus: "mapped", itemName: "Clearing and grubbing",                          dprConversionFactor: 0.0001, includedInPlanning: true, planningWorkType: "road", isComposite: false, displayName: "Clearing and grubbing",                          includeInDpr: true, includeInProcurement: true, needsReview: false, canonicalUnit: "Ha"  },
  { oldId: 1147, itemCode: null,   description: "Scarifying the existing B.T surface  to a depth of 50 mm by Mechanical means and disposal of scarified material with all leads and lifts upto 1000 Mtrs as per MoRT&H (5th revision) Specn. No.305.4.3",                                                                                                                                    unit: "Sqm", boqQty: 9880,       currentQty: 9880,       clientRate: 10.3,   clientAmount: 101764,       sortOrder: 1,  workCategory: "SITE_CLEARANCE",  layerConfig: null,                                                                             mappingStatus: "mapped", itemName: "Scarifying the existing B.T",                    dprConversionFactor: null,   includedInPlanning: true, planningWorkType: "road", isComposite: false, displayName: "Scarifying the existing B.T",                    includeInDpr: true, includeInProcurement: true, needsReview: false, canonicalUnit: "Sqm" },
  { oldId: 1148, itemCode: null,   description: "Earthwork excavation  in road way  soils upto SDR  by mechanical means  including trimming bottom and side slopes in accordance with requirements of lines, grades and cross sections etc.,  complete  including  for finished item of work for trench cutting as per MoRT&H specification 301(5th Revision)  and as directed by the Engineer-in-Charge",                                                                                                                                                                             unit: "Cum", boqQty: 3403.698,   currentQty: 3403.698,   clientRate: 53.1,   clientAmount: 180736.36,    sortOrder: 2,  workCategory: "EARTHWORK",       layerConfig: null,                                                                             mappingStatus: "mapped", itemName: "Earthwork excavation in road",                   dprConversionFactor: null,   includedInPlanning: true, planningWorkType: "road", isComposite: false, displayName: "roadway excavation",                             includeInDpr: true, includeInProcurement: true, needsReview: false, canonicalUnit: "Cum" },
  { oldId: 1149, itemCode: null,   description: "Forming embankment with excavated earth obtained from roadway excavation for Embankment  by mechanical means upto SDR including pre-watering of soil, removal of top soil, excavation of soils, depositing the soils on the embankment, spreading soil, breaking clods, sectioning, grading and consolidation with 8 to 10 Tonnes Vibratory Road Roller @ OMC to meet requirement of table 300-2 of MoRT&H,  including  all hire and operational charges of T&P  and  complete for finished item of work as per MoRT&H specification 305 (5th revision).", unit: "Cum", boqQty: 3403.698,   currentQty: 3403.698,   clientRate: 125,    clientAmount: 425462.25,    sortOrder: 3,  workCategory: "EARTHWORK",       layerConfig: { layerType: "earthwork" },                                               mappingStatus: "mapped", itemName: "Forming embankment with excavated",               dprConversionFactor: null,   includedInPlanning: true, planningWorkType: "road", isComposite: false, displayName: "embankment - excavated earth",                   includeInDpr: true, includeInProcurement: true, needsReview: false, canonicalUnit: "Cum" },
  { oldId: 1150, itemCode: null,   description: "Construction of Embankment with material obtained from borrowed useful earth from outside road boundary MDD of 18 KN/Cum , CBR \u226512%, PI < 12%, by mechanical means upto SDR with all leads and lifts including pre-watering of soil at borrow area, removal of top soil, excavation of soils at borrowed area, conveyance of soil, depositing the soil on the embankment, spreading soil, breaking clods, sectioning, grading and consolidation with 8 to 10 Tonnes Vibratory Road Roller @ OMC to meet requirement of table 300-2 of MoRT&H, including  all hire and operational charges of T&P, complete for finished item of work as per MoRT&H specification 305 (5th revision).", unit: "Cum", boqQty: 10185.14,   currentQty: 10185.14,   clientRate: 378,    clientAmount: 3849983,      sortOrder: 4,  workCategory: "EARTHWORK",       layerConfig: null,                                                                             mappingStatus: "mapped", itemName: "Construction of Embankment with",                dprConversionFactor: null,   includedInPlanning: true, planningWorkType: "road", isComposite: false, displayName: "Embankment - Borrow earth",                      includeInDpr: true, includeInProcurement: true, needsReview: false, canonicalUnit: "Cum" },
  { oldId: 1151, itemCode: null,   description: "Construction of Sub grade with approved material obtained from borrow pits having CBR more than 10, with all lifts and leads transporting to site, spreading, grading to required slope and compacted , removal of top soil, excavation of soils at borrowed area, conveyance of soil, depositing the soil , spreading soil, breaking clods, sectioning, grading and consolidation with 8 to 10 Tonnes Vibratory Road Roller @ OMC to meet requirement of table 300-2 of MoRT&H, including  all hire and operational charges of T&P  and excluding seigniorage charges, complete for finished item of work as per MoRT&H specification 305 (5th Revision)( Note:The Work of Embankment and Subgrade shall be carried out as per plan and profile and payment shall be made based on approved plan and profile by the levels)", unit: "Cum", boqQty: 24548,       currentQty: 24548,       clientRate: 378,    clientAmount: 9279144,      sortOrder: 5,  workCategory: "EARTHWORK",       layerConfig: null,                                                                             mappingStatus: "mapped", itemName: "Construction of Sub grade",                      dprConversionFactor: null,   includedInPlanning: true, planningWorkType: "road", isComposite: false, displayName: "Construction of Sub grade",                      includeInDpr: true, includeInProcurement: true, needsReview: false, canonicalUnit: "Cum" },
  { oldId: 1152, itemCode: null,   description: "Construction of earthen shoulders with selective soils obtained from borrow pits with MDD of 18 KN/Cum , CBR \u226512%, PI < 12% from approved sources, grading and consoilidation with 8 to 10 Tonnes Vibratory Road Roller @ OMC to meet requirement of MoRT&H, including all hire and operational charges of T&P complete for finished item of work as per MoRT&H specification 305 (5th  revision)",                                                                                                                                                  unit: "Cum", boqQty: 7223.268,   currentQty: 7223.268,   clientRate: 333,    clientAmount: 2405348.2,    sortOrder: 6,  workCategory: "EARTHWORK",       layerConfig: null,                                                                             mappingStatus: "mapped", itemName: "Construction of earthen shoulders",              dprConversionFactor: null,   includedInPlanning: true, planningWorkType: "road", isComposite: false, displayName: "Construction of earthen shoulders",              includeInDpr: true, includeInProcurement: true, needsReview: false, canonicalUnit: "Cum" },
  { oldId: 1153, itemCode: null,   description: "Construction of Granular sub-base by providingHBG/HBG material confirming to Grading - VI of MoRT&H Table 400-2 including cost,  (excluding  seigniorage) charges and conveyance of all materials to work site and spreading in uniform layers with motor grader or by approved means,  on prepared surface mixing by mix in place method with Rotavator / approved means at OMC and compacting with vibratory roller to achieve the desired density etc., complete for finished item of work as per MoRT&H Specification   401  (5th revision) and as directed by the Engineer-in-charge. ( Payment will be made based on levels for finished item of work ).", unit: "Cum", boqQty: 5624,       currentQty: 5624,       clientRate: 1893,   clientAmount: 10646232,     sortOrder: 7,  workCategory: "SUBBASE_BASE",    layerConfig: null,                                                                             mappingStatus: "mapped", itemName: "Construction of Granular sub-base",              dprConversionFactor: null,   includedInPlanning: true, planningWorkType: "road", isComposite: false, displayName: "Construction of Granular sub-base",              includeInDpr: true, includeInProcurement: true, needsReview: false, canonicalUnit: "Cum" },
  { oldId: 21,   itemCode: null,   description: "Providing, Laying, Spreading and compacting graded HBG/HBG crushed stone aggregate to Wet Mix macadem specification including cost of all materials and including premixing the material with water at OMC in Mechanical mix plant carriage of mixed material by tipper to site , laying in uniform layers with paver in   base courses on well prepared surface and compacting with Vibratory roller to acheive the desired density etc., as directed by the Engineer-in-Charge and as per MoRT&H specification.406 (5th revision) for finished item of work. (Payment based on levels for finished item of work)",                                                                                                                                                                                                              unit: "Cum", boqQty: 6840,       currentQty: 6840,       clientRate: 2129,   clientAmount: 14562360,     sortOrder: 8,  workCategory: "SUBBASE_BASE",    layerConfig: { layerType: "granular", granularSource: "quarry" },                      mappingStatus: "mapped", itemName: "Wet Mix macadem",                                dprConversionFactor: null,   includedInPlanning: true, planningWorkType: "road", isComposite: false, displayName: "Wet Mix macadem",                                includeInDpr: true, includeInProcurement: true, needsReview: true,  canonicalUnit: "Cum" },
  { oldId: 1155, itemCode: null,   description: "Providing and applying prime coat with Bitumen Emulsion  (Slow Setting-1) on the prepared surface of granular base including clearing of road surface and sparaying primer at the rate of 0.70kg/sqm using mechanical means for finished item of work as per MoRT&H Specification 502 (5th revision) and as directed by the Engineer-in-Charge.",                                                                                                                                                                                                                                                                                                                                                                             unit: "Sqm", boqQty: 26600,      currentQty: 26600,      clientRate: 40.1,   clientAmount: 1066660,      sortOrder: 9,  workCategory: "BITUMINOUS",      layerConfig: null,                                                                             mappingStatus: "mapped", itemName: "Providing and applying prime",                   dprConversionFactor: null,   includedInPlanning: true, planningWorkType: "road", isComposite: false, displayName: "Providing and applying prime",                   includeInDpr: true, includeInProcurement: true, needsReview: false, canonicalUnit: "Sqm" },
  { oldId: 1156, itemCode: null,   description: "Providing and applying tack coat with bitumenemulsion (Rapid settting) (Bulk) using Emulsion pressure distributor at the rate of 0.20 kgs per sqm on the prepared bituminous/granular surface cleaned with mechanical broom for finished item of work as per MoRT&H Specification 503 (5th revision) and as directed by the Engineer-in-Charge.",                                                                                                                                                                                                                                                                                                                                                                           unit: "Sqm", boqQty: 26600,      currentQty: 26600,      clientRate: 11.7,   clientAmount: 311220,       sortOrder: 10, workCategory: "BITUMINOUS",      layerConfig: null,                                                                             mappingStatus: "mapped", itemName: "Providing and applying tack",                    dprConversionFactor: null,   includedInPlanning: true, planningWorkType: "road", isComposite: false, displayName: "Providing and applying tack",                    includeInDpr: true, includeInProcurement: true, needsReview: false, canonicalUnit: "Sqm" },
  { oldId: 24,   itemCode: null,   description: "Providing 40 mm thick compacted Bituminous Concrete with 100-120 TPH Batch mix plant using HBG crushed aggregates of size  9.5mm and below Grading \u2013 2 as per specification 507 of MoRT&H (5th revision), premixed with bitumen VG-30 grade @ 5.2% of mix and Hydrated lime@2%, transporting the hot mix to work site, laying with Hydrostatic Sensor paver to the required grade, level and alignment, rolling with smooth wheeled, vibratory and tandem rollers to achieve the desired compaction as per MoRT&H Specification 507 (5th revision) complete for finishe",                                                                                                                                                   unit: "Cum", boqQty: 1064,       currentQty: 1064,       clientRate: 9985,   clientAmount: 10622040,     sortOrder: 11, workCategory: "BITUMINOUS",      layerConfig: { mixType: "BC", layerType: "bituminous", thicknessMm: 40, mixTemplateId: 1, densityTPerCum: 2.35 }, mappingStatus: "mapped", itemName: "Providing 40 mm thick Bituminous Concrete",      dprConversionFactor: null,   includedInPlanning: true, planningWorkType: "road", isComposite: false, displayName: "Providing 40 mm thick Bituminous Concrete",      includeInDpr: true, includeInProcurement: true, needsReview: false, canonicalUnit: "Cum" },
];

// Bars: { oldItemId, reachLabel, chainageFrom, chainageTo, startMonth, endMonth, plannedQty }
const SRC_BARS = [
  { oldItemId: 13,   reachLabel: "Reach 1", chainageFrom: 0,   chainageTo: 1.9, startMonth: 1,    endMonth: 1.08, plannedQty: 1.9       },
  { oldItemId: 1147, reachLabel: "Reach 1", chainageFrom: 0,   chainageTo: 1.9, startMonth: 1.29, endMonth: 1.38, plannedQty: 4940      },
  { oldItemId: 1149, reachLabel: "Reach 1", chainageFrom: 0,   chainageTo: 1.9, startMonth: 1.59, endMonth: 1.86, plannedQty: 1701.849  },
  { oldItemId: 1150, reachLabel: "Reach 1", chainageFrom: 0,   chainageTo: 1.9, startMonth: 1.59, endMonth: 2.41, plannedQty: 5092.57   },
  { oldItemId: 1151, reachLabel: "Reach 1", chainageFrom: 0,   chainageTo: 1.9, startMonth: 1.59, endMonth: 3.57, plannedQty: 12274     },
  { oldItemId: 1152, reachLabel: "Reach 1", chainageFrom: 0,   chainageTo: 1.9, startMonth: 1.59, endMonth: 2.17, plannedQty: 3611.634  },
  { oldItemId: 1153, reachLabel: "Reach 1", chainageFrom: 0,   chainageTo: 1.9, startMonth: 3.78, endMonth: 4.17, plannedQty: 2812      },
  { oldItemId: 1155, reachLabel: "Reach 1", chainageFrom: 0,   chainageTo: 1.9, startMonth: 4.38, endMonth: 4.47, plannedQty: 13300     },
  { oldItemId: 1156, reachLabel: "Reach 1", chainageFrom: 0,   chainageTo: 1.9, startMonth: 4.68, endMonth: 4.76, plannedQty: 13300     },
  { oldItemId: 24,   reachLabel: "Reach 1", chainageFrom: 0,   chainageTo: 1.9, startMonth: 4.97, endMonth: 5.16, plannedQty: 532       },
  { oldItemId: 13,   reachLabel: "Reach 2", chainageFrom: 1.9, chainageTo: 3.8, startMonth: 1.84, endMonth: 1.92, plannedQty: 1.9       },
  { oldItemId: 1147, reachLabel: "Reach 2", chainageFrom: 1.9, chainageTo: 3.8, startMonth: 2.13, endMonth: 2.22, plannedQty: 4940      },
  { oldItemId: 1149, reachLabel: "Reach 2", chainageFrom: 1.9, chainageTo: 3.8, startMonth: 2.43, endMonth: 2.70, plannedQty: 1701.849  },
  { oldItemId: 1150, reachLabel: "Reach 2", chainageFrom: 1.9, chainageTo: 3.8, startMonth: 2.43, endMonth: 3.25, plannedQty: 5092.57   },
  { oldItemId: 1151, reachLabel: "Reach 2", chainageFrom: 1.9, chainageTo: 3.8, startMonth: 2.43, endMonth: 4.41, plannedQty: 12274     },
  { oldItemId: 1152, reachLabel: "Reach 2", chainageFrom: 1.9, chainageTo: 3.8, startMonth: 2.43, endMonth: 3.01, plannedQty: 3611.634  },
  { oldItemId: 1153, reachLabel: "Reach 2", chainageFrom: 1.9, chainageTo: 3.8, startMonth: 4.62, endMonth: 5.01, plannedQty: 2812      },
  { oldItemId: 1155, reachLabel: "Reach 2", chainageFrom: 1.9, chainageTo: 3.8, startMonth: 5.22, endMonth: 5.31, plannedQty: 13300     },
  { oldItemId: 1156, reachLabel: "Reach 2", chainageFrom: 1.9, chainageTo: 3.8, startMonth: 5.52, endMonth: 5.60, plannedQty: 13300     },
  { oldItemId: 24,   reachLabel: "Reach 2", chainageFrom: 1.9, chainageTo: 3.8, startMonth: 5.81, endMonth: 6.0,  plannedQty: 532       },
  { oldItemId: 21,   reachLabel: "Reach 1", chainageFrom: 0,   chainageTo: 1.9, startMonth: 2.85, endMonth: 5.0,  plannedQty: 3420      },
  { oldItemId: 21,   reachLabel: "Reach 2", chainageFrom: 1.9, chainageTo: 3.8, startMonth: 3.31, endMonth: 5.46, plannedQty: 3420      },
  { oldItemId: 1148, reachLabel: "Reach 1", chainageFrom: 0,   chainageTo: 1.9, startMonth: 1.32, endMonth: 1.38, plannedQty: 1701.849  },
  { oldItemId: 1148, reachLabel: "Reach 2", chainageFrom: 1.9, chainageTo: 3.8, startMonth: 1.78, endMonth: 1.84, plannedQty: 1701.849  },
];

// SNL mappings: try by snlItemId first, then description match
const SRC_SNL = [
  { oldItemId: 13,   snlItemId: 11,   projectCategory: "MEDIUM", isAutoMapped: false, confidenceScore: null, notes: null },
  { oldItemId: 21,   snlItemId: 1530, projectCategory: "ALL",    isAutoMapped: false, confidenceScore: null, notes: null },
  { oldItemId: 24,   snlItemId: 5,    projectCategory: "MEDIUM", isAutoMapped: false, confidenceScore: null, notes: null },
  { oldItemId: 1147, snlItemId: 56,   projectCategory: "MEDIUM", isAutoMapped: false, confidenceScore: null, notes: null },
  { oldItemId: 1148, snlItemId: 14,   projectCategory: "MEDIUM", isAutoMapped: false, confidenceScore: null, notes: null },
  { oldItemId: 1149, snlItemId: 1459, projectCategory: "MEDIUM", isAutoMapped: false, confidenceScore: null, notes: null },
  { oldItemId: 1150, snlItemId: 1,    projectCategory: "MEDIUM", isAutoMapped: false, confidenceScore: null, notes: null },
  { oldItemId: 1151, snlItemId: 1460, projectCategory: "MEDIUM", isAutoMapped: false, confidenceScore: null, notes: null },
  { oldItemId: 1152, snlItemId: 1460, projectCategory: "MEDIUM", isAutoMapped: false, confidenceScore: null, notes: null },
  { oldItemId: 1153, snlItemId: 2,    projectCategory: "MEDIUM", isAutoMapped: true,  confidenceScore: 0.82, notes: "Rule-matched tag: GSB" },
  { oldItemId: 1155, snlItemId: 18,   projectCategory: "MEDIUM", isAutoMapped: true,  confidenceScore: 0.82, notes: "Rule-matched tag: PRIME_COAT" },
  { oldItemId: 1156, snlItemId: 19,   projectCategory: "MEDIUM", isAutoMapped: true,  confidenceScore: 0.82, notes: "Rule-matched tag: TACK_COAT" },
];

// Materials: { oldItemId, materialName, uom, qtyPerBoqUnit, wastePct, isClientSupplied, sortOrder, isAuto, notes }
const SRC_MATERIALS = [
  { oldItemId: 1149, materialName: "Cost of water",                              uom: "KL",  qtyPerBoqUnit: 0.24,   wastePct: 0, isClientSupplied: false, sortOrder: 0, isAuto: true,  notes: "SNL 3.17" },
  { oldItemId: 1150, materialName: "Cost of water",                              uom: "KL",  qtyPerBoqUnit: 0.24,   wastePct: 0, isClientSupplied: false, sortOrder: 0, isAuto: true,  notes: "SNL 3.16" },
  { oldItemId: 1150, materialName: "Compensation for earth taken from private land", uom: "cum", qtyPerBoqUnit: 1, wastePct: 0, isClientSupplied: false, sortOrder: 1, isAuto: true,  notes: "SNL 3.16" },
  { oldItemId: 1151, materialName: "Cost of water",                              uom: "KL",  qtyPerBoqUnit: 0.24,   wastePct: 0, isClientSupplied: false, sortOrder: 0, isAuto: true,  notes: "SNL 3.18" },
  { oldItemId: 1151, materialName: "Compensation for earth taken from private land", uom: "cum", qtyPerBoqUnit: 1, wastePct: 0, isClientSupplied: false, sortOrder: 1, isAuto: true,  notes: "SNL 3.18" },
  { oldItemId: 1152, materialName: "Cost of water",                              uom: "KL",  qtyPerBoqUnit: 0.24,   wastePct: 0, isClientSupplied: false, sortOrder: 0, isAuto: true,  notes: "SNL 3.18" },
  { oldItemId: 1152, materialName: "Compensation for earth taken from private land", uom: "cum", qtyPerBoqUnit: 1, wastePct: 0, isClientSupplied: false, sortOrder: 1, isAuto: true,  notes: "SNL 3.18" },
  { oldItemId: 1155, materialName: "Bituminous Emulsion SS-1 @ 0.90 kg/SQM",   uom: "MT",  qtyPerBoqUnit: 0.0009, wastePct: 0, isClientSupplied: false, sortOrder: 1, isAuto: true,  notes: "@ 0.90 kg/SQM including 30% dilution" },
  { oldItemId: 1156, materialName: "Bituminous Emulsion RS-1 @ 0.30 kg/SQM",   uom: "MT",  qtyPerBoqUnit: 0.0003, wastePct: 0, isClientSupplied: false, sortOrder: 1, isAuto: true,  notes: "@ 0.30 kg/SQM undiluted" },
  { oldItemId: 21,   materialName: "Granular Material",                          uom: "CUM", qtyPerBoqUnit: 1,      wastePct: 0, isClientSupplied: false, sortOrder: 0, isAuto: true,  notes: null },
];

// Equipment: { oldItemId, equipmentName, qtyPerBoqUnit, count, sortOrder, notes }
// planning_equipment_type_id set to NULL for all (IDs differ between environments)
const SRC_EQUIPMENT = [
  { oldItemId: 13,   equipmentName: "Dozer (D6 class 130HP)",                                     qtyPerBoqUnit: 0.0016,         count: 1, sortOrder: 1,  notes: "SNL 2.01 [MEDIUM]" },
  { oldItemId: 13,   equipmentName: "Tipper (10 CUM (debris))",                                    qtyPerBoqUnit: 0.0008,         count: 1, sortOrder: 2,  notes: "SNL 2.01 [MEDIUM]" },
  { oldItemId: 1147, equipmentName: "Motor Grader with Scarifier (3.70m blade)",                   qtyPerBoqUnit: 0.004,          count: 1, sortOrder: 1,  notes: "SNL 2.05 [MEDIUM]" },
  { oldItemId: 1147, equipmentName: "Tipper (10 CUM)",                                             qtyPerBoqUnit: 0.0025,         count: 1, sortOrder: 2,  notes: "SNL 2.05 [MEDIUM]" },
  { oldItemId: 1148, equipmentName: "Hydraulic Excavator (1.1 CUM bucket)",                        qtyPerBoqUnit: 0.0129177775,   count: 1, sortOrder: 1,  notes: "SNL 3.01 [MEDIUM]" },
  { oldItemId: 1148, equipmentName: "Tipper (14 CUM)",                                             qtyPerBoqUnit: 0,              count: 1, sortOrder: 2,  notes: "SNL 3.01 [MEDIUM]" },
  { oldItemId: 1148, equipmentName: "Tipper (14 CUM (L/U))",                                       qtyPerBoqUnit: 0.0129177775,   count: 1, sortOrder: 3,  notes: "SNL 3.01 [MEDIUM]" },
  { oldItemId: 1149, equipmentName: "Dozer 80 HP for spreading @ 200 cum per hour",                qtyPerBoqUnit: 0.005,          count: 1, sortOrder: 0,  notes: "SNL 3.17 [MEDIUM]" },
  { oldItemId: 1149, equipmentName: "Motor grader for grading @ 100 cum per hour",                 qtyPerBoqUnit: 0.01,           count: 1, sortOrder: 1,  notes: "SNL 3.17 [MEDIUM]" },
  { oldItemId: 1149, equipmentName: "Water tanker6 KL capacity",                                   qtyPerBoqUnit: 0.04,           count: 1, sortOrder: 2,  notes: "SNL 3.17 [MEDIUM]" },
  { oldItemId: 1149, equipmentName: "Vibratory roller 8-10 tonnes @ 100 cum per hour",             qtyPerBoqUnit: 0.01,           count: 1, sortOrder: 3,  notes: "SNL 3.17 [MEDIUM]" },
  { oldItemId: 1150, equipmentName: "Hydraulic Excavator1 cum bucket capacity @ 60 cum per hour",  qtyPerBoqUnit: 0.0167,         count: 1, sortOrder: 0,  notes: "SNL 3.16 [MEDIUM]" },
  { oldItemId: 1150, equipmentName: "Tipper 10 tonne capacity",                                    qtyPerBoqUnit: 1.6,            count: 1, sortOrder: 1,  notes: "SNL 3.16 [MEDIUM]" },
  { oldItemId: 1150, equipmentName: "Dozer 80 HP for spreading @ 200 cum per hour",                qtyPerBoqUnit: 0.005,          count: 1, sortOrder: 2,  notes: "SNL 3.16 [MEDIUM]" },
  { oldItemId: 1150, equipmentName: "Motor grader for grading @ 100 cum per hour",                 qtyPerBoqUnit: 0.01,           count: 1, sortOrder: 3,  notes: "SNL 3.16 [MEDIUM]" },
  { oldItemId: 1150, equipmentName: "Water tanker6 KL capacity",                                   qtyPerBoqUnit: 0.04,           count: 1, sortOrder: 4,  notes: "SNL 3.16 [MEDIUM]" },
  { oldItemId: 1150, equipmentName: "Vibratory roller 8 -10 tonnes @ 100 cum per hour",            qtyPerBoqUnit: 0.01,           count: 1, sortOrder: 5,  notes: "SNL 3.16 [MEDIUM]" },
  { oldItemId: 1151, equipmentName: "Hydraulic excavator1 cum bucket capacity @ 60 cum per hour",  qtyPerBoqUnit: 0.0167,         count: 1, sortOrder: 0,  notes: "SNL 3.18 [MEDIUM]" },
  { oldItemId: 1151, equipmentName: "Tipper 10 tonne capacity",                                    qtyPerBoqUnit: 1.75,           count: 1, sortOrder: 1,  notes: "SNL 3.18 [MEDIUM]" },
  { oldItemId: 1151, equipmentName: "Dozer 80 HP for spreading @ 200 cum per hour",                qtyPerBoqUnit: 0.005,          count: 1, sortOrder: 2,  notes: "SNL 3.18 [MEDIUM]" },
  { oldItemId: 1151, equipmentName: "Motor grader for grading @ 50 cum per hour",                  qtyPerBoqUnit: 0.02,           count: 1, sortOrder: 3,  notes: "SNL 3.18 [MEDIUM]" },
  { oldItemId: 1151, equipmentName: "Water tanker with 6 km lead",                                 qtyPerBoqUnit: 0.04,           count: 1, sortOrder: 4,  notes: "SNL 3.18 [MEDIUM]" },
  { oldItemId: 1151, equipmentName: "Vibratory roller 8-10 tonnes @ 80 cum per hour",              qtyPerBoqUnit: 0.0125,         count: 1, sortOrder: 5,  notes: "SNL 3.18 [MEDIUM]" },
  { oldItemId: 1152, equipmentName: "Hydraulic excavator1 cum bucket capacity @ 60 cum per hour",  qtyPerBoqUnit: 0.0167,         count: 1, sortOrder: 0,  notes: "SNL 3.18 [MEDIUM]" },
  { oldItemId: 1152, equipmentName: "Tipper 10 tonne capacity",                                    qtyPerBoqUnit: 1.75,           count: 1, sortOrder: 1,  notes: "SNL 3.18 [MEDIUM]" },
  { oldItemId: 1152, equipmentName: "Dozer 80 HP for spreading @ 200 cum per hour",                qtyPerBoqUnit: 0.005,          count: 1, sortOrder: 2,  notes: "SNL 3.18 [MEDIUM]" },
  { oldItemId: 1152, equipmentName: "Motor grader for grading @ 50 cum per hour",                  qtyPerBoqUnit: 0.02,           count: 1, sortOrder: 3,  notes: "SNL 3.18 [MEDIUM]" },
  { oldItemId: 1152, equipmentName: "Water tanker with 6 km lead",                                 qtyPerBoqUnit: 0.04,           count: 1, sortOrder: 4,  notes: "SNL 3.18 [MEDIUM]" },
  { oldItemId: 1152, equipmentName: "Vibratory roller 8-10 tonnes @ 80 cum per hour",              qtyPerBoqUnit: 0.0125,         count: 1, sortOrder: 5,  notes: "SNL 3.18 [MEDIUM]" },
  { oldItemId: 1153, equipmentName: "WMM Mixing Plant (200 TPH)",                                  qtyPerBoqUnit: 0.014,          count: 1, sortOrder: 1,  notes: "SNL 4.01A [MEDIUM]" },
  { oldItemId: 1153, equipmentName: "Electric Generator (100 KVA)",                                qtyPerBoqUnit: 0.014,          count: 1, sortOrder: 2,  notes: "SNL 4.01A [MEDIUM]" },
  { oldItemId: 1153, equipmentName: "Front End Loader (2.1 CUM)",                                  qtyPerBoqUnit: 0.0351175,      count: 1, sortOrder: 3,  notes: "SNL 4.01A [MEDIUM]" },
  { oldItemId: 1153, equipmentName: "Tipper (14 CUM)",                                             qtyPerBoqUnit: 0,              count: 1, sortOrder: 4,  notes: "SNL 4.01A [MEDIUM]" },
  { oldItemId: 1153, equipmentName: "Tipper (14 CUM (L/U))",                                       qtyPerBoqUnit: 0.014,          count: 1, sortOrder: 5,  notes: "SNL 4.01A [MEDIUM]" },
  { oldItemId: 1153, equipmentName: "Motor Grader (3.70m blade)",                                  qtyPerBoqUnit: 0.0084775,      count: 1, sortOrder: 6,  notes: "SNL 4.01A [MEDIUM]" },
  { oldItemId: 1153, equipmentName: "Vibratory Roller",                                            qtyPerBoqUnit: 0.0064725,      count: 1, sortOrder: 7,  notes: "SNL 4.01A [MEDIUM]" },
  { oldItemId: 1155, equipmentName: "Bitumen Pressure Distributor (4000 L tank)",                  qtyPerBoqUnit: 0.0008,         count: 1, sortOrder: 1,  notes: "SNL 5.01 [MEDIUM]" },
  { oldItemId: 1155, equipmentName: "Air Compressor (250 CFM)",                                    qtyPerBoqUnit: 0.00015,        count: 1, sortOrder: 2,  notes: "SNL 5.01 [MEDIUM]" },
  { oldItemId: 1155, equipmentName: "Mechanical Broom (2.1m width)",                               qtyPerBoqUnit: 0.00015,        count: 1, sortOrder: 3,  notes: "SNL 5.01 [MEDIUM]" },
  { oldItemId: 1156, equipmentName: "Bitumen Pressure Distributor (4000 L tank)",                  qtyPerBoqUnit: 0.00053333334,  count: 1, sortOrder: 1,  notes: "SNL 5.02 [MEDIUM]" },
  { oldItemId: 24,   equipmentName: "Hot Mix Plant (160 TPH)",                                     qtyPerBoqUnit: 0.01966492,     count: 1, sortOrder: 1,  notes: "SNL 5.05 [MEDIUM]" },
  { oldItemId: 24,   equipmentName: "Mechanical Broom (2.1m width)",                               qtyPerBoqUnit: 0.0085026175,   count: 1, sortOrder: 2,  notes: "SNL 5.05 [MEDIUM]" },
  { oldItemId: 24,   equipmentName: "Air Compressor (250 CFM)",                                    qtyPerBoqUnit: 0.0085026175,   count: 1, sortOrder: 3,  notes: "SNL 5.05 [MEDIUM]" },
  { oldItemId: 24,   equipmentName: "Paver Finisher (240 HP hydrostatic)",                         qtyPerBoqUnit: 0.01966492,     count: 1, sortOrder: 4,  notes: "SNL 5.05 [MEDIUM]" },
  { oldItemId: 24,   equipmentName: "Electric Generator (400 KVA)",                                qtyPerBoqUnit: 0.01966492,     count: 1, sortOrder: 5,  notes: "SNL 5.05 [MEDIUM]" },
  { oldItemId: 24,   equipmentName: "Front End Loader (2.1 CUM)",                                  qtyPerBoqUnit: 0.038628273,    count: 1, sortOrder: 6,  notes: "SNL 5.05 [MEDIUM]" },
  { oldItemId: 24,   equipmentName: "Tipper (transport)",                                          qtyPerBoqUnit: 0,              count: 1, sortOrder: 7,  notes: "SNL 5.05 [MEDIUM]" },
  { oldItemId: 24,   equipmentName: "Tipper (14 CUM (L/U))",                                       qtyPerBoqUnit: 0.03933508,     count: 1, sortOrder: 8,  notes: "SNL 5.05 [MEDIUM]" },
  { oldItemId: 24,   equipmentName: "Smooth Steel Tandem Roller (static+vibratory)",               qtyPerBoqUnit: 0.08849215,     count: 1, sortOrder: 9,  notes: "BC needs ~2\u00d7 roller passes vs DBM" },
  { oldItemId: 24,   equipmentName: "Pneumatic Tyre Roller",                                       qtyPerBoqUnit: 0.015732985,    count: 1, sortOrder: 10, notes: "SNL 5.05 [MEDIUM]" },
  { oldItemId: 21,   equipmentName: "Wet mix plant of 75 tonne hourly capacity",                   qtyPerBoqUnit: 0.04,           count: 1, sortOrder: 0,  notes: "SNL 4.12 [ALL]" },
  { oldItemId: 21,   equipmentName: "Electric generator 125 KVA",                                  qtyPerBoqUnit: 0.026666667,    count: 1, sortOrder: 1,  notes: "SNL 4.12 [ALL]" },
  { oldItemId: 21,   equipmentName: "Front end loader 1 cum capacity",                             qtyPerBoqUnit: 0.026666667,    count: 1, sortOrder: 2,  notes: "SNL 4.12 [ALL]" },
  { oldItemId: 21,   equipmentName: "Paver finisher",                                              qtyPerBoqUnit: 0.026666667,    count: 1, sortOrder: 3,  notes: "SNL 4.12 [ALL]" },
  { oldItemId: 21,   equipmentName: "Vibratory roller 8 - 10 tonne",                              qtyPerBoqUnit: 0.026666667,    count: 1, sortOrder: 4,  notes: "SNL 4.12 [ALL]" },
  { oldItemId: 21,   equipmentName: "Smooth 3 wheeled steel roller @ 8-10 tonnes.",                qtyPerBoqUnit: 0.053333335,    count: 1, sortOrder: 5,  notes: "SNL 4.12 [ALL]" },
  { oldItemId: 21,   equipmentName: "Water tanker 6 KL capacity",                                  qtyPerBoqUnit: 0.013333334,    count: 1, sortOrder: 6,  notes: "SNL 4.12 [ALL]" },
  { oldItemId: 21,   equipmentName: "Tipper",                                                      qtyPerBoqUnit: 2.2,            count: 1, sortOrder: 7,  notes: "SNL 4.12 [ALL]" },
];

// Labour: { oldItemId, designation, qtyPerBoqUnit, count, sortOrder, notes }
const SRC_LABOUR = [
  { oldItemId: 13,   designation: "Mate",             qtyPerBoqUnit: 0.00002,        count: 1, sortOrder: 1, notes: "SNL 2.01 [MEDIUM]" },
  { oldItemId: 13,   designation: "Mazdoor",          qtyPerBoqUnit: 0.0008,         count: 1, sortOrder: 2, notes: "SNL 2.01 [MEDIUM]" },
  { oldItemId: 1147, designation: "Mate",             qtyPerBoqUnit: 0.00005,        count: 1, sortOrder: 1, notes: "SNL 2.05 [MEDIUM]" },
  { oldItemId: 1147, designation: "Mazdoor Skilled",  qtyPerBoqUnit: 0.0005,         count: 1, sortOrder: 2, notes: "SNL 2.05 [MEDIUM]" },
  { oldItemId: 1147, designation: "Mazdoor",          qtyPerBoqUnit: 0.0015,         count: 1, sortOrder: 3, notes: "SNL 2.05 [MEDIUM]" },
  { oldItemId: 1148, designation: "Mate",             qtyPerBoqUnit: 0.00008888889,  count: 1, sortOrder: 1, notes: "SNL 3.01 [MEDIUM]" },
  { oldItemId: 1148, designation: "Mazdoor",          qtyPerBoqUnit: 0.0044444446,   count: 1, sortOrder: 2, notes: "SNL 3.01 [MEDIUM]" },
  { oldItemId: 1149, designation: "Mate",             qtyPerBoqUnit: 0.0002,         count: 1, sortOrder: 0, notes: "SNL 3.17 [MEDIUM]" },
  { oldItemId: 1149, designation: "Mazdoor",          qtyPerBoqUnit: 0.005,          count: 1, sortOrder: 1, notes: "SNL 3.17 [MEDIUM]" },
  { oldItemId: 1150, designation: "Mate",             qtyPerBoqUnit: 0.0004,         count: 1, sortOrder: 0, notes: "SNL 3.16 [MEDIUM]" },
  { oldItemId: 1150, designation: "Mazdoor",          qtyPerBoqUnit: 0.01,           count: 1, sortOrder: 1, notes: "SNL 3.16 [MEDIUM]" },
  { oldItemId: 1151, designation: "Mate",             qtyPerBoqUnit: 0.0004,         count: 1, sortOrder: 0, notes: "SNL 3.18 [MEDIUM]" },
  { oldItemId: 1151, designation: "Mazdoor",          qtyPerBoqUnit: 0.01,           count: 1, sortOrder: 1, notes: "SNL 3.18 [MEDIUM]" },
  { oldItemId: 1152, designation: "Mate",             qtyPerBoqUnit: 0.0004,         count: 1, sortOrder: 0, notes: "SNL 3.18 [MEDIUM]" },
  { oldItemId: 1152, designation: "Mazdoor",          qtyPerBoqUnit: 0.01,           count: 1, sortOrder: 1, notes: "SNL 3.18 [MEDIUM]" },
  { oldItemId: 1153, designation: "Mate",             qtyPerBoqUnit: 0.00015,        count: 1, sortOrder: 1, notes: "SNL 4.01A [MEDIUM]" },
  { oldItemId: 1153, designation: "Mazdoor Skilled",  qtyPerBoqUnit: 0.0025,         count: 1, sortOrder: 2, notes: "SNL 4.01A [MEDIUM]" },
  { oldItemId: 1153, designation: "Mazdoor",          qtyPerBoqUnit: 0.0025,         count: 1, sortOrder: 3, notes: "SNL 4.01A [MEDIUM]" },
  { oldItemId: 1155, designation: "Mate",             qtyPerBoqUnit: 0.00002,        count: 1, sortOrder: 1, notes: "SNL 5.01 [MEDIUM]" },
  { oldItemId: 1155, designation: "Mazdoor Skilled",  qtyPerBoqUnit: 0.0001,         count: 1, sortOrder: 2, notes: "SNL 5.01 [MEDIUM]" },
  { oldItemId: 1155, designation: "Mazdoor",          qtyPerBoqUnit: 0.0002,         count: 1, sortOrder: 3, notes: "SNL 5.01 [MEDIUM]" },
  { oldItemId: 1156, designation: "Mate",             qtyPerBoqUnit: 0.0000066666666, count: 1, sortOrder: 1, notes: "SNL 5.02 [MEDIUM]" },
  { oldItemId: 1156, designation: "Mazdoor",          qtyPerBoqUnit: 0.00013333333,  count: 1, sortOrder: 2, notes: "SNL 5.02 [MEDIUM]" },
  { oldItemId: 24,   designation: "Mate",             qtyPerBoqUnit: 0.0023036648,   count: 1, sortOrder: 1, notes: "SNL 5.05 [MEDIUM]" },
  { oldItemId: 24,   designation: "Mazdoor",          qtyPerBoqUnit: 0.03141361,     count: 1, sortOrder: 2, notes: "SNL 5.05 [MEDIUM]" },
  { oldItemId: 24,   designation: "Mazdoor Skilled",  qtyPerBoqUnit: 0.02617801,     count: 1, sortOrder: 3, notes: "SNL 5.05 [MEDIUM]" },
  { oldItemId: 21,   designation: "Mate",             qtyPerBoqUnit: 0.0021333334,   count: 1, sortOrder: 0, notes: "SNL 4.12 [ALL]" },
  { oldItemId: 21,   designation: "Mazdoor skilled",  qtyPerBoqUnit: 0.008888889,    count: 1, sortOrder: 1, notes: "SNL 4.12 [ALL]" },
  { oldItemId: 21,   designation: "Mazdoor",          qtyPerBoqUnit: 0.044444446,    count: 1, sortOrder: 2, notes: "SNL 4.12 [ALL]" },
];

const SRC_PROGRAM_SETTINGS = {
  workingDaysPerMonth: 25,
  workingHoursPerDay:  8,
  doubleShift:         false,
  tipperCapacityT:     30,
  avgTipperSpeedKmHr:  30,
  loadTimeMin:         20,
  unloadTimeMin:       10,
  productivityMode:    "project",
  shiftHours:          10,
  productivityOverrides: { HMP: { unit: "T", outputPerHr: 110 }, RMC: { unit: "CUM", outputPerHr: 15 }, WMM: { unit: "CUM", outputPerHr: 32 } },
  projectStartDate:    "2026-07-01",
  hmpToSiteKm:         15,
  wmmPlantToSiteKm:    15,
  quarryToSiteKm:      15,
  quarryToHmpKm:       12,
  borrowToSiteKm:      5,
  disposalDistanceKm:  2,
  sequenceOptions:     { fronts: 2, lagMonths: 0.25, bridgeGroups: null, staggerMonths: 1, structureGroups: null, enableStructureFronts: false },
};

// ─── Migration runner ────────────────────────────────────────────────────────

export async function seedBoqProjectIfNeeded(): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    console.log("[seed-boq] Skipped (not production)");
    return;
  }

  const client = await pool.connect();
  try {
    // Fast-exit optimisation (un-locked) — avoids acquiring a connection for the common case
    const { rows: fastCheck } = await client.query<{ cnt: number }>(
      "SELECT COUNT(*)::int AS cnt FROM boq_projects"
    );
    if (fastCheck[0].cnt > 0) {
      console.log(`[seed-boq] ${fastCheck[0].cnt} project(s) already present — skipping`);
      return;
    }

    // Find site TAKKADPALLY-SIRUR (read before entering the lock — read-only, safe)
    const { rows: siteRows } = await client.query<{ id: number }>(
      "SELECT id FROM sites WHERE name ILIKE $1 LIMIT 1",
      ["%takkad%"]
    );
    if (!siteRows.length) {
      console.error("[seed-boq] TAKKADPALLY-SIRUR site not found — aborting");
      return;
    }
    const siteId = siteRows[0].id;

    await client.query("BEGIN");

    // ── Race-condition guard ──────────────────────────────────────────────────
    // pg_advisory_xact_lock is transaction-scoped: it blocks any second instance
    // that starts simultaneously until this transaction commits or rolls back.
    // After the first instance commits, the second acquires the lock, re-checks
    // the count (now > 0), and exits cleanly.  The lock is released automatically
    // on COMMIT/ROLLBACK — no manual cleanup needed even with connection pooling.
    await client.query("SELECT pg_advisory_xact_lock(20260719)");

    // Definitive count check — inside the lock, guaranteed atomic
    const { rows: countInTx } = await client.query<{ cnt: number }>(
      "SELECT COUNT(*)::int AS cnt FROM boq_projects"
    );
    if (countInTx[0].cnt > 0) {
      await client.query("ROLLBACK");
      console.log(`[seed-boq] ${countInTx[0].cnt} project(s) present inside lock — another instance already migrated, skipping`);
      return;
    }

    console.log(`[seed-boq] Site id=${siteId} found, lock acquired — beginning migration...`);

    // ── 1. boq_projects ───────────────────────────────────────────────────
    const { rows: [{ id: projectId }] } = await client.query<{ id: number }>(`
      INSERT INTO boq_projects (
        site_id, name, contract_no, client, contractor,
        road_length_km, start_date, total_months, status, created_by,
        working_days_per_month, working_hours_per_day,
        hmp_chainage_km, wmm_plant_chainage_km, quarry_chainage_km,
        avg_tipper_speed_km_hr, chainage_from, chainage_to
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
      ) RETURNING id`,
      [
        siteId, "Takkadpally-sirur", "LS AB. No. 66/2024-25, Dt:21-01-2025.",
        "ROADS & BUILDINGS DEPARTMENT", "high lane constructions",
        3.8, "2026-07-01", 6, "active", "Sunil Kumar",
        26, 8, 0, 0, 12, 30, 0, 3.8,
      ]
    );
    console.log(`[seed-boq] boq_projects id=${projectId}`);

    // ── 2. boq_items ──────────────────────────────────────────────────────
    const itemMap = new Map<number, number>(); // oldId → newId
    for (const item of SRC_ITEMS) {
      const { rows: [{ id: newId }] } = await client.query<{ id: number }>(`
        INSERT INTO boq_items (
          boq_project_id, item_code, description, unit,
          boq_qty, current_qty, client_rate, client_amount,
          sort_order, work_category, layer_config,
          mapping_status, item_name, dpr_conversion_factor,
          included_in_planning, planning_work_type, is_composite,
          display_name, include_in_dpr, include_in_procurement,
          needs_review, canonical_unit
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
        ) RETURNING id`,
        [
          projectId, item.itemCode, item.description, item.unit,
          item.boqQty, item.currentQty, item.clientRate, item.clientAmount,
          item.sortOrder, item.workCategory,
          item.layerConfig != null ? JSON.stringify(item.layerConfig) : null,
          item.mappingStatus, item.itemName, item.dprConversionFactor,
          item.includedInPlanning, item.planningWorkType, item.isComposite,
          item.displayName, item.includeInDpr, item.includeInProcurement,
          item.needsReview, item.canonicalUnit,
        ]
      );
      itemMap.set(item.oldId, newId);
    }
    console.log(`[seed-boq] boq_items inserted: ${itemMap.size}`);

    // ── 3. work_program_bars ──────────────────────────────────────────────
    let barsInserted = 0;
    for (const bar of SRC_BARS) {
      const newItemId = itemMap.get(bar.oldItemId);
      if (!newItemId) { console.warn(`[seed-boq] No item mapping for bar oldItemId=${bar.oldItemId}`); continue; }
      await client.query(`
        INSERT INTO work_program_bars (
          boq_project_id, boq_item_id, reach_label,
          chainage_from, chainage_to, start_month, end_month,
          planned_qty, is_qty_override, duration_mode, source, scheduled
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          projectId, newItemId, bar.reachLabel,
          bar.chainageFrom, bar.chainageTo, bar.startMonth, bar.endMonth,
          bar.plannedQty, true, "auto", "auto-sequence", true,
        ]
      );
      barsInserted++;
    }
    console.log(`[seed-boq] work_program_bars inserted: ${barsInserted}`);

    // ── 4. snl_boq_mappings ───────────────────────────────────────────────
    let snlInserted = 0;
    for (const m of SRC_SNL) {
      const newItemId = itemMap.get(m.oldItemId);
      if (!newItemId) continue;

      // Try by original snl_item_id first
      let snlItemId: number | null = null;
      const { rows: byId } = await client.query<{ id: number }>(
        "SELECT id FROM snl_items WHERE id = $1 LIMIT 1", [m.snlItemId]
      );
      if (byId.length) {
        snlItemId = byId[0].id;
      }

      if (!snlItemId) {
        console.warn(`[seed-boq] SNL item id=${m.snlItemId} not found in production — skipping mapping for oldItemId=${m.oldItemId}`);
        continue;
      }

      try {
        await client.query(`
          INSERT INTO snl_boq_mappings (
            boq_item_id, snl_item_id, project_category,
            is_auto_mapped, confidence_score, notes, mapped_by
          ) VALUES ($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT (boq_item_id) DO NOTHING`,
          [
            newItemId, snlItemId, m.projectCategory,
            m.isAutoMapped, m.confidenceScore, m.notes,
            m.isAutoMapped ? "rule" : "unknown",
          ]
        );
        snlInserted++;
      } catch (e: any) {
        console.warn(`[seed-boq] SNL mapping insert failed for oldItemId=${m.oldItemId}: ${e.message}`);
      }
    }
    console.log(`[seed-boq] snl_boq_mappings inserted: ${snlInserted}`);

    // ── 5. boq_item_materials ─────────────────────────────────────────────
    let matsInserted = 0;
    for (const mat of SRC_MATERIALS) {
      const newItemId = itemMap.get(mat.oldItemId);
      if (!newItemId) continue;
      await client.query(`
        INSERT INTO boq_item_materials (
          boq_item_id, material_name, uom,
          qty_per_boq_unit, wastage_pct, is_client_supplied,
          sort_order, is_auto, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          newItemId, mat.materialName, mat.uom,
          mat.qtyPerBoqUnit, mat.wastePct, mat.isClientSupplied,
          mat.sortOrder, mat.isAuto, mat.notes,
        ]
      );
      matsInserted++;
    }
    console.log(`[seed-boq] boq_item_materials inserted: ${matsInserted}`);

    // ── 6. boq_item_equipment ─────────────────────────────────────────────
    // planning_equipment_type_id set to NULL (IDs differ between environments)
    let eqInserted = 0;
    for (const eq of SRC_EQUIPMENT) {
      const newItemId = itemMap.get(eq.oldItemId);
      if (!newItemId) continue;
      await client.query(`
        INSERT INTO boq_item_equipment (
          boq_item_id, equipment_name, qty_per_boq_unit,
          count, sort_order, notes
        ) VALUES ($1,$2,$3,$4,$5,$6)`,
        [newItemId, eq.equipmentName, eq.qtyPerBoqUnit, eq.count, eq.sortOrder, eq.notes]
      );
      eqInserted++;
    }
    console.log(`[seed-boq] boq_item_equipment inserted: ${eqInserted}`);

    // ── 7. boq_item_labour ────────────────────────────────────────────────
    let labInserted = 0;
    for (const lab of SRC_LABOUR) {
      const newItemId = itemMap.get(lab.oldItemId);
      if (!newItemId) continue;
      await client.query(`
        INSERT INTO boq_item_labour (
          boq_item_id, designation, qty_per_boq_unit,
          count, sort_order, notes
        ) VALUES ($1,$2,$3,$4,$5,$6)`,
        [newItemId, lab.designation, lab.qtyPerBoqUnit, lab.count, lab.sortOrder, lab.notes]
      );
      labInserted++;
    }
    console.log(`[seed-boq] boq_item_labour inserted: ${labInserted}`);

    // ── 8. boq_program_settings ───────────────────────────────────────────
    const ps = SRC_PROGRAM_SETTINGS;
    await client.query(`
      INSERT INTO boq_program_settings (
        project_id, working_days_per_month, working_hours_per_day,
        double_shift, tipper_capacity_t, avg_tipper_speed_km_hr,
        load_time_min, unload_time_min, productivity_mode, shift_hours,
        productivity_overrides, project_start_date,
        hmp_to_site_km, wmm_plant_to_site_km, quarry_to_site_km,
        quarry_to_hmp_km, borrow_to_site_km, disposal_distance_km,
        sequence_options
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
      ) ON CONFLICT (project_id) DO NOTHING`,
      [
        projectId, ps.workingDaysPerMonth, ps.workingHoursPerDay,
        ps.doubleShift, ps.tipperCapacityT, ps.avgTipperSpeedKmHr,
        ps.loadTimeMin, ps.unloadTimeMin, ps.productivityMode, ps.shiftHours,
        JSON.stringify(ps.productivityOverrides), ps.projectStartDate,
        ps.hmpToSiteKm, ps.wmmPlantToSiteKm, ps.quarryToSiteKm,
        ps.quarryToHmpKm, ps.borrowToSiteKm, ps.disposalDistanceKm,
        JSON.stringify(ps.sequenceOptions),
      ]
    );
    console.log("[seed-boq] boq_program_settings inserted");

    // ── 9. boq_mix_template_links ─────────────────────────────────────────
    const { rows: mtRows } = await client.query<{ id: number }>(
      "SELECT id FROM mix_templates WHERE name ILIKE $1 LIMIT 1",
      ["%bituminous%concrete%"]
    );
    const mixTemplateId = mtRows.length ? mtRows[0].id : null;
    await client.query(`
      INSERT INTO boq_mix_template_links (
        boq_project_id, mix_type, mix_template_id, mix_template_name
      ) VALUES ($1,$2,$3,$4)
      ON CONFLICT (boq_project_id, mix_type) DO NOTHING`,
      [projectId, "BC", mixTemplateId, "HIGH LANE CONSTRUCTIONS"]
    );
    console.log(`[seed-boq] boq_mix_template_links inserted (mix_template_id=${mixTemplateId})`);

    await client.query("COMMIT");
    console.log(`[seed-boq] ✓ Migration complete. project_id=${projectId}, items=${itemMap.size}, bars=${barsInserted}, snl=${snlInserted}, mats=${matsInserted}, equip=${eqInserted}, labour=${labInserted}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[seed-boq] Migration FAILED — rolled back:", err);
  } finally {
    client.release();
  }
}
