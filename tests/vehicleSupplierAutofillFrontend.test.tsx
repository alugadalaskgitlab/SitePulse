// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import {
  useSiteMaterialSuggestions,
  normalizeVehicleSupplierKey,
} from "../client/src/hooks/use-site-material-suggestions";
import { VehicleSupplierAssociationNotice } from "../client/src/components/VehicleSupplierAssociationNotice";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function withClient(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe("vehicle supplier association suggestions", () => {
  it("reads the augmented association response and normalizes vehicle keys", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            vehicles: ["KA 01 AB-1234"],
            suppliers: ["ACME HAULAGE"],
            vehicleSuppliers: {
              KA01AB1234: {
                status: "linked",
                supplier: "ACME HAULAGE",
                version: "v1",
              },
            },
            canCorrectVehicleSupplier: true,
          }),
        ),
      ),
    );

    function Harness() {
      const result = useSiteMaterialSuggestions("Site A");
      return (
        <output data-testid="association">
          {JSON.stringify({
            key: normalizeVehicleSupplierKey("ka 01-ab 1234"),
            association: result.vehicleSuppliers.KA01AB1234,
            canCorrect: result.canCorrectVehicleSupplier,
          })}
        </output>
      );
    }

    withClient(<Harness />);
    await waitFor(() =>
      expect(screen.getByTestId("association")).toHaveTextContent(
        '"canCorrect":true',
      ),
    );
    expect(screen.getByTestId("association")).toHaveTextContent('"key":"KA01AB1234"');
    expect(screen.getByTestId("association")).toHaveTextContent('"canCorrect":true');
    expect(screen.getByTestId("association")).toHaveTextContent('"version":"v1"');
  });

  it("requires confirmation, sends the expected version, and applies only the returned future association", async () => {
    const onSupplierApplied = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "linked",
          supplier: "OTHER HAULAGE",
          version: "v2",
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    withClient(
      <VehicleSupplierAssociationNotice
        site="Site A"
        vehicleNumber="KA 01 AB-1234"
        supplier="OTHER HAULAGE"
        association={{ status: "linked", supplier: "ACME HAULAGE", version: "v1" }}
        canCorrectVehicleSupplier
        onSupplierApplied={onSupplierApplied}
        testIdPrefix="test"
      />,
    );

    fireEvent.click(screen.getByTestId("test-vehicle-supplier-correct"));
    expect(screen.getByTestId("test-vehicle-supplier-dialog")).toBeInTheDocument();
    expect(onSupplierApplied).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("test-vehicle-supplier-confirm"));

    await waitFor(() => expect(onSupplierApplied).toHaveBeenCalledWith(
      "OTHER HAULAGE",
      { site: "Site A", vehicleNumber: "KA 01 AB-1234" },
    ));
    const request = fetchMock.mock.calls.find(
      (call) => call[0] === "/api/site-material-trips/vehicle-supplier",
    );
    expect(JSON.parse(request?.[1]?.body as string)).toMatchObject({
      site: "Site A",
      vehicleNumber: "KA 01 AB-1234",
      supplier: "OTHER HAULAGE",
      expectedVersion: "v1",
      expectedSupplier: "ACME HAULAGE",
    });
  });

  it("cancels without a request and leaves the supplier untouched after a failed correction", async () => {
    const onSupplierApplied = vi.fn();
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    withClient(
      <VehicleSupplierAssociationNotice
        site="Site A"
        vehicleNumber="KA01AB1234"
        supplier="OTHER HAULAGE"
        association={{ status: "linked", supplier: "ACME HAULAGE", version: "v1" }}
        canCorrectVehicleSupplier
        onSupplierApplied={onSupplierApplied}
        testIdPrefix="test"
      />,
    );

    fireEvent.click(screen.getByTestId("test-vehicle-supplier-correct"));
    fireEvent.click(screen.getByTestId("test-vehicle-supplier-cancel"));
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("test-vehicle-supplier-correct"));
    fireEvent.click(screen.getByTestId("test-vehicle-supplier-confirm"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(onSupplierApplied).not.toHaveBeenCalled();
  });

  it("keeps a null-version history correction manual after a stale 409", async () => {
    const onSupplierApplied = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "VEHICLE_SUPPLIER_ASSOCIATION_VERSION_CONFLICT",
          message: "Vehicle supplier history changed",
        }),
        { status: 409 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    withClient(
      <VehicleSupplierAssociationNotice
        site="Site A"
        vehicleNumber="TS99-V000"
        supplier="NEW SUPPLIER"
        association={{ status: "unlinked", supplier: null, version: null }}
        canCorrectVehicleSupplier
        onSupplierApplied={onSupplierApplied}
        testIdPrefix="null-version"
      />,
    );

    fireEvent.click(screen.getByTestId("null-version-vehicle-supplier-correct"));
    fireEvent.click(screen.getByTestId("null-version-vehicle-supplier-confirm"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const request = fetchMock.mock.calls[0];
    expect(JSON.parse(request?.[1]?.body as string)).toMatchObject({
      expectedVersion: null,
      expectedSupplier: null,
    });
    await act(async () => {
      await new Promise((done) => setTimeout(done, 0));
    });
    expect(onSupplierApplied).not.toHaveBeenCalled();
  });

  it("does not apply a late correction after the site or vehicle changes", async () => {
    let resolve!: (response: Response) => void;
    const fetchMock = vi.fn().mockImplementation(
      () => new Promise<Response>((done) => { resolve = done; }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onSupplierApplied = vi.fn();

    const rendered = withClient(
      <VehicleSupplierAssociationNotice
        site="Site A"
        vehicleNumber="KA01AB1234"
        supplier="OTHER HAULAGE"
        association={{ status: "linked", supplier: "ACME HAULAGE", version: "v1" }}
        canCorrectVehicleSupplier
        onSupplierApplied={onSupplierApplied}
        testIdPrefix="test"
      />,
    );
    fireEvent.click(screen.getByTestId("test-vehicle-supplier-correct"));
    fireEvent.click(screen.getByTestId("test-vehicle-supplier-confirm"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    rendered.rerender(
      <QueryClientProvider client={new QueryClient({})}>
        <VehicleSupplierAssociationNotice
          site="Site B"
          vehicleNumber="TS09XX1"
          supplier="OTHER HAULAGE"
          association={{ status: "linked", supplier: "ACME HAULAGE", version: "v1" }}
          canCorrectVehicleSupplier
          onSupplierApplied={onSupplierApplied}
          testIdPrefix="test"
        />
      </QueryClientProvider>,
    );
    await act(async () => {
      resolve(
        new Response(
          JSON.stringify({ status: "linked", supplier: "OTHER HAULAGE", version: "v2" }),
        ),
      );
      await new Promise((done) => setTimeout(done, 0));
    });
    await waitFor(() =>
      expect(screen.queryByTestId("test-vehicle-supplier-dialog")).not.toBeInTheDocument(),
    );
    expect(onSupplierApplied).not.toHaveBeenCalled();
  });

  it("does not overwrite a newer manual supplier for the same site and vehicle", async () => {
    let resolve!: (response: Response) => void;
    const fetchMock = vi.fn().mockImplementation(
      () => new Promise<Response>((done) => { resolve = done; }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onSupplierApplied = vi.fn();

    const rendered = withClient(
      <VehicleSupplierAssociationNotice
        site="Site A"
        vehicleNumber="KA01AB1234"
        supplier="OTHER HAULAGE"
        association={{ status: "linked", supplier: "ACME HAULAGE", version: "v1" }}
        canCorrectVehicleSupplier
        onSupplierApplied={onSupplierApplied}
        testIdPrefix="test"
      />,
    );
    fireEvent.click(screen.getByTestId("test-vehicle-supplier-correct"));
    fireEvent.click(screen.getByTestId("test-vehicle-supplier-confirm"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // The operator changed the supplier while the correction request was in
    // flight. It is still the same site/vehicle, but this newer manual value
    // must win when the old request eventually resolves.
    rendered.rerender(
      <QueryClientProvider client={new QueryClient({})}>
        <VehicleSupplierAssociationNotice
          site="Site A"
          vehicleNumber="KA01AB1234"
          supplier="NEW MANUAL SUPPLIER"
          association={{ status: "linked", supplier: "ACME HAULAGE", version: "v1" }}
          canCorrectVehicleSupplier
          onSupplierApplied={onSupplierApplied}
          testIdPrefix="test"
        />
      </QueryClientProvider>,
    );
    await act(async () => {
      resolve(
        new Response(
          JSON.stringify({ status: "linked", supplier: "OTHER HAULAGE", version: "v2" }),
        ),
      );
      await new Promise((done) => setTimeout(done, 0));
    });
    await waitFor(() =>
      expect(screen.queryByTestId("test-vehicle-supplier-dialog")).not.toBeInTheDocument(),
    );
    expect(onSupplierApplied).not.toHaveBeenCalled();
  });
});