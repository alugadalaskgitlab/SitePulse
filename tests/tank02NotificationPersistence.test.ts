import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../shared/schema";
const fx = vi.hoisted(() => ({
  db: null as any, push: vi.fn(), users: [] as any[],
  methods: {
    getAllPlantMaterials: vi.fn(), getDefaultPlantName: vi.fn(), getPlantShiftLogByDate: vi.fn(),
    getPersonnel: vi.fn(), getUsersDirectory: vi.fn(), getPlantSettings: vi.fn(),
    getUserPermittedSiteIds: vi.fn(), listPlantSettings: vi.fn(), getTruckDispatches: vi.fn(),
    getBitumenDipReadings: vi.fn(), getLdoDipReadings: vi.fn(),
  },
}));
vi.mock("../server/db", () => ({ get db() { return fx.db; }, pool: {} }));
vi.mock("../server/storage", () => ({ storage: fx.methods }));
vi.mock("../server/push", () => ({ sendPushToUser: fx.push }));
vi.mock("../server/auth", () => ({
  getUserById: async (id: number) => fx.users.find(row => row.id === id),
  loadUserPermissionsMatrix: async () => ({}),
}));
vi.mock("../server/featureAccess", () => ({ loadFeatureAccessState: async () => ({ rolesConfigured: true, licensedModules: ["hmp"] }) }));
import { createTankDipNotifications, deliverTankDipNotification, notifyTankAfterReceipt, getTankDipAlerts, countUnreadTankDipAlerts, markTankDipAlertsRead, deleteTankDipAlert } from "../server/tankDipNotifications";
let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite(); fx.db = drizzle(pg, { schema });
  await pg.exec(`CREATE TABLE plant_supply_alert_deliveries (
    id serial PRIMARY KEY, dedupe_key text NOT NULL, recipient_user_id integer NOT NULL,
    alert_type text NOT NULL CHECK (alert_type IN ('running_low', 'exhausted', 'borrowed', 'morning_summary')),
    title text NOT NULL, message text NOT NULL, is_read boolean NOT NULL DEFAULT false,
    created_at timestamp DEFAULT now(), order_id integer, party_id integer, material_id integer,
    UNIQUE (dedupe_key, recipient_user_id)
  )`);
  await pg.exec("CREATE TABLE users (id integer PRIMARY KEY); INSERT INTO users VALUES (1), (5), (9)");
  await pg.exec(readFileSync("migrations/0080_tank_dip_alert_deliveries.sql", "utf8"));
  await pg.exec("INSERT INTO plant_supply_alert_deliveries(dedupe_key,recipient_user_id,alert_type,title,message) VALUES ('order-fixture',1,'morning_summary','Order fixture','Unchanged')");
});
afterAll(async () => { await pg.close(); });
afterEach(async () => {
  expect((await pg.query("SELECT alert_type, message FROM plant_supply_alert_deliveries")).rows).toEqual([{ alert_type: "morning_summary", message: "Unchanged" }]);
});
beforeEach(async () => {
  await pg.exec("TRUNCATE tank_dip_alert_deliveries"); vi.clearAllMocks();
  fx.users = [{ id: 9, isActive: true, personnelId: 70 }, { id: 1, isActive: true, isOwner: true }];
  fx.methods.getAllPlantMaterials.mockResolvedValue([{ id: 41, name: "LDO", category: "Fuel" }, { id: 42, name: "BITUMEN", category: "Bitumen" }, { id: 43, name: "EMULSION", category: "Bitumen" }]);
  fx.methods.getDefaultPlantName.mockResolvedValue("Plant A");
  fx.methods.getPlantShiftLogByDate.mockResolvedValue({ supervisorName: "Fixture supervisor", noMainPlantOps: false });
  fx.methods.getPersonnel.mockResolvedValue([{ id: 70, name: "Fixture supervisor" }]);
  fx.methods.getUsersDirectory.mockResolvedValue([{ id: 9 }]);
  fx.methods.getPlantSettings.mockResolvedValue({ siteId: 7 });
  fx.methods.getUserPermittedSiteIds.mockResolvedValue([7]);
  fx.methods.listPlantSettings.mockResolvedValue([{ plantName: "Plant A", siteId: 7 }]);
  fx.methods.getTruckDispatches.mockResolvedValue([]);
  fx.methods.getBitumenDipReadings.mockResolvedValue([]);
  fx.methods.getLdoDipReadings.mockResolvedValue([]);
});
it("persists private in-app alerts with real database deduplication and pushes only newly inserted deliveries", async () => {
  const input = { dedupeKey: "tank-dip:reminder:Plant A:2026-11-28T08:00", recipientIds: [1, 9, 1], alertType: "tank_dip:ldo:1:opening:Plant%20A:2026-11-28", title: "Opening tank dip reminder", message: "Enter today's dip readings: LDO tank 1" };
  await deliverTankDipNotification(input); await deliverTankDipNotification(input);
  const rows = (await pg.query("SELECT * FROM tank_dip_alert_deliveries ORDER BY recipient_user_id")).rows as any[];
  expect(rows).toHaveLength(2); expect(rows.map(row => row.recipient_user_id)).toEqual([1, 9]);
  expect(rows.every(row => row.is_read === false)).toBe(true);
  expect(fx.push).toHaveBeenCalledTimes(2);
  expect(fx.push.mock.calls[0][3]).toContain("dipEntry=1");
});
it("after a bulk receipt and a decant notifies the saver and the exact linked supervisor", async () => {
  await notifyTankAfterReceipt({ eventId: "receipt:17", actorUserId: 5, materialId: 41, tankNumber: 2, date: "2026-11-28", plantName: "Plant A" });
  await notifyTankAfterReceipt({ actorUserId: 5, materialId: 42, tankNumber: 1, date: "2026-11-28" });
  const rows = (await pg.query("SELECT * FROM tank_dip_alert_deliveries")).rows as any[];
  expect(rows).toHaveLength(4); expect(rows.map(row => row.recipient_user_id).sort()).toEqual([5, 5, 9, 9]);
  expect(rows.some(row => row.message === "Take the after-dip for LDO tank 2")).toBe(true);
  expect(rows.some(row => row.message === "Take the after-dip for Bitumen tank 1")).toBe(true);
});
it("does not request tank after-dips for packed/no-tank receipts or emulsion", async () => {
  const input = { eventId: "receipt:18", actorUserId: 5, materialId: 41, tankNumber: 1, date: "2026-11-28" };
  await notifyTankAfterReceipt({ ...input, packedCount: 10 });
  await notifyTankAfterReceipt({ ...input, tankNumber: null });
  await notifyTankAfterReceipt({ ...input, materialId: 43 });
  expect((await pg.query("SELECT * FROM tank_dip_alert_deliveries")).rows).toHaveLength(0);
});
it("idle suppresses reminders only when this plant has no production", async () => {
  fx.methods.getUsersDirectory.mockResolvedValue([{ id: 1 }]);
  fx.methods.getPlantShiftLogByDate.mockResolvedValue({ noMainPlantOps: true });
  const now = new Date("2026-11-28T02:30:00Z");
  fx.methods.getTruckDispatches.mockResolvedValue([{ plantName: "Plant B", loadWeight: 20 }]);
  await createTankDipNotifications().runReminders(now);
  expect((await pg.query("SELECT * FROM tank_dip_alert_deliveries")).rows).toHaveLength(0);
  fx.methods.getTruckDispatches.mockResolvedValue([{ plantName: "Plant A", loadWeight: 20 }]);
  await createTankDipNotifications().runReminders(now);
  expect((await pg.query("SELECT * FROM tank_dip_alert_deliveries")).rows).toHaveLength(1);
});
it("keeps notification reads, counts, read-state and deletion private to the recipient", async () => {
  await deliverTankDipNotification({ dedupeKey: "private", recipientIds: [9], alertType: "tank_dip:ldo:1:opening:Plant%20A:2026-11-28", title: "Fixture", message: "Private" });
  const [row] = await getTankDipAlerts(9);
  expect(await getTankDipAlerts(1)).toEqual([]);
  expect(await countUnreadTankDipAlerts(9)).toBe(1);
  expect(await markTankDipAlertsRead(1, row.id)).toEqual([]);
  expect(await deleteTankDipAlert(1, row.id)).toEqual([]);
  await markTankDipAlertsRead(9);
  expect(await countUnreadTankDipAlerts(9)).toBe(0);
  await deleteTankDipAlert(9, row.id);
  expect(await getTankDipAlerts(9)).toEqual([]);
});
