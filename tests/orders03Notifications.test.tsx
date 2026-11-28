// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  invalidateQueries: vi.fn(),
  navigate: vi.fn(),
}));
const originalLocationDescriptor = Object.getOwnPropertyDescriptor(window, "location");

vi.mock("@/lib/queryClient", () => ({
  apiRequest: mocks.apiRequest,
  queryClient: { invalidateQueries: mocks.invalidateQueries },
}));
vi.mock("../client/src/components/PushNotificationSetup", () => ({
  PushNotificationSetup: () => null,
}));

import { AdminNotifications, plantSupplyNotificationHref } from "../client/src/components/AdminNotifications";

afterEach(() => {
  cleanup();
  if (originalLocationDescriptor) Object.defineProperty(window, "location", originalLocationDescriptor);
  vi.restoreAllMocks();
});

describe("ORDERS-03 supply notifications", () => {
  it("TANK-02 opens a private tank alert and marks only that tank notification read", async () => {
    mocks.apiRequest.mockClear(); mocks.navigate.mockClear();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    for (const source of ["/api/notifications", "/api/plant-supply-alert-notifications", "/api/tank-dip-alert-notifications"]) {
      client.setQueryData([source], []);
      client.setQueryData([`${source}/unread-count`], { count: 0 });
    }
    client.setQueryData(["/api/tank-dip-alert-notifications"], [{
      id: 12, alertType: "tank_dip:ldo:2:opening:Plant%20A:2026-11-28",
      title: "Opening tank dip reminder", message: "Enter today's dip readings: LDO tank 2",
      isRead: false, createdAt: "2026-11-28T02:30:00.000Z",
    }]);
    mocks.apiRequest.mockResolvedValue(new Response("{}", { status: 200 }));
    Object.defineProperty(window, "location", { configurable: true, value: { assign: mocks.navigate } });
    render(<QueryClientProvider client={client}><AdminNotifications /></QueryClientProvider>);
    fireEvent.click(screen.getByTestId("button-notifications"));
    fireEvent.click(await screen.findByTestId("button-expand-notification-tank-12"));
    fireEvent.click(await screen.findByTestId("button-open-order-notification-tank-12"));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("PATCH", "/api/tank-dip-alert-notifications/12/read"));
    expect(mocks.navigate.mock.calls[0][0]).toContain("/plant/ldo-flow-meter?plant=Plant+A&dipEntry=1&tank=2");
    expect(mocks.apiRequest).not.toHaveBeenCalledWith("PATCH", "/api/plant-supply-alert-notifications/12/read");
  });
  it("links order alerts to the selected order and morning summaries to HMP material status", () => {
    expect(plantSupplyNotificationHref({ source: "supply", alertType: "exhausted", orderId: 42 }))
      .toBe("/plant/supply-orders?orderId=42&section=material-status#order-material-status");
    expect(plantSupplyNotificationHref({ source: "supply", alertType: "morning_summary", orderId: null }))
      .toBe("/plant/hub#hmp-open-order-material-alerts");
    expect(plantSupplyNotificationHref({ source: "global", alertType: undefined, orderId: null })).toBeNull();
  });

  it("expands the complete alert and marks it read before opening its order", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["/api/notifications"], []);
    client.setQueryData(["/api/notifications/unread-count"], { count: 0 });
    client.setQueryData(["/api/plant-supply-alert-notifications"], [{
      id: 12,
      alertType: "exhausted",
      orderId: 42,
      title: "Material exhausted",
      message: "G SANGANNA · PO-42\nBC 900 MT · 1 Nov–30 Nov · dispatched 10 MT · balance 890 MT\nShort: Dust 299 MT",
      isRead: false,
      createdAt: "2026-11-20T04:00:00.000Z",
    }]);
    client.setQueryData(["/api/plant-supply-alert-notifications/unread-count"], { count: 1 });
    mocks.apiRequest.mockResolvedValue(new Response("{}", { status: 200 }));
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign: mocks.navigate },
    });

    render(<QueryClientProvider client={client}><AdminNotifications /></QueryClientProvider>);
    fireEvent.click(screen.getByTestId("button-notifications"));
    const message = await screen.findByTestId("button-expand-notification-supply-12");
    expect(message.textContent).toContain("Short: Dust 299 MT");
    fireEvent.click(message);
    fireEvent.click(await screen.findByTestId("button-open-order-notification-supply-12"));

    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith(
      "PATCH",
      "/api/plant-supply-alert-notifications/12/read",
    ));
    expect(mocks.navigate).toHaveBeenCalledWith(
      "/plant/supply-orders?orderId=42&section=material-status#order-material-status",
    );
  });
});
