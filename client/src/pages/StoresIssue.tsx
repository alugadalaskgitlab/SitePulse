import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronLeft, Plus, Trash2, ArrowUpFromLine, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const TODAY = format(new Date(), "yyyy-MM-dd");
const SECTIONS = [{ value: "plant", label: "Plant" }, { value: "site", label: "Site" }, { value: "other", label: "Other" }];
const PURPOSES = ["Breakdown Repair", "Scheduled Service", "Preventive Maintenance", "Site Work", "General Use", "Other"];

type StoreItem = { id: number; name: string; category: string; uom: string };
type IssueLine = { itemId: string; qty: string; uom: string };
type IssueWithItems = {
  id: number; issueNumber: string; date: string;
  issuedToSection: string; issuedToDetail: string | null; purpose: string | null; remarks: string | null;
  items: { itemId: number; itemName: string; category: string; qty: number; uom: string }[];
};

const emptyLine = (): IssueLine => ({ itemId: "", qty: "", uom: "" });

interface Props { isNew?: boolean }

export default function StoresIssue({ isNew }: Props) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [showForm, setShowForm] = useState(!!isNew);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sectionFilter, setSectionFilter] = useState("__all__");

  const [form, setForm] = useState({
    date: TODAY, issuedToSection: "plant", issuedToDetail: "", purpose: "", remarks: "",
  });
  const [lines, setLines] = useState<IssueLine[]>([emptyLine()]);

  const { data: items = [] } = useQuery<StoreItem[]>({
    queryKey: ["/api/stores/items"],
    queryFn: async () => {
      const res = await fetch("/api/stores/items");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: stock = [] } = useQuery<any[]>({ queryKey: ["/api/stores/stock-summary"] });
  const stockMap = stock.reduce<Record<number, number>>((acc, s) => { acc[s.itemId] = s.balance; return acc; }, {});

  const { data: issues = [], isLoading } = useQuery<IssueWithItems[]>({
    queryKey: ["/api/stores/issues", dateFrom, dateTo, sectionFilter],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (dateFrom) p.set("dateFrom", dateFrom);
      if (dateTo) p.set("dateTo", dateTo);
      if (sectionFilter !== "__all__") p.set("section", sectionFilter);
      const res = await fetch(`/api/stores/issues${p.toString() ? "?" + p : ""}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/stores/issues", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith("/api/stores") });
      toast({ title: "Issue Voucher created" });
      setShowForm(false);
      setForm({ date: TODAY, issuedToSection: "plant", issuedToDetail: "", purpose: "", remarks: "" });
      setLines([emptyLine()]);
      if (isNew) navigate("/stores/issues");
    },
    onError: () => toast({ title: "Error creating Issue Voucher", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/stores/issues/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith("/api/stores") });
      toast({ title: "Issue deleted" });
    },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  function updateLine(idx: number, key: keyof IssueLine, val: string) {
    setLines(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: val };
      if (key === "itemId" && val) {
        const item = items.find(i => String(i.id) === val);
        if (item) next[idx].uom = item.uom;
      }
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validLines = lines.filter(l => l.itemId && l.qty);
    if (!validLines.length) { toast({ title: "Add at least one item", variant: "destructive" }); return; }
    createMutation.mutate({
      issue: {
        ...form,
        issuedToDetail: form.issuedToDetail || null,
        purpose: form.purpose || null,
        remarks: form.remarks || null,
      },
      items: validLines.map(l => ({ itemId: parseInt(l.itemId), qty: parseFloat(l.qty), uom: l.uom })),
    });
  }

  const sectionLabel = (s: string) => SECTIONS.find(x => x.value === s)?.label ?? s;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/stores">
            <Button variant="ghost" size="icon" data-testid="button-back"><ChevronLeft className="w-5 h-5" /></Button>
          </Link>
          <div className="flex items-center gap-2 flex-1">
            <ArrowUpFromLine className="w-5 h-5 text-orange-600" />
            <h1 className="text-xl font-bold">Issue Vouchers</h1>
          </div>
          {!showForm && (
            <Button size="sm" className="gap-1 bg-orange-600 hover:bg-orange-700" onClick={() => setShowForm(true)} data-testid="button-new-issue">
              <Plus className="w-4 h-4" /> New Issue
            </Button>
          )}
        </div>

        {/* New Issue form */}
        {showForm && (
          <Card className="border-orange-200 dark:border-orange-900">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <ArrowUpFromLine className="w-4 h-4 text-orange-600" /> New Issue Voucher
                </h3>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setShowForm(false); if (isNew) navigate("/stores/issues"); }}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Date *</Label>
                    <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required data-testid="input-issue-date" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Issued To (Section) *</Label>
                    <Select value={form.issuedToSection} onValueChange={v => setForm(f => ({ ...f, issuedToSection: v }))}>
                      <SelectTrigger data-testid="select-section"><SelectValue /></SelectTrigger>
                      <SelectContent>{SECTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Detail (Equipment / Site Name)</Label>
                    <Input value={form.issuedToDetail} onChange={e => setForm(f => ({ ...f, issuedToDetail: e.target.value }))} placeholder="e.g. Paver MH-01, Site A" data-testid="input-issued-to-detail" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Purpose</Label>
                    <Select value={form.purpose || "__none__"} onValueChange={v => setForm(f => ({ ...f, purpose: v === "__none__" ? "" : v }))}>
                      <SelectTrigger data-testid="select-purpose"><SelectValue placeholder="Select purpose" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Not specified</SelectItem>
                        {PURPOSES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label className="text-xs">Remarks</Label>
                    <Input value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} placeholder="Optional" data-testid="input-issue-remarks" />
                  </div>
                </div>

                {/* Line items */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Items Issued *</Label>
                  {lines.map((line, idx) => {
                    const selectedItem = items.find(i => String(i.id) === line.itemId);
                    const avail = selectedItem ? (stockMap[selectedItem.id] ?? 0) : null;
                    const qty = parseFloat(line.qty) || 0;
                    const over = avail !== null && qty > avail;
                    return (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-end" data-testid={`issue-line-${idx}`}>
                        <div className="col-span-5">
                          <Select value={line.itemId} onValueChange={v => updateLine(idx, "itemId", v)}>
                            <SelectTrigger className="text-xs h-8" data-testid={`select-issue-item-${idx}`}>
                              <SelectValue placeholder="Select item" />
                            </SelectTrigger>
                            <SelectContent>
                              {items.map(it => (
                                <SelectItem key={it.id} value={String(it.id)}>
                                  {it.name} <span className="text-muted-foreground">— Stock: {(stockMap[it.id] ?? 0).toFixed(1)} {it.uom}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {avail !== null && (
                            <p className={`text-[10px] mt-0.5 ${over ? "text-red-600" : "text-muted-foreground"}`}>
                              Available: {avail.toFixed(2)} {selectedItem?.uom} {over ? "⚠ exceeds stock" : ""}
                            </p>
                          )}
                        </div>
                        <div className="col-span-3">
                          <Input type="number" min="0" step="any" className={`h-8 text-xs ${over ? "border-red-400" : ""}`} placeholder="Qty" value={line.qty} onChange={e => updateLine(idx, "qty", e.target.value)} data-testid={`input-issue-qty-${idx}`} />
                        </div>
                        <div className="col-span-3">
                          <Input className="h-8 text-xs" placeholder="UOM" value={line.uom} onChange={e => updateLine(idx, "uom", e.target.value)} data-testid={`input-issue-uom-${idx}`} />
                        </div>
                        <div className="col-span-1 flex justify-center">
                          {lines.length > 1 && (
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}>
                              <X className="w-3 h-3 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <Button type="button" variant="outline" size="sm" className="text-xs gap-1" onClick={() => setLines(prev => [...prev, emptyLine()])} data-testid="button-add-issue-line">
                    <Plus className="w-3 h-3" /> Add Line
                  </Button>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button type="button" variant="ghost" onClick={() => { setShowForm(false); if (isNew) navigate("/stores/issues"); }}>Cancel</Button>
                  <Button type="submit" className="gap-1 bg-orange-600 hover:bg-orange-700" disabled={createMutation.isPending} data-testid="button-save-issue">
                    {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpFromLine className="w-4 h-4" />}
                    Save Issue Voucher
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input type="date" className="h-8 w-36 text-xs" value={dateFrom} onChange={e => setDateFrom(e.target.value)} data-testid="input-date-from" />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input type="date" className="h-8 w-36 text-xs" value={dateTo} onChange={e => setDateTo(e.target.value)} data-testid="input-date-to" />
          </div>
          <Select value={sectionFilter} onValueChange={setSectionFilter}>
            <SelectTrigger className="h-8 w-32 text-xs" data-testid="select-section-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Sections</SelectItem>
              {SECTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {(dateFrom || dateTo || sectionFilter !== "__all__") && (
            <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => { setDateFrom(""); setDateTo(""); setSectionFilter("__all__"); }}>Clear</Button>
          )}
        </div>

        {/* Issue List */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
        ) : issues.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No issue vouchers found.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {issues.map(issue => (
              <Card key={issue.id} data-testid={`card-issue-${issue.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-bold text-orange-700 dark:text-orange-400">{issue.issueNumber}</span>
                        <span className="text-xs text-muted-foreground">{format(new Date(issue.date + "T00:00:00"), "dd MMM yyyy")}</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
                          {sectionLabel(issue.issuedToSection)}
                        </span>
                      </div>
                      {issue.issuedToDetail && <div className="text-sm font-medium mt-1">{issue.issuedToDetail}</div>}
                      {issue.purpose && <div className="text-xs text-muted-foreground">{issue.purpose}</div>}
                      <div className="mt-2 space-y-0.5">
                        {issue.items.map((it, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{it.itemName}</span>
                            <span>—</span>
                            <span>{it.qty} {it.uom}</span>
                          </div>
                        ))}
                      </div>
                      {issue.remarks && <div className="text-xs text-muted-foreground mt-1 italic">{issue.remarks}</div>}
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => { if (confirm("Delete this Issue Voucher?")) deleteMutation.mutate(issue.id); }} data-testid={`button-delete-issue-${issue.id}`}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
