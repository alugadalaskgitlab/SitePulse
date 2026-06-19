// MoRTH 5th Revision standard equipment outputs and MoRTH/IRC labour designations.
// Pure data — no DB imports. Safe to import from both server and tests.

export interface MorthEquipmentSeed {
  name: string;
  category: string;
  sortOrder: number;
  standardOutputs: Array<{ unit: string; outputPerHr: number }>;
}

export interface MorthLabourSeed {
  designation: string;
  skillTier: string;
  sortOrder: number;
  standardOutputs?: Array<{ unit: string; outputPerDay: number }>;
}

export const MORTH_EQUIPMENT_SEED: MorthEquipmentSeed[] = [
  // ── Earthwork ──────────────────────────────────────────────────────────
  {
    name: "Hydraulic Excavator (0.9 CUM)",
    category: "Earthwork",
    sortOrder: 10,
    standardOutputs: [{ unit: "CUM", outputPerHr: 60 }],
  },
  {
    name: "Tractor Dozer (D6)",
    category: "Earthwork",
    sortOrder: 20,
    standardOutputs: [{ unit: "CUM", outputPerHr: 80 }],
  },
  {
    name: "Motor Grader (180 HP)",
    category: "Earthwork",
    sortOrder: 30,
    standardOutputs: [
      { unit: "SQM", outputPerHr: 2000 },
      { unit: "CUM", outputPerHr: 150 },
    ],
  },
  {
    name: "Water Tanker (6000 L)",
    category: "Earthwork",
    sortOrder: 40,
    standardOutputs: [{ unit: "CUM", outputPerHr: 30 }],
  },
  // ── Compaction ────────────────────────────────────────────────────────
  {
    name: "Vibratory Roller (10T)",
    category: "Compaction",
    sortOrder: 50,
    standardOutputs: [{ unit: "SQM", outputPerHr: 700 }],
  },
  {
    name: "Pneumatic Tyre Roller",
    category: "Compaction",
    sortOrder: 60,
    standardOutputs: [{ unit: "SQM", outputPerHr: 500 }],
  },
  {
    name: "Sheep Foot / Pad Foot Roller",
    category: "Compaction",
    sortOrder: 70,
    standardOutputs: [{ unit: "CUM", outputPerHr: 400 }],
  },
  // ── Granular ──────────────────────────────────────────────────────────
  {
    name: "WMM Plant (100 T/hr)",
    category: "Granular",
    sortOrder: 80,
    standardOutputs: [{ unit: "MT", outputPerHr: 100 }],
  },
  {
    name: "Pulvi-mixer (tractor-mounted)",
    category: "Granular",
    sortOrder: 90,
    standardOutputs: [{ unit: "SQM", outputPerHr: 600 }],
  },
  // ── Bituminous ────────────────────────────────────────────────────────
  {
    name: "Hot Mix Plant (120 T/hr)",
    category: "Bituminous",
    sortOrder: 100,
    standardOutputs: [{ unit: "MT", outputPerHr: 120 }],
  },
  {
    name: "Paver Finisher (sensor)",
    category: "Bituminous",
    sortOrder: 110,
    standardOutputs: [
      { unit: "SQM", outputPerHr: 800 },
      { unit: "MT", outputPerHr: 75 },
    ],
  },
  {
    name: "Bitumen Pressure Distributor",
    category: "Bituminous",
    sortOrder: 120,
    standardOutputs: [{ unit: "SQM", outputPerHr: 3000 }],
  },
  {
    name: "Chip Spreader",
    category: "Bituminous",
    sortOrder: 130,
    standardOutputs: [{ unit: "SQM", outputPerHr: 1000 }],
  },
  // ── Concrete ──────────────────────────────────────────────────────────
  {
    name: "Concrete Paver (slip-form)",
    category: "Concrete",
    sortOrder: 140,
    standardOutputs: [{ unit: "CUM", outputPerHr: 15 }],
  },
  {
    name: "Transit Mixer (6 CUM)",
    category: "Concrete",
    sortOrder: 150,
    standardOutputs: [{ unit: "CUM", outputPerHr: 6 }],
  },
  {
    name: "Concrete Pump",
    category: "Concrete",
    sortOrder: 160,
    standardOutputs: [{ unit: "CUM", outputPerHr: 30 }],
  },
  // ── Miscellaneous ────────────────────────────────────────────────────
  {
    name: "Survey Equipment (total station)",
    category: "Miscellaneous",
    sortOrder: 170,
    standardOutputs: [{ unit: "RM", outputPerHr: 250 }],
  },
  {
    name: "Crane (50T mobile)",
    category: "Miscellaneous",
    sortOrder: 180,
    standardOutputs: [{ unit: "CUM", outputPerHr: 8 }],
  },
];

export const MORTH_LABOUR_SEED: MorthLabourSeed[] = [
  { designation: "Equipment Operator", skillTier: "Skilled", sortOrder: 10 },
  { designation: "Equipment Helper / Cleaner", skillTier: "Semi-skilled", sortOrder: 20 },
  { designation: "Driver (Tipper / Tanker)", skillTier: "Skilled", sortOrder: 30 },
  { designation: "Paving Gang Supervisor", skillTier: "Supervisory", sortOrder: 40 },
  { designation: "Mason (Form-work / Concrete)", skillTier: "Skilled", sortOrder: 50, standardOutputs: [{ unit: "CUM", outputPerDay: 2.5 }] },
  { designation: "Carpenter (Form-work)", skillTier: "Skilled", sortOrder: 60, standardOutputs: [{ unit: "SQM", outputPerDay: 20 }] },
  { designation: "Steel Fixer (Rebar)", skillTier: "Skilled", sortOrder: 70, standardOutputs: [{ unit: "MT", outputPerDay: 0.5 }] },
  { designation: "Bituminous Laying Labour", skillTier: "Semi-skilled", sortOrder: 80, standardOutputs: [{ unit: "SQM", outputPerDay: 120 }] },
  { designation: "Earthwork Labour (Manual)", skillTier: "Unskilled", sortOrder: 90, standardOutputs: [{ unit: "CUM", outputPerDay: 2 }] },
  { designation: "Surveyor", skillTier: "Skilled", sortOrder: 100 },
  { designation: "Site Engineer", skillTier: "Supervisory", sortOrder: 110 },
  { designation: "General Helper / Coolie", skillTier: "Unskilled", sortOrder: 120 },
];
