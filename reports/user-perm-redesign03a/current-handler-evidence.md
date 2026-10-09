## GET /api/site-material-trips/suggestions — server/routes.ts:722

```typescript
app.get("/api/site-material-trips/suggestions", async (req, res) => {
    try {
      if (!assertSiteMaterialSuggestionsAccess(req, res)) return;
      const rawSite = typeof req.query.site === "string" ? req.query.site : "";
      const site = normalizeSiteTripHistorySite(rawSite);
      if (!site) return res.status(400).json({ message: "site is required" });
      if (!await assertTripSiteAccess(req, res, site)) return;
      const suggestions = await storage.getSiteMaterialTripSuggestions(site);
      // Older storage adapters may still return the pre-association shape;
      // leave that shape untouched for compatibility.  The production
      // storage implementation always returns the augmented contract.
      if ("vehicleSuppliers" in suggestions) {
        res.json({
          ...suggestions,
          canCorrectVehicleSupplier: !!(
            req.authUser?.isAdmin ||
            req.authUser?.isOwner ||
            req.authPermissions?.site_materials?.edit
          ),
        });
      } else {
        res.json(suggestions);
      }
    } catch (err) {
      console.error("Error fetching site material trip suggestions:", err);
      res.status(500).json({ message: "Failed to fetch site material trip suggestions" });
    }
  });

  // Correct the global future vehicle→supplier association.  This is
  // deliberately separate from ordinary trip edits: historical trip fields
  // remain factual, while this action requires an explicit optimistic
  // correction and is audited with before/after values.
  
```

## PATCH /api/site-material-trips/vehicle-supplier — server/routes.ts:755

```typescript
app.patch("/api/site-material-trips/vehicle-supplier", async (req, res) => {
    try {
      if (!assertEdit(req, res, "site_materials")) return;
      const input = z.object({
        site: z.string().trim().min(1),
        vehicleNumber: z.string().trim().min(1),
        supplier: z.string().trim().min(1),
        expectedVersion: z.string().nullable(),
        expectedSupplier: z.string().nullable(),
      }).strict().parse(req.body);
      const site = normalizeSiteTripHistorySite(input.site);
      const vehicleKey = normalizeVehicleSupplierVehicle(input.vehicleNumber);
      if (!site || !vehicleKey) return res.status(400).json({ message: "site and vehicleNumber are required" });
      if (!await assertTripSiteAccess(req, res, site)) return;
      if (await storage.hasActiveSiteMaterialTripVehicle(site, input.vehicleNumber) !== true) {
        return res.status(403).json({ message: "Vehicle is not present in active history for this site" });
      }
      const corrected = await storage.correctVehicleSupplierAssociation({
        ...input,
        site,
        actor: {
          userId: req.authUser!.id,
          userName: currentUserName(req),
          userRole: req.authUser!.isOwner ? "owner" : req.authUser!.isAdmin ? "admin" : "manager",
        },
      });
      res.json(corrected.association);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid vehicle supplier association" });
      }
      if ((err as any)?.code === "VEHICLE_SUPPLIER_ASSOCIATION_VERSION_CONFLICT") {
        return res.status(409).json({
          message: err.message,
          code: err.code,
          currentVersion: err.currentVersion,
        });
      }
      if ((err as any)?.code === "VEHICLE_SUPPLIER_ASSOCIATION_HISTORY_ACCESS") {
        return res.status(403).json({ message: err.message, code: err.code });
      }
      console.error("PATCH /api/site-material-trips/vehicle-supplier:", err);
      res.status(500).json({ message: "Failed to correct vehicle supplier association" });
    }
  });

  // Get all site material trips (with optional filters)
  
```

## GET /api/site-material-trips — server/routes.ts:822

```typescript
app.get("/api/site-material-trips", async (req, res) => {
    try {
      const permittedSiteNames = await getPermittedSiteNames(req);
      const filters = {
        site: req.query.site as string | undefined,
        material: req.query.material as string | undefined,
        vehicleNumber: typeof req.query.vehicleNumber === "string" ? req.query.vehicleNumber.trim() || undefined : undefined,
        supplier: typeof req.query.supplier === "string" ? req.query.supplier.trim() || undefined : undefined,
        onlyUnassigned: req.query.onlyUnassigned === "true",
        onlyWithoutArrangement: req.query.onlyWithoutArrangement === "true",
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        indentItemId: req.query.indentItemId ? parseInt(req.query.indentItemId as string) : undefined,
        indentId: req.query.indentId ? parseInt(req.query.indentId as string) : undefined,
        boqProjectId: req.query.boqProjectId ? parseInt(req.query.boqProjectId as string) : undefined,
        boqItemId: req.query.boqItemId ? parseInt(req.query.boqItemId as string) : undefined,
        programmeBarId: req.query.programmeBarId ? parseInt(req.query.programmeBarId as string) : undefined,
        earthworkArrangementId: req.query.earthworkArrangementId ? parseInt(req.query.earthworkArrangementId as string) : undefined,
        ...(permittedSiteNames !== null && !req.query.indentItemId && !req.query.indentId ? { permittedSiteNames } : {}),
      };
      const trips = await storage.getSiteMaterialTrips(filters);
      res.json(trips);
    } catch (err) {
      console.error("Error fetching site material trips:", err);
      res.status(500).json({ message: "Failed to fetch site material trips" });
    }
  });

  
```

## POST /api/site-material-trips/material-source/bulk — server/routes.ts:850

```typescript
app.post("/api/site-material-trips/material-source/bulk", async (req, res) => {
    try {
      if (!assertEdit(req, res, "site_materials")) return;
      const input = z.object({
        dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        site: z.string().trim().min(1).optional(),
        material: z.string().trim().min(1).optional(),
        vehicleNumber: z.string().trim().min(1).optional(),
        supplier: z.string().trim().min(1).optional(),
        onlyUnassigned: z.boolean().optional(),
        materialSourceSupplier: z.string().trim().min(1),
      }).strict().refine(value => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo, {
        message: "dateFrom must be on or before dateTo",
      }).refine(value => !!(
        value.dateFrom || value.dateTo || value.site || value.material ||
        value.vehicleNumber || value.supplier || value.onlyUnassigned
      ), { message: "At least one trip filter is required" }).parse(req.body);
      if (input.site && !await assertTripSiteAccess(req, res, input.site)) return;
      const permittedSiteNames = await getPermittedSiteNames(req);
      const result = await storage.bulkAssignSiteMaterialTripMaterialSource({
        ...input,
        ...(permittedSiteNames !== null ? { permittedSiteNames } : {}),
        actor: {
          userId: req.authUser!.id,
          userName: currentUserName(req),
          userRole: req.authUser!.isOwner ? "owner" : req.authUser!.isAdmin ? "admin" : "manager",
        },
      });
      if (result.updatedCount === 0) {
        return res.status(409).json({
          code: "NO_MATCHING_TRIPS",
          message: "No trips were updated. Refresh the trips and check the filters and site access before retrying.",
          updatedCount: 0,
        });
      }
      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError || (err as any)?.code === "BAD_REQUEST") {
        return res.status(400).json({ message: err instanceof z.ZodError ? err.errors[0]?.message : (err as any).message });
      }
      console.error("POST /api/site-material-trips/material-source/bulk:", err);
      res.status(500).json({ message: "Failed to bulk assign material source supplier" });
    }
  });

  // Operational picker only: no contacts, banking, tax, activity or master edits.
  
```

## GET /api/site-material-trips/vendor-options — server/routes.ts:897

```typescript
app.get("/api/site-material-trips/vendor-options", async (req, res) => {
    try {
      if (!assertEdit(req, res, "site_materials")) return;
      const site = z.string().trim().min(1).parse(req.query.site);
      if (!await assertTripSiteAccess(req, res, site)) return;
      res.json(await db.select({ id: vendors.id, name: vendors.name, isActive: vendors.isActive }).from(vendors).orderBy(vendors.name));
    } catch (err) {
      res.status(err instanceof z.ZodError ? 400 : 500).json({ message: "Could not load trip vendor options." });
    }
  });

  
```

## GET /api/site-material-trips/arrangement-options — server/routes.ts:908

```typescript
app.get("/api/site-material-trips/arrangement-options", async (req, res) => {
    try {
      if (!assertEdit(req, res, "site_materials")) return;
      const site = z.string().trim().min(1).parse(req.query.site);
      if (!await assertTripSiteAccess(req, res, site)) return;
      res.json(await tripArrangementOptions(site));
    } catch (err) {
      res.status(err instanceof z.ZodError ? 400 : 500).json({message:"Could not load this site's arrangements."});
    }
  });
  for (const mode of ["preview", "bulk"] as const) {
    app.post(`/api/site-material-trips/arrangement/${mode}`, async (req, res) => {
      try {
        if (!assertEdit(req, res, "site_materials")) return;
        const input = bulkTripArrangementSchema.parse(req.body);
        if (!await assertTripSiteAccess(req, res, input.site)) return;
        const permittedSiteNames = await getPermittedSiteNames(req);
        const result = await bulkLinkTripArrangement({
          ...input, ...(permittedSiteNames !== null ? {permittedSiteNames} : {}),
        }, mode === "bulk" ? {
          userId: req.authUser!.id, userName: currentUserName(req),
          userRole: req.authUser!.isOwner ? "owner" : req.authUser!.isAdmin ? "admin" : "manager",
        } : undefined);
        res.json(result);
      } catch (err) {
        const status = err instanceof z.ZodError ? 400 : (err as any)?.status ?? 500;
        res.status(status).json({code:(err as any)?.code, message: status === 500 ? "Arrangement linking failed. Nothing was changed." : err instanceof z.ZodError ? err.errors[0]?.message : (err as Error).message});
      }
    });
  }

  // 06S §2: procurement match for a Site Material Trip — informational/
  // auto-fill only. Explicit requirement→PI chain; never fuzzy, never blocks,
  // never creates anything.
  
```

## POST /api/site-material-trips — server/routes.ts:1043

```typescript
app.post("/api/site-material-trips", async (req, res) => {
    try {
      if (!assertCreate(req, res, "site_materials")) return;
      const input = insertSiteMaterialTripSchema.parse(req.body);
      if (input.materialSourceType === "own_source") {
        if (!input.materialSourceLabel?.trim()) return res.status(400).json({ message: "Enter the borrow area / source description." });
        input.materialSourceSupplier = null;
        input.materialSourceLabel = input.materialSourceLabel.trim();
      } else {
        input.materialSourceLabel = null;
      }
      if (!await assertTripSiteAccess(req, res, input.site)) return;
      // New receipts must declare their transport route.  The base insert
      // schema intentionally remains nullable because historical data and
      // PATCH payloads need to remain backward compatible.
      if (input.transportType !== "in_house" && input.transportType !== "agency_vendor") {
        return res.status(400).json({ message: "transportType must be in_house or agency_vendor" });
      }
      if (input.internalEquipmentId != null && input.transportType !== "in_house") {
        return res.status(400).json({ message: "internalEquipmentId is only allowed for in-house transport" });
      }
      const linkageError = await validateTripLinkage({ ...input, operationalDate: input.date, requireProjectItemPair: true });
      if (linkageError) return res.status(400).json({ message: linkageError });
      const trip = await storage.createSiteMaterialTrip(input);
      sendPushToSection("site_materials", "Site Material Trip Added", `${input.material || 'Material'} - ${input.site || ''}`, "/site-reports").catch(() => {});
      res.status(201).json(trip);
    } catch (err) {
      console.error("Error creating site material trip:", err);
      res.status(500).json({ message: "Failed to create site material trip" });
    }
  });

  // Update a site material trip
  
```

## PATCH /api/site-material-trips/:id — server/routes.ts:1076

```typescript
app.patch("/api/site-material-trips/:id", async (req, res) => {
    try {
      if (!assertEdit(req, res, "site_materials")) return;
      const id = Number(req.params.id);
      const input = insertSiteMaterialTripSchema.partial().parse(req.body);
      const existing = await storage.getSiteMaterialTripById(id);
      if (!existing) return res.status(404).json({ message: "Site material trip not found" });
      if (!await assertTripSiteAccess(req, res, existing.site)) return;
      if (("materialSourceType" in input ? input.materialSourceType : existing.materialSourceType) === "own_source") {
        input.materialSourceSupplier = null;
      } else if ("materialSourceType" in input || "materialSourceLabel" in input) {
        input.materialSourceLabel = null;
      }
      if ("site" in input && !await assertTripSiteAccess(req, res, input.site)) return;
      if (input.transportType != null && input.transportType !== "in_house" && input.transportType !== "agency_vendor") {
        return res.status(400).json({ message: "transportType must be in_house or agency_vendor" });
      }
      // A transport-type correction away from in-house must not leave an
      // internal-master link attached to the same trip.
      if (input.transportType === "agency_vendor") input.internalEquipmentId = null;
      if (input.internalEquipmentId != null && input.transportType !== "in_house") {
        if ((input.transportType ?? existing.transportType) !== "in_house") {
          return res.status(400).json({ message: "internalEquipmentId is only allowed for in-house transport" });
        }
      }
      if ("boqProjectId" in input || "boqItemId" in input || "programmeBarId" in input || "earthworkArrangementId" in input || "site" in input) {
        // DPR-02: correcting an existing link is a normal deliberate edit.
        // Validate the complete resulting row atomically instead of requiring
        // an unsafe two-request "unlink, then relink" transition.
        const merged = mergeMaterialTripLinkage(existing, input);
        if (merged.boqProjectId != null || merged.boqItemId != null || merged.programmeBarId != null || merged.earthworkArrangementId != null) {
          const linkageError = await validateTripLinkage({
            ...merged,
            site: ("site" in input ? input.site : existing.site) ?? null,
            operationalDate: ("date" in input ? input.date : existing.date) ?? null,
            allowHistoricalArrangementId: existing.earthworkArrangementId,
            requireProjectItemPair: true,
          });
          if (linkageError) return res.status(400).json({ message: linkageError });
        }
      }
      const trip = await storage.updateSiteMaterialTrip(id, input, {
        userId: req.authUser!.id,
        userName: currentUserName(req),
        userRole: req.authUser!.isOwner ? "owner" : req.authUser!.isAdmin ? "admin" : "manager",
      });
      if (!trip) return res.status(404).json({ message: "Site material trip not found" });
      sendPushToSection("site_materials", "Site Material Trip Updated", `Trip #${id} updated`, "/site-reports").catch(() => {});
      res.json(trip);
    } catch (err) {
      console.error("Error updating site material trip:", err);
      res.status(500).json({ message: "Failed to update site material trip" });
    }
  });

  // Delete a site material trip
  
```

## DELETE /api/site-material-trips/:id — server/routes.ts:1132

```typescript
app.delete("/api/site-material-trips/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const id = Number(req.params.id);
      await storage.deleteSiteMaterialTrip(id);
      await storage.logAudit({
        module: "site_material_trips",
        transactionId: id,
        action: "delete",
        userId: req.authUser!.id,
        userName: currentUserName(req),
        userRole: req.authUser!.isOwner ? "owner" : req.authUser!.isAdmin ? "admin" : "manager",
      });
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting site material trip:", err);
      res.status(500).json({ message: "Failed to delete site material trip" });
    }
  });

  // Cancel a site material trip (stock-affecting: flagged for reversal, not hard-deleted)
  
```

## POST /api/site-material-trips/:id/cancel — server/routes.ts:1153

```typescript
app.post("/api/site-material-trips/:id/cancel", async (req, res) => {
    try {
      if (!assertDeleteOrCancel(req, res, "site_materials")) return;
      const id = Number(req.params.id);
      const reason = String(req.body?.reason || "").trim();
      if (!reason) return res.status(400).json({ message: "Cancellation reason is required" });
      const updated = await storage.cancelSiteMaterialTrip(id, req.authUser!.id, reason);
      if (!updated) return res.status(404).json({ message: "Site material trip not found" });
      await storage.logAudit({
        module: "site_material_trips",
        transactionId: id,
        action: "cancel",
        userId: req.authUser!.id,
        userName: currentUserName(req),
        userRole: req.authUser!.isOwner ? "owner" : req.authUser!.isAdmin ? "admin" : "manager",
        newValues: updated,
        reason,
        stockImpact: "Trip cancelled; reverse via stock ledger reassignment/transfer tool if already posted",
      });
      res.json(updated);
    } catch (err) {
      console.error("POST /api/site-material-trips/:id/cancel:", err);
      res.status(500).json({ message: "Failed to cancel site material trip" });
    }
  });

  // Site Material Stock & Reconciliation (per site: ordered / delivered / consumed / lying)
  
```

## GET /api/purchase-indents — server/routes.ts:9070

```typescript
app.get("/api/purchase-indents", async (req, res) => {
    try {
      if (!assertPiRaiserRead(req, res)) return;
      const filters = {
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        status: req.query.status as string | undefined,
        priority: req.query.priority as string | undefined,
      };
      const indents = await storage.getPurchaseIndents(filters);
      const permitted = await getPermittedSiteNames(req);
      if (permitted === null) return res.json(indents);
      const sites = await storage.getSites();
      res.json(indents.filter(indent => {
        const name = sites.find(site => site.id === indent.siteId)?.name ?? indent.raisedFrom;
        return !!name && siteMatchesPermitted(name, permitted);
      }));
    } catch (err) {
      console.error("Error fetching purchase indents:", err);
      res.status(500).json({ message: "Failed to fetch purchase indents" });
    }
  });

  
```

## GET /api/purchase-indents/for-material — server/routes.ts:9093

```typescript
app.get("/api/purchase-indents/for-material", async (req, res) => {
    try {
      const q = ((req.query.q as string) || (req.query.name as string) || "").toLowerCase().trim();
      const indents = await storage.getPurchaseIndents();
      const activeStatuses = ["approved", "pending", "stores_check"];
      const filtered = q
        ? indents.filter(i =>
            activeStatuses.includes(i.status) &&
            i.items.some(it => (it.description || "").toLowerCase().includes(q))
          )
        : indents.filter(i => activeStatuses.includes(i.status));
      res.json(filtered);
    } catch (err) {
      console.error("Error fetching purchase indents for material:", err);
      res.status(500).json({ message: "Failed to fetch purchase indents" });
    }
  });

  
```

## GET /api/purchase-indents/summary — server/routes.ts:9111

```typescript
app.get("/api/purchase-indents/summary", async (req, res) => {
    try {
      const all = await storage.getPurchaseIndents();
      const summary = {
        total: all.length,
        // pendingStores = legacy "pending" + stores_check with no/null storesStatus
        pending: all.filter(i => i.status === "pending" || (i.status === "stores_check" && !(i as any).storesStatus)).length,
        // storesCheck (AWAITING APPROVAL) = stores_check with storesStatus "verified" or "bypass_requested"
        storesCheck: all.filter(i => i.status === "stores_check" && ((i as any).storesStatus === "verified" || (i as any).storesStatus === "bypass_requested")).length,
        approved: all.filter(i => i.status === "approved").length,
        rejected: all.filter(i => i.status === "rejected").length,
        completed: all.filter(i => i.status === "completed").length,
      };
      res.json(summary);
    } catch (err) {
      console.error("Error fetching purchase indent summary:", err);
      res.status(500).json({ message: "Failed to fetch purchase indent summary" });
    }
  });

  
```

## GET /api/purchase-indents/report — server/routes.ts:9131

```typescript
app.get("/api/purchase-indents/report", async (req, res) => {
    try {
      const filters = {
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        purchaseStatus: req.query.purchaseStatus as string | undefined,
        purpose: req.query.purpose as string | undefined,
        vendor: req.query.vendor as string | undefined,
        paymentMode: req.query.paymentMode as string | undefined,
      };
      const report = await storage.getProcurementReport(filters);
      res.json(report);
    } catch (err) {
      console.error("Error fetching procurement report:", err);
      res.status(500).json({ message: "Failed to fetch procurement report" });
    }
  });

  
```

## GET /api/purchase-indents/route-corrections — server/routes.ts:9149

```typescript
app.get("/api/purchase-indents/route-corrections", async (req, res) => {
    try {
      if (!assertPiRaiserRead(req, res)) return;
      const permitted = await getPermittedSiteNames(req);
      const rows = await storage.scanPurchaseIndentRouteCorrections(permitted ?? undefined);
      res.json(rows);
    } catch (err) {
      console.error("Error scanning PI route corrections:", err);
      res.status(500).json({ message: "Failed to scan purchase indent route corrections" });
    }
  });

  
```

## POST /api/purchase-indents/route-corrections/apply — server/routes.ts:9161

```typescript
app.post("/api/purchase-indents/route-corrections/apply", async (req, res) => {
    try {
      if (!assertPiRaiserRead(req, res)) return;
      if (!assertEditEither(req, res, "site_procurement", "purchase_indents_raise")) return;
      const body = z.object({
        items: z.array(z.object({
          itemId: z.number().int().positive(),
          expectedProcurementRoute: z.string().nullable(),
        })).min(1).max(500),
      }).parse(req.body);
      const permitted = await getPermittedSiteNames(req);
      const result = await storage.applyPurchaseIndentRouteCorrections({
        items: body.items,
        permittedSiteNames: permitted ?? undefined,
        actor: {
          userId: req.authUser!.id,
          userName: currentUserName(req),
          userRole: req.authUser!.isOwner ? "owner" : req.authUser!.isAdmin ? "admin" : null,
        },
      });
      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid correction selection" });
      }
      if (err instanceof PurchaseIndentRouteCorrectionConflictError) {
        return res.status(409).json({ code: err.code, message: err.message, conflicts: err.conflicts });
      }
      console.error("Error applying PI route corrections:", err);
      res.status(500).json({ message: "Failed to apply purchase indent route corrections" });
    }
  });

  async function assertPiDeliveryScope(req: Express.Request, res: Response, indentId: number, destinations: any[] = []) {
    const indent = await storage.getPurchaseIndent(indentId);
    if (!indent) { res.status(404).json({ message: "Purchase indent not found" }); return false; }
    const sites = await storage.getSites();
    const source = sites.find(s => s.id === indent.siteId)?.name ?? indent.raisedFrom;
    const permitted = await getPermittedSiteNames(req);
    if (permitted !== null && (!source || !siteMatchesPermitted(source, permitted))) {
      res.status(403).json({ message: "Access denied for this site" }); return false;
    }
    for (const destination of destinations) {
      if (destination.receivingLocation === "site") {
        const site = sites.find(s => s.id === destination.receivingSiteId);
        if (!site) { res.status(400).json({ message: "Valid receiving site is required" }); return false; }
        if (!await assertTripSiteAccess(req, res, site.name)) return false;
      }
    }
    return true;
  }

  
```

## PATCH /api/purchase-indents/:id/items/:itemId/destination — server/routes.ts:9213

```typescript
app.patch("/api/purchase-indents/:id/items/:itemId/destination", async (req, res) => {
    try {
      if (!assertEditEither(req, res, "site_procurement", "purchase_indents_raise")) return;
      const indentId = Number(req.params.id), itemId = Number(req.params.itemId);
      if (!await assertPiDeliveryScope(req, res, indentId, [req.body])) return;
      await storage.setPurchaseIndentDestination(indentId, itemId, req.body.receivingLocation, req.body.receivingSiteId, req.authUser?.id ?? 0, currentUserName(req));
      res.json(await storage.getPurchaseIndent(indentId));
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  
```

## GET /api/purchase-indents/:id — server/routes.ts:9225

```typescript
app.get("/api/purchase-indents/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!assertPiRaiserRead(req, res)) return;
      if (!await assertPiDeliveryScope(req, res, id)) return;
      const indent = await storage.getPurchaseIndent(id);
      if (!indent) {
        return res.status(404).json({ message: "Purchase indent not found" });
      }
      res.json(indent);
    } catch (err) {
      console.error("Error fetching purchase indent:", err);
      res.status(500).json({ message: "Failed to fetch purchase indent" });
    }
  });

  const poFields = z.object({
    orderNo: z.string().max(120).nullable().optional(),
    vendorId: z.number().int().positive().nullable().optional(),
    vendorName: z.string().trim().min(1).max(300),
    description: z.string().trim().min(1).max(1000),
    spec: z.string().max(500).nullable().optional(),
    quantity: z.number().positive().finite(),
    unit: z.string().trim().min(1).max(80),
    rate: z.number().nonnegative().finite().nullable(),
    expectedDelivery: z.string().max(150).nullable().optional(),
    paymentTerms: z.string().max(250).nullable().optional(),
    destination: z.string().max(350).nullable().optional(),
  }).strict();

  async function scopedPoItem(req: Request, res: Response) {
    const indentId = Number(req.params.id), itemId = Number(req.params.itemId);
    if (!Number.isSafeInteger(indentId) || indentId < 1 || !Number.isSafeInteger(itemId) || itemId < 1) {
      res.status(400).json({ message: "Invalid indent or item ID" }); return null;
    }
    if (!await assertPiDeliveryScope(req, res, indentId)) return null;
    const indent = await storage.getPurchaseIndent(indentId);
    const item = indent?.items.find(row => row.id === itemId);
    if (!indent || !item) { res.status(404).json({ message: "Purchase indent item not found" }); return null; }
    return { indent, item };
  }
  async function poDetails(order: typeof purchaseOrders.$inferSelect) {
    const [raiser] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, order.raisedByUserId));
    const [approver] = order.approvedByUserId
      ? await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, order.approvedByUserId))
      : [];
    return { ...order, raisedByName: raiser?.fullName ?? null, approvedByName: approver?.fullName ?? null };
  }
  async function poPdf(order: typeof purchaseOrders.$inferSelect, indentNo: string) {
    const details = await poDetails(order);
    if (!details.raisedByName || !details.approvedByName || !order.approvedAt) throw new Error("PO actor names and approval date are required for the final PDF");
    const company = await getCompanyConfig();
    return buildPurchaseOrderPdf({
      companyName: company.companyName, logoPath: getCompanyLogoPath(company.logoFile),
      indentNo, orderNo: order.orderNo?.trim() || `PO-${order.id}`,
      orderDate: order.approvedAt, vendor: order.vendorName,
      vendorBusinessName: order.vendorBusinessName, vendorGst: order.vendorGst,
      vendorPan: order.vendorPan, vendorAddress: order.vendorAddress,
      description: order.description, spec: order.spec, qty: order.quantity,
      unit: order.unit, rate: order.rate, expectedDelivery: order.expectedDelivery,
      paymentTerms: order.paymentTerms, destination: order.destination,
      raisedBy: details.raisedByName, raisedAt: order.raisedAt,
      approvedBy: details.approvedByName, approvedAt: order.approvedAt,
    });
  }
  const poError = (err: any, res: Response) => {
    if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message });
    if (/^(Purchase indent item (no longer exists|changed)|Purchase Order requires|Only the PI item's reviewed)/.test(err?.message ?? ""))
      return res.status(409).json({ message: err.message });
    if (err?.code === "23505") return res.status(409).json({ message: "This item already has an active Purchase Order" });
    console.error("Purchase Order request failed:", err);
    return res.status(500).json({ message: "Purchase Order request failed" });
  };
  const activePo = async (itemId: number) => db.select().from(purchaseOrders)
    .where(and(eq(purchaseOrders.purchaseIndentItemId, itemId), sql`${purchaseOrders.status} <> 'rejected'`)).limit(1);
  const linkedPoNameMatches = (submitted: string, canonical: string) =>
    submitted.trim().replace(/\s+/g, " ").toLocaleLowerCase() === canonical.trim().replace(/\s+/g, " ").toLocaleLowerCase();

  // A scoped pending list: unlike a global counter, this never leaks inaccessible sites.
  
```

## GET /api/purchase-indents/:id/items/:itemId/purchase-order — server/routes.ts:9321

```typescript
app.get("/api/purchase-indents/:id/items/:itemId/purchase-order", async (req, res) => {
    try {
      if (!assertPiRaiserRead(req, res)) return;
      const scoped = await scopedPoItem(req, res);
      if (!scoped) return;
      const [order] = await activePo(scoped.item.id);
      const item = scoped.item;
      const [vendor] = item.vendorId ? await db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, item.vendorId)).limit(1) : [];
      const sites = await storage.getSites();
      const location = (item as any).receivingLocation;
      const destination = location === "site" ? sites.find(s => s.id === (item as any).receivingSiteId)?.name
        : location === "hmp_plant" ? "HMP Plant" : location === "rmc_plant" ? "RMC Plant" : null;
      res.json({
        order: order ? await poDetails(order) : null,
        defaults: {
          orderNo: item.orderNo || "", vendorId: item.vendorId ?? null, vendorName: vendor?.name || item.vendor || "",
          description: item.description, spec: item.spec || "", quantity: Number(item.orderedQty ?? item.qtyPurchased ?? item.approvedQty ?? item.qty),
          unit: item.uom, rate: item.rate == null ? null : Number(item.rate),
          expectedDelivery: item.expectedDelivery || "", paymentTerms: item.paymentMode || "",
          destination: destination || "",
        },
      });
    } catch (err) { poError(err, res); }
  });

  
```

## POST /api/purchase-indents/:id/items/:itemId/purchase-order — server/routes.ts:9346

```typescript
app.post("/api/purchase-indents/:id/items/:itemId/purchase-order", async (req, res) => {
    try {
      if (!assertCreateEither(req, res, "site_procurement", "purchase_indents_raise")) return;
      const scoped = await scopedPoItem(req, res);
      if (!scoped) return;
      // An approved PI item can get a PO before or after its independent order-recording action.
      if (["pending", "stores_check", "rejected"].includes(scoped.indent.status) || Number(scoped.item.approvedQty ?? scoped.item.qty) <= 0)
        return res.status(409).json({ message: "Purchase Order requires an approved Purchase Indent item" });
      const fields = poFields.parse(req.body);
      if (fields.vendorId && fields.vendorId !== scoped.item.vendorId)
        return res.status(400).json({ message: "Only the PI item's reviewed Vendor Master link may be used" });
      const [linkedVendor] = fields.vendorId
        ? await db.select({ id: vendors.id, name: vendors.name, businessName: vendors.businessName, gstNumber: vendors.gstNumber, panNumber: vendors.panNumber, address: vendors.address }).from(vendors).where(eq(vendors.id, fields.vendorId)).limit(1) : [];
      if (fields.vendorId && !linkedVendor) return res.status(400).json({ message: "Linked vendor not found" });
      if (linkedVendor && !linkedPoNameMatches(fields.vendorName, linkedVendor.name))
        return res.status(400).json({ message: "Vendor name does not match the linked Vendor Master record; clear the link to use a different name" });
      const order = await db.transaction(async tx => {
        const [indent] = await tx.select({ status: purchaseIndentsTable.status }).from(purchaseIndentsTable)
          .where(eq(purchaseIndentsTable.id, scoped.indent.id)).for("update");
        const [item] = await tx.select({
          qty: purchaseIndentItems.qty, approvedQty: purchaseIndentItems.approvedQty,
          uom: purchaseIndentItems.uom, materialId: purchaseIndentItems.materialId,
          vendorId: purchaseIndentItems.vendorId,
        }).from(purchaseIndentItems)
          .where(and(eq(purchaseIndentItems.id, scoped.item.id), eq(purchaseIndentItems.indentId, scoped.indent.id))).for("update");
        if (!indent || !item) throw new Error("Purchase indent item no longer exists. Refresh and try again.");
        if (["pending", "stores_check", "rejected"].includes(indent.status) || Number(item.approvedQty ?? item.qty) <= 0)
          throw new Error("Purchase Order requires an approved Purchase Indent item");
        if (fields.vendorId && fields.vendorId !== item.vendorId)
          throw new Error("Only the PI item's reviewed Vendor Master link may be used");
        // Reject a stale form rather than ordering a snapshot of changed material.
        if (item.qty !== scoped.item.qty || item.uom !== scoped.item.uom || item.materialId !== (scoped.item.materialId ?? null))
          throw new Error("Purchase indent item changed. Refresh and try again.");
        const [order] = await tx.insert(purchaseOrders).values({
        ...fields, vendorName: linkedVendor?.name ?? fields.vendorName,
        purchaseIndentId: scoped.indent.id, purchaseIndentItemId: scoped.item.id,
        raisedByUserId: req.authUser!.id,
        vendorBusinessName: linkedVendor?.businessName ?? null, vendorGst: linkedVendor?.gstNumber ?? null,
        vendorPan: linkedVendor?.panNumber ?? null, vendorAddress: linkedVendor?.address ?? null,
        }).returning();
        return order;
      });
      res.status(201).json(await poDetails(order));
    } catch (err) { poError(err, res); }
  });

  
```

## PATCH /api/purchase-indents/:id/items/:itemId/purchase-order — server/routes.ts:9392

```typescript
app.patch("/api/purchase-indents/:id/items/:itemId/purchase-order", async (req, res) => {
    try {
      if (!assertCreateEither(req, res, "site_procurement", "purchase_indents_raise")) return;
      const scoped = await scopedPoItem(req, res);
      if (!scoped) return;
      const fields = poFields.parse(req.body);
      if (fields.vendorId && fields.vendorId !== scoped.item.vendorId)
        return res.status(400).json({ message: "Only the PI item's reviewed Vendor Master link may be used" });
      const [linkedVendor] = fields.vendorId
        ? await db.select({ id: vendors.id, name: vendors.name, businessName: vendors.businessName, gstNumber: vendors.gstNumber, panNumber: vendors.panNumber, address: vendors.address }).from(vendors).where(eq(vendors.id, fields.vendorId)).limit(1) : [];
      if (fields.vendorId && !linkedVendor) return res.status(400).json({ message: "Linked vendor not found" });
      if (linkedVendor && !linkedPoNameMatches(fields.vendorName, linkedVendor.name))
        return res.status(400).json({ message: "Vendor name does not match the linked Vendor Master record; clear the link to use a different name" });
      const [order] = await db.update(purchaseOrders).set({
        ...fields, vendorName: linkedVendor?.name ?? fields.vendorName,
        vendorBusinessName: linkedVendor?.businessName ?? null,
        vendorGst: linkedVendor?.gstNumber ?? null, vendorPan: linkedVendor?.panNumber ?? null,
        vendorAddress: linkedVendor?.address ?? null, updatedAt: new Date(),
      }).where(and(eq(purchaseOrders.purchaseIndentItemId, scoped.item.id), eq(purchaseOrders.status, "draft"))).returning();
      if (!order) return res.status(409).json({ message: "Only an active draft can be edited" });
      res.json(await poDetails(order));
    } catch (err) { poError(err, res); }
  });

  
```

## POST /api/purchase-indents/:id/items/:itemId/purchase-order/submit — server/routes.ts:9416

```typescript
app.post("/api/purchase-indents/:id/items/:itemId/purchase-order/submit", async (req, res) => {
    try {
      if (!assertCreateEither(req, res, "site_procurement", "purchase_indents_raise")) return;
      const scoped = await scopedPoItem(req, res);
      if (!scoped) return;
      const [order] = await db.update(purchaseOrders).set({ status: "submitted", submittedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(purchaseOrders.purchaseIndentItemId, scoped.item.id), eq(purchaseOrders.status, "draft"))).returning();
      if (!order) return res.status(409).json({ message: "Only a draft can be submitted" });
      res.json(await poDetails(order));
    } catch (err) { poError(err, res); }
  });

  
```

## POST /api/purchase-indents/:id/items/:itemId/purchase-order/decision — server/routes.ts:9428

```typescript
app.post("/api/purchase-indents/:id/items/:itemId/purchase-order/decision", async (req, res) => {
    try {
      if (!assertApprove(req, res, "purchase_indents_approve")) return;
      const scoped = await scopedPoItem(req, res);
      if (!scoped) return;
      const decision = z.object({ action: z.enum(["approve", "reject"]), reason: z.string().trim().max(500).optional() }).strict().parse(req.body);
      if (decision.action === "reject" && !decision.reason) return res.status(400).json({ message: "Rejection reason is required" });
      const [current] = await activePo(scoped.item.id);
      if (!current || current.status !== "submitted") return res.status(409).json({ message: "Only a submitted PO can be reviewed" });
      if (!req.authUser?.isAdmin && (current.raisedByUserId === req.authUser?.id || scoped.indent.authorUserId === req.authUser?.id))
        return res.status(403).json({ message: "You cannot approve a record you raised." });
      const now = new Date();
      const next = decision.action === "approve"
        ? { status: "approved", approvedByUserId: req.authUser!.id, approvedAt: now, updatedAt: now }
        : { status: "rejected", rejectionReason: decision.reason, updatedAt: now };
      // Verify that the finalized document is renderable before committing approval.
      if (decision.action === "approve") await poPdf({
        ...current, status: "approved", approvedByUserId: req.authUser!.id, approvedAt: now,
      }, scoped.indent.indentNo);
      const [order] = await db.update(purchaseOrders).set(next).where(and(eq(purchaseOrders.id, current.id), eq(purchaseOrders.status, "submitted"))).returning();
      if (!order) return res.status(409).json({ message: "PO was already reviewed" });
      res.json(await poDetails(order));
    } catch (err) { poError(err, res); }
  });

  // The former instant-export URL now enforces approval, even for direct callers.
  
```

## GET /api/purchase-indents/:id/items/:itemId/purchase-order.pdf — server/routes.ts:9454

```typescript
app.get("/api/purchase-indents/:id/items/:itemId/purchase-order.pdf", async (req, res) => {
    if (!assertReportExport(req, res, "purchase_indents_view", "purchase_indents_raise")) return;
    try {
      if (!assertPiRaiserRead(req, res)) return;
      const scoped = await scopedPoItem(req, res);
      if (!scoped) return;
      const [order] = await activePo(scoped.item.id);
      if (!order || order.status !== "approved") return res.status(409).json({ message: "Purchase Order PDF is available only after approval" });
      const pdf = await poPdf(order, scoped.indent.indentNo);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Disposition", `${req.query.preview === "1" ? "inline" : "attachment"}; filename="PurchaseOrder-${order.id}.pdf"`);
      res.send(pdf);
    } catch (err) {
      console.error("Purchase Order PDF export failed:", err);
      res.status(500).json({ message: "Failed to generate Purchase Order PDF" });
    }
  });

  
```

## POST /api/purchase-indents — server/routes.ts:9474

```typescript
app.post("/api/purchase-indents", async (req, res) => {
    try {
      if (!assertCreateEither(req, res, "site_procurement", "purchase_indents_raise")) return;
      const input = createPurchaseIndentRequestSchema.parse(req.body);
      const indent = await storage.createPurchaseIndent(input);
      sendPushToSection("purchase_indents_view", "New Purchase Indent", `${indent.indentNo} raised by ${indent.raisedBy}`, "/plant/purchase-indents").catch(() => {});
      res.status(201).json(indent);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, errors: err.errors });
      }
      console.error("Error creating purchase indent:", err);
      res.status(500).json({ message: "Failed to create purchase indent" });
    }
  });

  
```

## PATCH /api/purchase-indents/:id/approve — server/routes.ts:9490

```typescript
app.patch("/api/purchase-indents/:id/approve", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { pin, approvedItems, remarks } = req.body;

      if (!assertApprove(req, res, "purchase_indents_approve")) return;
      // Self-approval prevention: the approver must differ from the raiser.
      const existingIndent = await storage.getPurchaseIndent(id);
      if (!existingIndent) return res.status(404).json({ message: "Purchase indent not found" });
      if (!req.authUser?.isAdmin && existingIndent.authorUserId && existingIndent.authorUserId === req.authUser?.id) {
        return res.status(403).json({ message: "You cannot approve a record you raised." });
      }

      // Stores verification is mandatory before approval (Material Indents bypass this step).
      const storesStatus = (existingIndent as any).storesStatus;
      const piType = (existingIndent as any).piType ?? "stores";
      if (piType !== "material" && storesStatus !== "verified") {
        return res.status(400).json({
          message: "Stores verification must be completed before this indent can be approved.",
        });
      }

      const approvedBy = currentUserName(req);

      const approvedItemsSchema = z.array(z.object({
        itemId: z.number(),
        approvedQty: z.number(),
      }));
      const validatedItems = approvedItemsSchema.parse(approvedItems);

      const indent = await storage.approvePurchaseIndent(id, validatedItems, approvedBy, remarks, undefined);
      if (!indent) {
        return res.status(404).json({ message: "Purchase indent not found" });
      }
      sendPushToSection("purchase_indents_view", "Indent Approved", `${indent.indentNo} approved by ${approvedBy}`, "/plant/purchase-indents").catch(() => {});
      sendPushToRaiser(indent.authorUserId, indent.raisedBy, "Your Indent Was Approved", `${indent.indentNo} has been approved by ${approvedBy}`, "/plant/purchase-indents").catch(() => {});
      res.json(indent);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error approving purchase indent:", err);
      res.status(500).json({ message: "Failed to approve purchase indent" });
    }
  });

  
```

## PATCH /api/purchase-indents/:id/reject — server/routes.ts:9536

```typescript
app.patch("/api/purchase-indents/:id/reject", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { reason } = req.body;

      if (!assertApprove(req, res, "purchase_indents_approve")) return;
      const rejectedBy = currentUserName(req);

      if (!reason || typeof reason !== "string") {
        return res.status(400).json({ message: "Rejection reason is required" });
      }

      const indent = await storage.rejectPurchaseIndent(id, reason, rejectedBy);
      if (!indent) {
        return res.status(404).json({ message: "Purchase indent not found" });
      }
      sendPushToSection("purchase_indents_view", "Indent Rejected", `${indent.indentNo} rejected by ${rejectedBy}`, "/plant/purchase-indents").catch(() => {});
      sendPushToRaiser(indent.authorUserId, indent.raisedBy, "Your Indent Was Rejected", `${indent.indentNo} has been rejected by ${rejectedBy}`, "/plant/purchase-indents").catch(() => {});
      res.json(indent);
    } catch (err) {
      console.error("Error rejecting purchase indent:", err);
      res.status(500).json({ message: "Failed to reject purchase indent" });
    }
  });

  
```

## PATCH /api/purchase-indents/:id/stores-verify — server/routes.ts:9561

```typescript
app.patch("/api/purchase-indents/:id/stores-verify", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!assertCreate(req, res, "stores_inventory")) return;

      const verifySchema = z.object({
        items: z.array(z.object({
          itemId: z.number(),
          stockStatus: z.string(),
          stockAvailableQty: z.number().optional(),
          storesItemNote: z.string().optional(),
        })),
      });

      const { items } = verifySchema.parse(req.body);
      const verifiedBy = currentUserName(req);

      const indent = await storage.verifyIndentStores(id, items, verifiedBy);
      if (!indent) return res.status(404).json({ message: "Purchase indent not found" });

      sendPushToSection("purchase_indents_view", "Stores Verified", `${indent.indentNo} verified by stores — awaiting manager approval`, "/plant/purchase-indents").catch(() => {});
      res.json(indent);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      if (err instanceof Error && err.message.startsWith("Cannot ")) return res.status(400).json({ message: err.message });
      console.error("Error verifying stores:", err);
      res.status(500).json({ message: "Failed to submit stores verification" });
    }
  });

  
```

## PATCH /api/purchase-indents/:id/stores-bypass — server/routes.ts:9591

```typescript
app.patch("/api/purchase-indents/:id/stores-bypass", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!assertCreate(req, res, "stores_inventory")) return;
      const { reason } = req.body;
      if (!reason?.trim()) {
        return res.status(400).json({ message: "Bypass reason is required" });
      }
      const bypassedBy = currentUserName(req);
      const indent = await storage.bypassIndentStores(id, reason.trim(), bypassedBy);
      if (!indent) return res.status(404).json({ message: "Purchase indent not found" });
      sendPushToSection("purchase_indents_view", "Bypass Requested", `${indent.indentNo} — stores bypass requested by ${bypassedBy}`, "/plant/purchase-indents").catch(() => {});
      res.json(indent);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Cannot ")) return res.status(400).json({ message: err.message });
      console.error("Error bypassing stores:", err);
      res.status(500).json({ message: "Failed to request stores bypass" });
    }
  });

  // ── Material Indent Routes ──────────────────────────────────────────────────

  
```

## POST /api/purchase-indents/:id/place-order — server/routes.ts:9613

```typescript
app.post("/api/purchase-indents/:id/place-order", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!assertCreateEither(req, res, "site_procurement", "purchase_indents_raise")) return;
      const actionBy = currentUserName(req);
      const { items } = req.body;
      if (!await assertPiDeliveryScope(req, res, id, items || [])) return;
      const indent = await storage.placeOrderIndent(id, items || [], actionBy, req.authUser?.id);
      if (!indent) return res.status(404).json({ message: "Indent not found" });
      res.json(indent);
    } catch (err) {
      console.error("Error placing order:", err);
      res.status(400).json({ message: (err as Error).message });
    }
  });

  
```

## POST /api/purchase-indents/:id/record-material-receipt — server/routes.ts:9629

```typescript
app.post("/api/purchase-indents/:id/record-material-receipt", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!assertCreateEither(req, res, "site_procurement", "purchase_indents_raise")) return;
      const actionBy = currentUserName(req);
      const { items } = req.body;
      if (!items?.length) return res.status(400).json({ message: "items array is required" });
      const indent = await storage.recordMaterialIndentReceipt(id, items, actionBy);
      if (!indent) return res.status(404).json({ message: "Indent not found" });
      res.json(indent);
    } catch (err) {
      if (err instanceof Error && (err.message.startsWith("Cannot record receipt:") || err.message.startsWith("Cannot edit purchase indent:")))
        return res.status(400).json({ message: err.message });
      console.error("Error recording material indent receipt:", err);
      res.status(500).json({ message: "Failed to record receipt" });
    }
  });

  
```

## GET /api/purchase-indents/pending-for-material/:materialId — server/routes.ts:9647

```typescript
app.get("/api/purchase-indents/pending-for-material/:materialId", async (req, res) => {
    try {
      if (!assertAuthed(req, res)) return;
      const materialId = Number(req.params.materialId);
      const rows = await storage.getPendingIndentsForMaterial(materialId);
      res.json(rows);
    } catch (err) {
      console.error("Error fetching pending indents for material:", err);
      res.status(500).json({ message: "Failed to fetch pending indents" });
    }
  });

  
```

## PATCH /api/purchase-indents/items/:itemId/link-receipt — server/routes.ts:9659

```typescript
app.patch("/api/purchase-indents/items/:itemId/link-receipt", async (req, res) => {
    try {
      if (!assertAuthed(req, res)) return;
      // Receipt creators or PI raisers may link an existing receipt to a PI item.
      {
        const user = req.authUser!;
        const m = req.authPermissions;
        const ok = user.isAdmin
          || (m?.["plant_stock"]?.create)
          || (m?.["site_procurement"]?.create)
          || (m?.["purchase_indents_raise"]?.create);
        if (!ok) return res.status(403).json({ error: "forbidden", message: "Requires plant_stock:create, site_procurement:create, or purchase_indents_raise:create" });
      }
      const itemId = Number(req.params.itemId);
      const { receiptId } = req.body;
      if (!receiptId) return res.status(400).json({ message: "receiptId is required" });
      const actionBy = currentUserName(req);
      const item = await storage.linkReceiptToIndentItem(itemId, Number(receiptId), actionBy);
      if (!item) return res.status(404).json({ message: "Item or receipt not found" });
      res.json(item);
    } catch (err) {
      console.error("Error linking receipt to indent item:", err);
      res.status(500).json({ message: "Failed to link receipt" });
    }
  });

  // ── Internal Requisition Notes (IRN) ────────────────────────────────────────

  // Returns live stock balances joined with material names for the stores verification form.
  
```

## GET /api/irn/stock-lookup — server/routes.ts:9688

```typescript
app.get("/api/irn/stock-lookup", async (req, res) => {
    try {
      if (!assertAuthed(req, res)) return;
      const rows = await db
        .select({
          materialId: stockBalances.materialId,
          materialName: plantMaterials.name,
          balance: stockBalances.balance,
          uom: stockBalances.uom,
          partyId: stockBalances.partyId,
          conversionFactor: plantMaterials.conversionFactor,
          conversionFromUom: plantMaterials.conversionFromUom,
          conversionToUom: plantMaterials.conversionToUom,
          bulkDensity: plantMaterials.bulkDensity,
        })
        .from(stockBalances)
        .innerJoin(plantMaterials, eq(stockBalances.materialId, plantMaterials.id));
      res.json(rows);
    } catch (err) {
      console.error("Error fetching stock lookup:", err);
      res.status(500).json({ message: "Failed to fetch stock lookup" });
    }
  });

  // Returns IRN items queued for procurement (approved IRNs with items needing a PI).
  
```

## GET /api/irn/procurement-queue — server/routes.ts:9713

```typescript
app.get("/api/irn/procurement-queue", async (req, res) => {
    try {
      if (!assertAuthed(req, res)) return;
      const rows = await db
        .select({
          itemId: internalRequisitionItems.id,
          irnId: internalRequisitions.id,
          irnNo: internalRequisitions.irnNo,
          irnDate: internalRequisitions.date,
          raisedBy: internalRequisitions.raisedBy,
          raisedFrom: internalRequisitions.raisedFrom,
          irnStatus: internalRequisitions.status,
          material: internalRequisitionItems.material,
          qty: internalRequisitionItems.qty,
          uom: internalRequisitionItems.uom,
          urgency: internalRequisitionItems.urgency,
          purpose: internalRequisitionItems.purpose,
          needByDate: internalRequisitionItems.needByDate,
          procureQty: internalRequisitionItems.procureQty,
          itemStatus: internalRequisitionItems.itemStatus,
          storesNotes: internalRequisitionItems.storesNotes,
        })
        .from(internalRequisitionItems)
        .innerJoin(internalRequisitions, eq(internalRequisitionItems.irnId, internalRequisitions.id))
        .where(
          and(
            drizzleInArray(internalRequisitionItems.itemStatus, ["queued_procurement", "partially_issued"]),
            drizzleInArray(internalRequisitions.status, ["approved", "stores_verified"]),
            or(isNull(internalRequisitionItems.procureQty), gt(internalRequisitionItems.procureQty, 0))
          )
        )
        .orderBy(asc(internalRequisitions.date));

      // Attach linkedPiId per IRN
      const irnIds = [...new Set(rows.map(r => r.irnId))];
      const linkedPis = irnIds.length
        ? await db.select({ id: purchaseIndentsTable.id, sourceIrnId: purchaseIndentsTable.sourceIrnId })
            .from(purchaseIndentsTable)
            .where(drizzleInArray(purchaseIndentsTable.sourceIrnId, irnIds))
        : [];
      const linkedPiMap: Record<number, number> = {};
      for (const pi of linkedPis) {
        if (pi.sourceIrnId != null) linkedPiMap[pi.sourceIrnId] = pi.id;
      }

      res.json(rows.map(r => ({ ...r, linkedPiId: linkedPiMap[r.irnId] ?? null })));
    } catch (err) {
      console.error("Error fetching procurement queue:", err);
      res.status(500).json({ message: "Failed to fetch procurement queue" });
    }
  });

  // Creates a PI from all queued/partially-issued items on an approved IRN.
  
```

## POST /api/irn/:id/raise-pi — server/routes.ts:9766

```typescript
app.post("/api/irn/:id/raise-pi", async (req, res) => {
    try {
      if (!assertCreateEither(req, res, "site_procurement", "purchase_indents_raise")) return;
      const irnId = Number(req.params.id);
      if (isNaN(irnId)) return res.status(400).json({ message: "Invalid IRN id" });

      const irn = await storage.getInternalRequisition(irnId);
      if (!irn) return res.status(404).json({ message: "IRN not found" });
      if (!["approved", "stores_verified"].includes(irn.status)) {
        return res.status(400).json({ message: "PI can only be raised for approved or stores-verified IRNs" });
      }

      // Check if a PI already exists for this IRN
      const [existing] = await db.select({ id: purchaseIndentsTable.id })
        .from(purchaseIndentsTable)
        .where(eq(purchaseIndentsTable.sourceIrnId, irnId))
        .limit(1);
      if (existing) {
        return res.status(409).json({ message: "A PI has already been raised for this IRN", piId: existing.id });
      }

      const queuedItems = irn.items.filter(i =>
        ["queued_procurement", "partially_issued"].includes(i.itemStatus) && (i.procureQty ?? i.qty) > 0
      );
      if (!queuedItems.length) {
        return res.status(400).json({ message: "No items queued for procurement on this IRN" });
      }

      const userName = currentUserName(req);
      const indent = await storage.createPurchaseIndent({
        date: new Date().toISOString().slice(0, 10),
        indentNo: "",          // auto-generated inside createPurchaseIndent
        proposedBy: irn.raisedBy,
        raisedBy: userName,
        status: "stores_check",
        remarks: `AUTO-RAISED FROM IRN ${irn.irnNo}`,
        siteId: (irn as any).siteId ?? null,
        raisedFrom: irn.raisedFrom,
        sourceIrnId: irnId,
        items: queuedItems.map(item => ({
          description: item.material,
          qty: item.procureQty ?? item.qty,
          uom: item.uom,
          purpose: item.purpose,
          priority: item.urgency === "urgent" ? "urgent" : item.urgency === "high" ? "high" : "normal",
          requiredBy: item.needByDate ?? null,
          indentId: 0,         // filled by createPurchaseIndent
        } as any)),
      } as any);

      sendPushToSection("purchase_indents_view", "Purchase Indent Raised", `${indent.indentNo} raised from IRN ${irn.irnNo}`, "/plant/purchase-indents").catch(() => {});
      res.status(201).json(indent);
    } catch (err) {
      console.error("Error raising PI from IRN:", err);
      res.status(500).json({ message: "Failed to raise PI" });
    }
  });

  
```

## GET /api/irn — server/routes.ts:9824

```typescript
app.get("/api/irn", async (req, res) => {
    try {
      if (!assertAuthed(req, res)) return;
      const { status, dateFrom, dateTo } = req.query as Record<string, string | undefined>;
      const irns = await storage.getInternalRequisitions({ status, dateFrom, dateTo });
      res.json(irns);
    } catch (err) {
      console.error("Error fetching IRNs:", err);
      res.status(500).json({ message: "Failed to fetch IRNs" });
    }
  });

  
```

## GET /api/irn/:id — server/routes.ts:9836

```typescript
app.get("/api/irn/:id", async (req, res) => {
    try {
      if (!assertAuthed(req, res)) return;
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid IRN id" });
      const irn = await storage.getInternalRequisition(id);
      if (!irn) return res.status(404).json({ message: "IRN not found" });
      res.json(irn);
    } catch (err) {
      console.error("Error fetching IRN:", err);
      res.status(500).json({ message: "Failed to fetch IRN" });
    }
  });

  
```

## POST /api/irn — server/routes.ts:9850

```typescript
app.post("/api/irn", async (req, res) => {
    try {
      if (!assertCreate(req, res, "irn_raise")) return;
      const parsed = createIrnRequestSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Validation error" });
      const irn = await storage.createInternalRequisition(parsed.data);
      sendPushToSection("irn_view", "New IRN Raised", `${irn.irnNo} raised by ${irn.raisedBy}`, "/irn").catch(() => {});
      res.status(201).json(irn);
    } catch (err) {
      console.error("Error creating IRN:", err);
      res.status(500).json({ message: "Failed to create IRN" });
    }
  });

  
```

## PATCH /api/irn/:id/stores-verify — server/routes.ts:9864

```typescript
app.patch("/api/irn/:id/stores-verify", async (req, res) => {
    try {
      if (!assertCreate(req, res, "stores_inventory")) return;
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid IRN id" });
      const parsed = storesVerifyIrnSchema.safeParse({ ...req.body, verifiedBy: currentUserName(req) });
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Validation error" });

      // Server-side quantity validation: issue+queue cannot exceed requested qty
      const existingIrn = await storage.getInternalRequisition(id);
      if (!existingIrn) return res.status(404).json({ message: "IRN not found" });
      for (const vi of parsed.data.items) {
        const originalItem = (existingIrn as any).items?.find((i: any) => i.id === vi.itemId);
        if (!originalItem) continue;
        const reqQty = Number(originalItem.qty);
        const issueQ = Number(vi.issueQty ?? 0);
        const procureQ = Number(vi.procureQty ?? 0);
        if (issueQ > reqQty) {
          return res.status(400).json({
            message: `Issue qty for "${originalItem.material}" (${issueQ} ${originalItem.uom}) cannot exceed requested qty (${reqQty} ${originalItem.uom})`
          });
        }
        if (issueQ + procureQ > reqQty) {
          return res.status(400).json({
            message: `Issue + Queue qty for "${originalItem.material}" (${issueQ + procureQ} ${originalItem.uom}) cannot exceed requested qty (${reqQty} ${originalItem.uom})`
          });
        }
      }

      const irn = await storage.storesVerifyIrn(id, parsed.data);
      if (!irn) return res.status(404).json({ message: "IRN not found" });
      sendPushToSection("irn_view", "IRN Stores Verified", `${irn.irnNo} verified by stores`, "/irn").catch(() => {});
      res.json(irn);
    } catch (err) {
      console.error("Error verifying IRN:", err);
      res.status(500).json({ message: "Failed to verify IRN" });
    }
  });

  
```

## PATCH /api/irn/:id/approve — server/routes.ts:9903

```typescript
app.patch("/api/irn/:id/approve", async (req, res) => {
    try {
      if (!assertApprove(req, res, "irn_approve")) return;
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid IRN id" });
      const existing = await storage.getInternalRequisition(id);
      if (!existing) return res.status(404).json({ message: "IRN not found" });
      if (existing.status !== "stores_verified") {
        return res.status(400).json({ message: "IRN must be stores-verified before approval" });
      }
      // self-approval prevention (admins are exempt)
      const currentUserId = req.authUser?.id ?? null;
      if (!req.authUser?.isAdmin && currentUserId && existing.raisedByUserId && currentUserId === existing.raisedByUserId) {
        return res.status(403).json({ message: "You cannot approve your own requisition" });
      }
      const parsed = approveIrnSchema.safeParse({ ...req.body, actionBy: currentUserName(req) });
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Validation error" });
      const irn = await storage.approveIrn(id, parsed.data);
      if (!irn) return res.status(404).json({ message: "IRN not found" });
      if (parsed.data.action === "approve") {
        sendPushToSection("irn_view", "IRN Approved", `${irn.irnNo} approved by ${parsed.data.actionBy}`, "/irn").catch(() => {});
      } else {
        sendPushToSection("irn_view", "IRN Rejected", `${irn.irnNo} rejected by ${parsed.data.actionBy}`, "/irn").catch(() => {});
      }
      res.json(irn);
    } catch (err) {
      console.error("Error approving IRN:", err);
      res.status(500).json({ message: "Failed to process IRN approval" });
    }
  });

  
```

## PATCH /api/irn/:id/close — server/routes.ts:9934

```typescript
app.patch("/api/irn/:id/close", async (req, res) => {
    try {
      if (!req.authUser) return res.status(401).json({ error: "not_authenticated" });
      const m = req.authPermissions;
      const canApprove = req.authUser.isAdmin || !!(m?.["irn_approve"]?.approve);
      const canStores = req.authUser.isAdmin || !!(m?.["stores_inventory"]?.create);
      if (!canApprove && !canStores) {
        return res.status(403).json({ error: "forbidden", message: "You do not have permission to close IRNs" });
      }
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid IRN id" });
      const existing = await storage.getInternalRequisition(id);
      if (!existing) return res.status(404).json({ message: "IRN not found" });
      if (existing.status !== "approved" && existing.status !== "stores_verified") {
        return res.status(400).json({ message: "Only approved or stores-verified IRNs can be closed" });
      }
      const hasUnissuedItems = existing.items.some((item: any) => item.itemStatus !== "issued");
      if (hasUnissuedItems) {
        return res.status(400).json({ message: "All items must be issued before this IRN can be closed" });
      }
      const irn = await storage.closeIrn(id, currentUserName(req));
      if (!irn) return res.status(404).json({ message: "IRN not found" });
      sendPushToSection("irn_view", "IRN Closed", `${irn.irnNo} marked as fulfilled`, "/irn").catch(() => {});
      res.json(irn);
    } catch (err) {
      console.error("Error closing IRN:", err);
      res.status(500).json({ message: "Failed to close IRN" });
    }
  });

  
```

## PATCH /api/irn/:id/reopen — server/routes.ts:9964

```typescript
app.patch("/api/irn/:id/reopen", async (req, res) => {
    try {
      if (!req.authUser) return res.status(401).json({ error: "not_authenticated" });
      const m = req.authPermissions;
      const canReopen = req.authUser.isAdmin || !!(m?.["irn_approve"]?.approve);
      if (!canReopen) {
        return res.status(403).json({ error: "forbidden", message: "You do not have permission to reopen IRNs" });
      }
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid IRN id" });
      const existing = await storage.getInternalRequisition(id);
      if (!existing) return res.status(404).json({ message: "IRN not found" });
      if (existing.status !== "closed") {
        return res.status(400).json({ message: "Only closed IRNs can be reopened" });
      }
      const irn = await storage.reopenIrn(id, currentUserName(req));
      if (!irn) return res.status(404).json({ message: "IRN not found" });
      res.json(irn);
    } catch (err) {
      console.error("Error reopening IRN:", err);
      res.status(500).json({ message: "Failed to reopen IRN" });
    }
  });

  
```

## GET /api/irn/:id/audit-logs — server/routes.ts:9988

```typescript
app.get("/api/irn/:id/audit-logs", async (req, res) => {
    try {
      if (!req.authUser) return res.status(401).json({ error: "not_authenticated" });
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid IRN id" });
      const logs = await storage.getIrnAuditLogs(id);
      res.json(logs);
    } catch (err) {
      console.error("Error fetching IRN audit logs:", err);
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });

  
```

## DELETE /api/irn/:id — server/routes.ts:10001

```typescript
app.delete("/api/irn/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid IRN id" });
      const ok = await storage.deleteInternalRequisition(id);
      if (!ok) return res.status(404).json({ message: "IRN not found" });
      res.json({ ok: true });
    } catch (err) {
      console.error("Error deleting IRN:", err);
      res.status(500).json({ message: "Failed to delete IRN" });
    }
  });

  
```

## PATCH /api/irn/:id — server/routes.ts:10015

```typescript
app.patch("/api/irn/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid IRN id" });
      const existing = await storage.getInternalRequisition(id);
      if (!existing) return res.status(404).json({ message: "IRN not found" });
      if (existing.status !== "pending_stores" && !req.authUser?.isAdmin) {
        return res.status(400).json({ message: "IRN can only be edited while pending stores verification" });
      }
      const parsed = createIrnRequestSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Validation error" });
      const irn = await storage.updateInternalRequisition(id, parsed.data);
      if (!irn) return res.status(404).json({ message: "IRN not found" });
      res.json(irn);
    } catch (err) {
      console.error("Error updating IRN:", err);
      res.status(500).json({ message: "Failed to update IRN" });
    }
  });

  
```

## POST /api/irn/:id/record-issue — server/routes.ts:10036

```typescript
app.post("/api/irn/:id/record-issue", async (req, res) => {
    try {
      if (!assertCreate(req, res, "stores_inventory")) return;
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid IRN id" });
      const parsed = recordIrnIssueSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Validation error" });
      // Vehicle fields mandatory when deliveryMode is "vehicle"
      if (parsed.data.deliveryMode === "vehicle") {
        if (!parsed.data.vehicleNo?.trim()) return res.status(400).json({ message: "Vehicle number is required for vehicle delivery" });
        if (!parsed.data.vehicleType?.trim()) return res.status(400).json({ message: "Vehicle type is required for vehicle delivery" });
        if (!parsed.data.driverName?.trim()) return res.status(400).json({ message: "Driver name is required for vehicle delivery" });
      }
      const issue = await storage.createIrnIssueVoucher(id, parsed.data);
      sendPushToSection("irn_view", "Issue Voucher Recorded", `Issue ${issue.issueNumber} recorded for IRN`, "/irn").catch(() => {});
      res.status(201).json(issue);
    } catch (err: any) {
      if (handleInsufficientPlantStock(err, res)) return;
      const msg = err?.message ?? "Failed to record issue voucher";
      if (msg.includes("must be in approved") || msg.includes("exceeds remaining balance")) {
        return res.status(400).json({ message: msg });
      }
      console.error("POST /api/irn/:id/record-issue:", err);
      res.status(500).json({ message: msg });
    }
  });

  
```

## GET /api/irn/:id/issue-vouchers — server/routes.ts:10063

```typescript
app.get("/api/irn/:id/issue-vouchers", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid IRN id" });
      const vouchers = await storage.getIrnIssueVouchers(id);
      res.json(vouchers);
    } catch (err) {
      console.error("GET /api/irn/:id/issue-vouchers:", err);
      res.status(500).json({ message: "Failed to fetch issue vouchers" });
    }
  });

  
```

## GET /api/irn/:id/issue-voucher — server/routes.ts:10075

```typescript
app.get("/api/irn/:id/issue-voucher", async (req, res) => {
    try {
      if (!assertReportExport(req, res, "irn_view", "irn_raise")) return;
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid IRN id" });
      const irn = await storage.getInternalRequisition(id);
      if (!irn) return res.status(404).json({ message: "IRN not found" });
      const permittedSites = await getPermittedSiteNames(req);
      if (permittedSites !== null) {
        const site = (await storage.getSites()).find(site => site.id === irn.siteId);
        if (!site || !siteMatchesPermitted(site.name, permittedSites)) {
          return res.status(403).json({ message: "Access denied for this IRN's site" });
        }
      }
      if (!["approved", "issued", "partially_issued"].includes(irn.status)) {
        return res.status(400).json({ message: "Issue voucher PDF is only available for approved or issued IRNs" });
      }

      // Optional voucherId param — prints that specific voucher's data
      const voucherIdParam = req.query.voucherId ? Number(req.query.voucherId) : null;
      let specificVoucher: any = null;
      if (voucherIdParam && !isNaN(voucherIdParam)) {
        specificVoucher = await storage.getStoreIssue(voucherIdParam);
        const linkedVouchers = await storage.getIrnIssueVouchers(id);
        if (!specificVoucher || !linkedVouchers.some(voucher => voucher.id === voucherIdParam)) {
          return res.status(403).json({ message: "Voucher does not belong to this IRN" });
        }
      }
      if (!specificVoucher && !voucherIdParam) {
        // Default: latest voucher if any exist
        const allVouchers = await storage.getIrnIssueVouchers(id);
        if (allVouchers.length > 0) specificVoucher = allVouchers[allVouchers.length - 1];
      }

      const issueItems = specificVoucher
        ? specificVoucher.items.map((vi: any) => ({
            material: vi.materialText ?? vi.itemName ?? "—",
            qty: irn.items.find((i: any) => i.material === (vi.materialText ?? vi.itemName))?.qty ?? vi.qty,
            issueQty: vi.qty,
            uom: vi.uom,
          }))
        : irn.items.filter((i: any) => i.issueQty && Number(i.issueQty) > 0);
      if (issueItems.length === 0) {
        return res.status(400).json({ message: "No items flagged for issue from store" });
      }

      const fmtDate = (dateStr: string | null | undefined) => {
        if (!dateStr) return "-";
        try {
          const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
          const d = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : ""));
          if (Number.isNaN(d.getTime())) return dateStr;
          return `${String(d.getDate()).padStart(2, "0")}-${months[d.getMonth()]}-${d.getFullYear()}`;
        } catch { return dateStr; }
      };
      const fmtQty = (qty: number | null | undefined) => {
        if (qty == null) return "0.00";
        return Number(qty).toFixed(2);
      };

      const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => {
        const pdfBuffer = Buffer.concat(chunks);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="IssueVoucher-${irn.irnNo.replace(/\//g, "-")}.pdf"`);
        res.send(pdfBuffer);
      });

      const pageW = 515;
      const amber = "#d97706";
      const tableX = 40;

      const _irnCfg = await getCompanyConfig();
      const _irnLogoPath = getCompanyLogoPath(_irnCfg.logoFile);
      try {
        if (_irnLogoPath) {
          const logoWidth = 60;
          const logoX = (pageW - logoWidth) / 2 + tableX;
          const logoY = doc.y;
          doc.image(_irnLogoPath, logoX, logoY, { width: logoWidth });
          doc.y = logoY + 65;
        }
      } catch {}

      doc.fontSize(18).font("Helvetica-Bold").fillColor("#000").text(_irnCfg.companyName.toUpperCase(), { align: "center" });
      doc.moveDown(0.2);
      doc.fontSize(11).font("Helvetica").fillColor("#333").text("ISSUE VOUCHER", { align: "center" });
      doc.moveDown(0.5);

      doc.moveTo(tableX, doc.y).lineTo(tableX + pageW, doc.y).strokeColor(amber).lineWidth(2).stroke();
      doc.moveDown(0.5);

      const metaY = doc.y;
      doc.fillColor("#000").fontSize(10).font("Helvetica-Bold");
      doc.text(`IRN No: ${irn.irnNo}`, tableX, metaY);
      if (specificVoucher) {
        doc.text(`Voucher No: ${specificVoucher.issueNumber}`, tableX + 190, metaY);
        doc.text(`Date: ${fmtDate(specificVoucher.date)}`, tableX + 380, metaY);
      } else {
        doc.text(`Date: ${fmtDate(irn.date)}`, tableX + 380, metaY);
      }
      doc.moveDown(0.4);
      doc.font("Helvetica").fontSize(10);
      doc.text(`Raised By: ${irn.raisedBy}`, tableX);
      doc.text(`Section: ${irn.raisedFrom}`, tableX + 300, doc.y - 14);
      if (specificVoucher?.issuedBy || specificVoucher?.receivedBy) {
        doc.moveDown(0.2);
        doc.font("Helvetica").fontSize(10);
        if (specificVoucher.issuedBy) doc.text(`Issued By: ${specificVoucher.issuedBy}`, tableX);
        if (specificVoucher.receivedBy) doc.text(`Received By: ${specificVoucher.receivedBy}`, tableX + 300, doc.y - 14);
        if (specificVoucher.vehicleNo) {
          doc.moveDown(0.2);
          doc.text(`Vehicle: ${specificVoucher.vehicleType ?? ""} ${specificVoucher.vehicleNo}`, tableX);
          if (specificVoucher.driverName) doc.text(`Driver: ${specificVoucher.driverName}`, tableX + 300, doc.y - 14);
        }
      }
      doc.moveDown(0.8);

      const colWidths = [25, 225, 80, 80, 105];
      const headers = ["#", "Material / Description", "Qty Req.", "Issue Qty", "UOM"];
      let y = doc.y;

      doc.fillColor("#fff").rect(tableX, y, pageW, 20).fill(amber);
      doc.fillColor("#fff").fontSize(9).font("Helvetica-Bold");
      let cx = tableX;
      headers.forEach((h, i) => {
        const align = i >= 2 ? "center" : "left";
        doc.text(h, cx + 4, y + 5, { width: colWidths[i] - 8, align, lineBreak: false });
        cx += colWidths[i];
      });
      y += 20;

      issueItems.forEach((item: any, idx: number) => {
        const matText = item.material || "";
        const purposeText = item.purpose ? item.purpose : "";
        const matH = doc.heightOfString(matText, { width: colWidths[1] - 8, fontSize: 9 });
        const purposeH = purposeText ? doc.heightOfString(purposeText, { width: colWidths[1] - 8, fontSize: 7 }) + 2 : 0;
        const rowH = Math.max(20, matH + purposeH + 8);

        if (y + rowH > 720) { doc.addPage(); y = 40; }

        const bgColor = idx % 2 === 0 ? "#fff" : "#f9f9f9";
        doc.fillColor(bgColor).rect(tableX, y, pageW, rowH).fill();

        cx = tableX;
        doc.fillColor("#000").fontSize(9).font("Helvetica");
        doc.text(String(idx + 1), cx + 4, y + 4, { width: colWidths[0] - 8, align: "center", lineBreak: false });
        cx += colWidths[0];

        doc.text(matText, cx + 4, y + 4, { width: colWidths[1] - 8, align: "left", lineBreak: true });
        if (purposeText) {
          doc.fillColor("#666").fontSize(7).font("Helvetica-Oblique");
          doc.text(purposeText, cx + 4, y + 4 + matH + 1, { width: colWidths[1] - 8, align: "left", lineBreak: false });
          doc.fillColor("#000").fontSize(9).font("Helvetica");
        }
        cx += colWidths[1];

        doc.text(fmtQty(item.qty), cx + 4, y + 4, { width: colWidths[2] - 8, align: "center", lineBreak: false });
        cx += colWidths[2];

        doc.fillColor("#15803d").font("Helvetica-Bold");
        doc.text(fmtQty(item.issueQty), cx + 4, y + 4, { width: colWidths[3] - 8, align: "center", lineBreak: false });
        cx += colWidths[3];

        doc.fillColor("#000").font("Helvetica");
        doc.text(item.uom || "-", cx + 4, y + 4, { width: colWidths[4] - 8, align: "center", lineBreak: false });

        y += rowH;
      });

      doc.strokeColor("#999").lineWidth(0.5);
      doc.moveTo(tableX, y).lineTo(tableX + pageW, y).stroke();

      if (y + 24 > 720) { doc.addPage(); y = 40; }
      doc.fillColor(amber).rect(tableX, y, pageW, 24).fill();
      doc.fillColor("#fff").fontSize(10).font("Helvetica-Bold");
      doc.text(`TOTAL ISSUE ITEMS: ${issueItems.length}`, tableX + 4, y + 7, { width: pageW - 8, align: "left" });
      y += 24;

      if (irn.storesRemarks) {
        if (y + 40 > 720) { doc.addPage(); y = 40; }
        y += 16;
        doc.fillColor("#555").fontSize(9).font("Helvetica-Oblique");
        doc.text(`Stores Remarks: ${irn.storesRemarks}`, tableX, y, { width: pageW });
        y = doc.y + 8;
      }

      if (y + 140 > 720) { doc.addPage(); y = 40; }
      y += 40;

      const signCols = specificVoucher
        ? ["Raised By", "Approved By", "Issued By", "Received By"]
        : ["Raised By", "Stores Verified By", "Approved By"];
      const signAreaW = Math.floor(pageW / signCols.length);
      const signNames = specificVoucher
        ? [irn.raisedBy || "", irn.approvedBy || "", specificVoucher.issuedBy || "", specificVoucher.receivedBy || ""]
        : [irn.raisedBy || "", irn.storesVerifiedBy || "", irn.approvedBy || ""];

      doc.fillColor("#000").fontSize(9).font("Helvetica");
      signCols.forEach((col, i) => {
        doc.text(col, tableX + signAreaW * i, y, { width: signAreaW, align: "center" });
      });
      y += 40;

      signCols.forEach((_, i) => {
        const sx = tableX + signAreaW * i;
        doc.moveTo(sx + 8, y).lineTo(sx + signAreaW - 8, y).strokeColor("#000").lineWidth(0.5).stroke();
      });
      y += 6;

      doc.fontSize(9).font("Helvetica-Bold").fillColor("#000");
      signNames.forEach((name, i) => {
        doc.text(name, tableX + signAreaW * i, y, { width: signAreaW, align: "center" });
      });
      y += 14;

      doc.fontSize(8).font("Helvetica").fillColor("#555");
      if (!specificVoucher) {
        if (irn.storesVerifiedAt) {
          doc.text(new Date(irn.storesVerifiedAt).toLocaleString("en-IN"), tableX + signAreaW, y, { width: signAreaW, align: "center" });
        }
        if (irn.approvedAt) {
          doc.text(new Date(irn.approvedAt).toLocaleString("en-IN"), tableX + signAreaW * 2, y, { width: signAreaW, align: "center" });
        }
      } else if (specificVoucher.issuedAt) {
        doc.text(new Date(specificVoucher.issuedAt).toLocaleString("en-IN"), tableX + signAreaW * 2, y, { width: signAreaW, align: "center" });
      }

      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.fillColor("#555").fontSize(8).font("Helvetica");
        doc.text(`Generated: ${new Date().toLocaleString("en-IN")}`, tableX, 800, { width: pageW / 2, align: "left" });
        doc.text(`Page ${i + 1} of ${pages.count}`, tableX + pageW / 2, 800, { width: pageW / 2, align: "right" });
      }

      doc.end();
    } catch (err) {
      console.error("Error generating IRN issue voucher PDF:", err);
      res.status(500).json({ message: "Failed to generate issue voucher PDF" });
    }
  });

  
```

## POST /api/purchase-indents/:id/notify — server/routes.ts:10350

```typescript
app.post("/api/purchase-indents/:id/notify", async (req, res) => {
    try {
      if (!assertEditEither(req, res, "site_procurement", "purchase_indents_raise")) return;
      const id = Number(req.params.id);
      const customMessage = typeof req.body?.message === "string" ? req.body.message.trim() : "";
      const indent = await storage.getPurchaseIndent(id);
      if (!indent) {
        return res.status(404).json({ message: "Purchase indent not found" });
      }
      const totalEst = indent.items.reduce((sum, item: any) => {
        const ea = item.estAmount ?? (item.estRate && item.qty ? item.estRate * item.qty : null);
        return sum + (ea || 0);
      }, 0);
      const estStr = totalEst > 0 ? ` | Est. ₹${Math.round(totalEst).toLocaleString("en-IN")}` : "";
      const baseBody = `${indent.indentNo} by ${indent.raisedBy} — ${indent.items.length} item(s)${estStr}. Pending review.`;
      const itemNotes = (indent.items as any[])
        .filter((item) => item.reviewerNote?.trim())
        .map((item, i) => `${i + 1}. ${item.description}: ${item.reviewerNote.trim()}`)
        .join(" | ");
      const combinedNote = [customMessage, itemNotes].filter(Boolean).join(" | ");
      const body = combinedNote ? `${baseBody}\n📝 ${combinedNote}` : baseBody;
      if (combinedNote) {
        await storage.setIndentNotifyMessage(id, combinedNote);
      }
      sendPushToSection("purchase_indents_view", "PI Review Requested", body, "/plant/purchase-indents").catch(() => {});
      await storage.createNotification({
        type: "info",
        title: "PI Review Requested",
        message: body,
        isRead: 0,
      });
      res.json({ ok: true });
    } catch (err) {
      console.error("Error notifying for purchase indent:", err);
      res.status(500).json({ message: "Failed to send notification" });
    }
  });

  
```

## PATCH /api/purchase-indents/:id/force-close — server/routes.ts:10475

```typescript
app.patch("/api/purchase-indents/:id/force-close", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { reason } = req.body;

      if (!reason || typeof reason !== "string" || !reason.trim()) {
        return res.status(400).json({ message: "Reason is required" });
      }

      if (!assertAdmin(req, res)) return;

      const indent = await storage.forceCloseIndent(id, currentUserName(req), reason);
      if (!indent) {
        return res.status(404).json({ message: "Purchase indent not found" });
      }
      sendPushToSection("purchase_indents_view", "Indent Force Closed", `${indent.indentNo} force closed by ADMIN`, "/plant/purchase-indents").catch(() => {});
      res.json(indent);
    } catch (err: any) {
      if (err?.message?.startsWith("Cannot force close")) {
        return res.status(400).json({ message: err.message });
      }
      console.error("Error force closing purchase indent:", err);
      res.status(500).json({ message: "Failed to force close purchase indent" });
    }
  });

  
```

## PUT /api/purchase-indents/:id — server/routes.ts:10501

```typescript
app.put("/api/purchase-indents/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { pin: _pin, ...data } = req.body;

      const existing = await storage.getPurchaseIndent(id);
      if (!existing) return res.status(404).json({ message: "Purchase indent not found" });

      // PI raisers or legacy procurement editors can edit; other status/site
      // restrictions remain enforced by the existing workflow.
      if (!assertEditEither(req, res, "site_procurement", "purchase_indents_raise")) return;

      const validatedData = updatePurchaseIndentRequestSchema.parse(data);
      const indent = await storage.updatePurchaseIndent(id, validatedData);
      if (!indent) return res.status(404).json({ message: "Purchase indent not found" });

      res.json(indent);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      if (err?.message?.startsWith("Cannot edit")) return res.status(400).json({ message: err.message });
      console.error("Error updating purchase indent:", err);
      res.status(500).json({ message: "Failed to update purchase indent" });
    }
  });

  
```

## DELETE /api/purchase-indents/:id — server/routes.ts:10526

```typescript
app.delete("/api/purchase-indents/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const id = Number(req.params.id);
      const deleted = await storage.deletePurchaseIndent(id);
      if (!deleted) return res.status(404).json({ message: "Purchase indent not found" });
      res.json({ success: true });
    } catch (err: any) {
      if (err?.message?.startsWith("Cannot delete")) return res.status(400).json({ message: err.message });
      console.error("Error deleting purchase indent:", err);
      res.status(500).json({ message: "Failed to delete purchase indent" });
    }
  });

  
```

## GET /api/purchase-indents/:id/transactions — server/routes.ts:10555

```typescript
app.get("/api/purchase-indents/:id/transactions", async (req, res) => {
    try {
      const indentId = Number(req.params.id);
      const txns = await storage.getPiItemTransactions(indentId);
      res.json(txns);
    } catch (err) {
      console.error("GET /api/purchase-indents/:id/transactions:", err);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  
```

## POST /api/purchase-indents/:id/purchaser-action — server/routes.ts:10566

```typescript
app.post("/api/purchase-indents/:id/purchaser-action", async (req, res) => {
    try {
      if (!assertEditEither(req, res, "site_procurement", "purchase_indents_raise")) return;
      const indentId = Number(req.params.id);
      const actionBy = currentUserName(req);
      const userId = req.authUser?.id;
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "items array is required" });
      }
      // Server-side validation: validate per purchaseActionType
      if (!await assertPiDeliveryScope(req, res, indentId, items)) return;
      for (const item of items as any[]) {
        const actionType: string = item.purchaseActionType
          ?? (item.reasonCode === "ordered" ? "ordered"
            : item.reasonCode === "not_available" ? "not_available"
            : "already_purchased");
        // Not-available and recommend-cancellation need no purchase details
        if (actionType === "not_available" || actionType === "recommend_cancellation") continue;
        // All actioned types need a positive qty
        if (!item.qty || Number(item.qty) <= 0) {
          return res.status(400).json({ message: `Invalid quantity for item ${item.itemId}` });
        }
        if (actionType === "already_purchased") {
          // Purchased items require vendor + rate
          const vendorStr = String(item.vendor ?? "").trim().toUpperCase();
          if (!vendorStr || vendorStr === "SUPPLIER") {
            return res.status(400).json({ message: "Vendor name is required for purchased items" });
          }
          if (!item.rate || Number(item.rate) <= 0) {
            return res.status(400).json({ message: "Rate must be greater than zero for purchased items" });
          }
        } else if (actionType === "ordered") {
          // Ordered items require expected delivery date + rate
          if (!item.expectedDeliveryDate) {
            return res.status(400).json({ message: "Expected delivery date is required for ordered items" });
          }
          if (!item.rate || Number(item.rate) <= 0) {
            return res.status(400).json({ message: "Rate must be greater than zero for ordered items" });
          }
        }
      }
      const paResult = await storage.submitPurchaserAction(indentId, items, actionBy, userId);
      const indent = await storage.getPurchaseIndent(indentId);
      res.json({ indent, txnIdsByItemId: paResult.txnIdsByItemId, grnIdsByItemId: paResult.grnIdsByItemId, routeWarnings: paResult.routeWarnings ?? [] });
    } catch (err) {
      console.error("POST /api/purchase-indents/:id/purchaser-action:", err);
      res.status(500).json({ message: String((err as Error).message) });
    }
  });

  
```

## POST /api/purchase-indents/:id/service-completion — server/routes.ts:10654

```typescript
app.post("/api/purchase-indents/:id/service-completion", async (req, res) => {
    try {
      if (!assertApprove(req, res, "purchase_indents_approve")) return;
      const indentId = Number(req.params.id);
      const verifiedBy = currentUserName(req);
      const verifiedByUserId = req.authUser?.id ?? 0;
      const { indentItemId, completionStatus, completionDate, qty, hours, remarks, documentUrl } = req.body;
      if (!indentItemId || !completionStatus) {
        return res.status(400).json({ message: "indentItemId and completionStatus required" });
      }
      // Data integrity: validate the item belongs to this indent, is service route, and is in the expected status
      const [piItem] = await db.select({
        id: purchaseIndentItems.id,
        indentId: purchaseIndentItems.indentId,
        procurementRoute: purchaseIndentItems.procurementRoute,
        purchaseStatus: purchaseIndentItems.purchaseStatus,
        purchasedByUserId: purchaseIndentItems.purchasedByUserId,
        purchasedBy: purchaseIndentItems.purchasedBy,
      }).from(purchaseIndentItems).where(eq(purchaseIndentItems.id, Number(indentItemId))).limit(1);
      if (!piItem) return res.status(404).json({ message: "Item not found" });
      if (piItem.indentId !== indentId) return res.status(400).json({ message: "Item does not belong to this indent" });
      if (piItem.procurementRoute !== "service") return res.status(400).json({ message: "Item is not a service-route item" });
      if (piItem.purchaseStatus !== "AWAITING_SERVICE_VERIFICATION") return res.status(409).json({ message: `Item is not awaiting service verification (current status: ${piItem.purchaseStatus})` });
      // SoD: verifier user ID must never equal the purchaser's user ID (all users, no admin bypass)
      if (piItem.purchasedByUserId && piItem.purchasedByUserId === verifiedByUserId) {
        return res.status(409).json({ message: "Separation of Duties: You cannot verify a service you submitted. Ask another authorised user to confirm." });
      }
      // Fallback name-check for legacy rows where purchasedByUserId was not yet populated
      if (!piItem.purchasedByUserId && piItem.purchasedBy && piItem.purchasedBy.toUpperCase() === verifiedBy.toUpperCase()) {
        return res.status(409).json({ message: "Separation of Duties: You cannot verify a service you submitted. Ask another authorised user to confirm." });
      }
      const result = await storage.createServiceCompletion({
        indentId,
        indentItemId: Number(indentItemId),
        itemDescription: req.body.itemDescription,
        completionStatus,
        completionDate: completionDate ?? null,
        qty: qty != null ? Number(qty) : null,
        hours: hours != null ? Number(hours) : null,
        remarks: remarks ?? null,
        documentUrl: documentUrl ?? null,
        verifiedByUserId,
        verifiedByName: verifiedBy,
        createdByUserId: verifiedByUserId,
      });
      const indent = await storage.getPurchaseIndent(indentId);
      res.json({ completion: result, indent });
    } catch (err) {
      console.error("POST /api/purchase-indents/:id/service-completion:", err);
      res.status(500).json({ message: String((err as Error).message) });
    }
  });

  
```

## POST /api/purchase-indents/:id/bulk-receipt — server/routes.ts:10734

```typescript
app.post("/api/purchase-indents/:id/bulk-receipt", async (req, res) => {
    try {
      if (!assertEditEither(req, res, "site_procurement", "purchase_indents_raise")) return;
      const indentId = Number(req.params.id);
      const actionBy = currentUserName(req);
      const createdByUserId = req.authUser?.id ?? 0;
      const { items, receivingLocation, receivingSiteId } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "items array is required" });
      }
      if (!["hmp_plant", "rmc_plant", "site"].includes(receivingLocation)) return res.status(400).json({ message: "Explicit delivery destination is required" });
      const location = receivingLocation as string;
      const siteId = receivingSiteId ? parseInt(String(receivingSiteId)) : null;
      if (!await assertPiDeliveryScope(req, res, indentId, [{ receivingLocation: location, receivingSiteId: siteId }])) return;
      await storage.submitBulkReceiptAsPending(indentId, location, siteId, items, createdByUserId, actionBy);
      const indent = await storage.getPurchaseIndent(indentId);
      res.json(indent);
    } catch (err) {
      console.error("POST /api/purchase-indents/:id/bulk-receipt:", err);
      res.status(500).json({ message: String((err as Error).message) });
    }
  });

  // ── Pending Plant Receipts (SoD queue) ──
  
```

## GET /api/diesel-requirements — server/routes.ts:10824

```typescript
app.get("/api/diesel-requirements", async (req, res) => {
    try {
      if (!assertDieselOrStoresView(req, res)) return;
      const filters = {
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        status: req.query.status as string | undefined,
      };
      const requirements = await storage.getDieselRequirements(filters);
      res.json(requirements);
    } catch (err) {
      console.error("Error fetching diesel requirements:", err);
      res.status(500).json({ message: "Failed to fetch diesel requirements" });
    }
  });

  
```

## GET /api/diesel-requirements/summary — server/routes.ts:10840

```typescript
app.get("/api/diesel-requirements/summary", async (req, res) => {
    try {
      if (!assertDieselOrStoresView(req, res)) return;
      const all = await storage.getDieselRequirements();
      const summary = {
        total: all.length,
        pending: all.filter(r => r.status === "pending").length,
        approved: all.filter(r => r.status === "approved").length,
        rejected: all.filter(r => r.status === "rejected").length,
      };
      res.json(summary);
    } catch (err) {
      console.error("Error fetching diesel requirement summary:", err);
      res.status(500).json({ message: "Failed to fetch diesel requirement summary" });
    }
  });

  
```

## GET /api/diesel-requirements/daily-report — server/routes.ts:10857

```typescript
app.get("/api/diesel-requirements/daily-report", async (req, res) => {
    try {
      if (!assertDieselOrStoresView(req, res)) return;
      const { from, to, equipmentId, locationId } = req.query;
      const validDate = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
      if (!validDate(from) || !validDate(to) || from > to) return res.status(400).json({ message: "Valid from/to dates are required" });
      if (locationId !== undefined) return res.status(400).json({ message: "Location filtering is not supported by this report. Remove locationId." });
      if (equipmentId !== undefined && (typeof equipmentId !== "string" || !/^[1-9]\d*$/.test(equipmentId) || !Number.isSafeInteger(Number(equipmentId)))) {
        return res.status(400).json({ message: "equipmentId must be a positive integer" });
      }
      const sources = await storage.getDieselComparisonEquipmentSources(from, to);
      const dateWise = (await storage.getDieselComparisonReport(from, to)).map(r => ({
        date: r.date, planned: r.totalPlanned, purchased: r.totalPurchased, actual: r.totalActualIssued,
      }));
      res.json(buildDailyDieselEquipmentReport({ ...sources, dateWise }, from, to, equipmentId === undefined ? undefined : Number(equipmentId)));
    } catch (err) {
      console.error("Error fetching daily diesel report:", err);
      res.status(500).json({ message: "Failed to fetch daily diesel report" });
    }
  });

  
```

## GET /api/diesel-requirements/comparison — server/routes.ts:10878

```typescript
app.get("/api/diesel-requirements/comparison", async (req, res) => {
    try {
      if (!assertDieselOrStoresView(req, res)) return;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const validDate = (d: string | undefined) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
      const scopeDate = req.query.scopeDate as string | undefined;
      if (!validDate(dateFrom) || !validDate(dateTo) || dateFrom! > dateTo! || (scopeDate != null && (!validDate(scopeDate) || scopeDate < dateFrom! || scopeDate > dateTo!))) {
        return res.status(400).json({ message: "Valid dateFrom/dateTo (and optional scopeDate within range) are required" });
      }
      const rawRows = await storage.getDieselComparisonReport(dateFrom!, dateTo!);
      const dateWise = rawRows.map((row: any) => ({
        date: row.date,
        planned: row.totalPlanned,
        purchased: row.totalPurchased ?? null,
        actual: row.totalActualIssued ?? null,
      }));
      const totals = {
        totalPlanned: dateWise.reduce((s: number, r: any) => s + (r.planned || 0), 0),
        totalPurchased: dateWise.reduce((s: number, r: any) => s + (r.purchased || 0), 0),
        totalActual: dateWise.reduce((s: number, r: any) => s + (r.actual || 0), 0),
      };
      const sources = await storage.getDieselComparisonEquipmentSources(dateFrom!, dateTo!);
      const equipmentWise = buildEquipmentComparison({ ...sources, dateWise }, scopeDate || dateFrom!, scopeDate || dateTo!);
      res.json({ dateWise, totals, equipmentWise });
    } catch (err) {
      console.error("Error fetching diesel comparison report:", err);
      res.status(500).json({ message: "Failed to fetch diesel comparison report" });
    }
  });

  
```

## GET /api/diesel-requirements/recent-items — server/routes.ts:10909

```typescript
app.get("/api/diesel-requirements/recent-items", async (req, res) => {
    try {
      if (!assertDieselOrStoresView(req, res)) return;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;
      const ids = await storage.getRecentDieselItemIds(limit);
      res.json(ids);
    } catch (err) {
      console.error("GET /api/diesel-requirements/recent-items:", err);
      res.status(500).json({ error: "Failed to fetch recent diesel items" });
    }
  });

  // 06M-C: linked Material Receipts + derived Purchased/Received/Pending
  // state for purchased Daily Diesel Requirements. ?ids=1,2,3 (batch) — the
  // list screen uses this to badge Receipt Pending / Partly / Fully Received.
  
```

## GET /api/diesel-requirements/receipt-status — server/routes.ts:10924

```typescript
app.get("/api/diesel-requirements/receipt-status", async (req, res) => {
    try {
      // This is a read-only register.  Stores users may reconcile deliveries,
      // while diesel users retain their existing visibility; neither grant
      // implies create/edit/approval rights on the other module.
      if (!assertDieselOrStoresView(req, res)) return;
      const ids = String(req.query.ids || "")
        .split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
      if (ids.length === 0) return res.json({});
      const receipts = await storage.getDieselRequirementReceipts(ids);
      const byReq: Record<number, any[]> = {};
      for (const r of receipts) {
        const key = (r as any).linkedDieselRequirementId as number;
        (byReq[key] ||= []).push(r);
      }
      const requirements = await Promise.all(ids.map((id) => storage.getDieselRequirement(id)));
      const result: Record<number, any> = {};
      for (const dr of requirements) {
        if (!dr) continue;
        const linked = byReq[dr.id] || [];
        const state = computeDieselReceiptState((dr as any).qtyPurchased, linked);
        result[dr.id] = {
          ...state,
          receipts: linked.map((r: any) => ({
            id: r.id,
            date: r.date,
            time: r.time,
            invoiceDate: r.invoiceDate || r.date,
            quantity: r.quantity,
            uom: r.uom,
            supplier: r.supplier,
            challanNumber: r.challanNumber,
            receiptNo: r.receiptNo,
            isCancelled: !!r.isCancelled,
            finalSubmittedBy: r.finalSubmittedBy,
          })),
        };
      }
      res.json(result);
    } catch (err) {
      console.error("Error fetching diesel receipt status:", err);
      res.status(500).json({ message: "Failed to fetch diesel receipt status" });
    }
  });

  // A narrow write for the diesel planning form. Do not grant general equipment-master editing.
  
```

## PATCH /api/diesel-requirements/equipment/:id/consumption-norm — server/routes.ts:10970

```typescript
app.patch("/api/diesel-requirements/equipment/:id/consumption-norm", async (req, res) => {
    try {
      if (!req.authUser) return res.status(401).json({ error: "not_authenticated" });
      const allowed = req.authUser.isAdmin || req.authUser.isOwner ||
        ["site_diesel", "diesel_req_raise"].some(section =>
          req.authPermissions?.[section as "site_diesel" | "diesel_req_raise"]?.create ||
          req.authPermissions?.[section as "site_diesel" | "diesel_req_raise"]?.edit);
      if (!allowed) return res.status(403).json({ error: "forbidden", action: "create_or_edit" });
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0 ||
          !req.body || Object.keys(req.body).length !== 1 ||
          !Object.prototype.hasOwnProperty.call(req.body, "consumptionNorm") ||
          typeof req.body.consumptionNorm !== "number" ||
          !Number.isFinite(req.body.consumptionNorm) || req.body.consumptionNorm <= 0) {
        return res.status(400).json({ message: "Only a positive finite consumptionNorm is allowed" });
      }
      const master = (await storage.getEquipmentMaster(true)).find(e => e.id === id);
      if (!master) return res.status(404).json({ message: "Equipment not found" });
      if (!req.authUser.isAdmin && !req.authUser.isOwner) {
        const permittedIds = await storage.getUserPermittedSiteIds(req.authUser.id);
        if (permittedIds !== null) {
          // A shared/unassigned equipment has no site to authorize against.
          // Restricted users (including those with zero permitted sites) must fail closed.
          const plant = master.plantName ? await storage.getPlantSettings(master.plantName) : null;
          if (!plant?.siteId || !permittedIds.includes(plant.siteId)) {
            return res.status(403).json({ error: "forbidden", message: "Equipment is outside your permitted site scope" });
          }
        }
      }
      const equipment = await storage.updateEquipment(id, { consumptionNorm: req.body.consumptionNorm });
      if (!equipment) return res.status(404).json({ message: "Equipment not found" });
      res.json({ id: equipment.id, consumptionNorm: equipment.consumptionNorm });
    } catch (err) {
      console.error("Error saving diesel consumption norm:", err);
      res.status(500).json({ message: "Failed to save equipment consumption norm" });
    }
  });

  
```

## GET /api/diesel-requirements/:id — server/routes.ts:11008

```typescript
app.get("/api/diesel-requirements/:id", async (req, res) => {
    try {
      if (!assertDieselOrStoresView(req, res)) return;
      const id = Number(req.params.id);
      const requirement = await storage.getDieselRequirement(id);
      if (!requirement) {
        return res.status(404).json({ message: "Diesel requirement not found" });
      }
      res.json(requirement);
    } catch (err) {
      console.error("Error fetching diesel requirement:", err);
      res.status(500).json({ message: "Failed to fetch diesel requirement" });
    }
  });

  
```

## POST /api/diesel-requirements — server/routes.ts:11023

```typescript
app.post("/api/diesel-requirements", async (req, res) => {
    try {
      if (!assertCreateEither(req, res, "site_diesel", "diesel_req_raise")) return;
      const input = createDieselRequirementRequestSchema.parse(req.body);
      const requirement = await storage.createDieselRequirement(input);
      sendPushToSection("diesel_req_approve", "New Diesel Requirement", `${requirement.date} - ${requirement.totalPlanned} L planned`, "/plant/diesel-requirements").catch(() => {});
      res.status(201).json(requirement);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, errors: err.errors });
      }
      console.error("Error creating diesel requirement:", err);
      res.status(500).json({ message: "Failed to create diesel requirement" });
    }
  });

  
```

## PATCH /api/diesel-requirements/:id/approve — server/routes.ts:11039

```typescript
app.patch("/api/diesel-requirements/:id/approve", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { approvedItems } = req.body;

      if (!assertApprove(req, res, "diesel_req_approve")) return;
      // Self-approval prevention.
      const existingDr = await storage.getDieselRequirement(id);
      if (!req.authUser?.isAdmin && existingDr && existingDr.authorUserId && existingDr.authorUserId === req.authUser?.id) {
        return res.status(403).json({ message: "You cannot approve a record you raised." });
      }
      const approvedBy = currentUserName(req);

      const approvedItemsSchema = z.array(z.object({
        itemId: z.number(),
        approvedQty: z.number(),
      }));
      const validatedItems = approvedItemsSchema.parse(approvedItems);

      const requirement = await storage.approveDieselRequirement(id, validatedItems, approvedBy);
      if (!requirement) {
        return res.status(404).json({ message: "Diesel requirement not found" });
      }
      sendPushToSection("diesel_req_raise", "Diesel Approved", `${requirement.date} - ${requirement.totalApproved} L approved by ${approvedBy}`, "/plant/diesel-requirements").catch(() => {});
      res.json(requirement);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error approving diesel requirement:", err);
      res.status(500).json({ message: "Failed to approve diesel requirement" });
    }
  });

  
```

## PATCH /api/diesel-requirements/:id/reject — server/routes.ts:11073

```typescript
app.patch("/api/diesel-requirements/:id/reject", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { reason } = req.body;

      if (!assertApprove(req, res, "diesel_req_approve")) return;
      const rejectedBy = currentUserName(req);

      if (!reason || typeof reason !== "string") {
        return res.status(400).json({ message: "Rejection reason is required" });
      }

      const requirement = await storage.rejectDieselRequirement(id, reason, rejectedBy);
      if (!requirement) {
        return res.status(404).json({ message: "Diesel requirement not found" });
      }
      sendPushToSection("diesel_req_raise", "Diesel Rejected", `${requirement.date} rejected by ${rejectedBy}`, "/plant/diesel-requirements").catch(() => {});
      res.json(requirement);
    } catch (err) {
      console.error("Error rejecting diesel requirement:", err);
      res.status(500).json({ message: "Failed to reject diesel requirement" });
    }
  });

  
```

## PATCH /api/diesel-requirements/:id/purchase-update — server/routes.ts:11097

```typescript
app.patch("/api/diesel-requirements/:id/purchase-update", async (req, res) => {
    try {
      if (!assertEditEither(req, res, "site_diesel", "diesel_req_raise")) return;
      const id = Number(req.params.id);
      const updateSchema = z.object({
        qtyPurchased: z.number().optional(),
        supplier: z.string().optional(),
        billNo: z.string().optional(),
        rate: z.number().optional(),
        amount: z.number().optional(),
        purchasedAt: z.string().optional(),
        purchaseRemarks: z.string().optional(),
        // Batch 06M: PI-style payment details (same option values as PI).
        paymentMode: z.enum(["cash", "credit", "advance", "upi", "cheque", "rtgs"]).optional(),
        paidBy: z.string().max(120).optional(),
      });
      const purchaseData = updateSchema.parse(req.body);
      const requirement = await storage.updateDieselPurchase(id, purchaseData);
      if (!requirement) {
        return res.status(404).json({ message: "Diesel requirement not found" });
      }
      // 06M-C: purchase completion does NOT add stock — notify the users who
      // hold Material Receipt authority that a physical receipt is pending.
      if (purchaseData.qtyPurchased !== undefined && purchaseData.qtyPurchased > 0) {
        const supplier = purchaseData.supplier || (requirement as any).supplier || "";
        sendPushToSection(
          "plant_materials",
          "DIESEL PURCHASED — RECEIPT PENDING",
          `Purchased: ${purchaseData.qtyPurchased} L${supplier ? ` · Supplier: ${supplier}` : ""}. Physical receipt is pending — record a Material Receipt.`,
          "/plant/diesel-requirements",
        ).catch(() => {});
      }
      res.json(requirement);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error updating diesel purchase:", err);
      res.status(500).json({ message: "Failed to update diesel purchase" });
    }
  });

  // 06M-F §4: dedicated payment-status action — deliberately separate from
  // purchase-update so recording a purchase can never accidentally mark it
  // paid. Touches ONLY payment fields; timestamp + recorder are server-set.
  
```

## PATCH /api/diesel-requirements/:id/payment-status — server/routes.ts:11142

```typescript
app.patch("/api/diesel-requirements/:id/payment-status", async (req, res) => {
    try {
      if (!assertEditEither(req, res, "site_diesel", "diesel_req_raise")) return;
      const id = Number(req.params.id);
      const paymentSchema = z.object({
        paymentStatus: z.literal("paid").optional(),
        paymentMode: z.enum(["cash", "credit", "advance", "upi", "cheque", "rtgs"]).optional(),
        paidBy: z.string().max(120).refine((v) => v.trim().length > 0, "Paid By cannot be blank").optional(),
        paymentAccountKey: z.string().min(1).nullable().optional(),
      });
      const data = paymentSchema.parse(req.body);
      if (data.paidBy !== undefined) data.paidBy = data.paidBy.trim();

      const existing = await storage.getDieselRequirement(id);
      if (!existing) return res.status(404).json({ message: "Diesel requirement not found" });
      if (existing.status !== "purchased" || existing.qtyPurchased == null) {
        return res.status(400).json({ message: "Payment can only be recorded after the purchase has been entered." });
      }
      // Marking paid requires mode + payer in the same request; a paid record
      // must never exist without its payment mode recorded.
      if (data.paymentStatus === "paid" && (existing as any).paymentStatus !== "paid") {
        const mode = data.paymentMode ?? (existing as any).paymentMode;
        const payer = data.paidBy ?? (existing as any).paidBy;
        if (!mode || !payer) {
          return res.status(400).json({ message: "Payment Mode and Paid By are required to mark as paid." });
        }
      }

      const payer = (data.paidBy ?? (existing as any).paidBy ?? "").trim();
      const isCompanyPayer = payer.toLowerCase() === "company";
      const markingPaid = data.paymentStatus === "paid" && (existing as any).paymentStatus !== "paid";
      const newCompanyCorrection = (existing as any).paymentStatus === "paid"
        && data.paidBy?.toLowerCase() === "company";
      const companyAccountEdit = isCompanyPayer && data.paymentAccountKey !== undefined;
      const legacyAlreadyPaidWithoutAccount = (existing as any).paymentStatus === "paid"
        && String((existing as any).paidBy || "").toLowerCase() === "company"
        && data.paidBy === undefined
        && data.paymentAccountKey === undefined;
      const effectiveAccountKey = data.paymentAccountKey !== undefined
        ? data.paymentAccountKey
        : (existing as any).paymentAccountKey;

      // New company payments and explicit corrections to company payer must
      // name a configured account. Do not block legacy paid rows that have no
      // account simply because they are being read or receive another field
      // correction.
      if (isCompanyPayer && (markingPaid || newCompanyCorrection || companyAccountEdit) && !legacyAlreadyPaidWithoutAccount && !effectiveAccountKey) {
        return res.status(400).json({ message: "A Bank / Account is required for a company payment." });
      }
      if (isCompanyPayer && effectiveAccountKey) {
        const accounts = await storage.getVendorBillCompanyAccounts();
        if (!accounts.some(account => account.id === effectiveAccountKey)) {
          return res.status(400).json({ message: "Select a configured company bank account." });
        }
      }

      // Personal payments must actively clear any company account, including
      // when the caller omitted the optional field while correcting details.
      if (!isCompanyPayer) data.paymentAccountKey = null;

      const requirement = await storage.updateDieselPaymentStatus(id, data, currentUserName(req));
      res.json(requirement);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      if ((err as any)?.code === "BAD_REQUEST") {
        return res.status(400).json({ message: (err as any).message });
      }
      console.error("Error updating diesel payment status:", err);
      res.status(500).json({ message: "Failed to update payment status" });
    }
  });

  
```

## PUT /api/diesel-requirements/:id — server/routes.ts:11216

```typescript
app.put("/api/diesel-requirements/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { pin: _pin, ...data } = req.body;

      const existing = await storage.getDieselRequirement(id);
      if (!existing) return res.status(404).json({ message: "Diesel requirement not found" });

      // Permission check: non-pending records require admin.
      if (existing.status !== "pending") {
        if (!assertAdmin(req, res)) return;
      } else {
        if (!assertEditEither(req, res, "site_diesel", "diesel_req_raise")) return;
      }

      const validatedData = createDieselRequirementRequestSchema.parse(data);
      const requirement = await storage.updateDieselRequirement(id, validatedData);
      if (!requirement) return res.status(404).json({ message: "Diesel requirement not found" });

      res.json(requirement);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      if (err?.message?.startsWith("Cannot edit")) return res.status(400).json({ message: err.message });
      console.error("Error updating diesel requirement:", err);
      res.status(500).json({ message: "Failed to update diesel requirement" });
    }
  });

  
```

## DELETE /api/diesel-requirements/:id — server/routes.ts:11244

```typescript
app.delete("/api/diesel-requirements/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const id = Number(req.params.id);
      const deleted = await storage.deleteDieselRequirement(id);
      if (!deleted) return res.status(404).json({ message: "Diesel requirement not found" });
      res.json({ success: true });
    } catch (err: any) {
      if (err?.message?.startsWith("Cannot delete")) return res.status(400).json({ message: err.message });
      console.error("Error deleting diesel requirement:", err);
      res.status(500).json({ message: "Failed to delete diesel requirement" });
    }
  });

  // ============================================
  // VENDOR BILLS
  // ============================================

  async function resolveVendorBillSite(req: Express.Request, res: Express.Response, rawSiteId: unknown) {
    if (rawSiteId == null || rawSiteId === "") return { siteId: null, siteName: null };
    const siteId = Number(rawSiteId);
    if (!Number.isInteger(siteId) || siteId <= 0) {
      res.status(400).json({ message: "siteId must be a positive integer or null for All Sites" });
      return null;
    }
    const site = (await storage.getSites()).find(candidate => candidate.id === siteId);
    if (!site) {
      res.status(400).json({ message: "Selected site does not exist" });
      return null;
    }
    if (!await assertTripSiteAccess(req, res, site.name)) return null;
    return { siteId, siteName: site.name };
  }

  async function scopeVendorBillsToSiteAccess(req: Express.Request, bills: any[]) {
    const permitted = await getPermittedSiteNames(req);
    if (permitted === null) return bills;
    const siteNameById = new Map((await storage.getSites()).map(site => [site.id, site.name]));
    return bills.filter(bill => vendorBillVisibleToSites(bill, permitted, siteNameById));
  }

  async function assertVendorBillAutoSources(
    req: Express.Request,
    res: Express.Response,
    input: z.infer<typeof createVendorBillRequestSchema>,
    selectedSiteName: string | null,
    existingItems: any[] = [],
  ): Promise<boolean> {
    if (input.items.some(item => item.arrangementPricing && !tripBillIdentity(item.source))) {
      res.status(400).json({ message: "Arrangement snapshots require a qualified trip source." }); return false;
    }
    if (input.items.some(item => item.arrangementPricing) && input.hireGroups === undefined &&
        Math.abs(Number(input.totalAmount) - input.items.reduce((sum, item) => sum + Number(item.amount || 0), 0)) > 0.001) {
      res.status(400).json({ message: "Bill total does not match its frozen arrangement and other line amounts." }); return false;
    }
    const frozenError = arrangementBillValidationError(
      input.items.filter(item => existingItems.some(saved => saved.source?.toLowerCase() === item.source?.toLowerCase())), [], existingItems,
    );
    if (frozenError) { res.status(409).json({ message: frozenError }); return false; }
    const untrustedAutoItems = untrustedVendorBillAutoItems(input.items, existingItems);
    const submittedAutoSources = untrustedAutoItems
      .map(item => String(item.source || "").toLowerCase())
      .filter(source => source === "auto" || source.startsWith("auto:"));
    if (submittedAutoSources.length === 0) return true;
    if (!input.periodFrom || !input.periodTo) {
      res.status(400).json({ message: "Auto-pulled items require a bill period" });
      return false;
    }
    let authoritative = await storage.getVendorBillAutoItems(
      input.vendorName, input.billType, input.periodFrom, input.periodTo, null, selectedSiteName,
    );
    if (!selectedSiteName) {
      const permitted = await getPermittedSiteNames(req);
      if (permitted !== null) {
        authoritative = authoritative.filter(item =>
          permitted.some(site => vendorBillItemMatchesSite(item.siteName, site)));
      }
    }
    const validSources = new Set(authoritative
      .filter(item => item.sourceType !== "site_material_trip_unresolved")
      .map(vendorBillAutoSourceFromCandidate)
      .filter((source): source is string => source != null));
    const pricingError = arrangementBillValidationError(input.items, authoritative, existingItems);
    if (pricingError) { res.status(409).json({ message: pricingError }); return false; }
    if (submittedAutoSources.some(source => !validSources.has(source))) {
      res.status(400).json({ message: "One or more auto-pulled items no longer match the selected site and period" });
      return false;
    }
    return true;
  }

  
```

## GET /api/vendor-bills — server/routes.ts:11335

```typescript
app.get("/api/vendor-bills", async (req, res) => {
    try {
      const filters = {
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        vendor: req.query.vendor as string | undefined,
        status: req.query.status as string | undefined,
      };
      let bills = await storage.getVendorBills(filters);
      const selectedSite = await resolveVendorBillSite(req, res, req.query.siteId);
      if (!selectedSite) return;
      bills = await scopeVendorBillsToSiteAccess(req, bills);
      if (selectedSite.siteName) {
        bills = bills.filter(bill => bill.siteId === selectedSite.siteId ||
          (bill.siteId == null && bill.items?.some(item => vendorBillItemMatchesSite(item.siteName, selectedSite.siteName!))));
      }
      res.json(bills);
    } catch (err) {
      console.error("Error fetching vendor bills:", err);
      res.status(500).json({ message: "Failed to fetch vendor bills" });
    }
  });

  
```

## GET /api/vendor-bills/summary — server/routes.ts:11358

```typescript
app.get("/api/vendor-bills/summary", async (req, res) => {
    try {
      const filters = {
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        vendor: req.query.vendor as string | undefined,
        status: req.query.status as string | undefined,
      };
      const bills = await scopeVendorBillsToSiteAccess(req, await storage.getVendorBills(filters));

      const { total: totalGst, ...gstByCategory } = aggregateGstBreakdown(bills);

      const summary = {
        total: bills.length,
        totalAmount: bills.reduce((sum, b) => sum + (b.totalAmount || 0), 0),
        draft: bills.filter(b => b.status === "draft").length,
        draftAmount: bills.filter(b => b.status === "draft").reduce((sum, b) => sum + (b.totalAmount || 0), 0),
        verified: bills.filter(b => b.status === "verified").length,
        verifiedAmount: bills.filter(b => b.status === "verified").reduce((sum, b) => sum + (b.totalAmount || 0), 0),
        approved: bills.filter(b => b.status === "approved").length,
        approvedAmount: bills.filter(b => b.status === "approved").reduce((sum, b) => sum + (b.totalAmount || 0), 0),
        paid: bills.filter(b => b.status === "paid").length,
        paidAmount: bills.filter(b => b.status === "paid").reduce((sum, b) => sum + (b.totalAmount || 0), 0),
        gstByCategory,
        totalGst,
      };
      res.json(summary);
    } catch (err) {
      console.error("Error fetching vendor bills summary:", err);
      res.status(500).json({ message: "Failed to fetch vendor bills summary" });
    }
  });

  // Multi-day CSV/Excel export of GST Register / Vendor Ledger.
  // Mirrors task #193's daily-reports-export shape: a Summary cover (range,
  // vendor scope, totals, per-category breakdown, per-vendor breakdown when
  // exporting all vendors) followed by a per-bill Detail listing.
  // Filters (dateFrom/dateTo/vendor/status/category) are applied here so the
  // download mirrors what the user sees on screen.
  
```

## GET /api/vendor-bills/export — server/routes.ts:11397

```typescript
app.get("/api/vendor-bills/export", async (req, res) => {
    try {
      if (!assertReportExport(req, res, "vendor_bills", "vendor_bills_view")) return;
      const dateFrom = (req.query.dateFrom as string) || undefined;
      const dateTo = (req.query.dateTo as string) || undefined;
      const vendor = (req.query.vendor as string) || undefined;
      const status = (req.query.status as string) || undefined;
      const categoryFilter = ((req.query.category as string) || "all").toLowerCase();
      const requestedFormat = String(req.query.format || "xlsx").toLowerCase();
      const format = requestedFormat === "csv" || requestedFormat === "pdf" ? requestedFormat : "xlsx";

      const selectedSite = await resolveVendorBillSite(req, res, req.query.siteId);
      if (!selectedSite) return;
      let billsRaw = await scopeVendorBillsToSiteAccess(req,
        await storage.getVendorBills({ dateFrom, dateTo, vendor, status }));
      if (selectedSite.siteName) {
        billsRaw = billsRaw.filter(bill => bill.siteId === selectedSite.siteId ||
          (bill.siteId == null && bill.items?.some((item: any) =>
            vendorBillItemMatchesSite(item.siteName, selectedSite.siteName!))));
      }
      // Apply category filter the same way the UI does (combined => "all" billType).
      const bills = categoryFilter === "all"
        ? billsRaw
        : billsRaw.filter(b => {
            const target = categoryFilter === "combined" ? "all" : categoryFilter;
            return (b.billType || "").toLowerCase() === target;
          });
      // Sort newest first for both summary and detail.
      bills.sort((a, b) => (b.billDate || "").localeCompare(a.billDate || ""));

      // Restricted exports must not disclose unrelated vendor names either.
      const allVendorNames = (await getPermittedSiteNames(req)) === null
        ? await storage.getVendorNames()
        : Array.from(new Set(bills.map(bill => bill.vendorName)));

      const vendorScope = vendor && vendor !== "all" ? vendor : "All vendors";
      const isLedger = vendor && vendor !== "all";
      const reportLabel = isLedger ? `Vendor Ledger — ${vendorScope}` : "GST Register — Category Breakdown";

      const sortedDates = bills.map(b => b.billDate).filter(Boolean).sort();
      const fromD = dateFrom || sortedDates[0] || "";
      const toD = dateTo || sortedDates[sortedDates.length - 1] || "";
      const rangeLabel = !fromD && !toD ? "all dates"
        : fromD === toD ? fromD
        : `${fromD || "…"} → ${toD || "…"}`;
      const generatedAt = new Date().toISOString().slice(0, 19).replace("T", " ") + " UTC";
      const filenameRange = fromD && toD
        ? (fromD === toD ? fromD : `${fromD}_to_${toD}`)
        : "all-dates";
      const filenameScope = isLedger ? `vendor-ledger-${vendorScope}` : "gst-register";
      const safeFilename = `${filenameScope}-${filenameRange}`.replace(/[^A-Za-z0-9._-]+/g, "_");

      // Per-bill numbers. Bills are internal-only records, so a single GST
      // total is shown — no CGST/SGST/IGST split.
      type BillRow = {
        billNo: string; date: string; vendor: string; category: string;
        taxable: number; gst: number; total: number;
      };
      const detailRows: BillRow[] = bills.map(b => {
        const taxable = b.totalAmount || 0;
        const cat = computeBillGstByCategory(b);
        const gst = cat.equipment + cat.material + cat.transport + cat.labour + cat.other;
        return {
          billNo: b.billNo,
          date: b.billDate,
          vendor: b.vendorName,
          category: (b.billType || "other").toLowerCase(),
          taxable,
          gst,
          total: taxable + gst,
        };
      });

      const totals = aggregateGstBreakdown(bills);
      const totalTaxable = bills.reduce((s, b) => s + (b.totalAmount || 0), 0);
      const grandTotal = totalTaxable + totals.total;

      // Category summary — always show the 4 main categories so empty buckets
      // appear as "—" rows instead of being silently dropped. "Other" is only
      // listed if it has a non-zero contribution.
      const baseCategories: GstCategory[] = ["equipment", "material", "transport", "labour"];
      const categoryList: GstCategory[] = totals.other > 0
        ? [...baseCategories, "other" as GstCategory]
        : baseCategories;
      type CatRow = { category: string; bills: number | string; taxable: number | string; gst: number | string };
      const categoryRows: CatRow[] = categoryList.map(cat => {
        const billsInCat = bills.filter(b => {
          const bt = (b.billType || "other").toLowerCase();
          if (bt === "all") {
            // Combined bill — count if it has any line item in this category.
            return (b.items || []).some(it => ((it.category || "other").toLowerCase()) === cat);
          }
          return bt === cat;
        });
        const taxable = billsInCat.reduce((s, b) => {
          const bt = (b.billType || "other").toLowerCase();
          if (bt === "all") {
            return s + (b.items || [])
              .filter(it => ((it.category || "other").toLowerCase()) === cat)
              .reduce((ss, it) => ss + (it.amount || 0), 0);
          }
          return s + (b.totalAmount || 0);
        }, 0);
        const gstAmt = totals[cat] || 0;
        const isEmpty = billsInCat.length === 0 && gstAmt === 0;
        return {
          category: cat.toUpperCase(),
          bills: isEmpty ? "—" : billsInCat.length,
          taxable: isEmpty ? "—" : taxable,
          gst: isEmpty ? "—" : gstAmt,
        };
      });

      // Vendor summary — only when exporting the full GST register. Include
      // every known vendor so vendors with no bills in range show as "—".
      type VendorRow = { vendor: string; bills: number | string; taxable: number | string; gst: number | string };
      let vendorRows: VendorRow[] = [];
      if (!isLedger) {
        const byVendor = new Map<string, typeof bills>();
        for (const b of bills) {
          const k = b.vendorName.toUpperCase();
          if (!byVendor.has(k)) byVendor.set(k, []);
          byVendor.get(k)!.push(b);
        }
        const vendorSet = new Set<string>([
          ...allVendorNames.map(v => v.toUpperCase()),
          ...Array.from(byVendor.keys()),
        ]);
        vendorRows = Array.from(vendorSet).sort().map(v => {
          const list = byVendor.get(v) || [];
          if (list.length === 0) {
            return { vendor: v, bills: "—", taxable: "—", gst: "—" };
          }
          const tx = list.reduce((s, b) => s + (b.totalAmount || 0), 0);
          const { total: g } = aggregateGstBreakdown(list);
          return { vendor: v, bills: list.length, taxable: tx, gst: g };
        });
      }

      const fmtNum = (n: number) => n.toFixed(2);
      const fmtCell = (v: number | string) => (typeof v === "number" ? fmtNum(v) : v);

      if (format === "pdf") {
        const config = await getCompanyConfig();
        const pdf = buildGstRegisterPdf({
          title: reportLabel, company: config.companyName,
          metadata: [
            `Range: ${rangeLabel}`, `Vendor: ${vendorScope}`,
            `Status filter: ${status && status !== "all" ? status : "all"}`,
            `Category filter: ${categoryFilter}`,
            `Bills in range: ${bills.length}`,
            `Totals: Taxable ${fmtNum(totalTaxable)} + GST ${fmtNum(totals.total)} = ${fmtNum(grandTotal)}`,
            `Generated: ${generatedAt}`,
          ],
          categories: [
            ...categoryRows.map(r => [r.category, r.bills, fmtCell(r.taxable), fmtCell(r.gst)]),
            ["TOTAL", bills.length, fmtNum(totalTaxable), fmtNum(totals.total)],
          ],
          details: detailRows.length ? [
            ...detailRows.map(r => [r.billNo, r.date, r.vendor, r.category, fmtNum(r.taxable), fmtNum(r.gst), fmtNum(r.total)]),
            ["TOTAL", "", "", "", fmtNum(totalTaxable), fmtNum(totals.total), fmtNum(grandTotal)],
          ] : [["—", "—", "—", "—", "—", "—", "—"]],
        });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}.pdf"`);
        return res.send(pdf);
      }

      if (format === "csv") {
        const escape = (v: any) => {
          const s = v == null ? "" : String(v);
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const toLine = (cells: any[]) => cells.map(escape).join(",");
        const lines: string[] = [];
        const _vbCsvCfg = await getCompanyConfig();
        lines.push(toLine([`${reportLabel} — Cover Sheet`]));
        lines.push(toLine([_vbCsvCfg.companyName]));
        lines.push(toLine([`Range: ${rangeLabel}`]));
        lines.push(toLine([`Vendor: ${vendorScope}`]));
        lines.push(toLine([`Status filter: ${status && status !== "all" ? status : "all"}`]));
        lines.push(toLine([`Category filter: ${categoryFilter !== "all" ? categoryFilter : "all"}`]));
        lines.push(toLine([`Bills in range: ${bills.length}`]));
        lines.push(toLine([`Totals: Taxable ${fmtNum(totalTaxable)} + GST ${fmtNum(totals.total)} = ${fmtNum(grandTotal)}`]));
        lines.push(toLine([`Generated: ${generatedAt}`]));
        lines.push("");
        lines.push(toLine(["== SUMMARY — GST BY CATEGORY =="]));
        lines.push(toLine(["Category", "Bills", "Taxable", "GST"]));
        for (const r of categoryRows) {
          lines.push(toLine([r.category, r.bills, fmtCell(r.taxable), fmtCell(r.gst)]));
        }
        lines.push(toLine(["TOTAL", bills.length, fmtNum(totalTaxable), fmtNum(totals.total)]));
        if (!isLedger) {
          lines.push("");
          lines.push(toLine(["== SUMMARY — BY VENDOR =="]));
          lines.push(toLine(["Vendor", "Bills", "Taxable", "GST"]));
          for (const r of vendorRows) {
            lines.push(toLine([r.vendor, r.bills, fmtCell(r.taxable), fmtCell(r.gst)]));
          }
          lines.push(toLine(["TOTAL", bills.length, fmtNum(totalTaxable), fmtNum(totals.total)]));
        }
        lines.push("");
        lines.push(toLine(["== DETAIL (every bill in range) =="]));
        lines.push(toLine(["Bill No", "Date", "Vendor", "Category", "Taxable", "GST", "Total"]));
        if (detailRows.length === 0) {
          lines.push(toLine(["—", "—", "—", "—", "—", "—", "—"]));
        } else {
          for (const r of detailRows) {
            lines.push(toLine([r.billNo, r.date, r.vendor, r.category, fmtNum(r.taxable), fmtNum(r.gst), fmtNum(r.total)]));
          }
          lines.push(toLine(["TOTAL", "", "", "", fmtNum(totalTaxable), fmtNum(totals.total), fmtNum(grandTotal)]));
        }
        const body = "\uFEFF" + lines.join("\r\n") + "\r\n";
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}.csv"`);
        res.send(body);
        return;
      }

      // xlsx — Summary sheet (cover + category + vendor) and Detail sheet.
      const wb = xlsx.utils.book_new();
      const _vbXlsxCfg = await getCompanyConfig();
      const summaryAoa: any[][] = [
        [`${reportLabel} — Cover Sheet`],
        [_vbXlsxCfg.companyName],
        [`Range: ${rangeLabel}`],
        [`Vendor: ${vendorScope}`],
        [`Status filter: ${status && status !== "all" ? status : "all"}`],
        [`Category filter: ${categoryFilter !== "all" ? categoryFilter : "all"}`],
        [`Bills in range: ${bills.length}`],
        [`Totals: Taxable ${fmtNum(totalTaxable)} + GST ${fmtNum(totals.total)} = ${fmtNum(grandTotal)}`],
        [`Generated: ${generatedAt}`],
        [],
        ["GST by Category"],
        ["Category", "Bills", "Taxable", "GST"],
        ...categoryRows.map(r => [r.category, r.bills, fmtCell(r.taxable), fmtCell(r.gst)]),
        ["TOTAL", bills.length, fmtNum(totalTaxable), fmtNum(totals.total)],
      ];
      if (!isLedger) {
        summaryAoa.push([]);
        summaryAoa.push(["By Vendor"]);
        summaryAoa.push(["Vendor", "Bills", "Taxable", "GST"]);
        for (const r of vendorRows) {
          summaryAoa.push([r.vendor, r.bills, fmtCell(r.taxable), fmtCell(r.gst)]);
        }
        summaryAoa.push(["TOTAL", bills.length, fmtNum(totalTaxable), fmtNum(totals.total)]);
      }
      const summarySheet = xlsx.utils.aoa_to_sheet(summaryAoa);
      (summarySheet as any)["!cols"] = [
        { wch: 32 }, { wch: 10 }, { wch: 16 }, { wch: 16 },
      ];
      xlsx.utils.book_append_sheet(wb, summarySheet, "Summary");

      const detailAoa: any[][] = [
        ["Bill No", "Date", "Vendor", "Category", "Taxable", "GST", "Total"],
      ];
      if (detailRows.length === 0) {
        detailAoa.push(["—", "—", "—", "—", "—", "—", "—"]);
      } else {
        for (const r of detailRows) {
          detailAoa.push([r.billNo, r.date, r.vendor, r.category, fmtNum(r.taxable), fmtNum(r.gst), fmtNum(r.total)]);
        }
        detailAoa.push(["TOTAL", "", "", "", fmtNum(totalTaxable), fmtNum(totals.total), fmtNum(grandTotal)]);
      }
      const detailSheet = xlsx.utils.aoa_to_sheet(detailAoa);
      (detailSheet as any)["!cols"] = [
        { wch: 18 }, { wch: 12 }, { wch: 28 }, { wch: 12 },
        { wch: 14 }, { wch: 14 }, { wch: 14 },
      ];
      xlsx.utils.book_append_sheet(wb, detailSheet, "Detail");

      const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}.xlsx"`);
      res.send(buf);
    } catch (err: any) {
      console.error("Error exporting vendor bills:", err);
      res.status(500).json({ message: err?.message || "Failed to export vendor bills" });
    }
  });

  
```

## GET /api/vendor-bills/vendor-names — server/routes.ts:11724

```typescript
app.get("/api/vendor-bills/vendor-names", async (req, res) => {
    try {
      const names = await storage.getVendorNames();
      res.json(names);
    } catch (err) {
      console.error("Error fetching vendor names:", err);
      res.status(500).json({ message: "Failed to fetch vendor names" });
    }
  });

  // Equipment Hire has master-agreement eligibility, not activity-row
  // eligibility.  Keep the generic discovery endpoint below unchanged for
  // every other vendor-bill type.
  
```

## GET /api/vendor-bills/equipment-hire-discovery — server/routes.ts:11737

```typescript
app.get("/api/vendor-bills/equipment-hire-discovery", async (req, res) => {
    try {
      if (!assertViewEither(req, res, "vendor_bills", "vendor_bills_raise")) return;
      const query = z.object({
        periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }).refine(value => value.periodFrom <= value.periodTo, {
        message: "periodFrom must be on or before periodTo",
      }).parse(req.query);
      res.json(await storage.getEquipmentHireVendors(query.periodFrom, query.periodTo));
    } catch (err: any) {
      res.status(err instanceof z.ZodError ? 400 : 500).json({
        message: err?.message || "Failed to discover equipment-hire vendors",
      });
    }
  });

  
```

## GET /api/vendor-bills/discover-vendors — server/routes.ts:11754

```typescript
app.get("/api/vendor-bills/discover-vendors", async (req, res) => {
    try {
      const billType = req.query.billType as string;
      const periodFrom = req.query.periodFrom as string;
      const periodTo = req.query.periodTo as string;
      if (!billType || !periodFrom || !periodTo) {
        return res.status(400).json({ message: "billType, periodFrom, and periodTo are required" });
      }
      const vendors = await storage.discoverVendors(billType, periodFrom, periodTo);
      res.json(vendors);
    } catch (err) {
      console.error("Error discovering vendors:", err);
      res.status(500).json({ message: "Failed to discover vendors" });
    }
  });

  // Read-only forecast. Register before the parameterized bill lookup.
  
```

## GET /api/vendor-bills/payables-preview — server/routes.ts:11771

```typescript
app.get("/api/vendor-bills/payables-preview", async (req, res) => {
    try {
      if (!req.authUser) return res.status(401).json({ error: "not_authenticated" });
      if (req.query.export === "1") {
        if (!assertReportExport(req, res, "vendor_bills", "vendor_bills_view")) return;
      } else if (!req.authUser.isAdmin && !req.authUser.isOwner
        && !req.authPermissions?.vendor_bills?.view_reports
        && !req.authPermissions?.vendor_bills_view?.view_reports) {
        return res.status(403).json({ error: "forbidden", action: "view_reports" });
      }
      if (req.authUser?.isFieldEngineer) return res.status(403).json({ error: "forbidden", message: "Payables preview is not available to field engineers." });
      const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
        const parsed = new Date(`${value}T00:00:00Z`);
        return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
      }, "A valid calendar date is required");
      const rates = req.query.gstRates === undefined ? undefined : JSON.parse(String(req.query.gstRates));
      const input = z.object({
        vendorName: z.string().trim().min(1).max(200), periodFrom: date, periodTo: date,
        gstRates: z.object({ equipment: z.number().min(0).max(100).nullable().optional(),
          material: z.number().min(0).max(100).nullable().optional(), transport: z.number().min(0).max(100).nullable().optional(),
          labour: z.number().min(0).max(100).nullable().optional(), other: z.number().min(0).max(100).nullable().optional() }).strict().optional(),
      }).refine(value => value.periodFrom <= value.periodTo, "periodFrom must be on or before periodTo")
        .parse({ vendorName: req.query.vendorName, periodFrom: req.query.periodFrom, periodTo: req.query.periodTo, gstRates: rates });
      const site = await resolveVendorBillSite(req, res, req.query.siteId);
      if (!site) return;
      const permittedSiteNames = await getPermittedSiteNames(req);
      res.setHeader("Cache-Control", "no-store");
      res.json(await buildVendorPayablesPreview(storage, input, { ...site, permittedSiteNames }));
    } catch (err) {
      const badRequest = err instanceof z.ZodError || err instanceof SyntaxError;
      res.status(badRequest ? 400 : 500).json({ message: badRequest ? "Invalid preview vendor, period, site or GST inputs." : "Unable to build payables preview. Retry without saving a bill." });
    }
  });

  
```

## GET /api/vendor-bills/auto-items — server/routes.ts:11805

```typescript
app.get("/api/vendor-bills/auto-items", async (req, res) => {
    try {
      const vendorName = req.query.vendorName as string;
      const billType = req.query.billType as string;
      const periodFrom = req.query.periodFrom as string;
      const periodTo = req.query.periodTo as string;
      const entryTypeFilter = (req.query.entryTypeFilter as string) || null;
      if (!vendorName || !billType || !periodFrom || !periodTo) {
        return res.status(400).json({ message: "vendorName, billType, periodFrom, and periodTo are required" });
      }
      const selectedSite = await resolveVendorBillSite(req, res, req.query.siteId);
      if (!selectedSite) return;
      let items = await storage.getVendorBillAutoItems(vendorName, billType, periodFrom, periodTo, entryTypeFilter, selectedSite.siteName);
      if (!selectedSite.siteName) {
        const permitted = await getPermittedSiteNames(req);
        if (permitted !== null) {
          items = items.filter(item => permitted.some(site => vendorBillItemMatchesSite(item.siteName, site)));
        }
      }
      res.json(await attachVendorBillEquipmentEvidence(items, await getPermittedSiteNames(req)));
    } catch (err) {
      console.error("Error fetching vendor bill auto items:", err);
      res.status(500).json({ message: "Failed to fetch auto items" });
    }
  });

  // Rich, source-qualified audit feed used only by the hire-group composer.
  // Legacy auto-items intentionally remains its existing per-row contract.
  
```

## GET /api/vendor-bills/hire-activities — server/routes.ts:11833

```typescript
app.get("/api/vendor-bills/hire-activities", async (req, res) => {
    try {
      if (!assertView(req, res, "vendor_bills")) return;
      const query = z.object({
        vendorName: z.string().min(1),
        periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }).refine(value => value.periodFrom <= value.periodTo, { message: "periodFrom must be on or before periodTo" }).parse(req.query);
      res.json(await storage.getVendorBillHireActivities(query.vendorName, query.periodFrom, query.periodTo));
    } catch (err: any) {
      res.status(err instanceof z.ZodError ? 400 : 500).json({ message: err?.message || "Failed to fetch hire activities" });
    }
  });

  
```

## GET /api/vendor-bills/previous-rates — server/routes.ts:11847

```typescript
app.get("/api/vendor-bills/previous-rates", async (req, res) => {
    try {
      const vendorName = req.query.vendorName as string;
      if (!vendorName) {
        return res.status(400).json({ message: "vendorName is required" });
      }
      const bills = await storage.getVendorBills();
      const vendorBills = bills
        .filter(b => b.vendorName.toUpperCase().trim() === vendorName.toUpperCase().trim() && b.items && b.items.length > 0)
        .sort((a, b) => new Date(b.billDate).getTime() - new Date(a.billDate).getTime());
      
      const rateMap: Record<string, { rate: number; leadDistance?: number }> = {};
      for (const bill of vendorBills) {
        for (const item of (bill.items || [])) {
          if (item.rate && item.rate > 0 && item.equipmentId) {
            const etMatch = (item.description || "").match(/(HOURLY HIRE|DAILY HIRE|TRIP BASED|MONTHLY HIRE|TIME\/METER|MOBILIZATION)/);
            const rawLabel = etMatch?.[1] || "OTHER";
            const normalizedLabel = rawLabel.replace(/\s+/g, "_").replace("/", "_");
            const key = `${item.equipmentId}_${normalizedLabel}`;
            if (!rateMap[key]) {
              rateMap[key] = { rate: item.rate, leadDistance: item.leadDistance || undefined };
            }
          }
        }
      }
      res.json(rateMap);
    } catch (err) {
      console.error("Error fetching previous rates:", err);
      res.status(500).json({ message: "Failed to fetch previous rates" });
    }
  });

  // VB-01 deliberately uses one small, stable app setting rather than a
  // banking/accounts-payable module. The client receives only selector data.
  
```

## GET /api/vendor-bills/company-accounts — server/routes.ts:11881

```typescript
app.get("/api/vendor-bills/company-accounts", async (req, res) => {
    try {
      if (!req.authUser) {
        res.status(401).json({ error: "not_authenticated" });
        return;
      }
      const canRead = req.authUser.isAdmin
        || req.authUser.isOwner
        || !!req.authPermissions?.vendor_bills?.view
        // Diesel payment editors need the shared account selector even when
        // their role is intentionally limited to editing diesel payments.
        || !!req.authPermissions?.site_diesel?.edit
        || !!req.authPermissions?.diesel_req_raise?.edit;
      if (!canRead) {
        res.status(403).json({ error: "forbidden", sections: ["vendor_bills", "site_diesel"], action: "view" });
        return;
      }
      res.json(await storage.getVendorBillCompanyAccounts());
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch company accounts" });
    }
  });

  
```

## GET /api/vendor-bills/:id — server/routes.ts:11904

```typescript
app.get("/api/vendor-bills/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const bill = await storage.getVendorBill(id);
      if (!bill) {
        return res.status(404).json({ message: "Vendor bill not found" });
      }
      const visible = await scopeVendorBillsToSiteAccess(req, [bill]);
      if (visible.length === 0) return res.status(403).json({ message: "Access denied for this bill's site" });
      const needsLegacyEvidence = bill.items.some(item =>
        item.category?.toLowerCase() === "equipment" && item.source === "auto" && item.equipmentId && !item.hireStatementId);
      const candidates = needsLegacyEvidence && bill.periodFrom && bill.periodTo
        ? await storage.getVendorBillAutoItems(bill.vendorName, "equipment", bill.periodFrom, bill.periodTo)
        : [];
      const evidenceItems = resolveSavedEquipmentEvidenceSources(bill.items, candidates);
      res.json({ ...bill, items: await attachVendorBillEquipmentEvidence(evidenceItems, await getPermittedSiteNames(req)) });
    } catch (err) {
      console.error("Error fetching vendor bill:", err);
      res.status(500).json({ message: "Failed to fetch vendor bill" });
    }
  });

  
```

## POST /api/vendor-bills — server/routes.ts:11926

```typescript
app.post("/api/vendor-bills", async (req, res) => {
    try {
      if (!assertCreateEither(req, res, "vendor_bills_raise", "vendor_bills")) return;
      const input = createVendorBillRequestSchema.parse(req.body);
      const selectedSite = await resolveVendorBillSite(req, res, input.siteId);
      if (!selectedSite) return;
      if (selectedSite.siteName && input.items.some(item => !vendorBillItemMatchesSite(item.siteName, selectedSite.siteName!))) {
        return res.status(400).json({ message: "Every pulled item must belong to the selected bill site" });
      }
      const permittedSites = await getPermittedSiteNames(req);
      if (permittedSites !== null && input.items.some(item =>
        !permittedSites.some(site => vendorBillItemMatchesSite(item.siteName, site)))) {
        return res.status(403).json({ message: "One or more bill items are outside your permitted sites" });
      }
      if (!await assertVendorBillAutoSources(req, res, input, selectedSite.siteName)) return;
      // Equipment Hire uses the same itemized request contract as every other
      // bill type.  The optional hireGroups payload remains available for
      // historical/integrated hire statements, but a new shared-flow bill is
      // intentionally allowed to omit it (including when Equipment Master
      // hire terms are incomplete).
      // Project/site is optional bill context, retained only in the existing
      // immutable hire calculation snapshot (not a new vendor_bills column).
      // The request schema intentionally remains strict for commercial data,
      // so copy this bounded display/context field after validation.
      if (Array.isArray(req.body?.hireGroups) && input.hireGroups) {
        input.hireGroups.forEach((group, index) => {
          const projectSite = req.body.hireGroups[index]?.projectSite;
          if (typeof projectSite === "string" && projectSite.trim()) (group as any).projectSite = projectSite.trim().slice(0, 240);
        });
      }
      const bill = await storage.createVendorBill(input);
      sendPushToSection("vendor_bills_approve", "New Vendor Bill", `${bill.billNo} - ${bill.vendorName}`, "/plant/vendor-bills").catch(() => {});
      res.status(201).json(bill);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      if ((err as any)?.code === "CONFLICT") return res.status(409).json({ message: (err as any).message });
      if ((err as any)?.code === "BAD_REQUEST") return res.status(400).json({ message: (err as any).message });
      console.error("Error creating vendor bill:", err);
      res.status(500).json({ message: "Failed to create vendor bill" });
    }
  });

  
```

## PUT /api/vendor-bills/:id — server/routes.ts:11970

```typescript
app.put("/api/vendor-bills/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { pin: _pin, ...billData } = req.body;
      const input = createVendorBillRequestSchema.parse(billData);
      const existing = await storage.getVendorBill(id);
      if (!existing) {
        return res.status(404).json({ message: "Vendor bill not found" });
      }
      const existingVisible = await scopeVendorBillsToSiteAccess(req, [existing]);
      if (existingVisible.length === 0) {
        return res.status(403).json({ message: "Access denied for this bill's existing site scope" });
      }
      // Legacy/partial PUT callers predate siteId. Omission preserves the
      // persisted scope; only an explicit null changes the bill to All Sites.
      (input as any).siteId = vendorBillUpdateSiteId(
        Object.prototype.hasOwnProperty.call(billData, "siteId"),
        input.siteId,
        existing.siteId,
      );
      const selectedSite = await resolveVendorBillSite(req, res, input.siteId);
      if (!selectedSite) return;
      if (selectedSite.siteName && input.items.some(item => !vendorBillItemMatchesSite(item.siteName, selectedSite.siteName!))) {
        return res.status(400).json({ message: "Every pulled item must belong to the selected bill site" });
      }
      const permittedSites = await getPermittedSiteNames(req);
      if (permittedSites !== null && input.items.some(item =>
        !permittedSites.some(site => vendorBillItemMatchesSite(item.siteName, site)))) {
        return res.status(403).json({ message: "One or more bill items are outside your permitted sites" });
      }
      if (!await assertVendorBillAutoSources(req, res, input, selectedSite.siteName, existing.items)) return;
      // The shared request schema intentionally defaults an omitted list to
      // [] for creates. On update, older callers that do not know VB18 must
      // preserve the stored list; only an explicit [] (or null) clears it.
      if (!Object.prototype.hasOwnProperty.call(billData, "additionalAdjustments")) {
        delete (input as any).additionalAdjustments;
      }
      if (Array.isArray(billData?.hireGroups) && input.hireGroups) {
        input.hireGroups.forEach((group, index) => {
          const projectSite = billData.hireGroups[index]?.projectSite;
          if (typeof projectSite === "string" && projectSite.trim()) (group as any).projectSite = projectSite.trim().slice(0, 240);
        });
      }

      // Permission check: verified/approved/paid bills require admin.
      if (existing.status === "verified" || existing.status === "approved" || existing.status === "paid") {
        if (!assertAdmin(req, res)) return;
        input.status = "draft";
      } else {
        if (!assertEditEither(req, res, "vendor_bills", "vendor_bills_raise")) return;
      }

      const bill = await storage.updateVendorBill(id, input);
      if (!bill) {
        return res.status(404).json({ message: "Vendor bill not found" });
      }

      res.json(bill);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      if ((err as any)?.code === "CONFLICT") return res.status(409).json({ message: (err as any).message });
      if ((err as any)?.code === "BAD_REQUEST") return res.status(400).json({ message: (err as any).message });
      console.error("Error updating vendor bill:", err);
      res.status(500).json({ message: "Failed to update vendor bill" });
    }
  });

  // 06M-A: retrospective Payment Mode / Paid By on a vendor bill. Same
  // permission as marking a bill paid; never changes status or timestamps.
  
```

## PATCH /api/vendor-bills/:id/payment-details — server/routes.ts:12041

```typescript
app.patch("/api/vendor-bills/:id/payment-details", async (req, res) => {
    try {
      if (!assertApprove(req, res, "vendor_bills_approve")) return;
      const id = Number(req.params.id);
      const detailsSchema = z.object({
        paymentMode: z.enum(["cash", "credit", "advance", "upi", "cheque", "rtgs"]).nullable().optional(),
        paidBy: z.string().max(120).nullable().optional(),
        amountPaid: z.number().finite().nonnegative().nullable().optional(),
        paymentAccountKey: z.string().max(120).nullable().optional(),
      });
      const details = detailsSchema.parse(req.body);
      const bill = await storage.updateVendorBillPaymentDetails(id, details);
      if (!bill) return res.status(404).json({ message: "Vendor bill not found" });
      res.json(bill);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      if ((err as any)?.code === "BAD_REQUEST") return res.status(400).json({ message: (err as any).message });
      if ((err as any)?.code === "CONFLICT") return res.status(409).json({ message: (err as any).message });
      console.error("Error updating vendor bill payment details:", err);
      res.status(500).json({ message: "Failed to update payment details" });
    }
  });

  
```

## PATCH /api/vendor-bills/:id/status — server/routes.ts:12066

```typescript
app.patch("/api/vendor-bills/:id/status", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const statusSchema = z.object({
        status: z.enum(["draft", "verified", "approved", "paid"]),
      });
      const { status } = statusSchema.parse(req.body);

      if (status === "approved") {
        if (!assertApprove(req, res, "vendor_bills_approve")) return;
        // Self-approval prevention for vendor bills.
        const vbForApproval = await storage.getVendorBill(id);
        if (!req.authUser?.isAdmin && vbForApproval && vbForApproval.authorUserId && vbForApproval.authorUserId === req.authUser?.id) {
          return res.status(403).json({ message: "You cannot approve a bill you created." });
        }
      } else if (status === "verified") {
        if (!assertApprove(req, res, "vendor_bills_verify")) return;
        // Self-approval prevention for verification too.
        const vbForVerify = await storage.getVendorBill(id);
        if (!req.authUser?.isAdmin && vbForVerify && vbForVerify.authorUserId && vbForVerify.authorUserId === req.authUser?.id) {
          return res.status(403).json({ message: "You cannot verify a bill you created." });
        }
      } else if (status === "paid") {
        if (!assertApprove(req, res, "vendor_bills_approve")) return;
      } else {
        if (!assertEdit(req, res, "vendor_bills")) return;
      }
      const actor = currentUserName(req);

      const bill = await storage.updateVendorBillStatus(id, status, actor);
      if (!bill) {
        return res.status(404).json({ message: "Vendor bill not found" });
      }
      if (status === "approved") {
        sendPushToSection("vendor_bills_raise", "Vendor Bill Approved", `${bill.billNo} approved by ${actor}`, "/plant/vendor-bills").catch(() => {});
        sendPushToRaiser(bill.authorUserId, bill.vendorName, "Your Bill Was Approved", `${bill.billNo} has been approved by ${actor}`, "/plant/vendor-bills").catch(() => {});
      } else if (status === "paid") {
        sendPushToSection("vendor_bills_raise", "Vendor Bill Paid", `${bill.billNo} marked paid by ${actor}`, "/plant/vendor-bills").catch(() => {});
        sendPushToRaiser(bill.authorUserId, bill.vendorName, "Your Bill Was Marked Paid", `${bill.billNo} has been marked as paid by ${actor}`, "/plant/vendor-bills").catch(() => {});
      } else if (status === "verified") {
        sendPushToSection("vendor_bills_approve", "Vendor Bill Verified", `${bill.billNo} verified by ${actor}`, "/plant/vendor-bills").catch(() => {});
      } else {
        sendPushToSection("vendor_bills_view", "Vendor Bill Updated", `${bill.billNo} - ${status.toUpperCase()} by ${actor}`, "/plant/vendor-bills").catch(() => {});
      }
      res.json(bill);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      if ((err as any)?.code === "CONFLICT") return res.status(409).json({ message: (err as any).message });
      console.error("Error updating vendor bill status:", err);
      res.status(500).json({ message: "Failed to update vendor bill status" });
    }
  });

  
```

## GET /api/vendor-bills/:id/pdf — server/routes.ts:12121

```typescript
app.get("/api/vendor-bills/:id/pdf", async (req, res) => {
    try {
      if (!assertReportExport(req, res, "vendor_bills", "vendor_bills_view")) return;
      const id = Number(req.params.id);
      const bill = await storage.getVendorBill(id);
      if (!bill) {
        return res.status(404).json({ message: "Vendor bill not found" });
      }
      if (!(await scopeVendorBillsToSiteAccess(req, [bill])).length) {
        return res.status(403).json({ message: "Access denied for this bill's site" });
      }
      if (!["verified", "approved", "paid"].includes(bill.status)) {
        return res.status(400).json({ message: "PDF export is only available for verified, approved, or paid bills" });
      }

      const getBillTypeLabel = (type: string) => {
        const map: Record<string, string> = { equipment: "EQUIPMENT HIRE", material: "MATERIAL SUPPLY", transport: "TRANSPORT", labour: "LABOUR", all: "ALL", other: "OTHER / MISCELLANEOUS" };
        return map[type.toLowerCase()] || type.toUpperCase();
      };
      const getCategoryLabel = (cat: string) => {
        const map: Record<string, string> = { equipment: "EQUIP", material: "MATL", transport: "TRNS", labour: "LABOUR" };
        return map[cat] || "OTHER";
      };
      const fmtDate = (dateStr: string | null | undefined) => {
        if (!dateStr) return "-";
        try {
          const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
          const d = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : ""));
          if (Number.isNaN(d.getTime())) return dateStr;
          return `${String(d.getDate()).padStart(2, "0")}-${months[d.getMonth()]}-${d.getFullYear()}`;
        } catch { return dateStr; }
      };
      const fmtCurrency = (amt: number | null | undefined) => {
        if (amt == null) return "0.00";
        return Number(amt).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      };
      const fmtQty = (qty: number | null | undefined) => {
        if (qty == null) return "0.00";
        return Number(qty).toFixed(2);
      };

      const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => {
        const pdfBuffer = Buffer.concat(chunks);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="VendorBill-${bill.billNo}.pdf"`);
        res.send(pdfBuffer);
      });

      const pageW = 515;
      const amber = "#d97706";
      const tableX = 40;

      const _vbCfg = await getCompanyConfig();
      const _vbLogoPath = getCompanyLogoPath(_vbCfg.logoFile);
      try {
        if (_vbLogoPath) {
          const logoWidth = 60;
          const logoX = (pageW - logoWidth) / 2 + tableX;
          const logoY = doc.y;
          doc.image(_vbLogoPath, logoX, logoY, { width: logoWidth });
          doc.y = logoY + 65;
        }
      } catch {}
      doc.fontSize(18).font("Helvetica-Bold").fillColor("#000").text(_vbCfg.companyName.toUpperCase(), { align: "center" });
      doc.moveDown(0.2);
      doc.fontSize(11).font("Helvetica").fillColor("#333").text("VENDOR BILL", { align: "center" });
      doc.moveDown(0.5);

      doc.moveTo(40, doc.y).lineTo(40 + pageW, doc.y).strokeColor(amber).lineWidth(2).stroke();
      doc.moveDown(0.5);

      const metaY = doc.y;
      doc.fillColor("#000").fontSize(11).font("Helvetica-Bold");
      doc.text(`Bill No: ${bill.billNo}`, 40, metaY);
      doc.text(`Date: ${fmtDate(bill.billDate)}`, 300, metaY);
      doc.moveDown(0.3);
      doc.text(`Vendor: ${bill.vendorName}`, 40);
      const statusY = doc.y;
      doc.text(`Status: ${bill.status.toUpperCase()}`, 300, statusY - 14);
      doc.moveDown(0.2);
      doc.font("Helvetica").fontSize(10).fillColor("#000");
      doc.text(`Bill Type: ${getBillTypeLabel(bill.billType)}`, 40);
      if (bill.periodFrom && bill.periodTo) {
        doc.text(`Period: ${fmtDate(bill.periodFrom)} to ${fmtDate(bill.periodTo)}`, 300, doc.y - 14);
      }
      doc.moveDown(0.8);

      const hasLeadDist = bill.items.some((it: any) => it.leadDistance && it.leadDistance > 0);
      const colWidths = hasLeadDist
        ? [20, 52, 30, 160, 35, 28, 55, 55, 80]
        : [22, 58, 35, 195, 40, 30, 55, 80];
      const headers = hasLeadDist
        ? ["#", "Date", "Type", "Description", "Qty", "Unit", "Lead KM", "Rate (Rs.)", "Amount (Rs.)"]
        : ["#", "Date", "Type", "Description", "Qty", "Unit", "Rate (Rs.)", "Amount (Rs.)"];
      const rateColIdx = hasLeadDist ? 7 : 6;
      const descColIdx = 3;
      let y = doc.y;

      doc.fillColor("#fff").rect(tableX, y, pageW, 20).fill(amber);
      doc.fillColor("#fff").fontSize(9).font("Helvetica-Bold");
      let cx = tableX;
      headers.forEach((h, i) => {
        const align = i >= rateColIdx ? "right" : "left";
        doc.text(h, cx + 4, y + 5, { width: colWidths[i] - 8, align, lineBreak: false });
        cx += colWidths[i];
      });
      y += 20;

      const inferSiteName = (desc: string, existing: string | null) => {
        if (existing) return existing;
        if (!desc) return "";
        const d = desc.toUpperCase();
        if (d.includes("(SITE-UNLINKED)")) return "SITE*";
        if (d.includes("(SITE TRIP)")) return "SITE: TRIP";
        if (d.includes("(PLANT)")) return "PLANT";
        if (d.includes("(SITE)")) return "SITE";
        return "";
      };

      const renderPdfItemRow = (item: any, idx: number) => {
        const desc = item.description || "";
        const siteLabel = inferSiteName(desc, item.siteName || null);
        const descHeight = doc.heightOfString(desc, { width: colWidths[descColIdx] - 8, fontSize: 9 });
        const siteHeight = siteLabel ? doc.heightOfString(siteLabel, { width: colWidths[descColIdx] - 8, fontSize: 7 }) + 2 : 0;
        const rowH = Math.max(18, descHeight + siteHeight + 8);

        if (y + rowH > 720) {
          doc.addPage();
          y = 40;
        }
        const bgColor = idx % 2 === 0 ? "#fff" : "#f5f5f5";
        doc.fillColor(bgColor).rect(tableX, y, pageW, rowH).fill();

        const rowData = hasLeadDist
          ? [
              String(idx + 1), fmtDate(item.date),
              item.category ? getCategoryLabel(item.category) : "-", desc,
              fmtQty(item.qty), item.unit || "",
              item.leadDistance ? `${fmtQty(item.leadDistance)} (${fmtQty(item.leadDistance * 2)})` : "-",
              fmtCurrency(item.rate), fmtCurrency(item.amount),
            ]
          : [
              String(idx + 1), fmtDate(item.date),
              item.category ? getCategoryLabel(item.category) : "-", desc,
              fmtQty(item.qty), item.unit || "",
              fmtCurrency(item.rate), fmtCurrency(item.amount),
            ];
        doc.fillColor("#000").fontSize(9);
        cx = tableX;
        rowData.forEach((cell, i) => {
          const align = i >= rateColIdx ? "right" : "left";
          const w = colWidths[i] - 8;
          if (i === descColIdx) {
            doc.text(cell, cx + 4, y + 4, { width: w, align, lineBreak: true });
            if (siteLabel) {
              doc.fillColor("#666").fontSize(7).font("Helvetica-Oblique");
              doc.text(siteLabel, cx + 4, y + 4 + descHeight + 1, { width: w, align: "left", lineBreak: false });
              doc.fillColor("#000").fontSize(9).font("Helvetica");
            }
          } else {
            doc.text(cell, cx + 4, y + 4, { width: w, align, lineBreak: false });
          }
          cx += colWidths[i];
        });
        y += rowH;
      };

      const pdfCategories = ["equipment", "material", "transport", "labour", "other"];
      const pdfCatLabels: Record<string, string> = { equipment: "EQUIPMENT", material: "MATERIAL", transport: "TRANSPORT", labour: "LABOUR", other: "OTHER" };
      const catAmounts: Record<string, number> = {};
      bill.items.forEach((item: any) => {
        const cat = item.category || "other";
        catAmounts[cat] = (catAmounts[cat] || 0) + (item.amount || 0);
      });
      const distinctCats = Object.keys(catAmounts).filter(c => catAmounts[c] !== 0);
      const shouldGroupPdf = distinctCats.length > 1;

      doc.fillColor("#000").font("Helvetica").fontSize(9);
      if (shouldGroupPdf) {
        for (const cat of pdfCategories) {
          const catItems = bill.items.filter((it: any) => (it.category || "other") === cat);
          if (catItems.length === 0) continue;
          const catTotal = catItems.reduce((s: number, it: any) => s + (it.amount || 0), 0);

          if (y + 20 > 720) { doc.addPage(); y = 40; }
          doc.fillColor("#f0f0f0").rect(tableX, y, pageW, 20).fill();
          doc.fillColor("#000").fontSize(10).font("Helvetica-Bold");
          doc.text(`${pdfCatLabels[cat]} (${catItems.length} items)`, tableX + 8, y + 5, { width: pageW - 16 });
          y += 20;
          doc.font("Helvetica").fontSize(9);

          catItems.forEach((item: any) => {
            const origIdx = bill.items.indexOf(item);
            renderPdfItemRow(item, origIdx);
          });

          if (y + 20 > 720) { doc.addPage(); y = 40; }
          doc.fillColor("#f5f5f5").rect(tableX, y, pageW, 20).fill();
          doc.fillColor("#000").fontSize(9).font("Helvetica-Bold");
          const amtW = colWidths[colWidths.length - 1];
          doc.text(`${pdfCatLabels[cat]} Sub-total`, tableX + 4, y + 5, { width: pageW - amtW - 8, align: "right" });
          doc.text(`Rs. ${fmtCurrency(catTotal)}`, tableX + pageW - amtW + 4, y + 5, { width: amtW - 8, align: "right" });
          y += 20;

          const catGstRate = cat === "equipment" ? (bill as any).gstRateEquipment : cat === "material" ? (bill as any).gstRateMaterial : cat === "transport" ? (bill as any).gstRateTransport : cat === "labour" ? (bill as any).gstRateLabour : 0;
          if (catGstRate > 0) {
            const catGstAmt = catTotal * catGstRate / 100;
            if (y + 20 > 720) { doc.addPage(); y = 40; }
            doc.fillColor("#f0fff0").rect(tableX, y, pageW, 20).fill();
            doc.fillColor("#15803d").fontSize(9).font("Helvetica-Bold");
            doc.text(`GST ON ${pdfCatLabels[cat]} @ ${catGstRate}%`, tableX + 4, y + 5, { width: pageW - amtW - 8, align: "right" });
            doc.text(`+ Rs. ${fmtCurrency(catGstAmt)}`, tableX + pageW - amtW + 4, y + 5, { width: amtW - 8, align: "right" });
            y += 20;
          }

          doc.font("Helvetica").fontSize(9);
        }
      } else {
        bill.items.forEach((item: any, idx: number) => {
          renderPdfItemRow(item, idx);
        });
      }

      doc.strokeColor("#999").lineWidth(0.5);
      doc.moveTo(tableX, y).lineTo(tableX + pageW, y).stroke();

      const totalQty = bill.items.reduce((s: number, it: any) => s + (it.qty || 0), 0);
      const totalItems = bill.items.length;

      const summaryH = 22;
      if (y + summaryH * 2 > 720) { doc.addPage(); y = 40; }

      doc.fillColor("#f5f5f5").rect(tableX, y, pageW, summaryH).fill();
      doc.fillColor("#000").fontSize(10).font("Helvetica-Bold");
      doc.text(`TOTAL ITEMS: ${totalItems}`, tableX + 4, y + 6, { width: 200 });
      doc.text(`TOTAL QTY: ${fmtQty(totalQty)}`, tableX + 200, y + 6, { width: 150 });
      y += summaryH;

      const amtColW = colWidths[colWidths.length - 1];
      doc.fillColor(amber).rect(tableX, y, pageW, summaryH).fill();
      doc.fillColor("#fff").fontSize(11).font("Helvetica-Bold");
      doc.text("TOTAL AMOUNT", tableX + 4, y + 5, { width: pageW - amtColW - 8, align: "right" });
      doc.text(`Rs. ${fmtCurrency(bill.totalAmount)}`, tableX + pageW - amtColW + 4, y + 5, { width: amtColW - 8, align: "right" });
      y += summaryH;

      {
        const pdfCatAmts: Record<string, number> = {};
        bill.items.forEach((it: any) => { const c = it.category || "other"; pdfCatAmts[c] = (pdfCatAmts[c] || 0) + (it.amount || 0); });
        const pGstEq = (bill as any).gstRateEquipment ? (pdfCatAmts["equipment"] || 0) * (bill as any).gstRateEquipment / 100 : 0;
        const pGstMat = (bill as any).gstRateMaterial ? (pdfCatAmts["material"] || 0) * (bill as any).gstRateMaterial / 100 : 0;
        const pGstTr = (bill as any).gstRateTransport ? (pdfCatAmts["transport"] || 0) * (bill as any).gstRateTransport / 100 : 0;
        const pGstLab = (bill as any).gstRateLabour ? (pdfCatAmts["labour"] || 0) * (bill as any).gstRateLabour / 100 : 0;
        const pdfIsAllType = bill.billType?.toLowerCase() === "all";
        const pdfUsePerGroupGst = pdfIsAllType || shouldGroupPdf;
        const pSingleGstRate = !pdfUsePerGroupGst
          ? (bill.billType?.toLowerCase() === "equipment" ? (bill as any).gstRateEquipment
            : bill.billType?.toLowerCase() === "material" ? (bill as any).gstRateMaterial
            : bill.billType?.toLowerCase() === "transport" ? (bill as any).gstRateTransport
            : bill.billType?.toLowerCase() === "labour" ? (bill as any).gstRateLabour : 0) || 0
          : 0;
        const pSingleGstAmt = pSingleGstRate ? (bill.totalAmount || 0) * pSingleGstRate / 100 : 0;
        const pTotalGst = pdfUsePerGroupGst ? pGstEq + pGstMat + pGstTr + pGstLab : pSingleGstAmt;
        const adjustmentAmount = (bill as any).adjustmentAmount || 0;
        const adjustmentLabel = (bill as any).adjustmentLabel || "ADVANCE DEDUCTION";
        const additionalAdjustments = normalizeVendorBillAdditionalAdjustments((bill as any).additionalAdjustments);
        const additionalAdjustmentAmount = additionalAdjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0);
        const pTdsRate = (bill as any).tdsRate || 0;
        const pTdsAmt = pTdsRate ? (bill.totalAmount || 0) * pTdsRate / 100 : 0;
        const pHasAny = pTotalGst !== 0 || adjustmentAmount !== 0 || additionalAdjustments.length > 0 || pTdsAmt !== 0;

        if (pHasAny) {
          if (!pdfUsePerGroupGst && pSingleGstRate > 0) {
            if (y + summaryH > 720) { doc.addPage(); y = 40; }
            doc.fillColor("#f0fff0").rect(tableX, y, pageW, summaryH).fill();
            doc.fillColor("#15803d").fontSize(10).font("Helvetica");
            doc.text(`GST @ ${pSingleGstRate}%`, tableX + 4, y + 6, { width: pageW - amtColW - 8, align: "right" });
            doc.font("Helvetica-Bold").text(`+ Rs. ${fmtCurrency(pSingleGstAmt)}`, tableX + pageW - amtColW + 4, y + 6, { width: amtColW - 8, align: "right" });
            y += summaryH;
          }
          if (pdfUsePerGroupGst && pTotalGst > 0) {
            if (y + summaryH > 720) { doc.addPage(); y = 40; }
            doc.fillColor("#f0fff0").rect(tableX, y, pageW, summaryH).fill();
            doc.fillColor("#15803d").fontSize(10).font("Helvetica-Bold");
            doc.text("TOTAL GST", tableX + 4, y + 6, { width: pageW - amtColW - 8, align: "right" });
            doc.text(`+ Rs. ${fmtCurrency(pTotalGst)}`, tableX + pageW - amtColW + 4, y + 6, { width: amtColW - 8, align: "right" });
            y += summaryH;
          }
          if (adjustmentAmount !== 0) {
            if (y + summaryH > 720) { doc.addPage(); y = 40; }
            doc.fillColor("#f0f0f0").rect(tableX, y, pageW, summaryH).fill();
            doc.fillColor("#000").fontSize(10).font("Helvetica");
            doc.text(adjustmentLabel, tableX + 4, y + 6, { width: pageW - amtColW - 8, align: "right" });
            doc.font("Helvetica-Bold").text(`Rs. ${fmtCurrency(adjustmentAmount)}`, tableX + pageW - amtColW + 4, y + 6, { width: amtColW - 8, align: "right" });
            y += summaryH;
          }
          for (const adjustment of additionalAdjustments) {
            if (y + summaryH > 720) { doc.addPage(); y = 40; }
            doc.fillColor("#f0f0f0").rect(tableX, y, pageW, summaryH).fill();
            doc.fillColor("#000").fontSize(10).font("Helvetica");
            doc.text(adjustment.label, tableX + 4, y + 6, { width: pageW - amtColW - 8, align: "right" });
            doc.font("Helvetica-Bold").text(`Rs. ${fmtCurrency(adjustment.amount)}`, tableX + pageW - amtColW + 4, y + 6, { width: amtColW - 8, align: "right" });
            y += summaryH;
          }
          if (pTdsAmt > 0) {
            if (y + summaryH > 720) { doc.addPage(); y = 40; }
            doc.fillColor("#fff5f5").rect(tableX, y, pageW, summaryH).fill();
            doc.fillColor("#dc2626").fontSize(10).font("Helvetica");
            doc.text(`IT TDS @ ${pTdsRate}%`, tableX + 4, y + 6, { width: pageW - amtColW - 8, align: "right" });
            doc.font("Helvetica-Bold").text(`- Rs. ${fmtCurrency(pTdsAmt)}`, tableX + pageW - amtColW + 4, y + 6, { width: amtColW - 8, align: "right" });
            y += summaryH;
          }

          const netTotal = (bill.totalAmount || 0) + pTotalGst + adjustmentAmount + additionalAdjustmentAmount - pTdsAmt;
          if (y + summaryH > 720) { doc.addPage(); y = 40; }
          doc.fillColor("#1a1a1a").rect(tableX, y, pageW, summaryH).fill();
          doc.fillColor("#fff").fontSize(11).font("Helvetica-Bold");
          doc.text("NET TOTAL", tableX + 4, y + 5, { width: pageW - amtColW - 8, align: "right" });
          doc.text(`Rs. ${fmtCurrency(netTotal)}`, tableX + pageW - amtColW + 4, y + 5, { width: amtColW - 8, align: "right" });
          y += summaryH;
        }
      }

      if (bill.notes) {
        if (y + 40 > 720) { doc.addPage(); y = 40; }
        y += 10;
        doc.fillColor("#000").fontSize(10).font("Helvetica-Bold").text("Notes / Remarks:", 40, y);
        y += 14;
        doc.font("Helvetica").fontSize(10).text(bill.notes, 40, y, { width: pageW });
        y = doc.y + 10;
      }

      if (y + 120 > 720) { doc.addPage(); y = 40; }
      y += 40;

      doc.fillColor("#000").fontSize(10).font("Helvetica-Bold");
      doc.text("For HIGH LANE CONSTRUCTIONS", tableX + pageW - 200, y, { width: 200, align: "center" });
      doc.moveDown(3);
      const compSignY = doc.y;
      doc.moveTo(tableX + pageW - 200, compSignY).lineTo(tableX + pageW, compSignY).strokeColor("#000").lineWidth(0.5).stroke();
      doc.fontSize(9).font("Helvetica").fillColor("#000");
      doc.text("Authorized Signatory", tableX + pageW - 200, compSignY + 4, { width: 200, align: "center" });

      const vendorSignY = compSignY + 30;
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#000");
      doc.text("Vendor Acknowledgement", tableX, vendorSignY - 40, { width: 200, align: "center" });
      doc.moveDown(2.5);
      doc.moveTo(tableX, vendorSignY).lineTo(tableX + 200, vendorSignY).strokeColor("#000").lineWidth(0.5).stroke();
      doc.fontSize(9).font("Helvetica").fillColor("#000");
      doc.text(bill.vendorName, tableX, vendorSignY + 4, { width: 200, align: "center" });

      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.fillColor("#555").fontSize(8).font("Helvetica");
        doc.text(`Generated: ${new Date().toLocaleString("en-IN")}`, 40, 800, { width: pageW / 2, align: "left" });
        doc.text(`Page ${i + 1} of ${pages.count}`, 40 + pageW / 2, 800, { width: pageW / 2, align: "right" });
      }

      doc.end();
    } catch (err) {
      console.error("Error generating vendor bill PDF:", err);
      res.status(500).json({ message: "Failed to generate PDF" });
    }
  });

  
```

## DELETE /api/vendor-bills/:id — server/routes.ts:12489

```typescript
app.delete("/api/vendor-bills/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);

      const bill = await storage.getVendorBill(id);
      if (!bill) {
        return res.status(404).json({ message: "Vendor bill not found" });
      }

      if (!assertAdmin(req, res)) return;

      const deleted = await storage.deleteVendorBill(id);
      if (!deleted) {
        return res.status(400).json({ message: "Bill cannot be deleted" });
      }
      res.json({ success: true });
    } catch (err: any) {
      if (err?.code === "CONFLICT") return res.status(409).json({ message: err.message });
      console.error("Error deleting vendor bill:", err);
      res.status(500).json({ message: err?.message || "Failed to delete vendor bill" });
    }
  });

  
```

## POST /api/vendor-bills/check-duplicates — server/routes.ts:12628

```typescript
app.post("/api/vendor-bills/check-duplicates", async (req, res) => {
    try {
      if (!assertCreateEither(req, res, "vendor_bills", "vendor_bills_raise")) return;
      const { vendorName, items, excludeBillId } = req.body;
      if (!vendorName || !items) return res.status(400).json({ message: "vendorName and items required" });
      const duplicates = await storage.checkDuplicateBilledItems(vendorName, items, excludeBillId ? Number(excludeBillId) : undefined);
      res.json(duplicates);
    } catch (err) {
      console.error("Error checking duplicate billed items:", err);
      res.status(500).json({ message: "Failed to check duplicates" });
    }
  });

  const EXPORTABLE_TABLES: Record<string, string> = {
    equipment_master: "Equipment Master",
    vendor_aliases: "Vendor Aliases",
    parties: "Parties",
    plant_materials: "Plant Materials",
    mix_templates: "Mix Templates & Components",
    equipment_usage: "Plant Equipment Usage",
    truck_dispatches: "Truck Dispatches",
    material_receipts: "Material Receipts",
    material_issues: "Material Issues",
    dprs: "DPRs (with all sub-tables)",
    stock_ledger: "Stock Ledger",
    stock_balances: "Stock Balances",
    vendor_bills: "Vendor Bills",
    purchase_indents: "Purchase Indents",
    diesel_requirements: "Diesel Requirements",
    sites: "Sites",
  };

  
```

## GET /api/maintenance/logs — server/routes.ts:13815

```typescript
app.get("/api/maintenance/logs", async (req, res) => {
    try {
      if (!assertView(req, res, "plant_equipment")) return;
      const filters = {
        equipmentId: req.query.equipmentId ? Number(req.query.equipmentId) : undefined,
        eventType: req.query.eventType as string | undefined,
        status: req.query.status as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        sourceType: req.query.sourceType as string | undefined,
        sourceRecordId: req.query.sourceRecordId ? Number(req.query.sourceRecordId) : undefined,
        sourceRecordIds: typeof req.query.sourceRecordIds === "string"
          ? req.query.sourceRecordIds.split(",").map(Number).filter(Number.isInteger)
          : undefined,
      };
      const logs = await storage.getMaintenanceLogs(filters);
      const permitted = await getPermittedSiteNames(req);
      if (permitted === null) return res.json(logs);
      const visible: any[] = [];
      for (const log of logs) {
        // Legacy rows have no explicit source site and retain their historical
        // coarse permission visibility. Linked rows never leak cross-site.
        if (log.sourceType !== "dpr_log" && log.sourceType !== "plant_usage") { visible.push(log); continue; }
        if (await canAccessMaintenanceSource(req, log)) visible.push(log);
      }
      res.json(visible);
    } catch (err) {
      console.error("GET /api/maintenance/logs:", err);
      res.status(500).json({ error: "Failed to fetch maintenance logs" });
    }
  });

  
```

## GET /api/maintenance/logs/:id — server/routes.ts:13847

```typescript
app.get("/api/maintenance/logs/:id", async (req, res) => {
    try {
      if (!assertView(req, res, "plant_equipment")) return;
      const log = await storage.getMaintenanceLog(Number(req.params.id));
      if (!log) return res.status(404).json({ error: "Not found" });
      if (!(await assertMaintenanceSourceAccess(req, res, log))) return;
      res.json(log);
    } catch (err) {
      console.error("GET /api/maintenance/logs/:id:", err);
      res.status(500).json({ error: "Failed to fetch maintenance log" });
    }
  });

  
```

## POST /api/maintenance/logs — server/routes.ts:13860

```typescript
app.post("/api/maintenance/logs", async (req, res) => {
    try {
      if (!assertCreate(req, res, "plant_equipment")) return;
      const { parts, ...logData } = req.body;
      const normalized = await normalizeBreakdownLogInput(logData);
      if (!normalized.data) return res.status(400).json({ message: normalized.message });
      if (!(await assertMaintenanceSourceAccess(req, res, normalized.data))) return;
      const log = await storage.createMaintenanceLog(normalized.data, parts || []);
      res.status(201).json(log);
    } catch (err) {
      console.error("POST /api/maintenance/logs:", err);
      res.status(500).json({ error: "Failed to create maintenance log" });
    }
  });

  
```

## PATCH /api/maintenance/logs/:id — server/routes.ts:13875

```typescript
app.patch("/api/maintenance/logs/:id", async (req, res) => {
    try {
      if (!assertEdit(req, res, "plant_equipment")) return;
      const existing = await storage.getMaintenanceLog(Number(req.params.id));
      if (!existing) return res.status(404).json({ error: "Not found" });
      if (!(await assertMaintenanceSourceAccess(req, res, existing))) return;
      const normalized = await normalizeBreakdownLogInput({ ...existing, ...req.body });
      if (!normalized.data) return res.status(400).json({ message: normalized.message });
      if (!(await assertMaintenanceSourceAccess(req, res, normalized.data))) return;
      // Keep PATCH semantics: use the canonical derived fields, while passing
      // only fields actually supplied by the caller (not read-model fields
      // such as equipmentName/parts from `existing`).
      const { id: _id, createdAt: _createdAt, autoIssueId: _autoIssueId, equipmentName: _equipmentName, autoIssueNumber: _autoIssueNumber, parts: _parts, ...canonical } = normalized.data;
      const { parts: _ignoredParts, id: _requestId, createdAt: _requestCreatedAt, autoIssueId: _requestAutoIssueId, ...requestedUpdates } = req.body;
      const updates = {
        ...requestedUpdates,
        fromTime: canonical.fromTime,
        toTime: canonical.toTime,
        downtimeHours: canonical.downtimeHours,
        responsibility: canonical.responsibility,
        repairScope: canonical.repairScope,
        sourceType: canonical.sourceType,
        sourceRecordId: canonical.sourceRecordId,
      };
      const updated = await storage.updateMaintenanceLog(Number(req.params.id), updates);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (err) {
      console.error("PATCH /api/maintenance/logs/:id:", err);
      res.status(500).json({ error: "Failed to update maintenance log" });
    }
  });

  
```

## DELETE /api/maintenance/logs/:id — server/routes.ts:13908

```typescript
app.delete("/api/maintenance/logs/:id", async (req, res) => {
    try {
      if (!assertAdmin(req, res)) return;
      const id = Number(req.params.id);
      const before = await storage.getMaintenanceLog(id);
      if (before && !(await assertMaintenanceSourceAccess(req, res, before))) return;
      const deleted = await storage.deleteMaintenanceLog(id, req.authUser!.id);
      if (!deleted) return res.status(404).json({ error: "Not found" });
      await storage.logAudit({
        module: "equipment_maintenance_logs",
        transactionId: id,
        action: "delete",
        userId: req.authUser!.id,
        userName: currentUserName(req),
        userRole: req.authUser!.isOwner ? "owner" : req.authUser!.isAdmin ? "admin" : "manager",
        oldValues: before ?? null,
      });
      res.json({ success: true });
    } catch (err) {
      console.error("DELETE /api/maintenance/logs/:id:", err);
      res.status(500).json({ error: "Failed to delete maintenance log" });
    }
  });

  // Cancel a maintenance log (submitted/approved records: cancel with reason instead of hard delete)
  
```

## POST /api/maintenance/logs/:id/cancel — server/routes.ts:13933

```typescript
app.post("/api/maintenance/logs/:id/cancel", async (req, res) => {
    try {
      if (!assertDeleteOrCancel(req, res, "plant_equipment")) return;
      const id = Number(req.params.id);
      const reason = String(req.body?.reason || "").trim();
      if (!reason) return res.status(400).json({ error: "Cancellation reason is required" });
      const before = await storage.getMaintenanceLog(id);
      if (!before) return res.status(404).json({ error: "Not found" });
      if (!(await assertMaintenanceSourceAccess(req, res, before))) return;
      const updated = await storage.cancelEquipmentMaintenanceLog(id, req.authUser!.id, reason);
      await storage.logAudit({
        module: "equipment_maintenance_logs",
        transactionId: id,
        action: "cancel",
        userId: req.authUser!.id,
        userName: currentUserName(req),
        userRole: req.authUser!.isOwner ? "owner" : req.authUser!.isAdmin ? "admin" : "manager",
        oldValues: before,
        newValues: updated ?? null,
        reason,
      });
      res.json(updated);
    } catch (err) {
      console.error("POST /api/maintenance/logs/:id/cancel:", err);
      res.status(500).json({ error: "Failed to cancel maintenance log" });
    }
  });

  // ============================================
  // GENERIC AUDIT TRAIL (Owner/Admin transaction controls)
  // ============================================

  
```

## POST /api/maintenance/logs/:id/parts — server/routes.ts:13991

```typescript
app.post("/api/maintenance/logs/:id/parts", async (req, res) => {
    try {
      if (!assertCreate(req, res, "plant_equipment")) return;
      const { parts } = req.body;
      if (!Array.isArray(parts) || parts.length === 0) {
        return res.status(400).json({ error: "parts array is required" });
      }
      const parent = await storage.getMaintenanceLog(Number(req.params.id));
      if (!parent) return res.status(404).json({ error: "Not found" });
      if (!(await assertMaintenanceSourceAccess(req, res, parent))) return;
      const log = await storage.addMaintenanceParts(Number(req.params.id), parts);
      res.status(201).json(log);
    } catch (err) {
      console.error("POST /api/maintenance/logs/:id/parts:", err);
      res.status(500).json({ error: "Failed to add parts" });
    }
  });

  
```

## DELETE /api/maintenance/parts/:partId — server/routes.ts:14009

```typescript
app.delete("/api/maintenance/parts/:partId", async (req, res) => {
    try {
      if (!assertDelete(req, res, "plant_equipment")) return;
      const partId = Number(req.params.partId);
      const part = await storage.getMaintenancePart(partId);
      // Conceal both a missing part and a parent outside the caller's site
      // scope so this endpoint cannot be used as a cross-site existence oracle.
      if (!part) return res.status(404).json({ error: "Not found" });
      if (!(await assertMaintenanceRecordAccess(req, res, part.maintenanceLogId, true))) return;
      const deleted = await storage.removeMaintenancePart(partId);
      if (!deleted) return res.status(404).json({ error: "Not found" });
      res.json({ success: true });
    } catch (err) {
      console.error("DELETE /api/maintenance/parts/:partId:", err);
      res.status(500).json({ error: "Failed to remove part" });
    }
  });

  
```

## GET /api/maintenance/health-summary — server/routes.ts:14027

```typescript
app.get("/api/maintenance/health-summary", async (req, res) => {
    try {
      if (!assertView(req, res, "plant_equipment")) return;
      const summary = await storage.getEquipmentHealthSummary(await visibleMaintenanceLogIds(req));
      res.json(summary);
    } catch (err) {
      console.error("GET /api/maintenance/health-summary:", err);
      res.status(500).json({ error: "Failed to fetch health summary" });
    }
  });

  
```

## GET /api/maintenance/open-count — server/routes.ts:14038

```typescript
app.get("/api/maintenance/open-count", async (req, res) => {
    try {
      if (!assertView(req, res, "plant_equipment")) return;
      const count = await storage.getOpenBreakdownCount(await visibleMaintenanceLogIds(req));
      res.json({ count });
    } catch (err) {
      console.error("GET /api/maintenance/open-count:", err);
      res.status(500).json({ error: "Failed to fetch open count" });
    }
  });

  // Seed Data
  // ============================================
  // RMC PLANT MODULE (Task #697)
  // All /api/rmc/* routes are gated on the ENABLE_RMC environment flag.
  // Set ENABLE_RMC=true in development; leave unset in production to hide the module.
  // ============================================
  app.use("/api/rmc", (req, res, next) => {
    if (!RMC_ENABLED) return res.status(503).json({ message: "RMC module is not enabled in this environment." });
    next();
  });

  // Mix Designs
  
```