// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import RateCards from "@/pages/RateCards";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
let saveStatus = 200;
let writes: any[] = [];
beforeEach(() => {
  saveStatus = 200;
  writes = [];
  toast.mockClear();
  queryClient.clear();
  window.history.replaceState(null, "", "/plant/vendor-bills?vendorName=WRONG");
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (url.pathname === "/api/vendor-rate-cards/bulk-upsert") {
      writes.push(JSON.parse(String(init?.body)));
      return json(saveStatus === 200 ? {} : { message: "Synthetic save failure" }, saveStatus);
    }
    if (url.pathname === "/api/vendor-bills/vendor-names") return json(["DRAFT VENDOR"]);
    if (url.pathname === "/api/vendor-rate-cards/discover") return json([{
      itemKey: "MAT_SOIL_CFT", itemLabel: "SOIL", category: "material", unit: "CFT", rate: 12, rateCardId: 1,
    }]);
    return json([]);
  }));
});
afterEach(() => { cleanup(); queryClient.clear(); vi.unstubAllGlobals(); });
const mount = (onReturnToDraft?: () => void) => render(
  <QueryClientProvider client={queryClient}>
    <RateCards draftVendor="DRAFT VENDOR" onReturnToDraft={onReturnToDraft} />
  </QueryClientProvider>,
);

describe("embedded rate cards return contract", () => {
  it("returns only after successful save and uses draft vendor rather than route query", async () => {
    const back = vi.fn();
    mount(back);
    fireEvent.change(await screen.findByTestId("input-rate-0"), { target: { value: "275" } });
    expect(back).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("button-save-all-rates"));
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
    expect(writes[0].items).toEqual([expect.objectContaining({ vendorName: "DRAFT VENDOR", rate: 275, unit: "CFT" })]);
    expect(window.location.pathname).toBe("/plant/vendor-bills");
  });

  it("keeps editor open with edits on save failure", async () => {
    saveStatus = 500;
    const back = vi.fn();
    mount(back);
    fireEvent.change(await screen.findByTestId("input-rate-0"), { target: { value: "333" } });
    fireEvent.click(screen.getByTestId("button-save-all-rates"));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    expect(back).not.toHaveBeenCalled();
    expect((screen.getByTestId("input-rate-0") as HTMLInputElement).value).toBe("333");
  });

  it("Back returns without saving or navigating away from the draft route", async () => {
    const back = vi.fn();
    mount(back);
    await screen.findByTestId("input-rate-0");
    fireEvent.click(screen.getByTestId("button-back-rate-cards"));
    expect(back).toHaveBeenCalledTimes(1);
    expect(writes).toHaveLength(0);
    expect(window.location.pathname).toBe("/plant/vendor-bills");
  });

  it("leaves standalone navigation unchanged", async () => {
    mount();
    await screen.findByTestId("input-rate-0");
    expect(screen.getByTestId("button-back-rate-cards").closest("a")?.getAttribute("href")).toBe("/finance/hub");
    fireEvent.click(screen.getByTestId("button-save-all-rates"));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "1 rate(s) saved" })));
    expect(screen.getByTestId("text-rate-cards-title")).toBeTruthy();
  });
});