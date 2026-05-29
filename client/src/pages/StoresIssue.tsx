import { useState, useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronLeft, Plus, Trash2, ArrowUpFromLine, X, Loader2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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

interface Props { isNew?: boolean; detailId?: number }

export default function StoresIssue({ isNew, detailId }: Props) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const search = useSearch();
  const returnTo = new URLSearchParams(search).get("returnTo") || "/stores";
  const [showForm, setShowForm] = useState(!!isNew);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sectionFilter, setSectionFilter] = useState("__all__");
  const [selectedId, setSelectedId] = useState<number | null>(detailId ?? null);

  const [form, setForm] = useState({
    date: TODAY, issuedToSection: "plant", issuedToDetail: "", purpose: "", remarks: "",
  });
  const [lines, setLines] = useState<IssueLine[]>([emptyLine()]);

  useEffect(() => {
    if (detailId) setSelectedId(detailId);
  }, [detailId]);

  const { data: items = [] } = useQuery<StoreItem[]>({ queryKey: ["/api/stores/items"] });

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

  const { data: previewNum } = useQuery<{ number: string }>({
    queryKey: ["/api/stores/next-doc-number", "ISS"],
    queryFn: () => fetch("/api/stores/next-doc-number?type=ISS").then(r => r.json()),
    enabled: showForm,
    staleTime: 0,
  });

  const selectedIssue = issues.find(i => i.id === selectedId) ?? null;

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

  function openDetail(issue: IssueWithItems) {
    setSelectedId(issue.id);
    navigate(`/stores/issues/${issue.id}`);
    setShowForm(false);
  }

  function closeDetail() {
    setSelectedId(null);
    navigate("/stores/issues");
  }

  const sectionLabel = (s: string) => SECTIONS.find(x => x.value === s)?.label ?? s;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Link href={returnTo}>
            <Button variant="ghost" size="icon" data-testid="button-back"><ChevronLeft className="w-5 h-5" /></Button>
          </Link>
          <div className="flex items-center gap-2 flex-1">
            <ArrowUpFromLine className="w-5 h-5 text-orange-600" />
            <h1 className="text-xl font-bold">Issue Vouchers</h1>
          </div>
          {!showForm && !selectedId && (
            <Button size="sm" className="gap-1 bg-orange-600 hover:bg-orange-700" onClick={() => setShowForm(true)} data-testid="button-new-issue">
              <Plus className="w-4 h-4" /> New Issue
            </Button>
          )}
        </div>

        {/* Detail panel */}
        {selectedIssue && (
          <Card className="border-orange-300 dark:border-orange-800 shadow-md">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-lg font-bold text-orange-700 dark:text-orange-400" data-testid="text-issue-detail-number">{selectedIssue.issueNumber}</span>
                    <span className="text-sm text-muted-foreground">{format(new Date(selectedIssue.date + "T00:00:00"), "dd MMM yyyy")}</span>
                    <Badge variant="outline" className="text-[10px]">{sectionLabel(selectedIssue.issuedToSection)}</Badge>
                  </div>
                  {selectedIssue.issuedToDetail && <p className="text-base font-semibold mt-1">{selectedIssue.issuedToDetail}</p>}
                  {selectedIssue.purpose && <p className="text-xs text-muted-foreground">{selectedIssue.purpose}</p>}
                  {selectedIssue.remarks && <p className="text-xs text-muted-foreground italic mt-1">{selectedIssue.remarks}</p>}
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={closeDetail} data-testid="button-close-detail">
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="border rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs">Item</th>
                      <th className="text-left px-3 py-2 text-xs">Category</th>
                      <th className="text-right px-3 py-2 text-xs">Qty</th>
                      <th className="text-left px-2 py-2 text-xs">UOM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedIssue.items.map((it, i) => (
                      <tr key={i} className="border-t" data-testid={`row-detail-item-${i}`}>
                        <td className="px-3 py-2 font-medium">{it.itemName}</td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{it.category}</td>
                        <td className="px-3 py-2 text-right">{it.qty}</td>
                        <td className="px-2 py-2 text-xs">{it.uom}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between items-center">
                <Button variant="outline" size="sm" onClick={closeDetail} data-testid="button-back-to-list" className="gap-1">
                  <ChevronLeft className="w-4 h-4" /> Back to list
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive gap-1"
                  onClick={() => { if (confirm("Delete this Issue Voucher?")) { deleteMutation.mutate(selectedIssue.id); closeDetail(); } }}
                  data-testid="button-delete-detail-issue">
                  <Trash2 className="w-4 h-4" /> Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* New Issue form */}
        {!selectedId && showForm && (
          <Card className="border-orange-200 dark:border-orange-900">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <ArrowUpFromLine className="w-4 h-4 text-orange-600" /> New Issue Voucher
                  </h3>
                  {previewNum?.number && (
                    <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded" data-testid="text-issue-preview-number">
                      {previewNum.number}
                    </span>
                  )}
                </div>
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

        {!selectedId && (
          <>
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
                  <Card key={issue.id} className="cursor-pointer hover-elevate" onClick={() => openDetail(issue)} data-testid={`card-issue-${issue.id}`}>
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
                          <div className="mt-1 text-xs text-muted-foreground">
                            {issue.items.length} item{issue.items.length !== 1 ? "s" : ""}
                            {" — "}
                            {issue.items.map(it => `${it.itemName} (${it.qty} ${it.uom})`).join(", ")}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDetail(issue)} data-testid={`button-view-issue-${issue.id}`}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (confirm("Delete this Issue Voucher?")) deleteMutation.mutate(issue.id); }} data-testid={`button-delete-issue-${issue.id}`}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
