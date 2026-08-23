// @vitest-environment jsdom
// 06W-HF3 Part B — BOQ project header display.
// Root cause under test: the action-button block was `flex-shrink-0` with no
// wrap, starving the `flex-1 min-w-0` title column to ~0px on laptop widths —
// title ellipsed to one character, summary spans wrapped one word per line.
// The fix is layout-only: wrapping/shrinkable action block, minimum title
// column width, and display-time whitespace normalisation for summary fields.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ProjectHeader } from "@/pages/BoqProjectDetail";

afterEach(() => cleanup());

const BASE_PROJECT = {
  name: "Takkadpally-sirur",
  status: "active",
  contractNo: "C-2026/NH/037",
  client: "NHAI PIU Hyderabad",
  contractor: "ABC Constructions Pvt Ltd",
  roadLengthKm: 12.5,
  startDate: "2026-05-25",
};

describe("06W-HF3 BOQ project header display", () => {
  it("G: a long project name renders fully in the DOM with ellipsis truncation, not cut to one character", () => {
    const longName = "Takkadpally-sirur to Somewhere Very Far Away Package XVII Balance Works";
    render(<ProjectHeader project={{ ...BASE_PROJECT, name: longName }} />);
    const title = screen.getByTestId("text-project-title");
    // Full name present — any shortening is CSS ellipsis, never a hard cut.
    expect(title.textContent).toBe(longName);
    expect(title.className).toContain("truncate");
    // The title column keeps a readable minimum width instead of collapsing to 0.
    expect(screen.getByTestId("project-header-titleblock").className).toContain("min-w-[min(280px,100%)]");
  });

  it("H: embedded line breaks in contract/client/contractor render as a normal single line", () => {
    render(<ProjectHeader project={{
      ...BASE_PROJECT,
      contractNo: "C-2026/\nNH/\n037",
      client: "National\nHighways\nAuthority\nof\nIndia",
      contractor: "ABC\r\nConstructions\r\nPvt Ltd",
    }} />);
    const summary = screen.getByTestId("text-project-summary").textContent ?? "";
    expect(summary).toContain("Contract: C-2026/ NH/ 037");
    expect(summary).toContain("National Highways Authority of India");
    expect(summary).toContain("ABC Constructions Pvt Ltd");
    expect(summary).not.toMatch(/[\r\n]/);
  });

  it("I: action buttons render beside the header block — wrapping/shrinkable, never a rigid no-shrink block", () => {
    render(
      <ProjectHeader project={BASE_PROJECT}>
        <button type="button">Settings</button>
        <button type="button">Import BOQ</button>
      </ProjectHeader>,
    );
    const header = screen.getByTestId("project-header");
    const actions = screen.getByTestId("project-header-actions");
    // Actions live in the same flex row as the title block (siblings).
    expect(actions.parentElement).toBe(header);
    expect(header.className).toContain("flex");
    expect(header.className).toContain("flex-wrap");
    // The regression: a flex-shrink-0 non-wrapping block starved the title.
    expect(actions.className).not.toContain("flex-shrink-0");
    expect(actions.className).toContain("flex-wrap");
    // Bounded flex basis (3 1 0%) + a 420px min floor: hypothetical main size
    // is 420px, not the ~1100px button max-content — so the block is placed
    // beside the title on desktop flex lines instead of wrapping below it.
    expect(actions.className).toContain("flex-[3_1_0%]");
    expect(actions.className).toContain("min-w-[min(420px,100%)]");
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByText("Import BOQ")).toBeTruthy();
  });

  it("J: a project with short, clean values renders exactly as before", () => {
    render(<ProjectHeader project={BASE_PROJECT} activeRevision={{ label: "R1" }} />);
    expect(screen.getByTestId("text-project-title").textContent).toBe("Takkadpally-sirur");
    expect(screen.getByText("ACTIVE")).toBeTruthy();
    expect(screen.getByText("R1")).toBeTruthy();
    const summary = screen.getByTestId("text-project-summary").textContent ?? "";
    expect(summary).toContain("Contract: C-2026/NH/037");
    expect(summary).toContain("· NHAI PIU Hyderabad");
    expect(summary).toContain("· ABC Constructions Pvt Ltd");
    expect(summary).toContain("· 12.5 km");
    expect(summary).toContain("· Start: 2026-05-25");
  });

  it("J: optional fields absent — no separators or fragments are emitted for them", () => {
    render(<ProjectHeader project={{ name: "Short", status: "draft" }} />);
    const summary = screen.getByTestId("text-project-summary").textContent ?? "";
    expect(summary).toBe("");
  });
});
