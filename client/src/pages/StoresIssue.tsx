import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronLeft, Plus, Trash2, ArrowUpFromLine, X, Loader2, Eye, Ban } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const TODAY = format(new Date(), "yyyy-MM-dd");
const SECTIONS = [{ value: "plant", label: "Plant" }, { value: "site", label: "Site" }, { value: "other", label: "Other" }];
const STORE_CATEGORIES = ["Spares", "Lubricants", "Consumables", "Electricals", "Tools", "HMA", "RMC", "Office", "General", "Others"];
const PURPOSES = ["Breakdown Repair", "Scheduled Service", "Preventive Maintenance", "Site Work", "General Use", "Other"];

type StoreItem = { id: number; name: string; category: string; uom: string };
type Site = { id: number; name: string; isActive: boolean };
type IssueLine = { itemId: string; qty: string; uom: string };
type IssueWithItems = {
  id: number; issueNumber: string; date: string;
  issuedToSection: string; issuedToDetail: string | null;
  siteId: number | null;
  purpose: string | null; remarks: string | null;
  isCancelled?: boolean; cancelledAt?: string | null; cancellationReason?: string | null;
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
  const [siteFilter, setSiteFilter] = useState("__all__");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [cancelDialogId, setCancelDialogId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(detailId ?? null);

  const [form, setForm] = useState({
    date: TODAY, issuedToSection: "plant", issuedToDetail: "", siteId: "", purpose: "", remarks: "",
  });
  const [lines, setLines] = useState<IssueLine[]>([emptyLine()]);

  const [itemComboSearch, setItemComboSearch] = useState<Record<number, string>>({});
  const [itemComboOpen, setItemComboOpen] = useState<Record<number, boolean>>({});
  const itemComboRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    if (detailId) setSelectedId(detailId);
  }, [detailId]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      Object.entries(itemComboRefs.current).forEach(([idxStr, ref]) => {
        const idx = parseInt(idxStr);
        if (ref && !ref.contains(e.target as Node)) {
          setItemComboOpen(prev => prev[idx] ? { ...prev, [idx]: false } : prev);
        }
      });
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const { data: items = [] } = useQuery<StoreItem[]>({ queryKey: ["/api/stores/items"] });
  const { data: sites = [] } = useQuery<Site[]>({ queryKey: ["/api/sites"] });
  const { data: recentItemIds = [] } = useQuery<number[]>({ queryKey: ["/api/stores/issues/recent-items"] });

  const { data: stock = [] } = useQuery<any[]>({ queryKey: ["/api/stores/stock-summary"] });
  const stockMap = stock.reduce<Record<number, number>>((acc, s) => { acc[s.itemId] = s.balance; return acc; }, {});

  const { data: issues = [], isLoading } = useQuery<IssueWithItems[]>({
    queryKey: ["/api/stores/issues", dateFrom, dateTo, sectionFilter, siteFilter, categoryFilter, itemFilter, showCancelled],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (dateFrom) p.set("dateFrom", dateFrom);
      if (dateTo) p.set("dateTo", dateTo);
      if (sectionFilter !== "__all__") p.set("section", sectionFilter);
      if (siteFilter !== "__all__") p.set("siteId", siteFilter);
      if (categoryFilter) p.set("category", categoryFilter);
      if (itemFilter) p.set("item", itemFilter);
      if (showCancelled) p.set("showCancelled", "true");
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
      setForm({ date: TODAY, issuedToSection: "plant", issuedToDetail: "", siteId: "", purpose: "", remarks: "" });
      setLines([emptyLine()]);
      if (isNew) navigate(new URLSearchParams(search).get("returnTo") || "/stores/issues");
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

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiRequest("POST", `/api/stores/issues/${id}/cancel`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith("/api/stores") });
      toast({ title: "Issue Voucher cancelled" });
      setCancelDialogId(null);
      setCancelReason("");
      if (selectedId && selectedId === cancelMutation.variables?.id) setSelectedId(null);
    },
    onError: () => toast({ title: "Failed to cancel Issue Voucher", variant: "destructive" }),
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

  function handleSectionChange(v: string) {
    setForm(f => ({ ...f, issuedToSection: v, issuedToDetail: "", siteId: "" }));
  }

  function handleSiteSelect(siteIdStr: string) {
    const site = sites.find(s => String(s.id) === siteIdStr);
    setForm(f => ({
      ...f,
      siteId: siteIdStr,
      issuedToDetail: site ? site.name : "",
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validLines = lines.filter(l => l.itemId && l.qty);
    if (!validLines.length) { toast({ title: "Add at least one item", variant: "destructive" }); return; }
    const isSite = form.issuedToSection === "site";
    createMutation.mutate({
      issue: {
        date: form.date,
        issuedToSection: form.issuedToSection,
        issuedToDetail: form.issuedToDetail || null,
        siteId: isSite && form.siteId ? parseInt(form.siteId) : null,
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
  const siteName = (id: number | null) => id ? (sites.find(s => s.id === id)?.name ?? null) : null;
  const hasFilters = !!(dateFrom || dateTo || sectionFilter !== "__all__" || siteFilter !== "__all__" || categoryFilter || itemFilter);

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
                    <Badge variant="outline" className="text-[12px]">{sectionLabel(selectedIssue.issuedToSection)}</Badge>
                    {selectedIssue.siteId && siteName(selectedIssue.siteId)
                      ? <Badge variant="outline" className="text-[12px] border-amber-400 text-amber-700 dark:text-amber-400">{siteName(selectedIssue.siteId)}</Badge>
                      : null}
                  </div>
                  {/* Show site name from FK if available; fall back to free-text detail for legacy records */}
                  {!selectedIssue.siteId && selectedIssue.issuedToDetail && (
                    <p className="text-base font-semibold mt-1">{selectedIssue.issuedToDetail}</p>
                  )}
                  {selectedIssue.purpose && <p className="text-sm text-muted-foreground">{selectedIssue.purpose}</p>}
                  {selectedIssue.remarks && <p className="text-sm text-muted-foreground italic mt-1">{selectedIssue.remarks}</p>}
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={closeDetail} data-testid="button-close-detail">
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="border rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left px-3 py-2 text-sm">Item</th>
                      <th className="text-left px-3 py-2 text-sm">Category</th>
                      <th className="text-right px-3 py-2 text-sm">Qty</th>
                      <th className="text-left px-2 py-2 text-sm">UOM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedIssue.items.map((it, i) => (
                      <tr key={i} className="border-t" data-testid={`row-detail-item-${i}`}>
                        <td className="px-3 py-2 font-medium">{it.itemName}</td>
                        <td className="px-3 py-2 text-muted-foreground text-sm">{it.category}</td>
                        <td className="px-3 py-2 text-right">{it.qty}</td>
                        <td className="px-2 py-2 text-sm">{it.uom}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between items-center">
                <Button variant="outline" size="sm" onClick={closeDetail} data-testid="button-back-to-list" className="gap-1">
                  <ChevronLeft className="w-4 h-4" /> Back to list
                </Button>
                {selectedIssue.isCancelled ? (
                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700 text-[12px] px-2 py-1">
                    CANCELLED{selectedIssue.cancellationReason ? `: ${selectedIssue.cancellationReason}` : ""}
                  </Badge>
                ) : (
                  <Button variant="ghost" size="sm" className="text-amber-600 gap-1"
                    onClick={() => { setCancelDialogId(selectedIssue.id); setCancelReason(""); }}
                    data-testid="button-cancel-detail-issue">
                    <Ban className="w-4 h-4" /> Cancel Voucher
                  </Button>
                )}
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
                    <span className="text-sm font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded" data-testid="text-issue-preview-number">
                      {previewNum.number}
                    </span>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setShowForm(false); if (isNew) navigate(new URLSearchParams(search).get("returnTo") || "/stores/issues"); }}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm">Date *</Label>
                    <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required data-testid="input-issue-date" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Issued To (Section) *</Label>
                    <Select value={form.issuedToSection} onValueChange={handleSectionChange}>
                      <SelectTrigger data-testid="select-section"><SelectValue /></SelectTrigger>
                      <SelectContent>{SECTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>

                  {/* Site → dropdown; plant/other → free text */}
                  {form.issuedToSection === "site" ? (
                    <div className="space-y-2">
                      <Label className="text-sm">Site / Project *</Label>
                      <Select value={form.siteId || "__none__"} onValueChange={v => v === "__none__" ? handleSiteSelect("") : handleSiteSelect(v)}>
                        <SelectTrigger data-testid="select-site-issue"><SelectValue placeholder="Select site" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Select site —</SelectItem>
                          {sites.filter(s => s.isActive).map(s => (
                            <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label className="text-sm">Detail (Equipment / Location)</Label>
                      <Input value={form.issuedToDetail} onChange={e => setForm(f => ({ ...f, issuedToDetail: e.target.value }))} placeholder="e.g. Paver MH-01, Workshop" data-testid="input-issued-to-detail" />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-sm">Purpose</Label>
                    <Select value={form.purpose || "__none__"} onValueChange={v => setForm(f => ({ ...f, purpose: v === "__none__" ? "" : v }))}>
                      <SelectTrigger data-testid="select-purpose"><SelectValue placeholder="Select purpose" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Not specified</SelectItem>
                        {PURPOSES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label className="text-sm">Remarks</Label>
                    <Input value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} placeholder="Optional" data-testid="input-issue-remarks" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Items Issued *</Label>
                  {lines.map((line, idx) => {
                    const selectedItem = items.find(i => String(i.id) === line.itemId);
                    const avail = selectedItem ? (stockMap[selectedItem.id] ?? 0) : null;
                    const qty = parseFloat(line.qty) || 0;
                    const over = avail !== null && qty > avail;
                    return (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-end" data-testid={`issue-line-${idx}`}>
                        <div className="col-span-5">
                          {(() => {
                            const search = itemComboSearch[idx] ?? "";
                            const isOpen = itemComboOpen[idx] ?? false;
                            const filteredItems = items.filter(it =>
                              !search || it.name.toLowerCase().includes(search.toLowerCase()) || it.category.toLowerCase().includes(search.toLowerCase())
                            );
                            const recentItems = !search
                              ? recentItemIds.map(id => items.find(it => it.id === id)).filter((it): it is StoreItem => !!it)
                              : [];
                            const recentItemIdSet = new Set(recentItems.map(it => it.id));
                            const remainingItems = filteredItems.filter(it => !recentItemIdSet.has(it.id));
                            return (
                              <div className="relative" ref={el => { itemComboRefs.current[idx] = el; }}>
                                <div
                                  className="flex items-center border rounded-md h-8 px-2 gap-1 bg-background text-sm cursor-text w-full"
                                  onClick={() => setItemComboOpen(prev => ({ ...prev, [idx]: true }))}
                                  data-testid={`select-issue-item-${idx}`}
                                >
                                  {isOpen ? (
                                    <input
                                      autoFocus
                                      className="flex-1 min-w-0 outline-none bg-transparent placeholder:text-muted-foreground text-sm"
                                      placeholder="Type to search items…"
                                      value={search}
                                      onChange={e => setItemComboSearch(prev => ({ ...prev, [idx]: e.target.value }))}
                                      data-testid={`input-issue-item-search-${idx}`}
                                    />
                                  ) : (
                                    <span className={`flex-1 truncate ${selectedItem ? "" : "text-muted-foreground"}`}>
                                      {selectedItem ? selectedItem.name : "Select item…"}
                                    </span>
                                  )}
                                  {selectedItem && !isOpen && (
                                    <button
                                      type="button"
                                      className="ml-auto flex-shrink-0 text-muted-foreground hover:text-foreground"
                                      onMouseDown={e => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        updateLine(idx, "itemId", "");
                                        updateLine(idx, "uom", "");
                                        setItemComboSearch(prev => ({ ...prev, [idx]: "" }));
                                      }}
                                      data-testid={`button-clear-issue-item-${idx}`}
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                                {isOpen && (
                                  <div className="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-900 border rounded-md shadow-lg max-h-48 overflow-y-auto text-sm">
                                    {filteredItems.length === 0 && (
                                      <div className="px-3 py-2 text-muted-foreground italic">No items match "{search}"</div>
                                    )}
                                    {recentItems.length > 0 && (
                                      <>
                                        <div className="px-3 py-1 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/50 border-b">
                                          Recently Used
                                        </div>
                                        {recentItems.map(it => (
                                          <div
                                            key={`recent-${it.id}`}
                                            className={`px-3 py-2 cursor-pointer hover:bg-orange-50 dark:hover:bg-orange-900/20 flex items-center justify-between gap-2 ${String(it.id) === line.itemId ? "bg-orange-50 dark:bg-orange-900/20 font-medium" : ""}`}
                                            onMouseDown={e => {
                                              e.preventDefault();
                                              updateLine(idx, "itemId", String(it.id));
                                              updateLine(idx, "uom", it.uom || "NOS");
                                              setItemComboSearch(prev => ({ ...prev, [idx]: "" }));
                                              setItemComboOpen(prev => ({ ...prev, [idx]: false }));
                                            }}
                                            data-testid={`option-recent-issue-item-${idx}-${it.id}`}
                                          >
                                            <span className="truncate">{it.name}</span>
                                            <span className="text-muted-foreground flex-shrink-0">({it.category})</span>
                                          </div>
                                        ))}
                                        {remainingItems.length > 0 && (
                                          <div className="px-3 py-1 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/50 border-b border-t">
                                            All Items
                                          </div>
                                        )}
                                      </>
                                    )}
                                    {remainingItems.map(it => (
                                      <div
                                        key={it.id}
                                        className={`px-3 py-2 cursor-pointer hover:bg-orange-50 dark:hover:bg-orange-900/20 flex items-center justify-between gap-2 ${String(it.id) === line.itemId ? "bg-orange-50 dark:bg-orange-900/20 font-medium" : ""}`}
                                        onMouseDown={e => {
                                          e.preventDefault();
                                          updateLine(idx, "itemId", String(it.id));
                                          updateLine(idx, "uom", it.uom || "NOS");
                                          setItemComboSearch(prev => ({ ...prev, [idx]: "" }));
                                          setItemComboOpen(prev => ({ ...prev, [idx]: false }));
                                        }}
                                        data-testid={`option-issue-item-${idx}-${it.id}`}
                                      >
                                        <span className="truncate">{it.name}</span>
                                        <span className="text-muted-foreground flex-shrink-0">({it.category})</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                          {avail !== null && (
                            <p className={`text-[12px] mt-0.5 ${over ? "text-red-600" : "text-muted-foreground"}`}>
                              Available: {avail.toFixed(2)} {selectedItem?.uom} {over ? "⚠ exceeds stock" : ""}
                            </p>
                          )}
                        </div>
                        <div className="col-span-3">
                          <Input type="number" min="0" step="any" className={`h-8 text-sm ${over ? "border-red-400" : ""}`} placeholder="Qty" value={line.qty} onChange={e => updateLine(idx, "qty", e.target.value)} data-testid={`input-issue-qty-${idx}`} />
                        </div>
                        <div className="col-span-3">
                          <Input className="h-8 text-sm" placeholder="UOM" value={line.uom} onChange={e => updateLine(idx, "uom", e.target.value)} data-testid={`input-issue-uom-${idx}`} />
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
                  <Button type="button" variant="outline" size="sm" className="text-sm gap-1" onClick={() => setLines(prev => [...prev, emptyLine()])} data-testid="button-add-issue-line">
                    <Plus className="w-3 h-3" /> Add Line
                  </Button>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button type="button" variant="ghost" onClick={() => { setShowForm(false); if (isNew) navigate(new URLSearchParams(search).get("returnTo") || "/stores/issues"); }}>Cancel</Button>
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
                <Label className="text-sm text-muted-foreground">From</Label>
                <Input type="date" className="h-8 w-36 text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} data-testid="input-date-from" />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">To</Label>
                <Input type="date" className="h-8 w-36 text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} data-testid="input-date-to" />
              </div>
              <Select value={sectionFilter} onValueChange={setSectionFilter}>
                <SelectTrigger className="h-8 w-32 text-sm" data-testid="select-section-filter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Sections</SelectItem>
                  {SECTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={siteFilter} onValueChange={setSiteFilter}>
                <SelectTrigger className="h-8 w-36 text-sm" data-testid="select-site-filter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Sites</SelectItem>
                  {sites.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={categoryFilter || "__all__"} onValueChange={v => setCategoryFilter(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 w-36 text-sm" data-testid="select-category-filter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Categories</SelectItem>
                  {STORE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input className="h-8 w-36 text-sm" placeholder="Item name" value={itemFilter} onChange={e => setItemFilter(e.target.value)} data-testid="input-item-filter" />
              {hasFilters && (
                <Button variant="ghost" size="sm" className="text-sm h-8" onClick={() => { setDateFrom(""); setDateTo(""); setSectionFilter("__all__"); setSiteFilter("__all__"); setCategoryFilter(""); setItemFilter(""); }}>Clear</Button>
              )}
              <Button
                variant={showCancelled ? "secondary" : "ghost"}
                size="sm"
                className={`text-sm h-8 gap-1 ${showCancelled ? "text-red-700 dark:text-red-400" : "text-muted-foreground"}`}
                onClick={() => setShowCancelled(v => !v)}
                data-testid="button-toggle-cancelled-issues"
              >
                <Ban className="w-3.5 h-3.5" />
                {showCancelled ? "Hide Cancelled" : "Show Cancelled"}
              </Button>
            </div>

            {/* Issue List */}
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
            ) : issues.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No issue vouchers found.</CardContent></Card>
            ) : (
              <div className="space-y-3">
                {issues.map(issue => {
                  const issueSiteName = siteName(issue.siteId);
                  const distinctCategories = [...new Set(issue.items.map(it => it.category).filter(Boolean))];
                  return (
                    <Card key={issue.id} className="cursor-pointer hover-elevate" onClick={() => openDetail(issue)} data-testid={`card-issue-${issue.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-sm font-bold text-orange-700 dark:text-orange-400">{issue.issueNumber}</span>
                              <span className="text-sm text-muted-foreground">{format(new Date(issue.date + "T00:00:00"), "dd MMM yyyy")}</span>
                              <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
                                {sectionLabel(issue.issuedToSection)}
                              </span>
                              {issueSiteName && (
                                <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                  {issueSiteName}
                                </span>
                              )}
                              {distinctCategories.map(cat => (
                                <span key={cat} className="text-[12px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" data-testid={`badge-category-${issue.id}-${cat}`}>
                                  {cat}
                                </span>
                              ))}
                            </div>
                            {/* For legacy issues (no siteId FK) that have free-text detail */}
                            {!issue.siteId && issue.issuedToDetail && (
                              <div className="text-sm font-medium mt-1">{issue.issuedToDetail}</div>
                            )}
                            {issue.purpose && <div className="text-sm text-muted-foreground">{issue.purpose}</div>}
                            <div className="mt-1 text-sm text-muted-foreground">
                              {issue.items.length} item{issue.items.length !== 1 ? "s" : ""}
                              {" — "}
                              {issue.items.map(it => `${it.itemName} (${it.qty} ${it.uom})`).join(", ")}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                            {issue.isCancelled && (
                              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700 text-[12px] px-1.5 py-0">CANCELLED</Badge>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDetail(issue)} data-testid={`button-view-issue-${issue.id}`}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            {!issue.isCancelled && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setCancelDialogId(issue.id); setCancelReason(""); }} data-testid={`button-cancel-issue-${issue.id}`}>
                                <Ban className="w-3.5 h-3.5 text-amber-600" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Cancel Issue dialog */}
      <Dialog open={cancelDialogId !== null} onOpenChange={open => { if (!open) { setCancelDialogId(null); setCancelReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Issue Voucher</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This Issue Voucher will be marked as cancelled and the issued quantities will be returned to stock. This cannot be undone.</p>
          <div className="space-y-2 mt-2">
            <Label className="text-sm">Reason for Cancellation *</Label>
            <Textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="Enter reason…"
              rows={3}
              data-testid="textarea-cancel-reason-issue"
            />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={() => { setCancelDialogId(null); setCancelReason(""); }}>Close</Button>
            <Button
              variant="destructive"
              disabled={!cancelReason.trim() || cancelMutation.isPending}
              onClick={() => { if (cancelDialogId !== null) cancelMutation.mutate({ id: cancelDialogId, reason: cancelReason }); }}
              data-testid="button-confirm-cancel-issue"
            >
              {cancelMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
              Confirm Cancellation
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
