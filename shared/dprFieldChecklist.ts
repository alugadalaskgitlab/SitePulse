/**
 * shared/dprFieldChecklist.ts — Batch 05: real completeness for the Field Home
 * "Pending Before Submit" checklist.
 *
 * Rule (spec §6): a section is NOT done merely because rows exist. This module
 * derives per-section done/pending state and per-row pending detail from the
 * SAME Batch 04 readiness validator (`evaluateDprSubmitReadiness`) used by
 * every Final Submit path — no third completeness model.
 *
 *  - "done" = at least one real (non-placeholder) row exists AND the section
 *    has no mandatory readiness issues.
 *  - pending detail lines are the readiness messages, e.g.
 *    "JCB — closing meter reading required".
 *  - blank placeholder rows never warn (readiness already ignores them).
 */

import { evaluateDprSubmitReadiness, type DprReadinessIssue } from "./dprSubmitReadiness";

export type DprChecklistItem = {
  id: string;
  label: string;
  state: "done" | "pending";
  sub: string;
  /** per-row pending lines, e.g. "JCB — closing meter reading required" */
  details: string[];
};

export type DprChecklistResult = {
  items: DprChecklistItem[];
  /** rows still needing closure, per section (for badges/CTAs) */
  openActivities: number;
  openEquipment: number;
};

type DprLike = {
  workType?: string | null;
  progress?: any[] | null;
  equipment?: any[] | null;
  labour?: any[] | null;
  materials?: any[] | null;
} | null | undefined;

const hasText = (v: unknown): boolean => typeof v === "string" && v.trim() !== "";

function issueLines(issues: DprReadinessIssue[], section: string): string[] {
  return issues.filter((i) => i.section === section).map((i) => `${i.label} — ${i.message}`);
}

function sub(count: number, unit: string, details: string[], emptyMsg: string, doneMsg: string): string {
  if (count === 0) return emptyMsg;
  if (details.length === 0) return doneMsg;
  const shown = details.slice(0, 2).join(" · ");
  const more = details.length > 2 ? ` · +${details.length - 2} more` : "";
  return `${shown}${more}`;
}

export function deriveDprChecklist(dpr: DprLike, submitted: boolean): DprChecklistResult {
  const progress = (dpr?.progress ?? []).filter((p: any) => !p?.noSiteWork);
  const equipment = dpr?.equipment ?? [];
  const labour = dpr?.labour ?? [];
  const materials = dpr?.materials ?? [];

  const readiness = evaluateDprSubmitReadiness({
    workType: dpr?.workType,
    progress,
    equipment,
    labour,
    materials,
  });

  // Real (non-placeholder) row counts — mirror the readiness placeholder rules.
  const actCount = progress.filter((p: any) => hasText(p?.activity) || p?.boqItemId != null).length;
  const eqCount = equipment.filter((e: any) => hasText(e?.machine)).length;
  const labCount = labour.filter((l: any) => hasText(l?.category) || l?.count != null || hasText(l?.task) || hasText(l?.contractor)).length;
  const matCount = materials.filter((m: any) => hasText(m?.material)).length;

  const actIssues = issueLines(readiness.mandatory, "activities");
  const eqIssues = issueLines(readiness.mandatory, "equipment");
  const labIssues = issueLines(readiness.mandatory, "labour");
  const matIssues = issueLines(readiness.mandatory, "materials");

  // Distinct rows with pending issues (a row can raise 2 issues).
  const distinct = (lines: string[]) => new Set(lines.map((l) => l.split(" — ")[0])).size;
  const openActivities = distinct(actIssues);
  const openEquipment = distinct(eqIssues);

  const items: DprChecklistItem[] = [
    {
      id: "c1",
      label: "Equipment closing meter",
      state: eqCount > 0 && eqIssues.length === 0 ? "done" : "pending",
      sub: sub(eqCount, "equipment", eqIssues, "No equipment recorded yet", `${eqCount} equipment logged & closed`),
      details: eqIssues,
    },
    {
      id: "c2",
      label: "Final labour count",
      state: labCount > 0 && labIssues.length === 0 ? "done" : "pending",
      sub: sub(labCount, "labour", labIssues, "No labour entries yet", `${labCount} labour record${labCount === 1 ? "" : "s"}`),
      details: labIssues,
    },
    {
      id: "c3",
      label: "Material challan recorded",
      state: matCount > 0 && matIssues.length === 0 ? "done" : "pending",
      sub: sub(matCount, "material", matIssues, "No material entries yet", `${matCount} material log${matCount === 1 ? "" : "s"}`),
      details: matIssues,
    },
    {
      id: "c4",
      label: "Activity quantities entered",
      state: actCount > 0 && actIssues.length === 0 ? "done" : "pending",
      sub: sub(actCount, "activity", actIssues, "No activities recorded yet", `${actCount} activit${actCount === 1 ? "y" : "ies"} complete`),
      details: actIssues,
    },
    {
      id: "c5",
      label: "DPR submitted",
      state: submitted ? "done" : "pending",
      sub: submitted ? "Submitted successfully" : "Submit once all items are done",
      details: [],
    },
  ];

  return { items, openActivities, openEquipment };
}
