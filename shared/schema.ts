import { pgTable, text, serial, real, integer, timestamp, date, boolean, index, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// === TABLE DEFINITIONS ===

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
  conversionFactor: real("conversion_factor"), // For UOM conversion, e.g., 1 CFT = X tons
  conversionFromUom: text("conversion_from_uom"), // Source UOM for conversion (e.g., "CFT")
  conversionToUom: text("conversion_to_uom"), // Target UOM for conversion (e.g., "Ton")
  isActive: integer("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow(),
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
  ldoNorm: real("ldo_norm").default(6), // Liters per ton (default 6 L/ton)
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
  isActive: integer("is_active").default(1),
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
  vehicleNumber: text("vehicle_number"),
  challanNumber: text("challan_number"),
  tankNumber: integer("tank_number"),
  notes: text("notes"),
  plantName: text("plant_name").notNull().default("Main Plant"),
  createdAt: timestamp("created_at").defaultNow(),
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
}));

// Stock Balances (for real-time stock tracking)
export const stockBalances = pgTable("stock_balances", {
  id: serial("id").primaryKey(),
  partyId: integer("party_id"), // NULL for plant-common stock
  materialId: integer("material_id").notNull(),
  balance: real("balance").notNull().default(0),
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
  quantityIn: real("quantity_in").default(0),
  quantityOut: real("quantity_out").default(0),
  balanceAfter: real("balance_after"),
  uom: text("uom"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  dateIdx: index("stock_ledger_date_idx").on(table.date),
  dateMaterialPartyIdx: index("stock_ledger_date_material_party_idx").on(table.date, table.materialId, table.partyId),
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
  createdAt: timestamp("created_at").defaultNow(),
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
export const insertEquipmentSchema = createInsertSchema(equipmentLogs).omit({ id: true, dprId: true });
export const insertLabourSchema = createInsertSchema(labourLogs).omit({ id: true, dprId: true });
export const insertMaterialSchema = createInsertSchema(materialLogs).omit({ id: true, dprId: true });
export const insertSitePurchaseSchema = createInsertSchema(sitePurchases).omit({ id: true, dprId: true });
export const insertPlantReportSchema = createInsertSchema(plantReports).omit({ id: true, createdAt: true });
export const insertPlantProductionSchema = createInsertSchema(plantProduction).omit({ id: true, plantReportId: true });

export type Dpr = typeof dprs.$inferSelect;
export type ProgressEntry = typeof progressEntries.$inferSelect;
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
  clientTimestamp: z.string().optional(),
});

export type CreateDprRequest = z.infer<typeof createDprRequestSchema>;

export type DprWithDetails = Dpr & {
  progress: ProgressEntry[];
  equipment: EquipmentLog[];
  labour: LabourLog[];
  materials: MaterialLog[];
  sitePurchases: SitePurchase[];
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
export const insertMaterialReceiptSchema = createInsertSchema(materialReceipts).omit({ id: true, createdAt: true });
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
});

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
  sourceHeatingSessionId: integer("source_heating_session_id"),
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
  createdAt: timestamp("created_at").defaultNow(),
});

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

// Tracks the most recent fired/cleared state of each heating-session alert
// so the post-save hook can dedupe and only re-fire on ok→bad transitions
// (or significant value changes). One row per (scopeKey).
//   scopeKey examples:
//     "session:42:hotOilLow"
//     "session:42:ldoHigh"
//     "mismatch:2026-04-24:Main Plant"
export const heatingAlertHistory = pgTable("heating_alert_history", {
  id: serial("id").primaryKey(),
  scopeKey: text("scope_key").notNull().unique(),
  state: text("state").notNull(), // "ok" | "bad"
  lastMessage: text("last_message"),
  lastFiredAt: timestamp("last_fired_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type HeatingAlertHistory = typeof heatingAlertHistory.$inferSelect;

export const upsertBitumenHeatingSessionSchema = insertBitumenHeatingSessionSchema.extend({
  id: z.number().optional(),
  pin: z.string().optional(),
  editedBy: z.string().optional(),
  sessionType: z.enum(HEATING_SESSION_TYPES),
  dgMode: z.enum(["none", "inline", "link"]),
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
  // Deterministic role assigned at subscribe time based on which PIN
  // the device used to enable notifications: "admin" | "manager".
  // Used to route targeted alerts (e.g. persistent diesel over-consumer)
  // to the right audience without trusting client-supplied labels.
  role: text("role"),
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
  // Per-user record locking (Task #229).
  authorUserId: integer("author_user_id"),
  lockStatus: text("lock_status").notNull().default("locked"),
  unlockedByUserId: integer("unlocked_by_user_id"),
  unlockedAt: timestamp("unlocked_at"),
  unlockReason: text("unlock_reason"),
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
  items: z.array(insertPurchaseIndentItemSchema.omit({ indentId: true })),
});
export type CreatePurchaseIndentRequest = z.infer<typeof createPurchaseIndentRequestSchema>;

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
  items: z.array(insertDieselRequirementItemSchema.omit({ requirementId: true })),
});
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
  isInterState: boolean("is_inter_state").default(false),
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
// PLANT ALERT THRESHOLDS (stored in app_settings)
// ============================================
// Used by the boiler / heating session post-save alert hook to decide when
// to fire push + inbox notifications. Values are persisted as JSON under the
// app_settings key `plant_alert_thresholds`.
export const PLANT_ALERT_THRESHOLDS_KEY = "plant_alert_thresholds";

export const PLANT_ALERT_THRESHOLD_DEFAULTS = {
  hotOilEndTempMinC: 240,
  ldoLitersPerHourMax: 25,
  sessionsVsShiftMismatchL: 5,
  // Persistent diesel over-consumer (PlantEquipmentUsage monthly rollup).
  // A machine is flagged when its month-to-date diesel variance is at or
  // above `monthlyOverConsumerVariancePct`, AND it has overshot the daily
  // variance threshold on at least `monthlyOverConsumerMinDays` distinct
  // days inside the same month.
  monthlyOverConsumerVariancePct: 15,
  monthlyOverConsumerMinDays: 2,
} as const;

export const plantAlertThresholdsSchema = z.object({
  hotOilEndTempMinC: z.number().nonnegative(),
  ldoLitersPerHourMax: z.number().positive(),
  sessionsVsShiftMismatchL: z.number().positive(),
  monthlyOverConsumerVariancePct: z.number().positive().max(500).default(15),
  monthlyOverConsumerMinDays: z.number().int().positive().max(31).default(2),
});
export type PlantAlertThresholds = z.infer<typeof plantAlertThresholdsSchema>;

// ============================================
// VARIANCE HIGHLIGHT THRESHOLD (stored in app_settings)
// ============================================
// Used by the PlantEquipmentUsage daily footer (and monthly rollup) to decide
// when |variance %| of actual-vs-expected diesel is large enough to highlight
// a row. Persisted as a plain numeric percent under app_settings key
// `variance_highlight_threshold_pct`. Admin-tunable from Admin Settings.
export const VARIANCE_HIGHLIGHT_THRESHOLD_KEY = "variance_highlight_threshold_pct";
// Per-equipment-type overrides live in a sibling app_settings key as a JSON
// map of `{ [equipmentType]: pct }`. When a row's equipment type has an
// override, that value wins over the global threshold above. Equipment
// without an override falls back to the global value as before.
export const VARIANCE_HIGHLIGHT_THRESHOLD_OVERRIDES_KEY = "variance_highlight_threshold_overrides";

export const VARIANCE_HIGHLIGHT_THRESHOLD_DEFAULT = 15;

export const varianceHighlightThresholdSchema = z.object({
  thresholdPct: z.number().min(0).max(100),
  overrides: z.record(z.string(), z.number().min(0).max(100)).default({}),
});
export type VarianceHighlightThreshold = z.infer<typeof varianceHighlightThresholdSchema>;

// ============================================
// USERS & PERMISSIONS (Task #229)
// ============================================
// Replaces the old localStorage AccessContext + hardcoded ADMIN_PIN with real
// per-user accounts. Estimator-portal PIN-based auth (app_settings rows
// admin_pin / manager_pin + hlc_est_role cookie) is intentionally untouched.

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  // Admins bypass per-section permission checks (still go through device
  // approval). The bootstrap admin starts with isAdmin=true.
  isAdmin: boolean("is_admin").notNull().default(false),
  // Allows unlocking previously-saved records on sections where the user
  // also has edit permission. Audited via record_unlock_log.
  canUnlockRecords: boolean("can_unlock_records").notNull().default(false),
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
  canViewReports: boolean("can_view_reports").notNull().default(false),
}, (t) => ({
  userSectionUq: uniqueIndex("user_permissions_user_section_uq").on(t.userId, t.sectionKey),
}));

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
