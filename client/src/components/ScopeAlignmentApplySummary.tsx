import { Button } from "@/components/ui/button";

export type ScopeAlignmentNotUpdated = { barId: number | null; itemName: string; reason: string };
export type ScopeAlignmentOutsideRow = {
  rowKey: string;
  barLabel: string;
  itemCode: string | null;
  itemName: string;
};
export type ScopeAlignmentApplyResult = {
  updatedCount: number;
  notUpdated: ScopeAlignmentNotUpdated[];
};

export function ScopeAlignmentApplySummary({
  updateCount,
  outsideRows,
  result,
  onReview,
}: {
  updateCount: number;
  outsideRows: ScopeAlignmentOutsideRow[];
  result?: ScopeAlignmentApplyResult | null;
  onReview: () => void;
}) {
  if (!updateCount && !outsideRows.length && !result) return null;
  return (
    <div className="mb-3 space-y-2" data-testid="scope-alignment-summary">
      {updateCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
          <span className="font-medium">{updateCount} bars to update</span>
          <Button size="sm" variant="outline" onClick={onReview}>Review and update bars</Button>
        </div>
      )}
      {outsideRows.length > 0 && (
        <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm">
          <p className="font-medium">{outsideRows.length} bars are outside the scope — remove them in the programme</p>
          <ul className="mt-1 list-inside list-disc text-xs text-slate-700">
            {outsideRows.map(row => (
              <li key={row.rowKey}>{row.barLabel} · {row.itemCode ? `[${row.itemCode}] ` : ""}{row.itemName}</li>
            ))}
          </ul>
        </div>
      )}
      {result && (
        <div role="status" data-testid="scope-alignment-result" className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950">
          <p className="font-semibold">{result.updatedCount} bars updated</p>
          {result.notUpdated.length > 0 ? (
            <>
              <p className="mt-1">{result.notUpdated.length} not updated:</p>
              <ul className="mt-1 list-inside list-disc text-xs">
                {result.notUpdated.map((row, index) => (
                  <li key={`${row.barId ?? "bar"}-${index}`}>
                    {row.barId == null ? "Bar" : `#${row.barId}`} · {row.itemName} — {row.reason}
                  </li>
                ))}
              </ul>
            </>
          ) : <p className="mt-1 text-xs">Every applicable Update row was saved.</p>}
        </div>
      )}
    </div>
  );
}
