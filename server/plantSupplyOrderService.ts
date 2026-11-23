import { and, asc, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import {
  appSettings,
  auditLogs,
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
  dailyMixTonnes,
  dispatchCrossesStockZero,
  dispatchedByMix,
  formatPlantSupplyMorningSummary,
  materialAvailabilityForScope,
  orderMaterialNeeds,
  type SupplyDispatch,
  type SupplyMixComponent,
  type SupplyMixTemplate,
  type SupplyOrderLine,
} from "@shared/plantSupplyOrders";
import { convertStockQuantity, stockUnitForMaterial } from "@shared/stockUnits";

const ALERT_SETTINGS_KEY = "plant_supply_alert_recipients_v1";

export type SupplyAlertKind = "running_low" | "exhausted" | "borrowed" | "morning_summary";
export type SupplyRecipientChoice = { roles: string[]; userIds: number[] };
export type SupplyAlertSettings = {
  running_low: SupplyRecipientChoice;
  exhausted: SupplyRecipientChoice;
  borrowed: SupplyRecipientChoice;
};

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
  const [partyRows, siteRows, templateRows, materialRows] = await Promise.all([
    db.select({ id: parties.id, name: parties.name, dispatchProSiteId: parties.dispatchProSiteId })
      .from(parties).where(eq(parties.isActive, 1)).orderBy(asc(parties.name)),
    db.select({ id: sites.id, name: sites.name, partyId: sites.partyId })
      .from(sites).where(eq(sites.isActive, 1)).orderBy(asc(sites.name)),
    db.select({ id: mixTemplates.id, name: mixTemplates.name, mixType: mixTemplates.mixType, partyId: mixTemplates.partyId })
      .from(mixTemplates).where(eq(mixTemplates.isActive, 1)).orderBy(asc(mixTemplates.name)),
    db.select({ id: plantMaterials.id, name: plantMaterials.name, defaultUom: plantMaterials.defaultUom })
      .from(plantMaterials).where(eq(plantMaterials.isActive, 1)).orderBy(asc(plantMaterials.name)),
  ]);
  return { parties: partyRows, sites: siteRows, mixes: templateRows, materials: materialRows };
}

export async function createPlantSupplyOrder(input: {
  partyId: number;
  siteId?: number | null;
  periodFrom: string;
  periodTo: string;
  orderNo?: string | null;
  remarks?: string | null;
  lines: Array<{ mixTemplateId: number; orderedMt: number; plannedMtPerDay?: number | null }>;
}, actor: { userId: number; name: string }) {
  const normalizedLines = input.lines.map((line, index) => ({
    mixTemplateId: line.mixTemplateId,
    orderedMt: Number(line.orderedMt),
    plannedMtPerDay: line.plannedMtPerDay == null ? null : Number(line.plannedMtPerDay),
    sortOrder: index,
  }));
  if (!normalizedLines.length) throw new Error("Add at least one mix line.");
  if (normalizedLines.some(line => !Number.isFinite(line.orderedMt) || line.orderedMt <= 0)) {
    throw new Error("Each mix must have an ordered quantity greater than zero.");
  }
  if (new Set(normalizedLines.map(line => line.mixTemplateId)).size !== normalizedLines.length) {
    throw new Error("Each mix can be listed only once.");
  }
  if (input.periodTo < input.periodFrom) throw new Error("The period end must be on or after the start.");

  const [party] = await db.select({ id: parties.id }).from(parties)
    .where(eq(parties.id, input.partyId)).limit(1);
  if (!party) throw new Error("Choose an active party.");
  if (input.siteId) {
    const [site] = await db.select({ id: sites.id, partyId: sites.partyId }).from(sites)
      .where(eq(sites.id, input.siteId)).limit(1);
    if (!site || (site.partyId != null && site.partyId !== input.partyId)) {
      throw new Error("Choose a site linked to this party.");
    }
  }

  const templateIds = normalizedLines.map(line => line.mixTemplateId);
  const templates = await db.select({ id: mixTemplates.id })
    .from(mixTemplates).where(inArray(mixTemplates.id, templateIds));
  if (templates.length !== templateIds.length) throw new Error("One or more mix templates are unavailable.");

  const created = await db.transaction(async (tx) => {
    const [order] = await tx.insert(plantSupplyOrders).values({
      orderNo: input.orderNo?.trim() || null,
      partyId: input.partyId,
      siteId: input.siteId ?? null,
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      remarks: input.remarks?.trim() || null,
      createdByUserId: actor.userId,
      createdByName: actor.name,
      updatedAt: new Date(),
    }).returning();
    if (!order) throw new Error("Could not create supply order.");

    const generatedNo = input.orderNo?.trim() || `HLC/PO-HMP/${fyLabel(input.periodFrom)}/${String(order.id).padStart(4, "0")}`;
    const [numberedOrder] = await tx.update(plantSupplyOrders).set({ orderNo: generatedNo })
      .where(eq(plantSupplyOrders.id, order.id)).returning();
    await tx.insert(plantSupplyOrderLines).values(normalizedLines.map(line => ({
      ...line,
      orderId: order.id,
      orderedMt: String(line.orderedMt),
      plannedMtPerDay: line.plannedMtPerDay == null ? null : String(line.plannedMtPerDay),
    })));

    const components = await tx.select({ materialId: mixTemplateComponents.materialId })
      .from(mixTemplateComponents).where(inArray(mixTemplateComponents.templateId, templateIds));
    const [bitumen] = await tx.select({ id: plantMaterials.id }).from(plantMaterials)
      .where(sql`UPPER(${plantMaterials.name}) LIKE '%BITUMEN%'`).limit(1);
    const [ldo] = await tx.select({ id: plantMaterials.id }).from(plantMaterials)
      .where(sql`UPPER(TRIM(${plantMaterials.name})) = 'LDO'`).limit(1);
    const materialIds = Array.from(new Set([
      ...components.map(row => row.materialId),
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
      },
    });
    return numberedOrder ?? order;
  });
  return getPlantSupplyOrder(created.id);
}

export async function listPlantSupplyOrders() {
  const orders = await db.select({ id: plantSupplyOrders.id })
    .from(plantSupplyOrders).orderBy(desc(plantSupplyOrders.createdAt));
  return Promise.all(orders.map(row => getPlantSupplyOrder(row.id)));
}

export async function getPlantSupplyOrder(orderId: number) {
  const [order] = await db.select({
    id: plantSupplyOrders.id,
    orderNo: plantSupplyOrders.orderNo,
    partyId: plantSupplyOrders.partyId,
    partyName: parties.name,
    dispatchProSiteId: parties.dispatchProSiteId,
    siteId: plantSupplyOrders.siteId,
    siteName: sites.name,
    periodFrom: plantSupplyOrders.periodFrom,
    periodTo: plantSupplyOrders.periodTo,
    remarks: plantSupplyOrders.remarks,
    status: plantSupplyOrders.status,
    createdAt: plantSupplyOrders.createdAt,
  }).from(plantSupplyOrders)
    .innerJoin(parties, eq(parties.id, plantSupplyOrders.partyId))
    .leftJoin(sites, eq(sites.id, plantSupplyOrders.siteId))
    .where(eq(plantSupplyOrders.id, orderId)).limit(1);
  if (!order) return null;

  const lines = await db.select({
    id: plantSupplyOrderLines.id,
    mixTemplateId: plantSupplyOrderLines.mixTemplateId,
    mixName: mixTemplates.name,
    mixType: mixTemplates.mixType,
    orderedMt: plantSupplyOrderLines.orderedMt,
    plannedMtPerDay: plantSupplyOrderLines.plannedMtPerDay,
    sortOrder: plantSupplyOrderLines.sortOrder,
  }).from(plantSupplyOrderLines)
    .innerJoin(mixTemplates, eq(mixTemplates.id, plantSupplyOrderLines.mixTemplateId))
    .where(eq(plantSupplyOrderLines.orderId, orderId))
    .orderBy(asc(plantSupplyOrderLines.sortOrder), asc(plantSupplyOrderLines.id));

  const [dispatchRows, scopeRows, templateRows, componentRows, materialRows] = await Promise.all([
    db.select({
      id: truckDispatches.id,
      date: truckDispatches.date,
      mixTemplateId: truckDispatches.mixTemplateId,
      loadWeight: truckDispatches.loadWeight,
    }).from(truckDispatches).where(eq(truckDispatches.supplyOrderId, orderId)),
    db.select().from(plantSupplyOrderMaterialScopes).where(eq(plantSupplyOrderMaterialScopes.orderId, orderId)),
    db.select().from(mixTemplates).where(inArray(mixTemplates.id, lines.map(line => line.mixTemplateId))),
    db.select().from(mixTemplateComponents).where(inArray(mixTemplateComponents.templateId, lines.map(line => line.mixTemplateId))),
    db.select().from(plantMaterials),
  ]);
  const { storage } = await import("./storage");
  const balanceRows = await storage.getStockBalances();
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
  const dispatchInputs: SupplyDispatch[] = dispatchRows.map(row => ({
    date: row.date,
    mixTemplateId: row.mixTemplateId,
    loadWeight: finite(row.loadWeight),
  }));
  const dispatched = dispatchedByMix(lineInputs, dispatchInputs);
  const needs = orderMaterialNeeds(
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
    materialRows.map(row => ({ id: row.id, name: row.name })),
    dispatched,
  );

  const ownPartySetting = await db.select({ value: appSettings.value }).from(appSettings)
    .where(eq(appSettings.key, "own_company_party_id")).limit(1);
  const hlcPartyId = ownPartySetting[0]?.value ? Number(ownPartySetting[0].value) : null;
  const scopeByMaterial = new Map(scopeRows.map(row => [row.materialId, row.scope]));
  const materialById = new Map(materialRows.map(row => [row.id, row]));
  const stockByKey = new Map(balanceRows.map(row => [`${row.partyId ?? "common"}:${row.materialId}`, row]));
  const dailyMix = dailyMixTonnes(lineInputs, recentDispatches.map(row => ({
    date: row.date,
    mixTemplateId: row.mixTemplateId,
    loadWeight: finite(row.loadWeight),
  })));
  const dailyNeeds = orderMaterialNeeds(
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
    materialRows.map(row => ({ id: row.id, name: row.name })),
    new Map(),
  );
  const dailyNeedById = new Map(dailyNeeds.map(row => [row.materialId, row.quantity]));
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
  const lineResults = lines.map(line => {
    const dispatchedMt = dispatched.get(line.mixTemplateId) ?? 0;
    return {
      ...line,
      orderedMt: finite(line.orderedMt),
      plannedMtPerDay: line.plannedMtPerDay == null ? null : finite(line.plannedMtPerDay),
      dispatchedMt,
      balanceMt: Math.max(0, finite(line.orderedMt) - dispatchedMt),
    };
  });
  return {
    ...order,
    lines: lineResults,
    materials,
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
  const defaults: SupplyAlertSettings = {
    running_low: {
      roles: [...DEFAULT_ALERT_SETTINGS.running_low.roles, ...operatorRecipients.roles],
      userIds: operatorRecipients.userIds,
    },
    exhausted: {
      roles: [...DEFAULT_ALERT_SETTINGS.exhausted.roles, ...operatorRecipients.roles],
      userIds: operatorRecipients.userIds,
    },
    borrowed: {
      roles: [...DEFAULT_ALERT_SETTINGS.borrowed.roles, ...operatorRecipients.roles],
      userIds: operatorRecipients.userIds,
    },
  };
  const stored = jsonValue<Partial<SupplyAlertSettings>>(row?.value, {});
  return {
    running_low: normalizeRecipientChoice(stored.running_low, defaults.running_low),
    exhausted: normalizeRecipientChoice(stored.exhausted, defaults.exhausted),
    borrowed: normalizeRecipientChoice(stored.borrowed, defaults.borrowed),
  };
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
      value: JSON.stringify(normalized),
    }).onConflictDoUpdate({
      target: appSettings.key,
      set: { value: JSON.stringify(normalized), updatedAt: new Date() },
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
  if (kind === "borrowed") {
    const ownerRows = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.isActive, true), eq(users.isOwner, true)));
    ownerRows.forEach(row => userIds.add(row.id));
  }
  return Array.from(userIds);
}

export async function createSupplyAlertDeliveries(input: {
  dedupeKey: string;
  kind: SupplyAlertKind;
  title: string;
  message: string;
  partyId?: number | null;
  materialId?: number | null;
}) {
  const recipientIds = await resolveSupplyAlertRecipients(input.kind);
  if (!recipientIds.length) return [];
  const inserted = await db.insert(plantSupplyAlertDeliveries).values(recipientIds.map(recipientUserId => ({
    dedupeKey: input.dedupeKey,
    recipientUserId,
    alertType: input.kind,
    partyId: input.partyId ?? null,
    materialId: input.materialId ?? null,
    title: input.title,
    message: input.message,
  }))).onConflictDoNothing().returning({
    id: plantSupplyAlertDeliveries.id,
    recipientUserId: plantSupplyAlertDeliveries.recipientUserId,
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
      const created = await createSupplyAlertDeliveries({
        dedupeKey: `supply-exhausted:${dispatchId}:${row.materialId}`,
        kind: "exhausted",
        title: "Party material stock exhausted",
        message: `${order.partyName} — ${materialName} finished${dispatch?.truckNumber ? ` at truck ${dispatch.truckNumber}` : ""}${dispatch?.time ? `, ${dispatch.time}` : ""}.`,
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
        message: `${order.partyName} — ${row.materialName} ${row.stockAvailable.toFixed(3)} ${row.uom} left; less than one production day.`,
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
      message: `${order.partyName}: ${row.quantity.toFixed(3)} ${row.uom} ${row.materialName} borrowed from HLC; approval is pending.`,
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
  const created: Array<{ id: number; recipientUserId: number; title: string; message: string }> = [];
  for (let index = 0; index < openOrders.length; index += 1) {
    const order = await getPlantSupplyOrder(openOrders[index].id);
    if (!order) continue;
    const message = formatPlantSupplyMorningSummary({
      orderNo: order.orderNo ?? "Supply order",
      lines: order.lines.map((line: any) => ({ mixName: line.mixName, balanceMt: line.balanceMt })),
      materials: order.materials.map((material: any) => ({
        materialName: material.materialName,
        daysLeft: material.daysLeft,
      })),
    });
    created.push(...await createSupplyAlertDeliveries({
      dedupeKey: `supply-morning:${order.id}:${dateKey}`,
      kind: "morning_summary",
      title: `Morning supply summary — ${order.partyName}`,
      message,
      partyId: order.partyId,
    }));
  }
  return created;
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
