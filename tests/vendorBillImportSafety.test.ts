import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  equipmentMaster,
  hireStatementExceptions,
  hireStatements,
  vendorBillItems,
  vendorBills,
} from "../shared/schema";

const dbMock = vi.hoisted(() => {
  const state: {
    selectQueue: any[][];
    pending: Array<{ table: unknown; values: any[] }>;
    committed: Array<{ table: unknown; values: any[] }>;
    rolledBack: Array<{ table: unknown; values: any[] }>;
    failTable: unknown | null;
    sequenceCalls: any[];
  } = {
    selectQueue: [],
    pending: [],
    committed: [],
    rolledBack: [],
    failTable: null,
    sequenceCalls: [],
  };

  const tx: any = {
    execute: vi.fn().mockResolvedValue([]),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          const rows = state.selectQueue.shift() ?? [];
          const query: any = {
            limit: vi.fn(() => ({
              for: vi.fn().mockResolvedValue(rows),
            })),
          };
          query.then = (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject);
          return query;
        }),
      })),
    })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn(async (values: any[]) => {
        state.pending.push({ table, values });
        if (state.failTable === table) throw new Error("simulated insert failure");
        return [];
      }),
    })),
  };

  const db: any = {
    transaction: vi.fn(async (work: (transaction: any) => Promise<unknown>) => {
      state.pending = [];
      try {
        const result = await work(tx);
        state.committed.push(...state.pending);
        return result;
      } catch (error) {
        state.rolledBack.push(...state.pending);
        throw error;
      }
    }),
    execute: vi.fn(async (query: any) => {
      state.sequenceCalls.push(query);
      return [];
    }),
  };

  return { db, state, tx };
});

vi.mock("../server/db", () => ({ db: dbMock.db }));

import { storage } from "../server/storage";

const timestamp = "2026-04-02T10:20:30.000Z";

function realisticVendorBundle() {
  return {
    vendor_bills: {
      bills: [{
        id: 40,
        billDate: "2026-04-01",
        billNo: "VB-40",
        billType: "EQUIPMENT",
        vendorName: "TEST VENDOR",
        status: "draft",
        totalAmount: null,
        verifiedAt: timestamp,
        approvedAt: null,
        paidAt: null,
        createdAt: timestamp,
        lockStatus: "locked",
        adjustmentAmount: 0,
      }],
      hireStatements: [{
        id: 70,
        equipmentId: 7,
        vendorName: "TEST VENDOR",
        billingBasis: "daily",
        rate: 1250,
        periodFrom: "2026-04-01",
        periodTo: "2026-04-01",
        quantity: 1,
        grossAmount: 1250,
        deductionAmount: 0,
        netAmount: 1250,
        status: "draft",
        revision: 0,
        vendorBillId: 40,
        calculationSnapshot: { period: "2026-04-01", adjustments: [null, 0] },
        createdAt: timestamp,
      }],
      items: [{
        id: 90,
        billId: 40,
        date: "2026-04-01",
        description: "EXCAVATOR HIRE",
        qty: 1,
        unit: "DAY",
        rate: 1250,
        amount: 1250,
        source: "hire_statement",
        hireStatementId: 70,
      }],
      hireStatementExceptions: [{
        id: 100,
        statementId: 70,
        sourceType: "manual",
        sourceId: null,
        exceptionType: "none",
        exceptionDate: "2026-04-01",
        description: "NO EXCEPTION",
        downtimeHours: null,
        decision: null,
        manualDeductionAmount: null,
        remarks: null,
        resolvedBy: null,
        resolvedAt: null,
        createdAt: timestamp,
      }],
    },
  };
}

function existingRowsFrom(bundle = realisticVendorBundle()) {
  const vendor = bundle.vendor_bills;
  return [
    [{ ...vendor.bills[0], createdAt: new Date(timestamp) }],
    [{ ...vendor.hireStatements[0], createdAt: new Date(timestamp) }],
    [{ ...vendor.items[0] }],
    [{ ...vendor.hireStatementExceptions[0], createdAt: new Date(timestamp) }],
    [{ id: 7 }],
  ];
}

beforeEach(() => {
  dbMock.state.selectQueue = [];
  dbMock.state.pending = [];
  dbMock.state.committed = [];
  dbMock.state.rolledBack = [];
  dbMock.state.failTable = null;
  dbMock.state.sequenceCalls = [];
  dbMock.db.transaction.mockClear();
  dbMock.db.execute.mockClear();
  dbMock.tx.execute.mockClear();
  dbMock.tx.select.mockClear();
  dbMock.tx.insert.mockClear();
});

describe("vendor bill JSON import safety", () => {
  it("preserves text audit timestamps, date-only fields, JSON, nulls, and numeric values while inserting dependencies in order", async () => {
    dbMock.state.selectQueue = [[], [], [], [], [{ id: 7 }]];

    const result = await storage.importData(realisticVendorBundle());

    expect(result.errors).toEqual([]);
    expect(dbMock.state.committed.map((write) => write.table)).toEqual([
      vendorBills,
      hireStatements,
      vendorBillItems,
      hireStatementExceptions,
    ]);
    const insertedBill = dbMock.state.committed[0].values[0];
    const insertedStatement = dbMock.state.committed[1].values[0];
    expect(insertedBill.verifiedAt).toBe(timestamp);
    expect(insertedBill.billDate).toBe("2026-04-01");
    expect(insertedBill.createdAt).toEqual(new Date(timestamp));
    expect(insertedBill.totalAmount).toBeNull();
    expect(insertedStatement.calculationSnapshot).toEqual({ period: "2026-04-01", adjustments: [null, 0] });
    expect(insertedStatement.rate).toBe(1250);
  });

  it("safely retries matching ISO text/timestamp records without a duplicate, overwrite, or false collision", async () => {
    dbMock.state.selectQueue = existingRowsFrom();

    const result = await storage.importData(realisticVendorBundle());

    expect(result.errors).toEqual([]);
    expect(result.imported[0]).toContain("0 new bills, 0 new items");
    expect(dbMock.state.committed).toEqual([]);
  });

  it("accepts a legacy manual-lines export when it has no hire links to preserve", async () => {
    const legacy = realisticVendorBundle();
    delete (legacy.vendor_bills as any).hireStatements;
    delete (legacy.vendor_bills as any).hireStatementExceptions;
    legacy.vendor_bills.items[0].hireStatementId = null;
    legacy.vendor_bills.items[0].source = "manual";
    dbMock.state.selectQueue = [[], []];

    const result = await storage.importData(legacy);

    expect(result.errors).toEqual([]);
    expect(dbMock.state.committed.map((write) => write.table)).toEqual([vendorBills, vendorBillItems]);
  });

  it("rejects a mismatched existing ID before any vendor-bill write", async () => {
    const mismatched = realisticVendorBundle();
    dbMock.state.selectQueue = [
      [{ ...mismatched.vendor_bills.bills[0], createdAt: new Date(timestamp) }],
      [{ ...mismatched.vendor_bills.hireStatements[0], createdAt: new Date(timestamp) }],
      [{ ...mismatched.vendor_bills.items[0], amount: 999 }],
    ];

    const result = await storage.importData(mismatched);

    expect(result.errors[0]).toContain("vendor_bills.items id 90 already exists with different data");
    expect(dbMock.state.committed).toEqual([]);
    expect(dbMock.state.rolledBack).toEqual([]);
  });

  it("rolls back the entire vendor bundle when a child insert fails", async () => {
    dbMock.state.selectQueue = [[], [], [], [], [{ id: 7 }]];
    dbMock.state.failTable = vendorBillItems;

    const result = await storage.importData(realisticVendorBundle());

    expect(result.errors[0]).toContain("simulated insert failure");
    expect(dbMock.state.committed).toEqual([]);
    expect(dbMock.state.rolledBack.map((write) => write.table)).toEqual([
      vendorBills,
      hireStatements,
      vendorBillItems,
    ]);
  });

  it("resets both hire-table sequences after explicit-ID imports", async () => {
    await storage.resetAllSequences();

    const sequenceSql = dbMock.state.sequenceCalls
      .map((query) => query.queryChunks?.flatMap((chunk: any) => chunk.value ?? []).join("") ?? query.sql ?? String(query))
      .join("\n");
    expect(sequenceSql).toContain("pg_get_serial_sequence('hire_statements', 'id')");
    expect(sequenceSql).toContain("pg_get_serial_sequence('hire_statement_exceptions', 'id')");
  });

  it("does not use a non-existent equipment record for a linked hire statement", async () => {
    dbMock.state.selectQueue = [[], [], [], [], []];

    const result = await storage.importData(realisticVendorBundle());

    expect(result.errors[0]).toContain("not present in Preview; import Equipment Master first");
    expect(dbMock.state.committed).toEqual([]);
  });
});