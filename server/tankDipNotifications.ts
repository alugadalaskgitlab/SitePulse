import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { getUserById, loadUserPermissionsMatrix } from "./auth";
import { loadFeatureAccessState } from "./featureAccess";
import { can } from "@shared/featureAccess";
import { plantSupplyAlertDeliveries } from "@shared/schema";
import { sendPushToUser } from "./push";
import { requiredDipTanks, tankBookStock, tankDipAlertHref, tankDipAlertType, type TankKind, type TankPlantSettings, type TankPositionRow, type TankDipRow } from "@shared/tankBookStock";

export type TankRecipient = { id: number; active: boolean; owner: boolean; verify: boolean; enter: boolean; sites: number[] | null };
export function tankDipRecipients(users: TankRecipient[], siteId: number | null, includeOperators: boolean): number[] {
  return users.filter(user => user.active && (user.owner ||
    ((user.sites === null || (siteId != null && user.sites.includes(siteId))) && (user.verify || (includeOperators && user.enter)))))
    .map(user => user.id);
}
type Delivery = { dedupeKey: string; recipientIds: number[]; alertType: string; title: string; message: string };
export type TankDipDependencies = {
  settings(plant: string): Promise<TankPlantSettings | null>;
  positions(): Promise<TankPositionRow[]>;
  readings(kind: TankKind, plant: string, date: string): Promise<TankDipRow[]>;
  recipients(plant: string, includeOperators: boolean): Promise<number[]>;
  deliver(input: Delivery): Promise<unknown>;
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
  deliver: async input => {
    if (!input.recipientIds.length) return;
    // Reuse the existing recipient-private, deduplicated operational delivery
    // store; no migration and no globally shared notification/read state.
    const rows = await db.insert(plantSupplyAlertDeliveries).values([...new Set(input.recipientIds)].map(recipientUserId => ({
      dedupeKey: input.dedupeKey, recipientUserId, alertType: input.alertType, title: input.title, message: input.message,
    }))).onConflictDoNothing().returning({ id: plantSupplyAlertDeliveries.id, recipientUserId: plantSupplyAlertDeliveries.recipientUserId });
    await Promise.allSettled(rows.map(row => sendPushToUser(row.recipientUserId, input.title, input.message, tankDipAlertHref(input.alertType) || undefined)));
  },
};

export function createTankDipNotifications(deps: TankDipDependencies = defaultDependencies) {
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
  return { notifyStart };
}
export const notifyPlantLogStart = (input: { id: number; date: string; plantName: string }) => createTankDipNotifications().notifyStart(input);
