import { pgTable, text, serial, real, integer, timestamp, date } from "drizzle-orm/pg-core";
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
  startTime: text("start_time"),
  endTime: text("end_time"),
  diesel: real("diesel"),
});

// Labour Log
export const labourLogs = pgTable("labour_logs", {
  id: serial("id").primaryKey(),
  dprId: integer("dpr_id").notNull(),
  category: text("category").notNull(), // Skilled, Unskilled
  gender: text("gender"), // Male, Female
  count: integer("count").notNull(),
});

// Materials Log
export const materialLogs = pgTable("material_logs", {
  id: serial("id").primaryKey(),
  dprId: integer("dpr_id").notNull(),
  type: text("type").notNull(), // Received, Issued
  material: text("material").notNull(),
  quantity: real("quantity"),
  uom: text("uom"),
});

// === RELATIONS ===

export const dprsRelations = relations(dprs, ({ many }) => ({
  progress: many(progressEntries),
  equipment: many(equipmentLogs),
  labour: many(labourLogs),
  materials: many(materialLogs),
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

export type Dpr = typeof dprs.$inferSelect;
export type ProgressEntry = typeof progressEntries.$inferSelect;
export type EquipmentLog = typeof equipmentLogs.$inferSelect;
export type LabourLog = typeof labourLogs.$inferSelect;
export type MaterialLog = typeof materialLogs.$inferSelect;

// Composite Request Type for Creating a Full DPR
export const createDprRequestSchema = insertDprSchema.extend({
  progress: z.array(insertProgressSchema).optional(),
  equipment: z.array(insertEquipmentSchema).optional(),
  labour: z.array(insertLabourSchema).optional(),
  materials: z.array(insertMaterialSchema).optional(),
});

export type CreateDprRequest = z.infer<typeof createDprRequestSchema>;

export type DprWithDetails = Dpr & {
  progress: ProgressEntry[];
  equipment: EquipmentLog[];
  labour: LabourLog[];
  materials: MaterialLog[];
};
