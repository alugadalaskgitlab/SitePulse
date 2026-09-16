import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Link2, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  invalidateSiteMaterialSuggestions,
  normalizeFreeTextSuggestion,
  normalizeVehicleSupplierKey,
  type VehicleSupplierAssociation,
} from "@/hooks/use-site-material-suggestions";
import { useMutation } from "@tanstack/react-query";

export interface VehicleSupplierAssociationNoticeProps {
  site: string;
  vehicleNumber: string;
  supplier: string;
  association?: VehicleSupplierAssociation;
  canCorrectVehicleSupplier?: boolean;
  /**
   * Called only after a deliberate correction confirmation, and only when
   * the form still contains the same site and normalized vehicle.
   */
  onSupplierApplied?: (
    supplier: string,
    context: { site: string; vehicleNumber: string },
  ) => void;
  testIdPrefix: string;
}

type AssociationResult = VehicleSupplierAssociation;

function associationFromResponse(body: unknown): AssociationResult {
  const candidate =
    body && typeof body === "object" && "association" in body
      ? (body as { association?: unknown }).association
      : body;
  if (!candidate || typeof candidate !== "object") {
    throw new Error("The vehicle supplier correction response was incomplete.");
  }
  const value = candidate as Partial<VehicleSupplierAssociation>;
  if (
    value.status !== "linked" &&
    value.status !== "conflict" &&
    value.status !== "unlinked"
  ) {
    throw new Error("The vehicle supplier correction response was invalid.");
  }
  return {
    status: value.status,
    supplier: typeof value.supplier === "string" ? value.supplier : null,
    version: typeof value.version === "string" ? value.version : null,
  };
}

/**
 * Small, shared status/correction UI for all three material-receipt surfaces.
 *
 * The notice is intentionally passive while a user types.  A linked supplier
 * is never copied here: copying is owned by FreeTextSuggestionInput's
 * explicit onSuggestionSelected callback.  The only write this component
 * performs is the separately confirmed future-association correction.
 */
export function VehicleSupplierAssociationNotice({
  site,
  vehicleNumber,
  supplier,
  association,
  canCorrectVehicleSupplier = false,
  onSupplierApplied,
  testIdPrefix,
}: VehicleSupplierAssociationNoticeProps) {
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const currentFormRef = useRef({ site, vehicleNumber, supplier });
  useEffect(() => {
    currentFormRef.current = { site, vehicleNumber, supplier };
  }, [site, vehicleNumber, supplier]);

  const normalizedVehicle = normalizeVehicleSupplierKey(vehicleNumber);
  const knownVehicle = Boolean(normalizedVehicle && association);
  const associationValue: VehicleSupplierAssociation = association ?? {
    status: "unlinked",
    supplier: null,
    version: null,
  };

  const linkedSupplier =
    associationValue.status === "linked"
      ? associationValue.supplier?.trim() || null
      : null;
  const supplierDiffers =
    linkedSupplier != null &&
    Boolean(supplier.trim()) &&
    normalizeFreeTextSuggestion(linkedSupplier, "supplier") !==
      normalizeFreeTextSuggestion(supplier, "supplier");
  const correctionCandidate = supplier.trim();
  const canCorrect =
    canCorrectVehicleSupplier &&
    Boolean(correctionCandidate) &&
    (associationValue.status !== "linked" || supplierDiffers);

  const correctionMutation = useMutation({
    mutationFn: async (variables: {
      site: string;
      vehicleNumber: string;
      supplier: string;
      expectedVersion: string | null;
      expectedSupplier: string | null;
    }) => {
      const response = await apiRequest(
        "PATCH",
        "/api/site-material-trips/vehicle-supplier",
        variables,
      );
      return associationFromResponse(await response.json());
    },
    onSuccess: async (result, variables) => {
      // A correction updates future suggestions, never an old receipt.  All
      // site caches are invalidated because another open surface may have
      // been looking at a different site while this request was in flight.
      await invalidateSiteMaterialSuggestions();
      await queryClient.invalidateQueries({
        queryKey: ["/api/site-material-trips"],
      });

      const current = currentFormRef.current;
      const sameSite = current.site === variables.site;
      const sameVehicle =
        normalizeVehicleSupplierKey(current.vehicleNumber) ===
        normalizeVehicleSupplierKey(variables.vehicleNumber);
      const sameSupplier =
        normalizeFreeTextSuggestion(current.supplier, "supplier") ===
        normalizeFreeTextSuggestion(variables.supplier, "supplier");
      if (
        sameSite &&
        sameVehicle &&
        sameSupplier &&
        result.status === "linked" &&
        result.supplier
      ) {
        onSupplierApplied?.(result.supplier, {
          site: variables.site,
          vehicleNumber: variables.vehicleNumber,
        });
        toast({
          title: "Vehicle supplier updated",
          description:
            "The supplier will be suggested for future trips. Existing records are unchanged.",
        });
      } else {
        toast({
          title: "Vehicle supplier updated",
          description:
            "The future association was saved. The form changed, so its supplier was left untouched.",
        });
      }
      setConfirmOpen(false);
    },
    onError: (error: unknown) => {
      toast({
        title: "Could not update vehicle supplier",
        description:
          error instanceof Error
            ? error.message
            : "The association was not changed. You can continue with manual entry.",
        variant: "destructive",
      });
    },
  });

  const confirmCorrection = () => {
    // Snapshot all values at the deliberate confirmation point.  In
    // particular, expectedVersion must not come from a stale render.
    correctionMutation.mutate({
      site,
      vehicleNumber,
      supplier: correctionCandidate,
      expectedVersion: associationValue.version,
      // A null version is valid for a vehicle whose stable value comes from
      // history rather than an explicitly persisted association.  Include
      // the observed supplier as a second CAS guard so that history changing
      // underneath this form cannot be silently corrected.
      expectedSupplier:
        associationValue.status === "linked" ? associationValue.supplier : null,
    });
  };

  if (!knownVehicle || !association) return null;

  return (
    <>
      <div
        className="rounded border px-2 py-1.5 text-[11px] space-y-1"
        data-testid={`${testIdPrefix}-vehicle-supplier-status`}
      >
        {associationValue.status === "linked" && linkedSupplier ? (
          <>
            <p className="flex items-center gap-1 text-muted-foreground">
              <Link2 className="h-3 w-3 shrink-0" />
              Stable supplier for this vehicle:{" "}
              <span className="font-medium text-foreground">{linkedSupplier}</span>
            </p>
            {supplierDiffers && (
              <p
                className="flex items-center gap-1 text-amber-700 dark:text-amber-400"
                data-testid={`${testIdPrefix}-vehicle-supplier-mismatch`}
              >
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Current supplier differs from the stable vehicle history.
              </p>
            )}
          </>
        ) : associationValue.status === "conflict" ? (
          <p
            className="flex items-center gap-1 text-amber-700 dark:text-amber-400"
            data-testid={`${testIdPrefix}-vehicle-supplier-conflict`}
          >
            <AlertTriangle className="h-3 w-3 shrink-0" />
            Conflicting suppliers recorded for this vehicle — no supplier was guessed.
          </p>
        ) : (
          <p className="text-muted-foreground">
            This known vehicle has no stable supplier association yet.
          </p>
        )}
        {canCorrect && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[11px]"
            onClick={() => setConfirmOpen(true)}
            disabled={correctionMutation.isPending}
            data-testid={`${testIdPrefix}-vehicle-supplier-correct`}
          >
            Correct future supplier
          </Button>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent data-testid={`${testIdPrefix}-vehicle-supplier-dialog`}>
          <AlertDialogHeader>
            <AlertDialogTitle>Correct supplier for future trips?</AlertDialogTitle>
            <AlertDialogDescription>
              Save <strong>{correctionCandidate}</strong> as the future supplier
              for vehicle <strong>{vehicleNumber}</strong> at{" "}
              <strong>{site}</strong>. Existing trips and receipts will not be
              changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={correctionMutation.isPending}
              data-testid={`${testIdPrefix}-vehicle-supplier-cancel`}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                confirmCorrection();
              }}
              disabled={correctionMutation.isPending}
              data-testid={`${testIdPrefix}-vehicle-supplier-confirm`}
            >
              {correctionMutation.isPending && (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              )}
              Confirm correction
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default VehicleSupplierAssociationNotice;