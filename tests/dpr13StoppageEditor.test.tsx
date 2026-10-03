// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BreakdownStoppageEditor, type StagedBreakdown } from "@/components/BreakdownStoppageEditor";

afterEach(cleanup);
const saved: StagedBreakdown = {
  clientKey: "synthetic-stoppage-key", maintenanceLogId: 18401,
  fromTime: "09:00", toTime: "10:00", description: "Synthetic stoppage",
  responsibility: "vendor", repairScope: "hlc", debitableToVendor: true,
  remarks: "Original remarks",
  attachment: { fileName: "synthetic-evidence.pdf", objectPath: "/synthetic/evidence", mimeType: "application/pdf", fileSize: 42 },
};

describe("DPR draft stoppage editor", () => {
  it("preserves persisted identifiers, attribution and evidence while editing local fields", () => {
    const changed = vi.fn();
    render(<BreakdownStoppageEditor draftOnly value={[saved]} onChange={changed} />);
    expect(screen.queryByText(/Draft saves do not create or update maintenance ledger entries/)).toBeNull();
    expect(screen.getByTestId("breakdown-editor").getAttribute("data-draft-only")).toBe("true");
    expect(screen.getByTestId("breakdown-attachment-0").textContent).toContain(saved.attachment!.fileName);
    fireEvent.change(screen.getByTestId("breakdown-remarks-0"), { target: { value: "Corrected remarks" } });
    expect(changed).toHaveBeenLastCalledWith([{ ...saved, remarks: "Corrected remarks" }]);
    fireEvent.click(screen.getByTestId("breakdown-debitable-0"));
    expect(changed).toHaveBeenLastCalledWith([{ ...saved, debitableToVendor: false }]);
  });
  it("replaces uploaded evidence without silently retaining the old object; cancel is a no-op", () => {
    const changed = vi.fn();
    function Harness() {
      const [rows, setRows] = useState([saved]);
      return <BreakdownStoppageEditor value={rows} onChange={next => { changed(next); setRows(next); }} />;
    }
    render(<Harness />);
    const file = new File(["new evidence"], "synthetic-replacement.txt", { type: "text/plain" });
    fireEvent.change(screen.getByTestId("breakdown-file-0"), { target: { files: [file] } });
    expect(changed).toHaveBeenLastCalledWith([{ ...saved, attachment: undefined, file }]);
    expect(screen.getByTestId("breakdown-attachment-0").textContent).toContain("Selected: synthetic-replacement.txt");
    fireEvent.change(screen.getByTestId("breakdown-file-0"), { target: { files: [] } });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("breakdown-attachment-0").textContent).toContain("synthetic-replacement.txt");
  });
});