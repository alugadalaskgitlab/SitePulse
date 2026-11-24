import { and, desc, eq, inArray } from "drizzle-orm";
import crypto from "node:crypto";
import { db, pool } from "./db";
import {
  auditLogs,
  dispatchProOutbox,
  mixTemplates,
  parties,
  plantSupplyOrders,
  sites,
  truckDispatches,
} from "@shared/schema";

type DispatchOperation = "create" | "patch" | "cancel" | "order";
type DispatchRecord = typeof truckDispatches.$inferSelect;
type DispatchSite = { id: string; name: string };

const DISPATCHPRO_DISPATCHES_PATH = "/api/integrations/sitepulse/dispatches";
const DISPATCHPRO_ORDERS_PATH = "/api/integrations/sitepulse/orders";
const MAX_RETRY_AGE_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12_000;

function dispatchProConfig() {
  const baseUrl = process.env.DISPATCHPRO_BASE_URL?.trim() || "https://delivery-tracker-pro-8shmmcw622.replit.app";
  const sharedSecret = process.env.SITEPULSE_SHARED_SECRET?.trim();
  if (!baseUrl || !sharedSecret) return null;
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:" && parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") return null;
    return { baseUrl: parsed.origin, sharedSecret };
  } catch {
    return null;
  }
}

export function dispatchProKeyMatches(provided: unknown): boolean {
  const expected = process.env.SITEPULSE_SHARED_SECRET?.trim() ?? "";
  if (!expected || typeof provided !== "string" || !provided) return false;
  const expectedDigest = crypto.createHash("sha256").update(expected).digest();
  const providedDigest = crypto.createHash("sha256").update(provided).digest();
  return crypto.timingSafeEqual(expectedDigest, providedDigest) && expected.length === provided.length;
}

export async function getDispatchProSites(): Promise<DispatchSite[]> {
  const config = dispatchProConfig();
  if (!config) throw new Error("DispatchPro is not configured. Set SITEPULSE_SHARED_SECRET and optionally DISPATCHPRO_BASE_URL.");
  const url = new URL("/api/integrations/sitepulse/sites", config.baseUrl);
  const response = await fetch(url, {
    headers: { "X-SitePulse-Key": config.sharedSecret },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`DispatchPro sites request failed (${response.status}).`);
  const body = await response.json() as any;
  const rows = Array.isArray(body)
    ? body
    : Array.isArray(body?.sites)
      ? body.sites
      : Array.isArray(body?.data?.sites)
        ? body.data.sites
        : Array.isArray(body?.data)
          ? body.data
          : [];
  const sites = new Map<string, DispatchSite>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const id = row.id ?? row.siteId;
    const name = row.name ?? row.siteName ?? row.siteCode;
    if ((typeof id !== "string" && typeof id !== "number") || typeof name !== "string") continue;
    const normalized = { id: String(id).trim(), name: name.trim() };
    if (normalized.id && normalized.name && !sites.has(normalized.id)) {
      sites.set(normalized.id, normalized);
    }
  }
  return [...sites.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function dispatchPayload(dispatch: DispatchRecord, siteId: string, mixType: string) {
  return {
    externalRef: `SP-${dispatch.id}`,
    siteId,
    vehicleNo: dispatch.truckNumber,
    loadMT: Number(dispatch.loadWeight),
    driverName: dispatch.driverName ?? null,
    driverMobile: (dispatch as any).driverMobile ?? null,
    mixType,
  };
}

async function linkedSiteId(partyId: number, supplyOrderId?: number | null): Promise<string | null> {
  if (supplyOrderId) {
    const [order] = await db.select({
      siteDispatchProSiteId: sites.dispatchProSiteId,
      partyDispatchProSiteId: parties.dispatchProSiteId,
    }).from(plantSupplyOrders)
      .innerJoin(parties, eq(parties.id, plantSupplyOrders.partyId))
      .leftJoin(sites, eq(sites.id, plantSupplyOrders.siteId))
      .where(and(eq(plantSupplyOrders.id, supplyOrderId), eq(plantSupplyOrders.partyId, partyId)))
      .limit(1);
    const siteId = order?.siteDispatchProSiteId?.trim();
    if (siteId) return siteId;
    const orderPartyId = order?.partyDispatchProSiteId?.trim();
    if (orderPartyId) return orderPartyId;
  }
  const [party] = await db.select({ dispatchProSiteId: parties.dispatchProSiteId })
    .from(parties).where(eq(parties.id, partyId)).limit(1);
  return party?.dispatchProSiteId?.trim() || null;
}

export async function enqueueDispatchProChange(dispatchId: number, operation: "create" | "patch") {
  const [dispatch] = await db.select().from(truckDispatches).where(eq(truckDispatches.id, dispatchId)).limit(1);
  if (!dispatch) return { queued: false, reason: "dispatch_not_found" };
  const siteId = await linkedSiteId(dispatch.partyId, dispatch.supplyOrderId);
  if (!siteId) return { queued: false, reason: "party_not_linked" };
  const [template] = await db.select({ name: mixTemplates.name })
    .from(mixTemplates).where(eq(mixTemplates.id, dispatch.mixTemplateId)).limit(1);
  const payload = dispatchPayload(dispatch, siteId, template?.name ?? `Mix #${dispatch.mixTemplateId}`);
  if (operation === "patch") {
    const [queuedCreate] = await db.select().from(dispatchProOutbox)
      .where(and(
        eq(dispatchProOutbox.dispatchId, dispatchId),
        eq(dispatchProOutbox.operation, "create"),
        inArray(dispatchProOutbox.status, ["pending", "retry", "failed"]),
      ))
      .orderBy(desc(dispatchProOutbox.id)).limit(1);
    const [queuedPatch] = queuedCreate ? [] : await db.select().from(dispatchProOutbox)
      .where(and(
        eq(dispatchProOutbox.dispatchId, dispatchId),
        eq(dispatchProOutbox.operation, "patch"),
        inArray(dispatchProOutbox.status, ["pending", "retry", "failed"]),
      ))
      .orderBy(desc(dispatchProOutbox.id)).limit(1);
    const pendingChange = queuedCreate || queuedPatch;
    if (pendingChange) {
      await db.update(dispatchProOutbox).set({
        payload,
        updatedAt: new Date(),
      }).where(eq(dispatchProOutbox.id, pendingChange.id));
      if (pendingChange.status !== "failed") {
        await db.update(truckDispatches).set({
          dispatchProSyncStatus: "waiting",
          dispatchProLastError: null,
        }).where(eq(truckDispatches.id, dispatchId));
      }
      return { queued: pendingChange.status !== "failed", externalRef: payload.externalRef, coalesced: true };
    }
    if (!dispatch.dispatchProId) {
      return { queued: false, reason: "dispatch_not_sent" };
    }
  }
  await db.insert(dispatchProOutbox).values({
    dispatchId,
    externalRef: payload.externalRef,
    operation,
    payload,
    status: "pending",
    nextAttemptAt: new Date(),
  });
  await db.update(truckDispatches).set({
    dispatchProSyncStatus: "waiting",
    dispatchProLastError: null,
  }).where(eq(truckDispatches.id, dispatchId));
  return { queued: true, externalRef: payload.externalRef };
}

export function buildSupplyOrderDispatchProPayload(order: any) {
  return {
    externalRef: `SP-ORDER-${order.id}`,
    partyId: order.partyId,
    partyName: order.partyName,
    siteId: order.siteId ?? null,
    siteName: order.siteName ?? null,
    orderNo: order.orderNo,
    mixLines: (order.lines ?? []).map((line: any) => {
      const now = Date.now();
      const activeVersion = (line.mixVersions ?? [])
        .filter((version: any) => version.effectiveAt == null || new Date(version.effectiveAt).getTime() <= now)
        .sort((a: any, b: any) => new Date(a.effectiveAt ?? 0).getTime() - new Date(b.effectiveAt ?? 0).getTime())
        .at(-1);
      const activeMix = activeVersion ?? line.orderMix;
      return {
        mixTemplateId: line.mixTemplateId,
        mixName: activeMix?.mixName ?? line.mixName,
        orderedMt: Number(line.orderedMt) || 0,
        enteredQuantity: line.enteredQuantity == null ? null : Number(line.enteredQuantity),
        enteredUnit: line.enteredUnit ?? null,
        plannedMtPerDay: line.plannedMtPerDay == null ? null : Number(line.plannedMtPerDay),
        orderMix: activeMix ? {
          mixName: activeMix.mixName,
          sourceBitumenPercent: Number(activeMix.sourceBitumenPercent) || 0,
          bitumenPercent: Number(activeMix.bitumenPercent) || 0,
          ldoNorm: activeMix.ldoNorm == null ? null : Number(activeMix.ldoNorm),
          components: (activeMix.components ?? []).map((component: any) => ({
            materialId: component.materialId,
            materialName: component.materialName ?? null,
            aggregateSharePercent: Number(component.aggregateSharePercent) || 0,
          })),
        } : null,
      };
    }),
    periodFrom: order.periodFrom,
    periodTo: order.periodTo,
    status: order.status,
  };
}

export async function enqueueSupplyOrderDispatchPro(order: any) {
  if (!order?.id || !order.partyId || !order.orderNo) {
    return { queued: false, reason: "order_not_ready" };
  }
  const payload = buildSupplyOrderDispatchProPayload(order);
  const externalRef = payload.externalRef;
  const [latest] = await db.select().from(dispatchProOutbox)
    .where(eq(dispatchProOutbox.supplyOrderId, order.id))
    .orderBy(desc(dispatchProOutbox.id)).limit(1);

  if (latest && ["pending", "retry", "failed"].includes(latest.status)) {
    await db.update(dispatchProOutbox).set({
      operation: "order",
      externalRef,
      payload,
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: new Date(),
      lastError: null,
      responseSiteId: null,
      responseSiteName: null,
      linkChoice: null,
      updatedAt: new Date(),
      completedAt: null,
    }).where(eq(dispatchProOutbox.id, latest.id));
    return { queued: true, externalRef, coalesced: true };
  }

  await db.insert(dispatchProOutbox).values({
    dispatchId: 0,
    supplyOrderId: order.id,
    externalRef,
    operation: "order",
    payload,
    status: "pending",
    nextAttemptAt: new Date(),
  });
  return { queued: true, externalRef };
}

export async function resolveSupplyOrderDispatchProLink(
  orderId: number,
  choice: "use_existing" | "replace",
  actor: { userId: number; name: string },
) {
  return db.transaction(async (tx) => {
    const [order] = await tx.select({
      id: plantSupplyOrders.id,
      partyId: plantSupplyOrders.partyId,
      siteId: plantSupplyOrders.siteId,
    }).from(plantSupplyOrders)
      .where(eq(plantSupplyOrders.id, orderId)).limit(1);
    if (!order) throw new Error("Plant supply order not found.");
    if (!order.siteId) throw new Error("This order has no SitePulse site to link.");

    const [latest] = await tx.select({
      status: dispatchProOutbox.status,
      responseSiteId: dispatchProOutbox.responseSiteId,
      responseSiteName: dispatchProOutbox.responseSiteName,
      id: dispatchProOutbox.id,
    }).from(dispatchProOutbox)
      .where(eq(dispatchProOutbox.supplyOrderId, orderId))
      .orderBy(desc(dispatchProOutbox.id)).limit(1);
    if (latest?.status !== "sent" || !latest.responseSiteId) {
      throw new Error("DispatchPro has not returned a site id for this order yet.");
    }
    const [party] = await tx.select({
      name: parties.name,
      dispatchProSiteId: parties.dispatchProSiteId,
    }).from(parties).where(eq(parties.id, order.partyId)).for("update").limit(1);
    const [site] = await tx.select({
      name: sites.name,
      dispatchProSiteId: sites.dispatchProSiteId,
    }).from(sites).where(eq(sites.id, order.siteId)).for("update").limit(1);
    if (!party || !site) throw new Error("The linked party or site no longer exists.");

    const partyLink = party.dispatchProSiteId?.trim() || null;
    const siteLink = site.dispatchProSiteId?.trim() || null;
    const target = choice === "replace"
      ? latest.responseSiteId
      : (partyLink && partyLink !== latest.responseSiteId)
        ? partyLink
        : (siteLink && siteLink !== latest.responseSiteId)
          ? siteLink
          : partyLink ?? siteLink;
    if (!target) throw new Error("There is no existing DispatchPro site to use.");

    if (choice === "replace" && partyLink && partyLink !== latest.responseSiteId) {
      await tx.update(parties).set({ dispatchProSiteId: latest.responseSiteId })
        .where(eq(parties.id, order.partyId));
    }
    await tx.update(sites).set({ dispatchProSiteId: target }).where(eq(sites.id, order.siteId));
    await tx.update(dispatchProOutbox).set({ linkChoice: choice, updatedAt: new Date() })
      .where(eq(dispatchProOutbox.id, latest.id));
    await tx.insert(auditLogs).values({
      module: "plant_supply_order",
      transactionId: orderId,
      action: "dispatchpro_site_link_choice",
      userId: actor.userId,
      userName: actor.name,
      userRole: "owner",
      oldValues: {
        siteId: order.siteId,
        siteName: site.name,
        siteDispatchProSiteId: siteLink,
        partyId: order.partyId,
        partyName: party.name,
        partyDispatchProSiteId: partyLink,
      },
      newValues: {
        siteId: order.siteId,
        siteName: site.name,
        dispatchProSiteId: target,
        choice,
        proposedDispatchProSiteId: latest.responseSiteId,
        proposedDispatchProSiteName: latest.responseSiteName,
        partyId: order.partyId,
        partyName: party.name,
        partyDispatchProSiteId: choice === "replace" && partyLink ? latest.responseSiteId : partyLink,
      },
    });
    return { dispatchProSiteId: target };
  });
}

export async function enqueueDispatchProCancellation(
  dispatch: Pick<DispatchRecord, "id" | "partyId"> & Partial<Pick<DispatchRecord, "supplyOrderId">>,
) {
  const siteId = await linkedSiteId(dispatch.partyId, dispatch.supplyOrderId);
  if (!siteId) return { queued: false, reason: "party_not_linked" };
  const externalRef = `SP-${dispatch.id}`;
  await db.insert(dispatchProOutbox).values({
    dispatchId: dispatch.id,
    externalRef,
    operation: "cancel",
    payload: { externalRef, cancelled: true },
    status: "pending",
    nextAttemptAt: new Date(),
  });
  return { queued: true, externalRef };
}

export async function retryDispatchProChange(dispatchId: number) {
  const [row] = await db.select().from(dispatchProOutbox)
    .where(and(eq(dispatchProOutbox.dispatchId, dispatchId), eq(dispatchProOutbox.status, "failed")))
    .orderBy(desc(dispatchProOutbox.id)).limit(1);
  if (!row) return false;
  await db.update(dispatchProOutbox).set({
    status: "pending",
    attemptCount: 0,
    nextAttemptAt: new Date(),
    lastError: null,
    updatedAt: new Date(),
    completedAt: null,
  }).where(eq(dispatchProOutbox.id, row.id));
  await db.update(truckDispatches).set({
    dispatchProSyncStatus: "waiting",
    dispatchProLastError: null,
  }).where(eq(truckDispatches.id, dispatchId));
  return true;
}

export type ClaimedDispatchProOutbox = {
  id: number;
  dispatch_id: number;
  supply_order_id: number | null;
  external_ref: string;
  operation: DispatchOperation;
  payload: Record<string, unknown>;
  attempt_count: number;
  created_at: Date;
};

async function claimNext(): Promise<ClaimedDispatchProOutbox | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query<ClaimedDispatchProOutbox>(
      `SELECT id, dispatch_id, supply_order_id, external_ref, operation, payload, attempt_count, created_at
         FROM dispatchpro_outbox
        WHERE ((status IN ('pending', 'retry') AND next_attempt_at <= now())
           OR (status = 'sending' AND updated_at < now() - interval '10 minutes'))
        ORDER BY id
        FOR UPDATE SKIP LOCKED
        LIMIT 1`,
    );
    const row = selected.rows[0];
    if (!row) {
      await client.query("COMMIT");
      return null;
    }
    await client.query(
      `UPDATE dispatchpro_outbox
          SET status='sending', attempt_count=attempt_count+1,
              last_attempt_at=now(), updated_at=now()
        WHERE id=$1`,
      [row.id],
    );
    await client.query("COMMIT");
    return { ...row, attempt_count: row.attempt_count + 1 };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function markOutbox(
  row: ClaimedDispatchProOutbox,
  status: "sent" | "retry" | "failed",
  error?: string,
  responseSite?: { id: string; name: string } | null,
) {
  const ageMs = Date.now() - new Date(row.created_at).getTime();
  const expired = ageMs >= MAX_RETRY_AGE_MS;
  const finalStatus = status === "retry" && expired ? "failed" : status;
  const delayMs = Math.min(60_000 * 2 ** Math.max(0, row.attempt_count - 1), 60 * 60 * 1000);
  await db.update(dispatchProOutbox).set({
    status: finalStatus,
    lastError: error?.slice(0, 500) ?? null,
    nextAttemptAt: new Date(Date.now() + delayMs),
    updatedAt: new Date(),
    completedAt: finalStatus === "sent" || finalStatus === "failed" ? new Date() : null,
    ...(responseSite ? {
      responseSiteId: responseSite.id,
      responseSiteName: responseSite.name,
    } : {}),
  }).where(eq(dispatchProOutbox.id, row.id));
  if (row.supply_order_id != null) return;
  if (finalStatus === "sent") return;
  const dispatchProSyncStatus = finalStatus === "retry"
    ? "waiting"
    : row.operation === "create" ? "not_sent" : "not_updated";
  await db.update(truckDispatches).set({
    dispatchProSyncStatus,
    dispatchProLastError: error?.slice(0, 500) ?? (expired ? "Retry window expired after 24 hours." : null),
  }).where(eq(truckDispatches.id, row.dispatch_id));
}

function safeSupplyOrderError(responseStatus: number, error?: unknown) {
  if (/auth|token|credential|unauthor/i.test(String(error ?? ""))) {
    return "DispatchPro connection needs attention.";
  }
  if (responseStatus === 429 || responseStatus >= 500 || !responseStatus) {
    return "Could not reach DispatchPro. Try again.";
  }
  return "DispatchPro could not accept this order. Check the order details and retry.";
}

function returnedOrderSite(body: any): { id: string; name: string } | null {
  const result = body?.order ?? body?.data?.order ?? body?.data ?? body;
  const site = result?.site ?? result?.dispatchProSite ?? body?.site ?? body?.data?.site ?? {};
  const rawId = site.id ?? site.siteId ?? site.site_id ??
    result?.siteId ?? result?.dispatchProSiteId ?? result?.dispatchproSiteId ??
    body?.siteId ?? body?.dispatchProSiteId;
  if (rawId == null || String(rawId).trim() === "") return null;
  const name = site.siteCode ?? site.code ?? result?.siteCode ?? body?.siteCode ??
    site.name ?? site.siteName ?? result?.siteName ?? body?.siteName ?? String(rawId);
  return { id: String(rawId).trim(), name: String(name).trim() || String(rawId).trim() };
}

async function linkReturnedOrderSite(orderId: number, candidateSiteId: string) {
  const [order] = await db.select({
    partyId: plantSupplyOrders.partyId,
    siteId: plantSupplyOrders.siteId,
  }).from(plantSupplyOrders).where(eq(plantSupplyOrders.id, orderId)).limit(1);
  if (!order?.siteId) return;

  await db.transaction(async (tx) => {
    const [party] = await tx.select({ dispatchProSiteId: parties.dispatchProSiteId })
      .from(parties).where(eq(parties.id, order.partyId)).for("update").limit(1);
    const [site] = await tx.select({ dispatchProSiteId: sites.dispatchProSiteId })
      .from(sites).where(eq(sites.id, order.siteId!)).for("update").limit(1);
    if (!party || !site) return;
    const partyLink = party.dispatchProSiteId?.trim() || null;
    const siteLink = site.dispatchProSiteId?.trim() || null;
    if ((partyLink && partyLink !== candidateSiteId) || (siteLink && siteLink !== candidateSiteId)) return;
    await tx.update(sites).set({ dispatchProSiteId: candidateSiteId })
      .where(eq(sites.id, order.siteId!));
  });
}

async function sendSupplyOrderOutboxRow(row: ClaimedDispatchProOutbox, config: { baseUrl: string; sharedSecret: string }) {
  try {
    const response = await fetch(new URL(DISPATCHPRO_ORDERS_PATH, config.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SitePulse-Key": config.sharedSecret,
      },
      body: JSON.stringify(row.payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    if (!response.ok) {
      const error = safeSupplyOrderError(response.status, body?.message ?? body?.error);
      const permanent = response.status >= 400 && response.status < 500 && response.status !== 429;
      await markOutbox(row, permanent ? "failed" : "retry", error);
      return;
    }
    const site = returnedOrderSite(body);
    if (!site) {
      await markOutbox(row, "failed", "DispatchPro did not return a site id for this order. Retry.");
      return;
    }
    await markOutbox(row, "sent", undefined, site);
    await linkReturnedOrderSite(row.supply_order_id!, site.id);
  } catch {
    await markOutbox(row, "retry", "Could not reach DispatchPro. Try again.");
  }
}

export async function sendDispatchProOutboxRow(row: ClaimedDispatchProOutbox) {
  const config = dispatchProConfig();
  if (!config) {
    await db.update(dispatchProOutbox).set({
      status: "pending",
      nextAttemptAt: new Date(Date.now() + 60_000),
      lastError: row.supply_order_id != null ? "DispatchPro is not configured. Retry when the connection is available." : null,
      updatedAt: new Date(),
    }).where(eq(dispatchProOutbox.id, row.id));
    return;
  }
  if (row.supply_order_id != null || row.operation === "order") {
    await sendSupplyOrderOutboxRow(row, config);
    return;
  }
  const target = row.operation === "create"
    ? new URL(DISPATCHPRO_DISPATCHES_PATH, config.baseUrl)
    : new URL(`${DISPATCHPRO_DISPATCHES_PATH}/${encodeURIComponent(row.external_ref)}`, config.baseUrl);
  try {
    const response = await fetch(target, {
      method: row.operation === "create" ? "POST" : "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-SitePulse-Key": config.sharedSecret,
      },
      body: JSON.stringify(row.payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    let responseBody: any = null;
    try { responseBody = text ? JSON.parse(text) : null; } catch { responseBody = { message: text }; }
    if (response.ok) {
      await markOutbox(row, "sent");
      if (row.operation === "create") {
        const saved = responseBody?.dispatch ?? responseBody?.data?.dispatch ?? responseBody?.data ?? responseBody;
        const id = saved?.id ?? saved?.dispatchId;
        const challanNo = saved?.challanNo ?? saved?.challanNumber;
        await db.update(truckDispatches).set({
          dispatchProId: id == null ? null : String(id),
          dispatchProChallanNo: challanNo == null ? null : String(challanNo),
          dispatchProStatus: saved?.status == null ? "SENT" : String(saved.status),
          dispatchProSyncStatus: "sent",
          dispatchProLastError: null,
        }).where(eq(truckDispatches.id, row.dispatch_id));
      } else if (row.operation === "patch") {
        await db.update(truckDispatches).set({
          dispatchProSyncStatus: "sent",
          dispatchProLastError: null,
        }).where(eq(truckDispatches.id, row.dispatch_id));
      }
      return;
    }

    const message = String(responseBody?.message ?? responseBody?.error ?? `DispatchPro returned ${response.status}.`);
    const permanent = response.status >= 400 && response.status < 500 && response.status !== 429;
    await markOutbox(row, permanent ? "failed" : "retry", message);
  } catch (error: any) {
    await markOutbox(row, "retry", error?.message || "DispatchPro request failed.");
  }
}

let workerTimer: ReturnType<typeof setInterval> | null = null;
let workerBusy = false;

export function startDispatchProOutboxWorker() {
  if (workerTimer) return;
  const drain = async () => {
    if (workerBusy) return;
    workerBusy = true;
    try {
      // Keep operator requests independent of remote availability while ensuring
      // older queued items are picked up in a bounded batch.
      for (let i = 0; i < 10; i += 1) {
        const row = await claimNext();
        if (!row) break;
        await sendDispatchProOutboxRow(row);
      }
    } catch (error) {
      console.error("[DispatchPro] Outbox worker could not process queued dispatches.");
    } finally {
      workerBusy = false;
    }
  };
  void drain();
  workerTimer = setInterval(() => void drain(), 5_000);
  workerTimer.unref?.();
}

export function stopDispatchProOutboxWorker() {
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = null;
}
