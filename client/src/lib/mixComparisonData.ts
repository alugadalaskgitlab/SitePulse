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
  areaSqm: number;
  mt: number;
  plantPerMt: number;
  transPerMt: number;
  layPerMt: number;
  totalPerMt: number;
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

function pickPrimary(ests: MixEstimate[]): MixEstimate {
  return ests.reduce((best, e) => {
    const bt = best.updatedAt ? new Date(best.updatedAt).getTime() : 0;
    const et = e.updatedAt ? new Date(e.updatedAt).getTime() : 0;
    return et > bt ? e : best;
  }, ests[0]);
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
    const primary = pickPrimary(contractorMap[contractor]);
    try {
      const state: CalcState = JSON.parse(primary.state);
      const { mixRates } = calcMixRatesAndJobs(state);
      const rates: MixRateEntry[] = mixRates.map((mr) => ({
        name: mr.name,
        exPlant: mr.exPlant,
        transport: mr.transport,
        laying: mr.laying,
        finalLaid: mr.finalLaid,
      }));
      rateMap[contractor] = { contractor, estimateName: primary.name, rates };
      rates.forEach((r) => {
        if (!seenMixNames.has(r.name)) {
          seenMixNames.add(r.name);
          allMixNames.push(r.name);
        }
      });
    } catch { /* skip malformed state */ }
  });

  const ledgerRows: LedgerRow[] = [];
  contractors.forEach((contractor) => {
    contractorMap[contractor].forEach((est) => {
      try {
        const state: CalcState = JSON.parse(est.state);
        const jobs: Record<string, unknown>[] = ((state.jobs as unknown) as Record<string, unknown>[]) || [];
        jobs.forEach((j) => {
          const mt = (j._mt as number) ?? 0;
          if (mt <= 0) return;
          const plantAmt = (j._plantAmt as number) ?? 0;
          const transAmt = (j._transAmt as number) ?? 0;
          const layAmt = (j._layAmt as number) ?? 0;
          const primeAmt = (j._primeAmt as number) ?? 0;
          const tackAmt = (j._tackAmt as number) ?? 0;
          const totalAmt = (j._totalAmt as number) ?? (plantAmt + transAmt + layAmt + primeAmt + tackAmt);
          ledgerRows.push({
            contractor,
            estimateName: est.name,
            jobId: (j.id as string) ?? "—",
            areaSqm: (j._area as number) ?? 0,
            mt,
            plantPerMt: plantAmt / mt,
            transPerMt: transAmt / mt,
            layPerMt: layAmt / mt,
            totalPerMt: totalAmt / mt,
            totalAmt,
          });
        });
      } catch { /* skip malformed state */ }
    });
  });

  return { contractors, allMixNames, rateMap, ledgerRows };
}
