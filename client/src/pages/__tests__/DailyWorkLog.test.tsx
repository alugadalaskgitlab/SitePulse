// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  teamAllowed: true,
  context: {
    linked: true, personName: "ALPHA ENGINEER" as string | null, teamViewAllowed: true,
    sites: [{ id: 4, name: "ALLADURG PWD ROAD TO PAMPAD" }],
  },
  personal: { date: "2026-11-25", view: "personal", workEntries: [], visits: [], dprActivities: [], totalDurationMinutes: 0 },
  team: {
    date: "2026-11-25", view: "team",
    workEntries: [{
      id: 81, personnelId: 14, personName: "BETA ENGINEER", createdByUserId: 22,
      workDate: "2026-11-25", place: "Plant office", workType: "Other",
      siteId: null, siteName: null, durationMinutes: 120, details: "Checked the plant stock ledger.",
    }],
    visits: [{
      id: 92, recordedByPersonnelId: 14, personName: "BETA ENGINEER", recordedByUserId: 1,
      visitDate: "2026-11-25", place: "Head office", visitorName: "DEPARTMENT VISITOR",
      visitorDesignation: "Engineer", organisation: "Test department", purpose: "Meeting",
      pointsDiscussed: "Reviewed the level sheet fixture.", attachment: null,
    }],
    dprActivities: [{
      id: 91, dprId: 418, date: "2026-11-25", site: "ALLADURG PWD ROAD TO PAMPAD",
      personnelId: 14, personName: "BETA ENGINEER", type: "test", title: "Field density",
      details: "WMM · Result 97.8 · Required 97", resultPass: true,
      href: "/site/edit/418", place: "Site: ALLADURG PWD ROAD TO PAMPAD",
    }],
    totalDurationMinutes: 120,
  },
  apiRequest: vi.fn(),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: 1, isOwner: false },
    sectionCan: (_section: string, action: string) => action === "view_reports"
      ? fixture.teamAllowed : true,
    sectionVisible: () => true,
  }),
}));
vi.mock("@/hooks/use-upload", () => ({
  useUpload: () => ({ uploadFile: vi.fn(), isUploading: false }),
}));
vi.mock("@/lib/queryClient", () => ({
  apiRequest: fixture.apiRequest,
}));
vi.mock("@/components/AttachmentViewer", () => ({
  AttachmentViewer: ({ attachment, onClose }: any) => attachment
    ? <div role="dialog">{attachment.fileName}<button onClick={onClose}>Close attachment</button></div> : null,
}));

import DailyWorkLog from "../DailyWorkLog";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><DailyWorkLog /></QueryClientProvider>);
}

beforeEach(() => {
  fixture.teamAllowed = true;
  fixture.context.linked = true;
  fixture.context.teamViewAllowed = true;
  fixture.context.personName = "ALPHA ENGINEER";
  fixture.apiRequest.mockResolvedValue(new Response(JSON.stringify({ id: 1 }), { status: 201 }));
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const payload = url.includes("/context") ? fixture.context
      : url.includes("view=team") ? fixture.team : fixture.personal;
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("Daily work log screen", () => {
  it("groups work choices and includes Plant without removing old places", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Add work" }));
    const form = screen.getByRole("form", { name: "Daily work entry form" });
    const work = within(form).getByRole("combobox", { name: "Work" });
    expect(Array.from(work.querySelectorAll("optgroup")).map(group => group.label))
      .toEqual(["Office", "Plant", "HR / admin"]);
    expect(within(work).getAllByRole("option")).toHaveLength(21);
    expect(within(work).getByRole("option", { name: "P&M maintenance" })).toBeTruthy();
    expect(within(work).getByRole("option", { name: "Payroll" })).toBeTruthy();
    const place = within(form).getByRole("combobox", { name: "Where" });
    expect(within(place).getAllByRole("option").map(option => option.textContent))
      .toEqual(["Site office", "Plant office", "Head office", "Plant"]);
  });
  it("shows a person's work entry and linked DPR activity in the team view", async () => {
    renderPage();
    await screen.findByText("Daily work log");
    fireEvent.click(screen.getByRole("button", { name: "Team view" }));
    await screen.findByText("Checked the plant stock ledger.");
    expect(screen.getAllByText("BETA ENGINEER").length).toBeGreaterThan(0);
    const personDay = screen.getByRole("article", { name: "BETA ENGINEER day" });
    expect(within(personDay).getByText("Field density")).toBeTruthy();
    expect(within(personDay).getByText("2:00")).toBeTruthy();
    expect(within(personDay).getByRole("link", { name: "Open DPR" }).getAttribute("href")).toBe("/site/edit/418");
    const filters = screen.getByRole("region", { name: "Team filters" });
    expect(within(filters).getByRole("combobox", { name: "Person" })).toBeTruthy();
    expect(within(filters).getByRole("combobox", { name: "Place" })).toBeTruthy();
  });

  it("keeps team view behind its separate permission and offers only office/plant visits", async () => {
    fixture.teamAllowed = false;
    fixture.context.teamViewAllowed = false;
    renderPage();
    await screen.findByText("Daily work log");
    expect(screen.queryByRole("button", { name: "Team view" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Visits & inspections" }));
    fireEvent.click(screen.getByRole("button", { name: "Add visit" }));
    const place = screen.getByRole("combobox", { name: "Place" }) as HTMLSelectElement;
    expect(Array.from(place.options).map(option => option.textContent)).toEqual(["HLC plant", "Head office"]);
    expect(Array.from(place.options).some(option => option.textContent === "Site office")).toBe(false);
  });

  it("opens an unlinked team user directly in Team view and shows all visits read-only", async () => {
    fixture.context.linked = false;
    fixture.context.personName = null;
    fixture.context.teamViewAllowed = true;
    renderPage();
    await screen.findByText("Daily work log");

    expect(screen.queryByRole("button", { name: "My day" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Team view" }).getAttribute("aria-current")).toBe("page");
    expect(await screen.findByText("DEPARTMENT VISITOR · Meeting")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Visits & inspections" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add visit" })).toBeNull();
    expect(screen.queryByText("Edit")).toBeNull();
    expect(screen.queryByText("Delete")).toBeNull();
  });

  it("shows the unlinked warning only when team view is not allowed", async () => {
    fixture.teamAllowed = false;
    fixture.context.linked = false;
    fixture.context.teamViewAllowed = false;
    fixture.context.personName = null;
    renderPage();
    expect((await screen.findByRole("alert")).textContent).toContain("Your login is not linked to a person");
    expect(screen.queryByRole("button", { name: "My day" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Team view" })).toBeNull();
  });

  it("submits a new work entry through the create endpoint", async () => {
    renderPage();
    await screen.findByText("Daily work log");
    fireEvent.click(screen.getByRole("button", { name: "Add work" }));
    fireEvent.change(screen.getByLabelText("What was done"), { target: { value: "Prepared a test report." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(fixture.apiRequest).toHaveBeenCalledWith(
      "POST", "/api/daily-work-log/entries", expect.objectContaining({
        workDate: expect.any(String), details: "Prepared a test report.", durationMinutes: null,
      }),
    ));
  });
});
