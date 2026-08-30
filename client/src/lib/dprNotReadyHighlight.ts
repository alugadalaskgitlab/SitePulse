/**
 * Instruction 06X — DPR_NOT_READY row highlight helper.
 *
 * Parses the raw DPR_NOT_READY server error to extract the first mandatory
 * issue's section + row target (rowIndex from readiness, or rowKey from the
 * chainage-overlap checker). Returns enough information for the caller to
 * scroll to and briefly highlight the exact row.
 *
 * Pure — no React, no DOM side-effects. Tested in tests/dpr06x.test.ts.
 */

export interface DprNotReadyRowTarget {
  /** "activities" | "equipment" | "labour" | "materials" */
  section: string;
  /**
   * Zero-based index into the section array (from DprReadinessIssue.rowIndex
   * or ChainageOverlapIssue.rowKey when it is a number).
   * null when neither is available.
   */
  rowIndex: number | null;
  /** Raw rowKey string, e.g. from the overlap checker. null when absent. */
  rowKey: string | number | null;
}

/**
 * Extract the first row target from a DPR_NOT_READY error thrown by
 * `apiRequest` (message format: "NNN: <raw JSON body>").
 *
 * Returns null when:
 *  - the error is not DPR_NOT_READY
 *  - there are no mandatory issues
 *  - parsing fails for any reason (defensive)
 */
export function extractNotReadyRowTarget(error: unknown): DprNotReadyRowTarget | null {
  if (!(error instanceof Error)) return null;

  // The error message is "NNN: <raw JSON body>"
  const match = error.message.match(/^\d{3}:\s*([\s\S]*)$/);
  if (!match) return null;

  let body: any;
  try {
    body = JSON.parse(match[1].trim());
  } catch {
    return null;
  }

  // DPR validation responses use { message, code }; accept the historical
  // `error` field too so locally cached/older responses remain actionable.
  if (body?.code !== "DPR_NOT_READY" && body?.error !== "DPR_NOT_READY") return null;

  // mandatory may come from evaluateDprSubmitReadiness (rowIndex) or
  // chainageOverlapReadinessIssues (rowKey).
  const mandatory: any[] = Array.isArray(body?.mandatory) ? body.mandatory
    : Array.isArray(body?.issues) ? body.issues
    : [];

  if (mandatory.length === 0) return null;

  const first = mandatory[0];
  const section: string = typeof first?.section === "string" ? first.section : "activities";

  // Prefer rowIndex (evaluateDprSubmitReadiness); fall back to rowKey (overlap).
  const rowIndex: number | null =
    typeof first?.rowIndex === "number" && Number.isFinite(first.rowIndex)
      ? first.rowIndex
      : typeof first?.rowKey === "number" && Number.isFinite(first.rowKey)
      ? first.rowKey
      : null;

  const rowKey: string | number | null =
    first?.rowKey != null ? first.rowKey : null;

  return { section, rowIndex, rowKey };
}

/**
 * Try to scroll to and briefly highlight a DPR form row based on the
 * section + rowIndex extracted from a DPR_NOT_READY error.
 *
 * Selector strategy (tried in order):
 *  1. `data-dpr-row-key="${section}-${rowIndex}"` — preferred; added by the
 *     updated forms via the `dprRowKey` helper.
 *  2. `[data-testid="card-entry-${rowIndex}"]` — GuidedDpr activity rows.
 *  3. `[data-testid="progress-row-${rowIndex}"]` — SiteEdit activity rows.
 *  4. Falls back silently (the caller already shows a toast).
 *
 * The highlight uses Tailwind classes added/removed via classList.
 */
export function scrollAndHighlightRow(
  target: DprNotReadyRowTarget | null,
  opts: { highlightDuration?: number } = {},
): void {
  if (!target) return;
  const { section, rowIndex } = target;
  if (rowIndex == null) return;

  const duration = opts.highlightDuration ?? 3000;

  // Selectors tried in preference order.
  const selectors = [
    `[data-dpr-row-key="${section}-${rowIndex}"]`,
    section === "activities"
      ? `[data-testid="card-entry-${rowIndex}"]`
      : `[data-testid="${section}-row-${rowIndex}"]`,
    `[data-testid="progress-row-${rowIndex}"]`,
  ];

  let el: Element | null = null;
  for (const sel of selectors) {
    el = document.querySelector(sel);
    if (el) break;
  }

  if (!el) return;

  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-destructive", "ring-offset-2");
  setTimeout(() => el?.classList.remove("ring-2", "ring-destructive", "ring-offset-2"), duration);
}

/**
 * Produce a `data-dpr-row-key` attribute value for a form row so
 * `scrollAndHighlightRow` can find it.
 *
 * Usage:
 *   <div data-dpr-row-key={dprRowKey("activities", idx)}>…</div>
 */
export function dprRowKey(section: string, idx: number): string {
  return `${section}-${idx}`;
}
