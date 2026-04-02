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
  fuelConsump?: number;
}

export interface JobDef {
  id: string;
  contractor?: string;
  basis: 'GEOMETRY' | 'BOQ';
  length?: number;
  width?: number;
  thickness?: number;
  volume?: number;
  /** @deprecated prime/tack are now always shown */
  prime?: boolean;
  /** @deprecated prime/tack are now always shown */
  tack?: boolean;
  mixes: { mixIdx: number; qty_mt: number | null }[];
}

export interface SiteDef {
  id: string;
  name: string;
  jobs: JobDef[];
  transLead?: number | null;
  roadLengthM?: number | null;
}

export interface ScopeGroups {
  mixing: boolean;
  transport: boolean;
  spraying: boolean;
  paving: boolean;
}

export interface ScopeState {
  groups: ScopeGroups;
  mixing: Record<string, boolean>;
  spraying: Record<string, boolean>;
  paving: Record<string, boolean>;
}

export interface CalcState {
  inputs: Record<string, string>;
  mixTypes: MixTypeDef[];
  equipDefs: EquipDef[];
  sites?: SiteDef[];
  jobs?: JobDef[];
  aggBasis?: string;
  contractRates?: Record<string, any>;
  scopeState?: ScopeState;
  scopeMarginPct?: number;
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
  exPlantPerCum: number;
  transport: number;
  transPerCum: number;
  laying: number;
  layPerCum: number;
  finalLaid: number;
  finalLaidPerCum: number;
}

export interface JobResult {
  id: string;
  contractor: string;
  siteName?: string;
  totalMt: number;
  totalCum: number;
  totalAmt: number;
  mixes: {
    mixIdx: number;
    mixName: string;
    mt: number;
    finalLaid: number;
    amt: number;
  }[];
}

export interface SiteResult {
  siteId: string;
  siteName: string;
  jobs: JobResult[];
  siteTotal: number;
  siteMt: number;
}

export interface CalcResult {
  mixRates: MixRate[];
  jobResults: JobResult[];
  siteResults?: SiteResult[];
  grandTotalMt: number;
  grandTotalAmt: number;
}

function n(inputs: Record<string, string>, key: string, def = 0): number {
  const v = parseFloat(inputs[key]);
  return isNaN(v) ? def : v;
}

/** Get all jobs from state, handling both new sites[] and legacy jobs[] format */
function getAllJobs(state: CalcState): { job: JobDef; siteName: string; siteId: string }[] {
  if (state.sites && state.sites.length > 0) {
    const result: { job: JobDef; siteName: string; siteId: string }[] = [];
    for (const site of state.sites) {
      for (const job of site.jobs) {
        result.push({ job, siteName: site.name || site.id, siteId: site.id });
      }
    }
    return result;
  }
  // Legacy flat jobs array
  return (state.jobs || []).map(job => ({ job, siteName: '', siteId: '' }));
}

function equipHireCostPerMT(eq: EquipDef, tph: number, phm: number): number {
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

function equipFuelPerMT(eq: EquipDef, hsdPrice: number, tph: number): number {
  if (!eq.enabled || eq.isLaying || tph <= 0) return 0;
  return ((eq.fuelConsump ?? 0) * hsdPrice) / tph;
}

function equipHireDailyCost(eq: EquipDef): number {
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

function equipFuelPerDay(eq: EquipDef, hsdPrice: number): number {
  if (!eq.enabled || !eq.isLaying) return 0;
  return (eq.fuelConsump ?? 0) * (eq.hireHrsDay || 8) * hsdPrice;
}

// Legacy compat: old equipDailyCost
function equipDailyCost(eq: EquipDef, hsdPrice = 0): number {
  return equipHireDailyCost(eq) + equipFuelPerDay(eq, hsdPrice);
}

export function calcMixRatesAndJobs(state: CalcState, overrides?: RevisedPrices): CalcResult {
  const { inputs, mixTypes, equipDefs, aggBasis } = state;

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

  // Plant equipment: hire + fuel per MT
  let plantEquipHirePerMT = 0;
  let plantEquipFuelPerMT = 0;
  (equipDefs || []).forEach((eq) => {
    if (!eq.isLaying) {
      plantEquipHirePerMT += equipHireCostPerMT(eq, tph, phm);
      plantEquipFuelPerMT += equipFuelPerMT(eq, hsdPrice, tph);
    }
  });
  const plantEquipPerMT = plantEquipHirePerMT + plantEquipFuelPerMT;

  // Laying equipment: daily cost (hire + fuel) → per MT
  const paverEq = (equipDefs || []).find((e) => e.id === 'paver');
  const rollerEq = (equipDefs || []).find((e) => e.id === 'roller');
  const ptrEq = (equipDefs || []).find((e) => e.id === 'ptr');
  const layCrewD = n(inputs, 'layCrew');
  const layProd = n(inputs, 'layProductivity');
  const layPaverD = paverEq ? equipDailyCost(paverEq, hsdPrice) : 0;
  const layRollerD = rollerEq ? equipDailyCost(rollerEq, hsdPrice) : 0;
  const layPtrD = ptrEq ? equipDailyCost(ptrEq, hsdPrice) : 0;
  const layTotalDaily = layPaverD + layRollerD + layPtrD + layCrewD;
  const layPerMT = layProd > 0 ? (layTotalDaily / layProd) : 0;

  const transDist = n(inputs, 'transDist');
  const transRate = n(inputs, 'transRate');
  const transPayload = n(inputs, 'transPayload');
  const transPerMT = transPayload > 0 ? (transDist * 2 * transRate / transPayload) : 0;

  const primeSpray = n(inputs, 'primeSpray');
  const primePrice_ = n(inputs, 'primePrice');
  const primeDilution = n(inputs, 'primeDilution') || 1;
  const tackSpray = n(inputs, 'tackSpray');
  const tackPrice_ = n(inputs, 'tackPrice');
  const tackDilution = n(inputs, 'tackDilution') || 1;
  const sprayBowser = n(inputs, 'sprayBowser');
  const sprayCrew = n(inputs, 'sprayCrew');
  const sprayProd = n(inputs, 'sprayProd');
  const sprayOpPerSqm = sprayProd > 0 ? ((sprayBowser + sprayCrew) / sprayProd) : 0;
  const basePrimePerSqmRaw = (primeSpray * primePrice_ / primeDilution) + sprayOpPerSqm;
  const baseTackPerSqmRaw = (tackSpray * tackPrice_ / tackDilution) + sprayOpPerSqm;
  const primePerSqm = basePrimePerSqmRaw * (1 + marginPct / 100);
  const tackPerSqm = baseTackPerSqmRaw * (1 + marginPct / 100);

  const hsdFuelTotal = plantEquipFuelPerMT;
  const fuelTotal = hsdFuelTotal + ldoPerMT + boilerProdPerMT + boilerPreheatPerMT;

  const mixRates: MixRate[] = (mixTypes || []).map((m) => {
    const aggFrac = FRAC_KEYS.reduce((s, k) => s + (m.fractions?.[k] ?? 0), 0) / 100;
    const bitFrac = m.binderPct / 100;
    const aggCostPerMT = aggFrac * aggLanded;
    const bitCostPerMT = bitFrac * 1000 * bitPrice;
    const plantSubtotal = aggCostPerMT + bitCostPerMT + plantEquipPerMT + fuelTotal + crewPerMT;
    const allCostBeforeMargin = plantSubtotal + transPerMT + layPerMT;
    const marginAmt = allCostBeforeMargin * marginPct / 100;
    const exPlant = plantSubtotal;
    const finalLaid = allCostBeforeMargin + marginAmt;
    const d = m.density;
    return {
      name: m.name,
      density: d,
      aggregate: aggCostPerMT,
      bitumen: bitCostPerMT,
      equipment: plantEquipPerMT,
      fuel: fuelTotal,
      hsd: hsdFuelTotal,
      ldo: ldoPerMT,
      crew: crewPerMT,
      margin: marginAmt,
      exPlant,
      exPlantPerCum: d > 0 ? exPlant * d : 0,
      transport: transPerMT,
      transPerCum: d > 0 ? transPerMT * d : 0,
      laying: layPerMT,
      layPerCum: d > 0 ? layPerMT * d : 0,
      finalLaid,
      finalLaidPerCum: d > 0 ? finalLaid * d : 0,
    };
  });

  let grandTotalMt = 0;
  let grandTotalAmt = 0;

  // Build flat jobResults + grouped siteResults
  const allJobEntries = getAllJobs(state);
  const siteMap = new Map<string, SiteResult>();

  const jobResults: JobResult[] = allJobEntries.map(({ job: j, siteName, siteId }) => {
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

    const primeAmt = area * primePerSqm;
    const tackAmt = area * tackPerSqm;

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

    const jobMixCostWithMargin = (jobPlant + jobTrans + jobLay) * (1 + marginPct / 100);
    const jobTotal = jobMixCostWithMargin + primeAmt + tackAmt;
    grandTotalMt += jobMT;
    grandTotalAmt += jobTotal;

    const jr: JobResult = {
      id: j.id,
      contractor: j.contractor || '',
      siteName,
      totalMt: jobMT,
      totalCum: cum,
      totalAmt: jobTotal,
      mixes: mixDetails,
    };

    // Accumulate into site map
    if (siteId) {
      if (!siteMap.has(siteId)) {
        siteMap.set(siteId, { siteId, siteName, jobs: [], siteTotal: 0, siteMt: 0 });
      }
      const sr = siteMap.get(siteId)!;
      sr.jobs.push(jr);
      sr.siteTotal += jobTotal;
      sr.siteMt += jobMT;
    }

    return jr;
  });

  const siteResults = siteMap.size > 0 ? Array.from(siteMap.values()) : undefined;

  return { mixRates, jobResults, siteResults, grandTotalMt, grandTotalAmt };
}

export interface InputDiff {
  key: string;
  label: string;
  unit: string;
  baseVal: number;
  revVal: number;
}

export const INPUT_LABELS: Record<string, { label: string; unit: string }> = {
  tph:              { label: "Plant Throughput",        unit: "MT/hr"    },
  plantHrsMonth:    { label: "Plant Hrs/Month",         unit: "hrs"      },
  aggRate:          { label: "Aggregate Rate",           unit: "₹"        },
  aggDensity:       { label: "Agg Bulk Density",         unit: "MT/CUM"   },
  aggDist:          { label: "Crusher→Plant Distance",   unit: "km"       },
  aggFreightRate:   { label: "Freight Rate",             unit: "₹/km/load"},
  aggPayload:       { label: "Freight Payload",          unit: "MT"       },
  bitPrice:         { label: "Bitumen Price",            unit: "₹/kg"     },
  hsdPrice:         { label: "Diesel (HSD) Price",       unit: "₹/L"      },
  ldoConsump:       { label: "LDO Consumption (Dryer)",  unit: "L/MT"     },
  ldoRate:          { label: "LDO Rate",                 unit: "₹/L"      },
  boilerProdLhr:    { label: "Boiler Prod Fuel",         unit: "L/hr"     },
  boilerPreheatLhr: { label: "Boiler Preheat Fuel",      unit: "L/hr"     },
  boilerFuelRate:   { label: "Boiler Fuel Rate",         unit: "₹/L"      },
  boilerProdHrs:    { label: "Boiler Prod Hrs/Cycle",    unit: "hrs"      },
  boilerPreheatHrs: { label: "Boiler Preheat Hrs/Cycle", unit: "hrs"     },
  boilerCampaignMt: { label: "Boiler Campaign MT",       unit: "MT"       },
  crewMonthly:      { label: "Plant Crew Monthly",       unit: "₹"        },
  crewDays:         { label: "Working Days/Month",       unit: "days"     },
  crewHrs:          { label: "Working Hrs/Day",          unit: "hrs"      },
  marginPct:        { label: "Margin %",                 unit: "%"        },
  layCrew:          { label: "Laying Crew/Day",          unit: "₹"        },
  layProductivity:  { label: "Laying Productivity",      unit: "MT/day"   },
  transDist:        { label: "Transport Distance",       unit: "km"       },
  transRate:        { label: "Transport Rate",           unit: "₹/km/load"},
  transPayload:     { label: "Transport Payload",        unit: "MT"       },
  primeSpray:       { label: "Prime Coat Spray Rate",    unit: "kg/sqm"   },
  primePrice:       { label: "Prime Coat Emulsion Price",unit: "₹/kg"     },
  primeDilution:    { label: "Prime Dilution Factor",    unit: "x"        },
  tackSpray:        { label: "Tack Coat Spray Rate",     unit: "kg/sqm"   },
  tackPrice:        { label: "Tack Coat Emulsion Price", unit: "₹/kg"     },
  tackDilution:     { label: "Tack Dilution Factor",     unit: "x"        },
  sprayBowser:      { label: "Bowser + Tractor",         unit: "₹/day"    },
  sprayCrew:        { label: "Spray Crew + Diesel",      unit: "₹/day"    },
  sprayProd:        { label: "Spray Productivity",       unit: "sqm/day"  },
};

export interface SiteRevenue {
  siteId: string;
  siteName: string;
  revenue: number | null;
  hasRev: boolean;
}

export interface RevenueResult {
  siteRevenues: SiteRevenue[];
  grandRevenue: number;
  hasAnyRevenue: boolean;
}

export function calcRevenue(state: CalcState, calcResult: CalcResult): RevenueResult {
  const cr = state.contractRates || {};
  let sites = state.sites || [];
  if (sites.length === 0 && state.jobs && state.jobs.length > 0) {
    sites = [{ id: 'S01', name: 'Default', jobs: state.jobs }];
  }
  const mixTypes = state.mixTypes || [];
  const siteRevenues: SiteRevenue[] = [];
  let grandRevenue = 0;
  let hasAnyRevenue = false;

  for (const s of sites) {
    if (!s.jobs.length) continue;
    const mode: string = cr[s.id + '__MODE'] || 'itemised';

    const mixQty: Record<string, { cum: number; mixIdx: number }> = {};
    let primeArea = 0, tackArea = 0, totalSiteMT = 0, totalSiteCUM = 0;

    for (const j of s.jobs) {
      const isGeo = (j.basis === 'GEOMETRY');
      let cum: number, area: number;
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

      for (const mx of (j.mixes || [])) {
        const mix = mixTypes[mx.mixIdx] || mixTypes[0];
        if (!mix) continue;
        const mt = (mx.qty_mt != null && mx.qty_mt > 0)
          ? mx.qty_mt
          : (cum > 0 && mix.density > 0 ? cum * mix.density : 0);
        const mxCum = mix.density > 0 && mt > 0 ? mt / mix.density : 0;
        if (!mixQty[mix.name]) mixQty[mix.name] = { cum: 0, mixIdx: mx.mixIdx };
        mixQty[mix.name].cum += mxCum;
        totalSiteMT += mt;
        totalSiteCUM += mxCum;
      }

      if (j.prime !== false) primeArea += area;
      if (j.tack !== false) tackArea += area * (j.mixes?.length || 1);
    }

    const totalRoadKm = ((s as any).roadLengthM || 0) / 1000;
    let revenue: number | null = null;
    let hasRev = false;

    if (mode === 'itemised') {
      const adj = Number(cr[s.id + '__ADJ_AMT']) || 0;
      const revMode = cr[s.id + '__REV_MODE'] || 'itemRates';

      if (revMode === 'scopeRate') {
        const sb = cr[s.id + '__SCOPE_BASIS'] || 'mt';
        const smt = Number(cr[s.id + '__SCOPE_MT']) || 0;
        const scm = Number(cr[s.id + '__SCOPE_CUM']) || 0;
        let sr = 0;
        if (sb === 'cum' && scm > 0 && totalSiteCUM > 0) { sr = scm * totalSiteCUM; hasRev = true; }
        else if (smt > 0 && totalSiteMT > 0) { sr = smt * totalSiteMT; hasRev = true; }
        if (hasRev || adj !== 0) { hasRev = true; revenue = sr + adj; }
      } else {
        let r = 0;
        for (const mn of Object.keys(mixQty)) {
          const mq = mixQty[mn];
          const key = s.id + '_' + mn.toUpperCase().replace(/[\s-]+/g, '_');
          const c = cr[key];
          if (c != null) { r += mq.cum * Number(c); hasRev = true; }
        }
        if (primeArea > 0) { const pc = cr[s.id + '_PRIME']; if (pc != null) { r += primeArea * Number(pc); hasRev = true; } }
        if (tackArea > 0) { const tc = cr[s.id + '_TACK']; if (tc != null) { r += tackArea * Number(tc); hasRev = true; } }
        if (hasRev) revenue = r + adj;
        if (!hasRev && adj !== 0) { hasRev = true; revenue = adj; }
      }
    } else if (mode === 'perkm') {
      const km = cr[s.id + '__KM_RATE'];
      const adjPKm = Number(cr[s.id + '__ADJ_PER_KM']) || 0;
      if (km != null && totalRoadKm > 0) {
        revenue = (Number(km) + adjPKm) * totalRoadKm;
        hasRev = true;
      } else if (adjPKm !== 0 && totalRoadKm > 0) {
        revenue = adjPKm * totalRoadKm;
        hasRev = true;
      }
    } else {
      const ls = cr[s.id + '__LUMPSUM'];
      if (ls != null) { revenue = Number(ls); hasRev = true; }
    }

    if (hasRev && revenue != null) {
      hasAnyRevenue = true;
      grandRevenue += revenue;
    }

    siteRevenues.push({ siteId: s.id, siteName: s.name || s.id, revenue, hasRev });
  }

  return { siteRevenues, grandRevenue, hasAnyRevenue };
}

export interface SiteProfitCost {
  siteId: string;
  siteName: string;
  fullCost: number;
  inScopeCost: number;
  siteMt: number;
}

export interface SiteProfitResult {
  siteCosts: SiteProfitCost[];
  grandFullCost: number;
  grandInScopeCost: number;
  grandMt: number;
}

function calcScopeComponentsTS(state: CalcState, hsdPrice: number): Record<string, number> & { ptrEnabled: boolean } {
  const { inputs, equipDefs, mixTypes } = state;
  const tph = n(inputs, 'tph');
  const phm = n(inputs, 'plantHrsMonth');
  const layProd = n(inputs, 'layProductivity');
  const ldoC = n(inputs, 'ldoConsump'), ldoR = n(inputs, 'ldoRate');
  const bProdL = n(inputs, 'boilerProdLhr'), bPreL = n(inputs, 'boilerPreheatLhr');
  const bFuelR = n(inputs, 'boilerFuelRate');
  const bProdH = n(inputs, 'boilerProdHrs'), bPreH = n(inputs, 'boilerPreheatHrs');
  const bCamp = n(inputs, 'boilerCampaignMt');
  const crewMon = n(inputs, 'crewMonthly'), crewD = n(inputs, 'crewDays'), crewH = n(inputs, 'crewHrs');
  const sprayBow = n(inputs, 'sprayBowser'), sprayCrw = n(inputs, 'sprayCrew'), sprayPr = n(inputs, 'sprayProd');
  const primeSp = n(inputs, 'primeSpray'), primeP = n(inputs, 'primePrice'), primeDil = n(inputs, 'primeDilution') || 1;
  const tackSp = n(inputs, 'tackSpray'), tackP = n(inputs, 'tackPrice'), tackDil = n(inputs, 'tackDilution') || 1;
  const layCrewD = n(inputs, 'layCrew');
  const bitPrice = n(inputs, 'bitPrice');

  const ldoPerMT = ldoC * ldoR;
  const boilerProdPMT = bCamp > 0 ? (bProdL * bFuelR * bProdH / bCamp) : 0;
  const boilerPrePMT = bCamp > 0 ? (bPreL * bFuelR * bPreH / bCamp) : 0;
  const crewPerMT = (crewD > 0 && crewH > 0 && tph > 0) ? (crewMon / crewD / crewH / tph) : 0;
  const sprayOpSqm = sprayPr > 0 ? ((sprayBow + sprayCrw) / sprayPr) : 0;
  const layCrewPerMT = layProd > 0 ? layCrewD / layProd : 0;

  const hotmixEq = (equipDefs || []).find(e => e.id === 'hotmix');
  const dgEq = (equipDefs || []).find(e => e.id === 'dg');
  const jcbEq = (equipDefs || []).find(e => e.id === 'jcb');
  const tipperEq = (equipDefs || []).find(e => e.id === 'tipper');
  const paverEq = (equipDefs || []).find(e => e.id === 'paver');
  const rollerEq = (equipDefs || []).find(e => e.id === 'roller');
  const ptrEq = (equipDefs || []).find(e => e.id === 'ptr');

  function layHirePMT(eq: EquipDef | undefined): number {
    return (eq && eq.enabled && layProd > 0) ? equipHireDailyCost(eq) / layProd : 0;
  }
  function layFuelPMT(eq: EquipDef | undefined): number {
    return (eq && eq.enabled && layProd > 0) ? equipFuelPerDay(eq, hsdPrice) / layProd : 0;
  }

  const bitCostPerMT = (mixTypes || []).length > 0
    ? (mixTypes || []).reduce((s, m) => s + m.binderPct, 0) / (mixTypes || []).length / 100 * 1000 * bitPrice
    : 0;

  const aggRateInput = n(inputs, 'aggRate');
  const aggDensity = n(inputs, 'aggDensity');
  const aggBasisTS = state.aggBasis || 'MT';
  const aggRateMT = (aggBasisTS === 'CFT' && aggDensity > 0) ? (aggRateInput / aggDensity * 35.3147) : aggRateInput;
  const aggDist = n(inputs, 'aggDist');
  const aggFreightRate = n(inputs, 'aggFreightRate');
  const aggPayload = n(inputs, 'aggPayload');
  const aggFreight = aggPayload > 0 ? (aggDist * 2 * aggFreightRate / aggPayload) : 0;
  const aggLandedTS = aggRateMT + aggFreight;
  const avgAggFracTS = (mixTypes || []).length > 0
    ? (mixTypes || []).reduce((s: number, m: any) => s + FRAC_KEYS.reduce((a: number, k) => a + ((m.fractions && m.fractions[k]) || 0), 0), 0) / (mixTypes || []).length / 100
    : 0;
  const aggCostPerMT = avgAggFracTS * aggLandedTS;

  return {
    hotmixHire: hotmixEq ? equipHireCostPerMT(hotmixEq, tph, phm) : 0,
    ldo: ldoPerMT + boilerProdPMT + boilerPrePMT,
    dgHire: dgEq ? equipHireCostPerMT(dgEq, tph, phm) : 0,
    dgHsd: dgEq ? equipFuelPerMT(dgEq, hsdPrice, tph) : 0,
    jcbHire: jcbEq ? equipHireCostPerMT(jcbEq, tph, phm) : 0,
    jcbHsd: jcbEq ? equipFuelPerMT(jcbEq, hsdPrice, tph) : 0,
    tipperHire: tipperEq ? equipHireCostPerMT(tipperEq, tph, phm) : 0,
    tipperHsd: tipperEq ? equipFuelPerMT(tipperEq, hsdPrice, tph) : 0,
    bitumen: bitCostPerMT,
    aggregate: aggCostPerMT,
    crewPerMT,
    transPerMT: 0,
    sprayOp: sprayOpSqm,
    primeEm: primeSp * primeP / primeDil,
    tackEm: tackSp * tackP / tackDil,
    paverHire: layHirePMT(paverEq),
    paverHsd: layFuelPMT(paverEq),
    rollerHire: layHirePMT(rollerEq),
    rollerHsd: layFuelPMT(rollerEq),
    ptrHire: ptrEq ? layHirePMT(ptrEq) : 0,
    ptrHsd: ptrEq ? layFuelPMT(ptrEq) : 0,
    layCrewPerMT,
    ptrEnabled: !!(ptrEq && ptrEq.enabled),
  };
}

export function calcSiteProfitCosts(state: CalcState, mixRates: MixRate[]): SiteProfitResult {
  const { inputs, mixTypes } = state;
  let sites = state.sites || [];
  if (sites.length === 0 && state.jobs && state.jobs.length > 0) {
    sites = [{ id: 'S01', name: 'Default', jobs: state.jobs }];
  }

  const gTransRate = n(inputs, 'transRate');
  const gTransPayload = n(inputs, 'transPayload');
  const gTransDist = n(inputs, 'transDist');
  const hsdPrice = n(inputs, 'hsdPrice');

  const primeSpray = n(inputs, 'primeSpray');
  const primePrice_ = n(inputs, 'primePrice');
  const primeDilution = n(inputs, 'primeDilution') || 1;
  const tackSpray = n(inputs, 'tackSpray');
  const tackPrice_ = n(inputs, 'tackPrice');
  const tackDilution = n(inputs, 'tackDilution') || 1;
  const sprayBowser = n(inputs, 'sprayBowser');
  const sprayCrew = n(inputs, 'sprayCrew');
  const sprayProd = n(inputs, 'sprayProd');
  const sprayOpPerSqm = sprayProd > 0 ? ((sprayBowser + sprayCrew) / sprayProd) : 0;
  const primePerSqm = (primeSpray * primePrice_ / primeDilution) + sprayOpPerSqm;
  const tackPerSqm = (tackSpray * tackPrice_ / tackDilution) + sprayOpPerSqm;

  const layProd = n(inputs, 'layProductivity');
  const layCrewD = n(inputs, 'layCrew');
  const paverEq = (state.equipDefs || []).find(e => e.id === 'paver');
  const rollerEq = (state.equipDefs || []).find(e => e.id === 'roller');
  const ptrEq = (state.equipDefs || []).find(e => e.id === 'ptr');
  const layPaverD = paverEq ? equipDailyCost(paverEq, hsdPrice) : 0;
  const layRollerD = rollerEq ? equipDailyCost(rollerEq, hsdPrice) : 0;
  const layPtrD = ptrEq ? equipDailyCost(ptrEq, hsdPrice) : 0;
  const layTotalDaily = layPaverD + layRollerD + layPtrD + layCrewD;
  const layPerMT = layProd > 0 ? (layTotalDaily / layProd) : 0;

  const ss = state.scopeState;
  const sg = ss?.groups;
  const scopeActive = !!(sg && (sg.mixing || sg.transport || sg.spraying || sg.paving));
  const smf = 1 + ((state.scopeMarginPct ?? 0) / 100);

  let scopeMix = 0, scopePav = 0;
  let sPrime = primePerSqm, sTack = tackPerSqm;
  let scopeBit = false;

  if (scopeActive && ss) {
    const sc = calcScopeComponentsTS(state, hsdPrice);

    function sumMixPav(): { mix: number; pav: number } {
      let mx = 0, pv = 0;
      if (sg!.mixing) {
        if (ss!.mixing.hotmixHire) mx += sc.hotmixHire;
        if (ss!.mixing.ldo) mx += sc.ldo;
        if (ss!.mixing.dgHire) mx += sc.dgHire;
        if (ss!.mixing.dgHsd) mx += sc.dgHsd;
        if (ss!.mixing.jcbHire) mx += sc.jcbHire;
        if (ss!.mixing.jcbHsd) mx += sc.jcbHsd;
        if (ss!.mixing.tipperHire) mx += sc.tipperHire;
        if (ss!.mixing.tipperHsd) mx += sc.tipperHsd;
        if (ss!.mixing.aggregate) mx += sc.aggregate;
        mx += sc.crewPerMT;
      }
      if (sg!.paving) {
        if (ss!.paving.paverHire) pv += sc.paverHire;
        if (ss!.paving.paverHsd) pv += sc.paverHsd;
        if (ss!.paving.rollerHire) pv += sc.rollerHire;
        if (ss!.paving.rollerHsd) pv += sc.rollerHsd;
        if (sc.ptrEnabled) {
          if (ss!.paving.ptrHire) pv += sc.ptrHire;
          if (ss!.paving.ptrHsd) pv += sc.ptrHsd;
        }
        pv += sc.layCrewPerMT;
      }
      return { mix: mx, pav: pv };
    }

    const base = sumMixPav();
    scopeMix = base.mix;
    scopePav = base.pav;

    if (sg!.spraying) {
      const sOp = ss.spraying.operation ? sc.sprayOp : 0;
      sPrime = (sOp + (ss.spraying.primeEmulsion ? sc.primeEm : 0)) * smf;
      sTack = (sOp + (ss.spraying.tackEmulsion ? sc.tackEm : 0)) * smf;
    } else {
      sPrime = 0;
      sTack = 0;
    }

    scopeBit = !!(sg!.mixing && ss.mixing.bitumen);
  }

  function effCPM(siteTransPerMT: number, bitCostPMT: number): number | null {
    if (!scopeActive) return null;
    return (scopeMix + (scopeBit ? (bitCostPMT || 0) : 0) + (sg!.transport ? siteTransPerMT : 0) + scopePav) * smf;
  }

  const siteCosts: SiteProfitCost[] = [];
  let grandFullCost = 0, grandInScopeCost = 0, grandMt = 0;

  for (const s of sites) {
    if (!s.jobs.length) continue;
    const siteLead = (s.transLead != null && s.transLead > 0) ? s.transLead : gTransDist;
    const siteTransPerMT = gTransPayload > 0 ? (siteLead * 2 * gTransRate / gTransPayload) : 0;

    const mixQty: Record<string, { cum: number; mixIdx: number }> = {};
    let primeArea = 0, tackArea = 0, totalSiteMT = 0;

    for (const j of s.jobs) {
      const isGeo = j.basis === 'GEOMETRY';
      let cum: number, area: number;
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

      for (const mx of (j.mixes || [])) {
        const mix = (mixTypes || [])[mx.mixIdx] || (mixTypes || [])[0];
        if (!mix) continue;
        const mt = (mx.qty_mt != null && mx.qty_mt > 0)
          ? mx.qty_mt
          : (cum > 0 && mix.density > 0 ? cum * mix.density : 0);
        const mxCum = mix.density > 0 && mt > 0 ? mt / mix.density : 0;
        if (!mixQty[mix.name]) mixQty[mix.name] = { cum: 0, mixIdx: mx.mixIdx };
        mixQty[mix.name].cum += mxCum;
        totalSiteMT += mt;
      }

      if (j.prime !== false) primeArea += area;
      if (j.tack !== false) tackArea += area * (j.mixes?.length || 1);
    }

    const fullCoatCost = primeArea * primePerSqm + tackArea * tackPerSqm;
    let fullCost = fullCoatCost;
    Object.keys(mixQty).forEach(mn => {
      const mq = mixQty[mn];
      const mr = mixRates[mq.mixIdx] || mixRates[0];
      if (!mr) return;
      const mix = (mixTypes || [])[mq.mixIdx] || (mixTypes || [])[0];
      const vol = mq.cum * mix.density;
      fullCost += vol * (mr.exPlant + siteTransPerMT + layPerMT);
    });

    const inScopeCoatCost = primeArea * (scopeActive ? sPrime : primePerSqm) + tackArea * (scopeActive ? sTack : tackPerSqm);
    let inScopeCost = inScopeCoatCost;
    Object.keys(mixQty).forEach(mn => {
      const mq = mixQty[mn];
      const mr = mixRates[mq.mixIdx] || mixRates[0];
      if (!mr) return;
      const mix = (mixTypes || [])[mq.mixIdx] || (mixTypes || [])[0];
      const ec = effCPM(siteTransPerMT, mr.bitumen);
      inScopeCost += mq.cum * (ec != null ? ec : (mr.exPlant + siteTransPerMT + layPerMT)) * mix.density;
    });

    siteCosts.push({
      siteId: s.id,
      siteName: s.name || s.id,
      fullCost,
      inScopeCost,
      siteMt: totalSiteMT,
    });
    grandFullCost += fullCost;
    grandInScopeCost += inScopeCost;
    grandMt += totalSiteMT;
  }

  return { siteCosts, grandFullCost, grandInScopeCost, grandMt };
}

export function diffCalcInputs(base: CalcState, revised: CalcState): InputDiff[] {
  const diffs: InputDiff[] = [];
  for (const [key, meta] of Object.entries(INPUT_LABELS)) {
    const bv = parseFloat(base.inputs?.[key] ?? '0') || 0;
    const rv = parseFloat(revised.inputs?.[key] ?? '0') || 0;
    if (Math.abs(bv - rv) > 0.0001) {
      diffs.push({ key, label: meta.label, unit: meta.unit, baseVal: bv, revVal: rv });
    }
  }
  // Also diff equipDef fuelConsump values
  (base.equipDefs || []).forEach((beq, i) => {
    const req = (revised.equipDefs || [])[i];
    if (!req) return;
    const bfc = beq.fuelConsump ?? 0;
    const rfc = req.fuelConsump ?? 0;
    if (Math.abs(bfc - rfc) > 0.001) {
      diffs.push({
        key: `eq_fuel_${beq.id}`,
        label: `${beq.name} Fuel Consumption`,
        unit: 'L/hr',
        baseVal: bfc,
        revVal: rfc,
      });
    }
    const bhr = beq.hireRate ?? 0;
    const rhr = req.hireRate ?? 0;
    if (Math.abs(bhr - rhr) > 0.001) {
      diffs.push({
        key: `eq_hire_${beq.id}`,
        label: `${beq.name} Hire Rate`,
        unit: '₹',
        baseVal: bhr,
        revVal: rhr,
      });
    }
  });
  return diffs;
}
