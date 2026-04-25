import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { ChevronLeft, Download, Upload, Loader2, CheckCircle, AlertCircle, FileJson } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";

type SyncMode = "menu" | "export" | "import";

export default function DataSync() {
  const { toast } = useToast();
  const { sectionCan } = useAuth();
  const canExport = sectionCan("admin_settings", "view_reports");
  const canImport = sectionCan("admin_settings", "edit");
  const { getPlantBackLink } = useOrigin();
  const backLink = getPlantBackLink({ defaultTab: "stock" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<SyncMode>("menu");
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importData, setImportData] = useState<Record<string, any> | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const [results, setResults] = useState<{ imported?: string[]; skipped?: string[]; errors?: string[] } | null>(null);

  const { data: exportableTables } = useQuery<Record<string, string>>({
    queryKey: ["/api/admin/exportable-tables"],
  });

  const TABLE_GROUPS = {
    "Master Data": ["equipment_master", "vendor_aliases", "parties", "plant_materials", "mix_templates", "sites"],
    "Operations": ["truck_dispatches", "material_receipts", "material_issues", "equipment_usage", "dprs"],
    "Stock & Ledger": ["stock_ledger", "stock_balances"],
    "Procurement & Finance": ["vendor_bills", "purchase_indents", "diesel_requirements"],
  };

  const toggleTable = (table: string) => {
    setSelectedTables(prev =>
      prev.includes(table) ? prev.filter(t => t !== table) : [...prev, table]
    );
  };

  const toggleGroup = (tables: string[]) => {
    const allSelected = tables.every(t => selectedTables.includes(t));
    if (allSelected) {
      setSelectedTables(prev => prev.filter(t => !tables.includes(t)));
    } else {
      setSelectedTables(prev => [...new Set([...prev, ...tables])]);
    }
  };

  const handleExportClick = async () => {
    if (selectedTables.length === 0) {
      toast({ title: "Select at least one table to export", variant: "destructive" });
      return;
    }
    setIsProcessing(true);
    try {
      const response = await apiRequest("POST", "/api/admin/export-data", {
        tables: selectedTables,
      });
      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sitelog-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export downloaded successfully" });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImportClick = async () => {
    if (!importData) {
      toast({ title: "Upload a file first", variant: "destructive" });
      return;
    }
    setIsProcessing(true);
    try {
      const response = await apiRequest("POST", "/api/admin/import-data", {
        data: importData,
      });
      const result = await response.json();
      setResults(result);
      toast({ title: "Import completed" });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (!parsed._version || !parsed._exportedAt) {
          toast({ title: "Invalid export file", description: "File must be a SiteLog export", variant: "destructive" });
          return;
        }
        setImportData(parsed);
        const tableKeys = Object.keys(parsed).filter(k => !k.startsWith("_"));
        setSelectedTables(tableKeys);
        toast({ title: `File loaded: ${tableKeys.length} tables found` });
      } catch {
        toast({ title: "Invalid JSON file", variant: "destructive" });
      }
    };
    reader.readAsText(file);
  };

  if (mode === "menu") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href={backLink}>
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ChevronLeft className="w-4 h-4 mr-1" /> BACK
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Data Export / Import</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {canExport && (
            <Card className="hover-elevate cursor-pointer" onClick={() => setMode("export")} data-testid="card-export">
              <CardContent className="p-8 flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <Download className="w-8 h-8 text-emerald-600" />
                </div>
                <h2 className="text-xl font-bold">Export Data</h2>
                <p className="text-muted-foreground">Download selected tables as a JSON file. Use this to back up your data or transfer it to another environment.</p>
              </CardContent>
            </Card>
          )}

          {canImport && (
            <Card className="hover-elevate cursor-pointer" onClick={() => setMode("import")} data-testid="card-import">
              <CardContent className="p-8 flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Upload className="w-8 h-8 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold">Import Data</h2>
                <p className="text-muted-foreground">Upload a previously exported JSON file to update records. Existing records will be updated, new ones added.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  if (mode === "export") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setMode("menu")} data-testid="button-back-menu">
            <ChevronLeft className="w-4 h-4 mr-1" /> BACK
          </Button>
          <h1 className="text-2xl font-bold">Export Data</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">SELECT TABLES TO EXPORT</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {Object.entries(TABLE_GROUPS).map(([groupName, tables]) => (
              <div key={groupName}>
                <div className="flex items-center gap-2 mb-3">
                  <Checkbox
                    checked={tables.every(t => selectedTables.includes(t))}
                    onCheckedChange={() => toggleGroup(tables)}
                    data-testid={`checkbox-group-${groupName.toLowerCase().replace(/\s+/g, "-")}`}
                  />
                  <span className="text-sm font-semibold uppercase text-muted-foreground">{groupName}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 ml-6">
                  {tables.map(table => (
                    <label key={table} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-muted/50">
                      <Checkbox
                        checked={selectedTables.includes(table)}
                        onCheckedChange={() => toggleTable(table)}
                        data-testid={`checkbox-${table}`}
                      />
                      <span className="text-sm">{exportableTables?.[table] || table}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button
            onClick={handleExportClick}
            disabled={selectedTables.length === 0 || isProcessing}
            data-testid="button-export"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            EXPORT {selectedTables.length} TABLE{selectedTables.length !== 1 ? "S" : ""}
          </Button>
          <Button variant="outline" onClick={() => setSelectedTables(Object.values(TABLE_GROUPS).flat())} data-testid="button-select-all">
            SELECT ALL
          </Button>
          <Button variant="outline" onClick={() => setSelectedTables([])} data-testid="button-deselect-all">
            DESELECT ALL
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => { setMode("menu"); setImportData(null); setResults(null); setImportFileName(""); }} data-testid="button-back-menu">
          <ChevronLeft className="w-4 h-4 mr-1" /> BACK
        </Button>
        <h1 className="text-2xl font-bold">Import Data</h1>
      </div>

      {!results ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">UPLOAD EXPORT FILE</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                data-testid="upload-area"
              >
                <FileJson className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                {importFileName ? (
                  <div>
                    <p className="font-semibold">{importFileName}</p>
                    {importData && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Exported: {importData._exportedAt} — {Object.keys(importData).filter(k => !k.startsWith("_")).length} tables
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground">Click to upload a SiteLog export file (.json)</p>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleFileUpload}
                  data-testid="input-file"
                />
              </div>

              {importData && (
                <div>
                  <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-2">TABLES IN FILE</h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(importData).filter(k => !k.startsWith("_")).map(table => (
                      <Badge key={table} variant="outline" className="text-xs">
                        {exportableTables?.[table] || table}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Button
            onClick={handleImportClick}
            disabled={!importData || isProcessing}
            data-testid="button-import"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            IMPORT DATA
          </Button>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">IMPORT RESULTS</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {results.imported && results.imported.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-emerald-600 mb-2 flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" /> IMPORTED
                </h3>
                <div className="space-y-1">
                  {results.imported.map((item, i) => (
                    <p key={i} className="text-sm ml-5">{item}</p>
                  ))}
                </div>
              </div>
            )}
            {results.skipped && results.skipped.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-amber-600 mb-2">SKIPPED (empty)</h3>
                <div className="space-y-1">
                  {results.skipped.map((item, i) => (
                    <p key={i} className="text-sm ml-5 text-muted-foreground">{item}</p>
                  ))}
                </div>
              </div>
            )}
            {results.errors && results.errors.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-destructive mb-2 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" /> ERRORS
                </h3>
                <div className="space-y-1">
                  {results.errors.map((item, i) => (
                    <p key={i} className="text-sm ml-5 text-destructive">{item}</p>
                  ))}
                </div>
              </div>
            )}
            <Button variant="outline" onClick={() => { setResults(null); setImportData(null); setImportFileName(""); }} data-testid="button-import-another">
              IMPORT ANOTHER FILE
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
