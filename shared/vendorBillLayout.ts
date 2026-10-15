import { monthlyGross, normalizeHireActivities, type HireTerms } from "./hireBilling";

/** Display-only: never writes evidence or feeds a billing calculation. */
export const MONTHLY_BILL_HEADERS = [
  "Sl. No.", "Bill Period", "Days Billed", "Worked Days",
  "Idle Days (Work Not Available)", "Breakdown Days",
  "Operator / Driver Unavailable Days", "Not Recorded", "Gross Amount (₹)",
];
const DAY = 86400000;
const finite = (v: unknown): number | null => v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
const round = (n: number) => Math.round(n * 100) / 100;
export function calendarMonths(from: string, to: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || "") || !/^\d{4}-\d{2}-\d{2}$/.test(to || "") || from > to) return [];
  const months: { key: string; label: string; from: string; to: string }[] = [];
  let cursor = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  while (Number.isFinite(cursor.getTime()) && cursor.toISOString().slice(0, 10) <= to && months.length < 1200) {
    const key = cursor.toISOString().slice(0, 7);
    const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    months.push({ key, label: cursor.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }),
      from: from > `${key}-01` ? from : `${key}-01`, to: to < next.toISOString().slice(0, 10) ? to : new Date(+next - DAY).toISOString().slice(0, 10) });
    cursor = next;
  }
  return months;
}
export function activityClassification(row: any): string {
  const state = String(row?.activity ?? row?.status ?? "").toLowerCase();
  if (["outside_hire", "outside_deployment", "outside hire/deployment period"].includes(state)) return "Outside Hire/Deployment Period";
  if (["idle", "work_not_available", "idle_work_not_available", "idle_no_work"].includes(state)) return "Idle — Work Not Available";
  if (["idle_no_operator", "operator_unavailable"].includes(state)) return "Operator / Driver Unavailable";
  if (["breakdown", "maintenance"].includes(state)) return "Breakdown";
  if (["worked", "working"].includes(state) && !(row?.openActivityCount > 0 && !row?.billableActivityCount)) return "Worked";
  return "Activity Not Recorded";
}
export function projectHireReview(statement: any, bill: any = {}) {
  const snapshot = statement.calculationSnapshot || {};
  const terms = {
    monthlyDivisorType: statement.monthlyDivisorType, monthlyDivisor: statement.monthlyDivisor,
    hireStartDate: statement.hireStartDate, hireEndDate: statement.hireEndDate,
    ...snapshot.terms, billingBasis: statement.billingBasis || snapshot.terms?.billingBasis, rate: finite(statement.rate ?? snapshot.terms?.rate),
  } as HireTerms;
  const from = statement.periodFrom || snapshot.periodFrom || bill.periodFrom || "";
  const to = statement.periodTo || snapshot.periodTo || bill.periodTo || "";
  const source: any[] = snapshot.workingSheet?.length ? snapshot.workingSheet : (snapshot.performanceDailyRows || snapshot.dailyRows || []).map((row: any) => ({
    ...row, activity: row.activity || row.status || ((row.events || []).some((e: any) => e.status !== "open") ? "worked" : "no_activity"),
  }));
  const gross = finite(statement.grossAmount ?? snapshot.grossAmount);
  const deduction = finite(snapshot.adjustments?.breakdownDeduction ?? snapshot.deductionAmount ?? statement.deductionAmount);
  const months = calendarMonths(from, to).map(month => {
    const evidence = source.filter(d => d.date >= month.from && d.date <= month.to);
    const days = [];
    for (let date = Date.parse(`${month.from}T00:00:00Z`); date <= Date.parse(`${month.to}T00:00:00Z`); date += DAY) {
      const iso = new Date(date).toISOString().slice(0, 10);
      const row = evidence.find(d => d.date === iso);
      const outside = (terms.hireStartDate && iso < terms.hireStartDate) || (terms.hireEndDate && iso > terms.hireEndDate);
      days.push({ date: iso, classification: outside ? "Outside Hire/Deployment Period" : activityClassification(row) });
    }
    const eligibleFrom = [month.from, snapshot.billablePeriodFrom || terms.hireStartDate || month.from].sort().at(-1)!;
    const eligibleTo = [month.to, snapshot.billablePeriodTo || terms.hireEndDate || month.to].sort()[0];
    const eligible = Math.max(0, (Date.parse(eligibleTo) - Date.parse(eligibleFrom)) / DAY + 1);
    let daysBilled: number | null = null;
    let amount: number | null = null;
    if (terms.billingBasis === "monthly" && terms.rate != null) {
      amount = eligible ? monthlyGross(Date.parse(eligibleFrom), Date.parse(eligibleTo), terms) : 0;
      // Gross is BEFORE breakdown deductions in the existing engine. Do not
      // invent a net day-equivalent for manual/undated money deductions.
      const exceptions: any[] = snapshot.exceptions || [];
      const allocated = exceptions.filter(e => Number(e.deductionAmount) > 0);
      const reconciles = deduction != null && Math.abs(allocated.reduce((s, e) => s + Number(e.deductionAmount), 0) - deduction) < 0.02;
      const interpretable = allocated.every(e => e.date && ["full_day", "half_day", "hours"].includes(e.decision) &&
        (e.decision !== "hours" || (Number(terms.breakdownHoursPerDay) >= 10 && Number(terms.breakdownHoursPerDay) <= 12 && finite(e.downtimeHours) != null)));
      const excluded = allocated.filter(e => e.date >= eligibleFrom && e.date <= eligibleTo)
        .reduce((s, e) => s + (e.decision === "full_day" ? 1 : e.decision === "half_day" ? 0.5 : Number(e.downtimeHours) / Number(terms.breakdownHoursPerDay)), 0);
      daysBilled = deduction === 0 ? eligible : reconciles && interpretable ? round(Math.max(0, eligible - excluded)) : null;
    } else if (terms.billingBasis === "daily" && Array.isArray(snapshot.payableDays)) {
      daysBilled = snapshot.payableDays.filter((d: any) => d.date >= month.from && d.date <= month.to)
        .reduce((sum: number, d: any) => sum + d.fraction, 0);
      amount = terms.rate == null ? null : round(daysBilled! * terms.rate);
    } else if (terms.billingBasis === "trip" && Array.isArray(snapshot.decisions?.trip) && terms.rate != null) {
      const trips = snapshot.decisions.trip.filter((d: any) => d.businessDate >= month.from && d.businessDate <= month.to);
      amount = trips.every((d: any) => finite(d.acceptedTrips) != null)
        ? round(trips.reduce((sum: number, d: any) => sum + Number(d.acceptedTrips), 0) * terms.rate) : null;
    } else if (terms.billingBasis === "hourly" && Array.isArray(snapshot.sourceEvidence?.activities) && terms.rate != null) {
      const activities = normalizeHireActivities(snapshot.sourceEvidence.activities).filter(a =>
        a.businessDate >= eligibleFrom && a.businessDate <= eligibleTo && a.status !== "open" &&
        (snapshot.activityIds || []).includes(`${a.source}:${a.sourceId}`));
      amount = round(activities.reduce((sum, a) => sum + Math.max(0, finite(a.hoursOrKmRun) || 0), 0) * terms.rate);
    }
    return { ...month, days, daysBilled, gross: amount,
      worked: days.filter(d => d.classification === "Worked").length,
      idle: days.filter(d => d.classification === "Idle — Work Not Available").length,
      breakdown: days.filter(d => d.classification === "Breakdown").length,
      operatorUnavailable: days.filter(d => d.classification === "Operator / Driver Unavailable").length,
      unknown: days.filter(d => d.classification === "Activity Not Recorded").length };
  });
  // Stored commercial overrides win. Never proportion a historical total
  // across months or force operational day counts to reconcile to a price.
  if (months.length === 1) {
    if (gross == null || (months[0].gross != null && Math.abs(months[0].gross - gross) > 0.02)) months[0].daysBilled = null;
    months[0].gross = gross;
  }
  else if (gross == null || months.some(m => m.gross == null) || Math.abs(round(months.reduce((s, m) => s + (m.gross || 0), 0)) - gross) > 0.02) {
    months.forEach(m => { m.gross = null; m.daysBilled = null; });
  }
  const savedItem = (bill.items || []).find((item: any) =>
    (statement.id != null && item.hireStatementId === statement.id) ||
    (statement.equipmentId != null && item.equipmentId === statement.equipmentId));
  const name = [statement.equipmentName || snapshot.equipmentName || snapshot.equipment?.name ||
    snapshot.sourceEvidence?.activities?.find((a: any) => a.equipmentName)?.equipmentName || savedItem?.description || "Equipment",
    snapshot.equipment?.registrationNumber || snapshot.registrationNumber].filter(Boolean).join(" · ");
  return { name, masterReference: statement.equipmentId ?? snapshot.equipmentId ?? null, from, to, basis: terms.billingBasis || "—", rate: terms.rate, gross, deduction, months,
    divisor: terms.monthlyDivisorType === "calendar" ? "Calendar Days" : terms.monthlyDivisorType === "custom" ? `Custom (${terms.monthlyDivisor ?? "—"})` : "30 Days",
    note: months.some(m => m.gross == null || m.daysBilled == null)
      ? "Monthly allocation / payable day-equivalent is unavailable from saved evidence. Recorded period amounts are retained; hours and trips are not converted to days."
      : "",
  };
}

/** Expose a gross-to-stored-subtotal bridge only when the saved statements
 * reconcile exactly. It is informational, not a new deduction calculation. */
export function hireFinancialBridge(bill: any, storedSubtotal: number) {
  const statements: any[] = bill.hireStatements || [];
  if (!statements.length || (bill.items || []).some((i: any) => !["hire_group", "hire_statement"].includes(i.source))) return [];
  const gross = statements.map(s => finite(s.grossAmount ?? s.calculationSnapshot?.grossAmount));
  const net = statements.map(s => finite(s.netAmount ?? s.calculationSnapshot?.netAmount));
  if (gross.some(v => v == null) || net.some(v => v == null)) return [];
  const totalGross = round(gross.reduce<number>((s, n) => s + n!, 0));
  const totalNet = round(net.reduce<number>((s, n) => s + n!, 0));
  if (Math.abs(totalNet - storedSubtotal) > 0.02 || Math.abs(totalGross - storedSubtotal) < 0.005) return [];
  return [{ label: "Gross Hire Amount", amount: totalGross },
    { label: "Recorded hire deductions / credits (already incorporated)", amount: round(storedSubtotal - totalGross) },
    { label: "Hire subtotal after recorded deductions", amount: storedSubtotal }];
}
export type HireReview = ReturnType<typeof projectHireReview>;
/** Display-only review notices shared by the page and its saved bill exports. */
export function hireReviewDisclosureLines(review: HireReview): string[] {
  const reviewRequired = review.months
    .filter(month => month.unknown > 0)
    .map(month => `${month.label}: ${month.unknown} dates require review.`);
  return [...reviewRequired, ...(review.note ? [review.note] : [])];
}

export function projectBillHireReviews(bill: any): HireReview[] {
  const statements: any[] = bill.hireStatements || [];
  const covered = new Set(statements.map(s => Number(s.equipmentId)));
  const groups = new Map<string, any>();
  for (const item of bill.items || []) {
    if (String(item.category).toLowerCase() !== "equipment" || covered.has(Number(item.equipmentId))) continue;
    const key = item.equipmentId ? `equipment-${item.equipmentId}` : `item-${item.id}`;
    if (!groups.has(key)) groups.set(key, { equipmentName: item.description || "Equipment",
      equipmentId: item.equipmentId, periodFrom: bill.periodFrom, periodTo: bill.periodTo });
  }
  return [...statements.map(s => projectHireReview(s, bill)), ...Array.from(groups.values(), s => projectHireReview(s, bill))];
}
export function hireReviewTable(review: HireReview) {
  return review.months.map((m, i) => [
    i + 1, `${m.label} · ${m.from} to ${m.to}`, m.daysBilled ?? "—",
    m.worked, m.idle, m.breakdown, m.operatorUnavailable, m.unknown, m.gross ?? "—",
  ]);
}
