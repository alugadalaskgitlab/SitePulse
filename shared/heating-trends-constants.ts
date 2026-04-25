// Operational guard rails for the boiler / heating trends report.
// These constants are referenced by both the server (`getHeatingTrends` in
// `server/storage.ts`) and the client drill-down page
// (`client/src/pages/PlantHeatingMismatch.tsx`) so the badge on Trends, the
// API verdict and the reconciliation view all use the same numbers.

export const HEATING_TRENDS_HOT_OIL_END_TEMP_MIN_C = 240;
export const HEATING_TRENDS_HOT_OIL_DELTA_MIN_C = 15;
export const HEATING_TRENDS_MISMATCH_THRESHOLD_L = 5;
