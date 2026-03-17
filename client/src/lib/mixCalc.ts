const FRAC_KEYS = ['f20mm', 'f10mm', 'f6mm', 'fDust', 'fFiller'] as const;

export interface MixTypeDef {
  name: string;
  binderPct: number;
  density: number;
  fractions: Record<string, number>;
}

export interface EquipDef {
  id: string;
  name: string;
  mode: 'owned' | 'hired';
  capex: number;
  life: number;
  maint: number;
  hireBasis: 'daily' | 'hourly' | 'monthly';
  hireRate: number;
  hireHrsDay: number;
  hireHrsMonth: number;
  enabled: boolean;
  isLaying: boolean;
}

export interface JobDef {
  id: string;
  contractor?: string;
  basis: 'GEOMETRY' | 'BOQ';
  length?: number;
  width?: number;
  thickness?: number;
  volume?: number;
  prime?: boolean;
  tack?: boolean;
  mixes: { mixIdx: number; qty_mt: number | null }[];
}

export interface CalcState {
  inputs: Record<string, string>;
  mixTypes: MixTypeDef[];
  equipDefs: EquipDef[];
  jobs: JobDef[];
  aggBasis?: string;
}

export interface RevisedPrices {
  aggRate?: number;
  bitPrice?: number;
  hsdPrice?: number;
  ldoRate?: number;
}

export interface MixRate {
  name: string;
  density: number;
  aggregate: number;
  bitumen: number;
  equipment: number;
  fuel: number;
  hsd: number;
  ldo: number;
  crew: number;
  margin: number;
  exPlant: number;
  transport: number;
  laying: number;
  finalLaid: number;
}

export interface JobResult {
  id: string;
  contractor: string;
  totalMt: number;
  totalAmt: number;
  mixes: {
    mixIdx: number;
    mixName: string;
    mt: number;
    finalLaid: number;
    amt: number;
  }[];
}

export interface CalcResult {
  mixRates: MixRate[];
  jobResults: JobResult[];
  grandTotalMt: number;
  grandTotalAmt: number;
}

function n(inputs: Record<string, string>, key: string, def = 0): number {
  const v = parseFloat(inputs[key]);
  return isNaN(v) ? def : v;
}

function equipCostPerMT(eq: EquipDef, tph: number, phm: number): number {
  if (!eq.enabled || tph <= 0) return 0;
  if (eq.mode === 'owned') {
    if (eq.life <= 0 || phm <= 0) return 0;
    const monthlyDepr = (eq.capex / eq.life / 12) * (1 + eq.maint / 100);
    return monthlyDepr / phm / tph;
  } else {
    if (eq.hireBasis === 'daily') {
      if ((eq.hireHrsDay || 0) <= 0) return 0;
      return eq.hireRate / (eq.hireHrsDay || 10) / tph;
    } else if (eq.hireBasis === 'hourly') {
      return eq.hireRate / tph;
    } else {
      const billedHrs = eq.hireHrsMonth || phm;
      if (billedHrs <= 0) return 0;
      return eq.hireRate / billedHrs / tph;
    }
  }
}

function equipDailyCost(eq: EquipDef): number {
  if (!eq.enabled) return 0;
  if (eq.mode === 'owned') {
    if (eq.life <= 0) return 0;
    const monthlyDepr = (eq.capex / eq.life / 12) * (1 + eq.maint / 100);
    return monthlyDepr / 25;
  } else {
    if (eq.hireBasis === 'daily') return eq.hireRate;
    if (eq.hireBasis === 'hourly') return eq.hireRate * (eq.hireHrsDay || 8);
    return eq.hireRate / 25;
  }
}

export function calcMixRatesAndJobs(state: CalcState, overrides?: RevisedPrices): CalcResult {
  const { inputs, mixTypes, equipDefs, jobs, aggBasis } = state;

  const tph = n(inputs, 'tph');
  const phm = n(inputs, 'plantHrsMonth');

  const rawAggRate = overrides?.aggRate ?? n(inputs, 'aggRate');
  const aggDensity = n(inputs, 'aggDensity');
  const aggDist = n(inputs, 'aggDist');
  const aggFreightRate = n(inputs, 'aggFreightRate');
  const aggPayload = n(inputs, 'aggPayload');
  const aggFreight = aggPayload > 0 ? (aggDist * 2 * aggFreightRate / aggPayload) : 0;
  const aggRateMT = (aggBasis === 'CFT' && aggDensity > 0)
    ? (rawAggRate / aggDensity * 35.3147)
    : rawAggRate;
  const aggLanded = aggRateMT + aggFreight;

  const bitPrice = overrides?.bitPrice ?? n(inputs, 'bitPrice');
  const hsdPrice = overrides?.hsdPrice ?? n(inputs, 'hsdPrice');
  const hsdConsump = n(inputs, 'hsdConsump');
  const hsdPerMT = tph > 0 ? (hsdConsump * hsdPrice / tph) : 0;

  const ldoRate = overrides?.ldoRate ?? n(inputs, 'ldoRate');
  const ldoConsump = n(inputs, 'ldoConsump');
  const ldoPerMT = ldoConsump * ldoRate;

  const boilerProdLhr = n(inputs, 'boilerProdLhr');
  const boilerPreheatLhr = n(inputs, 'boilerPreheatLhr');
  const boilerFuelRate = n(inputs, 'boilerFuelRate');
  const boilerProdHrs = n(inputs, 'boilerProdHrs');
  const boilerPreheatHrs = n(inputs, 'boilerPreheatHrs');
  const boilerCampaignMt = n(inputs, 'boilerCampaignMt');
  const boilerProdPerMT = boilerCampaignMt > 0 ? (boilerProdLhr * boilerFuelRate * boilerProdHrs / boilerCampaignMt) : 0;
  const boilerPreheatPerMT = boilerCampaignMt > 0 ? (boilerPreheatLhr * boilerFuelRate * boilerPreheatHrs / boilerCampaignMt) : 0;

  const crewMonthly = n(inputs, 'crewMonthly');
  const crewDays = n(inputs, 'crewDays');
  const crewHrs = n(inputs, 'crewHrs');
  const crewPerMT = (crewDays > 0 && crewHrs > 0 && tph > 0)
    ? (crewMonthly / crewDays / crewHrs / tph) : 0;

  const marginPct = n(inputs, 'marginPct');

  let plantEquipPerMT = 0;
  equipDefs.forEach((eq) => {
    if (!eq.isLaying) {
      plantEquipPerMT += equipCostPerMT(eq, tph, phm);
    }
  });

  const paverEq = equipDefs.find((e) => e.id === 'paver');
  const rollerEq = equipDefs.find((e) => e.id === 'roller');
  const ptrEq = equipDefs.find((e) => e.id === 'ptr');
  const layPaverD = paverEq ? equipDailyCost(paverEq) : 0;
  const layRollerD = rollerEq ? equipDailyCost(rollerEq) : 0;
  const layPtrD = ptrEq ? equipDailyCost(ptrEq) : 0;
  const layCrewD = n(inputs, 'layCrew');
  const layFuelD = n(inputs, 'layFuel');
  const layProd = n(inputs, 'layProductivity');
  const layTotalDaily = layPaverD + layRollerD + layPtrD + layCrewD + layFuelD;
  const layPerMT = layProd > 0 ? (layTotalDaily / layProd) : 0;

  const transDist = n(inputs, 'transDist');
  const transRate = n(inputs, 'transRate');
  const transPayload = n(inputs, 'transPayload');
  const transPerMT = transPayload > 0 ? (transDist * 2 * transRate / transPayload) : 0;

  const primeSpray = n(inputs, 'primeSpray');
  const primePrice = n(inputs, 'primePrice');
  const primeDilution = n(inputs, 'primeDilution') || 1;
  const tackSpray = n(inputs, 'tackSpray');
  const tackPrice = n(inputs, 'tackPrice');
  const tackDilution = n(inputs, 'tackDilution') || 1;
  const sprayBowser = n(inputs, 'sprayBowser');
  const sprayCrew = n(inputs, 'sprayCrew');
  const sprayProd = n(inputs, 'sprayProd');
  const sprayOpPerSqm = sprayProd > 0 ? ((sprayBowser + sprayCrew) / sprayProd) : 0;
  const primePerSqm = (primeSpray * primePrice / primeDilution) + sprayOpPerSqm;
  const tackPerSqm = (tackSpray * tackPrice / tackDilution) + sprayOpPerSqm;

  const fuelTotal = hsdPerMT + ldoPerMT + boilerProdPerMT + boilerPreheatPerMT;

  const mixRates: MixRate[] = (mixTypes || []).map((m) => {
    const aggFrac = FRAC_KEYS.reduce((s, k) => s + (m.fractions?.[k] ?? 0), 0) / 100;
    const bitFrac = m.binderPct / 100;
    const aggCostPerMT = aggFrac * aggLanded;
    const bitCostPerMT = bitFrac * 1000 * bitPrice;
    const plantSubtotal = aggCostPerMT + bitCostPerMT + plantEquipPerMT + fuelTotal + crewPerMT;
    const marginAmt = plantSubtotal * marginPct / 100;
    const exPlant = plantSubtotal + marginAmt;
    const finalLaid = exPlant + transPerMT + layPerMT;
    return {
      name: m.name,
      density: m.density,
      aggregate: aggCostPerMT,
      bitumen: bitCostPerMT,
      equipment: plantEquipPerMT,
      fuel: fuelTotal,
      hsd: hsdPerMT,
      ldo: ldoPerMT,
      crew: crewPerMT,
      margin: marginAmt,
      exPlant,
      transport: transPerMT,
      laying: layPerMT,
      finalLaid,
    };
  });

  let grandTotalMt = 0;
  let grandTotalAmt = 0;

  const jobResults: JobResult[] = (jobs || []).map((j) => {
    const isGeo = j.basis === 'GEOMETRY';
    let cum: number;
    let area: number;
    if (isGeo) {
      const thickM = (j.thickness ?? 0) / 1000;
      cum = (j.length ?? 0) * (j.width ?? 0) * thickM;
      area = (j.length ?? 0) * (j.width ?? 0);
    } else {
      cum = j.volume ?? 0;
      const thickM = (j.thickness ?? 0) / 1000;
      const len = (j.width ?? 0) > 0 && thickM > 0 ? (cum / ((j.width ?? 0) * thickM)) : 0;
      area = len * (j.width ?? 0);
    }

    const primeAmt = j.prime ? (area * primePerSqm) : 0;
    const tackAmt = j.tack ? (area * tackPerSqm) : 0;

    let jobMT = 0;
    let jobPlant = 0;
    let jobTrans = 0;
    let jobLay = 0;

    const mixDetails = (j.mixes || []).map((mx) => {
      const mr = mixRates[mx.mixIdx] ?? mixRates[0];
      const mixDef = (mixTypes || [])[mx.mixIdx] ?? (mixTypes || [])[0];
      if (!mr || !mixDef) return { mixIdx: mx.mixIdx, mixName: '?', mt: 0, finalLaid: 0, amt: 0 };
      const mt = (mx.qty_mt != null && mx.qty_mt > 0)
        ? mx.qty_mt
        : (cum > 0 && mixDef.density > 0 ? cum * mixDef.density : 0);
      const plantAmt = mt * mr.exPlant;
      const transAmt = mt * transPerMT;
      const layAmt = mt * layPerMT;
      jobMT += mt;
      jobPlant += plantAmt;
      jobTrans += transAmt;
      jobLay += layAmt;
      return { mixIdx: mx.mixIdx, mixName: mixDef.name, mt, finalLaid: mr.finalLaid, amt: plantAmt + transAmt + layAmt };
    });

    const jobTotal = jobPlant + jobTrans + jobLay + primeAmt + tackAmt;
    grandTotalMt += jobMT;
    grandTotalAmt += jobTotal;

    return {
      id: j.id,
      contractor: j.contractor || '',
      totalMt: jobMT,
      totalAmt: jobTotal,
      mixes: mixDetails,
    };
  });

  return { mixRates, jobResults, grandTotalMt, grandTotalAmt };
}
