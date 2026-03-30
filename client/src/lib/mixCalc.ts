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
}

export interface CalcState {
  inputs: Record<string, string>;
  mixTypes: MixTypeDef[];
  equipDefs: EquipDef[];
  /** New format: sites array with nested jobs */
  sites?: SiteDef[];
  /** Legacy format: flat jobs array */
  jobs?: JobDef[];
  aggBasis?: string;
  contractRates?: Record<string, any>;
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
  const primePerSqm = (primeSpray * primePrice_ / primeDilution) + sprayOpPerSqm;
  const tackPerSqm = (tackSpray * tackPrice_ / tackDilution) + sprayOpPerSqm;

  const hsdFuelTotal = plantEquipFuelPerMT;
  const fuelTotal = hsdFuelTotal + ldoPerMT + boilerProdPerMT + boilerPreheatPerMT;

  const mixRates: MixRate[] = (mixTypes || []).map((m) => {
    const aggFrac = FRAC_KEYS.reduce((s, k) => s + (m.fractions?.[k] ?? 0), 0) / 100;
    const bitFrac = m.binderPct / 100;
    const aggCostPerMT = aggFrac * aggLanded;
    const bitCostPerMT = bitFrac * 1000 * bitPrice;
    const plantSubtotal = aggCostPerMT + bitCostPerMT + plantEquipPerMT + fuelTotal + crewPerMT;
    const marginAmt = plantSubtotal * marginPct / 100;
    const exPlant = plantSubtotal + marginAmt;
    const finalLaid = exPlant + transPerMT + layPerMT;
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

    const jobTotal = jobPlant + jobTrans + jobLay + primeAmt + tackAmt;
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
