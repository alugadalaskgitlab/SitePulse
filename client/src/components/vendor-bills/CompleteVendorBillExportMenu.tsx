import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type CompleteVendorBillExportFormat = "xlsx" | "json";

export function completeVendorBillExportUrl(format: CompleteVendorBillExportFormat) {
  return `/api/vendor-bills/export?format=${format}`;
}

export async function downloadCompleteVendorBillExport(format: CompleteVendorBillExportFormat) {
  const response = await fetch(completeVendorBillExportUrl(format), {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || `Export failed (${response.status})`);
  }

  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `vendor-bills-complete.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function CompleteVendorBillExportMenu({
  canViewFinancials,
  canExport,
  isAdmin,
  isOwner,
  onExport,
}: {
  canViewFinancials: boolean;
  canExport: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  onExport: (format: CompleteVendorBillExportFormat) => void;
}) {
  if (!canViewFinancials || !canExport || (!isAdmin && !isOwner)) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" data-testid="button-export-all-vendor-bills">
          <Download className="mr-1 h-3 w-3" />
          Export all bills in your permitted scope (ignores page filters)
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onExport("xlsx")}>Excel workbook (.xlsx)</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onExport("json")}>JSON file (.json)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
