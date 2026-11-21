export type SoilLabTestType =
  | "field_density_sand"
  | "field_density_core_cutter"
  | "moisture_content"
  | "proctor_light"
  | "proctor_modified"
  | "cbr"
  | "atterberg";

export type LabVerdict = "pass" | "fail" | "na";

export interface LabCalculationContext {
  mddGcc?: number | null;
  omcPercent?: number | null;
  requiredPercent?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
  specificGravity?: number | null;
  sandBulkDensityGcc?: number | null;
  sandInConeG?: number | null;
  ringConstantKgPerDivision?: number | null;
  speedyCorrection?: Array<{ indicated: number; corrected: number }> | null;
}

export interface LabCalculation {
  results: Record<string, unknown>;
  verdict: LabVerdict;
  errors: string[];
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number, places = 3): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function moistureFromOven(reading: any): number | null {
  const panAndWet = numberOrNull(reading?.w6);
  const panAndDry = numberOrNull(reading?.w7);
  const pan = numberOrNull(reading?.w5);
  if (panAndWet === null || panAndDry === null || pan === null || panAndDry <= pan) return null;
  return (panAndWet - panAndDry) / (panAndDry - pan) * 100;
}

function moistureFromSpeedy(reading: any, context: LabCalculationContext): number | null {
  const indicated = numberOrNull(reading?.speedyIndicated);
  if (indicated === null) return null;
  const pairs = context.speedyCorrection ?? [];
  if (!pairs.length) return indicated;
  const sorted = pairs
    .map(pair => ({ x: numberOrNull(pair.indicated), y: numberOrNull(pair.corrected) }))
    .filter((pair): pair is { x: number; y: number } => pair.x !== null && pair.y !== null)
    .sort((a, b) => a.x - b.x);
  if (!sorted.length) return indicated;
  if (indicated <= sorted[0].x) return sorted[0].y;
  if (indicated >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1].y;
  const upperIndex = sorted.findIndex(pair => pair.x >= indicated);
  const lower = sorted[upperIndex - 1];
  const upper = sorted[upperIndex];
  const ratio = (indicated - lower.x) / (upper.x - lower.x);
  return lower.y + ratio * (upper.y - lower.y);
}

function moisture(reading: any, context: LabCalculationContext): number | null {
  return reading?.moistureMethod === "speedy"
    ? moistureFromSpeedy(reading, context)
    : moistureFromOven(reading);
}

function verdictForThreshold(value: number | null, min?: number | null, max?: number | null): LabVerdict {
  if (value === null) return "na";
  if (min != null && value < min) return "fail";
  if (max != null && value > max) return "fail";
  return "pass";
}

function pitVerdict(value: number | null, required: number | null): LabVerdict {
  return value == null || required == null ? "na" : value >= required ? "pass" : "fail";
}

function calculateFdd(
  readings: any,
  context: LabCalculationContext,
  coreCutter: boolean,
): LabCalculation {
  const errors: string[] = [];
  const pits = Array.isArray(readings?.pits) ? readings.pits.slice(0, 3) : [];
  if (pits.length === 0) errors.push("Add at least one test pit.");
  const results = pits.map((pit: any, index: number) => {
    const wetSoilWeight = numberOrNull(pit?.wetSoilWeight);
    const cutterWeight = numberOrNull(pit?.cutterWeight);
    const soilAndCutterWeight = numberOrNull(pit?.soilAndCutterWeight);
    const cutterVolume = numberOrNull(pit?.cutterVolume);
    const w1 = numberOrNull(pit?.w1);
    const w2 = numberOrNull(pit?.w2);
    const w3 = numberOrNull(pit?.w3);
    const sandBulkDensity = numberOrNull(pit?.sandBulkDensity) ?? context.sandBulkDensityGcc ?? null;
    const sandInCone = numberOrNull(pit?.sandInCone) ?? context.sandInConeG ?? null;
    const sandWeight = w1 !== null && w2 !== null && w3 !== null ? w1 - w2 - w3 : null;
    const volume = coreCutter
      ? cutterVolume
      : sandWeight !== null && sandBulkDensity !== null && sandBulkDensity > 0
        ? sandWeight / sandBulkDensity
        : null;
    const wetWeight = coreCutter
      ? soilAndCutterWeight !== null && cutterWeight !== null ? soilAndCutterWeight - cutterWeight : wetSoilWeight
      : wetSoilWeight;
    const bulkDensity = wetWeight !== null && volume !== null && volume > 0 ? wetWeight / volume : null;
    const waterContent = moisture(pit, context);
    const dryDensity = bulkDensity !== null && waterContent !== null && waterContent > -100
      ? bulkDensity / (1 + waterContent / 100)
      : null;
    const compaction = dryDensity !== null && context.mddGcc != null && context.mddGcc > 0
      ? dryDensity / context.mddGcc * 100
      : null;
    const verdict = pitVerdict(compaction, context.requiredPercent ?? null);
    if (pits.length && compaction == null) errors.push(`Pit ${index + 1}: incomplete readings or missing MDD / requirement.`);
    return {
      pitNo: index + 1,
      sandWeightG: sandWeight == null ? null : round(sandWeight, 1),
      pitVolumeCc: volume == null ? null : round(volume, 1),
      bulkDensityGcc: bulkDensity == null ? null : round(bulkDensity, 3),
      moisturePercent: waterContent == null ? null : round(waterContent, 2),
      dryDensityGcc: dryDensity == null ? null : round(dryDensity, 3),
      mddGcc: context.mddGcc ?? null,
      compactionPercent: compaction == null ? null : round(compaction, 2),
      requiredPercent: context.requiredPercent ?? null,
      verdict,
      sandInConeG: coreCutter ? null : sandInCone,
    };
  });
  const verdict: LabVerdict = results.some((pit: any) => pit.verdict === "fail")
    ? "fail"
    : results.length && results.every((pit: any) => pit.verdict === "pass") ? "pass" : "na";
  return { results: { pits }, verdict, errors };
}

function calculateProctor(readings: any, context: LabCalculationContext): LabCalculation {
  const trials = (Array.isArray(readings?.trials) ? readings.trials : [])
    .slice(0, 6)
    .map((trial: any, index: number) => {
      const w1 = numberOrNull(trial?.w1);
      const w2 = numberOrNull(trial?.w2);
      const volumeCc = numberOrNull(trial?.volumeCc);
      const wetSoilWeight = w1 !== null && w2 !== null ? w2 - w1 : null;
      const moisturePercent = moisture(trial, context);
      const bulkDensity = wetSoilWeight !== null && volumeCc !== null && volumeCc > 0
        ? wetSoilWeight / volumeCc : null;
      const dryDensity = bulkDensity !== null && moisturePercent !== null && moisturePercent > -100
        ? bulkDensity / (1 + moisturePercent / 100) : null;
      return {
        trialNo: index + 1,
        wetSoilWeightG: wetSoilWeight == null ? null : round(wetSoilWeight, 1),
        moisturePercent: moisturePercent == null ? null : round(moisturePercent, 2),
        bulkDensityGcc: bulkDensity == null ? null : round(bulkDensity, 3),
        dryDensityGcc: dryDensity == null ? null : round(dryDensity, 3),
      };
    });
  const valid = trials
    .map((trial: any, index: number) => ({ index, x: trial.moisturePercent, y: trial.dryDensityGcc }))
    .filter((point: any) => point.x != null && point.y != null);
  valid.sort((a: any, b: any) => a.x - b.x);
  if (valid.length < 3) {
    return {
      results: { trials, mddGcc: null, omcPercent: null, specificGravity: context.specificGravity ?? 2.65, graph: [] },
      verdict: "na",
      errors: ["Enter at least three complete trials to calculate MDD and OMC."],
    };
  }
  const peakIndex = valid.reduce((best: number, point: any, index: number) =>
    point.y > valid[best].y ? index : best, 0);
  if (peakIndex === 0 || peakIndex === valid.length - 1) {
    return {
      results: { trials, mddGcc: null, omcPercent: null, specificGravity: context.specificGravity ?? 2.65, graph: valid },
      verdict: "na",
      errors: ["Add a trial on that side of the peak before setting a benchmark."],
    };
  }
  const points = valid.slice(peakIndex - 1, peakIndex + 2);
  const [p1, p2, p3] = points;
  const denom = (p1.x - p2.x) * (p1.x - p3.x) * (p2.x - p3.x);
  if (!denom) {
    return { results: { trials, mddGcc: null, omcPercent: null, specificGravity: context.specificGravity ?? 2.65, graph: valid }, verdict: "na", errors: ["The three peak trials need different moisture values."] };
  }
  const a = (p3.x * (p2.y - p1.y) + p2.x * (p1.y - p3.y) + p1.x * (p3.y - p2.y)) / denom;
  const b = (p3.x ** 2 * (p1.y - p2.y) + p2.x ** 2 * (p3.y - p1.y) + p1.x ** 2 * (p2.y - p3.y)) / denom;
  const c = (p2.x * p3.x * (p2.x - p3.x) * p1.y
    + p3.x * p1.x * (p3.x - p1.x) * p2.y
    + p1.x * p2.x * (p1.x - p2.x) * p3.y) / denom;
  const omc = a < 0 ? -b / (2 * a) : null;
  const mdd = omc == null ? null : a * omc * omc + b * omc + c;
  const graph = Array.from({ length: 21 }, (_, i) => {
    const x = Math.min(...points.map((p: any) => p.x)) + (Math.max(...points.map((p: any) => p.x)) - Math.min(...points.map((p: any) => p.x))) * i / 20;
    return { moisturePercent: round(x, 2), dryDensityGcc: round(a * x * x + b * x + c, 3) };
  });
  const gravity = context.specificGravity ?? 2.65;
  const zeroAirVoids = graph.map((point: any) => ({
    moisturePercent: point.moisturePercent,
    dryDensityGcc: round(gravity / (1 + gravity * point.moisturePercent / 100), 3),
  }));
  return {
    results: { trials, mddGcc: mdd == null ? null : round(mdd, 3), omcPercent: omc == null ? null : round(omc, 2), specificGravity: gravity, graph, zeroAirVoids },
    verdict: "na",
    errors: mdd == null ? ["Could not fit a Proctor peak from these trials."] : [],
  };
}

function calculateCbr(readings: any, context: LabCalculationContext): LabCalculation {
  const ringConstant = numberOrNull(readings?.ringConstantKgPerDivision) ?? context.ringConstantKgPerDivision ?? null;
  const penetrations = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10, 12.5];
  const points = penetrations.map((penetration, index) => {
    const dial = numberOrNull(readings?.dialReadings?.[String(penetration)] ?? readings?.dialReadings?.[index]);
    return { penetrationMm: penetration, dial, loadKg: dial == null || ringConstant == null ? null : round(dial * ringConstant, 3) };
  });
  const load25 = points.find(point => point.penetrationMm === 2.5)?.loadKg ?? null;
  const load50 = points.find(point => point.penetrationMm === 5)?.loadKg ?? null;
  const cbr25 = load25 == null ? null : load25 / 1370 * 100;
  const cbr50 = load50 == null ? null : load50 / 2055 * 100;
  const reported = cbr25 == null ? cbr50 : cbr50 == null ? cbr25 : Math.max(cbr25, cbr50);
  const initial = numberOrNull(readings?.initialSwellGauge);
  const final = numberOrNull(readings?.finalSwellGauge);
  const height = numberOrNull(readings?.specimenHeightMm);
  const swell = initial != null && final != null && height != null && height > 0 ? (final - initial) / height * 100 : null;
  if (ringConstant == null) errors.push("Enter the proving-ring constant.");
  for (const point of points) {
    if (point.dial == null) errors.push(`Enter the dial reading at ${point.penetrationMm} mm.`);
  }
  if (initial == null || final == null || height == null || height <= 0) {
    errors.push("Enter the initial and final swell readings and specimen height.");
  }
  return {
    results: {
      ringConstantKgPerDivision: ringConstant,
      points,
      cbrAt25Percent: cbr25 == null ? null : round(cbr25, 2),
      cbrAt50Percent: cbr50 == null ? null : round(cbr50, 2),
      reportedCbrPercent: reported == null ? null : round(reported, 2),
      swellPercent: swell == null ? null : round(swell, 2),
    },
    verdict: verdictForThreshold(reported, context.minValue, context.maxValue),
    errors: reported == null ? ["Enter the 2.5 mm and 5.0 mm readings and ring constant."] : [],
  };
}

function calculateAtterberg(readings: any, context: LabCalculationContext): LabCalculation {
  const flow = (Array.isArray(readings?.liquidLimitTrials) ? readings.liquidLimitTrials : [])
    .map((trial: any) => ({ blows: numberOrNull(trial?.blows), moisturePercent: moisture(trial, context) }))
    .filter((trial: any) => trial.blows != null && trial.blows > 0 && trial.moisturePercent != null);
  let liquidLimit: number | null = null;
  if (flow.length >= 2) {
    const xs = flow.map((trial: any) => Math.log10(trial.blows));
    const ys = flow.map((trial: any) => trial.moisturePercent);
    const meanX = xs.reduce((a: number, b: number) => a + b, 0) / xs.length;
    const meanY = ys.reduce((a: number, b: number) => a + b, 0) / ys.length;
    const slope = xs.reduce((sum: number, x: number, i: number) => sum + (x - meanX) * (ys[i] - meanY), 0)
      / xs.reduce((sum: number, x: number) => sum + (x - meanX) ** 2, 0);
    liquidLimit = meanY + slope * (Math.log10(25) - meanX);
  }
  const plasticTrials = (Array.isArray(readings?.plasticLimitTrials) ? readings.plasticLimitTrials : [])
    .map((trial: any) => moisture(trial, context))
    .filter((value: number | null): value is number => value != null);
  const nonPlastic = readings?.nonPlastic === true;
  const plasticLimit = nonPlastic ? null : plasticTrials.reduce((sum: number, value: number) => sum + value, 0) / plasticTrials.length;
  const plasticityIndex = nonPlastic || liquidLimit == null || plasticLimit == null ? null : liquidLimit - plasticLimit;
  if (flow.length < 3) errors.push("Enter at least three liquid-limit trials for the flow curve.");
  if (!nonPlastic && plasticTrials.length < 2) errors.push("Enter at least two plastic-limit trials, or mark the soil non-plastic.");
  return {
    results: {
      flowLine: flow.map((trial: any) => ({ blows: trial.blows, moisturePercent: round(trial.moisturePercent, 2) })),
      liquidLimitPercent: liquidLimit == null ? null : round(liquidLimit, 2),
      plasticLimitPercent: plasticLimit == null ? nonPlastic ? "NP" : null : round(plasticLimit, 2),
      plasticityIndexPercent: plasticityIndex == null ? null : round(plasticityIndex, 2),
    },
    verdict: nonPlastic ? "na" : verdictForThreshold(plasticityIndex, context.minValue, context.maxValue),
    errors,
  };
}

export function calculateSoilLabTest(
  testType: SoilLabTestType,
  readings: unknown,
  context: LabCalculationContext = {},
): LabCalculation {
  const input = readings && typeof readings === "object" ? readings as Record<string, any> : {};
  if (testType === "field_density_sand") return calculateFdd(input, context, false);
  if (testType === "field_density_core_cutter") return calculateFdd(input, context, true);
  if (testType === "moisture_content") {
    const value = moisture(input, context);
    const min = context.omcPercent == null ? null : context.omcPercent - 2;
    const max = context.omcPercent == null ? null : context.omcPercent + 2;
    return {
      results: { moisturePercent: value == null ? null : round(value, 2), omcPercent: context.omcPercent ?? null, allowedMin: min, allowedMax: max },
      verdict: context.omcPercent == null ? "na" : verdictForThreshold(value, min, max),
      errors: value == null ? ["Enter a complete oven or speedy moisture reading."] : [],
    };
  }
  if (testType === "proctor_light" || testType === "proctor_modified") return calculateProctor(input, context);
  if (testType === "cbr") return calculateCbr(input, context);
  return calculateAtterberg(input, context);
}

export const SOIL_QUALITY_SPEC_DEFAULTS = [
  { work: "Embankment", testType: "field_density_sand", minValue: 95, maxValue: null, frequencyQty: 3000, frequencyUnit: "sqm", note: "FDD ≥ 95% per 3000 sqm" },
  { work: "Embankment", testType: "atterberg", minValue: null, maxValue: 18, frequencyQty: 3000, frequencyUnit: "cum", note: "Atterberg PI ≤ 18 per 3000 cum" },
  { work: "Subgrade", testType: "field_density_sand", minValue: 97, maxValue: null, frequencyQty: 2000, frequencyUnit: "sqm", note: "FDD ≥ 97% per 2000 sqm" },
  { work: "Subgrade", testType: "cbr", minValue: 10, maxValue: null, frequencyQty: 3000, frequencyUnit: "cum", note: "CBR ≥ 10% per 3000 cum" },
  { work: "Subgrade", testType: "atterberg", minValue: null, maxValue: 18, frequencyQty: 3000, frequencyUnit: "cum", note: "Atterberg PI ≤ 18" },
  { work: "GSB", testType: "field_density_sand", minValue: 98, maxValue: null, frequencyQty: 1000, frequencyUnit: "sqm", note: "FDD ≥ 98% per 1000 sqm" },
  { work: "WMM", testType: "field_density_sand", minValue: 98, maxValue: null, frequencyQty: 1000, frequencyUnit: "sqm", note: "FDD ≥ 98% per 1000 sqm" },
] as const;

export function soilQualityDefaultsForWork(workName: string) {
  const normalized = String(workName ?? "").toLowerCase();
  return SOIL_QUALITY_SPEC_DEFAULTS.filter(spec => normalized.includes(spec.work.toLowerCase()));
}
