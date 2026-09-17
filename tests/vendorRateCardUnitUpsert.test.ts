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
});