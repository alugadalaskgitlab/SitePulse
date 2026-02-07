import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type CreateDprRequest, type DprWithDetails } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useDprs(filters?: { site?: string; engineer?: string; dateFrom?: string; dateTo?: string }) {
  const queryKey = [api.dprs.list.path, filters];
  
  return useQuery({
    queryKey,
    queryFn: async () => {
      // Clean undefined filters
      const params = filters ? Object.fromEntries(
        Object.entries(filters).filter(([_, v]) => v != null && v !== '')
      ) as Record<string, string> : undefined;

      const url = filters ? `${api.dprs.list.path}?${new URLSearchParams(params)}` : api.dprs.list.path;
      
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch DPRs");
      return api.dprs.list.responses[200].parse(await res.json());
    },
  });
}

export function useDpr(id: number) {
  return useQuery({
    queryKey: [api.dprs.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.dprs.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch DPR details");
      return api.dprs.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreateDpr() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateDprRequest) => {
      const res = await fetch(api.dprs.create.path, {
        method: api.dprs.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 400) {
          const error = api.dprs.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to create DPR");
      }
      return api.dprs.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.dprs.list.path] });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().startsWith("/api/site-purchases") || false });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().startsWith("/api/plant-module/stock-ledger") || false });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      toast({
        title: "DPR Created",
        description: "Daily Progress Report has been successfully submitted.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useExportDprs() {
  return async () => {
    // Direct window location navigation for file download to avoid blob handling complexity in hook
    window.location.href = api.dprs.export.path;
  };
}
