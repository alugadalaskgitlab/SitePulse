import { calcMixRatesAndJobs, type CalcState } from "./mixCalc";
import type { MixEstimate } from "@shared/schema";

export interface MixRateEntry {
  name: string;
  exPlant: number;
  transport: number;
  laying: number;
  finalLaid: number;
}

export interface ContractorRates {
  contractor: string;
  estimateName: string;
  rates: MixRateEntry[];
}

export interface LedgerRow {
  contractor: string;
  estimateName: string;
  jobId: string;
  mixType: string;
  areaSqm: number;
  mt: number;
  plantPerMt: number;
  transPerMt: number;
  layPerMt: number;
  totalPerMt: number;
  primeAmt: number;
  tackAmt: number;
  totalAmt: number;
}

export interface ComparisonData {
  contractors: string[];
  allMixNames: string[];
  rateMap: Record<string, ContractorRates>;
  ledgerRows: LedgerRow[];
}

function latestUpdatedAt(ests: MixEstimate[]): number {
  return ests.reduce(
    (max, e) => Math.max(max, e.updatedAt ? new Date(e.updatedAt).getTime() : 0),
    0
  );
}

function sortByUpdatedAtDesc(ests: MixEstimate[]): MixEstimate[] {
  return [...ests].sort(
    (a, b) =>
      (b.updatedAt ? new Date(b.updatedAt).getTime() : 0) -
      (a.updatedAt ? new Date(a.updatedAt).getTime() : 0)
  );
}

export function buildMixComparisonData(estimates: MixEstimate[]): ComparisonData {
  const contractorMap: Record<string, MixEstimate[]> = {};
  estimates.forEach((est) => {
    const key = est.contractor?.trim().toUpperCase() || "UNASSIGNED";
    if (!contractorMap[key]) contractorMap[key] = [];
    contractorMap[key].push(est);
  });

  const contractors = Object.keys(contractorMap).sort((a, b) => {
    return latestUpdatedAt(contractorMap[b]) - latestUpdatedAt(contractorMap[a]);
  });

  const rateMap: Record<string, ContractorRates> = {};
  const seenMixNames = new Set<string>();
  const allMixNames: string[] = [];

  contractors.forEach((contractor) => {
    const sorted = sortByUpdatedAtDesc(contractorMap[contractor]);
    const ratesByMixName: Record<string, MixRateEntry> = {};

    sorted.forEach((est) => {
      try {
        const state: CalcState = JSON.parse(est.state);
        const { mixRates } = calcMixRatesAndJobs(state);
        mixRates.forEach((mr) => {
          if (!seenMixNames.has(mr.name)) {
            seenMixNames.add(mr.name);
            allMixNames.push(mr.name);
          }
          if (!ratesByMixName[mr.name]) {
            ratesByMixName[mr.name] = {
              name: mr.name,
              exPlant: mr.exPlant,
              transport: mr.transport,
              laying: mr.laying,
              finalLaid: mr.finalLaid,
            };
          }
        });
      } catch { /* skip malformed state */ }
    });

    rateMap[contractor] = {
      contractor,
      estimateName: sorted[0]?.name ?? "",
      rates: Object.values(ratesByMixName),
    };
  });

  const ledgerRows: LedgerRow[] = [];
  contractors.forEach((contractor) => {
    sortByUpdatedAtDesc(contractorMap[contractor]).forEach((est) => {
      try {
        const state: CalcState = JSON.parse(est.state);
        const jobs: Record<string, unknown>[] = ((state.jobs as unknown) as Record<string, unknown>[]) || [];
        jobs.forEach((j) => {
          const mt = (j._mt as number) ?? 0;
          const plantAmt = (j._plantAmt as number) ?? 0;
          const transAmt = (j._transAmt as number) ?? 0;
          const layAmt = (j._layAmt as number) ?? 0;
          const primeAmt = (j._primeAmt as number) ?? 0;
          const tackAmt = (j._tackAmt as number) ?? 0;
          const totalAmt = (j._totalAmt as number) ?? (plantAmt + transAmt + layAmt + primeAmt + tackAmt);

          // Derive mix type label from mixes array + state.mixTypes
          const jobMixes = (j.mixes as { mixIdx: number; qty_mt: number | null }[]) ?? [];
          const mixNames = jobMixes
            .filter((m) => (m.qty_mt ?? 0) > 0)
            .map((m) => state.mixTypes?.[m.mixIdx]?.name ?? `Mix ${m.mixIdx + 1}`)
            .filter(Boolean);
          const mixType = mixNames.length > 0 ? mixNames.join(" / ") : "—";

          ledgerRows.push({
            contractor,
            estimateName: est.name,
            jobId: (j.id as string) ?? "—",
            mixType,
            areaSqm: (j._area as number) ?? 0,
            mt,
            plantPerMt: mt > 0 ? plantAmt / mt : 0,
            transPerMt: mt > 0 ? transAmt / mt : 0,
            layPerMt: mt > 0 ? layAmt / mt : 0,
            totalPerMt: mt > 0 ? totalAmt / mt : 0,
            primeAmt,
            tackAmt,
            totalAmt,
          });
        });
      } catch { /* skip malformed state */ }
    });
  });

  return { contractors, allMixNames, rateMap, ledgerRows };
}
