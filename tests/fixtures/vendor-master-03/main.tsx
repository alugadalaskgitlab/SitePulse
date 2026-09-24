import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../../../client/src/lib/auth-context";
import VendorMaster from "../../../client/src/pages/VendorMaster";
import "../../../client/src/index.css";

// Synthetic API boundary only: handler semantics are exercised by vendorMasterHandlersPartA.test.ts.
const vendor = {
  id: 1, name: "SYNTHETIC North Aggregates", businessName: "SYNTHETIC North Trading",
  gstNumber: "SYN-GST-001", panNumber: "SYN-PAN-001", address: "Synthetic Quarry Road",
  contactPersonName: "Synthetic Contact", contactPhone: "000-000-0000", contactEmail: "north@example.invalid",
  bankAccountName: "Synthetic Holder", bankAccountNumber: "SYN-ACCOUNT-001", bankIfsc: "SYN-IFSC",
  bankName: "Synthetic Bank", isActive: true,
};
const proposals = [
  { role: "indents", name: "SYNTHETIC Quarry Bulk", ids: [101], count: 1, hint: null, suggestionId: 1 },
  { role: "indents", name: "SYNTHETIC Plant Bulk", ids: [102], count: 1, hint: null, suggestionId: 1 },
];
const excluded = ["SYNTHETIC Stores PI", "SYNTHETIC Bill Supplier", "SYNTHETIC Rate Supplier", "SYNTHETIC Trip Transporter", "SYNTHETIC Trip Material Source"];
const links: { role: string; name: string; ids: number[]; vendorId: number }[] = [];
const writes: string[] = [];
(window as any).__vendor03 = { proposals, excluded, links, writes };
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url, location.origin);
  const method = init.method || "GET";
  if (url.pathname === "/api/auth/me") return Response.json({
    user: { id: 99, email: "fixture@example.invalid", fullName: "Synthetic Administrator", isAdmin: true, isOwner: false, isActive: true, sessionPolicy: "sticky" },
    permissions: {},
  });
  if (url.pathname === "/api/vendor-master") return Response.json([vendor]);
  if (url.pathname === "/api/vendor-master/review" && method === "GET") return Response.json(proposals);
  if (url.pathname === "/api/vendor-master/review/confirm" && method === "POST") {
    const body = JSON.parse(String(init.body));
    const index = proposals.findIndex(p => p.role === body.role && p.name === body.name && JSON.stringify(p.ids) === JSON.stringify(body.ids));
    if (index < 0 || body.vendorId !== 1) return Response.json({ message: "Review is stale" }, { status: 409 });
    proposals.splice(index, 1);
    links.push({ role: body.role, name: body.name, ids: body.ids, vendorId: body.vendorId });
    writes.push(`${method} ${url.pathname}`);
    return Response.json({ vendorId: body.vendorId, linked: body.ids.length });
  }
  if (url.pathname === "/api/vendor-master/1/activity") return Response.json({
    vendor,
    sites: [{ site: "SYNTHETIC North Site", equipment: 1, material: 2 + links.length, transport: 1, labour: 1 }],
  });
  if (url.pathname.startsWith("/api/")) return Response.json({ message: `Unexpected synthetic fixture API ${url.pathname}` }, { status: 404 });
  return originalFetch(input, init);
};
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, queryFn: async ({ queryKey }) => {
    const response = await fetch(String(queryKey[0]));
    if (!response.ok) throw new Error(`Fixture GET failed: ${response.status}`);
    return response.json();
  } } },
});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <AuthProvider>
      <div className="min-h-screen bg-slate-100">
        <div data-testid="fixture-label" className="border-b-2 border-fuchsia-600 bg-fuchsia-50 px-5 py-3 text-sm font-bold text-fuchsia-900">
          VENDOR-03 · SYNTHETIC ACTUAL VENDORMASTER COMPONENT · MOCK API ONLY · NO LIVE RECORDS OR WRITES
        </div>
        <VendorMaster />
      </div>
    </AuthProvider>
  </QueryClientProvider>,
);