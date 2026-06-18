import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  FileSpreadsheet, Plus, Upload, Loader2,
  Building2, Calendar, Ruler, Tag, FolderOpen,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BoqImportWizard } from "@/components/BoqImportWizard";
import type { BoqProjectWithCounts } from "@shared/schema";

// ─── Status helpers ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  closed: "bg-red-50 text-red-600 border-red-200",
};

// ─── New Project Dialog ────────────────────────────────────────────────────────

function NewProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: sites = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/sites"],
    enabled: open,
  });

  const [form, setForm] = useState({
    name: "", contractNo: "", client: "", contractor: "",
    siteId: "", roadLengthKm: "", startDate: "", totalMonths: "", status: "draft",
  });

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/boq/projects", data),
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/boq/projects"] });
      toast({ title: "Project created" });
      onClose();
      navigate(`/work-program/${project.id}`);
    },
    onError: () => toast({ title: "Failed to create project", variant: "destructive" }),
  });

  function handleSubmit() {
    if (!form.name.trim()) {
      toast({ title: "Project name is required", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      name: form.name.trim(),
      contractNo: form.contractNo.trim() || null,
      client: form.client.trim() || null,
      contractor: form.contractor.trim() || null,
      siteId: form.siteId ? parseInt(form.siteId) : null,
      roadLengthKm: form.roadLengthKm ? parseFloat(form.roadLengthKm) : null,
      startDate: form.startDate || null,
      totalMonths: form.totalMonths ? parseInt(form.totalMonths) : null,
      status: form.status,
      createdBy: user?.fullName || user?.email || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            New BOQ Project
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">PROJECT NAME <span className="text-red-500">*</span></Label>
            <Input value={form.name} onChange={e => set("name", e.target.value)}
              placeholder="e.g. NH-44 Widening — Package 3" data-testid="input-project-name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">CONTRACT NO.</Label>
              <Input value={form.contractNo} onChange={e => set("contractNo", e.target.value)}
                placeholder="e.g. NHAI/2024/001" data-testid="input-contract-no" />
            </div>
            <div>
              <Label className="text-xs">CLIENT / AUTHORITY</Label>
              <Input value={form.client} onChange={e => set("client", e.target.value)}
                placeholder="e.g. NHAI" data-testid="input-client" />
            </div>
            <div>
              <Label className="text-xs">CONTRACTOR</Label>
              <Input value={form.contractor} onChange={e => set("contractor", e.target.value)}
                placeholder="e.g. HLC" data-testid="input-contractor" />
            </div>
            <div>
              <Label className="text-xs">LINKED SITE</Label>
              <Select value={form.siteId || "__none__"} onValueChange={v => set("siteId", v === "__none__" ? "" : v)}>
                <SelectTrigger data-testid="select-site">
                  <SelectValue placeholder="— None —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {sites.map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">ROAD LENGTH (km)</Label>
              <Input type="number" value={form.roadLengthKm} onChange={e => set("roadLengthKm", e.target.value)}
                placeholder="0.00" data-testid="input-road-length" />
            </div>
            <div>
              <Label className="text-xs">TOTAL MONTHS</Label>
              <Input type="number" value={form.totalMonths} onChange={e => set("totalMonths", e.target.value)}
                placeholder="12" data-testid="input-total-months" />
            </div>
            <div>
              <Label className="text-xs">START DATE</Label>
              <Input type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)}
                data-testid="input-start-date" />
            </div>
            <div>
              <Label className="text-xs">STATUS</Label>
              <Select value={form.status} onValueChange={v => set("status", v)}>
                <SelectTrigger data-testid="select-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-project">Cancel</Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="button-create-project">
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
            Create Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Project Card ──────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  onImport,
}: {
  project: BoqProjectWithCounts;
  onImport: (id: number) => void;
}) {
  const [, navigate] = useLocation();

  return (
    <Card className="hover:shadow-md transition-shadow border-slate-200" data-testid={`card-project-${project.id}`}>
      <CardHeader className="pb-2 px-4 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-800 truncate">{project.name}</h3>
            {project.contractNo && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">Contract: {project.contractNo}</p>
            )}
          </div>
          <Badge variant="outline" className={`text-xs flex-shrink-0 ${STATUS_COLORS[project.status] ?? STATUS_COLORS.draft}`}>
            {project.status.toUpperCase()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {project.client && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Building2 className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{project.client}</span>
            </div>
          )}
          {project.siteName && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Tag className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{project.siteName}</span>
            </div>
          )}
          {project.startDate && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="w-3 h-3 flex-shrink-0" />
              <span>{project.startDate}{project.totalMonths ? ` · ${project.totalMonths} mo` : ""}</span>
            </div>
          )}
          {project.roadLengthKm != null && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Ruler className="w-3 h-3 flex-shrink-0" />
              <span>{project.roadLengthKm} km</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
          <div className="flex-1 text-xs text-muted-foreground">
            <span className="font-semibold text-slate-700">{project.itemCount}</span> BOQ items
            {project.activeRevision && (
              <span className="ml-2 text-emerald-600">· Rev: {project.activeRevision}</span>
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
            onClick={() => navigate(`/work-program/${project.id}`)}
            data-testid={`button-open-project-${project.id}`}
          >
            <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
            Open
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 text-xs h-8 border-blue-200 text-blue-700 hover:bg-blue-50"
            onClick={() => onImport(project.id)}
            data-testid={`button-import-project-${project.id}`}
          >
            <Upload className="w-3.5 h-3.5 mr-1.5" />
            Import BOQ
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function BoqProjects() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [showNew, setShowNew] = useState(false);
  const [importProjectId, setImportProjectId] = useState<number | null>(null);

  const { data: projects = [], isLoading } = useQuery<BoqProjectWithCounts[]>({
    queryKey: ["/api/boq/projects"],
  });

  const importProject = importProjectId != null
    ? projects.find(p => p.id === importProjectId)
    : null;

  function handleImportSuccess(pid: number, result: { created: number; categories: string[] }) {
    setImportProjectId(null);
    toast({
      title: `BOQ Imported — ${result.created} items`,
      description: result.categories.length > 0
        ? `Categories: ${result.categories.join(", ")}`
        : "No categories detected.",
    });
    navigate(`/work-program/${pid}`);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
            Work Program & BOQ
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create BOQ projects, import Excel schedules, and manage quantity revisions
          </p>
        </div>
        <Button
          onClick={() => setShowNew(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          data-testid="button-new-project"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          New Project
        </Button>
      </div>

      {/* Projects grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Loading projects…
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20 space-y-4">
          <FileSpreadsheet className="w-16 h-16 text-slate-200 mx-auto" />
          <div>
            <p className="font-semibold text-slate-600">No BOQ projects yet</p>
            <p className="text-sm text-muted-foreground mt-1">Create a project then import your Excel BOQ to get started</p>
          </div>
          <Button onClick={() => setShowNew(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white"
            data-testid="button-new-project-empty">
            <Plus className="w-4 h-4 mr-1.5" /> Create First Project
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              onImport={id => setImportProjectId(id)}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <NewProjectDialog open={showNew} onClose={() => setShowNew(false)} />

      {importProjectId != null && importProject && (
        <BoqImportWizard
          projectId={importProjectId}
          projectName={importProject.name}
          onClose={() => setImportProjectId(null)}
          onSuccess={result => handleImportSuccess(importProjectId, result)}
        />
      )}
    </div>
  );
}
