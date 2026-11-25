import { and, asc, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import {
  appSettings,
  auditLogs,
  dispatchProOutbox,
  mixTemplateComponents,
  mixTemplates,
  materialReceipts,
  parties,
  plantMaterials,
  plantSupplyAlertDeliveries,
  plantSupplyBorrowingEvents,
  plantSupplyBorrowingReplacements,
  plantSupplyBorrowings,
  plantSupplyOrderLines,
  plantSupplyOrderMixComponents,
  plantSupplyOrderMixSpecs,
  plantSupplyOrderMixVersionComponents,
  plantSupplyOrderMixVersions,
  plantSupplyOrderMaterialScopes,
  plantSupplyOrders,
  roles,
  sites,
  stockLedger,
  truckDispatches,
  userRoles,
  users,
} from "@shared/schema";
import { db } from "./db";
import {
  allocateSupplyOrderLdo,
  dailyMixTonnes,
  dispatchCrossesStockZero,
  dispatchedByMix,
  formatPlantSupplyOrderNotification,
  formatPlantSupplyMorningSummary,
  includeSupplyAlertOwners,
  materialAvailabilityForScope,
  orderMaterialNeedsWithOrderMix,
  materialNeedForMix,
  materialNeedForOrderMix,
  orderQuantityToMt,
  resolveSupplyAlertSettings,
  type SupplyDispatch,
  type SupplyMixComponent,
  type SupplyMixTemplate,
  type SupplyAlertRecipientChoice,
  type SupplyAlertSettings,
  type SupplyOrderLine,
  type SupplyOrderMix,
} from "@shared/plantSupplyOrders";
import { convertStockQuantity, stockUnitForMaterial } from "@shared/stockUnits";
import {
  mixVersionAt,
  mixVersionForDispatch,
  supplyDispatchInstant,
  supplyDispatchOutsideOrderPeriod,
  supplyMixVersionTimeError,
  supplyOrderLineCanBeRemoved,
  supplyOrderLineQuantityError,
} from "@shared/plantSupplyOrderVersions";

const ALERT_SETTINGS_KEY = "plant_supply_alert_recipients_v1";

export type SupplyAlertKind = "running_low" | "exhausted" | "borrowed" | "morning_summary";
export type SupplyRecipientChoice = SupplyAlertRecipientChoice;

const DEFAULT_ALERT_SETTINGS: SupplyAlertSettings = {
  running_low: { roles: ["P&M In-charge"], userIds: [] },
  exhausted: { roles: ["P&M In-charge", "Project Manager", "Project Head"], userIds: [] },
  borrowed: { roles: ["P&M In-charge", "Project Manager", "Project Head"], userIds: [] },
};

function jsonValue<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as T : fallback;
  } catch {
    return fallback;
  }
}

function fyLabel(dateString: string): string {
  const [yearText, monthText] = dateString.split("-");
  const year = Number(yearText);
  const start = Number(monthText) >= 4 ? year : year - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

function finite(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

export async function getSupplyOrderOptions() {
  const [partyRows, siteRows, templateRows, materialRows, componentRows] = await Promise.all([
    db.select({
      id: parties.id,
      name: parties.name,
      dispatchProSiteId: parties.dispatchProSiteId,
      contactPerson: parties.contactPerson,
      mobile: parties.mobile,
      gstNo: parties.gstNo,
      address: parties.address,
    })
      .from(parties).where(eq(parties.isActive, 1)).orderBy(asc(parties.name)),
    db.select({
      id: sites.id,
      name: sites.name,
      partyId: sites.partyId,
      dispatchProSiteId: sites.dispatchProSiteId,
      workName: sites.workName,
      clientDepartment: sites.clientDepartment,
      division: sites.division,
      mandal: sites.mandal,
      district: sites.district,
      agreementEstimateRef: sites.agreementEstimateRef,
      estimateSorYear: sites.estimateSorYear,
      mtPerCumFactor: sites.mtPerCumFactor,
    })
      .from(sites).where(eq(sites.isActive, 1)).orderBy(asc(sites.name)),
    db.select({
      id: mixTemplates.id,
      name: mixTemplates.name,
      mixType: mixTemplates.mixType,
      partyId: mixTemplates.partyId,
      bitumenPercent: mixTemplates.bitumenPercent,
      ldoNorm: mixTemplates.ldoNorm,
    })
      .from(mixTemplates).where(eq(mixTemplates.isActive, 1)).orderBy(asc(mixTemplates.name)),
    db.select({ id: plantMaterials.id, name: plantMaterials.name, defaultUom: plantMaterials.defaultUom })
      .from(plantMaterials).where(eq(plantMaterials.isActive, 1)).orderBy(asc(plantMaterials.name)),
    db.select({
      templateId: mixTemplateComponents.templateId,
      materialId: mixTemplateComponents.materialId,
      materialName: plantMaterials.name,
      percent: mixTemplateComponents.percent,
      moistureContent: mixTemplateComponents.moistureContent,
      wastageFactor: mixTemplateComponents.wastageFactor,
    }).from(mixTemplateComponents)
      .innerJoin(plantMaterials, eq(plantMaterials.id, mixTemplateComponents.materialId))
      .orderBy(asc(mixTemplateComponents.templateId), asc(mixTemplateComponents.id)),
  ]);
  return { parties: partyRows, sites: siteRows, mixes: templateRows, materials: materialRows, mixComponents: componentRows };
}

export async function createPlantSupplyOrder(input: {
  partyId: number;
  siteId?: number | null;
  periodFrom: string;
  periodTo: string;
  orderNo?: string | null;
  workName?: string | null;
  division?: string | null;
  mandal?: string | null;
  district?: string | null;
  agreementEstimateRef?: string | null;
  estimateSorYear?: string | null;
  mtPerCumFactor?: number | null;
  remarks?: string | null;
  lines: Array<{
    mixTemplateId: number;
    orderedMt?: number;
    enteredQuantity?: number;
    enteredUnit?: "MT" | "cum";
    plannedMtPerDay?: number | null;
    orderMix?: {
      mixName?: string | null;
      bitumenPercent: number;
      components: Array<{ materialId: number; aggregateSharePercent: number }>;
    } | null;
  }>;
}, actor: { userId: number; name: string }) {
  const [party] = await db.select({ id: parties.id }).from(parties)
    .where(eq(parties.id, input.partyId)).limit(1);
  if (!party) throw new Error("Choose an active party.");
  const [site] = input.siteId
    ? await db.select().from(sites).where(eq(sites.id, input.siteId)).limit(1)
    : [];
  if (input.siteId && (!site || (site.partyId != null && site.partyId !== input.partyId))) {
    throw new Error("Choose a site linked to this party.");
  }
  const masterMtPerCumFactor = Number(site?.mtPerCumFactor);
  const mtPerCumFactor = Number.isFinite(masterMtPerCumFactor) && masterMtPerCumFactor > 0
    ? masterMtPerCumFactor
    : input.mtPerCumFactor ?? 2.356;
  const orderWorkDetails = {
    workName: site ? site.workName : input.workName,
    division: site ? site.division : input.division,
    mandal: site ? site.mandal : input.mandal,
    district: site ? site.district : input.district,
    agreementEstimateRef: site ? site.agreementEstimateRef : input.agreementEstimateRef,
    estimateSorYear: site ? site.estimateSorYear : input.estimateSorYear,
  };
  if (!Number.isFinite(mtPerCumFactor) || mtPerCumFactor <= 0 || mtPerCumFactor > 100) {
    throw new Error("Enter an MT-per-cum factor greater than zero.");
  }
  const normalizedLines = input.lines.map((line, index) => ({
    mixTemplateId: line.mixTemplateId,
    enteredQuantity: line.enteredQuantity == null ? null : Number(line.enteredQuantity),
    enteredUnit: line.enteredQuantity == null ? null : line.enteredUnit ?? "MT",
    orderedMt: line.enteredQuantity != null
      ? orderQuantityToMt(Number(line.enteredQuantity), line.enteredUnit ?? "MT", mtPerCumFactor)
      : Number(line.orderedMt),
    plannedMtPerDay: line.plannedMtPerDay == null ? null : Number(line.plannedMtPerDay),
    sortOrder: index,
    orderMix: line.orderMix ?? null,
  }));
  if (!normalizedLines.length) throw new Error("Add at least one mix line.");
  if (normalizedLines.some(line => !Number.isFinite(line.orderedMt) || line.orderedMt <= 0)) {
    throw new Error("Each mix must have an ordered quantity greater than zero.");
  }
  if (new Set(normalizedLines.map(line => line.mixTemplateId)).size !== normalizedLines.length) {
    throw new Error("Each mix can be listed only once.");
  }
  if (input.periodTo < input.periodFrom) throw new Error("The period end must be on or after the start.");

  const templateIds = normalizedLines.map(line => line.mixTemplateId);
  const templates = await db.select({
    id: mixTemplates.id,
    name: mixTemplates.name,
    bitumenPercent: mixTemplates.bitumenPercent,
    ldoNorm: mixTemplates.ldoNorm,
  })
    .from(mixTemplates).where(inArray(mixTemplates.id, templateIds));
  if (templates.length !== templateIds.length) throw new Error("One or more mix templates are unavailable.");
  const templateById = new Map(templates.map(row => [row.id, row]));
  const requestedOrderMixes = normalizedLines.flatMap(line => line.orderMix ? [line] : []);
  const requestedMaterialIds = Array.from(new Set(requestedOrderMixes.flatMap(line =>
    line.orderMix!.components.map(component => component.materialId)
  )));
  const validMaterials = requestedMaterialIds.length
    ? await db.select({ id: plantMaterials.id }).from(plantMaterials).where(inArray(plantMaterials.id, requestedMaterialIds))
    : [];
  if (validMaterials.length !== requestedMaterialIds.length) throw new Error("One or more order-mix materials are unavailable.");
  for (const line of requestedOrderMixes) {
    const mix = line.orderMix!;
    const bitumenPercent = Number(mix.bitumenPercent);
    if (!Number.isFinite(bitumenPercent) || bitumenPercent < 0 || bitumenPercent >= 100) {
      throw new Error("Order-mix bitumen percent must be from 0 up to, but not including, 100.");
    }
    if (!mix.components.length || mix.components.some(component =>
      !Number.isInteger(component.materialId) ||
      !Number.isFinite(Number(component.aggregateSharePercent)) ||
      Number(component.aggregateSharePercent) < 0
    )) throw new Error("Add valid materials and aggregate shares to the order mix.");
    const shareTotal = mix.components.reduce((sum, component) => sum + Number(component.aggregateSharePercent), 0);
    if (Math.abs(shareTotal - 100) > 0.01) {
      throw new Error(`Order-mix aggregate shares must total 100% (currently ${shareTotal.toFixed(2)}%).`);
    }
    if (!templateById.has(line.mixTemplateId)) throw new Error("The source mix template is unavailable.");
  }

  const created = await db.transaction(async (tx) => {
    const [order] = await tx.insert(plantSupplyOrders).values({
      orderNo: input.orderNo?.trim() || null,
      partyId: input.partyId,
      siteId: input.siteId ?? null,
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      workName: orderWorkDetails.workName?.trim() || null,
      division: orderWorkDetails.division?.trim() || null,
      mandal: orderWorkDetails.mandal?.trim() || null,
      district: orderWorkDetails.district?.trim() || null,
      agreementEstimateRef: orderWorkDetails.agreementEstimateRef?.trim() || null,
      estimateSorYear: orderWorkDetails.estimateSorYear?.trim() || null,
      mtPerCumFactor: String(mtPerCumFactor),
      remarks: input.remarks?.trim() || null,
      createdByUserId: actor.userId,
      createdByName: actor.name,
      updatedAt: new Date(),
    }).returning();
    if (!order) throw new Error("Could not create supply order.");

    const generatedNo = input.orderNo?.trim() || `HLC/PO-HMP/${fyLabel(input.periodFrom)}/${String(order.id).padStart(4, "0")}`;
    const [numberedOrder] = await tx.update(plantSupplyOrders).set({ orderNo: generatedNo })
      .where(eq(plantSupplyOrders.id, order.id)).returning();
    const insertedLines = await tx.insert(plantSupplyOrderLines).values(normalizedLines.map(line => ({
      orderId: order.id,
      mixTemplateId: line.mixTemplateId,
      enteredQuantity: line.enteredQuantity == null ? null : String(line.enteredQuantity),
      enteredUnit: line.enteredUnit,
      orderedMt: String(line.orderedMt),
      plannedMtPerDay: line.plannedMtPerDay == null ? null : String(line.plannedMtPerDay),
      sortOrder: line.sortOrder,
    }))).returning();
    for (const insertedLine of insertedLines) {
      const sourceLine = normalizedLines.find(line => line.mixTemplateId === insertedLine.mixTemplateId);
      if (!sourceLine?.orderMix) continue;
      const sourceTemplate = templateById.get(insertedLine.mixTemplateId)!;
      const [orderMix] = await tx.insert(plantSupplyOrderMixSpecs).values({
        orderLineId: insertedLine.id,
        mixName: sourceLine.orderMix.mixName?.trim() || `${sourceTemplate.name} — order mix`,
        sourceBitumenPercent: Number(sourceTemplate.bitumenPercent || 0),
        bitumenPercent: Number(sourceLine.orderMix.bitumenPercent),
        ldoNorm: sourceTemplate.ldoNorm,
        updatedAt: new Date(),
      }).returning();
      if (!orderMix) throw new Error("Could not save the order mix.");
      await tx.insert(plantSupplyOrderMixComponents).values(sourceLine.orderMix.components.map((component, index) => ({
        orderMixId: orderMix.id,
        materialId: component.materialId,
        aggregateSharePercent: Number(component.aggregateSharePercent),
        sortOrder: index,
      })));
    }

    const sourceComponents = await tx.select({ materialId: mixTemplateComponents.materialId })
      .from(mixTemplateComponents).where(inArray(mixTemplateComponents.templateId, templateIds));
    const [bitumen] = await tx.select({ id: plantMaterials.id }).from(plantMaterials)
      .where(sql`UPPER(${plantMaterials.name}) LIKE '%BITUMEN%'`).limit(1);
    const [ldo] = await tx.select({ id: plantMaterials.id }).from(plantMaterials)
      .where(sql`UPPER(TRIM(${plantMaterials.name})) = 'LDO'`).limit(1);
    const materialIds = Array.from(new Set([
      ...sourceComponents.map(row => row.materialId),
      ...requestedMaterialIds,
      ...(bitumen ? [bitumen.id] : []),
      ...(ldo ? [ldo.id] : []),
    ]));
    if (materialIds.length) {
      await tx.insert(plantSupplyOrderMaterialScopes).values(materialIds.map(materialId => ({
        orderId: order.id,
        materialId,
        scope: "hlc",
        updatedByUserId: actor.userId,
      }))).onConflictDoNothing();
    }
    await tx.insert(auditLogs).values({
      module: "plant_supply_order",
      transactionId: order.id,
      action: "create",
      userId: actor.userId,
      userName: actor.name,
      userRole: "granted_user",
      newValues: {
        orderNo: generatedNo,
        partyId: input.partyId,
        siteId: input.siteId ?? null,
        periodFrom: input.periodFrom,
        periodTo: input.periodTo,
        lines: normalizedLines,
        workName: orderWorkDetails.workName?.trim() || null,
        division: orderWorkDetails.division?.trim() || null,
        mandal: orderWorkDetails.mandal?.trim() || null,
        district: orderWorkDetails.district?.trim() || null,
        agreementEstimateRef: orderWorkDetails.agreementEstimateRef?.trim() || null,
        estimateSorYear: orderWorkDetails.estimateSorYear?.trim() || null,
        mtPerCumFactor,
      },
    });
    return numberedOrder ?? order;
  });
  return getPlantSupplyOrder(created.id);
}

export type PlantSupplyOrderEditInput = {
  orderNo: string | null;
  periodFrom: string;
  periodTo: string;
  workName: string | null;
  division: string | null;
  mandal: string | null;
  district: string | null;
  agreementEstimateRef: string | null;
  estimateSorYear: string | null;
  mtPerCumFactor: number;
  remarks: string | null;
  lines: Array<{
    id?: number;
    mixTemplateId: number;
    enteredQuantity: number;
    enteredUnit: "MT" | "cum";
    plannedMtPerDay: number | null;
  }>;
};

function recordSupplyOrderHistory(
  tx: any,
  orderId: number,
  actor: { userId: number; name: string },
  field: string,
  oldValue: unknown,
  newValue: unknown,
) {
  if (JSON.stringify(oldValue) === JSON.stringify(newValue)) return Promise.resolve();
  return tx.insert(auditLogs).values({
    module: "plant_supply_order",
    transactionId: orderId,
    action: "edit",
    userId: actor.userId,
    userName: actor.name,
    userRole: "owner_or_plant_in_charge",
    oldValues: { field, value: oldValue },
    newValues: { field, value: newValue },
  });
}

export async function editPlantSupplyOrder(
  orderId: number,
  input: PlantSupplyOrderEditInput,
  actor: { userId: number; name: string },
) {
  const edited = await db.transaction(async tx => {
    const [current] = await tx.select().from(plantSupplyOrders)
      .where(eq(plantSupplyOrders.id, orderId)).limit(1);
    if (!current) throw new Error("Plant supply order not found.");
    if (current.status !== "open") throw new Error("Only an open order can be edited.");
    if (input.periodTo < input.periodFrom) throw new Error("The period end must be on or after the start.");
    if (!Number.isFinite(input.mtPerCumFactor) || input.mtPerCumFactor <= 0 || input.mtPerCumFactor > 100) {
      throw new Error("Enter an MT-per-cum factor greater than zero.");
    }
    if (!input.lines.length) throw new Error("Keep at least one mix line on the order.");

    const dispatches = await tx.select({
      id: truckDispatches.id,
      date: truckDispatches.date,
      time: truckDispatches.time,
      mixTemplateId: truckDispatches.mixTemplateId,
      loadWeight: truckDispatches.loadWeight,
    }).from(truckDispatches).where(eq(truckDispatches.supplyOrderId, orderId));
    const outsidePeriod = dispatches.filter(row => supplyDispatchOutsideOrderPeriod(row.date, input.periodFrom, input.periodTo));
    if (outsidePeriod.length) {
      const dates = outsidePeriod.map(row => row.date).sort();
      throw new Error(`${outsidePeriod.length} trucks already linked between ${dates[0]} and ${dates.at(-1)} — period must include them.`);
    }

    const existingLines = await tx.select().from(plantSupplyOrderLines)
      .where(eq(plantSupplyOrderLines.orderId, orderId));
    const existingById = new Map(existingLines.map(line => [line.id, line]));
    const dispatchedByTemplate = new Map<number, number>();
    for (const row of dispatches) {
      dispatchedByTemplate.set(
        row.mixTemplateId,
        (dispatchedByTemplate.get(row.mixTemplateId) ?? 0) + finite(row.loadWeight),
      );
    }
    if (new Set(input.lines.map(line => line.mixTemplateId)).size !== input.lines.length) {
      throw new Error("Each mix can be listed only once.");
    }
    const templateIds = input.lines.map(line => line.mixTemplateId);
    const templates = await tx.select({ id: mixTemplates.id, name: mixTemplates.name })
      .from(mixTemplates).where(inArray(mixTemplates.id, templateIds));
    if (templates.length !== templateIds.length) throw new Error("One or more mix templates are unavailable.");
    const templateName = new Map(templates.map(template => [template.id, template.name]));
    const submittedExistingIds = new Set<number>();
    const normalized = input.lines.map(line => {
      if (!Number.isFinite(line.enteredQuantity) || line.enteredQuantity <= 0) {
        throw new Error("Each mix line needs an ordered quantity greater than zero.");
      }
      if (line.plannedMtPerDay != null && (!Number.isFinite(line.plannedMtPerDay) || line.plannedMtPerDay <= 0)) {
        throw new Error("Planned MT per day must be greater than zero or left blank.");
      }
      if (line.id != null) {
        const existing = existingById.get(line.id);
        if (!existing || existing.mixTemplateId !== line.mixTemplateId) {
          throw new Error("A mix line no longer belongs to this order. Reload the order and try again.");
        }
        submittedExistingIds.add(line.id);
      }
      const orderedMt = line.enteredUnit === "cum"
        ? line.enteredQuantity * input.mtPerCumFactor
        : line.enteredQuantity;
      const dispatchedMt = dispatchedByTemplate.get(line.mixTemplateId) ?? 0;
      const quantityError = supplyOrderLineQuantityError(orderedMt, dispatchedMt);
      if (quantityError) throw new Error(`${templateName.get(line.mixTemplateId) ?? "This mix"} ${quantityError.toLowerCase()}`);
      return { ...line, orderedMt };
    });

    for (const existing of existingLines) {
      if (submittedExistingIds.has(existing.id)) continue;
      const dispatchedMt = dispatchedByTemplate.get(existing.mixTemplateId) ?? 0;
      if (!supplyOrderLineCanBeRemoved(dispatchedMt)) {
        throw new Error(`${templateName.get(existing.mixTemplateId) ?? `Mix #${existing.mixTemplateId}`} has dispatches and cannot be removed.`);
      }
    }

    const orderFields: Array<[keyof PlantSupplyOrderEditInput, unknown, unknown]> = [
      ["orderNo", current.orderNo, input.orderNo?.trim() || null],
      ["periodFrom", current.periodFrom, input.periodFrom],
      ["periodTo", current.periodTo, input.periodTo],
      ["workName", current.workName, input.workName?.trim() || null],
      ["division", current.division, input.division?.trim() || null],
      ["mandal", current.mandal, input.mandal?.trim() || null],
      ["district", current.district, input.district?.trim() || null],
      ["agreementEstimateRef", current.agreementEstimateRef, input.agreementEstimateRef?.trim() || null],
      ["estimateSorYear", current.estimateSorYear, input.estimateSorYear?.trim() || null],
      ["mtPerCumFactor", finite(current.mtPerCumFactor), input.mtPerCumFactor],
      ["remarks", current.remarks, input.remarks?.trim() || null],
    ];
    await tx.update(plantSupplyOrders).set({
      orderNo: input.orderNo?.trim() || null,
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      workName: input.workName?.trim() || null,
      division: input.division?.trim() || null,
      mandal: input.mandal?.trim() || null,
      district: input.district?.trim() || null,
      agreementEstimateRef: input.agreementEstimateRef?.trim() || null,
      estimateSorYear: input.estimateSorYear?.trim() || null,
      mtPerCumFactor: String(input.mtPerCumFactor),
      remarks: input.remarks?.trim() || null,
      updatedAt: new Date(),
    }).where(eq(plantSupplyOrders.id, orderId));
    for (const [field, oldValue, newValue] of orderFields) {
      await recordSupplyOrderHistory(tx, orderId, actor, String(field), oldValue, newValue);
    }

    for (const existing of existingLines) {
      if (!submittedExistingIds.has(existing.id)) {
        await recordSupplyOrderHistory(tx, orderId, actor, `Mix ${templateName.get(existing.mixTemplateId) ?? existing.mixTemplateId} removed`, {
          orderedMt: existing.orderedMt,
          plannedMtPerDay: existing.plannedMtPerDay,
        }, null);
        await tx.delete(plantSupplyOrderLines).where(eq(plantSupplyOrderLines.id, existing.id));
      }
    }
    for (const line of normalized) {
      const enteredQuantity = String(line.enteredQuantity);
      const plannedMtPerDay = line.plannedMtPerDay == null ? null : String(line.plannedMtPerDay);
      if (line.id == null) {
        const [added] = await tx.insert(plantSupplyOrderLines).values({
          orderId,
          mixTemplateId: line.mixTemplateId,
          enteredQuantity,
          enteredUnit: line.enteredUnit,
          orderedMt: String(line.orderedMt),
          plannedMtPerDay,
          sortOrder: existingLines.length + normalized.indexOf(line),
        }).returning({ id: plantSupplyOrderLines.id });
        await recordSupplyOrderHistory(tx, orderId, actor, `Mix ${templateName.get(line.mixTemplateId) ?? line.mixTemplateId} added`, null, {
          lineId: added?.id,
          enteredQuantity,
          enteredUnit: line.enteredUnit,
          orderedMt: line.orderedMt,
          plannedMtPerDay,
        });
        continue;
      }
      const old = existingById.get(line.id)!;
      await tx.update(plantSupplyOrderLines).set({
        enteredQuantity,
        enteredUnit: line.enteredUnit,
        orderedMt: String(line.orderedMt),
        plannedMtPerDay,
      }).where(and(eq(plantSupplyOrderLines.id, line.id), eq(plantSupplyOrderLines.orderId, orderId)));
      const label = `Mix ${templateName.get(line.mixTemplateId) ?? line.mixTemplateId}`;
      await recordSupplyOrderHistory(tx, orderId, actor, `${label} ordered quantity`, {
        enteredQuantity: old.enteredQuantity,
        enteredUnit: old.enteredUnit,
        orderedMt: old.orderedMt,
      }, { enteredQuantity, enteredUnit: line.enteredUnit, orderedMt: line.orderedMt });
      await recordSupplyOrderHistory(tx, orderId, actor, `${label} planned MT per day`, old.plannedMtPerDay, plannedMtPerDay);
    }
    return orderId;
  });
  return getPlantSupplyOrder(edited);
}

export async function changeSupplyOrderMix(
  orderId: number,
  lineId: number,
  input: {
    bitumenPercent: number;
    components: Array<{ materialId: number; aggregateSharePercent: number }>;
    effectiveAt: string;
    reason: string;
  },
  actor: { userId: number; name: string },
) {
  const effectiveAt = new Date(input.effectiveAt);
  if (!Number.isFinite(effectiveAt.getTime())) throw new Error("Choose a valid effective date and time.");
  const reason = input.reason.trim();
  if (!reason) throw new Error("Enter a reason for the mix change.");
  if (!Number.isFinite(input.bitumenPercent) || input.bitumenPercent < 0 || input.bitumenPercent >= 100) {
    throw new Error("Enter a bitumen percentage from 0 up to, but not including, 100.");
  }
  if (!input.components.length || input.components.some(component =>
    !Number.isInteger(component.materialId) ||
    !Number.isFinite(component.aggregateSharePercent) ||
    component.aggregateSharePercent < 0
  )) throw new Error("Choose valid aggregate materials and shares.");
  const shareTotal = input.components.reduce((sum, component) => sum + component.aggregateSharePercent, 0);
  if (Math.abs(shareTotal - 100) > 0.01) {
    throw new Error(`Aggregate shares must total 100% (currently ${shareTotal.toFixed(2)}%).`);
  }
  const versionId = await db.transaction(async tx => {
    const [order] = await tx.select({ id: plantSupplyOrders.id, status: plantSupplyOrders.status })
      .from(plantSupplyOrders).where(eq(plantSupplyOrders.id, orderId)).limit(1);
    if (!order) throw new Error("Plant supply order not found.");
    if (order.status !== "open") throw new Error("Only an open order's mix can be changed.");
    const [line] = await tx.select({
      id: plantSupplyOrderLines.id,
      mixTemplateId: plantSupplyOrderLines.mixTemplateId,
      mixName: plantSupplyOrderMixSpecs.mixName,
      sourceBitumenPercent: plantSupplyOrderMixSpecs.sourceBitumenPercent,
      baseBitumenPercent: plantSupplyOrderMixSpecs.bitumenPercent,
      ldoNorm: plantSupplyOrderMixSpecs.ldoNorm,
      templateName: mixTemplates.name,
      templateBitumenPercent: mixTemplates.bitumenPercent,
      templateLdoNorm: mixTemplates.ldoNorm,
    }).from(plantSupplyOrderLines)
      .innerJoin(mixTemplates, eq(mixTemplates.id, plantSupplyOrderLines.mixTemplateId))
      .leftJoin(plantSupplyOrderMixSpecs, eq(plantSupplyOrderMixSpecs.orderLineId, plantSupplyOrderLines.id))
      .where(and(eq(plantSupplyOrderLines.id, lineId), eq(plantSupplyOrderLines.orderId, orderId)))
      .limit(1);
    if (!line) throw new Error("Mix line not found on this order.");
    const dispatches = await tx.select({
      date: truckDispatches.date,
      time: truckDispatches.time,
    }).from(truckDispatches).where(and(
      eq(truckDispatches.supplyOrderId, orderId),
      eq(truckDispatches.mixTemplateId, line.mixTemplateId),
    ));
    let latestDispatchAt: Date | null = null;
    if (dispatches.length) {
      const latest = dispatches.reduce((max, row) => {
        const instant = supplyDispatchInstant(row.date, row.time).getTime();
        return instant > max ? instant : max;
      }, Number.NEGATIVE_INFINITY);
      latestDispatchAt = Number.isFinite(latest) ? new Date(latest) : null;
    }
    const [latestVersion] = await tx.select({ effectiveAt: plantSupplyOrderMixVersions.effectiveAt })
      .from(plantSupplyOrderMixVersions)
      .where(eq(plantSupplyOrderMixVersions.orderLineId, lineId))
      .orderBy(desc(plantSupplyOrderMixVersions.effectiveAt), desc(plantSupplyOrderMixVersions.id))
      .limit(1);
    const timeError = supplyMixVersionTimeError(
      effectiveAt,
      latestDispatchAt,
      latestVersion ? new Date(latestVersion.effectiveAt) : null,
    );
    if (timeError) throw new Error(timeError);
    const materialIds = Array.from(new Set(input.components.map(component => component.materialId)));
    const materialRows = await tx.select({ id: plantMaterials.id, isActive: plantMaterials.isActive })
      .from(plantMaterials).where(inArray(plantMaterials.id, materialIds));
    if (materialRows.length !== materialIds.length || materialRows.some(material => material.isActive !== 1)) {
      throw new Error("Choose active materials from the material master.");
    }
    const [version] = await tx.insert(plantSupplyOrderMixVersions).values({
      orderLineId: lineId,
      effectiveAt,
      mixName: line.mixName ?? `${line.templateName} — order mix`,
      sourceBitumenPercent: finite(line.sourceBitumenPercent ?? line.templateBitumenPercent),
      bitumenPercent: input.bitumenPercent,
      ldoNorm: line.ldoNorm ?? line.templateLdoNorm,
      reason,
      createdByUserId: actor.userId,
      createdByName: actor.name,
    }).returning({ id: plantSupplyOrderMixVersions.id });
    if (!version) throw new Error("Could not save the new mix version.");
    await tx.insert(plantSupplyOrderMixVersionComponents).values(input.components.map((component, index) => ({
      mixVersionId: version.id,
      materialId: component.materialId,
      aggregateSharePercent: component.aggregateSharePercent,
      sortOrder: index,
    })));
    await tx.insert(auditLogs).values({
      module: "plant_supply_order",
      transactionId: orderId,
      action: "edit",
      userId: actor.userId,
      userName: actor.name,
      userRole: "owner_or_plant_in_charge",
      oldValues: {
        field: `Mix ${line.mixName ?? line.templateName} version`,
        effectiveAt: latestVersion?.effectiveAt ?? null,
      },
      newValues: {
        field: `Mix ${line.mixName ?? line.templateName} version`,
        versionId: version.id,
        effectiveAt,
        bitumenPercent: input.bitumenPercent,
        components: input.components,
      },
      reason,
    });
    return version.id;
  });
  return { versionId, order: await getPlantSupplyOrder(orderId) };
}

export async function getSupplyOrderMixVersionOrderId(versionId: number): Promise<number | null> {
  const [row] = await db.select({ orderId: plantSupplyOrderLines.orderId })
    .from(plantSupplyOrderMixVersions)
    .innerJoin(plantSupplyOrderLines, eq(plantSupplyOrderLines.id, plantSupplyOrderMixVersions.orderLineId))
    .where(eq(plantSupplyOrderMixVersions.id, versionId)).limit(1);
  return row?.orderId ?? null;
}

export async function removePlantSupplyOrder(
  orderId: number,
  actor: { userId: number; name: string },
) {
  const detail = await getPlantSupplyOrder(orderId);
  if (!detail) return false;
  if (detail.dispatches.length) {
    throw new Error("An order with linked trucks cannot be removed. Close it instead.");
  }
  if (detail.attachments.length || detail.lines.some((line: any) =>
    line.mixVersions?.some((version: any) => version.attachments?.length)
  )) {
    throw new Error("Remove the order's attached files before removing the order.");
  }
  await db.transaction(async tx => {
    const [order] = await tx.select().from(plantSupplyOrders)
      .where(eq(plantSupplyOrders.id, orderId)).limit(1);
    if (!order) throw new Error("Plant supply order not found.");
    const [dispatch] = await tx.select({ id: truckDispatches.id }).from(truckDispatches)
      .where(eq(truckDispatches.supplyOrderId, orderId)).limit(1);
    if (dispatch) throw new Error("An order with linked trucks cannot be removed. Close it instead.");
    await tx.insert(auditLogs).values({
      module: "plant_supply_order",
      transactionId: orderId,
      action: "delete",
      userId: actor.userId,
      userName: actor.name,
      userRole: "owner",
      oldValues: {
        orderNo: order.orderNo,
        partyId: order.partyId,
        periodFrom: order.periodFrom,
        periodTo: order.periodTo,
      },
      newValues: null,
    });
    await tx.delete(plantSupplyOrders).where(eq(plantSupplyOrders.id, orderId));
  });
  return true;
}

export async function listPlantSupplyOrders() {
  const orders = await db.select({ id: plantSupplyOrders.id })
    .from(plantSupplyOrders).orderBy(desc(plantSupplyOrders.createdAt));
  return Promise.all(orders.map(row => getPlantSupplyOrder(row.id)));
}

export async function getOpenPlantSupplyOrderIdsForParty(partyId: number): Promise<number[]> {
  const rows = await db.select({ id: plantSupplyOrders.id })
    .from(plantSupplyOrders)
    .where(and(eq(plantSupplyOrders.partyId, partyId), eq(plantSupplyOrders.status, "open")))
    .orderBy(asc(plantSupplyOrders.id));
  return rows.map(row => row.id);
}

export async function getSupplyOrderLdoAllocations(date: string, plantName = "Main Plant") {
  const dispatched = await db.select({
    orderId: truckDispatches.supplyOrderId,
    loadWeight: truckDispatches.loadWeight,
  }).from(truckDispatches).where(and(
    eq(truckDispatches.date, date),
    eq(truckDispatches.plantName, plantName),
    isNotNull(truckDispatches.supplyOrderId),
  ));
  const orderIds = Array.from(new Set(dispatched.map(row => row.orderId).filter((id): id is number => id != null)));
  if (!orderIds.length) return [];

  const [orders, ldo] = await Promise.all([
    db.select({
      id: plantSupplyOrders.id,
      orderNo: plantSupplyOrders.orderNo,
      workName: plantSupplyOrders.workName,
      partyName: parties.name,
      periodFrom: plantSupplyOrders.periodFrom,
      periodTo: plantSupplyOrders.periodTo,
    }).from(plantSupplyOrders)
      .innerJoin(parties, eq(parties.id, plantSupplyOrders.partyId))
      .where(inArray(plantSupplyOrders.id, orderIds)),
    db.select({ id: plantMaterials.id }).from(plantMaterials)
      .where(sql`UPPER(TRIM(${plantMaterials.name})) = 'LDO'`).limit(1),
  ]);
  const inPeriod = orders.filter(order => date >= order.periodFrom && date <= order.periodTo);
  if (!inPeriod.length || !ldo[0]) return [];
  const activeIds = new Set(inPeriod.map(order => order.id));
  const tonnesByOrder = new Map<number, number>();
  for (const row of dispatched) {
    if (row.orderId == null || !activeIds.has(row.orderId)) continue;
    const tonnes = Math.max(0, finite(row.loadWeight));
    tonnesByOrder.set(row.orderId, (tonnesByOrder.get(row.orderId) ?? 0) + tonnes);
  }
  const allocationByOrder = new Map<number, { orderId: number; sharePercent: number; allocatedLitres: number }>(allocateSupplyOrderLdo(
    1,
    Array.from(tonnesByOrder.entries()).map(([orderId, dispatchMt]) => ({ orderId, dispatchMt })),
  ).map(row => [row.orderId, row] as const));
  const totalTonnes = Array.from(tonnesByOrder.values()).reduce((sum, weight) => sum + weight, 0);
  if (totalTonnes <= 0) return [];

  const scopeRows = await db.select({
    orderId: plantSupplyOrderMaterialScopes.orderId,
    scope: plantSupplyOrderMaterialScopes.scope,
  }).from(plantSupplyOrderMaterialScopes).where(and(
    inArray(plantSupplyOrderMaterialScopes.orderId, Array.from(activeIds)),
    eq(plantSupplyOrderMaterialScopes.materialId, ldo[0].id),
  ));
  const scopeByOrder = new Map(scopeRows.map(row => [row.orderId, row.scope]));
  const { storage } = await import("./storage");
  const summary = await storage.getDailyPlantSummary(date, plantName) as any;
  const accounting = summary?.ldo?.accounting;
  const preheat = accounting?.preheatLitres == null ? null : Number(accounting.preheatLitres);
  const boiler = accounting?.boilerDuringProductionLitres == null ? null : Number(accounting.boilerDuringProductionLitres);
  if (preheat == null || boiler == null || !Number.isFinite(preheat) || !Number.isFinite(boiler)) return [];
  const sharedLitres = Math.max(0, preheat) + Math.max(0, boiler);

  return inPeriod.map(order => {
    const weight = tonnesByOrder.get(order.id) ?? 0;
    const sharePercent = allocationByOrder.get(order.id)?.sharePercent ?? 0;
    return {
      orderId: order.id,
      orderNo: order.orderNo,
      workName: order.workName,
      partyName: order.partyName,
      scope: scopeByOrder.get(order.id) === "party" ? "party" : "hlc",
      dispatchMt: weight,
      sharePercent,
      sharedPlantLitres: sharedLitres,
      allocatedLitres: sharedLitres * (allocationByOrder.get(order.id)?.allocatedLitres ?? 0),
    };
  }).filter(row => row.dispatchMt > 0);
}

export async function getSupplyOrderDispatchContext(partyId: number, date: string, time = "00:00") {
  const [order] = await db.select({
    id: plantSupplyOrders.id,
    orderNo: plantSupplyOrders.orderNo,
    workName: plantSupplyOrders.workName,
    periodFrom: plantSupplyOrders.periodFrom,
    periodTo: plantSupplyOrders.periodTo,
  }).from(plantSupplyOrders).where(and(
    eq(plantSupplyOrders.partyId, partyId),
    eq(plantSupplyOrders.status, "open"),
    lte(plantSupplyOrders.periodFrom, date),
    gte(plantSupplyOrders.periodTo, date),
  )).limit(1);
  if (!order) return null;
  const lines = await db.select({
    orderLineId: plantSupplyOrderLines.id,
    id: plantSupplyOrderLines.id,
    mixTemplateId: plantSupplyOrderLines.mixTemplateId,
    mixName: mixTemplates.name,
    mixType: mixTemplates.mixType,
    bitumenPercent: mixTemplates.bitumenPercent,
    ldoNorm: mixTemplates.ldoNorm,
    orderMix: plantSupplyOrderMixSpecs,
  }).from(plantSupplyOrderLines)
    .innerJoin(mixTemplates, eq(mixTemplates.id, plantSupplyOrderLines.mixTemplateId))
    .leftJoin(plantSupplyOrderMixSpecs, eq(plantSupplyOrderMixSpecs.orderLineId, plantSupplyOrderLines.id))
    .where(eq(plantSupplyOrderLines.orderId, order.id));
  const mixIds = lines.map(line => line.orderMix?.id).filter((id): id is number => id != null);
  const components = mixIds.length
    ? await db.select({
        orderMixId: plantSupplyOrderMixComponents.orderMixId,
        materialId: plantSupplyOrderMixComponents.materialId,
        materialName: plantMaterials.name,
        aggregateSharePercent: plantSupplyOrderMixComponents.aggregateSharePercent,
      }).from(plantSupplyOrderMixComponents)
        .innerJoin(plantMaterials, eq(plantMaterials.id, plantSupplyOrderMixComponents.materialId))
        .where(inArray(plantSupplyOrderMixComponents.orderMixId, mixIds))
        .orderBy(asc(plantSupplyOrderMixComponents.sortOrder))
    : [];
  const orderLineIds = lines.map(line => line.orderLineId);
  const versions = orderLineIds.length
    ? await db.select().from(plantSupplyOrderMixVersions)
      .where(inArray(plantSupplyOrderMixVersions.orderLineId, orderLineIds))
      .orderBy(asc(plantSupplyOrderMixVersions.effectiveAt), asc(plantSupplyOrderMixVersions.id))
    : [];
  const versionIds = versions.map(version => version.id);
  const versionComponents = versionIds.length
    ? await db.select({
        mixVersionId: plantSupplyOrderMixVersionComponents.mixVersionId,
        materialId: plantSupplyOrderMixVersionComponents.materialId,
        materialName: plantMaterials.name,
        aggregateSharePercent: plantSupplyOrderMixVersionComponents.aggregateSharePercent,
      }).from(plantSupplyOrderMixVersionComponents)
        .innerJoin(plantMaterials, eq(plantMaterials.id, plantSupplyOrderMixVersionComponents.materialId))
        .where(inArray(plantSupplyOrderMixVersionComponents.mixVersionId, versionIds))
        .orderBy(asc(plantSupplyOrderMixVersionComponents.sortOrder), asc(plantSupplyOrderMixVersionComponents.id))
    : [];
  const { storage } = await import("./storage");
  return {
    ...order,
    lines: await Promise.all(lines.map(async line => {
      const lineVersions = versions
        .filter(version => version.orderLineId === line.orderLineId)
        .map(version => ({
          ...version,
          components: versionComponents.filter(component => component.mixVersionId === version.id),
        }));
      const activeVersion = mixVersionAt(lineVersions, date, time);
      const baseComponents = components.filter(component => component.orderMixId === line.orderMix?.id);
      const currentMix = activeVersion ?? line.orderMix;
      const mixVersionId = activeVersion?.id ?? null;
      const currentComponents = activeVersion
        ? activeVersion.components
        : baseComponents;
      const versionAttachments = activeVersion
        ? await storage.getAttachments("plant_supply_order_mix_version", activeVersion.id)
        : [];
      return {
        orderLineId: line.orderLineId,
        mixTemplateId: line.mixTemplateId,
        mixName: currentMix?.mixName ?? line.mixName,
        mixType: line.mixType,
        bitumenPercent: currentMix?.bitumenPercent ?? line.bitumenPercent,
        sourceBitumenPercent: currentMix?.sourceBitumenPercent ?? line.bitumenPercent,
        ldoNorm: currentMix?.ldoNorm ?? line.ldoNorm,
        isOrderMix: !!currentMix,
        mixVersionId,
        effectiveAt: activeVersion?.effectiveAt ?? null,
        components: currentComponents,
        versionAttachments,
      };
    })),
  };
}

export async function getPlantSupplyOrder(orderId: number) {
  const [order] = await db.select({
    id: plantSupplyOrders.id,
    orderNo: plantSupplyOrders.orderNo,
    partyId: plantSupplyOrders.partyId,
    partyName: parties.name,
    dispatchProSiteId: parties.dispatchProSiteId,
    partyContactPerson: parties.contactPerson,
    partyMobile: parties.mobile,
    partyGstNo: parties.gstNo,
    partyPanNo: parties.panNo,
    partyAddress: parties.address,
    siteId: plantSupplyOrders.siteId,
    siteName: sites.name,
    siteDispatchProSiteId: sites.dispatchProSiteId,
    siteWorkName: sites.workName,
    siteClientDepartment: sites.clientDepartment,
    siteDivision: sites.division,
    siteMandal: sites.mandal,
    siteDistrict: sites.district,
    siteAgreementEstimateRef: sites.agreementEstimateRef,
    siteEstimateSorYear: sites.estimateSorYear,
    siteMtPerCumFactor: sites.mtPerCumFactor,
    periodFrom: plantSupplyOrders.periodFrom,
    periodTo: plantSupplyOrders.periodTo,
    workName: plantSupplyOrders.workName,
    division: plantSupplyOrders.division,
    mandal: plantSupplyOrders.mandal,
    district: plantSupplyOrders.district,
    agreementEstimateRef: plantSupplyOrders.agreementEstimateRef,
    estimateSorYear: plantSupplyOrders.estimateSorYear,
    mtPerCumFactor: plantSupplyOrders.mtPerCumFactor,
    remarks: plantSupplyOrders.remarks,
    status: plantSupplyOrders.status,
    createdAt: plantSupplyOrders.createdAt,
    createdByName: plantSupplyOrders.createdByName,
  }).from(plantSupplyOrders)
    .innerJoin(parties, eq(parties.id, plantSupplyOrders.partyId))
    .leftJoin(sites, eq(sites.id, plantSupplyOrders.siteId))
    .where(eq(plantSupplyOrders.id, orderId)).limit(1);
  if (!order) return null;
  const [latestDispatchProOrder] = await db.select({
    status: dispatchProOutbox.status,
    lastError: dispatchProOutbox.lastError,
    responseSiteId: dispatchProOutbox.responseSiteId,
    responseSiteName: dispatchProOutbox.responseSiteName,
    linkChoice: dispatchProOutbox.linkChoice,
  }).from(dispatchProOutbox)
    .where(eq(dispatchProOutbox.supplyOrderId, orderId))
    .orderBy(desc(dispatchProOutbox.id)).limit(1);
  const partyDispatchProSiteId = order.dispatchProSiteId?.trim() || null;
  const siteDispatchProSiteId = order.siteDispatchProSiteId?.trim() || null;
  const responseDispatchProSiteId = latestDispatchProOrder?.responseSiteId?.trim() || null;
  const dispatchProConflictSource = responseDispatchProSiteId && partyDispatchProSiteId && partyDispatchProSiteId !== responseDispatchProSiteId
    ? "party"
    : responseDispatchProSiteId && siteDispatchProSiteId && siteDispatchProSiteId !== responseDispatchProSiteId
      ? "site"
      : null;
  const dispatchProNeedsOwnerChoice = !!responseDispatchProSiteId && !latestDispatchProOrder?.linkChoice && (
    (!!partyDispatchProSiteId && partyDispatchProSiteId !== responseDispatchProSiteId) ||
    (!!siteDispatchProSiteId && siteDispatchProSiteId !== responseDispatchProSiteId)
  );

  const lines = await db.select({
    id: plantSupplyOrderLines.id,
    mixTemplateId: plantSupplyOrderLines.mixTemplateId,
    enteredQuantity: plantSupplyOrderLines.enteredQuantity,
    enteredUnit: plantSupplyOrderLines.enteredUnit,
    mixName: mixTemplates.name,
    mixType: mixTemplates.mixType,
    orderedMt: plantSupplyOrderLines.orderedMt,
    plannedMtPerDay: plantSupplyOrderLines.plannedMtPerDay,
    sortOrder: plantSupplyOrderLines.sortOrder,
  }).from(plantSupplyOrderLines)
    .innerJoin(mixTemplates, eq(mixTemplates.id, plantSupplyOrderLines.mixTemplateId))
    .where(eq(plantSupplyOrderLines.orderId, orderId))
    .orderBy(asc(plantSupplyOrderLines.sortOrder), asc(plantSupplyOrderLines.id));

  const [dispatchRows, scopeRows, templateRows, componentRows, materialRows, orderMixRows, orderMixComponentRows] = await Promise.all([
    db.select({
      id: truckDispatches.id,
      date: truckDispatches.date,
      time: truckDispatches.time,
      mixTemplateId: truckDispatches.mixTemplateId,
      supplyOrderMixVersionId: truckDispatches.supplyOrderMixVersionId,
      loadWeight: truckDispatches.loadWeight,
      plantName: truckDispatches.plantName,
      theoreticalBitumenQty: truckDispatches.theoreticalBitumenQty,
      theoreticalBitumenPercent: truckDispatches.theoreticalBitumenPercent,
      theoreticalLdoQty: truckDispatches.theoreticalLdoQty,
      theoreticalAggregates: truckDispatches.theoreticalAggregates,
      actualBitumenQty: truckDispatches.actualBitumenQty,
      actualLdoQty: truckDispatches.actualLdoQty,
    }).from(truckDispatches).where(eq(truckDispatches.supplyOrderId, orderId)),
    db.select().from(plantSupplyOrderMaterialScopes).where(eq(plantSupplyOrderMaterialScopes.orderId, orderId)),
    db.select().from(mixTemplates).where(inArray(mixTemplates.id, lines.map(line => line.mixTemplateId))),
    db.select().from(mixTemplateComponents).where(inArray(mixTemplateComponents.templateId, lines.map(line => line.mixTemplateId))),
    db.select().from(plantMaterials),
    db.select({
      spec: plantSupplyOrderMixSpecs,
      line: plantSupplyOrderLines,
    }).from(plantSupplyOrderMixSpecs)
      .innerJoin(plantSupplyOrderLines, eq(plantSupplyOrderLines.id, plantSupplyOrderMixSpecs.orderLineId))
      .where(eq(plantSupplyOrderLines.orderId, orderId)),
    db.select({
      component: plantSupplyOrderMixComponents,
      spec: plantSupplyOrderMixSpecs,
      line: plantSupplyOrderLines,
    }).from(plantSupplyOrderMixComponents)
      .innerJoin(plantSupplyOrderMixSpecs, eq(plantSupplyOrderMixSpecs.id, plantSupplyOrderMixComponents.orderMixId))
      .innerJoin(plantSupplyOrderLines, eq(plantSupplyOrderLines.id, plantSupplyOrderMixSpecs.orderLineId))
      .where(eq(plantSupplyOrderLines.orderId, orderId)),
  ]);
  const lineIds = lines.map(line => line.id);
  const mixVersions = lineIds.length
    ? await db.select().from(plantSupplyOrderMixVersions)
      .where(inArray(plantSupplyOrderMixVersions.orderLineId, lineIds))
      .orderBy(asc(plantSupplyOrderMixVersions.effectiveAt), asc(plantSupplyOrderMixVersions.id))
    : [];
  const mixVersionIds = mixVersions.map(version => version.id);
  const mixVersionComponentRows = mixVersionIds.length
    ? await db.select({
        component: plantSupplyOrderMixVersionComponents,
        materialName: plantMaterials.name,
      }).from(plantSupplyOrderMixVersionComponents)
        .innerJoin(plantMaterials, eq(plantMaterials.id, plantSupplyOrderMixVersionComponents.materialId))
        .where(inArray(plantSupplyOrderMixVersionComponents.mixVersionId, mixVersionIds))
        .orderBy(asc(plantSupplyOrderMixVersionComponents.sortOrder), asc(plantSupplyOrderMixVersionComponents.id))
    : [];
  const { storage } = await import("./storage");
  const balanceRows = await storage.getStockBalances();
  const packedPositions = await storage.getPackedStockPositionSummary();
  const recentDispatches = await db.select({
    date: truckDispatches.date,
    mixTemplateId: truckDispatches.mixTemplateId,
    loadWeight: truckDispatches.loadWeight,
  }).from(truckDispatches).where(eq(truckDispatches.partyId, order.partyId))
    .orderBy(desc(truckDispatches.date), desc(truckDispatches.time)).limit(500);

  const lineInputs: SupplyOrderLine[] = lines.map(line => ({
    mixTemplateId: line.mixTemplateId,
    orderedMt: finite(line.orderedMt),
    plannedMtPerDay: line.plannedMtPerDay == null ? null : finite(line.plannedMtPerDay),
  }));
  const orderMixes: SupplyOrderMix[] = lines.flatMap(line => {
    const latestVersion = mixVersions
      .filter(version => version.orderLineId === line.id)
      .at(-1);
    if (latestVersion) {
      return [{
        mixTemplateId: line.mixTemplateId,
        mixName: latestVersion.mixName,
        sourceBitumenPercent: finite(latestVersion.sourceBitumenPercent),
        bitumenPercent: finite(latestVersion.bitumenPercent),
        ldoNorm: latestVersion.ldoNorm == null ? null : finite(latestVersion.ldoNorm),
        components: mixVersionComponentRows
          .filter(({ component }) => component.mixVersionId === latestVersion.id)
          .map(({ component }) => ({
            materialId: component.materialId,
            aggregateSharePercent: finite(component.aggregateSharePercent),
          })),
      }];
    }
    const base = orderMixRows.find(({ line: mixLine }) => mixLine.id === line.id);
    if (!base) return [];
    return [{
      mixTemplateId: line.mixTemplateId,
      mixName: base.spec.mixName,
      sourceBitumenPercent: finite(base.spec.sourceBitumenPercent),
      bitumenPercent: finite(base.spec.bitumenPercent),
      ldoNorm: base.spec.ldoNorm == null ? null : finite(base.spec.ldoNorm),
      components: orderMixComponentRows
        .filter(({ component }) => component.orderMixId === base.spec.id)
        .map(({ component }) => ({
          materialId: component.materialId,
          aggregateSharePercent: finite(component.aggregateSharePercent),
        })),
    }];
  });
  const dispatchInputs: SupplyDispatch[] = dispatchRows.map(row => ({
    date: row.date,
    mixTemplateId: row.mixTemplateId,
    loadWeight: finite(row.loadWeight),
  }));
  const dispatched = dispatchedByMix(lineInputs, dispatchInputs);
  const supplyMaterials = materialRows.map(row => ({ id: row.id, name: row.name }));
  const needs = orderMaterialNeedsWithOrderMix(
    lineInputs,
    templateRows.map(row => ({
      id: row.id,
      name: row.name,
      mixType: row.mixType,
      bitumenPercent: row.bitumenPercent,
      ldoNorm: row.ldoNorm,
    } as SupplyMixTemplate)),
    componentRows.map(row => ({
      templateId: row.templateId,
      materialId: row.materialId,
      percent: row.percent,
      moistureContent: row.moistureContent,
      wastageFactor: row.wastageFactor,
    } as SupplyMixComponent)),
    orderMixes,
    supplyMaterials,
    dispatched,
  );

  const ownPartySetting = await db.select({ value: appSettings.value }).from(appSettings)
    .where(eq(appSettings.key, "own_company_party_id")).limit(1);
  const hlcPartyId = ownPartySetting[0]?.value ? Number(ownPartySetting[0].value) : null;
  const scopeByMaterial = new Map(scopeRows.map(row => [row.materialId, row.scope]));
  const materialById = new Map(materialRows.map(row => [row.id, row]));
  const stockByKey = new Map(balanceRows.map(row => [`${row.partyId ?? "common"}:${row.materialId}`, row]));
  const packedByKey = new Map(packedPositions.map(row => [`${row.partyId ?? "common"}:${row.materialId}`, row]));
  const dailyMix = dailyMixTonnes(lineInputs, recentDispatches.map(row => ({
    date: row.date,
    mixTemplateId: row.mixTemplateId,
    loadWeight: finite(row.loadWeight),
  })));
  const dailyNeeds = orderMaterialNeedsWithOrderMix(
    lineInputs.map(line => ({ ...line, orderedMt: dailyMix.get(line.mixTemplateId) ?? 0, plannedMtPerDay: null })),
    templateRows.map(row => ({
      id: row.id,
      name: row.name,
      mixType: row.mixType,
      bitumenPercent: row.bitumenPercent,
      ldoNorm: row.ldoNorm,
    } as SupplyMixTemplate)),
    componentRows.map(row => ({
      templateId: row.templateId,
      materialId: row.materialId,
      percent: row.percent,
      moistureContent: row.moistureContent,
      wastageFactor: row.wastageFactor,
    } as SupplyMixComponent)),
    orderMixes,
    supplyMaterials,
    new Map(),
  );
  const dailyNeedById = new Map(dailyNeeds.map(row => [row.materialId, row.quantity]));
  const allowanceById = new Map<number, { quantity: number; uom: "MT" | "Liters" }>();
  const actualById = new Map<number, { quantity: number; uom: "MT" | "Liters" }>();
  const versionUsageByKey = new Map<string, Map<number, { allowance: number; actual: number; uom: string }>>();
  const addVersionUsage = (key: string, materialId: number, field: "allowance" | "actual", quantity: number, uom: string) => {
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    const materialUsage = versionUsageByKey.get(key) ?? new Map<number, { allowance: number; actual: number; uom: string }>();
    const current = materialUsage.get(materialId) ?? { allowance: 0, actual: 0, uom };
    current[field] += quantity;
    materialUsage.set(materialId, current);
    versionUsageByKey.set(key, materialUsage);
  };
  const addQuantity = (
    target: Map<number, { quantity: number; uom: "MT" | "Liters" }>,
    materialId: number,
    quantity: number,
    uom: "MT" | "Liters",
  ) => {
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    const existing = target.get(materialId);
    if (existing && existing.uom !== uom) throw new Error(`Material ${materialId} has mixed units in this order.`);
    target.set(materialId, { quantity: (existing?.quantity ?? 0) + quantity, uom });
  };
  const templateById = new Map(templateRows.map(row => [row.id, {
    id: row.id,
    name: row.name,
    mixType: row.mixType,
    bitumenPercent: row.bitumenPercent,
    ldoNorm: row.ldoNorm,
  } as SupplyMixTemplate]));
  const lineByTemplateId = new Map(lines.map(line => [line.mixTemplateId, line]));
  const bitumenId = materialRows.find(row => /bitumen/i.test(row.name))?.id;
  const ldoId = materialRows.find(row => /^LDO$/i.test(row.name.trim()))?.id;
  for (const dispatch of dispatchRows) {
    const template = templateById.get(dispatch.mixTemplateId);
    if (!template) continue;
    const line = lineByTemplateId.get(dispatch.mixTemplateId);
    const lineVersions = mixVersions.filter(version => version.orderLineId === line?.id);
    const selectedVersion = mixVersionForDispatch(
      lineVersions,
      dispatch.date,
      dispatch.time,
      dispatch.supplyOrderMixVersionId,
    );
    const versionUsageKey = selectedVersion ? `version:${selectedVersion.id}` : `base:${line?.id ?? dispatch.mixTemplateId}`;
    const baseSpec = orderMixRows.find(({ line: mixLine }) => mixLine.id === line?.id)?.spec;
    const orderMix: SupplyOrderMix | undefined = selectedVersion
      ? {
          mixTemplateId: dispatch.mixTemplateId,
          mixName: selectedVersion.mixName,
          sourceBitumenPercent: finite(selectedVersion.sourceBitumenPercent),
          bitumenPercent: finite(selectedVersion.bitumenPercent),
          ldoNorm: selectedVersion.ldoNorm == null ? null : finite(selectedVersion.ldoNorm),
          components: mixVersionComponentRows
            .filter(({ component }) => component.mixVersionId === selectedVersion.id)
            .map(({ component }) => ({
              materialId: component.materialId,
              aggregateSharePercent: finite(component.aggregateSharePercent),
            })),
        }
      : baseSpec
        ? {
            mixTemplateId: dispatch.mixTemplateId,
            mixName: baseSpec.mixName,
            sourceBitumenPercent: finite(baseSpec.sourceBitumenPercent),
            bitumenPercent: finite(baseSpec.bitumenPercent),
            ldoNorm: baseSpec.ldoNorm == null ? null : finite(baseSpec.ldoNorm),
            components: orderMixComponentRows
              .filter(({ component }) => component.orderMixId === baseSpec.id)
              .map(({ component }) => ({
                materialId: component.materialId,
                aggregateSharePercent: finite(component.aggregateSharePercent),
              })),
          }
        : undefined;
    const allowance = orderMix
      ? materialNeedForOrderMix(template, orderMix, finite(dispatch.loadWeight), supplyMaterials)
      : materialNeedForMix(template, componentRows.map(row => ({
        templateId: row.templateId,
        materialId: row.materialId,
        percent: row.percent,
        moistureContent: row.moistureContent,
        wastageFactor: row.wastageFactor,
      } as SupplyMixComponent)), finite(dispatch.loadWeight), supplyMaterials);
    for (const row of allowance) {
      addQuantity(allowanceById, row.materialId, row.quantity, row.uom);
      addVersionUsage(versionUsageKey, row.materialId, "allowance", row.quantity, row.uom);
    }

    let aggregates: Record<string, number> = {};
    try {
      aggregates = typeof dispatch.theoreticalAggregates === "string"
        ? JSON.parse(dispatch.theoreticalAggregates)
        : (dispatch.theoreticalAggregates as Record<string, number> | null) ?? {};
    } catch { aggregates = {}; }
    for (const [rawMaterialId, rawQuantity] of Object.entries(aggregates)) {
      addQuantity(actualById, Number(rawMaterialId), finite(rawQuantity), "MT");
      addVersionUsage(versionUsageKey, Number(rawMaterialId), "actual", finite(rawQuantity), "MT");
    }
    if (bitumenId) {
      const actualBitumen = dispatch.actualBitumenQty == null ? finite(dispatch.theoreticalBitumenQty) : finite(dispatch.actualBitumenQty);
      addQuantity(actualById, bitumenId, actualBitumen, "MT");
      addVersionUsage(versionUsageKey, bitumenId, "actual", actualBitumen, "MT");
    }
    if (ldoId) {
      const actualLdo = dispatch.actualLdoQty == null ? finite(dispatch.theoreticalLdoQty) : finite(dispatch.actualLdoQty);
      addQuantity(actualById, ldoId, actualLdo, "Liters");
      addVersionUsage(versionUsageKey, ldoId, "actual", actualLdo, "Liters");
    }
  }

  const ldoPlantAllocations: Array<{ date: string; litres: number; sharePercent: number }> = [];
  if (ldoId && scopeRows.find(row => row.materialId === ldoId)?.scope === "party") {
    for (const date of Array.from(new Set(dispatchRows.map(row => row.date)))) {
      const onDate = dispatchRows.find(row => row.date === date);
      const allocations = await getSupplyOrderLdoAllocations(date, onDate?.plantName || "Main Plant");
      const allocation = allocations.find(row => row.orderId === orderId);
      if (allocation && allocation.allocatedLitres > 0) {
        ldoPlantAllocations.push({
          date,
          litres: allocation.allocatedLitres,
          sharePercent: allocation.sharePercent,
        });
        addQuantity(actualById, ldoId, allocation.allocatedLitres, "Liters");
      }
    }
  }

  const usageMaterialIds = new Set<number>([
    ...Array.from(allowanceById.keys()),
    ...Array.from(actualById.keys()),
  ]);
  const materialUsage = Array.from(usageMaterialIds).map(materialId => {
    const material = materialById.get(materialId);
    const allowance = allowanceById.get(materialId);
    const actual = actualById.get(materialId);
    const uom = allowance?.uom ?? actual?.uom ?? "MT";
    return {
      materialId,
      materialName: material?.name ?? `Material #${materialId}`,
      scope: scopeByMaterial.get(materialId) === "party" ? "party" : "hlc",
      allowance: allowance?.quantity ?? 0,
      actual: actual?.quantity ?? 0,
      variance: (actual?.quantity ?? 0) - (allowance?.quantity ?? 0),
      plantAllocatedLdo: materialId === ldoId
        ? ldoPlantAllocations.reduce((sum, row) => sum + row.litres, 0)
        : 0,
      uom,
    };
  }).sort((a, b) => a.materialName.localeCompare(b.materialName));

  const materials = needs.map(need => {
    const material = materialById.get(need.materialId);
    const scope = scopeByMaterial.get(need.materialId) === "party" ? "party" : "hlc";
    const stockPartyId = scope === "party" ? order.partyId : hlcPartyId;
    const toNeedUnit = (balance: typeof balanceRows[number] | undefined) => {
      const stockUnit = stockUnitForMaterial(material, balance?.uom ?? need.uom);
      const balanceUnit = balance?.uom ?? stockUnit;
      let available = finite(balance?.balance);
      if (balance && balanceUnit !== need.uom) {
        try {
          available = convertStockQuantity(available, balanceUnit, need.uom, material?.bulkDensity);
        } catch {
          available = 0;
        }
      }
      return available;
    };
    const partyAvailable = toNeedUnit(stockByKey.get(`${order.partyId}:${need.materialId}`));
    const hlcAvailable = toNeedUnit(stockByKey.get(`${hlcPartyId ?? "common"}:${need.materialId}`));
    const position = packedByKey.get(`${stockPartyId ?? "common"}:${need.materialId}`);
    const packedStockAvailable = position
      ? toNeedUnit({ balance: position.packed, uom: position.stockUom } as typeof balanceRows[number])
      : 0;
    const tankStockAvailable = position && /bitumen|emulsion|ldo|diesel|hsd/i.test(`${material?.category ?? ""} ${material?.name ?? ""}`)
      ? toNeedUnit({ balance: position.tank1 + position.tank2, uom: position.stockUom } as typeof balanceRows[number])
      : null;
    const needQty = need.quantity;
    const dailyNeed = dailyNeedById.get(need.materialId) ?? 0;
    const availability = materialAvailabilityForScope(
      needQty, dailyNeed, scope, partyAvailable, hlcAvailable,
    );
    return {
      materialId: need.materialId,
      materialName: material?.name ?? `Material #${need.materialId}`,
      scope,
      need: needQty,
      uom: need.uom,
      stockAvailable: availability.stockAvailable,
      stockUom: need.uom,
      packedStockCount: position?.packedCount ?? 0,
      packedUnitName: position?.packedUnitName ?? null,
      packedStockAvailable,
      tankStockAvailable,
      shortage: availability.shortage,
      dailyNeed,
      daysLeft: availability.daysLeft,
      runningLow: availability.runningLow,
      scopePartyId: stockPartyId,
    };
  });

  const borrowings = await getBorrowingsForOrder(orderId);
  const alertRows = await db.select({
    dedupeKey: plantSupplyAlertDeliveries.dedupeKey,
    alertType: plantSupplyAlertDeliveries.alertType,
    title: plantSupplyAlertDeliveries.title,
    message: plantSupplyAlertDeliveries.message,
    createdAt: plantSupplyAlertDeliveries.createdAt,
  }).from(plantSupplyAlertDeliveries)
    .where(and(
      eq(plantSupplyAlertDeliveries.partyId, order.partyId),
      inArray(plantSupplyAlertDeliveries.alertType, ["running_low", "exhausted", "borrowed"]),
      gte(plantSupplyAlertDeliveries.createdAt, new Date(`${order.periodFrom}T00:00:00`)),
      lte(plantSupplyAlertDeliveries.createdAt, new Date(`${order.periodTo}T23:59:59.999`)),
    ))
    .orderBy(desc(plantSupplyAlertDeliveries.createdAt)).limit(200);
  const seenAlertKeys = new Set<string>();
  const orderAlerts = alertRows.filter(alert => {
    if (seenAlertKeys.has(alert.dedupeKey)) return false;
    seenAlertKeys.add(alert.dedupeKey);
    return true;
  });
  const orderAttachments = await storage.getAttachments("plant_supply_order", orderId);
  const orderHistory = await db.select({
    id: auditLogs.id,
    action: auditLogs.action,
    userName: auditLogs.userName,
    oldValues: auditLogs.oldValues,
    newValues: auditLogs.newValues,
    reason: auditLogs.reason,
    createdAt: auditLogs.createdAt,
  }).from(auditLogs)
    .where(and(eq(auditLogs.module, "plant_supply_order"), eq(auditLogs.transactionId, orderId)))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id));
  const lineResults = await Promise.all(lines.map(async line => {
    const dispatchedMt = dispatched.get(line.mixTemplateId) ?? 0;
    const orderMix = orderMixes.find(row => row.mixTemplateId === line.mixTemplateId);
    const baseSpec = orderMixRows.find(({ line: mixLine }) => mixLine.id === line.id)?.spec;
    const baseComponents = baseSpec
      ? orderMixComponentRows.filter(({ component }) => component.orderMixId === baseSpec.id).map(({ component }) => ({
          materialId: component.materialId,
          aggregateSharePercent: finite(component.aggregateSharePercent),
          materialName: materialRows.find(material => material.id === component.materialId)?.name ?? `Material #${component.materialId}`,
        }))
      : [];
    const lineVersions = mixVersions.filter(version => version.orderLineId === line.id);
    const dispatchesForLine = dispatchRows.filter(row => row.mixTemplateId === line.mixTemplateId);
    const usageForVersion = (key: string) => Array.from(versionUsageByKey.get(key)?.entries() ?? [])
      .map(([materialId, usage]) => ({
        materialId,
        materialName: materialById.get(materialId)?.name ?? `Material #${materialId}`,
        allowance: usage.allowance,
        actual: usage.actual,
        uom: usage.uom,
      }))
      .sort((left, right) => left.materialName.localeCompare(right.materialName));
    const versionDispatches = new Map<number, number>();
    let baseDispatchedMt = 0;
    for (const dispatch of dispatchesForLine) {
      const selectedVersion = mixVersionForDispatch(
        lineVersions,
        dispatch.date,
        dispatch.time,
        dispatch.supplyOrderMixVersionId,
      );
      if (!selectedVersion) baseDispatchedMt += finite(dispatch.loadWeight);
      else versionDispatches.set(
        selectedVersion.id,
        (versionDispatches.get(selectedVersion.id) ?? 0) + finite(dispatch.loadWeight),
      );
    }
    const timeline = lineVersions.length || baseSpec ? [
      {
        versionId: null,
        mixName: baseSpec?.mixName ?? line.mixName,
        sourceBitumenPercent: finite(baseSpec?.sourceBitumenPercent ?? templateRows.find(template => template.id === line.mixTemplateId)?.bitumenPercent),
        bitumenPercent: finite(baseSpec?.bitumenPercent ?? templateRows.find(template => template.id === line.mixTemplateId)?.bitumenPercent),
        ldoNorm: baseSpec?.ldoNorm == null ? null : finite(baseSpec.ldoNorm),
        effectiveAt: order.createdAt,
        effectiveUntil: lineVersions[0]?.effectiveAt ?? null,
        reason: null,
        createdByName: order.createdByName ?? null,
        dispatchedMt: baseDispatchedMt,
        materialUsage: usageForVersion(`base:${line.id}`),
        components: baseComponents,
        instructionAttached: orderAttachments.some((attachment: any) => attachment.docType === "mix_instruction"),
      },
      ...await Promise.all(lineVersions.map(async version => {
        const versionAttachments = await storage.getAttachments("plant_supply_order_mix_version", version.id);
        return {
          versionId: version.id,
          mixName: version.mixName,
          sourceBitumenPercent: finite(version.sourceBitumenPercent),
          bitumenPercent: finite(version.bitumenPercent),
          ldoNorm: version.ldoNorm == null ? null : finite(version.ldoNorm),
          effectiveAt: version.effectiveAt,
          effectiveUntil: lineVersions.find(candidate => candidate.effectiveAt > version.effectiveAt)?.effectiveAt ?? null,
          reason: version.reason,
          createdByName: version.createdByName,
          dispatchedMt: versionDispatches.get(version.id) ?? 0,
          materialUsage: usageForVersion(`version:${version.id}`),
          components: mixVersionComponentRows.filter(({ component }) => component.mixVersionId === version.id).map(({ component, materialName }) => ({
            materialId: component.materialId,
            materialName,
            aggregateSharePercent: finite(component.aggregateSharePercent),
          })),
          instructionAttached: versionAttachments.some((attachment: any) => attachment.docType === "mix_instruction"),
          attachments: versionAttachments,
        };
      })),
    ] : [];
    const enteredQuantity = line.enteredQuantity == null ? null : finite(line.enteredQuantity);
    const enteredUnit = line.enteredUnit === "cum" ? "cum" : line.enteredUnit === "MT" ? "MT" : null;
    return {
      ...line,
      dispatchProMixName: line.mixName,
      mixName: orderMix?.mixName ?? line.mixName,
      orderedMt: finite(line.orderedMt),
      enteredQuantity,
      enteredUnit,
      equivalentCum: enteredUnit === "cum" && enteredQuantity != null
        ? enteredQuantity
        : finite(line.orderedMt) / finite(order.mtPerCumFactor || 2.356),
      orderMix: orderMix ?? null,
      mixVersions: timeline,
      plannedMtPerDay: line.plannedMtPerDay == null ? null : finite(line.plannedMtPerDay),
      dispatchedMt,
      balanceMt: Math.max(0, finite(line.orderedMt) - dispatchedMt),
    };
  }));
  return {
    ...order,
    dispatchPro: {
      status: latestDispatchProOrder?.status ?? "not_sent",
      lastError: latestDispatchProOrder?.lastError ?? null,
      responseSiteId: responseDispatchProSiteId,
      responseSiteName: latestDispatchProOrder?.responseSiteName ?? null,
      linkedSiteId: siteDispatchProSiteId ?? partyDispatchProSiteId,
      partyLinkId: partyDispatchProSiteId,
      conflictSource: dispatchProConflictSource,
      existingLinkId: dispatchProConflictSource === "party" ? partyDispatchProSiteId : siteDispatchProSiteId ?? partyDispatchProSiteId,
      needsOwnerChoice: dispatchProNeedsOwnerChoice,
      hasSite: order.siteId != null,
    },
    siteWorkDetails: {
      workName: order.siteWorkName,
      clientDepartment: order.siteClientDepartment,
      division: order.siteDivision,
      mandal: order.siteMandal,
      district: order.siteDistrict,
      agreementEstimateRef: order.siteAgreementEstimateRef,
      estimateSorYear: order.siteEstimateSorYear,
      mtPerCumFactor: order.siteMtPerCumFactor,
    },
    attachments: orderAttachments,
    history: orderHistory,
    lines: lineResults,
    materials,
    materialUsage,
    ldoPlantAllocations,
    borrowings,
    alerts: orderAlerts,
    dispatches: dispatchRows,
    hlcPartyId,
  };
}

export async function updateSupplyOrderScope(
  orderId: number,
  materialId: number,
  scope: "hlc" | "party",
  actor: { userId: number; name: string },
) {
  const [order] = await db.select({ id: plantSupplyOrders.id }).from(plantSupplyOrders)
    .where(and(eq(plantSupplyOrders.id, orderId), eq(plantSupplyOrders.status, "open"))).limit(1);
  if (!order) throw new Error("Only an open order can be changed.");
  const orderDetail = await getPlantSupplyOrder(orderId);
  if (!orderDetail?.materials.some(row => row.materialId === materialId)) {
    throw new Error("This material is not part of the order's remaining mix demand.");
  }
  const [existing] = await db.select().from(plantSupplyOrderMaterialScopes)
    .where(and(
      eq(plantSupplyOrderMaterialScopes.orderId, orderId),
      eq(plantSupplyOrderMaterialScopes.materialId, materialId),
    )).limit(1);
  await db.insert(plantSupplyOrderMaterialScopes).values({
    orderId, materialId, scope, updatedByUserId: actor.userId, updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [plantSupplyOrderMaterialScopes.orderId, plantSupplyOrderMaterialScopes.materialId],
    set: { scope, updatedByUserId: actor.userId, updatedAt: new Date() },
  });
  await db.insert(auditLogs).values({
    module: "plant_supply_order",
    transactionId: orderId,
    action: "edit",
    userId: actor.userId,
    userName: actor.name,
    userRole: "granted_user",
    oldValues: { materialId, scope: existing?.scope ?? "hlc" },
    newValues: { materialId, scope },
  });
  return getPlantSupplyOrder(orderId);
}

export async function setSupplyOrderStatus(orderId: number, status: "open" | "closed", actor: { userId: number; name: string }) {
  const [current] = await db.select({ status: plantSupplyOrders.status })
    .from(plantSupplyOrders).where(eq(plantSupplyOrders.id, orderId)).limit(1);
  if (!current) return null;
  const [updated] = await db.update(plantSupplyOrders).set({
    status,
    updatedAt: new Date(),
    closedAt: status === "closed" ? new Date() : null,
    closedByUserId: status === "closed" ? actor.userId : null,
    closedByName: status === "closed" ? actor.name : null,
  }).where(eq(plantSupplyOrders.id, orderId)).returning({ id: plantSupplyOrders.id });
  if (!updated) return null;
  await db.insert(auditLogs).values({
    module: "plant_supply_order",
    transactionId: orderId,
    action: status === "closed" ? "close" : "reopen",
    userId: actor.userId,
    userName: actor.name,
    userRole: "owner_or_plant_in_charge",
    oldValues: { status: current.status },
    newValues: { status },
  });
  return getPlantSupplyOrder(orderId);
}

export async function getBorrowingsForOrder(orderId: number) {
  const rows = await db.select({
    id: plantSupplyBorrowings.id,
    orderId: plantSupplyBorrowings.orderId,
    dispatchId: plantSupplyBorrowings.dispatchId,
    partyId: plantSupplyBorrowings.partyId,
    materialId: plantSupplyBorrowings.materialId,
    materialName: plantMaterials.name,
    quantity: plantSupplyBorrowings.quantity,
    uom: plantSupplyBorrowings.uom,
    status: plantSupplyBorrowings.status,
    borrowedByName: plantSupplyBorrowings.borrowedByName,
    borrowedAt: plantSupplyBorrowings.borrowedAt,
    decisionByName: plantSupplyBorrowings.decisionByName,
    decisionAt: plantSupplyBorrowings.decisionAt,
    decisionNote: plantSupplyBorrowings.decisionNote,
  }).from(plantSupplyBorrowings)
    .innerJoin(plantMaterials, eq(plantMaterials.id, plantSupplyBorrowings.materialId))
    .where(eq(plantSupplyBorrowings.orderId, orderId))
    .orderBy(desc(plantSupplyBorrowings.borrowedAt));
  const ids = rows.map(row => row.id);
  if (!ids.length) return [];
  const [replacementRows, events] = await Promise.all([
    db.select({
      borrowingId: plantSupplyBorrowingReplacements.borrowingId,
      quantity: plantSupplyBorrowingReplacements.quantity,
    }).from(plantSupplyBorrowingReplacements)
      .innerJoin(materialReceipts, eq(materialReceipts.id, plantSupplyBorrowingReplacements.receiptId))
      .where(and(
        inArray(plantSupplyBorrowingReplacements.borrowingId, ids),
        isNotNull(plantSupplyBorrowingReplacements.receiptId),
        eq(materialReceipts.isDeleted, false),
        eq(materialReceipts.isCancelled, false),
      )),
    db.select().from(plantSupplyBorrowingEvents)
      .where(inArray(plantSupplyBorrowingEvents.borrowingId, ids))
      .orderBy(asc(plantSupplyBorrowingEvents.createdAt)),
  ]);
  const replaced = new Map<number, number>();
  replacementRows.forEach(row => replaced.set(row.borrowingId, (replaced.get(row.borrowingId) ?? 0) + finite(row.quantity)));
  const eventsByBorrowing = new Map<number, typeof events>();
  events.forEach(event => {
    const current = eventsByBorrowing.get(event.borrowingId) ?? [];
    current.push(event);
    eventsByBorrowing.set(event.borrowingId, current);
  });
  return rows.map(row => ({
    ...row,
    quantity: finite(row.quantity),
    replaced: replaced.get(row.id) ?? 0,
    owed: Math.max(0, finite(row.quantity) - (replaced.get(row.id) ?? 0)),
    events: eventsByBorrowing.get(row.id) ?? [],
  }));
}

export async function getPartySupplyBorrowings(partyId: number) {
  const rows = await db.select({
    id: plantSupplyBorrowings.id,
    orderId: plantSupplyBorrowings.orderId,
    orderNo: plantSupplyOrders.orderNo,
    dispatchId: plantSupplyBorrowings.dispatchId,
    materialId: plantSupplyBorrowings.materialId,
    materialName: plantMaterials.name,
    quantity: plantSupplyBorrowings.quantity,
    uom: plantSupplyBorrowings.uom,
    status: plantSupplyBorrowings.status,
    borrowedAt: plantSupplyBorrowings.borrowedAt,
    decisionNote: plantSupplyBorrowings.decisionNote,
  }).from(plantSupplyBorrowings)
    .innerJoin(plantSupplyOrders, eq(plantSupplyOrders.id, plantSupplyBorrowings.orderId))
    .innerJoin(plantMaterials, eq(plantMaterials.id, plantSupplyBorrowings.materialId))
    .where(eq(plantSupplyBorrowings.partyId, partyId))
    .orderBy(desc(plantSupplyBorrowings.borrowedAt));
  const ids = rows.map(row => row.id);
  if (!ids.length) return { rows: [], totals: [] };
  const replacements = await db.select({
    borrowingId: plantSupplyBorrowingReplacements.borrowingId,
    quantity: plantSupplyBorrowingReplacements.quantity,
    materialId: plantSupplyBorrowings.materialId,
    uom: plantSupplyBorrowings.uom,
  }).from(plantSupplyBorrowingReplacements)
    .innerJoin(plantSupplyBorrowings, eq(plantSupplyBorrowings.id, plantSupplyBorrowingReplacements.borrowingId))
    .innerJoin(materialReceipts, eq(materialReceipts.id, plantSupplyBorrowingReplacements.receiptId))
    .where(and(
      inArray(plantSupplyBorrowingReplacements.borrowingId, ids),
      isNotNull(plantSupplyBorrowingReplacements.receiptId),
      eq(materialReceipts.isDeleted, false),
      eq(materialReceipts.isCancelled, false),
    ));
  const replaced = new Map<number, number>();
  replacements.forEach(row => replaced.set(row.borrowingId, (replaced.get(row.borrowingId) ?? 0) + finite(row.quantity)));
  const withBalance = rows.map(row => ({
    ...row,
    quantity: finite(row.quantity),
    replaced: replaced.get(row.id) ?? 0,
    owed: Math.max(0, finite(row.quantity) - (replaced.get(row.id) ?? 0)),
  }));
  const totalsByMaterial = new Map<number, { materialId: number; materialName: string; quantity: number; replaced: number; owed: number; uom: string }>();
  withBalance.forEach(row => {
    const existing = totalsByMaterial.get(row.materialId) ?? {
      materialId: row.materialId,
      materialName: row.materialName,
      quantity: 0,
      replaced: 0,
      owed: 0,
      uom: row.uom,
    };
    existing.quantity += row.quantity;
    existing.replaced += row.replaced;
    existing.owed += row.owed;
    totalsByMaterial.set(row.materialId, existing);
  });
  return { rows: withBalance, totals: Array.from(totalsByMaterial.values()) };
}

export async function hasSupplyRole(userId: number, roleName: string) {
  const [row] = await db.select({ id: userRoles.userId })
    .from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(userRoles.userId, userId), eq(roles.name, roleName))).limit(1);
  return Boolean(row);
}

export async function decideSupplyBorrowing(
  borrowingId: number,
  decision: "approved" | "party_will_replace",
  actor: { userId: number; name: string },
  note?: string,
) {
  if (decision === "party_will_replace" && !note?.trim()) throw new Error("Add a note for the replacement plan.");
  const [updated] = await db.transaction(async tx => {
    const locked = await tx.execute(sql`SELECT id, status FROM plant_supply_borrowings WHERE id = ${borrowingId} FOR UPDATE`);
    if (!locked.rows?.length) return [];
    const currentStatus = String((locked.rows[0] as any).status);
    if (currentStatus !== "pending") throw new Error("This borrowing has already been decided.");
    const changed = await tx.update(plantSupplyBorrowings).set({
      status: decision,
      decisionByUserId: actor.userId,
      decisionByName: actor.name,
      decisionAt: new Date(),
      decisionNote: note?.trim() || null,
      updatedAt: new Date(),
    }).where(eq(plantSupplyBorrowings.id, borrowingId)).returning();
    await tx.insert(plantSupplyBorrowingEvents).values({
      borrowingId,
      action: decision,
      actorUserId: actor.userId,
      actorName: actor.name,
      note: note?.trim() || null,
    });
    return changed;
  });
  return updated ?? null;
}

export async function markBorrowingReplacement(input: {
  borrowingId: number;
  receiptId: number;
  quantity: number;
}, actor: { userId: number; name: string }) {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error("Replacement quantity must be greater than zero.");
  return db.transaction(async tx => {
    const borrowResult = await tx.execute(sql`
      SELECT id, party_id, material_id, quantity, uom
      FROM plant_supply_borrowings WHERE id = ${input.borrowingId} FOR UPDATE
    `);
    const borrowing = borrowResult.rows?.[0] as any;
    if (!borrowing) throw new Error("Borrowing not found.");
    const [receipt] = await tx.select().from(materialReceipts).where(eq(materialReceipts.id, input.receiptId)).limit(1);
    if (!receipt || receipt.isDeleted || receipt.isCancelled) throw new Error("Choose an active material receipt.");
    if (receipt.partyId !== Number(borrowing.party_id) || receipt.materialId !== Number(borrowing.material_id)) {
      throw new Error("The receipt must be for the same party and material.");
    }
    const [existing] = await tx.select({
      quantity: sql<number>`COALESCE(SUM(${plantSupplyBorrowingReplacements.quantity}), 0)`,
    }).from(plantSupplyBorrowingReplacements)
      .where(eq(plantSupplyBorrowingReplacements.receiptId, input.receiptId));
    const [alreadyReplaced] = await tx.select({
      quantity: sql<number>`COALESCE(SUM(${plantSupplyBorrowingReplacements.quantity}), 0)`,
    }).from(plantSupplyBorrowingReplacements)
      .innerJoin(materialReceipts, eq(materialReceipts.id, plantSupplyBorrowingReplacements.receiptId))
      .where(and(
        eq(plantSupplyBorrowingReplacements.borrowingId, input.borrowingId),
        isNotNull(plantSupplyBorrowingReplacements.receiptId),
        eq(materialReceipts.isDeleted, false),
        eq(materialReceipts.isCancelled, false),
      ));
    const [material] = await tx.select().from(plantMaterials)
      .where(eq(plantMaterials.id, Number(borrowing.material_id))).limit(1);
    const receiptQuantityInBorrowUnit = convertStockQuantity(
      finite(receipt.quantity),
      receipt.uom,
      String(borrowing.uom),
      material?.bulkDensity,
    );
    const remainingReceipt = receiptQuantityInBorrowUnit - finite(existing?.quantity);
    const remainingBorrow = finite(borrowing.quantity) - finite(alreadyReplaced?.quantity);
    if (input.quantity > remainingReceipt + 0.000001) throw new Error("Replacement exceeds the receipt's unallocated quantity.");
    if (input.quantity > remainingBorrow + 0.000001) throw new Error("Replacement exceeds the borrowing balance.");
    const [replacement] = await tx.insert(plantSupplyBorrowingReplacements).values({
      borrowingId: input.borrowingId,
      receiptId: input.receiptId,
      quantity: String(input.quantity),
      uom: String(borrowing.uom),
      markedByUserId: actor.userId,
      markedByName: actor.name,
    }).returning();
    await tx.insert(plantSupplyBorrowingEvents).values({
      borrowingId: input.borrowingId,
      action: "replaced",
      actorUserId: actor.userId,
      actorName: actor.name,
      quantity: String(input.quantity),
      uom: String(borrowing.uom),
      relatedReceiptId: input.receiptId,
    });
    return replacement;
  });
}

export async function getSupplyAlertSettings(): Promise<SupplyAlertSettings> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings)
    .where(eq(appSettings.key, ALERT_SETTINGS_KEY)).limit(1);
  const [operatorRole] = await db.select({ id: roles.id, name: roles.name }).from(roles)
    .where(sql`LOWER(${roles.name}) = 'plant operator'`).limit(1);
  const ownerIds = (await db.select({ id: users.id }).from(users)
    .where(and(eq(users.isActive, true), eq(users.isOwner, true))))
    .map(user => user.id);
  const operatorRecipients = operatorRole
    ? { roles: [operatorRole.name], userIds: [] as number[] }
    : {
      roles: [] as string[],
      userIds: (await db.select({ id: users.id }).from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(and(eq(users.isActive, true), sql`LOWER(${roles.name}) = 'plant engineer'`)))
        .map(user => user.id),
    };
  const defaultUserIds = Array.from(new Set([...ownerIds, ...operatorRecipients.userIds]));
  const defaults: SupplyAlertSettings = {
    running_low: {
      roles: [...DEFAULT_ALERT_SETTINGS.running_low.roles, ...operatorRecipients.roles],
      userIds: defaultUserIds,
    },
    exhausted: {
      roles: [...DEFAULT_ALERT_SETTINGS.exhausted.roles, ...operatorRecipients.roles],
      userIds: defaultUserIds,
    },
    borrowed: {
      roles: [...DEFAULT_ALERT_SETTINGS.borrowed.roles, ...operatorRecipients.roles],
      userIds: defaultUserIds,
    },
  };
  const stored = jsonValue<Partial<SupplyAlertSettings> & { ownerDefaultsApplied?: boolean }>(row?.value, {});
  return resolveSupplyAlertSettings(stored, defaults, ownerIds);
}

function normalizeRecipientChoice(value: Partial<SupplyRecipientChoice> | undefined, fallback: SupplyRecipientChoice): SupplyRecipientChoice {
  return {
    roles: Array.from(new Set((value?.roles ?? fallback.roles).filter(role => typeof role === "string"))),
    userIds: Array.from(new Set((value?.userIds ?? fallback.userIds).map(Number).filter(id => Number.isInteger(id) && id > 0))),
  };
}

export async function saveSupplyAlertSettings(settings: SupplyAlertSettings, actorUserId: number) {
  const normalized: SupplyAlertSettings = {
    running_low: normalizeRecipientChoice(settings.running_low, DEFAULT_ALERT_SETTINGS.running_low),
    exhausted: normalizeRecipientChoice(settings.exhausted, DEFAULT_ALERT_SETTINGS.exhausted),
    borrowed: normalizeRecipientChoice(settings.borrowed, DEFAULT_ALERT_SETTINGS.borrowed),
  };
  const [actor] = await db.select({ fullName: users.fullName }).from(users)
    .where(eq(users.id, actorUserId)).limit(1);
  const oldValues = await getSupplyAlertSettings();
  await db.transaction(async tx => {
    await tx.insert(appSettings).values({
      key: ALERT_SETTINGS_KEY,
      value: JSON.stringify({ ...normalized, ownerDefaultsApplied: true }),
    }).onConflictDoUpdate({
      target: appSettings.key,
      set: { value: JSON.stringify({ ...normalized, ownerDefaultsApplied: true }), updatedAt: new Date() },
    });
    await tx.insert(auditLogs).values({
      module: "plant_supply_alert_settings",
      transactionId: 1,
      action: "edit",
      userId: actorUserId,
      userName: actor?.fullName ?? `User #${actorUserId}`,
      userRole: "owner",
      oldValues,
      newValues: normalized,
    });
  });
  return normalized;
}

export async function getSupplyAlertOptions() {
  const [roleRows, userRows] = await Promise.all([
    db.select({ id: roles.id, name: roles.name }).from(roles).orderBy(asc(roles.name)),
    db.select({ id: users.id, fullName: users.fullName, isOwner: users.isOwner })
      .from(users).where(eq(users.isActive, true)).orderBy(asc(users.fullName)),
  ]);
  return { roles: roleRows, users: userRows };
}

export async function resolveSupplyAlertRecipients(kind: SupplyAlertKind): Promise<number[]> {
  const settings = await getSupplyAlertSettings();
  const key = kind === "morning_summary" ? "running_low" : kind;
  const choice = settings[key];
  const userIds = new Set<number>();
  if (choice.userIds.length) {
    const activeUsers = await db.select({ id: users.id }).from(users)
      .where(and(inArray(users.id, choice.userIds), eq(users.isActive, true)));
    activeUsers.forEach(row => userIds.add(row.id));
  }
  if (choice.roles.length) {
    const roleUsers = await db.select({ userId: userRoles.userId, roleName: roles.name })
      .from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId))
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(eq(users.isActive, true));
    const names = new Set(choice.roles.map(name => name.trim().toLocaleLowerCase()));
    roleUsers.forEach(row => {
      if (names.has(row.roleName.trim().toLocaleLowerCase())) userIds.add(row.userId);
    });
  }
  const activeOwnerIds = kind === "borrowed"
    ? (await db.select({ id: users.id }).from(users)
      .where(and(eq(users.isActive, true), eq(users.isOwner, true))))
      .map(row => row.id)
    : [];
  return includeSupplyAlertOwners(kind, Array.from(userIds), activeOwnerIds);
}

export async function createSupplyAlertDeliveries(input: {
  dedupeKey: string;
  kind: SupplyAlertKind;
  title: string;
  message: string;
  orderId?: number | null;
  partyId?: number | null;
  materialId?: number | null;
}) {
  const recipientIds = await resolveSupplyAlertRecipients(input.kind);
  if (!recipientIds.length) return [];
  const inserted = await db.insert(plantSupplyAlertDeliveries).values(recipientIds.map(recipientUserId => ({
    dedupeKey: input.dedupeKey,
    recipientUserId,
    alertType: input.kind,
    orderId: input.orderId ?? null,
    partyId: input.partyId ?? null,
    materialId: input.materialId ?? null,
    title: input.title,
    message: input.message,
  }))).onConflictDoNothing().returning({
    id: plantSupplyAlertDeliveries.id,
    recipientUserId: plantSupplyAlertDeliveries.recipientUserId,
    orderId: plantSupplyAlertDeliveries.orderId,
    title: plantSupplyAlertDeliveries.title,
    message: plantSupplyAlertDeliveries.message,
  });
  return inserted;
}

export async function getUserSupplyAlerts(userId: number) {
  return db.select({
    id: plantSupplyAlertDeliveries.id,
    title: plantSupplyAlertDeliveries.title,
    message: plantSupplyAlertDeliveries.message,
    isRead: plantSupplyAlertDeliveries.isRead,
    createdAt: plantSupplyAlertDeliveries.createdAt,
    alertType: plantSupplyAlertDeliveries.alertType,
    orderId: plantSupplyAlertDeliveries.orderId,
    partyId: plantSupplyAlertDeliveries.partyId,
  }).from(plantSupplyAlertDeliveries)
    .where(eq(plantSupplyAlertDeliveries.recipientUserId, userId))
    .orderBy(desc(plantSupplyAlertDeliveries.createdAt)).limit(100);
}

export async function markUserSupplyAlertRead(userId: number, id: number, isRead = true) {
  const [row] = await db.update(plantSupplyAlertDeliveries).set({ isRead })
    .where(and(eq(plantSupplyAlertDeliveries.id, id), eq(plantSupplyAlertDeliveries.recipientUserId, userId)))
    .returning({ id: plantSupplyAlertDeliveries.id });
  return Boolean(row);
}

export async function markAllUserSupplyAlertsRead(userId: number) {
  await db.update(plantSupplyAlertDeliveries).set({ isRead: true })
    .where(and(eq(plantSupplyAlertDeliveries.recipientUserId, userId), eq(plantSupplyAlertDeliveries.isRead, false)));
}

export async function deleteUserSupplyAlert(userId: number, id: number) {
  const [row] = await db.delete(plantSupplyAlertDeliveries)
    .where(and(eq(plantSupplyAlertDeliveries.id, id), eq(plantSupplyAlertDeliveries.recipientUserId, userId)))
    .returning({ id: plantSupplyAlertDeliveries.id });
  return Boolean(row);
}

export async function countUserUnreadSupplyAlerts(userId: number) {
  const [row] = await db.select({ count: sql<number>`count(*)::int` })
    .from(plantSupplyAlertDeliveries)
    .where(and(eq(plantSupplyAlertDeliveries.recipientUserId, userId), eq(plantSupplyAlertDeliveries.isRead, false)));
  return Number(row?.count ?? 0);
}

export async function activeSupplyOrderAlertLines() {
  const openOrders = await db.select({ id: plantSupplyOrders.id }).from(plantSupplyOrders)
    .where(eq(plantSupplyOrders.status, "open"));
  const summaries = await Promise.all(openOrders.map(row => getPlantSupplyOrder(row.id)));
  const lowLines = summaries.flatMap(order => order?.materials.filter(material => material.runningLow).map(material => ({
    orderId: order.id,
    orderNo: order.orderNo,
    partyId: order.partyId,
    partyName: order.partyName,
    materialId: material.materialId,
    materialName: material.materialName,
    stockAvailable: material.stockAvailable,
    dailyNeed: material.dailyNeed,
    daysLeft: material.daysLeft,
    uom: material.uom,
    scope: material.scope,
    alertType: "running_low" as const,
    message: `${order.partyName} · ${material.materialName}: ${material.stockAvailable.toFixed(3)} ${material.uom} available; under one production day.`,
  })) ?? []);
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const datePart = (type: string) => dateParts.find(part => part.type === type)?.value ?? "";
  const todayStart = new Date(`${datePart("year")}-${datePart("month")}-${datePart("day")}T00:00:00+05:30`);
  const recentRows = await db.select({
    dedupeKey: plantSupplyAlertDeliveries.dedupeKey,
    alertType: plantSupplyAlertDeliveries.alertType,
    partyId: plantSupplyAlertDeliveries.partyId,
    title: plantSupplyAlertDeliveries.title,
    message: plantSupplyAlertDeliveries.message,
    createdAt: plantSupplyAlertDeliveries.createdAt,
  }).from(plantSupplyAlertDeliveries)
    .where(and(
      inArray(plantSupplyAlertDeliveries.alertType, ["exhausted", "borrowed"]),
      gte(plantSupplyAlertDeliveries.createdAt, todayStart),
    ))
    .orderBy(desc(plantSupplyAlertDeliveries.createdAt)).limit(300);
  const seenEventKeys = new Set<string>();
  const eventLines = recentRows.filter(row => {
    if (seenEventKeys.has(row.dedupeKey)) return false;
    seenEventKeys.add(row.dedupeKey);
    return true;
  }).map(row => ({
    orderId: null,
    orderNo: null,
    partyId: row.partyId,
    partyName: "",
    materialId: null,
    materialName: "",
    stockAvailable: null,
    dailyNeed: null,
    daysLeft: null,
    uom: "",
    scope: "",
    alertType: row.alertType,
    title: row.title,
    message: row.message,
  }));
  return [...lowLines, ...eventLines];
}

export async function registerDispatchSupplyAlerts(orderId: number, dispatchId: number, borrowed: Array<{
  borrowingId: number; partyId: number; materialId: number; materialName: string; quantity: number; uom: string;
}>) {
  const order = await getPlantSupplyOrder(orderId);
  if (!order) return [];
  const date = order.dispatches.find(row => row.id === dispatchId)?.date ?? new Date().toISOString().slice(0, 10);
  const [dispatch] = await db.select({
    truckNumber: truckDispatches.truckNumber,
    time: truckDispatches.time,
  }).from(truckDispatches).where(eq(truckDispatches.id, dispatchId)).limit(1);
  const deliveries = [];
  const orderNotice = (
    reason: string,
    problems: Array<{ label: string; quantity: number; uom: string }>,
    problemPrefix = "Short",
  ) => formatPlantSupplyOrderNotification({
    partyName: order.partyName,
    orderNo: order.orderNo ?? `Order #${order.id}`,
    periodFrom: order.periodFrom,
    periodTo: order.periodTo,
    lines: order.lines.map((line: any) => ({
      mixName: line.mixName,
      orderedMt: finite(line.orderedMt),
      dispatchedMt: finite(line.dispatchedMt),
      balanceMt: finite(line.balanceMt),
    })),
    problemPrefix,
    problems,
  }, reason);
  const partyStockRows = await db.select({
    materialId: stockLedger.materialId,
    quantityOut: stockLedger.quantityOut,
    balanceAfter: stockLedger.balanceAfter,
  }).from(stockLedger).where(and(
    eq(stockLedger.referenceId, dispatchId),
    eq(stockLedger.partyId, order.partyId),
    eq(stockLedger.transactionType, "dispatch"),
  ));
  const partyScopeMaterialIds = new Set(
    (await db.select({ materialId: plantSupplyOrderMaterialScopes.materialId })
      .from(plantSupplyOrderMaterialScopes)
      .where(and(
        eq(plantSupplyOrderMaterialScopes.orderId, orderId),
        eq(plantSupplyOrderMaterialScopes.scope, "party"),
      ))).map(row => row.materialId),
  );
  for (const row of partyStockRows) {
    const after = finite(row.balanceAfter);
    const before = after + finite(row.quantityOut);
    if (partyScopeMaterialIds.has(row.materialId) && dispatchCrossesStockZero(before, after)) {
      const material = order.materials.find(item => item.materialId === row.materialId);
      const [materialRow] = material ? [] : await db.select({ name: plantMaterials.name })
        .from(plantMaterials).where(eq(plantMaterials.id, row.materialId)).limit(1);
      const materialName = material?.materialName ?? materialRow?.name ?? `Material #${row.materialId}`;
      const materialStatus = order.materials.find(item => item.materialId === row.materialId);
      const created = await createSupplyAlertDeliveries({
        dedupeKey: `supply-exhausted:${dispatchId}:${row.materialId}`,
        kind: "exhausted",
        title: "Party material stock exhausted",
        message: orderNotice(
          `${materialName} exhausted${dispatch?.truckNumber ? ` at truck ${dispatch.truckNumber}` : ""}${dispatch?.time ? `, ${dispatch.time}` : ""}`,
          [{ label: materialName, quantity: finite(materialStatus?.shortage), uom: materialStatus?.uom ?? "" }],
        ),
        orderId,
        partyId: order.partyId,
        materialId: row.materialId,
      });
      deliveries.push(...created);
    }
  }
  for (const row of order.materials) {
    if (row.runningLow) {
      const created = await createSupplyAlertDeliveries({
        dedupeKey: `supply-low:${order.partyId}:${row.materialId}:${date}`,
        kind: "running_low",
        title: "Plant material running low",
        message: orderNotice(
          `${row.materialName} running low`,
          order.materials
            .filter((material: any) => material.shortage > 0 || material.runningLow)
            .map((material: any) => ({
              label: material.materialName,
              quantity: material.shortage > 0 ? finite(material.shortage) : finite(material.stockAvailable),
              uom: material.uom,
            })),
          order.materials.some((material: any) => material.shortage > 0) ? "Short" : "Stock left",
        ),
        orderId,
        partyId: order.partyId,
        materialId: row.materialId,
      });
      deliveries.push(...created);
    }
  }
  for (const row of borrowed) {
    const created = await createSupplyAlertDeliveries({
      dedupeKey: `supply-borrowed:${row.borrowingId}`,
      kind: "borrowed",
      title: "Party borrowed from HLC stock",
      message: orderNotice(
        `${row.materialName} borrowed from HLC`,
        [{ label: row.materialName, quantity: finite(row.quantity), uom: row.uom }],
        "Borrowed",
      ),
      orderId,
      partyId: row.partyId,
      materialId: row.materialId,
    });
    deliveries.push(...created);
  }
  return deliveries;
}

export async function runPlantSupplyMorningSummary(dateKey: string) {
  const openOrders = await db.select({ id: plantSupplyOrders.id }).from(plantSupplyOrders)
    .where(eq(plantSupplyOrders.status, "open"));
  const orders = (await Promise.all(openOrders.map(row => getPlantSupplyOrder(row.id))))
    .filter((order): order is NonNullable<typeof order> => Boolean(order));
  if (!orders.length) return [];
  const message = formatPlantSupplyMorningSummary(orders.map(order => ({
    partyName: order.partyName,
    orderNo: order.orderNo ?? `Order #${order.id}`,
    periodFrom: order.periodFrom,
    periodTo: order.periodTo,
    lines: order.lines.map((line: any) => ({
      mixName: line.mixName,
      orderedMt: finite(line.orderedMt),
      dispatchedMt: finite(line.dispatchedMt),
      balanceMt: finite(line.balanceMt),
    })),
    problemPrefix: "Short",
    problems: order.materials
      .filter((material: any) => material.shortage > 0)
      .map((material: any) => ({
        label: material.materialName,
        quantity: finite(material.shortage),
        uom: material.uom,
      })),
  })));
  return createSupplyAlertDeliveries({
    dedupeKey: `supply-morning:${dateKey}`,
    kind: "morning_summary",
    title: `Morning supply summary · ${orders.length} open order${orders.length === 1 ? "" : "s"}`,
    message,
  });
}

export async function supplyReceiptCandidates(partyId: number, materialId: number) {
  const rows = await db.select({
    borrowingId: plantSupplyBorrowings.id,
    orderNo: plantSupplyOrders.orderNo,
    quantity: plantSupplyBorrowings.quantity,
    uom: plantSupplyBorrowings.uom,
    materialName: plantMaterials.name,
    borrowedAt: plantSupplyBorrowings.borrowedAt,
  }).from(plantSupplyBorrowings)
    .innerJoin(plantSupplyOrders, eq(plantSupplyOrders.id, plantSupplyBorrowings.orderId))
    .innerJoin(plantMaterials, eq(plantMaterials.id, plantSupplyBorrowings.materialId))
    .where(and(eq(plantSupplyBorrowings.partyId, partyId), eq(plantSupplyBorrowings.materialId, materialId)))
    .orderBy(asc(plantSupplyBorrowings.borrowedAt));
  const replacements = rows.length ? await db.select({
    borrowingId: plantSupplyBorrowingReplacements.borrowingId,
    quantity: plantSupplyBorrowingReplacements.quantity,
  }).from(plantSupplyBorrowingReplacements)
    .innerJoin(materialReceipts, eq(materialReceipts.id, plantSupplyBorrowingReplacements.receiptId))
    .where(and(
      inArray(plantSupplyBorrowingReplacements.borrowingId, rows.map(row => row.borrowingId)),
      isNotNull(plantSupplyBorrowingReplacements.receiptId),
      eq(materialReceipts.isDeleted, false),
      eq(materialReceipts.isCancelled, false),
    )) : [];
  const totals = new Map<number, number>();
  replacements.forEach(row => totals.set(row.borrowingId, (totals.get(row.borrowingId) ?? 0) + finite(row.quantity)));
  const borrowings = rows.map(row => ({ ...row, owed: Math.max(0, finite(row.quantity) - (totals.get(row.borrowingId) ?? 0)) }));
  return borrowings.filter(row => row.owed > 0);
}

export async function getRecentMatchingReceipts(partyId: number, materialId: number) {
  const rows = await db.select({
    id: materialReceipts.id,
    date: materialReceipts.date,
    quantity: materialReceipts.quantity,
    uom: materialReceipts.uom,
    challanNumber: materialReceipts.challanNumber,
    receiptNo: materialReceipts.receiptNo,
  }).from(materialReceipts)
    .where(and(
      eq(materialReceipts.partyId, partyId),
      eq(materialReceipts.materialId, materialId),
      eq(materialReceipts.isDeleted, false),
      eq(materialReceipts.isCancelled, false),
    ))
    .orderBy(desc(materialReceipts.date), desc(materialReceipts.id)).limit(100);
  return rows;
}
