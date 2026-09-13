import { beforeEach, describe, expect, it, vi } from "vitest";

const fx = vi.hoisted(() => ({
  outerRows: [] as any[],
  txRows: [] as any[][],
  writes: [] as Array<{ kind: string; value: any }>,
  lastBill: undefined as any,
}));

function query(rows: any[] = []) {
  const q: any = {
    from: () => q,
    where: () => q,
    limit: () => q,
    orderBy: () => q,
    for: () => q,
    innerJoin: () => q,
    leftJoin: () => q,
    returning: () => Promise.resolve(rows),
    values: (value: any) => {
      fx.writes.push({ kind: "insert", value });
      const values = Array.isArray(value) ? value : [value];
      const inserted = values.map((row, index) => ({
        id: row.billNo ? 101 : 201 + index,
        ...row,
      }));
      return query(inserted);
    },
    set: (value: any) => {
      fx.writes.push({ kind: "update", value });
      return query([{ ...(fx.lastBill || {}), ...value }]);
    },
    then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
  };
  return q;
}

const tx: any = {
  select: vi.fn(() => query(fx.txRows.shift() || [])),
  insert: vi.fn(() => query()),
  update: vi.fn(() => query()),
  delete: vi.fn(() => query()),
  execute: vi.fn(async () => ({ rows: [] })),
};

const fakeDb: any = {
  select: vi.fn(() => query(fx.outerRows)),
  transaction: vi.fn(async (callback: (transaction: any) => Promise<unknown>) => callback(tx)),
  query: {
    vendorBills: {
      findFirst: vi.fn(async () => fx.lastBill),
    },
  },
};

vi.mock("../server/db", () => ({ db: fakeDb }));

let DatabaseStorage: any;
beforeEach(async () => {
  ({ DatabaseStorage } = await import("../server/storage"));
  fx.outerRows = [];
  fx.txRows = [];
  fx.writes = [];
  fx.lastBill = undefined;
  vi.clearAllMocks();
});

const itemizedEquipmentBill = (overrides: Record<string, unknown> = {}) => ({
  billDate: "2026-09-13",
  billNo: "CLIENT-IGNORED",
  billType: "equipment",
  vendorName: "NARASIMHULU",
  periodFrom: "2026-08-01",
  periodTo: "2026-09-13",
  status: "draft",
  totalAmount: 10000,
  gstRateEquipment: 18,
  tdsRate: 2,
  items: [{
    date: "2026-09-13",
    category: "equipment",
    description: "JCB MONTHLY HIRE",
    qty: 1,
    unit: "MONTH",
    rate: 10000,
    amount: 10000,
    source: "manual",
    equipmentId: 9,
  }],
  ...overrides,
});

describe("VB-09 server itemized equipment hire", () => {
  it("creates an itemized equipment bill without groups or complete hire-master terms", async () => {
    const storage = new DatabaseStorage();

    const bill = await storage.createVendorBill(itemizedEquipmentBill() as any);

    expect(bill.items).toHaveLength(1);
    expect(bill.items[0]).toMatchObject({
      category: "equipment",
      description: "JCB MONTHLY HIRE",
      unit: "MONTH",
      amount: 10000,
      equipmentId: 9,
      hireStatementId: null,
    });
    expect(fx.writes).toEqual(expect.arrayContaining([
      { kind: "insert", value: expect.objectContaining({ billType: "EQUIPMENT", gstRateEquipment: 18, tdsRate: 2 }) },
      { kind: "insert", value: [expect.objectContaining({ category: "equipment", amount: 10000, unit: "MONTH" })] },
    ]));
  });

  it("updates an itemized equipment bill's GST/TDS and manual monthly line without groups", async () => {
    fx.txRows.push(
      [{
        id: 101,
        billType: "EQUIPMENT",
        vendorName: "NARASIMHULU",
        status: "draft",
        periodFrom: "2026-08-01",
        periodTo: "2026-09-13",
      }],
      [],
    );
    const storage = new DatabaseStorage();

    const updated = await storage.updateVendorBill(101, itemizedEquipmentBill({
      gstRateEquipment: 12,
      tdsRate: 1,
      totalAmount: 11000,
      items: [{
        date: "2026-09-13",
        category: "equipment",
        description: "JCB AGREED MONTHLY AMOUNT",
        qty: 1,
        unit: "MONTH",
        rate: 11000,
        amount: 11000,
        source: "manual",
        equipmentId: 9,
      }],
    }) as any);

    expect(updated?.items).toHaveLength(1);
    expect(updated?.items[0]).toMatchObject({ description: "JCB AGREED MONTHLY AMOUNT", amount: 11000 });
    expect(fx.writes).toEqual(expect.arrayContaining([
      { kind: "update", value: expect.objectContaining({ gstRateEquipment: 12, tdsRate: 1 }) },
      { kind: "insert", value: [expect.objectContaining({ amount: 11000, category: "equipment" })] },
    ]));
  });

  it("keeps historical hire-group edit protection when groups are omitted", async () => {
    fx.txRows.push(
      [{ id: 101, billType: "EQUIPMENT", vendorName: "NARASIMHULU", status: "draft" }],
      [{ id: 501, vendorBillId: 101, status: "approved" }],
    );
    const storage = new DatabaseStorage();

    await expect(storage.updateVendorBill(101, itemizedEquipmentBill() as any))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(fx.writes).toHaveLength(0);
  });

  it("keeps historical hire-group approval frozen and computes its saved net payable", async () => {
    const historical = {
      id: 101,
      billType: "EQUIPMENT",
      vendorName: "NARASIMHULU",
      status: "verified",
      totalAmount: 10000,
      amountPaid: null,
      gstRateEquipment: 18,
      tdsRate: 2,
    };
    fx.txRows.push(
      [historical],
      [{
        id: 501,
        vendorBillId: 101,
        status: "billed",
        calculationSnapshot: {
          financials: {
            grossHire: 10000,
            breakdownDeduction: 0,
            hsdRecovery: 0,
            otherDebit: 0,
            advanceAdjustment: 0,
            otherCredit: 0,
            gstRate: 18,
            tdsRate: 2,
          },
        },
      }],
    );
    fx.lastBill = { ...historical, status: "approved" };
    const storage = new DatabaseStorage();

    const approved = await storage.updateVendorBillStatus(101, "approved", "reviewer");

    expect(approved).toMatchObject({ id: 101, status: "approved" });
    const approval = fx.writes.find(write => write.kind === "update")?.value;
    expect(approval).toMatchObject({
      status: "approved",
      approvedBy: "REVIEWER",
      amountPaid: 0,
      netPayableAmount: expect.any(Number),
    });
    expect(fx.txRows).toHaveLength(0);
  });

  it("keeps linked legacy equipment item approval on its established tax path", async () => {
    const historical = {
      id: 104,
      billType: "EQUIPMENT",
      vendorName: "NARASIMHULU",
      status: "verified",
      totalAmount: 10000,
      amountPaid: null,
      adjustmentAmount: 0,
      gstRateEquipment: 18,
      tdsRate: 2,
    };
    fx.txRows.push(
      [historical],
      [{ id: 504, vendorBillId: 104, status: "billed", calculationSnapshot: null }],
      [{ category: "equipment", amount: 10000 }],
    );
    fx.lastBill = { ...historical, status: "approved", netPayableAmount: 11564, amountPaid: 0 };
    const storage = new DatabaseStorage();

    await storage.updateVendorBillStatus(104, "approved", "reviewer");

    const approval = fx.writes.find(write => write.kind === "update")?.value;
    expect(approval).toMatchObject({ netPayableAmount: 11564, amountPaid: 0 });
  });

  it("approves a new itemized equipment bill with TDS on the pre-GST subtotal", async () => {
    const itemized = {
      id: 102,
      billType: "EQUIPMENT",
      vendorName: "NARASIMHULU",
      status: "verified",
      totalAmount: 10000,
      amountPaid: null,
      adjustmentAmount: 0,
      gstRateEquipment: 18,
      gstRateMaterial: null,
      gstRateTransport: null,
      gstRateLabour: null,
      tdsRate: 2,
    };
    fx.txRows.push(
      [itemized],
      [],
      [{ category: "equipment", amount: 10000 }],
    );
    fx.lastBill = { ...itemized, status: "approved", netPayableAmount: 11600, amountPaid: 0 };
    const storage = new DatabaseStorage();

    const approved = await storage.updateVendorBillStatus(102, "approved", "reviewer");

    expect(approved).toMatchObject({ id: 102, status: "approved" });
    const approval = fx.writes.find(write => write.kind === "update")?.value;
    expect(approval).toMatchObject({
      status: "approved",
      netPayableAmount: 11600,
      amountPaid: 0,
    });
  });

  it("matches shared UI GST category totals and subtotal TDS for mixed itemized equipment", async () => {
    const itemized = {
      id: 103,
      billType: "EQUIPMENT",
      vendorName: "NARASIMHULU",
      status: "verified",
      totalAmount: 15000,
      amountPaid: null,
      adjustmentAmount: 100,
      gstRateEquipment: 18,
      gstRateMaterial: 5,
      gstRateTransport: null,
      gstRateLabour: null,
      tdsRate: 2,
    };
    fx.txRows.push(
      [itemized],
      [],
      [
        { category: "equipment", amount: 10000 },
        { category: "material", amount: 5000 },
      ],
    );
    fx.lastBill = { ...itemized, status: "approved", netPayableAmount: 16850, amountPaid: 0 };
    const storage = new DatabaseStorage();

    await storage.updateVendorBillStatus(103, "approved", "reviewer");

    const approval = fx.writes.find(write => write.kind === "update")?.value;
    expect(approval).toMatchObject({
      status: "approved",
      netPayableAmount: 16850,
      amountPaid: 0,
    });
  });
});