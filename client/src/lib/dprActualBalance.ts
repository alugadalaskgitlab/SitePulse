import type { PlanVsActualRow } from "@shared/schema";
import { resolveDprUnitConversion, type DprConversionItem } from "@shared/dprGeometry";

export type DprActualBalance = Pick<
  PlanVsActualRow,
  "currentQty" | "totalActual" | "unit" | "actualIncomplete" | "conversionWarnings"
> & {
  balance: number | null;
  needsUnitReview: boolean;
};

export function dprActualBalance(
  row: Pick<
    PlanVsActualRow,
    "currentQty" | "totalActual" | "unit" | "actualIncomplete" | "conversionWarnings"
  >,
): DprActualBalance {
  const needsUnitReview = row.actualIncomplete === true || row.totalActual == null;
  return {
    ...row,
    balance: needsUnitReview
      ? null
      : Math.round((row.currentQty - row.totalActual!) * 1000) / 1000,
    needsUnitReview,
  };
}

export function exceedsKnownActualBalance(
  info: Pick<DprActualBalance, "balance" | "needsUnitReview">,
  quantity: number | null,
  epsilon = 0.0001,
): boolean {
  return quantity != null
    && !info.needsUnitReview
    && info.balance != null
    && quantity > info.balance + epsilon;
}

type StructureActualEvidence = {
  boqProjectId: number | null;
  date: string;
  structureItems: Array<{
    boqItemId: number | null;
    structureId: string | null;
    quantity: number | null;
    uom?: string | null;
    dprConversionFactor: number | null;
  }>;
};

export type StructureActualCredit = {
  totalActual: number | null;
  actualIncomplete: boolean;
  conversionWarnings: string[];
};

/**
 * Aggregates prior structure evidence without treating an unconvertible row as
 * zero. One unresolved eligible row makes the whole item/structure subtotal
 * unknown; valid advisory warnings remain attached to otherwise-known credit.
 */
export function aggregateStructureActualCredits(
  dprs: StructureActualEvidence[],
  projectId: number,
  beforeDate: string,
  boqItems: Array<DprConversionItem & { id: number }>,
): Map<string, StructureActualCredit> {
  const working = new Map<string, {
    knownTotal: number;
    actualIncomplete: boolean;
    conversionWarnings: Set<string>;
  }>();

  dprs
    .filter((dpr) => dpr.boqProjectId === projectId && dpr.date < beforeDate)
    .forEach((dpr) => {
      (dpr.structureItems || []).forEach((row) => {
        if (row.boqItemId == null || !row.structureId || row.quantity == null) return;
        const key = `${row.boqItemId}::${row.structureId}`;
        const state = working.get(key) ?? {
          knownTotal: 0,
          actualIncomplete: false,
          conversionWarnings: new Set<string>(),
        };
        const boqItem = boqItems.find((item) => item.id === row.boqItemId);
        const conversion = resolveDprUnitConversion(
          { ...row, kind: "structure" },
          boqItem,
          row.dprConversionFactor,
        );
        conversion.warnings.forEach((warning) => state.conversionWarnings.add(warning));
        if (conversion.factor == null) {
          state.actualIncomplete = true;
        } else {
          state.knownTotal = Math.round(
            (state.knownTotal + Number(row.quantity) * conversion.factor) * 1000,
          ) / 1000;
        }
        working.set(key, state);
      });
    });

  return new Map(Array.from(working, ([key, state]) => [key, {
    totalActual: state.actualIncomplete ? null : state.knownTotal,
    actualIncomplete: state.actualIncomplete,
    conversionWarnings: Array.from(state.conversionWarnings),
  }]));
}