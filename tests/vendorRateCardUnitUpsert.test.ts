import { beforeEach, describe, expect, it, vi } from "vitest";

const fx = vi.hoisted(() => {
  const state = {
    rows: [
      { id: 101, vendorName: "UNIT VENDOR", category: "labour", itemKey: "LAB_SKILLED", itemLabel: "SKILLED", unit: "HEAD-DAY", rate: 100, notes: null },
      { id: 102, vendorName: "UNIT VENDOR", category: "labour", itemKey: "LAB_SKILLED", itemLabel: "SKILLED", unit: "HEAD", rate: 200, notes: null },
    ],
    selectedRows: [] as any[],
    updateValues: null as any,
  };

  const collectSqlParts = (value: any, columns: string[] = [], values: string[] = []) => {
    if (!value) return { columns, values };
    if (Array.isArray(value)) {
      value.forEach(part => collectSqlParts(part, columns, values));
    } else if (value.queryChunks) {
      value.queryChunks.forEach((part: any) => collectSqlParts(part, columns, values));
    } else if (typeof value.name === "string") {
      columns.push(value.name);
    } else if (typeof value === "string") {
      values.push(value);
    }
    return { columns, values };
  };

  const query = () => {
    const q: any = {
      from: () => q,
      where: (condition: any) => {
        const parts = collectSqlParts(condition);
        const unit = parts.columns.includes("unit")
          ? ["HEAD-DAY", "HEAD"].find(candidate => parts.values.includes(candidate))
          : undefined;
        state.selectedRows = state.rows.filter(row => !unit || row.unit === unit);
        return q;
      },
      then: (resolve: any, reject: any) => Promise.resolve(state.selectedRows).then(resolve, reject),
    };
    return q;
  };

  return {
    state,
    fakeDb: {
      select: vi.fn(() => query()),
      update: vi.fn(() => {
        const q: any = {
          set: (values: any) => {
            state.updateValues = values;
            return q;
          },
          where: () => q,
          returning: () => {
            if (!state.selectedRows.length) return Promise.resolve([]);
            Object.assign(state.selectedRows[0], state.updateValues);
            return Promise.resolve([state.selectedRows[0]]);
          },
        };
        return q;
      }),
    },
  };
});

vi.mock("../server/db", () => ({ db: fx.fakeDb }));

describe("vendor rate-card upsert unit identity", () => {
  beforeEach(() => {
    fx.state.rows[0].rate = 100;
    fx.state.rows[1].rate = 200;
    fx.state.selectedRows = [];
    fx.state.updateValues = null;
    vi.clearAllMocks();
  });

  it("updates only the matching unit when item key and category are shared", async () => {
    const { DatabaseStorage } = await import("../server/storage");
    const storage = new DatabaseStorage();

    await storage.upsertVendorRateCard({
      vendorName: "UNIT VENDOR",
      category: "labour",
      itemKey: "LAB_SKILLED",
      itemLabel: "SKILLED",
      unit: "head-day",
      rate: 111,
      notes: null,
    });
    await storage.upsertVendorRateCard({
      vendorName: "UNIT VENDOR",
      category: "labour",
      itemKey: "LAB_SKILLED",
      itemLabel: "SKILLED",
      unit: "HEAD",
      rate: 222,
      notes: null,
    });

    expect(fx.state.rows.map(row => [row.unit, row.rate])).toEqual([
      ["head-day", 111],
      ["HEAD", 222],
    ]);
  });
  it("bill write-back ignores both supplied numeric basis and explicit nulls", async () => {
    const { DatabaseStorage } = await import("../server/storage");
    const storage = new DatabaseStorage();
    const data = { vendorName: "UNIT VENDOR", category: "transport", itemKey: "EQ_TIPPER_HEAD",
      itemLabel: "TIPPER", unit: "HEAD", rate: 200, notes: null };
    Object.assign(fx.state.rows[1], { leadDistanceKm: 12, payloadMt: 30, ratePerKm: 950 });
    await storage.upsertVendorRateCard({ ...data, leadDistanceKm: 99, payloadMt: 1, ratePerKm: 1 });
    expect(fx.state.updateValues).not.toHaveProperty("leadDistanceKm");
    expect(fx.state.rows[1]).toMatchObject({ leadDistanceKm: 12, payloadMt: 30, ratePerKm: 950 });
    await storage.upsertVendorRateCard({ ...data, rate: 250, leadDistanceKm: null, payloadMt: null, ratePerKm: null });
    expect(fx.state.updateValues).not.toHaveProperty("payloadMt");
    expect(fx.state.updateValues).not.toHaveProperty("leadDistanceKm");
    expect(fx.state.updateValues).not.toHaveProperty("ratePerKm");
    expect(fx.state.rows[1]).toMatchObject({ rate: 250, leadDistanceKm: 12, payloadMt: 30, ratePerKm: 950 });
  });
  it("the dedicated update writes exactly three columns, never identity or flat rate", async () => {
    const { DatabaseStorage } = await import("../server/storage");
    fx.state.selectedRows = [fx.state.rows[1]];
    await new DatabaseStorage().updateTransportRateSetup(102, " Mixed  Key ", {
      leadDistanceKm: 12, payloadMt: 30, ratePerKm: 950,
    });
    expect(fx.state.updateValues).toEqual({ leadDistanceKm: 12, payloadMt: 30, ratePerKm: 950 });
    expect(fx.state.rows[1].rate).toBe(200);
  });
  it("a missing existing row is not inserted by dedicated setup", async () => {
    const { DatabaseStorage } = await import("../server/storage");
    expect(await new DatabaseStorage().updateTransportRateSetup(999, "Missing", {
      leadDistanceKm: 12, payloadMt: 30, ratePerKm: 950,
    })).toBeUndefined();
  });
});