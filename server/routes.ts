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

  // Get all DPRs with full details (for admin reports)
  app.get("/api/dprs/with-details", async (req, res) => {
    try {
      const dprs = await storage.getDprsWithDetails();
      res.json(dprs);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch DPRs with details" });
    }
  });

  // Get site material logs with filters (for Material Summary feature)
  app.get("/api/dprs/material-summary", async (req, res) => {
    try {
      const filters = {
        site: req.query.site as string | undefined,
        material: req.query.material as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const materialLogs = await storage.getSiteMaterialLogs(filters);
      res.json(materialLogs);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch material summary" });
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
      const dpr = await storage.createDpr(input, input.clientTimestamp);
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

  // PIN verification route
  const pinVerifySchema = z.object({
    pin: z.string().length(4),
  });

  app.post("/api/auth/verify-pin", async (req, res) => {
    try {
      const input = pinVerifySchema.parse(req.body);
      const isManager = await storage.verifyPin("manager", input.pin);
      const isAdmin = await storage.verifyPin("admin", input.pin);
      
      if (isAdmin) {
        return res.json({ role: "admin", valid: true });
      } else if (isManager) {
        return res.json({ role: "manager", valid: true });
      } else {
        return res.json({ role: null, valid: false });
      }
    } catch (err) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Change Admin PIN (admin only)
  const changePinSchema = z.object({
    currentPin: z.string().length(4),
    newPin: z.string().length(4),
  });

  app.post("/api/admin/change-pin", async (req, res) => {
    try {
      const input = changePinSchema.parse(req.body);
      
      const isAdmin = await storage.verifyPin("admin", input.currentPin);
      if (!isAdmin) {
        return res.status(403).json({ message: "Invalid current admin PIN" });
      }
      
      await storage.setSetting("admin_pin", input.newPin);
      res.json({ message: "Admin PIN updated successfully" });
    } catch (err) {
      res.status(500).json({ message: "Failed to update PIN" });
    }
  });

  // Change Manager PIN (admin only)
  app.post("/api/admin/change-manager-pin", async (req, res) => {
    try {
      const input = changePinSchema.parse(req.body);
      
      // Admin PIN required to change manager PIN
      const isAdmin = await storage.verifyPin("admin", input.currentPin);
      if (!isAdmin) {
        return res.status(403).json({ message: "Invalid admin PIN" });
      }
      
      await storage.setSetting("manager_pin", input.newPin);
      res.json({ message: "Manager PIN updated successfully" });
    } catch (err) {
      res.status(500).json({ message: "Failed to update PIN" });
    }
  });


  // Create a new version of DPR with edited data
  // Creates a copy with timestamp instead of overwriting original
  const versionSchema = z.object({
    pin: z.string().length(4),
    editedBy: z.enum(["manager", "admin"]),
    data: createDprRequestSchema,
    clientTimestamp: z.string().optional(),
  });

  app.post("/api/dprs/:id/version", async (req, res) => {
    try {
      const originalId = Number(req.params.id);
      const input = versionSchema.parse(req.body);
      
      // Server-side PIN validation using database
      const isValid = await storage.verifyPin(input.editedBy, input.pin);
      if (!isValid) {
        return res.status(403).json({ message: "Invalid PIN for editing" });
      }
      
      const newVersion = await storage.createVersionDpr(originalId, input.data, input.editedBy, input.clientTimestamp);
      res.status(201).json(newVersion);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Failed to create version" });
    }
  });

  // Clone DPR (for manager edits as copies)
  // Requires manager or admin role with PIN verification
  const cloneSchema = z.object({
    editedBy: z.enum(["manager", "admin"]),
    pin: z.string().length(4),
    clientTimestamp: z.string().optional(),
  });
  
  app.post("/api/dprs/:id/clone", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = cloneSchema.parse(req.body);
      
      // Server-side PIN validation using database
      const isValid = await storage.verifyPin(input.editedBy, input.pin);
      if (!isValid) {
        return res.status(403).json({ message: "Invalid PIN for role verification" });
      }
      
      const cloned = await storage.cloneDpr(id, input.editedBy, input.clientTimestamp);
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
      
      // Server-side PIN validation - admin only using database
      const isAdmin = await storage.verifyPin("admin", input.pin);
      if (!isAdmin) {
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
      
      // Server-side PIN validation using database
      const isValid = await storage.verifyPin(input.editedBy, input.pin);
      if (!isValid) {
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
      
      // Server-side PIN validation - admin only using database
      const isAdmin = await storage.verifyPin("admin", input.pin);
      if (!isAdmin) {
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

  // ============================================
  // PLANT MODULE PHASE-1 - API ROUTES
  // ============================================

  // Party/Job Master
  app.get("/api/plant-module/parties", async (req, res) => {
    try {
      const partiesList = await storage.getParties();
      res.json(partiesList);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch parties" });
    }
  });

  app.post("/api/plant-module/parties", async (req, res) => {
    try {
      const party = await storage.createParty(req.body);
      res.status(201).json(party);
    } catch (err) {
      res.status(500).json({ message: "Failed to create party" });
    }
  });

  app.patch("/api/plant-module/parties/:id", async (req, res) => {
    try {
      const party = await storage.updateParty(Number(req.params.id), req.body);
      if (!party) return res.status(404).json({ message: "Party not found" });
      res.json(party);
    } catch (err) {
      res.status(500).json({ message: "Failed to update party" });
    }
  });

  app.delete("/api/plant-module/parties/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteParty(Number(req.params.id));
      if (!deleted) return res.status(404).json({ message: "Party not found" });
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to delete party" });
    }
  });

  // Plant Materials Master
  app.get("/api/plant-module/materials", async (req, res) => {
    try {
      const materials = await storage.getPlantMaterials();
      res.json(materials);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch materials" });
    }
  });

  app.post("/api/plant-module/materials", async (req, res) => {
    try {
      const material = await storage.createPlantMaterial(req.body);
      res.status(201).json(material);
    } catch (err) {
      res.status(500).json({ message: "Failed to create material" });
    }
  });

  app.patch("/api/plant-module/materials/:id", async (req, res) => {
    try {
      const material = await storage.updatePlantMaterial(Number(req.params.id), req.body);
      if (!material) return res.status(404).json({ message: "Material not found" });
      res.json(material);
    } catch (err) {
      res.status(500).json({ message: "Failed to update material" });
    }
  });

  app.delete("/api/plant-module/materials/:id", async (req, res) => {
    try {
      const deleted = await storage.deletePlantMaterial(Number(req.params.id));
      if (!deleted) return res.status(404).json({ message: "Material not found" });
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to delete material" });
    }
  });

  // Mix Templates
  app.get("/api/plant-module/mix-templates", async (req, res) => {
    try {
      const templates = await storage.getMixTemplates();
      res.json(templates);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch mix templates" });
    }
  });

  app.get("/api/plant-module/mix-template-components", async (req, res) => {
    try {
      const components = await storage.getAllMixTemplateComponents();
      res.json(components);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch mix template components" });
    }
  });

  app.get("/api/plant-module/mix-templates/:id", async (req, res) => {
    try {
      const result = await storage.getMixTemplateWithComponents(Number(req.params.id));
      if (!result) return res.status(404).json({ message: "Mix template not found" });
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch mix template" });
    }
  });

  app.post("/api/plant-module/mix-templates", async (req, res) => {
    try {
      const { components, ...template } = req.body;
      const result = await storage.createMixTemplate(template, components);
      res.status(201).json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to create mix template" });
    }
  });

  app.patch("/api/plant-module/mix-templates/:id", async (req, res) => {
    try {
      const { components, ...template } = req.body;
      const result = await storage.updateMixTemplate(Number(req.params.id), template, components);
      if (!result) return res.status(404).json({ message: "Mix template not found" });
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to update mix template" });
    }
  });

  app.delete("/api/plant-module/mix-templates/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteMixTemplate(Number(req.params.id));
      if (!deleted) return res.status(404).json({ message: "Mix template not found" });
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to delete mix template" });
    }
  });

  // Equipment Master
  app.get("/api/plant-module/equipment", async (req, res) => {
    try {
      const equipmentList = await storage.getEquipmentMaster();
      res.json(equipmentList);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch equipment" });
    }
  });

  app.post("/api/plant-module/equipment", async (req, res) => {
    try {
      const equipment = await storage.createEquipment(req.body);
      res.status(201).json(equipment);
    } catch (err) {
      res.status(500).json({ message: "Failed to create equipment" });
    }
  });

  app.patch("/api/plant-module/equipment/:id", async (req, res) => {
    try {
      const equipment = await storage.updateEquipment(Number(req.params.id), req.body);
      if (!equipment) return res.status(404).json({ message: "Equipment not found" });
      res.json(equipment);
    } catch (err) {
      res.status(500).json({ message: "Failed to update equipment" });
    }
  });

  app.delete("/api/plant-module/equipment/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteEquipment(Number(req.params.id));
      if (!deleted) return res.status(404).json({ message: "Equipment not found" });
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to delete equipment" });
    }
  });

  // Material Receipts
  app.get("/api/plant-module/material-receipts", async (req, res) => {
    try {
      const filters = {
        partyId: req.query.partyId ? Number(req.query.partyId) : undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const receipts = await storage.getMaterialReceipts(filters);
      res.json(receipts);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch material receipts" });
    }
  });

  app.post("/api/plant-module/material-receipts", async (req, res) => {
    try {
      const receipt = await storage.createMaterialReceipt(req.body);
      res.status(201).json(receipt);
    } catch (err) {
      res.status(500).json({ message: "Failed to create material receipt" });
    }
  });

  app.put("/api/plant-module/material-receipts/:id", async (req, res) => {
    try {
      const updated = await storage.updateMaterialReceipt(Number(req.params.id), req.body);
      if (!updated) return res.status(404).json({ message: "Receipt not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update material receipt" });
    }
  });

  app.delete("/api/plant-module/material-receipts/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteMaterialReceipt(Number(req.params.id));
      if (!deleted) return res.status(404).json({ message: "Receipt not found" });
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to delete material receipt" });
    }
  });

  // Truck Dispatches
  app.get("/api/plant-module/dispatches", async (req, res) => {
    try {
      const filters = {
        partyId: req.query.partyId ? Number(req.query.partyId) : undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const dispatches = await storage.getTruckDispatches(filters);
      res.json(dispatches);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch truck dispatches" });
    }
  });

  app.post("/api/plant-module/dispatches", async (req, res) => {
    try {
      const result = await storage.createTruckDispatchWithStockDeduction(req.body);
      res.status(201).json(result);
    } catch (err) {
      console.error("Dispatch error:", err);
      res.status(500).json({ message: "Failed to create truck dispatch" });
    }
  });

  app.put("/api/plant-module/dispatches/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateTruckDispatch(id, req.body);
      if (!updated) {
        return res.status(404).json({ message: "Dispatch not found" });
      }
      res.json(updated);
    } catch (err) {
      console.error("Update dispatch error:", err);
      res.status(500).json({ message: "Failed to update dispatch" });
    }
  });

  app.delete("/api/plant-module/dispatches/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteTruckDispatch(id);
      if (!deleted) {
        return res.status(404).json({ message: "Dispatch not found" });
      }
      res.status(204).send();
    } catch (err) {
      console.error("Delete dispatch error:", err);
      res.status(500).json({ message: "Failed to delete dispatch" });
    }
  });

  // Recalculate all dispatch consumption from mix templates
  app.post("/api/plant-module/dispatches/recalculate-all", async (req, res) => {
    try {
      const result = await storage.recalculateAllDispatchConsumption();
      res.json(result);
    } catch (err) {
      console.error("Recalculate dispatches error:", err);
      res.status(500).json({ message: "Failed to recalculate dispatches" });
    }
  });

  // Equipment Usage
  app.get("/api/plant-module/equipment-usage", async (req, res) => {
    try {
      const filters = {
        equipmentId: req.query.equipmentId ? Number(req.query.equipmentId) : undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const usage = await storage.getEquipmentUsage(filters);
      res.json(usage);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch equipment usage" });
    }
  });

  // Get previous diesel balance for equipment (for new entry creation)
  app.get("/api/plant-module/equipment-usage/previous-balance/:equipmentId", async (req, res) => {
    try {
      const equipmentId = parseInt(req.params.equipmentId);
      const excludeId = req.query.excludeId ? parseInt(req.query.excludeId as string) : undefined;
      
      const usage = await storage.getEquipmentUsage({ equipmentId });
      // Usage is already sorted by date DESC, id DESC - so the first entry is the most recent
      
      // Filter out only the excluded entry (when editing)
      const filteredUsage = excludeId ? usage.filter(u => u.id !== excludeId) : usage;
      
      // Get the most recent entry for this equipment (includes same-day entries)
      const previousBalance = filteredUsage.length > 0 ? filteredUsage[0].closingDiesel || 0 : 0;
      res.json({ previousBalance });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch previous balance", previousBalance: 0 });
    }
  });

  app.post("/api/plant-module/equipment-usage", async (req, res) => {
    try {
      const usage = await storage.createEquipmentUsage(req.body);
      res.status(201).json(usage);
    } catch (err) {
      res.status(500).json({ message: "Failed to create equipment usage" });
    }
  });

  app.put("/api/plant-module/equipment-usage/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateEquipmentUsage(id, req.body);
      if (!updated) {
        return res.status(404).json({ message: "Equipment usage not found" });
      }
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update equipment usage" });
    }
  });

  app.delete("/api/plant-module/equipment-usage/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteEquipmentUsage(id);
      if (!deleted) {
        return res.status(404).json({ message: "Equipment usage not found" });
      }
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to delete equipment usage" });
    }
  });

  // Generator Logs
  app.get("/api/plant-module/generator-logs", async (req, res) => {
    try {
      const filters = {
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const logs = await storage.getGeneratorLogs(filters);
      res.json(logs);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch generator logs" });
    }
  });

  app.post("/api/plant-module/generator-logs", async (req, res) => {
    try {
      const log = await storage.createGeneratorLog(req.body);
      res.status(201).json(log);
    } catch (err) {
      res.status(500).json({ message: "Failed to create generator log" });
    }
  });

  // LDO Logs
  app.get("/api/plant-module/ldo-logs", async (req, res) => {
    try {
      const filters = {
        partyId: req.query.partyId ? Number(req.query.partyId) : undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const logs = await storage.getLdoLogs(filters);
      res.json(logs);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch LDO logs" });
    }
  });

  app.post("/api/plant-module/ldo-logs", async (req, res) => {
    try {
      const log = await storage.createLdoLog(req.body);
      res.status(201).json(log);
    } catch (err) {
      res.status(500).json({ message: "Failed to create LDO log" });
    }
  });

  // Stock Balances
  app.get("/api/plant-module/stock-balances", async (req, res) => {
    try {
      const partyId = req.query.partyId !== undefined ? Number(req.query.partyId) : undefined;
      const balances = await storage.getStockBalances(partyId);
      res.json(balances);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch stock balances" });
    }
  });

  // Stock Ledger
  app.get("/api/plant-module/stock-ledger", async (req, res) => {
    try {
      const filters = {
        partyId: req.query.partyId !== undefined ? Number(req.query.partyId) : undefined,
        materialId: req.query.materialId ? Number(req.query.materialId) : undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const ledger = await storage.getStockLedger(filters);
      res.json(ledger);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch stock ledger" });
    }
  });

  // Seed Data
  seedDatabase();
  seedPlantMasterData();

  return httpServer;
}

async function seedPlantMasterData() {
  const existingMaterials = await storage.getPlantMaterials();
  if (existingMaterials.length === 0) {
    console.log("Seeding plant master data...");
    
    // Default materials - CFT included for aggregates (commonly received in CFT)
    // Conversion factor: 1 CFT = ~0.028 Ton for aggregates (varies by material density)
    const defaultMaterials = [
      { name: "20MM", category: "Aggregate", defaultUom: "Ton", allowedUoms: JSON.stringify(["Ton", "MT", "CFT", "Cum", "Kg"]), conversionFactor: 0.04, conversionFromUom: "CFT", conversionToUom: "Ton" },
      { name: "10/12MM", category: "Aggregate", defaultUom: "Ton", allowedUoms: JSON.stringify(["Ton", "MT", "CFT", "Cum", "Kg"]), conversionFactor: 0.04, conversionFromUom: "CFT", conversionToUom: "Ton" },
      { name: "6MM DOWN", category: "Aggregate", defaultUom: "Ton", allowedUoms: JSON.stringify(["Ton", "MT", "CFT", "Cum", "Kg"]), conversionFactor: 0.045, conversionFromUom: "CFT", conversionToUom: "Ton" },
      { name: "DUST", category: "Aggregate", defaultUom: "Ton", allowedUoms: JSON.stringify(["Ton", "MT", "CFT", "Cum", "Kg"]), conversionFactor: 0.05, conversionFromUom: "CFT", conversionToUom: "Ton" },
      { name: "40MM", category: "Aggregate", defaultUom: "Ton", allowedUoms: JSON.stringify(["Ton", "MT", "CFT", "Cum", "Kg"]), conversionFactor: 0.045, conversionFromUom: "CFT", conversionToUom: "Ton" },
      { name: "BITUMEN", category: "Bitumen", defaultUom: "MT", allowedUoms: JSON.stringify(["MT", "Ton", "Kg", "Barrels"]) },
      { name: "EMULSION", category: "Bitumen", defaultUom: "Liters", allowedUoms: JSON.stringify(["Liters", "Barrels", "Kg"]) },
      { name: "DIESEL", category: "Utility", defaultUom: "Liters", allowedUoms: JSON.stringify(["Liters", "Barrels", "Kg"]) },
      { name: "LDO", category: "Utility", defaultUom: "Liters", allowedUoms: JSON.stringify(["Liters", "Barrels", "Kg"]) },
    ];
    
    for (const material of defaultMaterials) {
      await storage.createPlantMaterial(material);
    }
    
    // Get materials for components
    const materials = await storage.getPlantMaterials();
    const materialMap = new Map(materials.map(m => [m.name, m.id]));
    
    // Default mix templates with aggregate proportions (% of total mix)
    // BC Standard: 20mm=30%, 10/12mm=35%, 6mm=20%, Dust=10% (aggregates=95%, Bitumen=5%)
    await storage.createMixTemplate({
      name: "BC STANDARD",
      mixType: "BC",
      bitumenPercent: 5.2,
      ldoNorm: 6, // 6 liters LDO per ton of mix
      isStandard: 1,
      notes: "Standard BC mix design"
    }, [
      { templateId: 0, materialId: materialMap.get("20MM") || 1, percent: 30, uom: "%" },
      { templateId: 0, materialId: materialMap.get("10/12MM") || 2, percent: 35, uom: "%" },
      { templateId: 0, materialId: materialMap.get("6MM DOWN") || 3, percent: 20, uom: "%" },
      { templateId: 0, materialId: materialMap.get("DUST") || 4, percent: 9.8, uom: "%" },
    ]);
    
    // DBM Standard: 20mm=40%, 10/12mm=30%, 6mm=15%, Dust=10.5% (aggregates=95.5%, Bitumen=4.5%)
    await storage.createMixTemplate({
      name: "DBM STANDARD",
      mixType: "DBM",
      bitumenPercent: 4.5,
      ldoNorm: 5, // 5 liters LDO per ton of mix
      isStandard: 1,
      notes: "Standard DBM mix design"
    }, [
      { templateId: 0, materialId: materialMap.get("20MM") || 1, percent: 40, uom: "%" },
      { templateId: 0, materialId: materialMap.get("10/12MM") || 2, percent: 30, uom: "%" },
      { templateId: 0, materialId: materialMap.get("6MM DOWN") || 3, percent: 15, uom: "%" },
      { templateId: 0, materialId: materialMap.get("DUST") || 4, percent: 10.5, uom: "%" },
    ]);
    
    // Default generators
    await storage.createEquipment({
      name: "600 KVA GENERATOR",
      equipmentType: "Generator",
      meterType: "hour_meter",
      consumptionNorm: 50,
    });
    
    await storage.createEquipment({
      name: "40-30 KVA GENERATOR",
      equipmentType: "Generator",
      meterType: "hour_meter",
      consumptionNorm: 8,
    });
    
    console.log("Plant master data seeded successfully");
  }
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
