import { calcMixRatesAndJobs, type CalcState } from "./mixCalc";
import type { MixEstimate } from "@shared/schema";

export interface MixRateEntry {
  name: string;
  exPlant: number;
  exPlantPerCum: number;
  transport: number;
  transPerCum: number;
  laying: number;
  layPerCum: number;
  finalLaid: number;
  finalLaidPerCum: number;
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
  cum: number;
  plantPerMt: number;
  plantPerCum: number;
  transPerMt: number;
  transPerCum: number;
  layPerMt: number;
  layPerCum: number;
  totalPerMt: number;
  totalPerCum: number;
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
              exPlantPerCum: mr.exPlantPerCum,
              transport: mr.transport,
              transPerCum: mr.transPerCum,
              laying: mr.laying,
              layPerCum: mr.layPerCum,
              finalLaid: mr.finalLaid,
              finalLaidPerCum: mr.finalLaidPerCum,
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
        // Support both legacy flat jobs[] and new sites[].jobs[] format
        let rawJobs: Record<string, unknown>[];
        if (Array.isArray((state as unknown as Record<string, unknown>).sites)) {
          rawJobs = ((state as unknown as Record<string, unknown>).sites as Record<string, unknown>[])
            .flatMap((s) => (s.jobs as Record<string, unknown>[]) ?? []);
        } else {
          rawJobs = ((state.jobs as unknown) as Record<string, unknown>[]) || [];
        }
        const jobs: Record<string, unknown>[] = rawJobs;
        jobs.forEach((j) => {
          const mt = (j._mt as number) ?? 0;
          const plantAmt = (j._plantAmt as number) ?? 0;
          const transAmt = (j._transAmt as number) ?? 0;
          const layAmt = (j._layAmt as number) ?? 0;
          const primeAmt = (j._primeAmt as number) ?? 0;
          const tackAmt = (j._tackAmt as number) ?? 0;
          const totalAmt = (j._totalAmt as number) ?? (plantAmt + transAmt + layAmt + primeAmt + tackAmt);

          // Compute CUM from job geometry (same logic as calcMixRatesAndJobs)
          const isGeo = (j.basis as string) === 'GEOMETRY';
          let cum: number;
          if (isGeo) {
            const thickM = ((j.thickness as number) ?? 0) / 1000;
            cum = ((j.length as number) ?? 0) * ((j.width as number) ?? 0) * thickM;
          } else {
            cum = (j.volume as number) ?? 0;
          }

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
            cum,
            plantPerMt: mt > 0 ? plantAmt / mt : 0,
            plantPerCum: cum > 0 ? plantAmt / cum : 0,
            transPerMt: mt > 0 ? transAmt / mt : 0,
            transPerCum: cum > 0 ? transAmt / cum : 0,
            layPerMt: mt > 0 ? layAmt / mt : 0,
            layPerCum: cum > 0 ? layAmt / cum : 0,
            totalPerMt: mt > 0 ? totalAmt / mt : 0,
            totalPerCum: cum > 0 ? totalAmt / cum : 0,
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
