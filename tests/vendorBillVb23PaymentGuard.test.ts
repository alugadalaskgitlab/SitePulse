import { beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  selectedRows: [] as any[][],
  writes: [] as any[],
  returnedBill: undefined as any,
}));

function query(rows: any[] = []) {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    for: () => chain,
    set: (value: any) => {
      fixtures.writes.push(value);
      return query();
    },
    then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
  };
  return chain;
}

const transaction = {
  select: vi.fn(() => query(fixtures.selectedRows.shift() ?? [])),
  update: vi.fn(() => query()),
};

const database = {
  transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
    callback(transaction)),
  query: {
    vendorBills: {
      findFirst: vi.fn(async () => fixtures.returnedBill),
    },
  },
};

vi.mock("../server/db", () => ({ db: database }));

let DatabaseStorage: typeof import("../server/storage").DatabaseStorage;

beforeEach(async () => {
  ({ DatabaseStorage } = await import("../server/storage"));
  fixtures.selectedRows = [];
  fixtures.writes = [];
  fixtures.returnedBill = undefined;
  vi.clearAllMocks();
});

function approvedBill(billType: string, amountPaid: number | null, overrides: Record<string, unknown> = {}) {
  return {
    id: 23,
    billType,
    status: "approved",
    totalAmount: 12_000,
    netPayableAmount: 10_000,
    amountPaid,
    additionalAdjustments: [],
    ...overrides,
  };
}

async function markPaid(existing: ReturnType<typeof approvedBill>) {
  fixtures.selectedRows.push([existing], []); // locked bill, then linked hire statements
  fixtures.returnedBill = { ...existing, status: "paid" };
  return new DatabaseStorage().updateVendorBillStatus(existing.id, "paid", "accounts user");
}

describe("VB-23 vendor bill paid-transition storage guard", () => {
  it.each(["ALL", "EQUIPMENT"])(
    "blocks a partially recorded %s bill before any status write",
    async (billType) => {
      const transition = markPaid(approvedBill(billType, 9_999.99));

      await expect(transition).rejects.toMatchObject({
        code: "CONFLICT",
        message: "Record the remaining equipment hire balance before marking this bill paid.",
      });
      expect(fixtures.writes).toEqual([]);
    },
  );

  it.each(["all", "equipment"])(
    "allows a fully recorded %s bill and executes the real paid transition",
    async (billType) => {
      const result = await markPaid(approvedBill(billType, 10_000));

      expect(result).toMatchObject({ id: 23, status: "paid" });
      expect(fixtures.writes).toHaveLength(1);
      expect(fixtures.writes[0]).toMatchObject({
        status: "paid",
        amountPaid: 10_000,
        paymentRecordedBy: "ACCOUNTS USER",
        paidAt: expect.any(String),
      });
    },
  );

  it.each(["ALL", "EQUIPMENT"])(
    "preserves legacy %s handling when no frozen net payable or paid amount exists",
    async (billType) => {
      await markPaid(approvedBill(billType, null, { netPayableAmount: null }));

      expect(fixtures.writes[0]).toMatchObject({
        status: "paid",
        amountPaid: 12_000,
      });
    },
  );

  it("does not apply the equipment payment guard to a material bill", async () => {
    await markPaid(approvedBill("MATERIAL", 1));

    expect(fixtures.writes).toHaveLength(1);
    expect(fixtures.writes[0]).toMatchObject({
      status: "paid",
      paymentRecordedBy: "ACCOUNTS USER",
    });
    expect(fixtures.writes[0]).not.toHaveProperty("amountPaid");
  });
});