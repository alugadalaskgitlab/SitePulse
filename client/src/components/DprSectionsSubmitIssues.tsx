import { Button } from "@/components/ui/button";
import type { DprReadinessIssue } from "@shared/dprSubmitReadiness";
import type { ChainageOverlapHit } from "@shared/chainageOverlap";

export type DprSubmitIssue = DprReadinessIssue & { overlaps?: ChainageOverlapHit[] };
export type DprSubmitIssueAction = "chainage" | "reason" | "fix";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function chainage(km: number): string {
  const metres = Math.round(km * 1000);
  const wholeKm = Math.floor(metres / 1000);
  return `${wholeKm}+${String(metres - wholeKm * 1000).padStart(3, "0")}`;
}
function shortDate(value: string | null): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month}` : value;
}

export function describeSubmitOverlap(issue: DprSubmitIssue, hit: ChainageOverlapHit): string {
  const metres = Math.round((hit.segmentToKm - hit.segmentFromKm) * 1000);
  const segment = `${chainage(hit.segmentFromKm)}–${chainage(hit.segmentToKm)} (${metres} m)`;
  const prior = hit.withDprId == null
    ? "overlaps another row in this DPR"
    : `is also in DPR #${hit.withDprId}${shortDate(hit.withDprDate) ? ` (${shortDate(hit.withDprDate)})` : ""}`;
  return `${issue.label} ${segment} ${prior}. Correct the chainage or give a reason.`;
}

export function DprSectionsSubmitIssues({
  issues, onAction,
}: {
  issues: DprSubmitIssue[];
  onAction: (issue: DprSubmitIssue, action: DprSubmitIssueAction) => void;
}) {
  if (!issues.length) return null;
  return <aside role="alert" aria-label="Submission issues" className="space-y-3 rounded border border-destructive/50 bg-destructive/5 p-4" data-testid="submit-issues">
    <h2 className="font-semibold">Resolve these items before submitting</h2>
    {issues.map((issue, index) => {
      const overlaps = issue.overlaps ?? [];
      return <div key={`${issue.section}-${issue.rowKey ?? issue.rowIndex ?? index}-${issue.message}`} className="space-y-2 text-sm">
        {overlaps.length
          ? overlaps.map((hit, hitIndex) => <p key={hitIndex}>{describeSubmitOverlap(issue, hit)}</p>)
          : <p>{issue.label}: {issue.message}</p>}
        <div className="flex flex-wrap gap-2">
          {overlaps.length ? <>
            <Button type="button" size="sm" variant="outline" onClick={() => onAction(issue, "chainage")}>Correct chainage</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => onAction(issue, "reason")}>Give reason</Button>
          </> : <Button type="button" size="sm" variant="outline" onClick={() => onAction(issue, "fix")}>Fix</Button>}
        </div>
      </div>;
    })}
  </aside>;
}
