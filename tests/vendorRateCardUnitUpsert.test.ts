import { beforeEach, describe, expect, it, vi } from "vitest";

const fx = vi.hoisted(() => {
  const state = {
    rows: [
      { id: 101, vendorName: "UNIT VENDOR", category: "labour", itemKey: "LAB_SKILLED", itemLabel: "SKILLED", unit: "HEAD-DAY", rate: 100, notes: null },
      { id: 102, vendorName: "UNIT VENDOR", category: "labour", itemKey: "LAB_SKILLED", itemLabel: "SKILLED", unit: "HEAD", rate: 200, notes: null },
    ],
    selectedRows: [] as any[],
    updateValues: null as any,
    insertedRows: [] as any[],
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
    } else if ("value" in value && ["string", "number", "boolean"].includes(typeof value.value)) {
      values.push(String(value.value));
    }
    return { columns, values };
  };

  const query = () => {
    const q: any = {
      from: () => q,
      where: (condition: any) => {
        const parts = collectSqlParts(condition);
        const rowId = parts.columns.includes("id")
          ? parts.values.map(Number).find(value => Number.isSafeInteger(value) && value > 0)
          : undefined;
        const unit = parts.columns.includes("unit")
          ? ["HEAD-DAY", "HEAD"].find(candidate => parts.values.includes(candidate))
          : undefined;
        state.selectedRows = state.rows.filter(row =>
          (!rowId || row.id === rowId) && (!unit || row.unit === unit),
        );
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
      insert: vi.fn(() => {
        let values: any;
        const q: any = {
          values: (input: any) => {
            values = input;
            return q;
          },
          returning: () => {
            const created = { id: 200 + state.insertedRows.length, ...values };
            state.insertedRows.push(created);
            state.rows.push(created);
            return Promise.resolve([created]);
          },
        };
        return q;
      }),
      update: vi.fn(() => {
        const q: any = {
          set: (values: any) => {
            state.updateValues = values;
            return q;
          },
          where: (condition: any) => {
            const parts = collectSqlParts(condition);
            const rowId = parts.columns.includes("id")
              ? parts.values.map(Number).find(value => Number.isSafeInteger(value) && value > 0)
              : undefined;
            if (rowId) state.selectedRows = state.rows.filter(row => row.id === rowId);
            return q;
          },
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
vi.mock("../server/vendorNameResolution", () => ({
  resolveVendorNameMatch: vi.fn(async (value: string) => {
    const name = String(value).trim().toUpperCase();
    if (["CANONICAL VENDOR", "OLD ALIAS", "NEW ALIAS"].includes(name)) {
      return { vendorId: 22, canonicalName: "Canonical Vendor", variants: ["CANONICAL VENDOR", "OLD ALIAS", "NEW ALIAS"] };
    }
    return null;
  }),
  resolveVendorNameMatchById: vi.fn(async (id: number) => id === 22 ? { id: 22, name: "Canonical Vendor" } : null),
  vendorNameIdentityCondition: vi.fn(() => ({})),
  currentVendorNamesByIds: vi.fn(async () => new Map()),
}));

describe("vendor rate-card upsert unit identity", () => {
  beforeEach(() => {
    fx.state.rows[0].rate = 100;
    fx.state.rows[1].rate = 200;
    fx.state.selectedRows = [];
    fx.state.updateValues = null;
    fx.state.insertedRows = [];
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

    expect(fx.state.rows.map(row => [row.unit, row.rate])).toEqual([
      ["head-day", 111],
      ["HEAD", 200],
    ]);
  }, 15_000);
  it("bill write-back ignores supplied transport basis and updates by full item-and-unit identity", async () => {
    const { DatabaseStorage } = await import("../server/storage");
    const storage = new DatabaseStorage();
    const data = { vendorName: "UNIT VENDOR", category: "transport", itemKey: "EQ_TIPPER_HEAD",
      itemLabel: "TIPPER", unit: "HEAD", rate: 200, notes: null };
    await storage.upsertVendorRateCard({ ...data, leadDistanceKm: 99, payloadMt: 1, ratePerKm: 1 } as any);
    expect(fx.state.insertedRows[0]).not.toHaveProperty("leadDistanceKm");
    expect(fx.state.insertedRows[0]).not.toHaveProperty("payloadMt");
    expect(fx.state.insertedRows[0]).not.toHaveProperty("ratePerKm");
    await storage.upsertVendorRateCard({ ...data, rate: 250, leadDistanceKm: null, payloadMt: null, ratePerKm: null } as any);
    expect(fx.state.updateValues).not.toHaveProperty("payloadMt");
    expect(fx.state.updateValues).not.toHaveProperty("leadDistanceKm");
    expect(fx.state.updateValues).not.toHaveProperty("ratePerKm");
    expect(fx.state.insertedRows[0]).toMatchObject({ rate: 250, itemKey: "EQ_TIPPER_HEAD" });
  });

  it("stores an alias-selected rate under the master and updates an existing alias copy", async () => {
    const { DatabaseStorage } = await import("../server/storage");
    fx.state.rows.push({
      id: 103, vendorName: "OLD ALIAS", vendorId: null, category: "material",
      itemKey: "MAT_20MM_MT", itemLabel: "20 MM", unit: "MT", rate: 390, notes: null,
    });
    const saved = await new DatabaseStorage().upsertVendorRateCard({
      vendorName: "NEW ALIAS",
      vendorId: 22,
      category: "material",
      itemKey: "MAT_20_MM_MT",
      itemLabel: "20 MM",
      unit: "MT",
      rate: 420,
      notes: null,
    });
    expect(fx.state.insertedRows).toHaveLength(0);
    expect(saved).toMatchObject({ id: 103, vendorName: "Canonical Vendor", vendorId: 22, rate: 420 });
    expect(fx.state.rows.find(row => row.id === 103)).toMatchObject({
      vendorName: "Canonical Vendor",
      vendorId: 22,
      rate: 420,
    });
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