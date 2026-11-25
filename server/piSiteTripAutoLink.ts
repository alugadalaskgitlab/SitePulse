type AutoLinkInput = {
  boqProjectId?: number | null;
  boqItemId?: number | null;
};

type AutoLinkActor = {
  userId: number;
  userName: string;
  userRole?: string | null;
};

/**
 * Best-effort linking after a site trip has already been saved. Lookup or link
 * failures must never undo or block the trip itself.
 */
export async function autoLinkNewSiteTripToPi({
  storage,
  trip: savedTrip,
  input,
  actor,
}: {
  storage: any;
  trip: any;
  input: AutoLinkInput;
  actor: AutoLinkActor;
}): Promise<{ trip: any; piLinkOptions: any[]; linkedPiIndentNo: string | null }> {
  let trip = savedTrip;
  let piLinkOptions: any[] = [];
  let linkedPiIndentNo: string | null = null;
  if (trip.indentItemId != null) return { trip, piLinkOptions, linkedPiIndentNo };

  try {
    let candidates: any[] = [];
    if (input.boqProjectId != null && input.boqItemId != null) {
      try {
        const boqMatch = await storage.getApplicablePiForBoqItem(input.boqProjectId, input.boqItemId);
        if (boqMatch && !("ambiguous" in boqMatch)) {
          candidates = [{
            indentId: boqMatch.indentId,
            indentItemId: boqMatch.indentItemId,
            indentNo: boqMatch.indentNo,
            description: input.material,
            orderedQty: boqMatch.orderedQty,
            deliveredQty: boqMatch.receivedQty,
            balanceQty: boqMatch.balanceQty,
            uom: input.uom,
          }];
        }
      } catch (error) {
        console.warn("BOQ-based PI match was unavailable:", (error as Error).message);
      }
    }
    if (!candidates.length) {
      candidates = await storage.getUnlinkedPiCandidatesForSiteTrip(trip.site, trip.material);
    }

    const linkCandidate = async (candidate: any) => {
      await storage.linkSiteMaterialTripsToPiItem({
        indentId: candidate.indentId,
        itemId: candidate.indentItemId,
        tripIds: [trip.id],
        actor,
        action: "auto",
      });
      trip = (await storage.getSiteMaterialTripById(trip.id)) ?? trip;
      linkedPiIndentNo = candidate.indentNo ?? null;
    };

    if (candidates.length === 1) {
      try {
        await linkCandidate(candidates[0]);
      } catch (linkError) {
        // A BOQ match can fail destination validation; try the safe
        // site/material fallback, but never undo the saved trip.
        console.warn("Automatic PI trip link was not applied:", (linkError as Error).message);
        if (input.boqProjectId != null && input.boqItemId != null) {
          const fallback = await storage.getUnlinkedPiCandidatesForSiteTrip(trip.site, trip.material);
          if (fallback.length === 1 && fallback[0].indentItemId !== candidates[0].indentItemId) {
            try {
              await linkCandidate(fallback[0]);
            } catch (fallbackError) {
              console.warn("Site/material PI fallback was not applied:", (fallbackError as Error).message);
            }
          } else if (fallback.length > 1) {
            piLinkOptions = fallback;
          }
        }
      }
    } else if (candidates.length > 1) {
      piLinkOptions = candidates;
    }
  } catch (lookupError) {
    console.warn("Automatic PI trip match was unavailable:", (lookupError as Error).message);
  }
  return { trip, piLinkOptions, linkedPiIndentNo };
}
