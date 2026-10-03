// @vitest-environment jsdom
import React, { useState } from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, renderHook, act } from "@testing-library/react";
import { newResourceRow, resourceSuggestion, chooseResourceItem, suggestResourceItem, suggestedEquipmentSegment, todaysResourceActivities, type SuggestionRow } from "../client/src/lib/resourceSuggestions";
import { useResourceSuggestions } from "../client/src/hooks/use-resource-suggestions";
import { useEquipmentResourceSuggestions } from "../client/src/hooks/use-equipment-resource-suggestions";
import { DprEquipmentCompact, type DprEquipmentFields } from "../client/src/components/DprEquipmentCompact";
import { ResourceWorkItemSelect } from "../client/src/components/ResourceWorkItemSelect";
import { DprReadinessDialog } from "../client/src/components/DprReadinessDialog";
import { equipmentReadinessAttribution, remapAttributionAdvisories } from "../client/src/lib/resourceReadiness";
import type { DprReadinessResult } from "../shared/dprSubmitReadiness";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const attribution = { section: "equipment" as const, label: "Roller", rowIndex: 0,
  message: "Roller not linked to a work item — link it or mark General" };
describe("BOQ-LINK-01 attribution readiness integration", () => {
  it("keeps hydrated saved assignments and scope when write payload omits assignments", () => {
    const saved = { activitySegments: [{ startTime: "08:00", endTime: "12:00", boqItems: [{ boqItemId: 17 }] }],
      activityAllocations: [{ boqItemId: 29, hoursWorked: 2 }], resourceScope: "general" };
    const payload = { openingReading: 107, closingReading: 111, hoursWorked: 4, diesel: 12 };
    const readiness = equipmentReadinessAttribution(payload, saved);
    expect(readiness.activitySegments).toBe(saved.activitySegments);
    expect(readiness.activityAllocations).toBe(saved.activityAllocations);
    expect(readiness.resourceScope).toBe("general");
    expect(payload).not.toHaveProperty("activitySegments");
    expect(readiness).toMatchObject(payload);
  });
  it("maps only attribution advice to actual UI row indexes without changing mandatory outcomes", () => {
    const mandatory = [{ section: "equipment" as const, label: "Roller", rowIndex: 0, message: "closing reading missing" }];
    const oldAdvice = { section: "equipment" as const, label: "Roller", rowIndex: 0, message: "diesel norm exceeded" };
    const before: DprReadinessResult = { ready: false, mandatory, advisories: [attribution, oldAdvice] };
    const after = remapAttributionAdvisories(before, { equipment: [3] });
    expect(after.mandatory).toBe(mandatory);
    expect(after.ready).toBe(false);
    expect(after.advisories[0].rowIndex).toBe(3);
    expect(after.advisories[1]).toBe(oldAdvice);
    expect(before.advisories[0].rowIndex).toBe(0);
  });
  it("jumps from new attribution advisory and still offers Submit anyway", () => {
    const jump = vi.fn(), submit = vi.fn(), close = vi.fn();
    render(<DprReadinessDialog readiness={{ ready: true, mandatory: [], advisories: [attribution] }}
      onClose={close} onSubmitAnyway={submit} onAdvisoryIssue={jump} />);
    fireEvent.click(screen.getByTestId("button-readiness-advisory-equipment-0"));
    expect(jump).toHaveBeenCalledWith(attribution);
    fireEvent.click(screen.getByTestId("button-readiness-submit-anyway"));
    expect(close).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledOnce();
  });
  it("keeps mandatory blocking and mandatory callback unchanged", () => {
    const jumpMandatory = vi.fn(), jumpAdvisory = vi.fn();
    const mandatory = { section: "equipment" as const, label: "Roller", rowIndex: 2, message: "closing reading missing" };
    render(<DprReadinessDialog readiness={{ ready: false, mandatory: [mandatory], advisories: [attribution] }}
      onClose={vi.fn()} onSubmitAnyway={vi.fn()} onMandatoryIssue={jumpMandatory} onAdvisoryIssue={jumpAdvisory} />);
    expect(screen.queryByTestId("button-readiness-submit-anyway")).toBeNull();
    fireEvent.click(screen.getByTestId("button-readiness-issue-equipment-0"));
    expect(jumpMandatory).toHaveBeenCalledWith(mandatory);
    expect(jumpAdvisory).not.toHaveBeenCalled();
  });
});
const activities = [{ boqItemId: 17, programmeBarId: 71 }];
const items = [{ id: 17, displayName: "WMM" }, { id: 29, displayName: "GSB" }];
const timed = { machine: "DG set", startTime: "08:15", endTime: "16:45", dieselSource: "contractor" };

describe("BOQ-LINK-01 frontend B–F and saved-row protection", () => {
  it("B: suggests labour and exactly one full-clock equipment segment without a legacy parent link", () => {
    const labour = suggestResourceItem(newResourceRow({ boqItemId: null }), [17]);
    expect(labour.boqItemId).toBe(17);
    expect(labour[resourceSuggestion]).toBe("suggested");
    render(<ResourceWorkItemSelect row={labour} items={items} activityIds={[17]} onChange={vi.fn()} testId="work-item" />);
    expect(screen.getByTestId("work-item").textContent).toContain("WMM");
    expect(screen.getByText("Suggested from today's activity — change if wrong")).toBeTruthy();
    const segment = suggestedEquipmentSegment(timed, [17], [{ id: 71, boqItemId: 17 }]);
    expect(segment).toEqual([{ startTime: "08:15", endTime: "16:45", boqItems: [{ boqItemId: 17, programmeBarId: 71 }] }]);
    expect(JSON.stringify(segment)).not.toContain("hoursWorked");
  });

  it("B: meter-only machine stays unassigned, with no invented times", () => {
    expect(suggestedEquipmentSegment({}, [17], [{ id: 71, boqItemId: 17 }])).toEqual([]);
    const cb = vi.fn();
    render(<DprEquipmentCompact row={{ machine: "Roller", openingReading: 145, closingReading: 151, dieselSource: "contractor" }}
      suggestNewRow activityIds={[17]} programmeBars={[{ id: 71, boqItemId: 17 }]} onWorkAssignmentChange={cb} onChange={vi.fn()} />);
    expect(cb).not.toHaveBeenCalled();
  });

  it("C: multiple activities or multiple distinct bars never guess; duplicate bar rows are one bar", () => {
    expect(suggestResourceItem(newResourceRow({ boqItemId: null }), [17, 29]).boqItemId).toBeNull();
    expect(suggestedEquipmentSegment(timed, [17, 29], [{ id: 71, boqItemId: 17 }])).toEqual([]);
    expect(suggestedEquipmentSegment(timed, [17], [{ id: 71, boqItemId: 17 }, { id: 72, boqItemId: 17 }])).toEqual([]);
    expect(suggestedEquipmentSegment(timed, [17], [{ id: 71, boqItemId: 17 }, { id: 71, boqItemId: 17 }])).toHaveLength(1);
    expect(todaysResourceActivities([{ boqItemId: 29 }, { boqItemId: 17 }, { boqItemId: 29 }, { boqItemId: 33, noSiteWork: true }])).toEqual([29, 17]);
  });

  it("D: live progress edits recompute only untouched new suggestions, including newly added rows", () => {
    const { result, rerender } = renderHook(({ progress }) => {
      const [rows, setRows] = useState<SuggestionRow[]>([]);
      useResourceSuggestions(progress, rows, setRows);
      return { rows, setRows };
    }, { initialProps: { progress: activities } });
    act(() => result.current.setRows([newResourceRow({ boqItemId: null }), newResourceRow({ boqItemId: null })]));
    expect(result.current.rows.map(row => row.boqItemId)).toEqual([17, 17]);
    act(() => result.current.setRows(rows => rows.map((row, i) => i === 0 ? chooseResourceItem(row, "29") : row)));
    rerender({ progress: [...activities, { boqItemId: 29, programmeBarId: 81 }] });
    expect(result.current.rows.map(row => row.boqItemId)).toEqual([29, null]);
    rerender({ progress: [{ boqItemId: 29, programmeBarId: 81 }] });
    expect(result.current.rows.map(row => row.boqItemId)).toEqual([29, 29]);
  });

  it("E: General clears labour/material links and explicit item selection clears General", () => {
    const general = chooseResourceItem({ boqItemId: 17, structureId: "reach-4" }, "general");
    expect(general).toMatchObject({ boqItemId: null, structureId: null, resourceScope: "general" });
    expect(chooseResourceItem(general, "29")).toMatchObject({ boqItemId: 29, resourceScope: null });
  });

  it("E: equipment General cancellation preserves assignments; confirmation clears through segment callback", () => {
    const cb = vi.fn(), patch = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<DprEquipmentCompact row={{ ...timed, activitySegments: suggestedEquipmentSegment(timed, [17], [{ id: 71, boqItemId: 17 }]) }}
      onWorkAssignmentChange={cb} onChange={patch} />);
    fireEvent.click(screen.getByTestId("equipment-general-0"));
    expect(confirm).toHaveBeenCalled();
    expect(cb).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByTestId("equipment-general-0"));
    expect(cb).toHaveBeenCalledWith([], "manual");
    expect(patch).toHaveBeenCalledWith(expect.objectContaining({ resourceScope: "general" }));
    expect(patch.mock.calls.every(([value]) => !Object.hasOwn(value, "boqItemId"))).toBe(true);
  });

  it("B/D: equipment suggestion uses segment callback and updates while untouched", () => {
    function Machine({ ids }: { ids: number[] }) {
      const [row, setRow] = useState<DprEquipmentFields>(newResourceRow(timed));
      return <DprEquipmentCompact row={row} suggestNewRow activityIds={ids} programmeBars={[{ id: 71, boqItemId: 17 }]}
        onChange={patch => setRow(old => ({ ...old, ...patch }))}
        onWorkAssignmentChange={(segments, source) => setRow(old => ({ ...old, activitySegments: segments,
          [resourceSuggestion]: source === "suggestion" ? "suggested" : "manual" }))} />;
    }
    const { rerender } = render(<Machine ids={[17]} />);
    expect(screen.getByText("Suggested from today's activity — change if wrong")).toBeTruthy();
    rerender(<Machine ids={[17, 29]} />);
    expect(screen.queryByText("Suggested from today's activity — change if wrong")).toBeNull();
  });

  it("F: Issued defaults; Received never defaults, and changing a new row to Issued enables suggestion", () => {
    const { result } = renderHook(() => {
      const [rows, setRows] = useState([newResourceRow({ type: "Received", boqItemId: null }), newResourceRow({ type: "Issued", boqItemId: null })]);
      useResourceSuggestions(activities, rows, setRows, true);
      return { rows, setRows };
    });
    expect(result.current.rows.map(row => row.boqItemId)).toEqual([null, 17]);
    act(() => result.current.setRows(rows => rows.map(row => ({ ...row, type: "Issued" }))));
    expect(result.current.rows.map(row => row.boqItemId)).toEqual([17, 17]);
    act(() => result.current.setRows(rows => rows.map(row => ({ ...row, type: "Received" }))));
    expect(result.current.rows.map(row => row.boqItemId)).toEqual([null, null]);
  });

  it("H: hydration has no suggestion provenance; all saved values remain untouched", () => {
    const oldRows = [{ boqItemId: null, resourceScope: null }, { boqItemId: 29, resourceScope: null }, { boqItemId: null, resourceScope: "general" }];
    oldRows.forEach(row => expect(suggestResourceItem(row, [17])).toBe(row));
    const saved = { ...newResourceRow({ boqItemId: null }), persistedId: 481 };
    expect(suggestResourceItem(saved, [17])).toBe(saved);
    const restored = JSON.parse(JSON.stringify(newResourceRow({ boqItemId: 29, resourceScope: null })));
    expect(suggestResourceItem(restored, [17])).toBe(restored);
    expect(Object.getOwnPropertySymbols(restored)).toHaveLength(0);
  });

  it("D: Guided equipment suggestions stay current while the equipment editor is unmounted", () => {
    const { result, rerender } = renderHook(({ progress }) => {
      const [rows, setRows] = useState<DprEquipmentFields[]>([newResourceRow(timed)]);
      useEquipmentResourceSuggestions(rows, progress, row => row, row => row[resourceSuggestion] != null,
        (index, segments) => setRows(old => old.map((row, i) => index === i
          ? { ...row, activitySegments: segments, [resourceSuggestion]: "suggested" } : row)));
      return { rows, setRows };
    }, { initialProps: { progress: activities } });
    expect(result.current.rows[0].activitySegments).toHaveLength(1);
    rerender({ progress: [...activities, { boqItemId: 29, programmeBarId: 81 }] });
    expect(result.current.rows[0].activitySegments).toEqual([]);
    act(() => result.current.setRows(old => old.map(row => ({ ...row, [resourceSuggestion]: "manual",
      activitySegments: [{ startTime: "09:00", endTime: "11:30", boqItems: [{ boqItemId: 29, programmeBarId: 81 }] }] }))));
    rerender({ progress: activities });
    expect(result.current.rows[0].activitySegments?.[0].boqItems[0].boqItemId).toBe(29);
  });
});