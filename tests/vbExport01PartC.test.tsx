// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import SiteReport from "../client/src/pages/SiteReport";
import { buildManagementShare } from "../client/src/lib/dprManagementPresentation";

const state = vi.hoisted(() => ({ dpr: null as any, receipts: [] as any[] }));
vi.mock("@/hooks/use-dprs", () => ({
  useDpr: () => ({ data: state.dpr, isLoading: false, error: null }),
}));
vi.mock("wouter", () => ({
  useRoute: () => [true, { id: "271" }],
  useLocation: () => ["/", vi.fn()],
  useSearch: () => "",
  Link: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ sectionCan: () => false, user: { isAdmin: false } }),
}));
vi.mock("@tanstack/react-query", async importOriginal => ({
  ...await importOriginal<typeof import("@tanstack/react-query")>(),
  useQuery: () => ({ data: [], isPending: false, isError: false }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-dpr-boq-items", () => ({ useDprBoqItems: () => ({ items: [] }) }));
vi.mock("@/hooks/use-dpr-material-receipts", () => ({
  useDprMaterialReceipts: () => ({ data: state.receipts, isPending: false, isError: false }),
}));
vi.mock("@/hooks/use-dpr-equipment-performance", () => ({
  useDprEquipmentPerformance: () => ({ data: null, isLoading: false, isFetching: false, error: null }),
}));
vi.mock("@/components/EditPermissionButton", () => ({ EditPermissionButton: () => null }));
vi.mock("@/components/CancelDialog", () => ({ default: () => null }));
vi.mock("@/components/HistoryDialog", () => ({ default: () => null }));
// Summary assertions use the real page and presentation helpers; unrelated tables are omitted.
vi.mock("@/components/DprActivityReadOnly", () => ({ DprActivityReadOnly: () => null }));
vi.mock("@/components/DprEquipmentReadOnlyRow", () => ({
  DprEquipmentReadOnlyRow: () => null, DprEquipmentReadOnlyTable: () => null,
}));
vi.mock("@/components/DprMaterialsReceived", () => ({ DprMaterialsReceived: () => null }));

const activity = (activity: string, quantity: number, uom: string) => ({ activity, quantity, uom });
const receipt = (material: string, quantity: number, source = "trip") => ({ material, quantity, uom: "MT", source });
const summary = () => render(<SiteReport />).container.querySelector(".dpr-management-summary")!;
const tile = (root: Element, name: string) => root.querySelector(`.dpr-management-tile-${name}`)!;
const detail = (root: Element) => root.querySelector(".dpr-management-summary-list")?.textContent;

beforeEach(() => {
  state.dpr = {
    id: 271, site: "River Crossing", date: "2026-08-07", engineer: "Mira",
    progress: [activity("WMM", 56.25, "Cum")],
    equipment: [{ id: 1, equipmentId: 1, usageStatus: "working", diesel: 31.7 }],
    labour: [{ count: 17 }], materials: [], sitePurchases: [],
  };
  state.receipts = [receipt("WMM", 141.03)];
});
afterEach(cleanup);

describe("VB-EXPORT-01 Part C summary tiles", () => {
  it("puts the exact headings first, values second and details last, without money", () => {
    state.dpr.equipment[0].rate = 9876.54;
    state.dpr.labour[0].amount = 9876.54;
    const root = summary();
    expect([...root.querySelectorAll(".dpr-management-tile-heading")].map(el => el.textContent))
      .toEqual(["Work done", "Equipment", "Diesel", "Labour", "Materials received"]);
    for (const el of [...root.children]) {
      expect(el.children[0].className).toBe("dpr-management-tile-heading");
      expect(el.children[1].tagName).toBe("STRONG");
      if (el.children[2]) expect(el.children[2].className).toBe("dpr-management-summary-list");
    }
    expect([...root.querySelectorAll("strong")].map(el => el.textContent))
      .toEqual(["56.25 Cum", "1", "31.7 L", "17", "141.03 MT"]);
    expect(detail(tile(root, "work"))).toBe("WMM");
    expect(detail(tile(root, "machines"))).toBe("all worked");
    expect(detail(tile(root, "bulk"))).toBe("WMM 141.03 MT (1 trips)");
    expect(root.textContent).not.toMatch(/Bulk|₹|9876|9,876|rate|amount/i);
  });

  it("retains three native activity quantities and two material groups with trip counts", () => {
    state.dpr.progress.push(activity("Clearing", 0.5, "Ha"), activity("Marking", 250, "m"));
    state.receipts = [
      ...Array.from({ length: 5 }, () => receipt("WMM", 28.206)),
      ...Array.from({ length: 3 }, () => receipt("Soil", 20)),
    ];
    const root = summary();
    expect(tile(root, "work").querySelector("strong")?.textContent).toBe("3 items");
    expect(detail(tile(root, "work"))).toBe("WMM 56.25 Cum · Clearing 0.5 Ha · Marking 250 m");
    expect(tile(root, "bulk").querySelector("strong")?.textContent).toBe("2 materials");
    expect(detail(tile(root, "bulk"))).toBe("WMM 141.03 MT (5 trips) · Soil 60 MT (3 trips)");
  });

  it("keeps truncation, incidental markers and no-site-work exclusions", () => {
    state.dpr.progress = [
      { ...activity("WMM", 56.25, "Cum"), isIncidental: true },
      activity("Clearing", 0.5, "Ha"), activity("Marking", 250, "m"),
      activity("Excavation", 8.7, "Cum"), { ...activity("Omitted", 92, "m"), noSiteWork: true },
    ];
    const root = summary();
    expect(tile(root, "work").querySelector("strong")?.textContent).toBe("4 items");
    expect(detail(tile(root, "work"))).toBe("WMM 56.25 Cum (incidental) · Clearing 0.5 Ha · Marking 250 m · +1 more");
  });

  it("preserves attention counts and their existing colour classes", () => {
    state.dpr.equipment = [
      { id: 1, usageStatus: "breakdown" }, { id: 2, usageStatus: "idle_no_work" },
      { id: 3, usageStatus: "idle_no_operator" },
      { id: 4, usageStatus: "working", breakdowns: [{ eventType: "breakdown" }] },
    ];
    const machines = tile(summary(), "machines");
    expect(machines.querySelector("strong")?.textContent).toBe("4");
    expect(detail(machines)).toBe("1 breakdown, 2 idle, 1 part-day breakdown");
    expect([...machines.querySelectorAll(".dpr-management-attention-breakdown")].map(el => el.textContent))
      .toEqual(["1 breakdown", "1 part-day breakdown"]);
    expect(machines.querySelector(".dpr-management-attention-idle")?.textContent).toBe("2 idle");
  });

  it("preserves empty and zero-value conditional visibility", () => {
    state.dpr.progress = [];
    state.dpr.equipment = [];
    state.dpr.labour = [];
    state.receipts = [receipt("WMM", 0)];
    const root = summary();
    expect(root.children).toHaveLength(1);
    expect(tile(root, "work").querySelector("strong")?.textContent).toBe("No site work");
    expect(detail(tile(root, "work"))).toBeUndefined();
  });

  it("includes non-trip quantities without inflating transporter trips", () => {
    state.receipts = [receipt("WMM", 41.03), receipt("WMM", 100, "purchase")];
    const materials = tile(summary(), "bulk");
    expect(materials.querySelector("strong")?.textContent).toBe("141.03 MT");
    expect(detail(materials)).toBe("WMM 141.03 MT (1 trips)");
  });

  it("uses the specified heading style without changing widths, phone stacking or print values", () => {
    const css = readFileSync("client/src/components/dprManagement.css", "utf8");
    const heading = css.match(/\.dpr-management-summary \.dpr-management-tile-heading \{([^}]+)\}/)![1];
    for (const rule of ["font-size: 12.5px", "font-weight: 700", "color: #334155", "letter-spacing: normal", "text-transform: none"]) {
      expect(heading).toContain(rule);
    }
    expect(css).toContain(".dpr-management-summary strong { display: block; font-size: 19px; white-space: nowrap; }");
    expect(css).toContain(".dpr-management-summary { display: flex; flex-direction: column;");
    expect(css).toContain(".dpr-management-summary > div { width: 100%;");
    const desktop = css.split("@media screen and (min-width: 768px)")[1].split(".dpr-management-table")[0];
    const print = css.split("@media print")[1];
    for (const block of [desktop, print]) {
      expect(block).toContain("flex-direction: row");
      expect(block).toContain(".dpr-management-tile-bulk { flex-grow: 2.2; }");
      expect(block).toContain(".dpr-management-tile-work,");
      expect(block).toContain(".dpr-management-tile-diesel { flex-grow: .85; }");
      expect(block).toContain(".dpr-management-tile-labour { flex-grow: .7; }");
    }
    expect(print).toContain(".dpr-management-summary strong { font-size: 11pt; }");
  });

  it("renames only the WhatsApp materials heading while preserving recorded quantities and no money", () => {
    state.dpr.equipment[0].rate = 9876.54;
    expect(buildManagementShare(state.dpr, state.dpr.equipment, state.receipts)).toBe([
      "River Crossing · 2026-08-07 · DPR #271",
      "Work done: WMM: 56.25 Cum",
      "Machines: 1/1 working · 0 idle · 0 breakdown",
      "Diesel issued: 31.7 L", "Labour: 17",
      "Materials received: 141.03 MT WMM (1 trips)", "Remarks: none recorded",
    ].join("\n"));
    expect(buildManagementShare(state.dpr, [], [])).toContain("Materials received: none recorded");
  });
});