// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DeleteGate } from "../client/src/components/DeleteGate";
import { ReportExportGate } from "../client/src/components/ReportExportGate";
import { useAuth } from "../client/src/lib/auth-context";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("DeleteGate authentication boundary", () => {
  it("denies deletion without a provider, without crashing the surrounding widget", () => {
    render(<div><span>Notification settings</span><DeleteGate sections={["dashboard"]}><button>Delete</button></DeleteGate><ReportExportGate sections={["dashboard"]}><button>Export</button></ReportExportGate></div>);
    expect(screen.getByText("Notification settings")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
  });
  it("does not silently relax the ordinary required-auth hook", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function RequiredConsumer() { useAuth(); return null; }
    expect(() => render(<RequiredConsumer />)).toThrow("useAuth must be used inside <AuthProvider>");
  });
});
