import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { refreshDprDerivedQueries } from "@/lib/dprQueryInvalidation";
import type { DprCorrectionForm, DprCorrectionRequest, DprCorrectionReview } from "@/lib/dprCorrections";

export const dprCorrectionsKey = (id: number) => ["/api/dprs", id, "corrections"] as const;

export function useDprCorrections(id: number, enabled: boolean) {
  const client = useQueryClient();
  const history = useQuery<DprCorrectionRequest[]>({
    queryKey: dprCorrectionsKey(id),
    enabled,
    queryFn: async () => (await apiRequest("GET", `/api/dprs/${id}/corrections`)).json(),
  });
  const preview = useMutation<DprCorrectionReview, Error, DprCorrectionForm>({
    mutationFn: async (form) => (await apiRequest("POST", `/api/dprs/${id}/correction-review`, { form })).json(),
  });
  const save = useMutation<{ id: number; pending?: boolean; requestId?: number }, Error, { form: DprCorrectionForm; baseHash: string; reason: string; confirmImpact: true }>({
    mutationFn: async (correction) => (await apiRequest("POST", `/api/dprs/${id}/version`, { correction })).json(),
    onSuccess: async () => {
      await Promise.all([
        refreshDprDerivedQueries(client),
        client.invalidateQueries({ queryKey: dprCorrectionsKey(id), refetchType: "all" }),
      ]);
    },
  });
  const decide = useMutation<unknown, Error, { requestId: number; approve: boolean; reason: string; confirmImpact: true }>({
    mutationFn: async ({ requestId, ...decision }) =>
      (await apiRequest("POST", `/api/dprs/${id}/corrections/${requestId}`, decision)).json(),
    onSuccess: async () => {
      await Promise.all([
        refreshDprDerivedQueries(client),
        client.invalidateQueries({ queryKey: dprCorrectionsKey(id), refetchType: "all" }),
        client.invalidateQueries({ queryKey: ["/api/edit-requests"], refetchType: "all" }),
      ]);
      // Deliberately do not refetch/reinitialize the mounted editor: unsaved
      // user input must survive decisions as well as pending submissions.
    },
  });
  const withdraw = useMutation<unknown, Error, { requestId: number }>({
    mutationFn: async ({ requestId }) =>
      (await apiRequest("POST", `/api/dprs/${id}/corrections/${requestId}/withdraw`, {})).json(),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: dprCorrectionsKey(id), refetchType: "all" });
    },
  });
  return { history, preview, save, decide, withdraw };
}
