import { useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronLeft, Factory, Package, Trash2, Copy, Loader2, Shield, ShieldCheck, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccess } from "@/lib/access-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PinAuth } from "@/components/PinAuth";
import type { PlantReportWithDetails } from "@shared/schema";

const MANAGER_PIN = "1234";
const ADMIN_PIN = "5678";

export default function PlantDetails() {
  const [, params] = useRoute("/plant/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { access, canEdit, canDelete } = useAccess();
  
  const [showPinModal, setShowPinModal] = useState(false);
  const [targetRole, setTargetRole] = useState<"manager" | "admin">("manager");
  const [pendingAction, setPendingAction] = useState<"edit" | "delete" | null>(null);

  const { data: report, isLoading, error } = useQuery<PlantReportWithDetails>({
    queryKey: ["/api/plant", params?.id],
    queryFn: async () => {
      const res = await fetch(`/api/plant/${params?.id}`);
      if (!res.ok) throw new Error("Failed to fetch plant report");
      return res.json();
    },
    enabled: !!params?.id,
  });

  const cloneMutation = useMutation({
    mutationFn: async ({ role, pin }: { role: string; pin: string }) => {
      const response = await apiRequest("POST", `/api/plant/${params?.id}/clone`, { editedBy: role, pin });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Report cloned",
        description: "A new copy has been created for editing.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/plant"] });
      setLocation(`/plant/${data.id}`);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to clone report.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (pin: string) => {
      await apiRequest("DELETE", `/api/plant/${params?.id}`, { pin });
    },
    onSuccess: () => {
      toast({
        title: "Report deleted",
        description: "The plant report has been deleted.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/plant"] });
      setLocation("/plant");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete report.",
        variant: "destructive",
      });
    },
  });

  const handleEditClick = () => {
    if (canEdit) {
      const pin = access === "manager" ? MANAGER_PIN : ADMIN_PIN;
      cloneMutation.mutate({ role: access, pin });
    } else {
      setPendingAction("edit");
      setTargetRole("manager");
      setShowPinModal(true);
    }
  };

  const handleDeleteClick = () => {
    if (canDelete) {
      if (confirm("Are you sure you want to delete this plant report? This cannot be undone.")) {
        deleteMutation.mutate(ADMIN_PIN);
      }
    } else {
      setPendingAction("delete");
      setTargetRole("admin");
      setShowPinModal(true);
    }
  };

  const handlePinSuccess = (role: "manager" | "admin", pin: string) => {
    setShowPinModal(false);
    
    if (pendingAction === "delete" && role === "admin") {
      if (confirm("Are you sure you want to delete this plant report? This cannot be undone.")) {
        deleteMutation.mutate(pin);
      }
    } else if (pendingAction === "edit") {
      cloneMutation.mutate({ role, pin });
    }
    setPendingAction(null);
  };

  const getAccessBadge = () => {
    if (access === "admin") {
      return (
        <div className="px-3 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-200 text-xs font-semibold flex items-center gap-1">
          <ShieldCheck className="w-3 h-3" />
          Admin Access
        </div>
      );
    } else if (access === "manager") {
      return (
        <div className="px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-200 text-xs font-semibold flex items-center gap-1">
          <Shield className="w-3 h-3" />
          Manager Access
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Plant report not found.</p>
        <Link href="/plant/dashboard">
          <Button variant="outline" className="mt-4">Back to Plant Reports</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {showPinModal && (
        <PinAuth
          targetRole={targetRole}
          onSuccess={handlePinSuccess}
          onClose={() => {
            setShowPinModal(false);
            setPendingAction(null);
          }}
        />
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <Link href="/plant/dashboard">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold font-display">{report.siteName}</h1>
              {getAccessBadge()}
            </div>
            <p className="text-muted-foreground text-sm">
              {format(new Date(report.date), "MMMM d, yyyy")}
            </p>
          </div>
        </div>
        
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={handleEditClick}
            disabled={cloneMutation.isPending}
            className="gap-2"
            data-testid="button-clone-edit"
          >
            {cloneMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Edit className="w-4 h-4" />
            )}
            Edit Report
          </Button>
          
          <Button 
            variant="destructive" 
            className="gap-2" 
            onClick={handleDeleteClick}
            disabled={deleteMutation.isPending}
            data-testid="button-delete"
          >
            {deleteMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            Delete
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <Factory className="w-5 h-5 text-muted-foreground" />
            Plant Report Details
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Date</p>
              <p className="font-medium">{format(new Date(report.date), "MMM d, yyyy")}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Site Name</p>
              <p className="font-medium">{report.siteName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Role</p>
              <p className="font-medium capitalize">{report.role || "Engineer"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {report.production && report.production.length > 0 && (
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-muted-foreground" />
              Production Log
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium text-sm">Material</th>
                    <th className="text-left p-3 font-medium text-sm">Quantity</th>
                    <th className="text-left p-3 font-medium text-sm">UOM</th>
                    <th className="text-left p-3 font-medium text-sm">Supplier</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {report.production.map((item, idx) => (
                    <tr key={idx} className="hover-elevate">
                      <td className="p-3">{item.material}</td>
                      <td className="p-3">{item.quantity || "-"}</td>
                      <td className="p-3">{item.uom || "-"}</td>
                      <td className="p-3">{item.supplier || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {(!report.production || report.production.length === 0) && (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            No production entries in this report.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
