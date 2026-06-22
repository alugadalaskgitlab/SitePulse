import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Printer, FileText, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import type { RmcBatchRecordWithDesign } from "@shared/schema";

const today = new Date().toISOString().slice(0, 10);
const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

function DCPrintView({ record, onClose }: { record: RmcBatchRecordWithDesign; onClose: () => void }) {
  const handlePrint = () => window.print();
  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex gap-2 mb-4 print:hidden">
        <Button onClick={handlePrint}><Printer className="w-4 h-4 mr-2" />Print</Button>
        <Button variant="outline" onClick={onClose}>Back to List</Button>
      </div>
      <div className="border rounded-lg p-8 text-sm space-y-4 print:border-0 print:p-0">
        <div className="text-center border-b pb-4 mb-4">
          <h2 className="text-2xl font-bold">DELIVERY CHALLAN</h2>
          <p className="text-muted-foreground mt-1">Ready Mix Concrete Plant — {record.plantName}</p>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground uppercase tracking-wide">DC Number</p>
              <p className="font-bold text-lg">{record.dcNumber || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground uppercase tracking-wide">Date</p>
              <p className="font-semibold">{record.date}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground uppercase tracking-wide">Vehicle Number</p>
              <p className="font-semibold">{record.truckNumber || "—"}</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground uppercase tracking-wide">Customer / Client</p>
              <p className="font-semibold">{record.customerName || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground uppercase tracking-wide">Delivery Site</p>
              <p className="font-semibold">{record.deliverySite || "—"}</p>
            </div>
          </div>
        </div>
        <table className="w-full border-collapse border text-sm mt-6">
          <thead>
            <tr className="bg-muted">
              <th className="border p-3 text-left">Mix Grade</th>
              <th className="border p-3 text-center">No. of Batches</th>
              <th className="border p-3 text-right">Volume (m³)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border p-3 font-semibold">{record.grade}</td>
              <td className="border p-3 text-center">{record.batchesCount ?? "—"}</td>
              <td className="border p-3 text-right font-bold text-lg">{record.totalVolumeM3.toFixed(2)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="bg-muted font-bold">
              <td className="border p-3">Total</td>
              <td className="border p-3 text-center">{record.batchesCount ?? "—"}</td>
              <td className="border p-3 text-right">{record.totalVolumeM3.toFixed(2)} m³</td>
            </tr>
          </tfoot>
        </table>
        {record.remarks && (
          <div className="mt-4">
            <p className="text-sm text-muted-foreground uppercase tracking-wide">Remarks</p>
            <p className="mt-1">{record.remarks}</p>
          </div>
        )}
        <div className="grid grid-cols-3 gap-6 pt-12 border-t mt-8">
          <div className="text-center">
            <div className="border-t border-gray-400 pt-2 text-sm text-muted-foreground">Prepared By</div>
          </div>
          <div className="text-center">
            <div className="border-t border-gray-400 pt-2 text-sm text-muted-foreground">Plant In-Charge</div>
          </div>
          <div className="text-center">
            <div className="border-t border-gray-400 pt-2 text-sm text-muted-foreground">Customer Signature & Stamp</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RmcDeliveryChallans() {
  const [dateFrom, setDateFrom] = useState(monthAgo);
  const [dateTo, setDateTo] = useState(today);
  const [printRecord, setPrintRecord] = useState<RmcBatchRecordWithDesign | null>(null);

  const { data: allRecords = [], isLoading } = useQuery<RmcBatchRecordWithDesign[]>({
    queryKey: ["/api/rmc/batch-records", dateFrom, dateTo],
    queryFn: () =>
      apiRequest("GET", `/api/rmc/batch-records?dateFrom=${dateFrom}&dateTo=${dateTo}`)
        .then(r => r.json()),
  });

  const challans = allRecords.filter(r => r.dcNumber);
  const withoutDc = allRecords.filter(r => !r.dcNumber);

  if (printRecord) {
    return <DCPrintView record={printRecord} onClose={() => setPrintRecord(null)} />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/plant/rmc">
            <Button variant="ghost" size="icon" data-testid="btn-back"><ArrowLeft className="w-5 h-5" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Delivery Challans</h1>
            <p className="text-sm text-muted-foreground">View and print RMC delivery challans generated from batch records</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" data-testid="input-date-from" />
          <span className="text-muted-foreground text-sm">to</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" data-testid="input-date-to" />
        </div>
      </div>

      {challans.length > 0 && (
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{challans.length} challan{challans.length !== 1 ? "s" : ""}</span>
          <span>•</span>
          <span>{challans.reduce((s, r) => s + r.totalVolumeM3, 0).toFixed(2)} m³ total</span>
          {withoutDc.length > 0 && (
            <>
              <span>•</span>
              <span className="text-amber-600">{withoutDc.length} batch{withoutDc.length !== 1 ? "es" : ""} without DC number</span>
            </>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading…</div>
      ) : challans.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <FileText className="w-10 h-10 text-muted-foreground" />
            <p className="text-muted-foreground font-medium">No delivery challans in this period</p>
            <p className="text-sm text-muted-foreground">
              {withoutDc.length > 0
                ? `${withoutDc.length} batch record${withoutDc.length !== 1 ? "s" : ""} found without a DC number. Add DC numbers in Batch Records to generate challans.`
                : "Add DC numbers to batch records so they appear here as delivery challans."}
            </p>
            <Link href="/plant/rmc/batch-records">
              <Button variant="outline" size="sm" className="mt-2">Go to Batch Records</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {challans.map(r => (
            <Card key={r.id} data-testid={`card-dc-${r.id}`} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-blue-700 dark:text-blue-300">DC: {r.dcNumber}</span>
                    <Badge>{r.grade}</Badge>
                    <span className="font-semibold">{r.totalVolumeM3.toFixed(2)} m³</span>
                    {r.batchesCount && <span className="text-sm text-muted-foreground">{r.batchesCount} batches</span>}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-3">
                    <span>{r.date}</span>
                    {r.customerName && <span>{r.customerName}</span>}
                    {r.deliverySite && <span>→ {r.deliverySite}</span>}
                    {r.truckNumber && <span>🚚 {r.truckNumber}</span>}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPrintRecord(r)}
                  data-testid={`btn-print-dc-${r.id}`}
                >
                  <Printer className="w-4 h-4 mr-2" />Print DC
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
