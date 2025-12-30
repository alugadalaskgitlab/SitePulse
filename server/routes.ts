import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import * as xlsx from 'xlsx';
import { createDprRequestSchema, createPlantReportRequestSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // List DPRs with filters
  app.get(api.dprs.list.path, async (req, res) => {
    try {
      const filters = {
        site: req.query.site as string | undefined,
        engineer: req.query.engineer as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const dprs = await storage.getDprs(filters);
      res.json(dprs);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch DPRs" });
    }
  });

  // Get single DPR details
  app.get(api.dprs.get.path, async (req, res) => {
    const dpr = await storage.getDpr(Number(req.params.id));
    if (!dpr) {
      return res.status(404).json({ message: 'DPR not found' });
    }
    res.json(dpr);
  });

  // Create new DPR
  app.post(api.dprs.create.path, async (req, res) => {
    try {
      const input = api.dprs.create.input.parse(req.body);
      const dpr = await storage.createDpr(input);
      res.status(201).json(dpr);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Failed to create DPR" });
    }
  });

  // Export to Excel
  app.get(api.dprs.export.path, async (req, res) => {
    try {
      const dprs = await storage.getDprs();
      
      // Simple export of just the headers for MVP
      // In a real app, we might want to flatten all details
      const ws = xlsx.utils.json_to_sheet(dprs);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "DPRs");
      
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Disposition', 'attachment; filename="dprs.xlsx"');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buf);
    } catch (err) {
      res.status(500).json({ message: "Failed to export data" });
    }
  });

  // Update DPR (for editing)
  const updatePinSchema = z.object({
    pin: z.string().length(4),
    data: createDprRequestSchema,
  });

  const MANAGER_PIN = "1234";
  const ADMIN_PIN = "5678";

  app.patch("/api/dprs/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = updatePinSchema.parse(req.body);
      
      // Server-side PIN validation - manager or admin can edit
      if (input.pin !== MANAGER_PIN && input.pin !== ADMIN_PIN) {
        return res.status(403).json({ message: "Invalid PIN for editing" });
      }
      
      const updated = await storage.updateDpr(id, input.data);
      if (!updated) {
        return res.status(404).json({ message: "DPR not found" });
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Failed to update DPR" });
    }
  });

  // Clone DPR (for manager edits as copies)
  // Requires manager or admin role with PIN verification
  const cloneSchema = z.object({
    editedBy: z.enum(["manager", "admin"]),
    pin: z.string().length(4),
  });
  
  app.post("/api/dprs/:id/clone", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = cloneSchema.parse(req.body);
      
      // Server-side PIN validation
      const expectedPin = input.editedBy === "manager" ? MANAGER_PIN : ADMIN_PIN;
      if (input.pin !== expectedPin) {
        return res.status(403).json({ message: "Invalid PIN for role verification" });
      }
      
      const cloned = await storage.cloneDpr(id, input.editedBy);
      if (!cloned) {
        return res.status(404).json({ message: "Original DPR not found" });
      }
      res.status(201).json(cloned);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Failed to clone DPR" });
    }
  });

  // Delete DPR (admin only with PIN verification)
  const deleteSchema = z.object({
    pin: z.string().length(4),
  });

  app.delete("/api/dprs/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = deleteSchema.parse(req.body);
      
      // Server-side PIN validation - admin only
      if (input.pin !== ADMIN_PIN) {
        return res.status(403).json({ message: "Invalid admin PIN for deletion" });
      }
      
      const deleted = await storage.deleteDpr(id);
      if (!deleted) {
        return res.status(404).json({ message: "DPR not found" });
      }
      res.status(204).send();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Failed to delete DPR" });
    }
  });

  // Plant Report Routes
  app.get("/api/plant", async (req, res) => {
    try {
      const reports = await storage.getPlantReports();
      res.json(reports);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch plant reports" });
    }
  });

  app.get("/api/plant/:id", async (req, res) => {
    try {
      const report = await storage.getPlantReport(Number(req.params.id));
      if (!report) {
        return res.status(404).json({ message: "Plant report not found" });
      }
      res.json(report);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch plant report" });
    }
  });

  app.post("/api/plant", async (req, res) => {
    try {
      const input = createPlantReportRequestSchema.parse(req.body);
      const report = await storage.createPlantReport(input);
      res.status(201).json(report);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Failed to create plant report" });
    }
  });

  const plantCloneSchema = z.object({
    editedBy: z.enum(["manager", "admin"]),
    pin: z.string().length(4),
  });

  app.post("/api/plant/:id/clone", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = plantCloneSchema.parse(req.body);
      
      // Server-side PIN validation
      const expectedPin = input.editedBy === "manager" ? MANAGER_PIN : ADMIN_PIN;
      if (input.pin !== expectedPin) {
        return res.status(403).json({ message: "Invalid PIN for role verification" });
      }
      
      const cloned = await storage.clonePlantReport(id, input.editedBy);
      if (!cloned) {
        return res.status(404).json({ message: "Original plant report not found" });
      }
      res.status(201).json(cloned);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Failed to clone plant report" });
    }
  });

  app.patch("/api/plant/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = createPlantReportRequestSchema.parse(req.body);
      const updated = await storage.updatePlantReport(id, input);
      if (!updated) {
        return res.status(404).json({ message: "Plant report not found" });
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Failed to update plant report" });
    }
  });

  const plantDeleteSchema = z.object({
    pin: z.string().length(4),
  });

  app.delete("/api/plant/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = plantDeleteSchema.parse(req.body);
      
      // Server-side PIN validation - admin only
      if (input.pin !== ADMIN_PIN) {
        return res.status(403).json({ message: "Invalid admin PIN for deletion" });
      }
      
      const deleted = await storage.deletePlantReport(id);
      if (!deleted) {
        return res.status(404).json({ message: "Plant report not found" });
      }
      res.status(204).send();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Failed to delete plant report" });
    }
  });

  // Seed Data
  seedDatabase();

  return httpServer;
}

async function seedDatabase() {
  const existing = await storage.getDprs();
  if (existing.length === 0) {
    console.log("Seeding database with example DPR...");
    await storage.createDpr({
      date: new Date().toISOString().split('T')[0],
      site: "Highway 42 Project",
      engineer: "John Doe",
      progress: [
        { activity: "Scarifying", chainageFrom: "10+200", chainageTo: "10+500", length: 300, width: 7.5, quantity: 2250, uom: "sqm" },
        { activity: "BC Laying", chainageFrom: "12+000", chainageTo: "12+100", length: 100, width: 7.5, thickness: 0.04, quantity: 30, uom: "cum" }
      ],
      equipment: [
        { machine: "Paver", operator: "Mike", startTime: "08:00", endTime: "17:00", diesel: 50 },
        { machine: "Roller", operator: "Steve", startTime: "09:00", endTime: "18:00", diesel: 40 }
      ],
      labour: [
        { category: "Skilled", gender: "Male", count: 5 },
        { category: "Unskilled", gender: "Female", count: 10 }
      ],
      materials: [
        { type: "Received", material: "Bitumen", quantity: 10, uom: "MT" },
        { type: "Issued", material: "Diesel", quantity: 100, uom: "Liters" }
      ]
    });
  }
}
