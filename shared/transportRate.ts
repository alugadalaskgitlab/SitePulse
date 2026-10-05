/** Estimator formula, including its original zero-payload fallback. */
export function transportPerMT(distance: number, rate: number, payload: number): number {
  return payload > 0 ? distance * 2 * rate / payload : 0;
}

export type TransportRateBasis = {
  leadDistanceKm: number | null;
  payloadMt: number | null;
  ratePerKm: number | null;
};

/** Rate-card display guards do not change the estimator's historical behavior. */
export function calculateTransportRate(basis: TransportRateBasis) {
  const lead = basis.leadDistanceKm;
  const rate = basis.ratePerKm;
  const payload = basis.payloadMt;
  const leadKnown = lead != null && Number.isFinite(lead) && lead >= 0;
  const priced = leadKnown && lead! > 0 && rate != null && Number.isFinite(rate) && rate >= 0;
  return {
    twoWayDistanceKm: leadKnown ? lead! * 2 : null,
    perTrip: priced ? lead! * 2 * rate! : null,
    perMT: priced && payload != null && Number.isFinite(payload) && payload > 0
      ? transportPerMT(lead!, rate!, payload) : null,
  };
}

export class TransportRateInputError extends Error {}

/** Omitted fields stay omitted: ordinary bill saves must not clear the basis. */
export function validatedTransportRateFields(input: {
  category?: unknown; leadDistanceKm?: unknown; payloadMt?: unknown; ratePerKm?: unknown;
}): Partial<TransportRateBasis> {
  const fields: Partial<TransportRateBasis> = {};
  for (const key of ["leadDistanceKm", "payloadMt", "ratePerKm"] as const) {
    if (!Object.prototype.hasOwnProperty.call(input, key) || input[key] === undefined) continue;
    const value = input[key];
    if (value === null) { fields[key] = null; continue; }
    if (input.category !== "transport") throw new TransportRateInputError("Transport setup is only available for transport rates");
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new TransportRateInputError(`${key} must be a finite non-negative number`);
    }
    if (key === "payloadMt" && value === 0) throw new TransportRateInputError("Payload required for ₹/MT");
    fields[key] = value;
  }
  return fields;
}