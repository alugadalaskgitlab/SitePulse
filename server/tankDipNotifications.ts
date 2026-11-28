import { db } from "./db";
import { storage } from "./storage";
import { getUserById, loadUserPermissionsMatrix } from "./auth";
import { loadFeatureAccessState } from "./featureAccess";
import { can } from "@shared/featureAccess";
import { tankDipAlertDeliveries } from "@shared/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { sendPushToUser } from "./push";
import { dipWatchSettings, requiredDipTanks, tankBookStock, tankDipAlertHref, tankDipAlertType, type TankKind, type TankPlantSettings, type TankPositionRow, type TankDipRow } from "@shared/tankBookStock";
import { randomUUID } from "node:crypto";

export type TankRecipient = { id: number; active: boolean; owner: boolean; verify: boolean; enter: boolean; sites: number[] | null };
export function tankDipRecipients(users: TankRecipient[], siteId: number | null, includeOperators: boolean): number[] {
  return users.filter(user => user.active && (user.owner ||
    ((user.sites === null || (siteId != null && user.sites.includes(siteId))) && (user.verify || (includeOperators && user.enter)))))
    .map(user => user.id);
}
type Delivery = { dedupeKey: string; recipientIds: number[]; alertType: string; title: string; message: string };
export async function deliverTankDipNotification(input: Delivery) {
  if (!input.recipientIds.length) return;
  const rows = await db.insert(tankDipAlertDeliveries).values([...new Set(input.recipientIds)].map(recipientUserId => ({
    dedupeKey: input.dedupeKey, recipientUserId, alertType: input.alertType, title: input.title, message: input.message,
  }))).onConflictDoNothing().returning({ id: tankDipAlertDeliveries.id, recipientUserId: tankDipAlertDeliveries.recipientUserId });
  await Promise.allSettled(rows.map(row => sendPushToUser(row.recipientUserId, input.title, input.message, tankDipAlertHref(input.alertType) || undefined)));
}
export function getTankDipAlerts(userId: number) {
  return db.select().from(tankDipAlertDeliveries).where(eq(tankDipAlertDeliveries.recipientUserId, userId))
    .orderBy(desc(tankDipAlertDeliveries.createdAt)).limit(100);
}
export async function countUnreadTankDipAlerts(userId: number) {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(tankDipAlertDeliveries)
    .where(and(eq(tankDipAlertDeliveries.recipientUserId, userId), eq(tankDipAlertDeliveries.isRead, false)));
  return Number(row?.count ?? 0);
}
export async function markTankDipAlertsRead(userId: number, id?: number) {
  return db.update(tankDipAlertDeliveries).set({ isRead: true })
    .where(and(eq(tankDipAlertDeliveries.recipientUserId, userId), id == null ? undefined : eq(tankDipAlertDeliveries.id, id)))
    .returning({ id: tankDipAlertDeliveries.id });
}
export async function deleteTankDipAlert(userId: number, id: number) {
  return db.delete(tankDipAlertDeliveries)
    .where(and(eq(tankDipAlertDeliveries.recipientUserId, userId), eq(tankDipAlertDeliveries.id, id)))
    .returning({ id: tankDipAlertDeliveries.id });
}
export type TankDipDependencies = {
  settings(plant: string): Promise<TankPlantSettings | null>;
  positions(): Promise<TankPositionRow[]>;
  readings(kind: TankKind, plant: string, date: string): Promise<TankDipRow[]>;
  recipients(plant: string, includeOperators: boolean): Promise<number[]>;
  deliver(input: Delivery): Promise<unknown>;
  plants(): Promise<Array<TankPlantSettings & { plantName: string }>>;
  idleWithoutProduction(plant: string, date: string): Promise<boolean>;
  supervisors(plant: string, date: string): Promise<number[]>;
};
const defaultDependencies: TankDipDependencies = {
  settings: plant => storage.getPlantSettings(plant),
  positions: () => storage.getPackedStockPositionSummary(),
  readings: (kind, plant, date) => kind === "bitumen"
    ? storage.getBitumenDipReadings({ plantName: plant, dateFrom: date, dateTo: date })
    : storage.getLdoDipReadings({ plant, dateFrom: date, dateTo: date }),
  recipients: async (plant, includeOperators) => {
    const settings = await storage.getPlantSettings(plant);
    const directory = await storage.getUsersDirectory();
    const facts = await Promise.all(directory.map(async item => {
      const user = await getUserById(item.id);
      if (!user || !user.isActive) return null;
      if (user.isOwner) return { id: user.id, active: true, owner: true, verify: true, enter: true, sites: null };
      const state = await loadFeatureAccessState(user.id, await loadUserPermissionsMatrix(user.id));
      return {
        id: user.id, active: true, owner: false,
        verify: can(user, "hmp_rmc", "verify", state),
        enter: can(user, "plant_receipts", "add", state),
        sites: await storage.getUserPermittedSiteIds(user.id, !!state.rolesConfigured),
      };
    }));
    return tankDipRecipients(facts.filter((user): user is NonNullable<typeof user> => !!user), settings?.siteId ?? null, includeOperators);
  },
  deliver: deliverTankDipNotification,
  plants: async () => {
    const rows = await storage.listPlantSettings();
    const name = await storage.getDefaultPlantName();
    return rows.some(row => row.plantName === name) ? rows : [...rows, { plantName: name }];
  },
  idleWithoutProduction: async (plant, date) => {
    const log = await storage.getPlantShiftLogByDate(date, undefined, plant);
    if (!log?.noMainPlantOps) return false;
    const trucks = await storage.getTruckDispatches({ dateFrom: date, dateTo: date });
    return !trucks.some(row => row.plantName === plant && Number(row.loadWeight) > 0);
  },
  supervisors: async (plant, date) => {
    const log = await storage.getPlantShiftLogByDate(date, undefined, plant);
    const normalize = (name: string) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
    const name = normalize(log?.supervisorName || "");
    if (!name) return [];
    const staff = (await storage.getPersonnel(true)).filter(row => normalize(row.name) === name);
    if (staff.length !== 1) {
      console.warn("[TankDip] No unique linked supervisor; after-dip alert will still go to the saver.");
      return [];
    }
    const settings = await storage.getPlantSettings(plant);
    const ids: number[] = [];
    for (const entry of await storage.getUsersDirectory()) {
      const user = await getUserById(entry.id);
      if (!user?.isActive || user.personnelId !== staff[0].id) continue;
      if (user.isOwner) { ids.push(user.id); continue; }
      const state = await loadFeatureAccessState(user.id, await loadUserPermissionsMatrix(user.id));
      const sites = await storage.getUserPermittedSiteIds(user.id, !!state.rolesConfigured);
      if (sites === null || (settings?.siteId != null && sites.includes(settings.siteId))) ids.push(user.id);
    }
    return ids;
  },
};

export function createTankDipNotifications(deps: TankDipDependencies = defaultDependencies) {
  let lastReminderMinute = "";
  async function notifyStart(input: { id: number; date: string; plantName: string }) {
    const [settings, positions, bitumen, ldo, recipients] = await Promise.all([
      deps.settings(input.plantName), deps.positions(), deps.readings("bitumen", input.plantName, input.date),
      deps.readings("ldo", input.plantName, input.date), deps.recipients(input.plantName, false),
    ]);
    const required = requiredDipTanks(settings);
    for (const kind of ["bitumen", "ldo"] as const) {
      const rows = (kind === "bitumen" ? bitumen : ldo).filter(row => row.date === input.date && row.readingType === "opening");
      const missing = required.filter(spec => spec.kind === kind && !rows.some(row => row.tankNumber === spec.tank));
      if (missing.length) {
        await deps.deliver({
          dedupeKey: `tank-dip:start:${input.id}:${kind}`, recipientIds: recipients,
          alertType: tankDipAlertType(kind, missing[0].tank, "opening", input.plantName, input.date),
          title: "Opening tank dips missing",
          message: `Plant started on ${input.date} without ${kind === "ldo" ? "LDO" : "bitumen"} dip readings for ${missing.map(row => `Tank ${row.tank}`).join(", ")}.`,
        });
      }
      for (const spec of required.filter(spec => spec.kind === kind)) {
        const state = tankBookStock({ kind, tank: spec.tank, settings, positions, readings: rows, plantName: input.plantName, defaultPlantName: input.plantName });
        if (!state.overLimit || state.difference == null) continue;
        await deps.deliver({
          dedupeKey: `tank-dip:difference:${input.id}:${kind}:${spec.tank}`, recipientIds: recipients,
          alertType: tankDipAlertType(kind, spec.tank, "tracker", input.plantName, input.date),
          title: "Tank dip differs from book",
          message: `${kind === "ldo" ? "LDO" : "Bitumen"} tank ${spec.tank} dip differs from book by ${Math.abs(state.difference).toFixed(kind === "ldo" ? 1 : 3)} ${kind === "ldo" ? "L" : "MT"}`,
        });
      }
    }
  }
  async function runReminders(now: Date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now);
    const part = (type: string) => parts.find(row => row.type === type)!.value;
    const date = `${part("year")}-${part("month")}-${part("day")}`;
    const time = `${part("hour")}:${part("minute")}`;
    const minuteKey = `${date}T${time}`;
    if (minuteKey === lastReminderMinute) return;
    lastReminderMinute = minuteKey;
    for (const settings of await deps.plants()) {
      const watch = dipWatchSettings(settings);
      const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
      const elapsed = minutes(time) - minutes(watch.firstReminder);
      if (elapsed < 0 || time > watch.lastReminder || elapsed % (watch.repeatHours * 60) !== 0) continue;
      if (await deps.idleWithoutProduction(settings.plantName, date)) continue;
      const required = requiredDipTanks(settings);
      if (!required.length) continue;
      const [bitumen, ldo] = await Promise.all([
        deps.readings("bitumen", settings.plantName, date), deps.readings("ldo", settings.plantName, date),
      ]);
      const missing = required.filter(spec => !(spec.kind === "bitumen" ? bitumen : ldo).some(row =>
        row.date === date && row.tankNumber === spec.tank && row.readingType === "opening"));
      if (!missing.length) continue;
      const message = `Enter today's dip readings: ${missing.map(spec => `${spec.kind === "bitumen" ? "Bitumen" : "LDO"} tank ${spec.tank}`).join(", ")}`;
      await deps.deliver({
        dedupeKey: `tank-dip:reminder:${settings.plantName}:${minuteKey}`,
        recipientIds: await deps.recipients(settings.plantName, true),
        alertType: tankDipAlertType(missing[0].kind, missing[0].tank, "opening", settings.plantName, date),
        title: "Opening tank dip reminder", message,
      });
    }
  }
  async function afterTankReceipt(input: { kind: TankKind; tank: 1 | 2; plantName: string; date: string; eventId: string; actorUserId: number }) {
    let supervisors: number[] = [];
    try { supervisors = await deps.supervisors(input.plantName, input.date); }
    catch (error: any) { console.warn("[TankDip] Supervisor lookup failed; notifying the saver:", error?.message || error); }
    const ids = [input.actorUserId, ...supervisors];
    await deps.deliver({
      dedupeKey: `tank-dip:after:${input.eventId}`, recipientIds: [...new Set(ids)],
      alertType: tankDipAlertType(input.kind, input.tank, "adhoc", input.plantName, input.date),
      title: "Take the after-dip",
      message: `Take the after-dip for ${input.kind === "bitumen" ? "Bitumen" : "LDO"} tank ${input.tank}`,
    });
  }
  return { notifyStart, runReminders, afterTankReceipt };
}
export const notifyPlantLogStart = (input: { id: number; date: string; plantName: string }) => createTankDipNotifications().notifyStart(input);
export async function notifyTankAfterReceipt(input: {
  eventId?: string; materialId: number; tankNumber?: number | null; packedCount?: number | null;
  plantName?: string | null; date: string; actorUserId: number;
}) {
  if ((input.tankNumber !== 1 && input.tankNumber !== 2) || Number(input.packedCount ?? 0) > 0) return;
  const material = (await storage.getAllPlantMaterials()).find(row => row.id === input.materialId);
  if (!material) throw new Error("Could not find the saved receipt material for its after-dip alert.");
  const text = `${material.name} ${material.category || ""}`;
  const kind: TankKind | null = /^ldo$/i.test(material.name.trim()) ? "ldo" : /bitumen/i.test(text) && !/emulsion/i.test(text) ? "bitumen" : null;
  if (!kind) return;
  await createTankDipNotifications().afterTankReceipt({
    kind, tank: input.tankNumber, plantName: input.plantName || await storage.getDefaultPlantName(),
    date: input.date, eventId: input.eventId || `decant:${randomUUID()}`, actorUserId: input.actorUserId,
  });
}
export function scheduleTankDipReminders(run: (now: Date) => Promise<unknown>) {
  // No immediate invocation: only the scheduled callback may deliver alerts.
  return setInterval(() => {
    void run(new Date()).catch(error => console.warn("[TankDip] Reminder failed:", error?.message || error));
  }, 30_000);
}
export function startTankDipReminders() {
  if (process.env.NODE_ENV === "test") return;
  const service = createTankDipNotifications();
  scheduleTankDipReminders(now => service.runReminders(now)).unref();
}
