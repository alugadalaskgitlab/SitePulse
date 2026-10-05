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
      return <select data-testid={parts[0]?.props["data-testid"]} value={value} onChange={event => onValueChange(event.target.value)}>{parts[1]}</select>;
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
let failure: boolean;
const base = { id: 7, vendorName: "RAVI HAULAGE", category: "transport", itemKey: "EQ_TIPPER_HRS", itemLabel: "TIPPER — HOURLY HIRE", unit: "HRS", rate: 387, notes: "Agreed flat rate", ratePerKm: null, leadDistanceKm: null, payloadMt: null };
beforeEach(() => {
  queryClient.clear();
  cards = [{ ...base }];
  discovered = [{ ...base, rateCardId: 7 }];
  writes = [];
  bulkWrites = [];
  failure = false;
  Element.prototype.scrollIntoView = vi.fn();
  window.history.replaceState(null, "", "/plant/rate-cards");
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (url.pathname === "/api/vendor-rate-cards" && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      writes.push(body);
      if (failure) return json({ message: "Setup save failed" }, 500);
      const saved = { ...cards.find(card => card.itemKey === body.itemKey), ...body, id: 7 };
      cards = [saved];
      return json(saved);
    }
    if (url.pathname === "/api/vendor-rate-cards/bulk-upsert") {
      bulkWrites.push(JSON.parse(String(init?.body)));
      return json({});
    }
    if (url.pathname === "/api/vendor-bills/vendor-names") return json(["RAVI HAULAGE", "SHANKAR LOGISTICS"]);
    if (url.pathname === "/api/vendor-rate-cards/discover") return json(url.searchParams.get("vendorName") === "SHANKAR LOGISTICS" ? [] : discovered);
    if (url.pathname === "/api/vendor-rate-cards") return json(url.searchParams.get("vendorName") === "SHANKAR LOGISTICS" ? [] : cards);
    if (url.pathname === "/api/equipment-master/canonical-types") return json(["TIPPER"]);
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
    expect(writes).toEqual([{ vendorName: base.vendorName, category: base.category, itemKey: base.itemKey, itemLabel: base.itemLabel, unit: "HRS", rate: 387, notes: base.notes, ratePerKm: 950, leadDistanceKm: 12, payloadMt: 30 }]);
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
    expect(writes[0].rate).toBe(387);
    expect((screen.getByTestId("input-rate-0") as HTMLInputElement).value).toBe("387");
    expect(screen.getByTestId("select-unit-0")).toBeTruthy();
    fireEvent.change(screen.getByTestId("input-rate-0"), { target: { value: "419" } });
    fireEvent.click(screen.getByTestId("button-save-all-rates"));
    await waitFor(() => expect(bulkWrites).toHaveLength(1));
    expect(bulkWrites[0].items[0].rate).toBe(419);
    if (lead === "") expect(bulkWrites[0].items[0]).not.toHaveProperty("leadDistanceKm");
    else expect(bulkWrites[0].items[0].leadDistanceKm).toBe(0);
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
    expect(bulkWrites[0].items[0]).toMatchObject({ itemKey: base.itemKey, unit: "HRS", rate: 387, ratePerKm: 950, leadDistanceKm: 12, payloadMt: 30, notes: base.notes });
  });

  it("joins discovered rows without ids using exact category/key/unit identity", async () => {
    discovered[0].rateCardId = null;
    cards[0] = { ...base, ratePerKm: 950, leadDistanceKm: 12, payloadMt: 31 };
    mount();
    await screen.findByTestId("transport-rate-basis");
    await open();
    expect((screen.getByLabelText("Payload (MT)") as HTMLInputElement).value).toBe("31");
  });

  it("does not borrow setup from another unit sharing the same item key", async () => {
    discovered[0].rateCardId = null;
    cards[0] = { ...base, unit: "MT", ratePerKm: 950, leadDistanceKm: 12, payloadMt: 31 };
    mount();
    await open();
    expect((screen.getByLabelText("Rate (₹ per km per load)") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Payload (MT)") as HTMLInputElement).value).toBe("30");
    expect(screen.queryByTestId("transport-rate-basis")).toBeNull();
  });

  it("preserves the typed flat rate on an unsaved discovered row", async () => {
    cards = [];
    discovered[0].rateCardId = null;
    mount();
    fireEvent.change(await screen.findByTestId("input-rate-0"), { target: { value: "463" } });
    await open();
    fill();
    await save();
    expect(writes[0]).toMatchObject({ itemKey: base.itemKey, unit: "HRS", rate: 463 });
    expect(writes[0]).not.toHaveProperty("notes");
  });

  it("reopens persisted manual setup while preserving manual provenance and flat rate", async () => {
    cards[0] = { ...base, notes: MANUAL_VENDOR_RATE_CARD_NOTE, ratePerKm: 950, leadDistanceKm: 12, payloadMt: 28 };
    discovered = [];
    mount();
    await open();
    expect((screen.getByLabelText("Payload (MT)") as HTMLInputElement).value).toBe("28");
    change("Payload (MT)", "32");
    await save();
    expect(writes[0]).toMatchObject({ rate: 387, notes: MANUAL_VENDOR_RATE_CARD_NOTE, payloadMt: 32, itemKey: base.itemKey, unit: "HRS" });
  });

  it.each(["521", ""])("saves a new manual row with flat rate '%s' and refreshes its id", async flatRate => {
    cards = [];
    discovered = [];
    mount();
    fireEvent.click(await screen.findByTestId("button-add-transport-row"));
    fireEvent.change(screen.getByTestId("select-add-trans-type"), { target: { value: "TIPPER" } });
    fireEvent.change(screen.getByTestId("select-add-trans-mode"), { target: { value: "TRIP" } });
    fireEvent.click(screen.getByTestId("button-confirm-add-transport"));
    fireEvent.change(screen.getByTestId("input-manual-rate-transport-0"), { target: { value: flatRate } });
    fireEvent.click(screen.getByRole("button", { name: "Rate setup for TIPPER - TRIP" }));
    fill();
    await save();
    expect(writes[0]).toMatchObject({ rate: flatRate === "" ? 0 : 521, itemKey: "EQ_TIPPER_TRIP", unit: "TRIP", notes: MANUAL_VENDOR_RATE_CARD_NOTE });
    expect(screen.getAllByTestId("transport-rate-basis")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Rate setup for TIPPER - TRIP" }));
    expect((screen.getByLabelText("Rate (₹ per km per load)") as HTMLInputElement).value).toBe("950");
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
      if (String(input) === "/api/vendor-rate-cards" && init?.method === "POST") {
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
    discovered = [
      { itemKey: "EQ_EXCAVATOR_HRS", itemLabel: "EXCAVATOR", category: "equipment", unit: "HRS", rate: 613, rateCardId: null },
      { itemKey: "MAT_SOIL_CFT", itemLabel: "SOIL", category: "material", unit: "CFT", rate: 19, rateCardId: null },
      { itemKey: "LAB_SKILLED", itemLabel: "SKILLED CREW", category: "labour", unit: "HEAD-DAY", rate: 827, rateCardId: null },
    ];
    cards = [];
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
    fireEvent.change(screen.getByTestId("select-vendor"), { target: { value: "SHANKAR LOGISTICS" } });
    await screen.findByText("No transport items discovered. Use ADD ROW to add manually.");
    expect(screen.queryByTestId("transport-rate-basis")).toBeNull();
    fireEvent.click(screen.getByTestId("button-save-all-rates"));
    expect(bulkWrites).toHaveLength(0);
  });
});