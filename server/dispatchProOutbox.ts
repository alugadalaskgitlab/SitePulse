import { and, desc, eq, inArray } from "drizzle-orm";
import crypto from "node:crypto";
import { db, pool } from "./db";
import { dispatchProOutbox, mixTemplates, parties, truckDispatches } from "@shared/schema";

type DispatchOperation = "create" | "patch" | "cancel";
type DispatchRecord = typeof truckDispatches.$inferSelect;
type DispatchSite = { id: string; name: string };

const DISPATCHPRO_DISPATCHES_PATH = "/api/integrations/sitepulse/dispatches";
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
  return rows
    .filter((row: any) => row && (typeof row.id === "string" || typeof row.id === "number") && typeof row.name === "string")
    .map((row: any) => ({ id: String(row.id), name: row.name.trim() }))
    .filter((row: DispatchSite) => row.id && row.name)
    .sort((a: DispatchSite, b: DispatchSite) => a.name.localeCompare(b.name));
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

async function linkedSiteId(partyId: number): Promise<string | null> {
  const [party] = await db.select({ dispatchProSiteId: parties.dispatchProSiteId })
    .from(parties).where(eq(parties.id, partyId)).limit(1);
  return party?.dispatchProSiteId?.trim() || null;
}

export async function enqueueDispatchProChange(dispatchId: number, operation: "create" | "patch") {
  const [dispatch] = await db.select().from(truckDispatches).where(eq(truckDispatches.id, dispatchId)).limit(1);
  if (!dispatch) return { queued: false, reason: "dispatch_not_found" };
  const siteId = await linkedSiteId(dispatch.partyId);
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

export async function enqueueDispatchProCancellation(dispatch: Pick<DispatchRecord, "id" | "partyId">) {
  const siteId = await linkedSiteId(dispatch.partyId);
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
      `SELECT id, dispatch_id, external_ref, operation, payload, attempt_count, created_at
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

async function markOutbox(row: ClaimedDispatchProOutbox, status: "sent" | "retry" | "failed", error?: string) {
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
  }).where(eq(dispatchProOutbox.id, row.id));
  if (finalStatus === "sent") return;
  const dispatchProSyncStatus = finalStatus === "retry"
    ? "waiting"
    : row.operation === "create" ? "not_sent" : "not_updated";
  await db.update(truckDispatches).set({
    dispatchProSyncStatus,
    dispatchProLastError: error?.slice(0, 500) ?? (expired ? "Retry window expired after 24 hours." : null),
  }).where(eq(truckDispatches.id, row.dispatch_id));
}

export async function sendDispatchProOutboxRow(row: ClaimedDispatchProOutbox) {
  const config = dispatchProConfig();
  if (!config) {
    await db.update(dispatchProOutbox).set({
      status: "pending",
      nextAttemptAt: new Date(Date.now() + 60_000),
      lastError: null,
      updatedAt: new Date(),
    }).where(eq(dispatchProOutbox.id, row.id));
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
