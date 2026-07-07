import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { EditPermissionRequest } from "@shared/schema";

export type EditPermissionStatus =
  | "idle"
  | "pending"
  | "approved"
  | "denied"
  | "expired"
  | "used";

export function useEditPermission(recordType: string, recordId: number | undefined) {
  const { toast } = useToast();

  const checkQuery = useQuery<{ hasPermission: boolean; request: EditPermissionRequest | null }>({
    queryKey: ["/api/edit-requests/check", recordType, recordId],
    queryFn: async () => {
      if (!recordId) return { hasPermission: false, request: null };
      const res = await fetch(`/api/edit-requests/check?recordType=${recordType}&recordId=${recordId}`, { credentials: "include" });
      if (!res.ok) return { hasPermission: false, request: null };
      return res.json();
    },
    enabled: !!recordId,
    refetchInterval: 30_000,
  });

  const myRequestsQuery = useQuery<EditPermissionRequest[]>({
    queryKey: ["/api/edit-requests/mine"],
    queryFn: async () => {
      const res = await fetch("/api/edit-requests/mine", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!recordId,
    refetchInterval: 30_000,
  });

  const myRequest = myRequestsQuery.data?.find(
    r => r.recordType === recordType && r.recordId === recordId && (r.status === "pending" || r.status === "approved"),
  );

  const requestMutation = useMutation<EditPermissionRequest, Error, string>({
    mutationFn: async (reason: string) => {
      const res = await apiRequest("POST", "/api/edit-requests", { recordType, recordId, requestReason: reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/edit-requests/mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/edit-requests/check", recordType, recordId] });
      toast({ title: "Request sent", description: "Waiting for admin approval." });
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to send edit request.";
      toast({ title: "Request failed", description: msg, variant: "destructive" });
    },
  });

  const consumeMutation = useMutation<void, Error, number>({
    mutationFn: async (requestId: number) => {
      await apiRequest("POST", `/api/edit-requests/${requestId}/consume`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/edit-requests/check", recordType, recordId] });
      queryClient.invalidateQueries({ queryKey: ["/api/edit-requests/mine"] });
    },
  });

  const hasActivePermission = checkQuery.data?.hasPermission ?? false;
  const activeRequest = checkQuery.data?.request ?? null;

  const currentStatus: EditPermissionStatus = hasActivePermission
    ? "approved"
    : myRequest?.status === "pending"
    ? "pending"
    : myRequest?.status === "denied"
    ? "denied"
    : myRequest?.status === "expired"
    ? "expired"
    : myRequest?.status === "used"
    ? "used"
    : "idle";

  return {
    currentStatus,
    hasActivePermission,
    activeRequest,
    myRequest,
    isLoading: checkQuery.isLoading,
    requestEditPermission: (reason: string) => requestMutation.mutate(reason),
    isRequesting: requestMutation.isPending,
    consumePermission: (requestId: number) => consumeMutation.mutate(requestId),
    isConsuming: consumeMutation.isPending,
    refetch: () => {
      checkQuery.refetch();
      myRequestsQuery.refetch();
    },
  };
}
