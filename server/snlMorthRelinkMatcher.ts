export type MorthRelinkCandidate = {
  code: string;
  title: string;
  description?: string;
  unit: string;
  sector?: string | null;
};

export type MorthRelinkMatch = {
  candidate: MorthRelinkCandidate;
  reason: string;
  canApply: boolean;
  blockedReason: string | null;
};

type MatchRule = {
  phrase: string;
  matches: (title: string) => boolean;
  qualifier?: (source: string, title: string) => boolean;
  ambiguousReason?: string;
};

const clean = (value: string) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const hasPhrase = (value: string, phrase: string) => {
  const source = ` ${clean(value)} `;
  const target = ` ${clean(phrase)} `;
  return source.includes(target);
};

export function sameNormUnit(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (value: string | null | undefined) => {
    const key = clean(String(value ?? "")).replace(/\s/g, "");
    const aliases: Record<string, string> = {
      sqm: "sqm", sqmtr: "sqm", m2: "sqm", squaremeter: "sqm", squaremetre: "sqm",
      cum: "cum", cbm: "cum", m3: "cum", cubicmeter: "cum", cubicmetre: "cum",
      metre: "m", meter: "m", meters: "m", metres: "m", m: "m",
      hectare: "ha", hectares: "ha", hect: "ha", ha: "ha",
      tonne: "mt", tonnes: "mt", ton: "mt", tons: "mt", mt: "mt",
    };
    return aliases[key] ?? key;
  };
  return norm(a) === norm(b);
}

function resolveRule(description: string): MatchRule | null {
  const source = clean(description);

  if (/\btack\s+coat\b/.test(source)) return {
    phrase: "tack coat",
    matches: title => hasPhrase(title, "tack coat"),
  };
  if (/\bprime(?:r)?\s+coat\b|\bpriming\b/.test(source)) return {
    phrase: "prime coat",
    matches: title => hasPhrase(title, "prime coat"),
  };
  if (/\bclear(?:ing)?\b/.test(source) && /\bgrub(?:bing)?\b/.test(source)) return {
    phrase: "clearing and grubbing",
    matches: title => hasPhrase(title, "clearing and grubbing"),
  };
  if (/\bscarif\w*\b/.test(source)) {
    const surface = /\bbituminous\b/.test(source)
      ? "bituminous"
      : /\bgranular\b/.test(source)
        ? "granular"
        : null;
    return {
      phrase: surface ? `scarifying existing ${surface} surface` : "scarifying existing surface",
      matches: title =>
        hasPhrase(title, "scarifying existing") &&
        (!surface || hasPhrase(title, surface)),
    };
  }
  if (/\bwet\s+mix\s+macadam\b|\bwmm\b/.test(source)) return {
    phrase: "wet mix macadam",
    matches: title => hasPhrase(title, "wet mix macadam"),
  };
  if (/\bgranular\s+sub\s*base\b|\bgsb\b/.test(source)) return {
    phrase: "granular sub-base",
    matches: title => hasPhrase(title, "granular sub base") || hasPhrase(title, "granular subbase"),
  };
  if (/\bdense\s+graded\s+bituminous\s+macadam\b|\bdgbm\b|\bdbm\b/.test(source)) return {
    phrase: "dense graded bituminous macadam",
    matches: title => hasPhrase(title, "dense graded bituminous macadam"),
  };
  if (/\bbituminous\s+concrete\b|\bbc\b/.test(source)) return {
    phrase: "bituminous concrete",
    matches: title =>
      hasPhrase(title, "bituminous concrete") &&
      !hasPhrase(title, "semi dense bituminous concrete") &&
      !hasPhrase(title, "filling pot holes") &&
      !hasPhrase(title, "filling pot holes and patch repairs"),
  };
  if (/\bearthen\s+shoulder\b/.test(source)) return {
    phrase: "earthen shoulders",
    matches: title => hasPhrase(title, "earthen shoulders"),
  };
  if (/\bembankment\b/.test(source)) return {
    phrase: "construction of embankment",
    matches: title => hasPhrase(title, "construction of embankment"),
    qualifier: (sourceText, title) => {
      if (/borrow\s*pits?/.test(sourceText)) return /borrow\s*pits?/.test(clean(title));
      if (/roadway\s+cutting|cutting\s+from\s+roadway/.test(sourceText)) {
        return hasPhrase(title, "roadway cutting");
      }
      return true;
    },
    ambiguousReason: "The workbook separates embankment material from borrow pits (3.16) and roadway cutting (3.17); the BOQ does not identify the source.",
  };

  const concreteMix = source.match(/\b1\s*3\s*6\b/);
  if (concreteMix && /\bpcc\b|\bplain\s+cement\s+concrete\b/.test(source)) return {
    phrase: "PCC 1:3:6",
    matches: title => hasPhrase(title, "pcc 1 3 6"),
  };

  const pipeClass = source.match(/\bnp\s*([34])\b/)?.[1];
  const pipeDiameter = source.match(/\b(\d{3,4})\s*mm\b/)?.[1];
  if (pipeClass && pipeDiameter && /\bpipe\b/.test(source)) return {
    phrase: `NP${pipeClass} ${pipeDiameter} mm pipe`,
    matches: title => {
      const normalizedTitle = clean(title);
      const titleClass = normalizedTitle.match(/\bnp\s*([34])\b/)?.[1];
      const titleDiameter = normalizedTitle.match(/\b(\d{3,4})\s*mm\b/)?.[1];
      return titleClass === pipeClass && titleDiameter === pipeDiameter &&
        /\bpipe\b/.test(normalizedTitle);
    },
    qualifier: (sourceText, title) => {
      const sourceMode = /\bdouble\s+row\b/.test(sourceText)
        ? "double"
        : /\bsingle\s+row\b/.test(sourceText)
          ? "single"
          : null;
      if (!sourceMode) return true;
      return hasPhrase(title, `${sourceMode} row`);
    },
    ambiguousReason: `The workbook has both single-row and double-row NP${pipeClass} ${pipeDiameter} mm entries, but the BOQ description does not specify the row arrangement.`,
  };

  // A grade alone does not identify where or how M15 concrete is used.
  if (/\bm\s*15\b/.test(source) && /\bconcrete\b|\bpcc\b/.test(source)) return {
    phrase: "M15 concrete",
    matches: title => hasPhrase(title, "m15") && /\b(?:pcc|concrete)\b/.test(clean(title)),
    qualifier: (sourceText, title) => {
      const contextTerms = ["foundation", "substructure", "well foundation", "approach slab", "levelling course"];
      const stated = contextTerms.filter(term => hasPhrase(sourceText, term));
      return stated.length > 0 && stated.every(term => hasPhrase(title, term));
    },
    ambiguousReason: "The BOQ says M15 concrete but does not state the application needed to distinguish the workbook entries.",
  };
  return null;
}

function rootCode(code: string) {
  return code.trim().match(/^(\d+(?:\.\d+)?)(?:-[A-Za-z].*)?$/)?.[1] ?? code.trim();
}

export function matchMorthRelinkCandidate(
  description: string,
  boqUnit: string,
  candidates: MorthRelinkCandidate[],
  projectSector?: string | null,
): MorthRelinkMatch | null {
  const rule = resolveRule(description);
  if (!rule) return null;
  const source = clean(description);
  let matches = candidates.filter(candidate => {
    const title = candidate.title;
    return rule.matches(title) &&
      (!rule.qualifier || rule.qualifier(source, title));
  });

  if (!matches.length) return null;
  if (matches.length > 1) {
    // When the BOQ does not specify a workbook sub-item's distinguishing detail,
    // prefer a single parent entry only if that parent itself is an exact title match.
    const parents = matches.filter(candidate => rootCode(candidate.code) === candidate.code);
    if (parents.length === 1 && matches.every(candidate => rootCode(candidate.code) === parents[0].code)) {
      matches = parents;
    }
  }
  if (matches.length > 1 && projectSector) {
    const sector = clean(projectSector);
    const sectorMatches = matches.filter(candidate => clean(candidate.sector ?? "") === sector);
    if (sectorMatches.length === 1) matches = sectorMatches;
  }
  if (matches.length !== 1) return null;

  const candidate = matches[0];
  const canApply = sameNormUnit(boqUnit, candidate.unit);
  const blockedReason = canApply ? null : `Unit differs: BOQ ${boqUnit || "not set"}; MoRTH ${candidate.unit}.`;
  const clause = source.match(/\bclause\s*(?:no\.?\s*)?(\d{3})\b/)?.[1];
  const reason = `BOQ words “${rule.phrase}” match the MoRTH workbook title${clause ? `; clause ${clause} is supporting context` : ""}.` +
    (blockedReason ? ` ${blockedReason} Apply is disabled.` : "");
  return { candidate, reason, canApply, blockedReason };
}

export function explainMorthRelinkNoMatch(description: string, candidates: MorthRelinkCandidate[]) {
  const rule = resolveRule(description);
  if (!rule) return "No exact MoRTH work phrase was identified in the BOQ description.";
  const source = clean(description);
  const matches = candidates.filter(candidate =>
    rule.matches(candidate.title) &&
    (!rule.qualifier || rule.qualifier(source, candidate.title)),
  );
  if (rule.ambiguousReason && !matches.length) return rule.ambiguousReason;
  if (matches.length > 1) {
    return rule.ambiguousReason ??
      `The BOQ words match more than one workbook title (${matches.map(row => row.code).join(", ")}); no code was guessed.`;
  }
  return `No single MoRTH workbook title matches “${rule.phrase}” and the stated details.`;
}
