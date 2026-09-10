// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { EquipmentMasterCreateDialog } from "@/components/EquipmentMasterCreateDialog";
import { queryClient } from "@/lib/queryClient";

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: vi.fn(() => false) },
    setPointerCapture: { configurable: true, value: vi.fn() },
    releasePointerCapture: { configurable: true, value: vi.fn() },
    scrollIntoView: { configurable: true, value: vi.fn() },
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false, addListener: vi.fn(), removeListener: vi.fn() }),
  });
});

describe("EQUIP-05 shared Equipment Master creation dialog", () => {
  it("prefills the supplied name and returns the created equipment with the full master defaults", async () => {
    const onCreated = vi.fn();
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url === "/api/plant-module/plant-settings") {
        return new Response(JSON.stringify([{ id: 1, plantName: "HMP-1", siteName: null }]), { status: 200 });
      }
      if (url === "/api/plant-module/equipment" && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ id: 41, ...body, isActive: 1 }), { status: 201 });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    render(
      <QueryClientProvider client={queryClient}>
        <EquipmentMasterCreateDialog open initialName="grader 1" onCreated={onCreated} />
      </QueryClientProvider>,
    );

    expect((screen.getByTestId("input-equipment-name") as HTMLInputElement).value).toBe("GRADER 1");
    fireEvent.change(screen.getByTestId("input-registration-number"), { target: { value: "mh12ab1234" } });
    fireEvent.change(screen.getByTestId("select-equipment-type"), { target: { value: "JCB" } });
    fireEvent.click(screen.getByTestId("button-save-equipment"));

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreated.mock.calls[0][0].id).toBe(41);
    const post = requests.find(request => request.init?.method === "POST");
    expect(JSON.parse(String(post?.init?.body))).toMatchObject({
      name: "GRADER 1",
      registrationNumber: "MH12AB1234",
      equipmentType: "JCB",
      ownership: "owned",
      meterType: "hour_meter",
      plantName: null,
      standardOutputs: null,
      outputEfficiency: 75,
    });
  });

  it("keeps create disabled until a non-blank name is present", () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));
    render(
      <QueryClientProvider client={queryClient}>
        <EquipmentMasterCreateDialog open initialName="   " />
      </QueryClientProvider>,
    );
    expect((screen.getByTestId("button-save-equipment") as HTMLButtonElement).disabled).toBe(true);
  });

  it("normalizes absent optional hire terms to null instead of empty strings or NaN", async () => {
    let posted: Record<string, unknown> | undefined;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/plant-module/plant-settings") return new Response("[]", { status: 200 });
      if (url === "/api/plant-module/equipment" && init?.method === "POST") {
        posted = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ id: 42, ...posted }), { status: 201 });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));
    render(
      <QueryClientProvider client={queryClient}>
        <EquipmentMasterCreateDialog open initialName="hired roller" />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByTestId("select-equipment-type"), { target: { value: "Tractor" } });
    fireEvent.change(screen.getByTestId("select-ownership"), { target: { value: "hired" } });
    fireEvent.change(screen.getByTestId("input-vendor-name"), { target: { value: "vendor one" } });
    fireEvent.click(screen.getByTestId("button-save-equipment"));

    await waitFor(() => expect(posted).toBeDefined());
    expect(posted).toMatchObject({
      ownership: "hired",
      vendorName: "VENDOR ONE",
      hireBillingBasis: null,
      hireRate: null,
      hireStartDate: null,
      hireEndDate: null,
      hireDieselResponsibility: null,
      hireOperatorResponsibility: null,
      hireAgreementRemarks: null,
      hireBreakdownDeductionEnabled: false,
      hireMonthlyDivisorType: null,
      hireMonthlyDivisor: null,
    });
  });
});