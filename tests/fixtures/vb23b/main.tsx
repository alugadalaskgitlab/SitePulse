import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { TooltipProvider } from "@/components/ui/tooltip";
import VendorBills from "@/pages/VendorBills";
import "@/index.css";

queryClient.clear();
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <aside
        data-testid="vb23b-disclosure"
        className="sticky top-0 z-[100] border-b-2 border-emerald-700 bg-emerald-50 px-4 py-2 text-center text-xs font-bold text-emerald-950"
      >
        VB-23B ISOLATED EVIDENCE — production VendorBills page + HTTP test server + real DatabaseStorage methods; transaction DB mock, no live writes.
      </aside>
      <VendorBills />
    </TooltipProvider>
  </QueryClientProvider>,
);