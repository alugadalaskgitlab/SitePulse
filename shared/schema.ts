import { pgTable, text, serial, real, integer, timestamp, date, boolean, index, jsonb, uniqueIndex, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations, sql } from "drizzle-orm";

// === TABLE DEFINITIONS ===

// Owner/Admin transaction controls & audit trail (spec: cancel/void without
// hard-deleting submitted/approved/stock-affecting records). Spread into any
// transaction table that needs Delete-vs-Cancel semantics.
const cancellationFields = {
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
  deletedBy: integer("deleted_by"),
  isCancelled: boolean("is_cancelled").notNull().default(false),
  cancelledAt: timestamp("cancelled_at"),
  cancelledBy: integer("cancelled_by"),
  cancellationReason: text("cancellation_reason"),
};

// Draft / Pending Document / Final Submit workflow (spec: allow saving a
// transaction before supporting documents/photos are available, then lock
// normal-user edits once Final Submit is clicked). "Pending Document" is a
// derived UI state (documentStatus === 'draft' AND required docs missing),
// not a stored value, to avoid a second source of truth. Owner/Admin always
// bypass the edit lock (see assertEdit/isOwner) regardless of documentStatus.
// Default 'submitted' so pre-existing historical rows are unaffected.
const documentWorkflowFields = {
  documentStatus: text("document_status").notNull().default("submitted"), // "draft" | "submitted"
  finalSubmittedAt: timestamp("final_submitted_at"),
  finalSubmittedBy: integer("final_submitted_by"),
};

// Generic cross-module audit trail. Every create/edit/delete/cancel/approve
// action on a transaction should write one row here (see server/storage.ts
// logAudit()). Deliberately module-agnostic (module + transactionId) instead
// of one audit table per module, so History UI can be a single reusable
// component across the whole app.
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  module: text("module").notNull(), // e.g. "dpr", "material_receipt", "site_purchase"
  transactionId: integer("transaction_id").notNull(),
  action: text("action").notNull(), // "create" | "edit" | "delete" | "cancel" | "approve" | "reopen"
  userId: integer("user_id"),
  userName: text("user_name").notNull(),
  userRole: text("user_role"), // "owner" | "admin" | "manager" | "engineer" etc, snapshot at time of action
  oldValues: jsonb("old_values"),
  newValues: jsonb("new_values"),
  reason: text("reason"),
  stockImpact: text("stock_impact"), // free-text note on stock/ledger effect, if any
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  moduleTxnIdx: index("audit_logs_module_txn_idx").on(table.module, table.transactionId),
}));

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

// Main DPR Header
export const dprs = pgTable("dprs", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  site: text("site").notNull(),
  engineer: text("engineer").notNull(),
  role: text("role").default("engineer"), // "engineer", "manager", or "admin"
  submittedAt: text("submitted_at"), // Timestamp when report was submitted (local time format)
  createdAt: timestamp("created_at").defaultNow(),
  isSuperseded: boolean("is_superseded").default(false),
  // Per-user record locking (Task #229). Newly saved DPRs auto-lock; users
  // with site_dprs.edit + can_unlock_records can unlock with reason. Next
  // save atomically re-locks the record.
  authorUserId: integer("author_user_id"),
  lockStatus: text("lock_status").notNull().default("locked"), // "locked" | "unlocked"
  unlockedByUserId: integer("unlocked_by_user_id"),
  unlockedAt: timestamp("unlocked_at"),
  unlockReason: text("unlock_reason"),
  workType: text("work_type").default("road").notNull(),
  // Explicit link to the BOQ project this DPR reports against.
  // Prevents orphaned progress entries when a site has multiple BOQ projects.
  boqProjectId: integer("boq_project_id"),
  // Free-text remarks captured from the mobile guided DPR flow (Phase 1 UX facelift).
  remarks: text("remarks"),
  // Draft / submitted status. Drafts are saved without triggering approval flows
  // or notifications. Existing rows default to "submitted" for backward compatibility.
  dprStatus: text("dpr_status").notNull().default("submitted"), // "draft" | "submitted"
  ...cancellationFields,
}, (table) => ({
  dateIdx: index("dprs_date_idx").on(table.date),
}));

// Activity Progress
export const progressEntries = pgTable("progress_entries", {
  id: serial("id").primaryKey(),
  dprId: integer("dpr_id").notNull(),
  activity: text("activity").notNull(), // Scarifying, BC laying, etc.
  chainageFrom: text("chainage_from"),
  chainageTo: text("chainage_to"),
  side: text("side"), // LHS, RHS, etc.
  length: real("length"),
  width: real("width"),
  thickness: real("thickness"),
  quantity: real("quantity"),
  uom: text("uom"),
  noSiteWork: boolean("no_site_work").default(false),
  noSiteWorkDescription: text("no_site_work_description"),
  // Optional link to a BOQ item for Plan vs Actual tracking
  boqItemId: integer("boq_item_id"),
});

// Structure DPR Items (for workType = "structure")
export const dprStructureItems = pgTable("dpr_structure_items", {
  id: serial("id").primaryKey(),
  dprId: integer("dpr_id").notNull(),
  structureType: text("structure_type").notNull(),
  structureSubType: text("structure_sub_type"),
  structureName: text("structure_name"),
  stage: text("stage"),
  itemOfWork: text("item_of_work").notNull(),
  quantity: real("quantity"),
  uom: text("uom"),
  remarks: text("remarks"),
  // Plan vs Actual link: the BOQ line this structure item reports against.
  boqItemId: integer("boq_item_id"),
  dprConversionFactor: real("dpr_conversion_factor"),
  // Phase 2 programme linkage: the imported Structure Schedule location
  // (work_program_bars.structureId) this row was entered against, if any.
  structureId: text("structure_id"),
});

// Equipment Log
export const equipmentLogs = pgTable("equipment_logs", {
  id: serial("id").primaryKey(),
  dprId: integer("dpr_id").notNull(),
  machine: text("machine").notNull(),
  operator: text("operator"),
  vehicleNo: text("vehicle_no"), // Vehicle registration number
  entryType: text("entry_type").default("time_meter"), // time_meter, hourly, daily, trip_based, monthly
  startTime: text("start_time"),
  endTime: text("end_time"),
  // Hour meter fields (optional - user can choose time OR meter OR both)
  openingReading: real("opening_reading"),
  closingReading: real("closing_reading"),
  hoursWorked: real("hours_worked"), // Auto-calculated from time or meter
  // Trip-based tracking
  numberOfTrips: integer("number_of_trips"),
  tripDistance: real("trip_distance"), // One-way distance in km
  totalKm: real("total_km"), // Auto-calculated: trips × distance × 2
  diesel: real("diesel"),
  dieselNorm: real("diesel_norm"), // L/hr norm for efficiency calculation
  expectedDiesel: real("expected_diesel"), // Auto-calculated: hoursWorked * norm
  task: text("task"), // e.g., "Rolling WMM", "Watering shoulders"
  // Optional link to equipment master for unified reporting
  equipmentId: integer("equipment_id"), // Links to equipmentMaster for unified tracking
  // Diesel source tracking
  dieselSource: text("diesel_source").default("plant_stock"), // plant_stock, direct_purchase, contractor
  // Direct purchase fields (when dieselSource = direct_purchase)
  fuelStation: text("fuel_station"), // Commercial pump name/location
  billNumber: text("bill_number"), // Receipt/bill number
  amountPaid: real("amount_paid"), // Total amount paid for diesel
  // Water tanker tracking
  waterQuantity: real("water_quantity"), // Water delivered in liters
  // Phase 3 Plan vs Actual linkage: optional link to the BOQ item / imported
  // structure location this usage is charged against, for planned vs actual
  // comparison. Nullable — most equipment rows remain unlinked.
  boqItemId: integer("boq_item_id"),
  structureId: text("structure_id"),
  // Batch 6: link back to the equipment_usage row this DPR entry closed
  plantUsageId: integer("plant_usage_id"),
});

// Labour Log
export const labourLogs = pgTable("labour_logs", {
  id: serial("id").primaryKey(),
  dprId: integer("dpr_id").notNull(),
  category: text("category").notNull(), // Skilled, Unskilled
  gender: text("gender"), // Male, Female
  count: integer("count").notNull(),
  task: text("task"), // Task/work performed by the labour
  contractor: text("contractor"), // Labour contractor/gang name
  // Phase 3 Plan vs Actual linkage: optional link to the BOQ item / imported
  // structure location this deployment is charged against, for planned vs
  // actual comparison. Nullable — most labour rows remain unlinked.
  boqItemId: integer("boq_item_id"),
  structureId: text("structure_id"),
});

// Materials Log
export const materialLogs = pgTable("material_logs", {
  id: serial("id").primaryKey(),
  dprId: integer("dpr_id").notNull(),
  type: text("type").notNull(), // Received, Issued
  material: text("material").notNull(),
  supplier: text("supplier"), // Supplier name for received materials
  quantity: real("quantity"),
  uom: text("uom"),
  vehicleNumber: text("vehicle_number"),
  location: text("location"), // Location/task of unloading
  receiptNumber: text("receipt_number"), // Receipt number for received materials
  // Phase 3 Plan vs Actual linkage: optional link to the BOQ item / imported
  // structure location this consumption is charged against, for planned vs
  // actual comparison. Nullable — most material rows remain unlinked.
  boqItemId: integer("boq_item_id"),
  structureId: text("structure_id"),
});

// Site Purchases (direct purchases at site - diesel for cleaning, small items, etc.)
export const sitePurchases = pgTable("site_purchases", {
  id: serial("id").primaryKey(),
  dprId: integer("dpr_id").notNull(),
  itemDescription: text("item_description").notNull(),
  quantity: real("quantity"),
  uom: text("uom"),
  vendor: text("vendor"),
  billNo: text("bill_no"),
  amount: real("amount"),
  ...cancellationFields,
  ...documentWorkflowFields,
});

// DPR Version History (for manager edits as copies)
export const dprVersions = pgTable("dpr_versions", {
  id: serial("id").primaryKey(),
  originalDprId: integer("original_dpr_id").notNull(),
  dprId: integer("dpr_id").notNull(), // ID of the copied DPR
  editedBy: text("edited_by").notNull(), // "manager" or "admin"
  createdAt: timestamp("created_at").defaultNow(),
});

// Plant Module - Plant Reports
export const plantReports = pgTable("plant_reports", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  siteName: text("site_name").notNull(),
  role: text("role").default("engineer"), // "engineer", "manager", or "admin"
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  dateIdx: index("plant_reports_date_idx").on(table.date),
}));

// Plant Production Log
export const plantProduction = pgTable("plant_production", {
  id: serial("id").primaryKey(),
  plantReportId: integer("plant_report_id").notNull(),
  material: text("material").notNull(),
  quantity: real("quantity"),
  uom: text("uom"),
  supplier: text("supplier"), // Supplier name
});

// Plant Version History (for manager edits as copies)
export const plantVersions = pgTable("plant_versions", {
  id: serial("id").primaryKey(),
  originalPlantId: integer("original_plant_id").notNull(),
  plantId: integer("plant_id").notNull(), // ID of the copied Plant Report
  editedBy: text("edited_by").notNull(), // "manager" or "admin"
  createdAt: timestamp("created_at").defaultNow(),
});

// App Settings (for storing configurable values like Admin PIN)
export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Task #253 — Per-plant tank calibration. Used to derive bitumen stock in MT
// from the operator's dip readings (cm) on the Plant Shift Log. The dip is
// the single source of truth; derived MT is read-only. Density default is
// applied at compute time (DEFAULT_BITUMEN_DENSITY_KG_PER_L = 1.01) when the
// admin has not set bitumenDensityKgPerL.
export const plantSettings = pgTable("plant_settings", {
  id: serial("id").primaryKey(),
  plantName: text("plant_name").notNull(),
  plantType: text("plant_type").default("hma"), // "hma" | "rmc"
  siteId: integer("site_id").references(() => sites.id), // nullable FK; null = shared/mobile plant
  primaryPartyId: integer("primary_party_id"), // optional default party for dispatches (no FK constraint for flexibility)
  bitumenTank1LitresPerCm: real("bitumen_tank1_litres_per_cm"),
  bitumenTank2LitresPerCm: real("bitumen_tank2_litres_per_cm"),
  bitumenDensityKgPerL: real("bitumen_density_kg_per_l"),
  tankConfig: text("tank_config"), // JSON: PlantTankConfig (see shared/tank-calibration.ts)
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  plantNameUq: uniqueIndex("plant_settings_plant_name_uq").on(table.plantName),
}));

export const insertPlantSettingsSchema = createInsertSchema(plantSettings).omit({ id: true, updatedAt: true });
export type PlantSettings = typeof plantSettings.$inferSelect;
export type PlantSettingsWithSite = PlantSettings & { siteName: string | null };
export type InsertPlantSettings = z.infer<typeof insertPlantSettingsSchema>;

// ============================================
// PLANT MODULE PHASE-1 - MASTERS
// ============================================

// Party/Job Master
export const parties = pgTable("parties", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  notes: text("notes"),
  isActive: integer("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

// Material Master (dynamic materials with UOM)
export const plantMaterials = pgTable("plant_materials", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category"), // Aggregate, Bitumen, Utility, etc.
  allowedUoms: text("allowed_uoms"), // JSON array: ["Ton", "Cum", "Liters", etc.]
  defaultUom: text("default_uom"),
  conversionFactor: real("conversion_factor"), // Auto-derived from bulkDensity; do not set manually
  conversionFromUom: text("conversion_from_uom"), // Volume UOM used at receipt (e.g., "CFT", "Cum")
  conversionToUom: text("conversion_to_uom"), // Always "Ton" when bulkDensity is set
  bulkDensity: real("bulk_density"), // MT/m³ (T/Cum); user-entered; drives conversionFactor
  isActive: integer("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  procurementRoute: text("procurement_route").default("stores"), // 'stores' | 'bulk_plant'
});

// Material Opening Stocks (per material, per party/stock owner)
export const materialOpeningStocks = pgTable("material_opening_stocks", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id").notNull(),
  partyId: integer("party_id"), // NULL for PLANT COMMON
  isPlantCommon: integer("is_plant_common").default(0),
  quantity: real("quantity").notNull(),
  uom: text("uom").notNull(),
  date: date("date").notNull(), // Date of opening stock entry
  tankNumber: integer("tank_number"), // For bitumen/LDO: which physical tank (1 or 2)
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Mix Types Master
export const mixTypes = pgTable("mix_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  isActive: integer("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

// Mix Template Master
export const mixTemplates = pgTable("mix_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  mixType: text("mix_type").notNull(), // BC, DBM, etc.
  bitumenPercent: real("bitumen_percent"), // Approved/theoretical bitumen %
  binderGrade: text("binder_grade"), // VG-10 / VG-30 / VG-40 / CRMB / PMB / Emulsion
  ldoNorm: real("ldo_norm").default(6), // Liters per ton (default 6 L/ton)
  densityTPerCum: real("density_t_per_cum"), // Compacted mix density (T/m³); BC/SDBC≈2.40, DBM/BM≈2.35
  isStandard: integer("is_standard").default(1), // 1 = Standard, 0 = Job-specific
  partyId: integer("party_id"), // Only for job-specific templates
  baseTemplateId: integer("base_template_id"), // For variants, reference to standard template
  notes: text("notes"),
  isActive: integer("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

// Mix Template Components (aggregate proportions - % of total mix including bitumen)
export const mixTemplateComponents = pgTable("mix_template_components", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull(),
  materialId: integer("material_id").notNull(),
  percent: real("percent"), // % of total mix (all components + bitumen = 100%)
  uom: text("uom"),
  moistureContent: real("moisture_content").default(0), // % water in as-received aggregate
  wastageFactor: real("wastage_factor").default(0),   // % lost during handling/rehandling
});

// Equipment Master
export const equipmentMaster = pgTable("equipment_master", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  registrationNumber: text("registration_number"), // Unique ID like KA05AB1234 for tippers/JCBs
  equipmentType: text("equipment_type").default("Equipment"), // Deprecated - kept for backward compatibility
  ownership: text("ownership").default("owned"), // "owned" or "hired"
  vendorName: text("vendor_name"), // Vendor/contractor name for hired equipment
  meterType: text("meter_type").notNull(), // hour_meter, odometer
  consumptionNorm: real("consumption_norm"), // Liters/hour OR liters/km
  plantName: text("plant_name"), // nullable; references plant_settings.plant_name; null = shared/unassigned
  isActive: integer("is_active").default(1),
  // Planning/productivity fields (used by Work Programme auto-duration)
  outputUnit: text("output_unit"),           // e.g. "CUM", "SQM", "MT", "RM"
  outputTheoretical: real("output_theoretical"), // raw output per hour in outputUnit
  outputEfficiency: real("output_efficiency"),   // 0–1 factor (default 0.75)
  standardOutputs: jsonb("standard_outputs"),    // [{unit: string, outputPerHr: number}] for multi-unit machines
  fuelType: text("fuel_type"),                   // "Diesel" | "Petrol" | "Electric" | "None"
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================
// PLANT MODULE PHASE-1 - TRANSACTIONS
// ============================================

// Material Receipts (party/job-wise OR plant-common)
export const materialReceipts = pgTable("material_receipts", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  time: text("time"),
  partyId: integer("party_id"), // NULL for PLANT COMMON
  isPlantCommon: integer("is_plant_common").default(0),
  materialId: integer("material_id").notNull(),
  quantity: real("quantity").notNull(),
  uom: text("uom").notNull(),
  supplier: text("supplier"),
  transporter: text("transporter"), // Who transported the material (separate from supplier)
  vehicleNumber: text("vehicle_number"),
  challanNumber: text("challan_number"),
  receiptNo: text("receipt_no"),
  invoiceNo: text("invoice_no"),
  invoiceDate: date("invoice_date"),
  indentRef: text("indent_ref"),
  tankNumber: integer("tank_number"),
  notes: text("notes"),
  plantName: text("plant_name").notNull().default("Main Plant"),
  createdAt: timestamp("created_at").defaultNow(),
  ...cancellationFields,
  ...documentWorkflowFields,
}, (table) => ({
  dateIdx: index("material_receipts_date_idx").on(table.date),
}));

// Truck/Load Dispatch Entry
export const truckDispatches = pgTable("truck_dispatches", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  time: text("time"),
  partyId: integer("party_id").notNull(),
  mixTemplateId: integer("mix_template_id").notNull(),
  truckNumber: text("truck_number").notNull(),
  loadWeight: real("load_weight").notNull(), // Tons/MT
  deliveryLocation: text("delivery_location"),
  // Theoretical consumption (auto-calculated from template)
  theoreticalBitumenQty: real("theoretical_bitumen_qty"),
  theoreticalBitumenPercent: real("theoretical_bitumen_percent"),
  theoreticalLdoQty: real("theoretical_ldo_qty"), // Liters (loadWeight * ldoNorm)
  theoreticalAggregates: text("theoretical_aggregates"), // JSON: {materialId: qty, ...}
  // Actual consumption (operator/manager override)
  actualBitumenQty: real("actual_bitumen_qty"),
  actualBitumenPercent: real("actual_bitumen_percent"),
  actualLdoQty: real("actual_ldo_qty"),
  bitumenTankNumber: integer("bitumen_tank_number"),
  ldoTankNumber: integer("ldo_tank_number"),
  // Stock deduction tracking
  stockDeducted: integer("stock_deducted").default(0), // 1=deducted, 0=pending
  deductionSource: text("deduction_source"), // "party" or "plant_common" or "mixed"
  shortageWarning: text("shortage_warning"), // JSON array of materials with shortage
  // Variance tracking for audit
  bitumenVariancePercent: real("bitumen_variance_percent"), // (actual - theoretical) / theoretical * 100
  ldoVariancePercent: real("ldo_variance_percent"),
  adjustedBy: text("adjusted_by"), // "operator" or role who made the adjustment
  adjustedAt: timestamp("adjusted_at"), // When actual was changed from theoretical
  ownerName: text("owner_name"),
  driverName: text("driver_name"),
  transportEquipmentId: integer("transport_equipment_id"), // FK to equipment_master for truck/tipper
  notes: text("notes"),
  plantName: text("plant_name").notNull().default("Main Plant"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  dateIdx: index("truck_dispatches_date_idx").on(table.date),
}));

// Equipment Usage Entry (with meter readings and diesel tank tracking)
export const equipmentUsage = pgTable("equipment_usage", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  equipmentId: integer("equipment_id").notNull(),
  entryType: text("entry_type").default("time_meter"), // time_meter, hourly, daily, trip_based, monthly, shifting
  // Hour meter fields (optional if using time entry)
  openingReading: real("opening_reading"), // Hours or KM (meter) - now optional
  closingReading: real("closing_reading"), // now optional
  // Time entry fields (optional - user can choose time OR meter OR both)
  startTime: text("start_time"),
  endTime: text("end_time"),
  hoursOrKmRun: real("hours_or_km_run"), // Auto-calculated: from meter OR time
  // Trip-based tracking (for water tankers, etc.)
  tripBasedEntry: boolean("trip_based_entry").default(false), // Flag to use trip-based calculation (backward compat)
  numberOfTrips: integer("number_of_trips"), // Number of round trips
  tripDistance: real("trip_distance"), // One-way distance to source (km)
  totalKm: real("total_km"), // Auto-calculated: trips × distance × 2
  dieselIssued: real("diesel_issued"), // Liters added to tank
  expectedDiesel: real("expected_diesel"), // Auto-calculated: hoursOrKmRun * norm (consumed)
  openingDiesel: real("opening_diesel"), // Tank level at start (from previous closing)
  closingDiesel: real("closing_diesel"), // Tank level at end = opening + issued - consumed
  variance: real("variance"), // For backwards compatibility
  dieselIncluded: boolean("diesel_included").default(false), // True when diesel is provided by contractor (hired equipment)
  remarks: text("remarks"),
  // Site/DPR context for site equipment entries
  dprId: integer("dpr_id"), // Optional link to DPR for site equipment
  siteName: text("site_name"), // Site name when used for site equipment
  operator: text("operator"), // Equipment operator name
  task: text("task"), // Task performed by equipment
  // Diesel source tracking
  dieselSource: text("diesel_source").default("plant_stock"), // plant_stock, direct_purchase, contractor
  // Direct purchase fields (when dieselSource = direct_purchase)
  fuelStation: text("fuel_station"), // Commercial pump name/location
  billNumber: text("bill_number"), // Receipt/bill number
  amountPaid: real("amount_paid"), // Total amount paid for diesel
  // Diesel balance tracking (informational, no stock adjustment)
  dieselBalanceInTank: real("diesel_balance_in_tank"), // Liters remaining in equipment tank at end of work
  dieselBalanceConfirmed: boolean("diesel_balance_confirmed").default(false), // Whether balance was physically verified
  shiftFrom: text("shift_from"), // Origin site/location for mobilization
  shiftTo: text("shift_to"), // Destination site/location for mobilization
  transportEquipmentId: integer("transport_equipment_id"), // FK to equipment_master for transport vehicle
  transportDistance: real("transport_distance"), // One-way distance in km for mobilization
  hireAmount: real("hire_amount"), // Hire charge for this entry (hourly/daily/monthly hire entries)
  plantName: text("plant_name").notNull().default("Main Plant"),
  // Set when this row is auto-created by a heating session inline-DG entry,
  // so it can be updated/deleted in lockstep without duplicating data.
  sourceHeatingSessionId: integer("source_heating_session_id"),
  createdAt: timestamp("created_at").defaultNow(),
  // Per-user record locking (Task #229).
  authorUserId: integer("author_user_id"),
  lockStatus: text("lock_status").notNull().default("locked"),
  unlockedByUserId: integer("unlocked_by_user_id"),
  unlockedAt: timestamp("unlocked_at"),
  unlockReason: text("unlock_reason"),
  // Batch 6: single shared record — audit trail & lifecycle status
  status: text("status").notNull().default("closed"), // 'open' (pending site closure) | 'closed'
  openedByUserId: integer("opened_by_user_id"),
  openedByUserName: text("opened_by_user_name"),
  openedAt: timestamp("opened_at"),
  closedByDprId: integer("closed_by_dpr_id"),
  closedByUserId: integer("closed_by_user_id"),
  closedByUserName: text("closed_by_user_name"),
  closedAt: timestamp("closed_at"),
  destinationSite: text("destination_site"), // where equipment is sent when status='open'
}, (table) => ({
  dateIdx: index("equipment_usage_date_idx").on(table.date),
  sourceHeatingSessionIdx: index("equipment_usage_source_heating_session_idx").on(table.sourceHeatingSessionId),
}));

// Generator Diesel Tracking
export const generatorLogs = pgTable("generator_logs", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  generatorName: text("generator_name").notNull(), // "600 KVA", "40-30 KVA"
  startTime: text("start_time"),
  endTime: text("end_time"),
  hoursRun: real("hours_run"), // Auto-calculated from start/end
  openingDiesel: real("opening_diesel"), // Liters in tank
  dieselIssued: real("diesel_issued"), // Liters added
  closingDiesel: real("closing_diesel"), // Liters in tank
  dieselConsumed: real("diesel_consumed"), // opening + issued - closing
  efficiency: real("efficiency"), // Liters/hour
  plantName: text("plant_name").notNull().default("Main Plant"),
  sourceHeatingSessionId: integer("source_heating_session_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  dateIdx: index("generator_logs_date_idx").on(table.date),
  sourceHeatingIdx: uniqueIndex("generator_logs_source_heating_session_uq").on(table.sourceHeatingSessionId),
}));

// LDO Consumption Tracking
export const ldoLogs = pgTable("ldo_logs", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  partyId: integer("party_id"), // For party-wise tracking, NULL for plant
  openingStock: real("opening_stock"), // Liters
  ldoReceived: real("ldo_received"), // Liters
  ldoConsumed: real("ldo_consumed"), // Liters
  closingStock: real("closing_stock"), // Liters
  tonsProduced: real("tons_produced"), // Sum of dispatches that day
  efficiency: real("efficiency"), // Liters/ton
  expectedLdo: real("expected_ldo"), // tonsProduced * norm (default 6 L/ton)
  variance: real("variance"), // expectedLdo - ldoConsumed
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  dateIdx: index("ldo_logs_date_idx").on(table.date),
  dateUniq: uniqueIndex("ldo_logs_date_uq").on(table.date),
}));

// Stock Balances (for real-time stock tracking)
export const stockBalances = pgTable("stock_balances", {
  id: serial("id").primaryKey(),
  partyId: integer("party_id"), // NULL for plant-common stock
  materialId: integer("material_id").notNull(),
  balance: numeric("balance", { precision: 20, scale: 6, mode: 'number' }).notNull().default(0),
  uom: text("uom"),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

// Stock Ledger (detailed log of all stock movements)
export const stockLedger = pgTable("stock_ledger", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  partyId: integer("party_id"), // NULL for plant-common
  materialId: integer("material_id").notNull(),
  transactionType: text("transaction_type").notNull(), // "receipt", "dispatch", "issue", "opening", "adjustment"
  referenceId: integer("reference_id"), // ID of receipt, dispatch, or issue
  quantityIn: numeric("quantity_in", { precision: 20, scale: 6, mode: 'number' }).default(0),
  quantityOut: numeric("quantity_out", { precision: 20, scale: 6, mode: 'number' }).default(0),
  balanceAfter: numeric("balance_after", { precision: 20, scale: 6, mode: 'number' }),
  uom: text("uom"),
  notes: text("notes"),
  tankNumber: integer("tank_number"), // For bitumen: which physical tank (1 or 2) this movement belongs to
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  dateIdx: index("stock_ledger_date_idx").on(table.date),
  dateMaterialPartyIdx: index("stock_ledger_date_material_party_idx").on(table.date, table.materialId, table.partyId),
  // Unique partial index — prevents duplicate dispatch ledger rows for the same
  // (material, party, dispatch) triple.  Uses COALESCE so NULL party_id is
  // treated as -1 (a sentinel that never clashes with a real party row).
  // Created via raw SQL at startup (see server/index.ts, step 2 of the
  // "Dispatch ledger deduplication + unique index" block) because drizzle-kit
  // push does not support expression-based columns inside uniqueIndex.on().
  // Index name: stock_ledger_dispatch_dedup_idx
}));

// Material Issues (issues to sites/parties from central store)
export const materialIssues = pgTable("material_issues", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  time: text("time"),
  partyId: integer("party_id"), // Stock owner - NULL for PLANT COMMON stock
  isPlantCommon: integer("is_plant_common").default(0), // 1 if issuing from plant common stock
  materialId: integer("material_id").notNull(),
  quantity: real("quantity").notNull(),
  uom: text("uom").notNull(),
  issuedTo: text("issued_to").notNull(), // Site name or party name
  purpose: text("purpose"), // Purpose/remarks
  receivedBy: text("received_by"), // Person receiving the material
  vehicleNumber: text("vehicle_number"),
  notes: text("notes"),
  // Task #592 — When LDO/diesel is issued directly into an LDO tank, record
  // which tank (1=Boiler, 2=Dryer) received the fuel so a receipt row can be
  // auto-created in ldo_flow_readings.
  ldoTankNumber: integer("ldo_tank_number"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  dateIdx: index("material_issues_date_idx").on(table.date),
}));

// Material Returns (returns of issued materials back to plant stock)
export const materialReturns = pgTable("material_returns", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  time: text("time"),
  originalIssueId: integer("original_issue_id").notNull(), // Mandatory link to material_issues.id
  materialId: integer("material_id").notNull(),
  quantity: real("quantity").notNull(),
  uom: text("uom").notNull(),
  returnedBy: text("returned_by"), // Person returning the material
  partyId: integer("party_id"), // Stock owner (copied from original issue)
  isPlantCommon: integer("is_plant_common").default(0),
  vehicleNumber: text("vehicle_number"),
  notes: text("notes"),
  siteId: integer("site_id").references(() => sites.id), // nullable FK → sites.id; inherited from linked issue
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  dateIdx: index("material_returns_date_idx").on(table.date),
}));

// Site Material Trips (quick entry for real-time material receipt logging at site)
export const siteMaterialTrips = pgTable("site_material_trips", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  time: text("time"), // Time of arrival
  site: text("site").notNull(), // Site name
  material: text("material").notNull(), // Material name
  supplier: text("supplier"), // Supplier name
  vehicleNumber: text("vehicle_number"), // Vehicle registration
  quantity: real("quantity").notNull(),
  uom: text("uom").notNull(),
  location: text("location"), // Chainage/location where dumped
  receiptNumber: text("receipt_number"), // Challan/receipt number
  enteredBy: text("entered_by"), // Supervisor name
  notes: text("notes"),
  workType: text("work_type"), // "road" | "structure"
  // PI linkage — set when this trip is logged against a Purchase Indent (material route, site destination)
  indentId: integer("indent_id"),
  indentItemId: integer("indent_item_id"),
  piTransactionId: integer("pi_transaction_id"),
  pendingReceiptId: integer("pending_receipt_id"),
  createdAt: timestamp("created_at").defaultNow(),
  ...cancellationFields,
}, (table) => ({
  dateIdx: index("site_material_trips_date_idx").on(table.date),
}));

// === RELATIONS ===

export const dprsRelations = relations(dprs, ({ many }) => ({
  progress: many(progressEntries),
  equipment: many(equipmentLogs),
  labour: many(labourLogs),
  materials: many(materialLogs),
  sitePurchases: many(sitePurchases),
  versions: many(dprVersions),
  structureItems: many(dprStructureItems),
}));

export const dprStructureItemsRelations = relations(dprStructureItems, ({ one }) => ({
  dpr: one(dprs, { fields: [dprStructureItems.dprId], references: [dprs.id] }),
}));

export const dprVersionsRelations = relations(dprVersions, ({ one }) => ({
  originalDpr: one(dprs, { fields: [dprVersions.originalDprId], references: [dprs.id] }),
  versionDpr: one(dprs, { fields: [dprVersions.dprId], references: [dprs.id] }),
}));

export const plantReportsRelations = relations(plantReports, ({ many }) => ({
  production: many(plantProduction),
  versions: many(plantVersions),
}));

export const plantVersionsRelations = relations(plantVersions, ({ one }) => ({
  originalPlant: one(plantReports, { fields: [plantVersions.originalPlantId], references: [plantReports.id] }),
  versionPlant: one(plantReports, { fields: [plantVersions.plantId], references: [plantReports.id] }),
}));

export const plantProductionRelations = relations(plantProduction, ({ one }) => ({
  plantReport: one(plantReports, { fields: [plantProduction.plantReportId], references: [plantReports.id] }),
}));

export const progressRelations = relations(progressEntries, ({ one }) => ({
  dpr: one(dprs, { fields: [progressEntries.dprId], references: [dprs.id] }),
}));

export const equipmentRelations = relations(equipmentLogs, ({ one }) => ({
  dpr: one(dprs, { fields: [equipmentLogs.dprId], references: [dprs.id] }),
}));

export const labourRelations = relations(labourLogs, ({ one }) => ({
  dpr: one(dprs, { fields: [labourLogs.dprId], references: [dprs.id] }),
}));

export const materialRelations = relations(materialLogs, ({ one }) => ({
  dpr: one(dprs, { fields: [materialLogs.dprId], references: [dprs.id] }),
}));

export const sitePurchaseRelations = relations(sitePurchases, ({ one }) => ({
  dpr: one(dprs, { fields: [sitePurchases.dprId], references: [dprs.id] }),
}));

// === SCHEMAS & TYPES ===

export const insertDprSchema = createInsertSchema(dprs).omit({ id: true, createdAt: true });
export const insertProgressSchema = createInsertSchema(progressEntries).omit({ id: true, dprId: true });
export const insertDprStructureItemSchema = createInsertSchema(dprStructureItems).omit({ id: true, dprId: true });
export const insertEquipmentSchema = createInsertSchema(equipmentLogs).omit({ id: true, dprId: true });
export const insertLabourSchema = createInsertSchema(labourLogs).omit({ id: true, dprId: true });
export const insertMaterialSchema = createInsertSchema(materialLogs).omit({ id: true, dprId: true });
export const insertSitePurchaseSchema = createInsertSchema(sitePurchases).omit({ id: true, dprId: true, documentStatus: true, finalSubmittedAt: true, finalSubmittedBy: true });
export const insertPlantReportSchema = createInsertSchema(plantReports).omit({ id: true, createdAt: true });
export const insertPlantProductionSchema = createInsertSchema(plantProduction).omit({ id: true, plantReportId: true });

export type Dpr = typeof dprs.$inferSelect;
export type ProgressEntry = typeof progressEntries.$inferSelect;
export type DprStructureItem = typeof dprStructureItems.$inferSelect;
export type EquipmentLog = typeof equipmentLogs.$inferSelect;
export type LabourLog = typeof labourLogs.$inferSelect;
export type MaterialLog = typeof materialLogs.$inferSelect;
export type SitePurchase = typeof sitePurchases.$inferSelect;
export type DprVersion = typeof dprVersions.$inferSelect;
export type PlantReport = typeof plantReports.$inferSelect;
export type PlantProduction = typeof plantProduction.$inferSelect;
export type PlantVersion = typeof plantVersions.$inferSelect;

// Composite Request Type for Creating a Full DPR
export const createDprRequestSchema = insertDprSchema.extend({
  progress: z.array(insertProgressSchema.extend({
    personnelIds: z.array(z.number()).optional(),
  })).optional(),
  equipment: z.array(insertEquipmentSchema).optional(),
  labour: z.array(insertLabourSchema).optional(),
  materials: z.array(insertMaterialSchema).optional(),
  sitePurchases: z.array(insertSitePurchaseSchema).optional(),
  structureItems: z.array(insertDprStructureItemSchema).optional(),
  clientTimestamp: z.string().optional(),
});

export type CreateDprRequest = z.infer<typeof createDprRequestSchema>;

export type DprWithDetails = Dpr & {
  progress: ProgressEntry[];
  equipment: EquipmentLog[];
  labour: LabourLog[];
  materials: MaterialLog[];
  sitePurchases: SitePurchase[];
  structureItems: DprStructureItem[];
};

// Composite Request Type for Creating a Plant Report
export const createPlantReportRequestSchema = insertPlantReportSchema.extend({
  production: z.array(insertPlantProductionSchema).optional(),
});

export type CreatePlantReportRequest = z.infer<typeof createPlantReportRequestSchema>;

export type PlantReportWithDetails = PlantReport & {
  production: PlantProduction[];
};

// App Settings Types
export type AppSetting = typeof appSettings.$inferSelect;
export const insertAppSettingSchema = createInsertSchema(appSettings).omit({ id: true, updatedAt: true });

// ============================================
// PLANT MODULE PHASE-1 - SCHEMAS & TYPES
// ============================================

// Insert Schemas
export const insertPartySchema = createInsertSchema(parties).omit({ id: true, createdAt: true });
export const insertPlantMaterialSchema = createInsertSchema(plantMaterials).omit({ id: true, createdAt: true });
export const insertMaterialOpeningStockSchema = createInsertSchema(materialOpeningStocks).omit({ id: true, createdAt: true });
export const insertMixTypeSchema = createInsertSchema(mixTypes).omit({ id: true, createdAt: true });
export const insertMixTemplateSchema = createInsertSchema(mixTemplates).omit({ id: true, createdAt: true });
export const insertMixTemplateComponentSchema = createInsertSchema(mixTemplateComponents).omit({ id: true });
export const insertEquipmentMasterSchema = createInsertSchema(equipmentMaster).omit({ id: true, createdAt: true });
export const insertMaterialReceiptSchema = createInsertSchema(materialReceipts).omit({ id: true, createdAt: true, documentStatus: true, finalSubmittedAt: true, finalSubmittedBy: true });
export const insertTruckDispatchSchema = createInsertSchema(truckDispatches).omit({ id: true, createdAt: true });
export const insertEquipmentUsageSchema = createInsertSchema(equipmentUsage).omit({ id: true, createdAt: true });
export const insertGeneratorLogSchema = createInsertSchema(generatorLogs).omit({ id: true, createdAt: true });
export const insertLdoLogSchema = createInsertSchema(ldoLogs).omit({ id: true, createdAt: true });
export const insertStockBalanceSchema = createInsertSchema(stockBalances).omit({ id: true, lastUpdated: true });
export const insertStockLedgerSchema = createInsertSchema(stockLedger).omit({ id: true, createdAt: true });
export const insertMaterialIssueSchema = createInsertSchema(materialIssues).omit({ id: true, createdAt: true });
export const insertMaterialReturnSchema = createInsertSchema(materialReturns).omit({ id: true, createdAt: true });
export const insertSiteMaterialTripSchema = createInsertSchema(siteMaterialTrips).omit({ id: true, createdAt: true });

// Types
export type Party = typeof parties.$inferSelect;
export type PlantMaterial = typeof plantMaterials.$inferSelect;
export type MaterialOpeningStock = typeof materialOpeningStocks.$inferSelect;
export type MixType = typeof mixTypes.$inferSelect;
export type MixTemplate = typeof mixTemplates.$inferSelect;
export type MixTemplateComponent = typeof mixTemplateComponents.$inferSelect;
export type EquipmentMasterType = typeof equipmentMaster.$inferSelect;
export type MaterialReceipt = typeof materialReceipts.$inferSelect;
export type TruckDispatch = typeof truckDispatches.$inferSelect;
export type EquipmentUsage = typeof equipmentUsage.$inferSelect;
export type GeneratorLog = typeof generatorLogs.$inferSelect;
export type LdoLog = typeof ldoLogs.$inferSelect;
export type StockBalance = typeof stockBalances.$inferSelect;
export type StockLedgerEntry = typeof stockLedger.$inferSelect;
export type MaterialIssue = typeof materialIssues.$inferSelect;
export type MaterialReturn = typeof materialReturns.$inferSelect;
// Insert Types
export type InsertParty = z.infer<typeof insertPartySchema>;
export type InsertPlantMaterial = z.infer<typeof insertPlantMaterialSchema>;
export type InsertMaterialOpeningStock = z.infer<typeof insertMaterialOpeningStockSchema>;
export type InsertMixType = z.infer<typeof insertMixTypeSchema>;
export type InsertMixTemplate = z.infer<typeof insertMixTemplateSchema>;
export type InsertMixTemplateComponent = z.infer<typeof insertMixTemplateComponentSchema>;
export type InsertEquipmentMaster = z.infer<typeof insertEquipmentMasterSchema>;
export type InsertMaterialReceipt = z.infer<typeof insertMaterialReceiptSchema>;
export type InsertTruckDispatch = z.infer<typeof insertTruckDispatchSchema>;
export type InsertEquipmentUsage = z.infer<typeof insertEquipmentUsageSchema>;
export type InsertGeneratorLog = z.infer<typeof insertGeneratorLogSchema>;
export type InsertLdoLog = z.infer<typeof insertLdoLogSchema>;
export type InsertStockBalance = z.infer<typeof insertStockBalanceSchema>;
export type InsertStockLedger = z.infer<typeof insertStockLedgerSchema>;
export type InsertMaterialIssue = z.infer<typeof insertMaterialIssueSchema>;
export type InsertMaterialReturn = z.infer<typeof insertMaterialReturnSchema>;
export type SiteMaterialTrip = typeof siteMaterialTrips.$inferSelect;
export type InsertSiteMaterialTrip = z.infer<typeof insertSiteMaterialTripSchema>;

// Constants for UOM options
export const UOM_OPTIONS = ["Ton", "MT", "Cum", "Liters", "Kgs", "CFT", "Barrels", "Nos"] as const;
export const EQUIPMENT_TYPES = ["Generator", "JCB", "Loader", "Tipper", "Truck", "Tractor"] as const;
export const METER_TYPES = ["hour_meter", "odometer"] as const;
export const MIX_TYPES = ["BC", "DBM"] as const;

// Default LDO norm (liters per ton)
export const DEFAULT_LDO_NORM = 6;

export const PERSONNEL_ROLES = ["Engineer", "Supervisor", "Assistant", "Foreman", "Other"] as const;

// Personnel Master
export const personnel = pgTable("personnel", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(), // Engineer, Supervisor, Assistant, Foreman, Other
  phone: text("phone"),
  isActive: integer("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

// Activity-Personnel junction (tracks who was present per activity row)
export const activityPersonnel = pgTable("activity_personnel", {
  id: serial("id").primaryKey(),
  progressEntryId: integer("progress_entry_id").notNull(),
  personnelId: integer("personnel_id").notNull(),
});

export const insertPersonnelSchema = createInsertSchema(personnel).omit({ id: true, createdAt: true });
export const insertActivityPersonnelSchema = createInsertSchema(activityPersonnel).omit({ id: true });

export type Personnel = typeof personnel.$inferSelect;
export type InsertPersonnel = z.infer<typeof insertPersonnelSchema>;
export type ActivityPersonnel = typeof activityPersonnel.$inferSelect;
export type InsertActivityPersonnel = z.infer<typeof insertActivityPersonnelSchema>;

// ============================================
// FUEL STOCK TRACKING - BITUMEN & LDO
// ============================================

export const bitumenDipReadings = pgTable("bitumen_dip_readings", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  time: text("time"),
  tankNumber: integer("tank_number").notNull(),
  depthCm: real("depth_cm").notNull(),
  volumeLiters: real("volume_liters").notNull(),
  weightKg: real("weight_kg").notNull(),
  readingType: text("reading_type").notNull(),
  notes: text("notes"),
  plantName: text("plant_name").notNull().default("Main Plant"),
  sourceShiftLogId: integer("source_shift_log_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqDateTankTypePlant: uniqueIndex("bitumen_dip_readings_date_tank_type_plant_uq").on(
    table.date, table.tankNumber, table.readingType, table.plantName
  ),
}));

export const ldoFlowReadings = pgTable("ldo_flow_readings", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  time: text("time"),
  tankNumber: integer("tank_number").notNull().default(1),
  meterReading: real("meter_reading").notNull(),
  readingType: text("reading_type").notNull(),
  quantityLiters: real("quantity_liters"),
  notes: text("notes"),
  plantName: text("plant_name").notNull().default("Main Plant"),
  sourceShiftLogId: integer("source_shift_log_id"),
  sourceHeatingSessionId: integer("source_heating_session_id").references(() => bitumenHeatingSessions.id, { onDelete: "cascade" }),
  // Task #490 — Links a receipt-type flow reading back to the material_receipts
  // row that created it. Set automatically when an LDO material receipt is
  // created/updated; used to prevent double-counting and to cascade updates.
  sourceMaterialReceiptId: integer("source_material_receipt_id"),
  // Task #592 — Links a receipt-type flow reading back to the material_issues
  // row that created it when diesel/LDO is issued directly into an LDO tank.
  sourceMaterialIssueId: integer("source_material_issue_id"),
  // Task #255 — Denormalised dryer-source tag copied from the originating
  // shift log. Only set on tankNumber=2 (dryer-meter) rows. When present
  // and equal to "TANK_1", the litres recorded by this row are debited from
  // the Tank-1 stock balance instead of Tank-2 (dryer was fed from the boiler
  // tank for that shift). NULL means "treat the row as belonging to its
  // physical tankNumber" — used for manual entries and for boiler-meter
  // (tank=1) rows which always debit Tank-1.
  dryerFedFrom: text("dryer_fed_from"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const ldoDipReadings = pgTable("ldo_dip_readings", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  time: text("time"),
  tankNumber: integer("tank_number").notNull(),
  depthCm: real("depth_cm").notNull(),
  volumeLiters: real("volume_liters").notNull(),
  weightKg: real("weight_kg").notNull(),
  readingType: text("reading_type").notNull(),
  notes: text("notes"),
  plantName: text("plant_name").default("Main Plant"),
  sourceShiftLogId: integer("source_shift_log_id").references(() => plantShiftLogs.id, { onDelete: "set null" }),
  sourceHeatingSessionId: integer("source_heating_session_id").references(() => bitumenHeatingSessions.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqDateTankTypePlant: uniqueIndex("ldo_dip_readings_date_tank_type_plant_uq").on(
    table.date, table.tankNumber, table.readingType, table.plantName
  ),
}));

export const insertBitumenDipReadingSchema = createInsertSchema(bitumenDipReadings).omit({ id: true, createdAt: true });
export const insertLdoFlowReadingSchema = createInsertSchema(ldoFlowReadings).omit({ id: true, createdAt: true });
export const insertLdoDipReadingSchema = createInsertSchema(ldoDipReadings).omit({ id: true, createdAt: true });
export type BitumenDipReading = typeof bitumenDipReadings.$inferSelect;
export type LdoFlowReading = typeof ldoFlowReadings.$inferSelect;
export type LdoDipReading = typeof ldoDipReadings.$inferSelect;
export type InsertBitumenDipReading = z.infer<typeof insertBitumenDipReadingSchema>;
export type InsertLdoFlowReading = z.infer<typeof insertLdoFlowReadingSchema>;
export type InsertLdoDipReading = z.infer<typeof insertLdoDipReadingSchema>;

// ============================================
// PLANT SHIFT LOG (Operator daily log + EoD)
// ============================================

export const SHIFT_IDLE_REASONS = [
  "Material Shortage",
  "Mechanical Breakdown",
  "Electrical",
  "Motor Tripping",
  "No Demand",
  "Power Failure",
  "Rain",
  "Other",
] as const;

export const plantShiftLogs = pgTable("plant_shift_logs", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  shiftCode: text("shift_code").notNull().default("DAY"),
  plantName: text("plant_name").notNull().default("Main Plant"),
  plantStartTime: text("plant_start_time"),
  plantStopTime: text("plant_stop_time"),
  weather: text("weather"),
  ambientTemp: real("ambient_temp"),
  bitumenTank1StockApproxMt: real("bitumen_tank1_stock_approx_mt"),
  bitumenTank2StockApproxMt: real("bitumen_tank2_stock_approx_mt"),
  bitumenTank1Temp: real("bitumen_tank1_temp"),
  bitumenTank2Temp: real("bitumen_tank2_temp"),
  bitumenTank1OpeningDip: real("bitumen_tank1_opening_dip"),
  bitumenTank1ClosingDip: real("bitumen_tank1_closing_dip"),
  bitumenTank2OpeningDip: real("bitumen_tank2_opening_dip"),
  bitumenTank2ClosingDip: real("bitumen_tank2_closing_dip"),
  ldoTank1OpeningMeter: real("ldo_tank1_opening_meter"),
  ldoTank1ClosingMeter: real("ldo_tank1_closing_meter"),
  ldoTank2OpeningMeter: real("ldo_tank2_opening_meter"),
  ldoTank2ClosingMeter: real("ldo_tank2_closing_meter"),
  // Task #344 — LDO dip-stick readings (cm) captured each shift; auto-synced
  // into ldo_dip_readings the same way bitumen dips flow through.
  ldoTank1OpeningDip: real("ldo_tank1_opening_dip"),
  ldoTank1ClosingDip: real("ldo_tank1_closing_dip"),
  ldoTank2OpeningDip: real("ldo_tank2_opening_dip"),
  ldoTank2ClosingDip: real("ldo_tank2_closing_dip"),
  // Task #255 — Which physical LDO storage tank fed the dryer on this
  // shift. The dryer flow-meter records litres burned at the dryer, but the
  // litres themselves are debited from whichever tank the supply line was
  // routed to (TANK_1 or TANK_2). Default TANK_2 keeps prior behaviour for
  // legacy rows where this column did not exist.
  dryerFedFrom: text("dryer_fed_from").notNull().default("TANK_2"),
  // Task #254 — operator toggle indicating the boiler runs during production
  // on this shift. When 1, the Boiler Meter opening/closing inputs are shown
  // and (closing − opening) is added to the production day's boiler-LDO total
  // (on top of the LDO rolled up from heating sessions attributed to this
  // production day). When 0, those inputs are hidden and contribute zero.
  boilerRunsDuringProduction: integer("boiler_runs_during_production").notNull().default(0),
  // Task #323 — when true, operator is recording a non-production day
  // (maintenance, inspection, standby). Bitumen Tanks, LDO Flow Meters
  // and Idle Events sections are hidden; Manpower + Remarks remain.
  noMainPlantOps: boolean("no_main_plant_ops").notNull().default(false),
  operatorName: text("operator_name"),
  supervisorName: text("supervisor_name"),
  remarks: text("remarks"),
  isFinalized: integer("is_finalized").notNull().default(0),
  finalizedBy: text("finalized_by"),
  finalizedAt: timestamp("finalized_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // Per-user record locking (Task #229).
  authorUserId: integer("author_user_id"),
  lockStatus: text("lock_status").notNull().default("locked"),
  unlockedByUserId: integer("unlocked_by_user_id"),
  unlockedAt: timestamp("unlocked_at"),
  unlockReason: text("unlock_reason"),
}, (table) => ({
  dateIdx: index("plant_shift_logs_date_idx").on(table.date),
  uniqDatePlant: uniqueIndex("plant_shift_logs_date_plant_uq").on(table.date, table.plantName),
}));

export const plantShiftLogManpower = pgTable("plant_shift_log_manpower", {
  id: serial("id").primaryKey(),
  shiftLogId: integer("shift_log_id").notNull(),
  name: text("name").notNull(),
  role: text("role"),
  contractorName: text("contractor_name"),
  category: text("category"),
  gender: text("gender"),
});

export const plantShiftLogIdle = pgTable("plant_shift_log_idle", {
  id: serial("id").primaryKey(),
  shiftLogId: integer("shift_log_id").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time"),
  reason: text("reason").notNull(),
  remarks: text("remarks"),
});

export const plantShiftLogVersions = pgTable("plant_shift_log_versions", {
  id: serial("id").primaryKey(),
  shiftLogId: integer("shift_log_id").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  editedBy: text("edited_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Audit log of every bulk-relabel/merge done from the worker-cleanup screen.
// Keeps a per-row snapshot of the previous (name, contractor, category, gender)
// so an admin can undo a wrong merge within the retention window (30 days).
export const plantShiftLogManpowerRelabelBatches = pgTable("plant_shift_log_manpower_relabel_batches", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  actor: text("actor").notNull(),
  fromNames: text("from_names").array().notNull(),
  toName: text("to_name").notNull(),
  contractorName: text("contractor_name").notNull(),
  category: text("category").notNull(),
  gender: text("gender").notNull(),
  rowCount: integer("row_count").notNull(),
  undoneAt: timestamp("undone_at"),
  undoneBy: text("undone_by"),
}, (t) => ({
  createdAtIdx: index("psl_relabel_batch_created_idx").on(t.createdAt),
}));

export const plantShiftLogManpowerRelabelSnapshots = pgTable("plant_shift_log_manpower_relabel_snapshots", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull(),
  manpowerId: integer("manpower_id").notNull(),
  prevName: text("prev_name").notNull(),
  prevContractorName: text("prev_contractor_name"),
  prevCategory: text("prev_category"),
  prevGender: text("prev_gender"),
}, (t) => ({
  batchIdx: index("psl_relabel_snap_batch_idx").on(t.batchId),
}));

// Persisted "not a duplicate" decisions made on the worker-cleanup screen.
// Each row is an unordered name-pair (nameA <= nameB after UPPER+trim) that an
// admin has dismissed as a false-positive duplicate suggestion. Subsequent
// loads of the cleanup screen suppress any cluster edge between these names so
// the same noisy pair stops re-appearing forever.
// `plantName` scopes the dismissal to a single plant ("site"). The sentinel
// value `__ALL_PLANTS__` represents the cross-plant view that combines every
// plant's workers (the default on the cleanup screen). Suppression only
// applies to the matching plant view, so dismissing "RAJU vs RAJU K" on Plant
// A never silences the same pair on Plant B.
export const plantShiftLogManpowerDismissedDups = pgTable("plant_shift_log_manpower_dismissed_dups", {
  id: serial("id").primaryKey(),
  plantName: text("plant_name").notNull(),
  nameA: text("name_a").notNull(),
  nameB: text("name_b").notNull(),
  dismissedBy: text("dismissed_by").notNull(),
  dismissedAt: timestamp("dismissed_at").defaultNow().notNull(),
}, (t) => ({
  uniqPair: uniqueIndex("psl_dup_dismiss_pair_uq").on(t.plantName, t.nameA, t.nameB),
  createdAtIdx: index("psl_dup_dismiss_created_idx").on(t.dismissedAt),
}));

export const ALL_PLANTS_SENTINEL = "__ALL_PLANTS__";

export type PlantShiftLogManpowerDismissedDup = typeof plantShiftLogManpowerDismissedDups.$inferSelect;

// Admin-managed custom token-equivalence pairs for the duplicate-suggester.
// `kind = 'alias'` adds an extra token-pair (e.g. CHIKKU↔CHANDRA) on top of the
// hard-coded SHORT_FORM_GROUPS and the auto-mined learned aliases. `kind =
// 'suppress_learned'` mutes a previously-mined learned token-pair without
// having to undo the original merge — useful when a wrong merge taught the
// system a noisy equivalence. Tokens are stored UPPER-cased and sorted
// (tokenA < tokenB) so the pair is unordered.
export const plantShiftLogManpowerCustomAliases = pgTable("plant_shift_log_manpower_custom_aliases", {
  id: serial("id").primaryKey(),
  tokenA: text("token_a").notNull(),
  tokenB: text("token_b").notNull(),
  kind: text("kind").notNull().default("alias"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  uniqPair: uniqueIndex("psl_custom_alias_pair_uq").on(t.tokenA, t.tokenB, t.kind),
}));

export type PlantShiftLogManpowerCustomAlias = typeof plantShiftLogManpowerCustomAliases.$inferSelect;

// Audit feed for custom-alias dictionary edits (add/remove of explicit token
// equivalences and add/remove of admin-suppressed learned aliases). Mirrors
// plantShiftLogManpowerDupActivity so the same recent-activity timeline can
// surface alias changes alongside merges and dismissals. Each row snapshots
// the (tokenA, tokenB, kind) tuple so the original entry can still be rendered
// (and re-applied as a one-click revert) even after the underlying custom-
// alias row has been deleted. `action` is one of:
//   - 'add'    → admin added a custom alias or muted a learned alias.
//   - 'remove' → admin removed a custom alias or unmuted a learned alias.
// `kind` carries the same discriminator stored on plantShiftLogManpowerCustomAliases
// ('alias', 'suppress_learned', 'suppress_learned_pair') so a revert knows how
// to round-trip the entry through the existing add/delete endpoints.
export const plantShiftLogManpowerAliasActivity = pgTable("plant_shift_log_manpower_alias_activity", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  kind: text("kind").notNull(),
  tokenA: text("token_a").notNull(),
  tokenB: text("token_b").notNull(),
}, (t) => ({
  createdAtIdx: index("psl_alias_activity_created_idx").on(t.createdAt),
}));

export type PlantShiftLogManpowerAliasActivity = typeof plantShiftLogManpowerAliasActivity.$inferSelect;

// Audit feed for "not a duplicate" dismissals and their restores (single +
// bulk). Mirrors the merge audit kept in plantShiftLogManpowerRelabelBatches
// so the worker-cleanup screen can show every action in a single recent-
// activity timeline. Each row captures the operator (actor), plant scope, the
// affected name-pairs (snapshotted as JSON so a later delete of the dismissed
// row does not lose the context), and a precomputed pairCount for fast UI
// rendering of bulk operations. `action` is one of:
//   - 'dismiss'      → admin marked one or more pairs as not-a-duplicate.
//   - 'restore'      → admin un-dismissed a single pair.
//   - 'bulk_restore' → admin un-dismissed many pairs in one click (multi-
//                       select restore or "older than N days" purge).
export const plantShiftLogManpowerDupActivity = pgTable("plant_shift_log_manpower_dup_activity", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  actor: text("actor").notNull(),
  plantName: text("plant_name").notNull(),
  action: text("action").notNull(),
  pairs: jsonb("pairs").notNull(),
  pairCount: integer("pair_count").notNull(),
}, (t) => ({
  createdAtIdx: index("psl_dup_activity_created_idx").on(t.createdAt),
}));

export type PlantShiftLogManpowerDupActivity = typeof plantShiftLogManpowerDupActivity.$inferSelect;

export const insertPlantShiftLogSchema = createInsertSchema(plantShiftLogs).omit({ id: true, createdAt: true, updatedAt: true, finalizedAt: true, isFinalized: true, finalizedBy: true });
export const insertPlantShiftLogManpowerSchema = createInsertSchema(plantShiftLogManpower).omit({ id: true });
export const insertPlantShiftLogIdleSchema = createInsertSchema(plantShiftLogIdle).omit({ id: true });

export type PlantShiftLog = typeof plantShiftLogs.$inferSelect;
export type InsertPlantShiftLog = z.infer<typeof insertPlantShiftLogSchema>;
export type PlantShiftLogManpower = typeof plantShiftLogManpower.$inferSelect;
export type InsertPlantShiftLogManpower = z.infer<typeof insertPlantShiftLogManpowerSchema>;
export type PlantShiftLogIdle = typeof plantShiftLogIdle.$inferSelect;
export type InsertPlantShiftLogIdle = z.infer<typeof insertPlantShiftLogIdleSchema>;
export type PlantShiftLogManpowerRelabelBatch = typeof plantShiftLogManpowerRelabelBatches.$inferSelect;
export type PlantShiftLogManpowerRelabelSnapshot = typeof plantShiftLogManpowerRelabelSnapshots.$inferSelect;

// ============================================
// BITUMEN HEATING SESSIONS
// ============================================

export const HEATING_SESSION_TYPES = ["NIGHT_PREHEAT", "DAY_MAINTENANCE"] as const;

// Task #254 — Display labels for heating session types. Enum values stay
// NIGHT_PREHEAT / DAY_MAINTENANCE (DB + API contract), but everywhere a label
// is shown to the user it must come from this map.
export const HEATING_SESSION_TYPE_LABELS: Record<typeof HEATING_SESSION_TYPES[number], string> = {
  NIGHT_PREHEAT: "Night pre-heat (before production)",
  DAY_MAINTENANCE: "Daytime run (during production)",
};
export function heatingSessionTypeLabel(t: string | null | undefined): string {
  if (!t) return "—";
  return (HEATING_SESSION_TYPE_LABELS as Record<string, string>)[t] ?? t;
}
export const HEATING_DG_MODES = ["none", "inline", "link"] as const;

export const bitumenHeatingSessions = pgTable("bitumen_heating_sessions", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  sessionType: text("session_type").notNull().default("NIGHT_PREHEAT"),
  plantName: text("plant_name").notNull().default("Main Plant"),
  staffName: text("staff_name"),
  staffRole: text("staff_role"),
  startTime: text("start_time"),
  endTime: text("end_time"),
  durationHours: real("duration_hours"),
  hotOilTempStart: real("hot_oil_temp_start"),
  hotOilTempEnd: real("hot_oil_temp_end"),
  hotOilSupplyTemp: real("hot_oil_supply_temp"),
  hotOilReturnTemp: real("hot_oil_return_temp"),
  bitumenTank1TempStart: real("bitumen_tank1_temp_start"),
  bitumenTank1TempEnd: real("bitumen_tank1_temp_end"),
  bitumenTank2TempStart: real("bitumen_tank2_temp_start"),
  bitumenTank2TempEnd: real("bitumen_tank2_temp_end"),
  ldoTank1OpeningMeter: real("ldo_tank1_opening_meter"),
  ldoTank1ClosingMeter: real("ldo_tank1_closing_meter"),
  ldoTank1Consumed: real("ldo_tank1_consumed"),
  ldoTank1OpeningDip: real("ldo_tank1_opening_dip"),
  ldoTank1ClosingDip: real("ldo_tank1_closing_dip"),
  ldoTank2OpeningDip: real("ldo_tank2_opening_dip"),
  ldoTank2ClosingDip: real("ldo_tank2_closing_dip"),
  // Task #255 — Which physical LDO storage tank fed the dryer at the time
  // of this heating session. Heating sessions only record the Boiler meter
  // (Tank-1 stock), so this field is documentation-only here, but kept on
  // the row so downstream stock-balance code paths have a single, consistent
  // source for the dryer-source choice. Nullable so sessions without an
  // explicit operator choice can be distinguished from deliberate TANK_2 picks.
  dryerFedFrom: text("dryer_fed_from"),
  dgMode: text("dg_mode").notNull().default("none"),
  dgGeneratorName: text("dg_generator_name"),
  dgStartTime: text("dg_start_time"),
  dgEndTime: text("dg_end_time"),
  dgHoursRun: real("dg_hours_run"),
  dgOpeningHourMeter: real("dg_opening_hour_meter"),
  dgClosingHourMeter: real("dg_closing_hour_meter"),
  dgOpeningDiesel: real("dg_opening_diesel"),
  dgIssuedDiesel: real("dg_issued_diesel"),
  dgClosingDiesel: real("dg_closing_diesel"),
  dgDieselConsumed: real("dg_diesel_consumed"),
  generatorLogId: integer("generator_log_id"),
  remarks: text("remarks"),
  isFinalized: integer("is_finalized").notNull().default(0),
  createdBy: text("created_by"),
  finalizedBy: text("finalized_by"),
  finalizedAt: timestamp("finalized_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  dateIdx: index("bitumen_heating_sessions_date_idx").on(table.date),
}));

export const plantHeatingSessionVersions = pgTable("plant_heating_session_versions", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  editedBy: text("edited_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBitumenHeatingSessionSchema = createInsertSchema(bitumenHeatingSessions).omit({
  id: true, createdAt: true, updatedAt: true, finalizedAt: true, isFinalized: true, finalizedBy: true,
});
export type BitumenHeatingSession = typeof bitumenHeatingSessions.$inferSelect;
export type InsertBitumenHeatingSession = z.infer<typeof insertBitumenHeatingSessionSchema>;
export type PlantHeatingSessionVersion = typeof plantHeatingSessionVersions.$inferSelect;

// Task #255 — allowed values for the "Dryer fed from" picker. Used to
// constrain the column on both plant_shift_logs and bitumen_heating_sessions
// at the API layer so unknown strings can't reach the stock-routing logic.
export const DRYER_SOURCE_TANKS = ["TANK_1", "TANK_2"] as const;
export type DryerSourceTank = typeof DRYER_SOURCE_TANKS[number];

export const upsertBitumenHeatingSessionSchema = insertBitumenHeatingSessionSchema.extend({
  id: z.number().optional(),
  pin: z.string().optional(),
  editedBy: z.string().optional(),
  sessionType: z.enum(HEATING_SESSION_TYPES),
  dgMode: z.enum(["none", "inline", "link"]),
  // Task #255 / Task #359 — accept either of the two enum values or null
  // (no value selected by the operator). Column is now nullable so null is
  // stored as-is; the list badge only renders for explicit TANK_1/TANK_2 picks.
  dryerFedFrom: z.enum(DRYER_SOURCE_TANKS).nullable().optional(),
});
export type UpsertBitumenHeatingSessionInput = z.infer<typeof upsertBitumenHeatingSessionSchema>;

export const LABOUR_CATEGORIES = ["MASON", "HELPER", "MAZDOOR", "CARPENTER", "BAR-BENDER", "OPERATOR", "DRIVER", "ELECTRICIAN", "MECHANIC", "WATCHMAN", "OTHER"] as const;
export const LABOUR_GENDERS = ["MALE", "FEMALE"] as const;

export const plantShiftLogManpowerInputSchema = z.object({
  name: z.string().min(1, "Name required"),
  role: z.string().optional().nullable(),
  contractorName: z.string().min(1, "Contractor required"),
  category: z.enum(LABOUR_CATEGORIES, { errorMap: () => ({ message: "Category must be one of LABOUR_CATEGORIES" }) }),
  gender: z.enum(LABOUR_GENDERS),
});

export const plantShiftLogIdleInputSchema = z.object({
  startTime: z.string().min(1, "Start time required"),
  endTime: z.string().nullable().optional(),
  reason: z.enum(SHIFT_IDLE_REASONS),
  remarks: z.string().optional().nullable(),
});

export const upsertPlantShiftLogSchema = insertPlantShiftLogSchema.extend({
  manpower: z.array(plantShiftLogManpowerInputSchema).optional().default([]),
  idleEvents: z.array(plantShiftLogIdleInputSchema).optional().default([]),
  editedBy: z.string().optional(),
  // Task #255 — constrain dryer-source to the supported enum at the API
  // layer so an unknown string never reaches the stock-routing logic in
  // _syncShiftLogReadings / computeTankStock.
  dryerFedFrom: z.enum(DRYER_SOURCE_TANKS).optional().default("TANK_2"),
});

export type UpsertPlantShiftLogInput = z.infer<typeof upsertPlantShiftLogSchema>;

export type PlantShiftLogWithDetails = PlantShiftLog & {
  manpower: PlantShiftLogManpower[];
  idleEvents: PlantShiftLogIdle[];
};

// ============================================
// ADMIN NOTIFICATIONS
// ============================================

export const adminNotifications = pgTable("admin_notifications", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // "info", "warning", "success", "error"
  title: text("title").notNull(),
  message: text("message").notNull(),
  isRead: integer("is_read").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAdminNotificationSchema = createInsertSchema(adminNotifications).omit({ id: true, createdAt: true });
export type AdminNotification = typeof adminNotifications.$inferSelect;
export type InsertAdminNotification = z.infer<typeof insertAdminNotificationSchema>;

// ============================================
// CONSUMPTION ADJUSTMENT AUDIT LOG
// ============================================

export const consumptionAuditLog = pgTable("consumption_audit_log", {
  id: serial("id").primaryKey(),
  dispatchId: integer("dispatch_id").notNull(), // Reference to truck_dispatches
  adjustmentType: text("adjustment_type").notNull(), // "bitumen" or "ldo"
  previousValue: real("previous_value"), // Value before adjustment
  newValue: real("new_value").notNull(), // Value after adjustment
  theoreticalValue: real("theoretical_value").notNull(), // Expected value from formula
  variancePercent: real("variance_percent").notNull(), // Deviation from theoretical
  adjustedBy: text("adjusted_by").notNull(), // Role who made the change (operator/manager/admin)
  reason: text("reason"), // Optional reason for adjustment
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertConsumptionAuditLogSchema = createInsertSchema(consumptionAuditLog).omit({ id: true, createdAt: true });
export type ConsumptionAuditLog = typeof consumptionAuditLog.$inferSelect;
export type InsertConsumptionAuditLog = z.infer<typeof insertConsumptionAuditLogSchema>;

// Tolerance constant for consumption validation (±10%)
export const CONSUMPTION_TOLERANCE_PERCENT = 10;

// ============================================
// SITES MASTER
// ============================================

export const sites = pgTable("sites", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  partyId: integer("party_id"),
  isActive: integer("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  // Module packaging: which optional modules are enabled for this site.
  // Empty array = all modules visible (default / backward-compatible).
  // Use explicit values to restrict: ["hmp"] enables HMP; ["hmp","rmc"] enables both;
  // ["roads"] alone (no "hmp", no "rmc") hides both plant modules.
  enabledModules: text("enabled_modules").array().notNull().default([]),
});

export const insertSiteSchema = createInsertSchema(sites).omit({ id: true, createdAt: true });
export type Site = typeof sites.$inferSelect;
export type InsertSite = z.infer<typeof insertSiteSchema>;

// ============================================
// PUSH SUBSCRIPTIONS
// ============================================

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  label: text("label"),
  // Deterministic role assigned at subscribe time from the user's session:
  // "admin" | "manager". Used to route targeted alerts to the right audience.
  role: text("role"),
  // FK to the user who subscribed this device. Nullable for legacy anonymous
  // rows so they continue to be delivered as-is.
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({ id: true, createdAt: true });
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;

// ============================================
// PURCHASE INDENTS
// ============================================

export const purchaseIndents = pgTable("purchase_indents", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  indentNo: text("indent_no").notNull(),
  proposedBy: text("proposed_by").notNull(),
  raisedBy: text("raised_by").notNull(),
  status: text("status").default("pending").notNull(),
  remarks: text("remarks"),
  approvalRemarks: text("approval_remarks"),
  approvedBy: text("approved_by"),
  approvedAt: text("approved_at"),
  rejectionReason: text("rejection_reason"),
  notifyMessage: text("notify_message"),
  createdAt: timestamp("created_at").defaultNow(),
  siteId: integer("site_id").references(() => sites.id, { onDelete: "set null" }),
  raisedFrom: text("raised_from"),
  // Back-reference to the IRN that triggered this PI (if auto-raised).
  sourceIrnId: integer("source_irn_id"),
  // Per-user record locking (Task #229).
  authorUserId: integer("author_user_id"),
  lockStatus: text("lock_status").notNull().default("locked"),
  unlockedByUserId: integer("unlocked_by_user_id"),
  unlockedAt: timestamp("unlocked_at"),
  unlockReason: text("unlock_reason"),
  // Stores verification workflow
  storesStatus: text("stores_status"),
  storesVerifiedBy: text("stores_verified_by"),
  storesVerifiedAt: text("stores_verified_at"),
  // Material Indent type: 'stores' (default) or 'material' — material bypasses stores verification
  piType: text("pi_type").notNull().default("stores"),
  orderedAt: text("ordered_at"),
  // nullable FK to material_requirements.id — column added via ensureMaterialRequirementsTable
  requirementId: integer("requirement_id"),
  // allocationId references material_requirement_allocations.id — column added via ensureMaterialRequirementsTable
  allocationId: integer("allocation_id"),
});

export const purchaseIndentItems = pgTable("purchase_indent_items", {
  id: serial("id").primaryKey(),
  indentId: integer("indent_id").notNull(),
  description: text("description").notNull(),
  qty: real("qty").notNull(),
  uom: text("uom").notNull(),
  purpose: text("purpose").notNull(),
  priority: text("priority").default("normal").notNull(),
  materialId: integer("material_id").references(() => plantMaterials.id, { onDelete: "set null" }),
  estRate: real("est_rate"),
  estAmount: real("est_amount"),
  requiredBy: date("required_by"),
  approvedQty: real("approved_qty"),
  purchaseStatus: text("purchase_status"),
  qtyPurchased: real("qty_purchased"),
  vendor: text("vendor"),
  billNo: text("bill_no"),
  rate: real("rate"),
  amount: real("amount"),
  purchaseRemarks: text("purchase_remarks"),
  cancelledBy: text("cancelled_by"),
  cancelledAt: text("cancelled_at"),
  reviewerNote: text("reviewer_note"),
  // Stores verification per item
  stockStatus: text("stock_status"),
  stockAvailableQty: real("stock_available_qty"),
  storesItemNote: text("stores_item_note"),
  // Procurement tracking per item
  expectedDelivery: date("expected_delivery"),
  orderPlacedAt: text("order_placed_at"),
  paymentMode: text("payment_mode"),
  // Specification / part number
  spec: text("spec"),
  partNo: text("part_no"),
  // Who physically purchased this item
  purchasedBy: text("purchased_by"),
  purchasedByUserId: integer("purchased_by_user_id"),
  // Dual-route procurement fields
  procurementRoute: text("procurement_route"), // 'stores' | 'bulk_plant' — auto-filled from plant_materials
  orderedQty: real("ordered_qty"),             // qty placed on order with supplier
  totalPurchasedQty: real("total_purchased_qty"), // running total across all purchaser_action transactions
  totalAcceptedQty: real("total_accepted_qty"),   // running total across all handover/receipt transactions
  totalRejectedQty: real("total_rejected_qty"),   // running total of rejected/damaged qty
  linkedReceiptId: integer("linked_receipt_id"),   // links to material_receipts.id for Material Indent receipts
  // Batch 11 — Pending Store Receipt
  paidBy: text("paid_by"),                         // "company" | named person for reimbursement tracking
  linkedGrnId: integer("linked_grn_id"),           // auto-created draft store_grn from purchaser action
  // Ordered-awaiting-delivery tracking (Task #1302)
  orderNo: text("order_no"),                       // PO / order reference provided when action = "ordered"
  orderedByUserId: integer("ordered_by_user_id"),  // user who placed the order
  orderedByName: text("ordered_by_name"),          // display name of person who placed the order
});

export const purchaseIndentItemHistory = pgTable("purchase_indent_item_history", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull(),
  action: text("action").notNull(),
  actionBy: text("action_by").notNull(),
  actionAt: timestamp("action_at").defaultNow(),
  notes: text("notes"),
  qtyValue: real("qty_value"),
  vendor: text("vendor"),
  billNo: text("bill_no"),
  rate: real("rate"),
  amount: real("amount"),
});

export const purchaseIndentsRelations = relations(purchaseIndents, ({ many }) => ({
  items: many(purchaseIndentItems),
}));

export const purchaseIndentItemsRelations = relations(purchaseIndentItems, ({ one, many }) => ({
  indent: one(purchaseIndents, { fields: [purchaseIndentItems.indentId], references: [purchaseIndents.id] }),
  history: many(purchaseIndentItemHistory),
}));

export const purchaseIndentItemHistoryRelations = relations(purchaseIndentItemHistory, ({ one }) => ({
  item: one(purchaseIndentItems, { fields: [purchaseIndentItemHistory.itemId], references: [purchaseIndentItems.id] }),
}));

export const insertPurchaseIndentSchema = createInsertSchema(purchaseIndents).omit({ id: true, createdAt: true });
export const insertPurchaseIndentItemSchema = createInsertSchema(purchaseIndentItems).omit({ id: true });
export const insertPurchaseIndentItemHistorySchema = createInsertSchema(purchaseIndentItemHistory).omit({ id: true, actionAt: true });
export type PurchaseIndent = typeof purchaseIndents.$inferSelect;
export type PurchaseIndentItem = typeof purchaseIndentItems.$inferSelect;
export type PurchaseIndentItemHistoryEntry = typeof purchaseIndentItemHistory.$inferSelect;
export type InsertPurchaseIndent = z.infer<typeof insertPurchaseIndentSchema>;
export type InsertPurchaseIndentItem = z.infer<typeof insertPurchaseIndentItemSchema>;
export type InsertPurchaseIndentItemHistory = z.infer<typeof insertPurchaseIndentItemHistorySchema>;

export type PurchaseIndentWithItems = PurchaseIndent & {
  items: (PurchaseIndentItem & { history?: PurchaseIndentItemHistoryEntry[] })[];
};

export const createPurchaseIndentRequestSchema = insertPurchaseIndentSchema.extend({
  siteId: z.number().int().nullish(),
  raisedFrom: z.string().nullish(),
  requirementId: z.number().int().nullish(), // optional link to material_requirements
  items: z.array(insertPurchaseIndentItemSchema.omit({ indentId: true })),
}).refine(
  (d) => (d.siteId != null && d.siteId > 0) || (d.raisedFrom != null && d.raisedFrom.trim().length > 0),
  { message: "Raised from / location is required", path: ["raisedFrom"] }
);
export type CreatePurchaseIndentRequest = z.infer<typeof createPurchaseIndentRequestSchema>;

// ============================================
// PI ITEM TRANSACTIONS
// One row per procurement event per item:
//   'purchaser_action' — purchaser fills order/purchase details
//   'handover'         — purchaser physically hands over to Stores (Route A)
//   'bulk_receipt'     — plant material receipt created (Route B)
// ============================================

export const piItemTransactions = pgTable("pi_item_transactions", {
  id: serial("id").primaryKey(),
  indentItemId: integer("indent_item_id").notNull(),
  indentId: integer("indent_id").notNull(),
  transactionType: text("transaction_type").notNull(), // 'purchaser_action' | 'handover' | 'bulk_receipt'
  // Purchaser action fields
  qty: real("qty"),                         // purchased qty (purchaser_action) or received qty (bulk_receipt)
  orderedQty: real("ordered_qty"),
  vendor: text("vendor"),
  rate: real("rate"),
  amount: real("amount"),
  paymentMode: text("payment_mode"),
  paidBy: text("paid_by"),                  // "company" | named person for reimbursement tracking (Batch 11)
  expectedDeliveryDate: date("expected_delivery_date"),
  reasonCode: text("reason_code"),          // mandatory when qty < approvedQty
  // Handover fields (Route A)
  handoverQty: real("handover_qty"),
  acceptedQty: real("accepted_qty"),        // Stores-accepted qty — GRN is based on this
  rejectedQty: real("rejected_qty"),
  handoverDate: date("handover_date"),
  receivedBy: text("received_by"),          // Stores personnel who received
  storesRemarks: text("stores_remarks"),
  // General
  remarks: text("remarks"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPiItemTransactionSchema = createInsertSchema(piItemTransactions).omit({ id: true, createdAt: true });
export type PiItemTransaction = typeof piItemTransactions.$inferSelect;
export type InsertPiItemTransaction = z.infer<typeof insertPiItemTransactionSchema>;

// ============================================
// INTERNAL REQUISITION NOTES (IRN)
// ============================================

export const internalRequisitions = pgTable("internal_requisitions", {
  id: serial("id").primaryKey(),
  irnNo: text("irn_no").notNull().unique(),
  date: date("date").notNull(),
  raisedBy: text("raised_by").notNull(),
  raisedByUserId: integer("raised_by_user_id"),
  raisedFrom: text("raised_from").notNull(), // Site Operations | HMP Plant | Equipment & Fleet | RMC Operations
  siteId: integer("site_id"),               // relevant for Site Operations + Equipment & Fleet
  status: text("status").default("pending_stores").notNull(), // pending_stores | stores_verified | approved | rejected | closed
  remarks: text("remarks"),
  storesRemarks: text("stores_remarks"),
  storesVerifiedBy: text("stores_verified_by"),
  storesVerifiedAt: timestamp("stores_verified_at"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  approvalRemarks: text("approval_remarks"),
  rejectedBy: text("rejected_by"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  closedBy: text("closed_by"),
  closedAt: timestamp("closed_at"),
  linkedIssueId: integer("linked_issue_id"), // FK → store_issues (set when Issue Voucher is recorded)
  createdAt: timestamp("created_at").defaultNow(),
  // nullable FK to material_requirements.id — column added via ensureMaterialRequirementsTable
  requirementId: integer("requirement_id"),
  allocationId: integer("allocation_id"),
});

export const internalRequisitionItems = pgTable("internal_requisition_items", {
  id: serial("id").primaryKey(),
  irnId: integer("irn_id").notNull().references(() => internalRequisitions.id, { onDelete: "cascade" }),
  material: text("material").notNull(),
  qty: real("qty").notNull(),
  uom: text("uom").notNull().default("MT"),
  urgency: text("urgency").notNull().default("normal"), // normal | high | urgent
  purpose: text("purpose").notNull(),
  needByDate: date("need_by_date"),
  stockAvailable: real("stock_available"),
  issueQty: real("issue_qty"),
  procureQty: real("procure_qty"),
  itemStatus: text("item_status").notNull().default("pending"), // pending | issued | queued_procurement | partially_issued
  storesAction: text("stores_action"), // issue | procure | split
  storesNotes: text("stores_notes"),
  storeItemId: integer("store_item_id"), // optional FK → store_items (set when recording issue for store items)
  materialId: integer("material_id").references(() => plantMaterials.id), // optional FK → plant_materials (for bulk material items)
  actualIssuedQty: real("actual_issued_qty"), // what was actually dispatched (may differ from issueQty)
});

export const internalRequisitionsRelations = relations(internalRequisitions, ({ many }) => ({
  items: many(internalRequisitionItems),
}));

export const internalRequisitionItemsRelations = relations(internalRequisitionItems, ({ one }) => ({
  irn: one(internalRequisitions, { fields: [internalRequisitionItems.irnId], references: [internalRequisitions.id] }),
}));

export const insertInternalRequisitionSchema = createInsertSchema(internalRequisitions).omit({ id: true, createdAt: true });
export const insertInternalRequisitionItemSchema = createInsertSchema(internalRequisitionItems).omit({ id: true });

export type InternalRequisition = typeof internalRequisitions.$inferSelect;
export type InternalRequisitionItem = typeof internalRequisitionItems.$inferSelect;
export type InsertInternalRequisition = z.infer<typeof insertInternalRequisitionSchema>;
export type InsertInternalRequisitionItem = z.infer<typeof insertInternalRequisitionItemSchema>;

export type InternalRequisitionWithItems = InternalRequisition & {
  items: InternalRequisitionItem[];
  linkedPiId?: number | null;
  linkedPi?: { id: number; indentNo: string; raisedBy: string; createdAt: Date | string | null } | null;
  linkedIssueNo?: string | null;
};

export const irnAuditLogs = pgTable("irn_audit_logs", {
  id: serial("id").primaryKey(),
  irnId: integer("irn_id").notNull().references(() => internalRequisitions.id, { onDelete: "cascade" }),
  event: text("event").notNull(), // opened | stores_verified | approved | rejected | closed | reopened
  actorName: text("actor_name").notNull(),
  notes: text("notes"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export type IrnAuditLog = typeof irnAuditLogs.$inferSelect;
export type InsertIrnAuditLog = typeof irnAuditLogs.$inferInsert;

export const createIrnRequestSchema = z.object({
  date: z.string(),
  raisedFrom: z.string().min(1, "Section is required"),
  siteId: z.number().int().nullish(),
  raisedBy: z.string().min(1),
  raisedByUserId: z.number().int().optional(),
  requirementId: z.number().int().nullish(), // optional link to material_requirements
  remarks: z.string().optional(),
  items: z.array(z.object({
    material: z.string().min(1, "Material is required"),
    qty: z.number().positive("Qty must be > 0"),
    uom: z.string().min(1),
    urgency: z.enum(["normal", "high", "urgent"]).default("normal"),
    purpose: z.string().min(1, "Purpose is required"),
    needByDate: z.string().optional(),
    materialId: z.number().int().nullish(), // optional link to plant_materials
  })).min(1, "At least one item is required"),
});
export type CreateIrnRequest = z.infer<typeof createIrnRequestSchema>;

export const storesVerifyIrnSchema = z.object({
  storesRemarks: z.string().optional(),
  verifiedBy: z.string(),
  items: z.array(z.object({
    itemId: z.number().int(),
    storesAction: z.enum(["issue", "procure", "split"]),
    stockAvailable: z.number().min(0),
    issueQty: z.number().min(0),
    procureQty: z.number().min(0),
    storesNotes: z.string().optional(),
  })),
});
export type StoresVerifyIrnRequest = z.infer<typeof storesVerifyIrnSchema>;

export const approveIrnSchema = z.object({
  action: z.enum(["approve", "reject"]),
  remarks: z.string().optional(),
  actionBy: z.string(),
});
export type ApproveIrnRequest = z.infer<typeof approveIrnSchema>;

export const recordIrnIssueSchema = z.object({
  date: z.string().min(1, "Date is required"),
  issuedBy: z.string().min(1, "Issued By is required"),
  receivedBy: z.string().min(1, "Received By is required"),
  receiverDesignation: z.string().optional(),
  deliveryMode: z.enum(["vehicle", "hand_carried"]),
  vehicleType: z.string().optional(),
  vehicleNo: z.string().optional(),
  driverName: z.string().optional(),
  movementRemarks: z.string().optional(),
  items: z.array(z.object({
    irnItemId: z.number().int(),
    storeItemId: z.number().int().nullable().optional(),
    materialId: z.number().int().nullable().optional(),   // plant_materials FK — bulk material items
    partyId: z.number().int().nullable().optional(),      // whose plant stock to deduct
    actualIssuedQty: z.number().positive("Issued qty must be > 0"),
    uom: z.string(),
    materialText: z.string(),
  })).min(1, "At least one item required"),
});
export type RecordIrnIssueRequest = z.infer<typeof recordIrnIssueSchema>;

// ============================================
// DAILY DIESEL REQUIREMENTS
// ============================================

export const dieselRequirements = pgTable("diesel_requirements", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  raisedBy: text("raised_by").notNull(),
  totalPlanned: real("total_planned").notNull(),
  totalApproved: real("total_approved"),
  status: text("status").default("pending").notNull(),
  remarks: text("remarks"),
  approvedBy: text("approved_by"),
  approvedAt: text("approved_at"),
  rejectionReason: text("rejection_reason"),
  qtyPurchased: real("qty_purchased"),
  supplier: text("supplier"),
  billNo: text("bill_no"),
  rate: real("rate"),
  amount: real("amount"),
  purchasedAt: text("purchased_at"),
  purchaseRemarks: text("purchase_remarks"),
  createdAt: timestamp("created_at").defaultNow(),
  siteId: integer("site_id").references(() => sites.id, { onDelete: "set null" }),
  raisedFrom: text("raised_from"),
  // Per-user record locking (Task #229).
  authorUserId: integer("author_user_id"),
  lockStatus: text("lock_status").notNull().default("locked"),
  unlockedByUserId: integer("unlocked_by_user_id"),
  unlockedAt: timestamp("unlocked_at"),
  unlockReason: text("unlock_reason"),
});

export const dieselRequirementItems = pgTable("diesel_requirement_items", {
  id: serial("id").primaryKey(),
  requirementId: integer("requirement_id").notNull(),
  equipmentId: integer("equipment_id"),
  equipmentName: text("equipment_name").notNull(),
  purpose: text("purpose"),
  estHours: real("est_hours"),
  norm: real("norm"),
  normType: text("norm_type").default("hourly"),
  plannedQty: real("planned_qty").notNull(),
  approvedQty: real("approved_qty"),
});

export const dieselRequirementsRelations = relations(dieselRequirements, ({ many }) => ({
  items: many(dieselRequirementItems),
}));

export const dieselRequirementItemsRelations = relations(dieselRequirementItems, ({ one }) => ({
  requirement: one(dieselRequirements, { fields: [dieselRequirementItems.requirementId], references: [dieselRequirements.id] }),
}));

export const insertDieselRequirementSchema = createInsertSchema(dieselRequirements).omit({ id: true, createdAt: true });
export const insertDieselRequirementItemSchema = createInsertSchema(dieselRequirementItems).omit({ id: true });
export type DieselRequirement = typeof dieselRequirements.$inferSelect;
export type DieselRequirementItem = typeof dieselRequirementItems.$inferSelect;
export type InsertDieselRequirement = z.infer<typeof insertDieselRequirementSchema>;
export type InsertDieselRequirementItem = z.infer<typeof insertDieselRequirementItemSchema>;

export type DieselRequirementWithItems = DieselRequirement & {
  items: DieselRequirementItem[];
};

export const createDieselRequirementRequestSchema = insertDieselRequirementSchema.extend({
  siteId: z.number().int().nullish(),
  raisedFrom: z.string().nullish(),
  items: z.array(insertDieselRequirementItemSchema.omit({ requirementId: true })),
}).refine(
  (d) => (d.siteId != null && d.siteId > 0) || (d.raisedFrom != null && d.raisedFrom.trim().length > 0),
  { message: "Raised from / location is required", path: ["raisedFrom"] }
);
export type CreateDieselRequirementRequest = z.infer<typeof createDieselRequirementRequestSchema>;

// ============================================
// VENDOR BILLS
// ============================================

export const vendorBills = pgTable("vendor_bills", {
  id: serial("id").primaryKey(),
  billDate: date("bill_date").notNull(),
  billNo: text("bill_no").notNull(),
  billType: text("bill_type").notNull(),
  vendorName: text("vendor_name").notNull(),
  periodFrom: date("period_from"),
  periodTo: date("period_to"),
  status: text("status").default("draft").notNull(),
  notes: text("notes"),
  totalAmount: real("total_amount"),
  verifiedBy: text("verified_by"),
  verifiedAt: text("verified_at"),
  approvedBy: text("approved_by"),
  approvedAt: text("approved_at"),
  paidAt: text("paid_at"),
  paymentRemarks: text("payment_remarks"),
  adjustmentLabel: text("adjustment_label"),
  adjustmentAmount: real("adjustment_amount").default(0),
  gstRateEquipment: real("gst_rate_equipment"),
  gstRateMaterial: real("gst_rate_material"),
  gstRateTransport: real("gst_rate_transport"),
  gstRateLabour: real("gst_rate_labour"),
  tdsRate: real("tds_rate"),
  createdAt: timestamp("created_at").defaultNow(),
  // Per-user record locking (Task #229).
  authorUserId: integer("author_user_id"),
  lockStatus: text("lock_status").notNull().default("locked"),
  unlockedByUserId: integer("unlocked_by_user_id"),
  unlockedAt: timestamp("unlocked_at"),
  unlockReason: text("unlock_reason"),
});

export const vendorBillItems = pgTable("vendor_bill_items", {
  id: serial("id").primaryKey(),
  billId: integer("bill_id").notNull(),
  date: text("date"),
  category: text("category"),
  description: text("description").notNull(),
  qty: real("qty"),
  unit: text("unit"),
  rate: real("rate"),
  amount: real("amount"),
  source: text("source").default("manual"),
  equipmentId: integer("equipment_id"),
  leadDistance: real("lead_distance"),
  siteName: text("site_name"),
  suppliedTo: text("supplied_to"),
  transporter: text("transporter"),
});

export const vendorBillsRelations = relations(vendorBills, ({ many }) => ({
  items: many(vendorBillItems),
}));

export const vendorBillItemsRelations = relations(vendorBillItems, ({ one }) => ({
  bill: one(vendorBills, { fields: [vendorBillItems.billId], references: [vendorBills.id] }),
}));

export const insertVendorBillSchema = createInsertSchema(vendorBills).omit({ id: true, createdAt: true });
export const insertVendorBillItemSchema = createInsertSchema(vendorBillItems).omit({ id: true });
export type VendorBill = typeof vendorBills.$inferSelect;
export type VendorBillItem = typeof vendorBillItems.$inferSelect;
export type InsertVendorBill = z.infer<typeof insertVendorBillSchema>;
export type InsertVendorBillItem = z.infer<typeof insertVendorBillItemSchema>;

export type VendorBillWithItems = VendorBill & {
  items: VendorBillItem[];
};

export const createVendorBillRequestSchema = insertVendorBillSchema.extend({
  items: z.array(insertVendorBillItemSchema.omit({ billId: true })),
});
export type CreateVendorBillRequest = z.infer<typeof createVendorBillRequestSchema>;

export const vendorAliases = pgTable("vendor_aliases", {
  id: serial("id").primaryKey(),
  canonicalName: text("canonical_name").notNull(),
  alias: text("alias").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertVendorAliasSchema = createInsertSchema(vendorAliases).omit({ id: true, createdAt: true });
export type VendorAlias = typeof vendorAliases.$inferSelect;
export type InsertVendorAlias = z.infer<typeof insertVendorAliasSchema>;

export const mixEstimates = pgTable("mix_estimates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  state: text("state").notNull(),
  totalMt: real("total_mt").default(0),
  totalAmt: real("total_amt").default(0),
  contractorList: text("contractor_list").default(""),
  contractor: text("contractor"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMixEstimateSchema = createInsertSchema(mixEstimates).omit({ id: true, createdAt: true, updatedAt: true });
export type MixEstimate = typeof mixEstimates.$inferSelect;
export type InsertMixEstimate = z.infer<typeof insertMixEstimateSchema>;

export const priceScenarios = pgTable("price_scenarios", {
  id: serial("id").primaryKey(),
  estimateId: integer("estimate_id").references(() => mixEstimates.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  revisedPrices: text("revised_prices").notNull().default("{}"),
  state: text("state"),
  baseState: text("base_state"),
  updatedAt: timestamp("updated_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPriceScenarioSchema = createInsertSchema(priceScenarios).omit({ id: true, createdAt: true, updatedAt: true });
export type PriceScenario = typeof priceScenarios.$inferSelect;
export type InsertPriceScenario = z.infer<typeof insertPriceScenarioSchema>;

export const concreteEstimates = pgTable("concrete_estimates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contractor: text("contractor"),
  structureType: text("structure_type"),
  grade: text("grade"),
  state: text("state").notNull(),
  totalCum: real("total_cum"),
  totalAmt: real("total_amt"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertConcreteEstimateSchema = createInsertSchema(concreteEstimates).omit({ id: true, createdAt: true, updatedAt: true });
export type ConcreteEstimate = typeof concreteEstimates.$inferSelect;
export type InsertConcreteEstimate = z.infer<typeof insertConcreteEstimateSchema>;

export const concreteEstimatesV2 = pgTable("concrete_estimates_v2", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contractor: text("contractor"),
  structureType: text("structure_type"),
  state: text("state").notNull(),
  totalLengthM: real("total_length_m"),
  totalRmAmt: real("total_rm_amt"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertConcreteEstimateV2Schema = createInsertSchema(concreteEstimatesV2).omit({ id: true, createdAt: true, updatedAt: true });
export type ConcreteEstimateV2 = typeof concreteEstimatesV2.$inferSelect;
export type InsertConcreteEstimateV2 = z.infer<typeof insertConcreteEstimateV2Schema>;

export const vendorRateCards = pgTable("vendor_rate_cards", {
  id: serial("id").primaryKey(),
  vendorName: text("vendor_name").notNull(),
  category: text("category").notNull(),
  itemKey: text("item_key").notNull(),
  itemLabel: text("item_label"),
  unit: text("unit").notNull(),
  rate: real("rate").notNull(),
  notes: text("notes"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertVendorRateCardSchema = createInsertSchema(vendorRateCards).omit({ id: true, updatedAt: true });
export type VendorRateCard = typeof vendorRateCards.$inferSelect;
export type InsertVendorRateCard = z.infer<typeof insertVendorRateCardSchema>;

// ============================================
// USERS & PERMISSIONS (Task #229)
// ============================================
// Replaces the old localStorage AccessContext + hardcoded ADMIN_PIN with real
// per-user accounts. Estimator-portal PIN-based auth (app_settings rows
// admin_pin / manager_pin + hlc_est_role cookie) is intentionally untouched.

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  // Task #280 — email is now nullable so phone-only accounts can be created.
  // At least one of email/phone must be set (enforced at the app layer).
  email: text("email").unique(),
  phone: text("phone").unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  // Admins bypass per-section permission checks (still go through device
  // approval). The bootstrap admin starts with isAdmin=true.
  isAdmin: boolean("is_admin").notNull().default(false),
  // Company Owner / Primary Admin — always has full control across every
  // module regardless of permission toggles, and cannot be locked out.
  // Distinct from isAdmin so multiple admins can be permission-limited while
  // exactly one (or a small set of) owners always retain full access.
  isOwner: boolean("is_owner").notNull().default(false),
  // Allows unlocking previously-saved records on sections where the user
  // also has edit permission. Audited via record_unlock_log.
  canUnlockRecords: boolean("can_unlock_records").notNull().default(false),
  // Permission manager: when true this user can edit other users' permissions
  // without being a full admin. Scope controls which users they can manage:
  // "full" = any user, "partial" = only non-admin users (and caps grants to
  // their own permission set so they can't grant more than they have).
  canManagePermissions: boolean("can_manage_permissions").notNull().default(false),
  permissionManagerScope: text("permission_manager_scope").default("partial"),
  // Task #1247 — explicit, admin-settable "Engineer / field user" flag.
  // Independent of isAdmin/isManager (the latter's broken semantics — see
  // auth-context.tsx — are intentionally left untouched by this field). Used
  // to drive FieldHome default routing, the guided-DPR default, and role
  // labels without disturbing any existing isManager-gated behavior.
  isFieldEngineer: boolean("is_field_engineer").notNull().default(false),
  // Admin-controlled flag: when true this user's subscribed devices receive
  // push (and later SMS) notifications. Default off so new users are not
  // disturbed until the admin opts them in.
  notificationsEnabled: boolean("notifications_enabled").notNull().default(false),
  // "strict" = 5min idle + tab-close logout. "sticky" = no idle, tab-close
  // logout, 30-day max session age.
  sessionPolicy: text("session_policy").notNull().default("strict"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
});

export const userPermissions = pgTable("user_permissions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sectionKey: text("section_key").notNull(),
  canView: boolean("can_view").notNull().default(false),
  canCreate: boolean("can_create").notNull().default(false),
  canEdit: boolean("can_edit").notNull().default(false),
  canDelete: boolean("can_delete").notNull().default(false),
  canViewReports: boolean("can_view_reports").notNull().default(false),
  canExport: boolean("can_export").notNull().default(false),
  canApprove: boolean("can_approve").notNull().default(false),
  canNotify: boolean("can_notify").notNull().default(false),
}, (t) => ({
  userSectionUq: uniqueIndex("user_permissions_user_section_uq").on(t.userId, t.sectionKey),
}));

// ============================================
// USER SITE ACCESS (Permission System v2)
// ============================================
// If a user has NO rows here → they can see ALL sites (admin / backward-compat).
// If they have rows → they only see data for those sites.
export const userSiteAccess = pgTable("user_site_access", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  siteId: integer("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  accessLevel: text("access_level").notNull().default("full"), // "full" | "view_only"
}, (t) => ({
  userSiteUq: uniqueIndex("user_site_access_user_site_uq").on(t.userId, t.siteId),
}));

export const insertUserSiteAccessSchema = createInsertSchema(userSiteAccess).omit({ id: true });
export type UserSiteAccess = typeof userSiteAccess.$inferSelect;
export type InsertUserSiteAccess = z.infer<typeof insertUserSiteAccessSchema>;

export const userDevices = pgTable("user_devices", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Random opaque token (64 hex). Hashed with SESSION_SECRET in the cookie.
  deviceToken: text("device_token").notNull().unique(),
  deviceLabel: text("device_label").notNull(),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  // "pending" | "approved" | "revoked"
  status: text("status").notNull().default("pending"),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  approvedAt: timestamp("approved_at"),
  approvedByUserId: integer("approved_by_user_id"),
  revokedAt: timestamp("revoked_at"),
  revokedByUserId: integer("revoked_by_user_id"),
  lastSeenAt: timestamp("last_seen_at"),
}, (t) => ({
  userIdx: index("user_devices_user_idx").on(t.userId),
  statusIdx: index("user_devices_status_idx").on(t.status),
}));

export const userSessions = pgTable("user_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  deviceId: integer("device_id").notNull().references(() => userDevices.id, { onDelete: "cascade" }),
  sessionToken: text("session_token").notNull().unique(),
  loginAt: timestamp("login_at").defaultNow().notNull(),
  lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
  loggedOutAt: timestamp("logged_out_at"),
}, (t) => ({
  userIdx: index("user_sessions_user_idx").on(t.userId),
  activityIdx: index("user_sessions_activity_idx").on(t.lastActivityAt),
}));

export const recordUnlockLog = pgTable("record_unlock_log", {
  id: serial("id").primaryKey(),
  resourceType: text("resource_type").notNull(), // dpr | plant_shift_log | equipment_usage | purchase_indent | diesel_requirement | vendor_bill
  resourceId: integer("resource_id").notNull(),
  unlockedByUserId: integer("unlocked_by_user_id").notNull().references(() => users.id),
  unlockReason: text("unlock_reason").notNull(),
  unlockedAt: timestamp("unlocked_at").defaultNow().notNull(),
  relockedAt: timestamp("relocked_at"),
}, (t) => ({
  resourceIdx: index("record_unlock_log_resource_idx").on(t.resourceType, t.resourceId),
  unlockedAtIdx: index("record_unlock_log_unlocked_at_idx").on(t.unlockedAt),
}));

// ============================================
// STORES / INVENTORY MODULE
// ============================================

export const storeItems = pgTable("store_items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(), // Spares, Lubricants, Consumables, Electricals, Tools, Others
  uom: text("uom").notNull(),
  minStockQty: real("min_stock_qty"),
  isActive: integer("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

export const storeGrns = pgTable("store_grns", {
  id: serial("id").primaryKey(),
  grnNumber: text("grn_number").notNull().unique(),
  date: date("date").notNull(),
  supplier: text("supplier").notNull(),
  invoiceNo: text("invoice_no"),
  invoiceDate: date("invoice_date"),
  siteId: integer("site_id").references(() => sites.id),
  indentRef: text("indent_ref"),
  remarks: text("remarks"),
  status: text("status").notNull().default("finalized"), // "draft" | "finalized"
  acceptanceStatus: text("acceptance_status").notNull().default("accepted"), // "accepted" | "partial" | "rejected"
  acceptanceRemarks: text("acceptance_remarks"),
  isCancelled: boolean("is_cancelled").notNull().default(false),
  cancelledAt: timestamp("cancelled_at"),
  cancelledBy: integer("cancelled_by"),
  cancellationReason: text("cancellation_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  // PI-sourced GRN tracking (Batch 11)
  createdByUserId: integer("created_by_user_id"),     // userId who triggered auto-creation (the purchaser)
  sourcePiIndentId: integer("source_pi_indent_id"),   // links back to purchase_indents.id
  selfApprovalOverrideReason: text("self_approval_override_reason"),
  selfApprovalOverriddenBy: integer("self_approval_overridden_by"),
  selfApprovalOverriddenAt: timestamp("self_approval_overridden_at"),
}, (t) => ({
  dateIdx: index("store_grns_date_idx").on(t.date),
}));

export const storeGrnItems = pgTable("store_grn_items", {
  id: serial("id").primaryKey(),
  grnId: integer("grn_id").notNull(),
  itemId: integer("item_id"),                         // nullable for PI-sourced items matched at finalization
  qty: real("qty").notNull(),
  rate: real("rate"),
  uom: text("uom").notNull(),
  indentItemId: integer("indent_item_id"),
  // PI-sourced item tracking + item-wise acceptance (Batch 11)
  sourcePiItemId: integer("source_pi_item_id"),       // links to purchase_indent_items.id
  itemDescription: text("item_description"),          // pre-filled PI item description
  acceptedQty: real("accepted_qty"),                  // stores-confirmed accepted quantity
  rejectedQty: real("rejected_qty"),                  // stores-confirmed rejected quantity
  acceptanceNotes: text("acceptance_notes"),          // QC / rejection remarks per line
});

export const storeIssues = pgTable("store_issues", {
  id: serial("id").primaryKey(),
  issueNumber: text("issue_number").notNull().unique(),
  date: date("date").notNull(),
  issuedToSection: text("issued_to_section").notNull(), // plant, site, other
  issuedToDetail: text("issued_to_detail"),
  siteId: integer("site_id").references(() => sites.id), // nullable FK; set when issuedToSection = "site"
  purpose: text("purpose"),
  remarks: text("remarks"),
  irnId: integer("irn_id"),               // nullable FK → internal_requisitions (set when created from IRN flow)
  issuedBy: text("issued_by"),
  issuedAt: timestamp("issued_at"),
  receivedBy: text("received_by"),
  receiverDesignation: text("receiver_designation"),
  vehicleType: text("vehicle_type"),      // "vehicle" | "hand_carried"
  vehicleNo: text("vehicle_no"),
  driverName: text("driver_name"),
  movementRemarks: text("movement_remarks"),
  isCancelled: boolean("is_cancelled").notNull().default(false),
  cancelledAt: timestamp("cancelled_at"),
  cancelledBy: integer("cancelled_by"),
  cancellationReason: text("cancellation_reason"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  dateIdx: index("store_issues_date_idx").on(t.date),
}));

export const storeIssueItems = pgTable("store_issue_items", {
  id: serial("id").primaryKey(),
  issueId: integer("issue_id").notNull(),
  itemId: integer("item_id"),           // nullable — null when issued via IRN for non-store material
  materialText: text("material_text"),  // display name when itemId is null
  qty: real("qty").notNull(),
  uom: text("uom").notNull(),
});

export const insertStoreItemSchema = createInsertSchema(storeItems).omit({ id: true, createdAt: true });
export const insertStoreGrnSchema = createInsertSchema(storeGrns).omit({ id: true, createdAt: true });
export const insertStoreGrnItemSchema = createInsertSchema(storeGrnItems).omit({ id: true });
export const insertStoreIssueSchema = createInsertSchema(storeIssues).omit({ id: true, createdAt: true, issuedAt: true });
export const insertStoreIssueItemSchema = createInsertSchema(storeIssueItems).omit({ id: true });

export type StoreItem = typeof storeItems.$inferSelect;
export type InsertStoreItem = z.infer<typeof insertStoreItemSchema>;
export type StoreGrn = typeof storeGrns.$inferSelect;
export type InsertStoreGrn = z.infer<typeof insertStoreGrnSchema>;
export type StoreGrnItem = typeof storeGrnItems.$inferSelect;
export type InsertStoreGrnItem = z.infer<typeof insertStoreGrnItemSchema>;
export type StoreIssue = typeof storeIssues.$inferSelect;
export type InsertStoreIssue = z.infer<typeof insertStoreIssueSchema>;
export type StoreIssueItem = typeof storeIssueItems.$inferSelect;
export type InsertStoreIssueItem = z.infer<typeof insertStoreIssueItemSchema>;

export type StoreGrnWithItems = StoreGrn & {
  items: (StoreGrnItem & { itemName: string; category: string })[];
};
export type StoreIssueWithItems = StoreIssue & {
  items: (StoreIssueItem & { itemName: string | null; category: string | null })[];
};
export type StoreStockBalance = {
  itemId: number;
  itemName: string;
  category: string;
  uom: string;
  balance: number;
  minStockQty: number | null;
  isLowStock: boolean;
};
export type StoreLedgerEntry = {
  date: string;
  docNumber: string;
  type: "GRN" | "ISSUE";
  qty: number;
  direction: "in" | "out";
  runningBalance: number;
  counterparty: string;
  purpose?: string;
  irnId?: number | null;
  irnNo?: string | null;
};

// ============================================
// EQUIPMENT MAINTENANCE & BREAKDOWN LOGS (Task #696)
// ============================================

export const equipmentMaintenanceLogs = pgTable("equipment_maintenance_logs", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  equipmentId: integer("equipment_id").notNull(), // FK → equipment_master
  eventType: text("event_type").notNull(), // "breakdown" | "service" | "pm"
  description: text("description").notNull(),
  downtimeHours: real("downtime_hours"),
  status: text("status").notNull().default("open"), // "open" | "resolved"
  nextServiceDue: date("next_service_due"),
  servicedBy: text("serviced_by"),
  remarks: text("remarks"),
  reportedBy: text("reported_by"),
  resolvedAt: date("resolved_at"),
  autoIssueId: integer("auto_issue_id"), // FK → store_issues (auto-created)
  createdAt: timestamp("created_at").defaultNow(),
  ...cancellationFields,
}, (t) => ({
  dateIdx: index("eml_date_idx").on(t.date),
  equipmentIdx: index("eml_equipment_idx").on(t.equipmentId),
}));

export const maintenancePartsUsed = pgTable("maintenance_parts_used", {
  id: serial("id").primaryKey(),
  maintenanceLogId: integer("maintenance_log_id").notNull(),
  storeItemId: integer("store_item_id").notNull(), // FK → store_items
  qty: real("qty").notNull(),
  uom: text("uom").notNull(),
  autoIssueItemId: integer("auto_issue_item_id"), // FK → store_issue_items
});

export const insertEquipmentMaintenanceLogSchema = createInsertSchema(equipmentMaintenanceLogs).omit({ id: true, createdAt: true, autoIssueId: true });
export const insertMaintenancePartUsedSchema = createInsertSchema(maintenancePartsUsed).omit({ id: true, autoIssueItemId: true, maintenanceLogId: true });

export type EquipmentMaintenanceLog = typeof equipmentMaintenanceLogs.$inferSelect;
export type InsertEquipmentMaintenanceLog = z.infer<typeof insertEquipmentMaintenanceLogSchema>;
export type MaintenancePartUsed = typeof maintenancePartsUsed.$inferSelect;
export type InsertMaintenancePartUsed = z.infer<typeof insertMaintenancePartUsedSchema>;

export type EquipmentMaintenanceLogWithDetails = EquipmentMaintenanceLog & {
  equipmentName: string;
  parts: (MaintenancePartUsed & { itemName: string; category: string })[];
  autoIssueNumber?: string | null;
};

export type EquipmentHealthSummary = {
  equipmentId: number;
  equipmentName: string;
  registrationNumber: string | null;
  lastServiceDate: string | null;
  nextServiceDue: string | null;
  openBreakdowns: number;
  downtimeHoursThisMonth: number;
  totalMaintenanceEvents: number;
};

// ============================================
// RMC PLANT MODULE (Task #697)
// ============================================

export const rmcMixDesigns = pgTable("rmc_mix_designs", {
  id: serial("id").primaryKey(),
  grade: text("grade").notNull(), // M15, M20, M25, M30, M35, M40, M45, M50
  plantName: text("plant_name").notNull().default("Main Plant"),
  cementContent: real("cement_content"), // kg/m³
  wcr: real("wcr"), // water-cement ratio
  admixtureName: text("admixture_name"),
  admixtureDosage: real("admixture_dosage"), // % of cement weight
  targetStrength: real("target_strength"), // MPa (characteristic compressive strength)
  componentProportions: jsonb("component_proportions"), // { cement, fineAgg, coarseAgg10, coarseAgg20 } in kg/m³
  notes: text("notes"),
  isActive: integer("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

export const rmcBatchRecords = pgTable("rmc_batch_records", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  plantName: text("plant_name").notNull().default("Main Plant"),
  mixDesignId: integer("mix_design_id").notNull(),
  batchesCount: integer("batches_count"),
  totalVolumeM3: real("total_volume_m3").notNull(),
  truckNumber: text("truck_number"),
  dcNumber: text("dc_number"),
  customerName: text("customer_name"),
  deliverySite: text("delivery_site"),
  remarks: text("remarks"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  dateIdx: index("rmc_batch_records_date_idx").on(t.date),
}));

export const rmcCubeTests = pgTable("rmc_cube_tests", {
  id: serial("id").primaryKey(),
  batchRecordId: integer("batch_record_id").notNull(),
  sampleId: text("sample_id").notNull(),
  ageDays: integer("age_days").notNull(), // 3, 7, 14, 28
  testDate: date("test_date").notNull(),
  strengthMpa: real("strength_mpa").notNull(),
  targetStrength: real("target_strength"),
  passFail: text("pass_fail"), // "pass" | "fail"
  remarks: text("remarks"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const rmcRawMaterialReceipts = pgTable("rmc_raw_material_receipts", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  plantName: text("plant_name").notNull().default("Main Plant"),
  materialName: text("material_name").notNull(),
  category: text("category"), // Cement, Fine Aggregate, Coarse Aggregate, Admixture, Water
  qty: real("qty").notNull(),
  uom: text("uom").notNull(),
  supplier: text("supplier"),
  vehicleNumber: text("vehicle_number"),
  challanNumber: text("challan_number"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  dateIdx: index("rmc_raw_materials_date_idx").on(t.date),
}));

export const insertRmcMixDesignSchema = createInsertSchema(rmcMixDesigns).omit({ id: true, createdAt: true });
export const insertRmcBatchRecordSchema = createInsertSchema(rmcBatchRecords).omit({ id: true, createdAt: true });
export const insertRmcCubeTestSchema = createInsertSchema(rmcCubeTests).omit({ id: true, createdAt: true });
export const insertRmcRawMaterialReceiptSchema = createInsertSchema(rmcRawMaterialReceipts).omit({ id: true, createdAt: true });

export type RmcMixDesign = typeof rmcMixDesigns.$inferSelect;
export type InsertRmcMixDesign = z.infer<typeof insertRmcMixDesignSchema>;
export type RmcBatchRecord = typeof rmcBatchRecords.$inferSelect;
export type InsertRmcBatchRecord = z.infer<typeof insertRmcBatchRecordSchema>;
export type RmcCubeTest = typeof rmcCubeTests.$inferSelect;
export type InsertRmcCubeTest = z.infer<typeof insertRmcCubeTestSchema>;
export type RmcRawMaterialReceipt = typeof rmcRawMaterialReceipts.$inferSelect;
export type InsertRmcRawMaterialReceipt = z.infer<typeof insertRmcRawMaterialReceiptSchema>;

export type RmcBatchRecordWithDesign = RmcBatchRecord & {
  grade: string;
  targetStrength: number | null;
};

// ============================================
// PLANNING MASTERS (Work Programme — separate from operational Equipment Master)
// ============================================

export const planningEquipmentTypes = pgTable("planning_equipment_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull().default("General"),
  standardOutputs: jsonb("standard_outputs").$type<Array<{ unit: string; outputPerHr: number }>>(),
  consumptionNorm: real("consumption_norm"), // fuel liters per hour
  fuelType: text("fuel_type"),               // "Diesel" | "LDO" | "Petrol" | "Electric" | "None"
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const planningLabourTypes = pgTable("planning_labour_types", {
  id: serial("id").primaryKey(),
  designation: text("designation").notNull(),
  skillTier: text("skill_tier").notNull().default("Skilled"),
  standardOutputs: jsonb("standard_outputs").$type<Array<{ unit: string; outputPerDay: number }>>(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================
// WORK PROGRAM & BOQ CONTROL
// ============================================

export const boqProjects = pgTable("boq_projects", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").references(() => sites.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  contractNo: text("contract_no"),
  client: text("client"),
  contractor: text("contractor"),
  roadLengthKm: real("road_length_km"),
  startDate: date("start_date"),
  totalMonths: integer("total_months"),
  status: text("status").notNull().default("draft"), // draft | active | closed
  createdBy: text("created_by"),
  // Planning calendar parameters
  workingDaysPerMonth: integer("working_days_per_month").default(26),
  workingHoursPerDay: integer("working_hours_per_day").default(8),
  // Location anchors for bar-aware haul distance (Task #1100)
  hmpChainageKm: real("hmp_chainage_km"),
  wmmPlantChainageKm: real("wmm_plant_chainage_km"),
  quarryChainageKm: real("quarry_chainage_km"),
  avgTipperSpeedKmHr: real("avg_tipper_speed_km_hr").default(30),
  // Actual project chainage range (e.g. 182.120 to 227.600 km on NH-167)
  chainageFrom: real("chainage_from"),
  chainageTo: real("chainage_to"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const boqCategories = pgTable("boq_categories", {
  id: serial("id").primaryKey(),
  boqProjectId: integer("boq_project_id").notNull().references(() => boqProjects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const boqItems = pgTable("boq_items", {
  id: serial("id").primaryKey(),
  boqProjectId: integer("boq_project_id").notNull().references(() => boqProjects.id, { onDelete: "cascade" }),
  categoryId: integer("category_id").references(() => boqCategories.id, { onDelete: "set null" }),
  itemCode: text("item_code"),
  description: text("description").notNull(),
  unit: text("unit").notNull(),
  canonicalUnit: text("canonical_unit"),           // normalised unit for logic & display (backfilled by startup migration)
  boqQty: real("boq_qty").notNull().default(0),   // original contract quantity — never overwritten
  currentQty: real("current_qty").notNull().default(0), // updated when a revision is activated
  clientRate: real("client_rate"),
  clientAmount: real("client_amount"),
  sortOrder: integer("sort_order").notNull().default(0),
  workCategory: text("work_category"),
  itemName: text("item_name"),
  mappingStatus: text("mapping_status").notNull().default("unmapped"),
  // Explicit SDB/SNL norm code supplied in the BOQ import (e.g. "5.05").
  // Used for deterministic SNL mapping — bypasses fuzzy description matching.
  snlCode: text("snl_code"),
  // Layer config for auto material derivation (Task #1100)
  layerConfig: jsonb("layer_config"),
  // Multiplier applied to DPR progress entry quantities when summing actuals
  // for Plan vs Actual. Use when the DPR field unit differs from the BOQ unit
  // (e.g., DPR in SQM but BOQ in Hectares → factor = 0.0001). Null = 1.0.
  dprConversionFactor: real("dpr_conversion_factor"),
  // When false, the item is excluded from Gantt, BOM, and auto-build-recipes.
  // Remains in the full BOQ for billing. Default true (all items planned).
  includedInPlanning: boolean("included_in_planning").notNull().default(true),
  // Planning distribution mode. 'road' = linear (qty ∝ chainage length, default).
  // 'structure' = point-location (qty entered directly per bar; chainage used for
  // scheduling only). Auto-detected from description keywords at import time.
  planningWorkType: text("planning_work_type").notNull().default("road"),
  // Row number from the BOQ Excel import; stored for exact P1 matching in
  // structure schedule import (boq_excel_row + item_code + boq_sub_item).
  excelRow: integer("excel_row"),
  // True when auto-mapper detected multiple distinct material layers in the description.
  // Composite items are mapped per-component via snl_composite_components.
  isComposite: boolean("is_composite").notNull().default(false),
  // Short work name override (admin-editable). Falls back to shortItemName(description) when null.
  displayName: text("display_name"),
  // How DPR progress quantity is measured: formula-driven (CUM_LWT, SQM_LW, RMT_L) or manual (MT_manual, NOS_manual, LS_manual).
  dprMeasurementMethod: text("dpr_measurement_method"),
  // Exclude from DPR item picker when false.
  includeInDpr: boolean("include_in_dpr").notNull().default(true),
  // Exclude from procurement demand when false.
  includeInProcurement: boolean("include_in_procurement").notNull().default(true),
  // Flagged for admin review — shown in "Needs Mapping" group in DPR picker,
  // skipped from auto-sequence until reviewed.
  needsReview: boolean("needs_review").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  projectIdx: index("boq_items_project_idx").on(t.boqProjectId),
}));

export const boqRevisions = pgTable("boq_revisions", {
  id: serial("id").primaryKey(),
  boqProjectId: integer("boq_project_id").notNull().references(() => boqProjects.id, { onDelete: "cascade" }),
  revisionNo: integer("revision_no").notNull(),
  label: text("label").notNull(),
  status: text("status").notNull().default("draft"), // draft | active | superseded
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
});

export const boqRevisionItems = pgTable("boq_revision_items", {
  id: serial("id").primaryKey(),
  revisionId: integer("revision_id").notNull().references(() => boqRevisions.id, { onDelete: "cascade" }),
  boqItemId: integer("boq_item_id").notNull().references(() => boqItems.id, { onDelete: "cascade" }),
  revisedQty: real("revised_qty").notNull(),
  changeReason: text("change_reason").notNull(),
});

export const workProgramBars = pgTable("work_program_bars", {
  id: serial("id").primaryKey(),
  boqProjectId: integer("boq_project_id").notNull().references(() => boqProjects.id, { onDelete: "cascade" }),
  boqItemId: integer("boq_item_id").notNull().references(() => boqItems.id, { onDelete: "cascade" }),
  reachLabel: text("reach_label"),
  chainageFrom: real("chainage_from"),
  chainageTo: real("chainage_to"),
  startMonth: real("start_month").notNull(),   // fractional, e.g. 1.5
  endMonth: real("end_month").notNull(),        // fractional
  startDate: date("start_date"),               // real calendar date (nullable; derived from startMonth + projectStartDate)
  endDate: date("end_date"),                   // real calendar date (nullable)
  durationMode: text("duration_mode").default("auto"), // 'auto' | 'fixed'
  plannedQty: real("planned_qty").notNull().default(0),
  isQtyOverride: boolean("is_qty_override").default(false),
  isDurationOverride: boolean("is_duration_override").default(false),
  notes: text("notes"),
  // "auto-sequence" = created by the auto-sequencer; "manual" = hand-placed. Used for non-destructive reruns.
  source: text("source").default("manual"),
  // ── Planning mode (Task #1240 — additive, non-breaking) ────────────────────
  // Historically this column only ever stored null | "structure_location".
  // It is being expanded (additively, no reclassification of existing rows)
  // to describe how a bar/item entered the programme:
  //   - null                          → legacy/road bars (treated as "road_reach")
  //   - "structure_location"          → imported via Structure Schedule Import wizard
  //   - "road_reach"                  → road-style chainage stretch (new explicit value)
  //   - "imported_schedule"           → imported from an external schedule/CSV, not structure wizard
  //   - "manual_planning"             → hand-placed bar with a custom label
  //   - "not_plannable_without_input" → BOQ item that could not be auto-planned (needs user input)
  // Existing rows are NEVER rewritten by this expansion — `derivePlanningMode()`
  // in shared/planningEngine.ts computes the *effective* mode for display when
  // the stored value is null, so old data keeps working unchanged.
  planningMode: text("planning_mode"),               // null | one of PLANNING_MODES (see below)
  structureId: text("structure_id"),                 // e.g. "Bridge at Km 195.400"
  structureLocType: text("structure_loc_type"),      // bridge | culvert | retaining_wall | …
  structureChainageKm: real("structure_chainage_km"), // absolute chainage (km)
  relativeChainageKm: real("relative_chainage_km"),  // chainage relative to project chainageFrom
  durationDays: integer("duration_days"),            // planned duration in working days (stored for traceability)
  boqSubItem: text("boq_sub_item"),                  // sub-item code from Excel (e.g. "2.1a")
  boqExcelRow: integer("boq_excel_row"),             // original Excel row for traceability
  // ── Structure auto-sequencing (imported structure quantities scheduled by the app) ──
  stage: text("stage"),                              // construction stage key, e.g. "excavation" | "pcc" | "rcc_foundation" | …
  sequenceOrder: integer("sequence_order"),          // order of this bar within its structureId group
  durationSource: text("duration_source"),           // 'imported' | 'productivity' | 'default' — how duration was derived
  needsReview: boolean("needs_review").default(false), // true when a default (non-productivity) duration was used
  scheduled: boolean("scheduled").default(true),     // false = imported without a valid date, not yet placed on the programme
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  projectIdx: index("work_program_bars_project_idx").on(t.boqProjectId),
  itemIdx: index("work_program_bars_item_idx").on(t.boqItemId),
}));

// ─── BOQ Item Recipe Tables (for BOM & Duration calculations) ──────────────

// Equipment deployed per BOQ work item — drives auto-duration + equipment demand
export const boqItemEquipment = pgTable("boq_item_equipment", {
  id: serial("id").primaryKey(),
  boqItemId: integer("boq_item_id").notNull().references(() => boqItems.id, { onDelete: "cascade" }),
  equipmentName: text("equipment_name").notNull(),             // display name
  equipmentMasterId: integer("equipment_master_id").references(() => equipmentMaster.id, { onDelete: "set null" }),
  planningEquipmentTypeId: integer("planning_equipment_type_id").references(() => planningEquipmentTypes.id, { onDelete: "set null" }),
  qtyPerBoqUnit: real("qty_per_boq_unit").notNull().default(0), // hours per 1 BOQ unit
  count: real("count").notNull().default(1),                   // machines deployed simultaneously
  sortOrder: integer("sort_order").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  itemIdx: index("boq_item_equipment_item_idx").on(t.boqItemId),
}));

// Labour deployed per BOQ work item — drives labour demand
export const boqItemLabour = pgTable("boq_item_labour", {
  id: serial("id").primaryKey(),
  boqItemId: integer("boq_item_id").notNull().references(() => boqItems.id, { onDelete: "cascade" }),
  planningLabourTypeId: integer("planning_labour_type_id").references(() => planningLabourTypes.id, { onDelete: "set null" }),
  designation: text("designation").notNull(),                  // e.g. "Skilled Labour", "Mason"
  qtyPerBoqUnit: real("qty_per_boq_unit").notNull().default(0), // days per 1 BOQ unit
  count: real("count").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  itemIdx: index("boq_item_labour_item_idx").on(t.boqItemId),
}));

// Material recipe per BOQ work item — drives BOM quantities
export const boqItemMaterials = pgTable("boq_item_materials", {
  id: serial("id").primaryKey(),
  boqItemId: integer("boq_item_id").notNull().references(() => boqItems.id, { onDelete: "cascade" }),
  materialName: text("material_name").notNull(),               // e.g. "20mm Aggregate", "Bitumen VG30"
  uom: text("uom"),                                            // "MT", "KL", "CUM" (nullable)
  qtyPerBoqUnit: real("qty_per_boq_unit").notNull().default(0), // qty per 1 BOQ unit
  wastagePct: real("wastage_pct").notNull().default(0),        // wastage %
  isClientSupplied: boolean("is_client_supplied").default(false),
  isAuto: boolean("is_auto").default(false),                   // true = derived from layerConfig
  notes: text("notes"),
  applicationNote: text("application_note"),                   // e.g. "Dilute 1:1 before spraying"
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  itemIdx: index("boq_item_materials_item_idx").on(t.boqItemId),
}));

// ─── BOQ Program Settings (per-project planning configuration) ────────────────
export const boqProgramSettings = pgTable("boq_program_settings", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => boqProjects.id, { onDelete: "cascade" }).unique(),
  // Schedule
  workingDaysPerMonth: integer("working_days_per_month").notNull().default(25),
  shiftHours: real("shift_hours").notNull().default(8),
  doubleShift: boolean("double_shift").notNull().default(false),
  // Tipper fleet defaults
  tipperCapacityT: real("tipper_capacity_t").notNull().default(8),
  avgTipperSpeedKmHr: real("avg_tipper_speed_km_hr").notNull().default(30),
  loadTimeMin: real("load_time_min").notNull().default(5),
  unloadTimeMin: real("unload_time_min").notNull().default(5),
  // Source chainages (legacy — kept for backward compat, superseded by lead distance fields below)
  hmpChainageKm: real("hmp_chainage_km"),
  wmmPlantChainageKm: real("wmm_plant_chainage_km"),
  quarryChainageKm: real("quarry_chainage_km"),
  borrowChainageKm: real("borrow_chainage_km"),
  disposalChainageKm: real("disposal_chainage_km"),
  rmcChainageKm: real("rmc_chainage_km"),
  // Lead & source distances (directional point-to-point, feeds tipper demand)
  hmpToSiteKm: real("hmp_to_site_km"),
  wmmPlantToSiteKm: real("wmm_plant_to_site_km"),
  quarryToSiteKm: real("quarry_to_site_km"),
  quarryToHmpKm: real("quarry_to_hmp_km"),
  quarryToRmcKm: real("quarry_to_rmc_km"),
  rmcToSiteKm: real("rmc_to_site_km"),
  borrowToSiteKm: real("borrow_to_site_km"),
  disposalDistanceKm: real("disposal_distance_km"),
  // Project start date — sets the calendar date for Month 1 in the Work Programme Gantt
  projectStartDate: date("project_start_date"),
  // Productivity mode: snl = SNL/standard norms, company = company norms, project = per-item overrides
  productivityMode: text("productivity_mode").notNull().default("snl"),
  productivityOverrides: jsonb("productivity_overrides"),
  // Auto-sequence options: { fronts?: number; staggerMonths?: number; lagMonths?: number }
  sequenceOptions: jsonb("sequence_options"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── BOQ Mix Template Links ────────────────────────────────────────────────────
// Per-project mapping: standard mix type (BC/DBM/WMM/SDBC/GSB/M20/M25/M30/M35/RMC/EG)
// → plant mix template. The planning engine uses this to resolve which mix template
// supplies a given layer type when computing material demand and production capacity.
export const boqMixTemplateLinks = pgTable("boq_mix_template_links", {
  id: serial("id").primaryKey(),
  boqProjectId: integer("boq_project_id").notNull().references(() => boqProjects.id, { onDelete: "cascade" }),
  mixType: text("mix_type").notNull(),
  mixTemplateId: integer("mix_template_id"),
  mixTemplateName: text("mix_template_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Planning masters insert schemas
export const insertPlanningEquipmentTypeSchema = createInsertSchema(planningEquipmentTypes).omit({ id: true, createdAt: true });
export const insertPlanningLabourTypeSchema = createInsertSchema(planningLabourTypes).omit({ id: true, createdAt: true });

// Insert schemas
export const insertBoqProjectSchema = createInsertSchema(boqProjects).omit({ id: true, createdAt: true });
export const insertBoqCategorySchema = createInsertSchema(boqCategories).omit({ id: true });
export const insertBoqItemSchema = createInsertSchema(boqItems).omit({ id: true, createdAt: true });
export const insertBoqRevisionSchema = createInsertSchema(boqRevisions).omit({ id: true, createdAt: true, approvedAt: true });
export const insertBoqRevisionItemSchema = createInsertSchema(boqRevisionItems).omit({ id: true });
export const insertWorkProgramBarSchema = createInsertSchema(workProgramBars).omit({ id: true, createdAt: true });
export const insertBoqItemEquipmentSchema = createInsertSchema(boqItemEquipment).omit({ id: true, createdAt: true });
export const insertBoqItemLabourSchema = createInsertSchema(boqItemLabour).omit({ id: true, createdAt: true });
export const insertBoqItemMaterialsSchema = createInsertSchema(boqItemMaterials).omit({ id: true, createdAt: true });

// Planning master types
export type PlanningEquipmentType = typeof planningEquipmentTypes.$inferSelect;
export type InsertPlanningEquipmentType = z.infer<typeof insertPlanningEquipmentTypeSchema>;
export type PlanningLabourType = typeof planningLabourTypes.$inferSelect;
export type InsertPlanningLabourType = z.infer<typeof insertPlanningLabourTypeSchema>;

// Types
export type BoqProject = typeof boqProjects.$inferSelect;
export type InsertBoqProject = z.infer<typeof insertBoqProjectSchema>;
export type BoqCategory = typeof boqCategories.$inferSelect;
export type InsertBoqCategory = z.infer<typeof insertBoqCategorySchema>;
export type BoqItem = typeof boqItems.$inferSelect;
export type InsertBoqItem = z.infer<typeof insertBoqItemSchema>;
export type BoqRevision = typeof boqRevisions.$inferSelect;
export type InsertBoqRevision = z.infer<typeof insertBoqRevisionSchema>;
export type BoqRevisionItem = typeof boqRevisionItems.$inferSelect;
export type InsertBoqRevisionItem = z.infer<typeof insertBoqRevisionItemSchema>;
export type WorkProgramBar = typeof workProgramBars.$inferSelect;
export type InsertWorkProgramBar = z.infer<typeof insertWorkProgramBarSchema>;

// Task #1240 — additive expansion of the planning_mode vocabulary. Existing
// stored values (null | "structure_location") remain valid; the new values
// are only ever *derived* for display (see derivePlanningMode in
// shared/planningEngine.ts) or written on newly created bars going forward.
export const PLANNING_MODES = [
  "road_reach",
  "structure_location",
  "imported_schedule",
  "manual_planning",
  "not_plannable_without_input",
] as const;
export type PlanningMode = typeof PLANNING_MODES[number];
export type BoqItemEquipmentRow = typeof boqItemEquipment.$inferSelect;
export type InsertBoqItemEquipment = z.infer<typeof insertBoqItemEquipmentSchema>;
export type BoqItemLabourRow = typeof boqItemLabour.$inferSelect;
export type InsertBoqItemLabour = z.infer<typeof insertBoqItemLabourSchema>;
export type BoqItemMaterialsRow = typeof boqItemMaterials.$inferSelect;
export type InsertBoqItemMaterials = z.infer<typeof insertBoqItemMaterialsSchema>;
export type BoqProgramSettings = typeof boqProgramSettings.$inferSelect;
export const insertBoqProgramSettingsSchema = createInsertSchema(boqProgramSettings).omit({ id: true, updatedAt: true });
export type InsertBoqProgramSettings = z.infer<typeof insertBoqProgramSettingsSchema>;
export type BoqMixTemplateLink = typeof boqMixTemplateLinks.$inferSelect;
export const insertBoqMixTemplateLinkSchema = createInsertSchema(boqMixTemplateLinks).omit({ id: true, createdAt: true });
export type InsertBoqMixTemplateLink = z.infer<typeof insertBoqMixTemplateLinkSchema>;

// Composite types for API responses
export type BoqItemWithCategory = BoqItem & { categoryName: string | null; workCategory: string | null; canonicalUnit?: string | null; snlMappingStatus?: string | null; snlItemId?: number | null; snlItemCode?: string | null; snlConfidence?: number | null; snlItemDescription?: string | null; isComposite?: boolean | null };
export type BoqRevisionWithItems = BoqRevision & { items: (BoqRevisionItem & { description: string; unit: string })[] };
export type BoqProjectWithCounts = BoqProject & { siteName: string | null; itemCount: number; activeRevision: string | null; barCount: number };
export type WorkProgramBarWithItem = WorkProgramBar & {
  itemCode: string | null;
  description: string;
  unit: string;
  categoryName: string | null;
  categoryId: number | null;
  sortOrder: number;
};

// Full BOQ item with all recipe data for planning
export type BoqItemEquipmentWithMaster = BoqItemEquipmentRow & {
  outputUnit: string | null;
  outputTheoretical: number | null;
  outputEfficiency: number | null;
  standardOutputs: unknown;
  consumptionNorm: number | null;
  fuelType: string | null;
};
export type BoqItemWithRecipes = BoqItemWithCategory & {
  equipment: BoqItemEquipmentWithMaster[];
  labour: BoqItemLabourRow[];
  materials: BoqItemMaterialsRow[];
};
export type MonthlyTarget = {
  boqItemId: number;
  itemCode: string | null;
  description: string;
  unit: string;
  categoryName: string | null;
  month: number;
  plannedQty: number;
};
export type PlanVsActualRow = {
  boqItemId: number;
  itemCode: string | null;
  description: string;
  unit: string;
  categoryName: string | null;
  currentQty: number;
  totalPlanned: number;
  totalActual: number;
  percentComplete: number;
  lastActivityDate: string | null;
  clientRate: number | null;
  boqAmount: number;       // clientRate × currentQty
  plannedAmount: number;   // clientRate × totalPlanned (to date)
  actualAmount: number;    // clientRate × totalActual (to date)
};

// ============================================
// STANDARD NORMS LIBRARY (SNL)
// Universal multi-source norms engine.
// MoRTH SDB is the first seeded source.
// Supports CPWD DSR, State SSR, Irrigation,
// Electrical, Buildings, company-specific norms.
// ============================================

export const snlSources = pgTable("snl_sources", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  authority: text("authority").notNull(),
  department: text("department"),
  year: integer("year"),
  version: text("version"),
  country: text("country").default("India"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const snlItems = pgTable("snl_items", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id").notNull().references(() => snlSources.id, { onDelete: "cascade" }),
  volume: text("volume"),
  chapterNo: text("chapter_no"),
  chapterTitle: text("chapter_title"),
  itemCode: text("item_code").notNull(),
  description: text("description").notNull(),
  shortLabel: text("short_label"),
  unit: text("unit").notNull(),
  workCategory: text("work_category").notNull(),
  workSubCategory: text("work_sub_category"),
  sector: text("sector"),
  sourcePage: text("source_page"),
  specClause: text("spec_clause"),
  isMixSpecific: boolean("is_mix_specific").notNull().default(false),
  hasGradingVariants: boolean("has_grading_variants").notNull().default(false),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  sourceItemIdx: uniqueIndex("snl_items_source_code_idx").on(t.sourceId, t.itemCode),
  categoryIdx: index("snl_items_category_idx").on(t.workCategory),
}));

export const snlItemProductivity = pgTable("snl_item_productivity", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => snlItems.id, { onDelete: "cascade" }),
  projectCategory: text("project_category").notNull().default("ALL"),
  shiftOutput: real("shift_output").notNull(),
  shiftHours: real("shift_hours").notNull().default(8),
  outputUnit: text("output_unit").notNull(),
  derivedPerHour: real("derived_per_hour"),
  notes: text("notes"),
}, (t) => ({
  itemCatIdx: uniqueIndex("snl_productivity_item_cat_idx").on(t.itemId, t.projectCategory),
}));

export const snlItemEquipment = pgTable("snl_item_equipment", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => snlItems.id, { onDelete: "cascade" }),
  projectCategory: text("project_category").notNull().default("ALL"),
  sortOrder: integer("sort_order").notNull().default(0),
  equipmentType: text("equipment_type").notNull(),
  equipmentSpec: text("equipment_spec"),
  purpose: text("purpose"),
  unit: text("unit").notNull().default("hrs"),
  quantityPerShift: real("quantity_per_shift"),
  formulaType: text("formula_type").notNull().default("FIXED"),
  formulaExpr: text("formula_expr"),
  shiftOutputRef: real("shift_output_ref").notNull(),
  derivedPerUnit: real("derived_per_unit"),
  notes: text("notes"),
});

export const snlItemLabour = pgTable("snl_item_labour", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => snlItems.id, { onDelete: "cascade" }),
  projectCategory: text("project_category").notNull().default("ALL"),
  sortOrder: integer("sort_order").notNull().default(0),
  designation: text("designation").notNull(),
  skillTier: text("skill_tier").notNull().default("UNSKILLED"),
  unit: text("unit").notNull().default("day"),
  quantityPerShift: real("quantity_per_shift").notNull(),
  shiftOutputRef: real("shift_output_ref").notNull(),
  derivedPerUnit: real("derived_per_unit"),
});

export const snlItemMaterials = pgTable("snl_item_materials", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => snlItems.id, { onDelete: "cascade" }),
  projectCategory: text("project_category").notNull().default("ALL"),
  gradingVariant: text("grading_variant"),
  sortOrder: integer("sort_order").notNull().default(0),
  materialName: text("material_name").notNull(),
  materialCategory: text("material_category").notNull().default("OTHER"),
  sieveFromMm: real("sieve_from_mm"),
  sieveToMm: real("sieve_to_mm"),
  pctByWeight: real("pct_by_weight"),
  unit: text("unit").notNull(),
  quantityPerShift: real("quantity_per_shift").notNull(),
  shiftOutputRef: real("shift_output_ref").notNull(),
  derivedPerUnit: real("derived_per_unit"),
  isDesignSpecific: boolean("is_design_specific").notNull().default(false),
  notes: text("notes"),
});

export const snlBoqMappings = pgTable("snl_boq_mappings", {
  id: serial("id").primaryKey(),
  boqItemId: integer("boq_item_id").notNull().unique().references(() => boqItems.id, { onDelete: "cascade" }),
  snlItemId: integer("snl_item_id").notNull().references(() => snlItems.id, { onDelete: "restrict" }),
  projectCategory: text("project_category").notNull().default("MEDIUM"),
  gradingVariant: text("grading_variant"),
  mappedBy: text("mapped_by"),
  mappedAt: timestamp("mapped_at").defaultNow(),
  isAutoMapped: boolean("is_auto_mapped").notNull().default(false),
  confidenceScore: real("confidence_score"),
  notes: text("notes"),
});

// Per-component SNL mapping rows for composite BOQ items.
// A composite item (isComposite=true) maps each detected layer/material to its own SNL norm.
// Recipes are merged from all confirmed components when the BOQ item reaches "mapped" status.
export const snlCompositeComponents = pgTable("snl_composite_components", {
  id: serial("id").primaryKey(),
  boqItemId: integer("boq_item_id").notNull().references(() => boqItems.id, { onDelete: "cascade" }),
  componentIndex: integer("component_index").notNull().default(0),
  componentTag: text("component_tag").notNull(),          // BC, PRIME_COAT, PCC_M15, etc.
  componentDescription: text("component_description").notNull(), // extracted phrase
  snlItemId: integer("snl_item_id").references(() => snlItems.id, { onDelete: "set null" }),
  confidenceScore: real("confidence_score"),
  status: text("status").notNull().default("unmapped"),   // unmapped | needs_review | mapped
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  boqItemIdx: index("snl_composite_boq_item_idx").on(t.boqItemId),
}));
export type SnlCompositeComponent = typeof snlCompositeComponents.$inferSelect;
export const insertSnlCompositeComponentSchema = createInsertSchema(snlCompositeComponents).omit({ id: true, createdAt: true });

export const snlMixOverrides = pgTable("snl_mix_overrides", {
  id: serial("id").primaryKey(),
  boqProjectId: integer("boq_project_id").notNull().references(() => boqProjects.id, { onDelete: "cascade" }),
  boqItemId: integer("boq_item_id").notNull().references(() => boqItems.id, { onDelete: "cascade" }),
  overrideLabel: text("override_label").notNull(),
  overrideReason: text("override_reason"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  isActive: boolean("is_active").notNull().default(true),
});

export const snlMixOverrideMaterials = pgTable("snl_mix_override_materials", {
  id: serial("id").primaryKey(),
  overrideId: integer("override_id").notNull().references(() => snlMixOverrides.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  materialName: text("material_name").notNull(),
  materialCategory: text("material_category").notNull().default("OTHER"),
  unit: text("unit").notNull(),
  derivedPerUnit: real("derived_per_unit").notNull(),
  notes: text("notes"),
});

export const snlImportLog = pgTable("snl_import_log", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id").notNull().references(() => snlSources.id, { onDelete: "cascade" }),
  importedBy: text("imported_by"),
  importedAt: timestamp("imported_at").defaultNow(),
  itemCount: integer("item_count").notNull().default(0),
  method: text("method").notNull().default("MANUAL"),
  notes: text("notes"),
});

// SNL insert schemas
export const insertSnlSourceSchema = createInsertSchema(snlSources).omit({ id: true, createdAt: true });
export const insertSnlItemSchema = createInsertSchema(snlItems).omit({ id: true, createdAt: true });
export const insertSnlItemProductivitySchema = createInsertSchema(snlItemProductivity).omit({ id: true });
export const insertSnlItemEquipmentSchema = createInsertSchema(snlItemEquipment).omit({ id: true });
export const insertSnlItemLabourSchema = createInsertSchema(snlItemLabour).omit({ id: true });
export const insertSnlItemMaterialsSchema = createInsertSchema(snlItemMaterials).omit({ id: true });
export const insertSnlBoqMappingSchema = createInsertSchema(snlBoqMappings).omit({ id: true, mappedAt: true });
export const insertSnlMixOverrideSchema = createInsertSchema(snlMixOverrides).omit({ id: true, createdAt: true });
export const insertSnlMixOverrideMaterialsSchema = createInsertSchema(snlMixOverrideMaterials).omit({ id: true });

// SNL types
export type SnlSource = typeof snlSources.$inferSelect;
export type InsertSnlSource = z.infer<typeof insertSnlSourceSchema>;
export type SnlItem = typeof snlItems.$inferSelect;
export type InsertSnlItem = z.infer<typeof insertSnlItemSchema>;
export type SnlItemProductivity = typeof snlItemProductivity.$inferSelect;
export type SnlItemEquipment = typeof snlItemEquipment.$inferSelect;
export type SnlItemLabour = typeof snlItemLabour.$inferSelect;
export type SnlItemMaterials = typeof snlItemMaterials.$inferSelect;
export type SnlBoqMapping = typeof snlBoqMappings.$inferSelect;
export type SnlMixOverride = typeof snlMixOverrides.$inferSelect;

// Composite SNL types for API
export type SnlItemFull = SnlItem & {
  source: Pick<SnlSource, "code" | "name" | "authority" | "year">;
  productivity: SnlItemProductivity[];
  equipment: SnlItemEquipment[];
  labour: SnlItemLabour[];
  materials: SnlItemMaterials[];
};
export type SnlSourceWithCounts = SnlSource & { itemCount: number };
export type SnlSearchResult = Pick<SnlItem, "id" | "itemCode" | "shortLabel" | "description" | "unit" | "workCategory" | "isMixSpecific" | "hasGradingVariants"> & {
  sourceName: string;
  sourceCode: string;
  sector?: string | null;
  categoryMatchStatus?: "match" | "secondary" | "mismatch" | "unknown";
  shiftOutput: number | null;
  outputUnit: string | null;
};

// ============================================
// REUSABLE ATTACHMENT SYSTEM
// ============================================
// Single generic table for all file attachments across modules (DPR photos,
// material receipt/challan photos, equipment breakdown/maintenance evidence,
// etc). Do not create per-module upload tables — extend moduleType instead.
export const attachmentModuleTypes = [
  "dpr_progress",
  "dpr_material",
  "material_receipt",
  "site_purchase",
  "irn",
  "pi",
  "pi_purchaser_action",
  "store_grn",
  "vendor_bill",
  "plant_production",
  "hmp_rmc_stock_receipt",
  "site_material_trip",
  "equipment_breakdown",
  "equipment_maintenance",
  "equipment_fuel_proof",
  "quality_test",
] as const;
export type AttachmentModuleType = typeof attachmentModuleTypes[number];

export const attachments = pgTable("attachments", {
  id: serial("id").primaryKey(),
  moduleType: text("module_type").notNull(),
  linkedRecordId: integer("linked_record_id").notNull(),
  siteId: integer("site_id").references(() => sites.id, { onDelete: "set null" }),
  boqProjectId: integer("boq_project_id").references(() => boqProjects.id, { onDelete: "set null" }),
  boqItemId: integer("boq_item_id"),
  structureId: text("structure_id"),
  equipmentId: integer("equipment_id"),
  materialId: integer("material_id"),
  fileName: text("file_name").notNull(),
  objectPath: text("object_path").notNull(),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  caption: text("caption"),
  docType: text("doc_type"), // "challan" | "dc" | "invoice" | "bill" | "receipt" | "photo" | "other" — used for missing-document indicators in the Draft/Pending Document workflow
  uploadedBy: integer("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const insertAttachmentSchema = createInsertSchema(attachments).omit({
  id: true,
  uploadedAt: true,
});
export type Attachment = typeof attachments.$inferSelect & { uploadedByName?: string | null };
export type InsertAttachment = z.infer<typeof insertAttachmentSchema>;

// ============================================
// EDIT PERMISSION REQUEST SYSTEM
// When a record is finalized/submitted/locked, a non-admin user can request
// a one-time edit window. A higher-level approver (Manager/Admin/Owner —
// never the requester themselves) approves or denies via the in-app
// notification system. If approved the requester gets 2 hours to make one
// edit; the permission is then marked "used" or expires automatically.
// ============================================

export const EDIT_PERMISSION_RECORD_TYPES = [
  "dpr",
  "plant_shift_log",
  "heating_session",
  "material_receipt",
  "site_material_trip",
  "site_purchase",
  "store_grn",
  "diesel_requirement",
  "purchase_indent",
  "truck_dispatch",
  "equipment_usage",
] as const;
export type EditPermissionRecordType = typeof EDIT_PERMISSION_RECORD_TYPES[number];

export const editPermissionRequests = pgTable("edit_permission_requests", {
  id: serial("id").primaryKey(),
  recordType: text("record_type").notNull(), // EditPermissionRecordType
  recordId: integer("record_id").notNull(),
  requestedBy: integer("requested_by").notNull().references(() => users.id),
  requestedByName: text("requested_by_name").notNull(),
  requestReason: text("request_reason").notNull(),
  status: text("status").notNull().default("pending"), // "pending" | "approved" | "denied" | "expired" | "used"
  approvedBy: integer("approved_by").references(() => users.id),
  approverName: text("approver_name"),
  approverNote: text("approver_note"),
  expiresAt: timestamp("expires_at"), // set on approval: now + 2 hours
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  recordIdx: index("epr_record_idx").on(t.recordType, t.recordId),
  requesterIdx: index("epr_requester_idx").on(t.requestedBy),
  statusIdx: index("epr_status_idx").on(t.status),
}));

export const insertEditPermissionRequestSchema = createInsertSchema(editPermissionRequests).omit({
  id: true, createdAt: true, approvedBy: true, approverName: true, approverNote: true, expiresAt: true, usedAt: true, status: true,
});
export type EditPermissionRequest = typeof editPermissionRequests.$inferSelect;
export type InsertEditPermissionRequest = z.infer<typeof insertEditPermissionRequestSchema>;

// ============================================
// Site Requirements — Tomorrow's Plan (raised by site engineer, reviewed by PM)
// ============================================

export const siteRequirements = pgTable("site_requirements", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Target date this requirement is for (usually tomorrow: yyyy-MM-dd)
  date: text("date").notNull(),
  siteId: integer("site_id"),
  submittedBy: integer("submitted_by").references(() => users.id, { onDelete: "set null" }),
  submittedByName: text("submitted_by_name"),

  // Section A — Planned work description
  plannedWork: jsonb("planned_work"),
  // Section B — Material requirements [{materialName, qty, uom, requiredBy, sourcePreference, urgency}]
  materials: jsonb("materials"),
  // Section C — Equipment requirements [{equipmentType, numberRequired, requiredFromTime, expectedDuration, operatorRequired}]
  equipment: jsonb("equipment"),
  // Section D — Labour requirements [{labourType, count, skilledType, requiredFromTime}]
  labour: jsonb("labour"),
  // Section E — Immediate site requirements [{description, category, urgency, reason}]
  immediateRequirements: jsonb("immediate_requirements"),

  // PM review workflow
  status: text("status").notNull().default("submitted"),
  pmRemarks: text("pm_remarks"),
  reviewedBy: integer("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),

  // PM / responsible-authority allocation status per section
  // e.g. { materials: "arranged", materialsRemark: "...", equipment: "allocated", ... }
  allocationStatus: jsonb("allocation_status"),

  // Site engineer morning readiness confirmation
  // e.g. { materialStatus: "available", equipmentStatus: "partly_available", labourStatus: "available", immediateStatus: "not_required", remarks: "", confirmedAt: "", confirmedByName: "" }
  readinessConfirmation: jsonb("readiness_confirmation"),
  // "not_confirmed" | "confirmed_ok" | "confirmed_with_shortage"
  readinessStatus: text("readiness_status").default("not_confirmed"),

  // Controlled revision workflow
  // "original" | "revised" | "revision_requested" | "revision_approved" | "revision_rejected"
  revisionStatus: text("revision_status").default("original"),
  revisionRequestReason: text("revision_request_reason"),
  revisionApprovedBy: integer("revision_approved_by"),
  revisionApprovedAt: text("revision_approved_at"),
  revisionRemarks: text("revision_remarks"),
  // consumed = true after the one-time approved edit is saved
  revisionOneTimeUsed: boolean("revision_one_time_used").default(false),
});

export const insertSiteRequirementSchema = createInsertSchema(siteRequirements).omit({
  id: true, createdAt: true,
});
export type SiteRequirement = typeof siteRequirements.$inferSelect;
export type InsertSiteRequirement = z.infer<typeof insertSiteRequirementSchema>;

// ============================================
// PENDING PLANT RECEIPTS
// Bulk-plant PI items awaiting plant-authority confirmation (SoD gap closed)
// ============================================
export const pendingPlantReceipts = pgTable("pending_plant_receipts", {
  id: serial("id").primaryKey(),
  indentId: integer("indent_id").notNull(),
  indentNo: text("indent_no"),
  indentItemId: integer("indent_item_id").notNull(),
  materialName: text("material_name").notNull(),
  materialId: integer("material_id"),
  qty: real("qty").notNull(),
  uom: text("uom").notNull(),
  vendor: text("vendor"),
  rate: real("rate"),
  paymentMode: text("payment_mode"),
  paidBy: text("paid_by"),
  purchaseDate: date("purchase_date"),
  receivingLocation: text("receiving_location").notNull().default("hmp_plant"), // "hmp_plant" | "rmc_plant" | "site"
  receivingSiteId: integer("receiving_site_id"),
  remarks: text("remarks"),
  createdByUserId: integer("created_by_user_id").notNull(),
  createdBy: text("created_by").notNull(),
  siteId: integer("site_id"),
  status: text("status").notNull().default("pending"), // "pending" | "confirmed" | "rejected"
  confirmedByUserId: integer("confirmed_by_user_id"),
  confirmedBy: text("confirmed_by"),
  confirmedAt: timestamp("confirmed_at"),
  rejectionReason: text("rejection_reason"),
  linkedReceiptId: integer("linked_receipt_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPendingPlantReceiptSchema = createInsertSchema(pendingPlantReceipts).omit({ id: true, createdAt: true });
export type PendingPlantReceipt = typeof pendingPlantReceipts.$inferSelect;
export type InsertPendingPlantReceipt = z.infer<typeof insertPendingPlantReceiptSchema>;

// ============================================

// ============================================
// SERVICE COMPLETIONS
// Verification events for service/hire PI items (no GRN — completion verified by non-submitter)
// ============================================
export const serviceCompletions = pgTable("service_completions", {
  id: serial("id").primaryKey(),
  indentId: integer("indent_id").notNull(),
  indentItemId: integer("indent_item_id").notNull(),
  itemDescription: text("item_description"),
  completionStatus: text("completion_status").notNull(), // "completed" | "partly_completed"
  completionDate: date("completion_date"),
  qty: real("qty"),
  hours: real("hours"),
  remarks: text("remarks"),
  documentUrl: text("document_url"),
  verifiedByUserId: integer("verified_by_user_id"),
  verifiedByName: text("verified_by_name"),
  createdByUserId: integer("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertServiceCompletionSchema = createInsertSchema(serviceCompletions).omit({ id: true, createdAt: true });
export type ServiceCompletion = typeof serviceCompletions.$inferSelect;
export type InsertServiceCompletion = z.infer<typeof insertServiceCompletionSchema>;

// ============================================

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  lastLoginAt: true,
  passwordHash: true,
});
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type UserPermission = typeof userPermissions.$inferSelect;
export type UserDevice = typeof userDevices.$inferSelect;
export type UserSession = typeof userSessions.$inferSelect;
export type RecordUnlockLog = typeof recordUnlockLog.$inferSelect;

// Public user shape (no password hash) returned to the client.
export type SafeUser = Omit<User, "passwordHash">;

// ── Material Requirements ────────────────────────────────────────────────────
// Central record created before raising an IRN or PI from the Work Programme
// shortage screen, so procurement can be tracked back to its demand source.
export const materialRequirements = pgTable("material_requirements", {
  id: serial("id").primaryKey(),

  // Identity — exactly one of materialId / storeItemId must be set
  materialType: text("material_type").notNull().default("plant_material"), // "plant_material" | "store_item"
  materialId: integer("material_id").references(() => plantMaterials.id),
  storeItemId: integer("store_item_id").references(() => storeItems.id),

  requiredQty: real("required_qty").notNull(),
  uom: text("uom").notNull(),
  requiredByDate: date("required_by_date"),

  // Destination — use explicit columns, not a polymorphic id
  destinationType: text("destination_type").notNull().default("hmp"), // "store" | "hmp" | "rmc" | "site"
  destinationSiteId: integer("destination_site_id"),   // used when destinationType = "site"
  destinationPlantId: integer("destination_plant_id"), // FK plant_settings.id; used when destinationType = "hmp"|"rmc"

  boqProjectId: integer("boq_project_id"),
  sourceType: text("source_type").notNull().default("manual"), // "bom" | "tomorrow_plan" | "immediate" | "manual"
  sourceBoqItemId: integer("source_boq_item_id"),

  // Idempotency — one UUID per deliberate Raise action; server returns existing row on retry
  clientRequestId: text("client_request_id"),

  // ── Quantity breakdown (unambiguous business meanings) ────────────────────
  // Quantities allocated for internal issue/transfer (via IRN)
  internallyAllocatedQty: real("internally_allocated_qty").notNull().default(0),
  // Quantities actually issued/transferred
  internallyIssuedQty: real("internally_issued_qty").notNull().default(0),
  // Quantities linked to approved PI allocations (PI raised but not yet ordered)
  procurementRequestedQty: real("procurement_requested_qty").notNull().default(0),
  // Quantities actually ordered by purchaser
  orderedQty: real("ordered_qty").notNull().default(0),
  // Quantities physically received and accepted
  receivedQty: real("received_qty").notNull().default(0),
  // max(0, requiredQty - internallyAllocatedQty - procurementRequestedQty)
  unallocatedBalanceQty: real("unallocated_balance_qty").notNull().default(0),
  // max(0, requiredQty - internallyIssuedQty - receivedQty)
  physicallyUnfulfilledQty: real("physically_unfulfilled_qty").notNull().default(0),

  // Legacy fields kept for backward compatibility
  allocatedQty: real("allocated_qty").notNull().default(0),
  balanceQty: real("balance_qty").notNull().default(0),

  // Status derived from allocations and fulfilment
  // "raised" | "awaiting_review" | "partly_allocated" | "fully_allocated" |
  // "internally_committed" | "procurement_in_progress" | "partly_fulfilled" |
  // "fulfilled" | "deferred" | "cancelled" | "reconciliation_required"
  status: text("status").notNull().default("raised"),

  createdByUserId: integer("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  remarks: text("remarks"),
}, (table) => ({
  clientRequestIdUq: uniqueIndex("material_requirements_client_request_id_uq").on(table.clientRequestId),
}));

export const insertMaterialRequirementSchema = createInsertSchema(materialRequirements).omit({ id: true, createdAt: true });
export type MaterialRequirement = typeof materialRequirements.$inferSelect;
export type InsertMaterialRequirement = z.infer<typeof insertMaterialRequirementSchema>;

// ── Material Requirement Allocations ─────────────────────────────────────────
// One allocation per internal or procurement portion of a requirement.
// Internal (IRN) and procurement (PI) allocations coexist for split fulfilment.
export const materialRequirementAllocations = pgTable("material_requirement_allocations", {
  id: serial("id").primaryKey(),
  requirementId: integer("requirement_id").notNull(),
  allocationType: text("allocation_type").notNull(), // "internal" | "procurement"
  authorizedQty: real("authorized_qty").notNull(),
  // "authorized" | "linked" | "committed" | "partly_fulfilled" | "fulfilled" | "cancelled"
  status: text("status").notNull().default("authorized"),
  linkedDocumentType: text("linked_document_type"),  // "irn" | "pi"
  linkedDocumentId: integer("linked_document_id"),
  linkedDocumentItemId: integer("linked_document_item_id"),
  authorizedByUserId: integer("authorized_by_user_id"),
  authorizedAt: timestamp("authorized_at").defaultNow(),
  reason: text("reason"),
  linkedAt: timestamp("linked_at"),
  committedQty: real("committed_qty").notNull().default(0),
  fulfilledQty: real("fulfilled_qty").notNull().default(0),
  cancelledQty: real("cancelled_qty").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMaterialRequirementAllocationSchema = createInsertSchema(materialRequirementAllocations).omit({ id: true, createdAt: true, updatedAt: true });
export type MaterialRequirementAllocation = typeof materialRequirementAllocations.$inferSelect;
export type InsertMaterialRequirementAllocation = z.infer<typeof insertMaterialRequirementAllocationSchema>;
