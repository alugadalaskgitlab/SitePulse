import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../../../client/src/lib/auth-context";
import VendorMaster from "../../../client/src/pages/VendorMaster";
import "../../../client/src/index.css";

const vendors: Record<string, any>[] = [{
  id: 1, name: "SYNTHETIC Metro Supplies", businessName: "SYNTHETIC Metro Trading",
  gstNumber: "SYN-GST-001", panNumber: "SYN-PAN-001", address: "1 Synthetic Road",
  bankAccountName: "Synthetic Holder", bankAccountNumber: "SYN-ACCOUNT-001", bankIfsc: "SYN-IFSC",
  bankName: "Synthetic Bank", contactPersonName: "Synthetic Contact", contactPhone: "000-000-0000",
  contactEmail: "metro@example.invalid", isActive: true,
}];
const proposals = [
  { role: "bills", name: "SYNTHETIC Metro Ltd", ids: [101, 102], count: 2, hint: "SYNTHETIC Metro Supplies", suggestionId: 1 },
  { role: "materialSource", name: "SYNTHETIC Quarry Partner", ids: [201], count: 1, hint: null, suggestionId: null },
];
const links: any[] = [];
const writes: any[] = [];
const fixture = { vendors, proposals, links, writes };
(window as any).__vendorFixture = fixture;
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url, location.origin);
  const method = init.method || "GET";
  const body = init.body ? JSON.parse(String(init.body)) : null;
  if (url.pathname === "/api/auth/me") return Response.json({
    user: { id: 99, email: "fixture@example.invalid", fullName: "Synthetic Administrator", isAdmin: true, isOwner: false, isActive: true, sessionPolicy: "sticky" },
    permissions: {},
  });
  if (url.pathname === "/api/vendor-master") {
    if (method === "GET") return Response.json(vendors);
    const created = { ...body, id: Math.max(...vendors.map(v => v.id)) + 1 };
    vendors.push(created);
    writes.push({ method, path: url.pathname, body });
    return Response.json(created, { status: 201 });
  }
  if (url.pathname === "/api/vendor-master/review") return Response.json(proposals);
  if (url.pathname === "/api/vendor-master/review/confirm") {
    const index = proposals.findIndex(p => p.role === body.role && p.name === body.name);
    if (index < 0 || JSON.stringify(proposals[index].ids) !== JSON.stringify(body.ids))
      return Response.json({ message: "Review is stale" }, { status: 409 });
    const vendorId = body.vendorId || Math.max(...vendors.map(v => v.id)) + 1;
    if (body.newVendor) vendors.push({ ...body.newVendor, id: vendorId });
    proposals.splice(index, 1);
    links.push({ role: body.role, name: body.name, vendorId, ids: body.ids });
    writes.push({ method, path: url.pathname, body });
    return Response.json({ vendorId, linked: body.ids.length });
  }
  const edit = url.pathname.match(/^\/api\/vendor-master\/(\d+)$/);
  if (edit && method === "PATCH") {
    const vendor = vendors.find(v => v.id === Number(edit[1]));
    if (!vendor) return Response.json({ message: "Missing" }, { status: 404 });
    Object.assign(vendor, body);
    writes.push({ method, path: url.pathname, body });
    return Response.json(vendor);
  }
  const activity = url.pathname.match(/^\/api\/vendor-master\/(\d+)\/activity$/);
  if (activity) {
    const vendor = vendors.find(v => v.id === Number(activity[1]));
    const siteRows = vendor?.id === 1 && links.some(l => l.vendorId === 1)
      ? [{ site: "SYNTHETIC North Site", equipment: 2, material: 0, transport: 1, labour: 0 },
         { site: "SYNTHETIC South Site", equipment: 0, material: 3, transport: 0, labour: 1 }]
      : vendor?.id === 1 ? [{ site: "SYNTHETIC North Site", equipment: 1, material: 0, transport: 0, labour: 0 }] : [];
    return Response.json({ vendor, sites: siteRows });
  }
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
          PART A · SYNTHETIC VENDOR MASTER COMPONENT FIXTURE · MOCK API ONLY · NO LIVE RECORDS OR WRITES
        </div>
        <VendorMaster />
      </div>
    </AuthProvider>
  </QueryClientProvider>,
);