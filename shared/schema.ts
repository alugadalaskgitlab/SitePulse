import { pgTable, text, serial, real, integer, timestamp, date, boolean } from "drizzle-orm/pg-core";
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
});

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
});

// Equipment Log
export const equipmentLogs = pgTable("equipment_logs", {
  id: serial("id").primaryKey(),
  dprId: integer("dpr_id").notNull(),
  machine: text("machine").notNull(),
  operator: text("operator"),
  vehicleNo: text("vehicle_no"), // Vehicle registration number
  startTime: text("start_time"),
  endTime: text("end_time"),
  // Hour meter fields (optional - user can choose time OR meter OR both)
  openingReading: real("opening_reading"),
  closingReading: real("closing_reading"),
  hoursWorked: real("hours_worked"), // Auto-calculated from time or meter
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
});

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
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

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
  // Stock deduction tracking
  stockDeducted: integer("stock_deducted").default(0), // 1=deducted, 0=pending
  deductionSource: text("deduction_source"), // "party" or "plant_common" or "mixed"
  shortageWarning: text("shortage_warning"), // JSON array of materials with shortage
  // Variance tracking for audit
  bitumenVariancePercent: real("bitumen_variance_percent"), // (actual - theoretical) / theoretical * 100
  ldoVariancePercent: real("ldo_variance_percent"),
  adjustedBy: text("adjusted_by"), // "operator" or role who made the adjustment
  adjustedAt: timestamp("adjusted_at"), // When actual was changed from theoretical
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Equipment Usage Entry (with meter readings and diesel tank tracking)
export const equipmentUsage = pgTable("equipment_usage", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  equipmentId: integer("equipment_id").notNull(),
  // Hour meter fields (optional if using time entry)
  openingReading: real("opening_reading"), // Hours or KM (meter) - now optional
  closingReading: real("closing_reading"), // now optional
  // Time entry fields (optional - user can choose time OR meter OR both)
  startTime: text("start_time"),
  endTime: text("end_time"),
  hoursOrKmRun: real("hours_or_km_run"), // Auto-calculated: from meter OR time
  // Trip-based tracking (for water tankers, etc.)
  tripBasedEntry: boolean("trip_based_entry").default(false), // Flag to use trip-based calculation
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
  createdAt: timestamp("created_at").defaultNow(),
});

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
  createdAt: timestamp("created_at").defaultNow(),
});

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
});

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
});

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
  vehicleNumber: text("vehicle_number"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

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
});

// === RELATIONS ===

export const dprsRelations = relations(dprs, ({ many }) => ({
  progress: many(progressEntries),
  equipment: many(equipmentLogs),
  labour: many(labourLogs),
  materials: many(materialLogs),
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

// === SCHEMAS & TYPES ===

export const insertDprSchema = createInsertSchema(dprs).omit({ id: true, createdAt: true });
export const insertProgressSchema = createInsertSchema(progressEntries).omit({ id: true, dprId: true });
export const insertEquipmentSchema = createInsertSchema(equipmentLogs).omit({ id: true, dprId: true });
export const insertLabourSchema = createInsertSchema(labourLogs).omit({ id: true, dprId: true });
export const insertMaterialSchema = createInsertSchema(materialLogs).omit({ id: true, dprId: true });
export const insertPlantReportSchema = createInsertSchema(plantReports).omit({ id: true, createdAt: true });
export const insertPlantProductionSchema = createInsertSchema(plantProduction).omit({ id: true, plantReportId: true });

export type Dpr = typeof dprs.$inferSelect;
export type ProgressEntry = typeof progressEntries.$inferSelect;
export type EquipmentLog = typeof equipmentLogs.$inferSelect;
export type LabourLog = typeof labourLogs.$inferSelect;
export type MaterialLog = typeof materialLogs.$inferSelect;
export type DprVersion = typeof dprVersions.$inferSelect;
export type PlantReport = typeof plantReports.$inferSelect;
export type PlantProduction = typeof plantProduction.$inferSelect;
export type PlantVersion = typeof plantVersions.$inferSelect;

// Composite Request Type for Creating a Full DPR
export const createDprRequestSchema = insertDprSchema.extend({
  progress: z.array(insertProgressSchema).optional(),
  equipment: z.array(insertEquipmentSchema).optional(),
  labour: z.array(insertLabourSchema).optional(),
  materials: z.array(insertMaterialSchema).optional(),
  clientTimestamp: z.string().optional(), // Client's local timestamp for accurate time display
});

export type CreateDprRequest = z.infer<typeof createDprRequestSchema>;

export type DprWithDetails = Dpr & {
  progress: ProgressEntry[];
  equipment: EquipmentLog[];
  labour: LabourLog[];
  materials: MaterialLog[];
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
export type SiteMaterialTrip = typeof siteMaterialTrips.$inferSelect;
export type InsertSiteMaterialTrip = z.infer<typeof insertSiteMaterialTripSchema>;

// Constants for UOM options
export const UOM_OPTIONS = ["Ton", "MT", "Cum", "Liters", "Kgs", "CFT", "Barrels", "Nos"] as const;
export const EQUIPMENT_TYPES = ["Generator", "JCB", "Loader", "Tipper", "Truck", "Tractor"] as const;
export const METER_TYPES = ["hour_meter", "odometer"] as const;
export const MIX_TYPES = ["BC", "DBM"] as const;

// Default LDO norm (liters per ton)
export const DEFAULT_LDO_NORM = 6;

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
