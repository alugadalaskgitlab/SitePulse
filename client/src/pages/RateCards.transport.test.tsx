// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import RateCards from "@/pages/RateCards";
import { MANUAL_VENDOR_RATE_CARD_NOTE } from "@shared/vendorRateCardIdentity";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
// Native selects keep tests focused on rate-card state, not Radix pointer capture.
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  return {
    Select: ({ value, onValueChange, children }: any) => {
      const parts = React.Children.toArray(children) as any[];
      return <select data-testid={parts[0]?.props["data-testid"]} disabled={parts[0]?.props.disabled} value={value} onChange={event => onValueChange(event.target.value)}>{parts[1]}</select>;
    },
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectContent: ({ children }: any) => <>{children}</>,
    SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
  };
});

let cards: any[];
let discovered: any[];
let writes: any[];
let bulkWrites: any[];
let creates: any[];
let materials: any[];
let failure: boolean;
let materialsLoadFailure: boolean;
let materialRequests: string[];
const base = { id: 7, vendorName: "RAVI HAULAGE", category: "transport", itemKey: "EQ_TIPPER_HRS", itemLabel: "TIPPER — HOURLY HIRE", unit: "HRS", rate: 387, notes: "Agreed flat rate", ratePerKm: null, leadDistanceKm: null, payloadMt: null };
beforeEach(() => {
  queryClient.clear();
  cards = [{ ...base }];
  discovered = [{ ...base, rateCardId: 7 }];
  writes = [];
  bulkWrites = [];
  creates = [];
  materials = [{ name: "WMM" }, { name: "20 MM" }, { name: "20MM" }, { name: "Aggregate" }];
  failure = false;
  materialsLoadFailure = false;
  materialRequests = [];
  toast.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
  window.history.replaceState(null, "", "/plant/rate-cards");
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (/^\/api\/vendor-rate-cards\/\d+\/transport-setup$/.test(url.pathname) && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body));
      writes.push(body);
      if (failure) return json({ message: "Setup save failed" }, 500);
      const id = Number(url.pathname.split("/")[3]);
      const saved = { ...cards.find(card => Number(card.id) === id), ...body, id };
      cards = [...cards.filter(card => Number(card.id) !== id), saved];
      return json(saved);
    }
    if (url.pathname === "/api/vendor-rate-cards" && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      creates.push(body);
      const saved = { ...body, id: 8, ratePerKm: null, leadDistanceKm: null, payloadMt: null };
      cards = [...cards, saved];
      return json(saved, 201);
    }
    if (url.pathname === "/api/vendor-rate-cards/bulk-upsert") {
      bulkWrites.push(JSON.parse(String(init?.body)));
      return json({});
    }
    if (url.pathname === "/api/vendor-bills/vendor-names") return json(["RAVI HAULAGE", "SHANKAR LOGISTICS"]);
    if (url.pathname === "/api/vendor-master") return json([
      { id: 41, name: "RAVI HAULAGE", isActive: true },
      { id: 42, name: "SHANKAR LOGISTICS", isActive: true },
    ]);
    if (url.pathname === "/api/vendor-aliases") return json([]);
    if (url.pathname === "/api/vendor-rate-cards/discover") return json(url.searchParams.get("vendorName") === "SHANKAR LOGISTICS" ? [] : discovered);
    if (url.pathname === "/api/vendor-rate-cards") return json(url.searchParams.get("vendorName") === "SHANKAR LOGISTICS" ? [] : cards);
    if (url.pathname === "/api/equipment-master/canonical-types") return json(["TIPPER"]);
    if (url.pathname === "/api/plant-module/materials") {
      materialRequests.push(url.pathname);
      return materialsLoadFailure ? json({ message: "Unavailable" }, 500) : json(materials);
    }
    return json([]);
  }));
});
afterEach(() => { cleanup(); queryClient.clear(); vi.unstubAllGlobals(); });
const mount = () => render(<QueryClientProvider client={queryClient}><RateCards draftVendor="RAVI HAULAGE" /></QueryClientProvider>);
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const open = async () => {
  const button = await screen.findByRole("button", { name: `Rate setup for ${base.itemLabel}` });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(button);
};
const fill = (lead = "12", payload = "30") => {
  change("Rate (₹ per km per load)", "950");
  change("Lead distance — ONE WAY (km)", lead);
  change("Payload (MT)", payload);
};
const save = async () => {
  fireEvent.click(screen.getByRole("button", { name: "SAVE RATE SETUP" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
};

describe("transport-only rate setup", () => {
  it("previews 950/12/30, saves only its row, and preserves flat rate, notes and saved HRS identity", async () => {
    mount();
    await open();
    fill();
    expect(screen.getByTestId("transport-two-way").textContent).toBe("24 km");
    expect(screen.getByTestId("transport-per-trip").textContent).toBe("₹22,800");
    expect(screen.getByTestId("transport-per-mt").textContent).toBe("₹760");
    expect(writes).toHaveLength(0);
    await save();
    expect(writes).toEqual([{ itemKey: base.itemKey, ratePerKm: 950, leadDistanceKm: 12, payloadMt: 30 }]);
    expect(screen.getByTestId("transport-rate-basis").textContent).toContain("₹950/km · 12 km one way · 30 MT → ₹22,800/trip · ₹760/MT");
    expect(screen.queryByTestId("select-unit-0")).toBeNull();
    expect(screen.getByText("TRIP", { selector: "span" })).toBeTruthy();
    await open();
    expect((screen.getByLabelText("Rate (₹ per km per load)") as HTMLInputElement).value).toBe("950");
    expect((screen.getByLabelText("Lead distance — ONE WAY (km)") as HTMLInputElement).value).toBe("12");
    expect((screen.getByLabelText("Payload (MT)") as HTMLInputElement).value).toBe("30");
  });

  it("rejects payload zero without dividing by zero", async () => {
    mount();
    await open();
    fill("12", "0");
    expect(screen.getByText("Payload required for ₹/MT")).toBeTruthy();
    expect(screen.getByTestId("transport-per-mt").textContent).toBe("");
    expect((screen.getByRole("button", { name: "SAVE RATE SETUP" }) as HTMLButtonElement).disabled).toBe(true);
    expect(writes).toHaveLength(0);
  });

  it.each(["0", ""])("lead %s leaves derived prices blank and the existing flat rate editable", async lead => {
    mount();
    await open();
    fill(lead);
    expect(screen.getByTestId("transport-per-trip").textContent).toBe("");
    expect(screen.getByTestId("transport-per-mt").textContent).toBe("");
    await save();
    expect(writes[0]).not.toHaveProperty("rate");
    expect(cards[0].rate).toBe(387);
    expect((screen.getByTestId("input-rate-0") as HTMLInputElement).value).toBe("387");
    expect(screen.getByTestId("select-unit-0")).toBeTruthy();
    fireEvent.change(screen.getByTestId("input-rate-0"), { target: { value: "419" } });
    fireEvent.click(screen.getByTestId("button-save-all-rates"));
    await waitFor(() => expect(bulkWrites).toHaveLength(1));
    expect(bulkWrites[0].items[0].rate).toBe(419);
    expect(bulkWrites[0].items[0]).not.toHaveProperty("leadDistanceKm");
  });

  it("defaults payload only in the editor and Cancel leaves nullable rows untouched", async () => {
    mount();
    await open();
    expect((screen.getByLabelText("Payload (MT)") as HTMLInputElement).value).toBe("30");
    fill();
    fireEvent.click(screen.getByRole("button", { name: "CANCEL" }));
    expect(writes).toHaveLength(0);
    expect(screen.queryByTestId("transport-rate-basis")).toBeNull();
    fireEvent.click(screen.getByTestId("button-save-all-rates"));
    await waitFor(() => expect(bulkWrites).toHaveLength(1));
    expect(bulkWrites[0].items[0]).toMatchObject({ rate: 387 });
    expect(bulkWrites[0].items[0]).not.toHaveProperty("ratePerKm");
    expect(bulkWrites[0].items[0]).not.toHaveProperty("leadDistanceKm");
    expect(bulkWrites[0].items[0]).not.toHaveProperty("payloadMt");
  });

  it("Save All preserves persisted setup fields without changing the underlying unit/key/rate", async () => {
    cards[0] = { ...base, ratePerKm: 950, leadDistanceKm: 12, payloadMt: 30 };
    mount();
    await screen.findByTestId("transport-rate-basis");
    fireEvent.click(screen.getByTestId("button-save-all-rates"));
    await waitFor(() => expect(bulkWrites).toHaveLength(1));
    expect(bulkWrites[0].items[0]).toMatchObject({ itemKey: base.itemKey, unit: "HRS", rate: 387, notes: base.notes });
    expect(bulkWrites[0].items[0]).not.toHaveProperty("ratePerKm");
  });

  it("uses the selected saved card for its setup fields", async () => {
    discovered[0].rateCardId = null;
    cards[0] = { ...base, ratePerKm: 950, leadDistanceKm: 12, payloadMt: 31 };
    mount();
    await screen.findByTestId("transport-rate-basis");
    await open();
    expect((screen.getByLabelText("Payload (MT)") as HTMLInputElement).value).toBe("31");
  });

  it("does not display historical rows without a saved card", async () => {
    cards = [];
    discovered = [{ ...base, rateCardId: null }];
    mount();
    expect(await screen.findByText("No saved transport rate cards. Use ADD ROW to add one.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Rate setup for/ })).toBeNull();
  });

  it("loads the real material endpoint, merges site-trip and master names, and saves WMM transport setup", async () => {
    cards = [];
    discovered = [];
    mount();
    fireEvent.click(await screen.findByTestId("button-add-transport-row"));
    fireEvent.change(screen.getByTestId("select-add-transport-kind"), { target: { value: "material" } });
    const materialSelect = screen.getByTestId("select-add-trans-material") as HTMLSelectElement;
    const options = Array.from(materialSelect.options).map(option => option.value);
    expect(materialRequests).toContain("/api/plant-module/materials");
    expect(options).toContain("WMM");
    expect(options).toContain("GSB");
    expect(options).toContain("BC MIX");
    expect(options).toContain("DBM MIX");
    expect(options).toContain("AGGREGATE");
    expect(options.filter(name => name.replace(/\s/g, "") === "20MM")).toHaveLength(1);
    fireEvent.change(materialSelect, { target: { value: "WMM" } });
    fireEvent.click(screen.getByTestId("button-confirm-add-transport"));

    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText("Rate (₹ per km per load)"), { target: { value: "90" } });
    fireEvent.change(screen.getByLabelText("Lead distance — ONE WAY (km)"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Payload (MT)"), { target: { value: "30" } });
    expect(screen.getByTestId("transport-per-trip").textContent).toBe("₹2,160");
    expect(screen.getByTestId("transport-per-mt").textContent).toBe("₹72");
    fireEvent.click(screen.getByRole("button", { name: "SAVE RATE SETUP" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expect(creates).toEqual([expect.objectContaining({
      category: "transport",
      itemKey: "EQ_WMM_TRIP",
      itemLabel: "WMM - TRANSPORT",
      unit: "TRIP",
      rate: 90,
    })]);
    expect(writes).toEqual([{ itemKey: "EQ_WMM_TRIP", ratePerKm: 90, leadDistanceKm: 12, payloadMt: 30 }]);
    expect(screen.getByTestId("transport-rate-basis").textContent).toContain("₹90/km · 12 km one way · 30 MT → ₹2,160/trip · ₹72/MT");
  });

  it("uses the same loaded material list in the Material section Add Row dropdown", async () => {
    cards = [];
    discovered = [];
    mount();
    fireEvent.click(await screen.findByTestId("button-add-material-row"));
    const options = Array.from((await screen.findByTestId("select-add-mat-name") as HTMLSelectElement).options).map(option => option.value);
    expect(options).toContain("SOIL");
    expect(options).toContain("AGGREGATE");
    expect(materialRequests).toContain("/api/plant-module/materials");
  });

  it("shows a clear error instead of empty material dropdowns when loading fails", async () => {
    materialsLoadFailure = true;
    cards = [];
    discovered = [];
    mount();
    fireEvent.click(await screen.findByTestId("button-add-material-row"));
    expect(await screen.findByText("Couldn't load materials")).toBeTruthy();
    expect((screen.getByTestId("select-add-mat-name") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("button-add-transport-row"));
    fireEvent.change(screen.getByTestId("select-add-transport-kind"), { target: { value: "material" } });
    expect(screen.getAllByText("Couldn't load materials").length).toBeGreaterThan(0);
    expect((screen.getByTestId("select-add-trans-material") as HTMLButtonElement).disabled).toBe(true);
  });

  it("treats names with and without spaces as an existing material transport card", async () => {
    cards = [{ ...base, id: 9, itemKey: "EQ_20_MM_TRIP", itemLabel: "20 MM - TRANSPORT", unit: "TRIP" }];
    discovered = [];
    mount();
    fireEvent.click(await screen.findByTestId("button-add-transport-row"));
    fireEvent.change(screen.getByTestId("select-add-transport-kind"), { target: { value: "material" } });
    fireEvent.change(screen.getByTestId("select-add-trans-material"), { target: { value: "20 MM" } });
    fireEvent.click(screen.getByTestId("button-confirm-add-transport"));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "20 MM transport already exists" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(creates).toHaveLength(0);
  });

  it("reopens persisted manual setup while preserving manual provenance and flat rate", async () => {
    cards[0] = { ...base, notes: MANUAL_VENDOR_RATE_CARD_NOTE, ratePerKm: 950, leadDistanceKm: 12, payloadMt: 28 };
    discovered = [];
    mount();
    await open();
    expect((screen.getByLabelText("Payload (MT)") as HTMLInputElement).value).toBe("28");
    change("Payload (MT)", "32");
    await save();
    expect(writes[0]).toMatchObject({ payloadMt: 32, itemKey: base.itemKey });
    expect(writes[0]).not.toHaveProperty("notes");
    expect(cards[0]).toMatchObject({ rate: 387, notes: MANUAL_VENDOR_RATE_CARD_NOTE, unit: "HRS" });
  });

  it.each(["521", ""])("never creates a card from setup on an unsaved manual row with flat rate '%s'", async flatRate => {
    cards = [];
    discovered = [];
    mount();
    fireEvent.click(await screen.findByTestId("button-add-transport-row"));
    fireEvent.change(screen.getByTestId("select-add-trans-type"), { target: { value: "TIPPER" } });
    fireEvent.change(screen.getByTestId("select-add-trans-mode"), { target: { value: "TRIP" } });
    fireEvent.click(screen.getByTestId("button-confirm-add-transport"));
    fireEvent.change(screen.getByTestId("input-manual-rate-transport-0"), { target: { value: flatRate } });
    expect((screen.getByRole("button", { name: "Rate setup for TIPPER - TRIP" }) as HTMLButtonElement).disabled).toBe(true);
    expect(writes).toHaveLength(0);
  });

  it("keeps drafts on save errors and supports retry", async () => {
    failure = true;
    mount();
    await open();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "SAVE RATE SETUP" }));
    await screen.findByRole("alert");
    expect((screen.getByLabelText("Rate (₹ per km per load)") as HTMLInputElement).value).toBe("950");
    expect(screen.queryByTestId("transport-rate-basis")).toBeNull();
    failure = false;
    await save();
    expect(writes).toHaveLength(2);
  });

  it("shows saving state and disables draft edits and duplicate submissions", async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    let finish!: () => void;
    vi.mocked(fetch).mockImplementation((input, init) => {
      if (String(input) === "/api/vendor-rate-cards/7/transport-setup" && init?.method === "PATCH") {
        return new Promise(resolve => {
          finish = () => resolve(new Response(JSON.stringify({ ...base, ...JSON.parse(String(init.body)) }), { status: 200, headers: { "Content-Type": "application/json" } }));
        });
      }
      return original(input, init);
    });
    mount();
    await open();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "SAVE RATE SETUP" }));
    expect((screen.getByRole("button", { name: "SAVING…" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "CANCEL" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText("Payload (MT)").closest("fieldset")?.disabled).toBe(true);
    finish();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("transport-rate-basis")).toBeTruthy();
  });

  it("leaves non-transport rows with their original editable rate and unit controls", async () => {
    discovered = [];
    cards = [
      { id: 1, vendorName: "RAVI HAULAGE", itemKey: "EQ_EXCAVATOR_HRS", itemLabel: "EXCAVATOR", category: "equipment", unit: "HRS", rate: 613 },
      { id: 2, vendorName: "RAVI HAULAGE", itemKey: "MAT_SOIL_CFT", itemLabel: "SOIL", category: "material", unit: "CFT", rate: 19 },
      { id: 3, vendorName: "RAVI HAULAGE", itemKey: "LAB_SKILLED", itemLabel: "SKILLED CREW", category: "labour", unit: "HEAD-DAY", rate: 827 },
    ];
    mount();
    await screen.findByText("EXCAVATOR");
    expect(screen.getAllByTestId("input-rate-0")).toHaveLength(3);
    expect(screen.getAllByTestId("select-unit-0")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /Rate setup for/ })).toBeNull();
    fireEvent.click(screen.getByTestId("button-save-all-rates"));
    await waitFor(() => expect(bulkWrites).toHaveLength(1));
    expect(bulkWrites[0].items.map((item: any) => item.rate)).toEqual([613, 19, 827]);
    expect(bulkWrites[0].items.every((item: any) => !("ratePerKm" in item))).toBe(true);
  });

  it("does not leak setup or typed rates when switching vendors", async () => {
    mount();
    await open();
    fill();
    await save();
    fireEvent.change(screen.getByTestId("select-saved-vendor-suggestion"), { target: { value: "SHANKAR LOGISTICS" } });
    await screen.findByText("No saved transport rate cards. Use ADD ROW to add one.");
    expect(screen.queryByTestId("transport-rate-basis")).toBeNull();
    fireEvent.click(screen.getByTestId("button-save-all-rates"));
    expect(bulkWrites).toHaveLength(0);
  });
});