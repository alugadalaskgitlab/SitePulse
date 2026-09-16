// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import React, { useState } from "react";
import { FreeTextSuggestionInput } from "../client/src/components/FreeTextSuggestionInput";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../client/src/components/ui/dialog";
import {
  filterFreeTextSuggestions,
  useSiteMaterialSuggestions,
} from "../client/src/hooks/use-site-material-suggestions";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("FreeTextSuggestionInput", () => {
  it("keeps empty and failed lookups non-blocking for manual entry", () => {
    const onChange = vi.fn();
    render(
      <FreeTextSuggestionInput
        value=""
        onChange={onChange}
        suggestions={[]}
        suggestionsError={new Error("offline")}
        data-testid="vehicle"
      />,
    );

    const input = screen.getByTestId("vehicle");
    expect(input).toHaveAttribute("role", "combobox");
    expect(screen.getByRole("status")).toHaveTextContent(/manual entry/i);
    fireEvent.change(input, { target: { value: "KA 01" } });
    expect(onChange).toHaveBeenCalledWith("KA 01");
  });

  it("matches vehicle/supplier formatting independently and selects by keyboard", () => {
    expect(filterFreeTextSuggestions(["KA01AB-1234"], "ka 01 ab 1234", "vehicle")).toEqual([
      "KA01AB-1234",
    ]);
    expect(filterFreeTextSuggestions(["Acme  Haulage"], "acmehaulage", "supplier")).toEqual([
      "Acme  Haulage",
    ]);

    function Harness() {
      const [vehicle, setVehicle] = useState("");
      const [supplier, setSupplier] = useState("");
      return (
        <>
          <FreeTextSuggestionInput
            value={vehicle}
            onChange={setVehicle}
            suggestions={["KA 01 AB-1234"]}
            match="vehicle"
            data-testid="vehicle"
          />
          <FreeTextSuggestionInput
            value={supplier}
            onChange={setSupplier}
            suggestions={["ACME HAULAGE"]}
            match="supplier"
            data-testid="supplier"
          />
          <output data-testid="values">{vehicle}|{supplier}</output>
        </>
      );
    }

    render(<Harness />);
    const vehicle = screen.getByTestId("vehicle");
    const supplier = screen.getByTestId("supplier");
    fireEvent.change(supplier, { target: { value: "typed supplier" } });
    fireEvent.focus(vehicle);
    fireEvent.keyDown(vehicle, { key: "ArrowDown" });
    fireEvent.keyDown(vehicle, { key: "Enter" });
    expect(screen.getByTestId("values")).toHaveTextContent(
      "KA 01 AB-1234|typed supplier",
    );
    expect(screen.getByTestId("values")).not.toHaveTextContent("ACME HAULAGE");
  });

  it("selects by pointer inside a real dialog without closing it or losing free text", async () => {
    function DialogHarness() {
      const [value, setValue] = useState("");
      return (
        <Dialog open onOpenChange={() => undefined}>
          <DialogContent data-testid="suggestion-dialog">
            <DialogHeader>
              <DialogTitle>Receipt</DialogTitle>
              <DialogDescription>Choose a vehicle.</DialogDescription>
            </DialogHeader>
            <FreeTextSuggestionInput
              value={value}
              onChange={setValue}
              suggestions={["KA 01 AB-1234"]}
              match="vehicle"
              data-testid="dialog-vehicle"
            />
            <output data-testid="dialog-value">{value}</output>
          </DialogContent>
        </Dialog>
      );
    }

    render(<DialogHarness />);
    const input = screen.getByTestId("dialog-vehicle");
    fireEvent.focus(input);
    const option = await screen.findByRole("option", { name: "KA 01 AB-1234" });
    expect(option.closest('[role="dialog"]')).not.toBeNull();
    fireEvent.pointerDown(option);
    fireEvent.click(option);
    expect(screen.getByTestId("dialog-value")).toHaveTextContent("KA 01 AB-1234");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "manual free text" } });
    expect(screen.getByTestId("dialog-value")).toHaveTextContent("manual free text");
  });
});

describe("useSiteMaterialSuggestions", () => {
  it("uses a site-scoped request and aborts the old site without showing it for the new site", async () => {
    const requests: Array<{
      url: string;
      signal: AbortSignal | undefined;
      resolve: (response: Response) => void;
      reject: (error: unknown) => void;
    }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        return new Promise<Response>((resolve, reject) => {
          requests.push({ url, signal: init?.signal, resolve, reject });
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      }),
    );

    function Harness({ site }: { site: string }) {
      const result = useSiteMaterialSuggestions(site);
      return <output data-testid="suggestions">{JSON.stringify(result.suggestions)}</output>;
    }
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
    });
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <Harness site="Site A" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(requests).toHaveLength(1));

    rerender(
      <QueryClientProvider client={client}>
        <Harness site="Site B" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[0].signal?.aborted).toBe(true);
    expect(screen.getByTestId("suggestions")).toHaveTextContent(
      '{"vehicles":[],"suppliers":[]}',
    );
    expect(requests[1].url).toContain("/api/site-material-trips/suggestions?site=Site%20B");
    requests[1].resolve(new Response(JSON.stringify({ vehicles: ["B-1"], suppliers: ["B"] })));
    await waitFor(() => expect(screen.getByTestId("suggestions")).toHaveTextContent("B-1"));
  });
});