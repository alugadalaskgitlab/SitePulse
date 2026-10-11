import { and, eq, gte, lte, sql } from "drizzle-orm";
import { hireStatements, vendorBillItems, vendorBills } from "../shared/schema";

/** Immutable snapshots decide charged days; unknown legacy periods stay blocked. */
export function statementChargesDate(statement: any, date: string): boolean {
  if (date < statement.periodFrom || date > statement.periodTo) return false;
  const days = statement.calculationSnapshot?.payableDays;
  if (statement.billingBasis !== "daily" || !Array.isArray(days)) return true;
  return days.some((day: any) => day.date === date && Number(day.fraction) > 0);
}

export async function dailyHireBilledDays(executor: any, equipmentId: number, from: string, to: string, excludeBillId?: number) {
  const statements = await executor.select({ statement: hireStatements, bill: vendorBills }).from(hireStatements)
    .leftJoin(vendorBills, eq(vendorBills.id, hireStatements.vendorBillId))
    .where(and(eq(hireStatements.equipmentId, equipmentId), lte(hireStatements.periodFrom, to), gte(hireStatements.periodTo, from)));
  const ordinary = await executor.select({ item: vendorBillItems, bill: vendorBills }).from(vendorBillItems)
    .innerJoin(vendorBills, eq(vendorBills.id, vendorBillItems.billId))
    .where(and(eq(vendorBillItems.equipmentId, equipmentId), gte(vendorBillItems.date, from), lte(vendorBillItems.date, to),
      sql`${vendorBills.status} NOT IN ('cancelled', 'rejected')`));
  const result: { date: string; billNo: string; billId?: number; statementId?: number }[] = [];
  const active = statements.filter((row: any) => row.statement.vendorBillId !== excludeBillId &&
    !["cancelled", "rejected"].includes(row.bill?.status || row.statement.status));
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    for (const { statement, bill } of active) if (statementChargesDate(statement, date))
      result.push({ date, billNo: bill?.billNo || `Hire statement #${statement.id}`, billId: bill?.id, statementId: statement.id });
  }
  for (const { item, bill } of ordinary) {
    if (bill.id === excludeBillId) continue;
    // Generated statement line date is the period end, not another daily charge.
    if (item.hireStatementId && statements.some((r: any) => r.statement.id === item.hireStatementId)) continue;
    result.push({ date: item.date, billNo: bill.billNo, billId: bill.id });
  }
  return result;
}
