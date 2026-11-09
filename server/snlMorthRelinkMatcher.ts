export type MorthRelinkCandidate = {
  code: string;
  title: string;
  description?: string;
  unit: string;
  specClause?: string | null;
  sector?: string | null;
};

export type MorthRelinkMatch = {
  candidate: MorthRelinkCandidate;
  reason: string;
  canApply: boolean;
  blockedReason: string | null;
  normUnitsPerBoqUnit: number | null;
};

export type MorthRelinkCandidateMatch = MorthRelinkMatch;

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
  return getMorthUnitConversion(a, b) !== null;
}

function normalizeUnit(value: string | null | undefined): string {
  const key = clean(String(value ?? "")).replace(/\s/g, "");
  const aliases: Record<string, string> = {
    sqm: "sqm", sqmtr: "sqm", m2: "sqm", squaremeter: "sqm", squaremetre: "sqm",
    cum: "cum", cbm: "cum", m3: "cum", cubicmeter: "cum", cubicmetre: "cum",
    metre: "m", meter: "m", meters: "m", metres: "m", runningmeter: "m", runningmetre: "m", rmt: "m", rm: "m", m: "m",
    hectare: "ha", hectares: "ha", hect: "ha", ha: "ha",
    tonne: "mt", tonnes: "mt", ton: "mt", tons: "mt", mt: "mt",
    nos: "nos", number: "nos", numbers: "nos", each: "nos", no: "nos",
  };
  return aliases[key] ?? key;
}

/**
 * Converts one BOQ unit into the number of MoRTH norm units it represents.
 * E.g. 1 sqm = 0.0001 hectare, so per-hectare resource quantities are scaled
 * by 0.0001 when copied into a per-sqm BOQ recipe.
 */
export function getMorthUnitConversion(
  boqUnit: string | null | undefined,
  normUnit: string | null | undefined,
): { normUnitsPerBoqUnit: number; note: string | null } | null {
  const boq = normalizeUnit(boqUnit);
  const norm = normalizeUnit(normUnit);
  if (boq === norm) return { normUnitsPerBoqUnit: 1, note: null };
  if (boq === "sqm" && norm === "ha") {
    return { normUnitsPerBoqUnit: 0.0001, note: "1 hectare = 10,000 sqm" };
  }
  if (boq === "ha" && norm === "sqm") {
    return { normUnitsPerBoqUnit: 10_000, note: "1 hectare = 10,000 sqm" };
  }
  return null;
}

function resolveRule(description: string): MatchRule | null {
  const source = clean(description);

  if (/\bgirth\b/.test(source) && description.trim().length <= 90 && !/\b(?:clearing|grubbing)\b/.test(source)) {
    const sourceWithoutReferences = description.replace(/\b(?:clause|specification|morth)\b[^.;,]*/gi, " ");
    const sourceSizes = sourceWithoutReferences.match(/\d{2,4}/g) ?? [];
    return {
      phrase: "tree girth range",
      matches: title => {
        if (!hasPhrase(clean(title), "girth")) return false;
        const titleSizes = title.match(/\d{2,4}/g) ?? [];
        return sourceSizes.length === 0 || sourceSizes.every(size => titleSizes.includes(size));
      },
      ambiguousReason: "The workbook separates tree cutting by girth range; choose the matching range.",
    };
  }

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
    qualifier: (sourceText, title) => {
      if (/\bmanual(?:ly)?\b/.test(sourceText) && !hasPhrase(title, "by manual means")) return false;
      if (/\bmechanical(?:ly)?\b/.test(sourceText) && !hasPhrase(title, "by mechanical means")) return false;
      if (/\blight jungle\b/.test(sourceText) && !hasPhrase(title, "light jungle")) return false;
      if (/\bthorny jungle\b/.test(sourceText) && !hasPhrase(title, "thorny jungle")) return false;
      return true;
    },
    ambiguousReason: "The workbook separates manual/mechanical work in light/thorny jungle. The BOQ does not specify which of the four cases applies.",
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

const MATCH_STOP_WORDS = new Set([
  "a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "is", "it", "of", "on",
  "or", "per", "the", "to", "with", "work", "works", "item", "construction", "constructing",
  "providing", "provided", "supply", "laying", "including", "complete", "completeing", "road",
  "roads", "asphalt", "description", "quantity", "qty", "sl", "no", "i", "ii", "iii", "iv",
  "v", "vi", "size", "girth", "above", "below", "upto", "up", "mm", "cm", "nominal", "more", "than",
  "disposal", "resulting", "material", "materials", "salvaging", "useful", "stacking",
  "unserviceable", "serviceable", "technical", "specification", "specifications", "clause",
  "lead", "lift", "all",
]);

function workTerms(value: string): Set<string> {
  let text = clean(value)
    .replace(/\bm\s*15\b/g, "m15")
    .replace(/\bnp\s*([34])\b/g, "np$1")
    .replace(/\b1\s*[:/]\s*3\s*[:/]\s*6\b/g, "mix136")
    .replace(/\bclause(?:\s+no)?\s*\d+(?:\.\d+)*\b/g, " ")
    .replace(/\bspec(?:ification)?\s+clause\s*\d+(?:\.\d+)*\b/g, " ");
  const aliases: Array<[RegExp, string]> = [
    [/\bwmm\b/, "wet mix macadam"],
    [/\bgsb\b/, "granular sub base"],
    [/\b(?:dgbm|dbm)\b/, "dense graded bituminous macadam"],
    [/\bbc\b/, "bituminous concrete"],
    [/\bpcc\b/, "plain cement concrete"],
    [/\bearth\s+shoulders?\b/, "earthen shoulders"],
    [/\bprime(?:r)?\s+coat\b/, "prime coat"],
    [/\btack\s+coat\b/, "tack coat"],
    [/\bclear(?:ing)?\s+and\s+grub(?:bing)?\b/, "clearing grubbing"],
    [/\bwet\s+mix\s+macadam\b/, "wet mix macadam"],
    [/\bgranular\s+sub\s*base\b/, "granular sub base"],
    [/\bdense\s+graded\s+bituminous\s+macadam\b/, "dense graded bituminous macadam"],
    [/\bbituminous\s+concrete\b/, "bituminous concrete"],
  ];
  for (const [pattern, expanded] of aliases) {
    if (pattern.test(text)) text += ` ${expanded}`;
  }
  return new Set(text.split(/\s+/).filter(token =>
    token && !MATCH_STOP_WORDS.has(token) && !/^\d+$/.test(token),
  ));
}

function extractClause(description: string): string | null {
  const match = clean(description).match(/\b(?:morth\s+)?(?:spec(?:ification)?\s+)?clause(?:\s+no)?\s*(\d+(?:\.\d+)*)\b/);
  return match?.[1] ?? null;
}

function clauseMatches(candidateClause: string | null | undefined, clause: string): boolean {
  if (!candidateClause) return false;
  return candidateClause
    .toLowerCase()
    .split(/\s*(?:&|,|\/|and)\s*/)
    .some(value => value.trim() === clause);
}

function specificityFilter(source: string, input: MorthRelinkCandidate[]): MorthRelinkCandidate[] {
  let matches = input;
  const normalized = clean(source);

  if (/\bclear(?:ing)?\b/.test(normalized) && /\bgrub(?:bing)?\b/.test(normalized)) {
    if (/\bmanual(?:ly)?\b/.test(normalized)) matches = matches.filter(row => hasPhrase(row.title, "by manual means"));
    if (/\bmechanical(?:ly)?\b/.test(normalized)) matches = matches.filter(row => hasPhrase(row.title, "by mechanical means"));
    if (/\blight jungle\b/.test(normalized)) matches = matches.filter(row => hasPhrase(row.title, "light jungle"));
    if (/\bthorny jungle\b/.test(normalized)) matches = matches.filter(row => hasPhrase(row.title, "thorny jungle"));
  }

  const grade = normalized.match(/\bgrading\s*(i{1,3}|1|2|3)\b/);
  if (grade) {
    const roman = grade[1].startsWith("i") ? grade[1] : ["", "i", "ii", "iii"][Number(grade[1])];
    const gradeMatches = matches.filter(row =>
      row.code.toLowerCase().endsWith(`-${roman}`) ||
      new RegExp(`\\bgrading\\s*${roman}\\b`, "i").test(row.title),
    );
    if (gradeMatches.length) matches = gradeMatches;
  } else {
    const childRoots = new Set(matches.filter(row => rootCode(row.code) !== row.code).map(row => rootCode(row.code)));
    if (childRoots.size) {
      matches = matches.filter(row => childRoots.has(rootCode(row.code)) && rootCode(row.code) !== row.code);
    }
  }

  if (/\bsand\b/.test(normalized) && /\b(?:pavers?|paving|pavement|footpath)\b/.test(normalized)) {
    const related = matches.filter(row =>
      /paver|paving|pavement|footpath|sub.?base|granular/i.test(`${row.title} ${row.description ?? ""}`) &&
      !/^12\.3(?:-|$)/i.test(row.code) &&
      !/\bfoundation\b/i.test(row.title),
    );
    if (related.length) matches = related;
    else matches = matches.filter(row =>
      !/^12\.3(?:-|$)/i.test(row.code) &&
      !/\bfoundation\b/i.test(row.title),
    );
  }

  const pipe = normalized.match(/\bnp\s*([34])\b/);
  if (pipe && /\bpipe\b/.test(normalized)) {
    const pipeRows = matches.filter(row => new RegExp(`\\bnp\\s*${pipe[1]}\\b`, "i").test(`${row.title} ${row.description ?? ""}`));
    if (pipeRows.length) matches = pipeRows;
    if (/\bsingle\s+row\b/.test(normalized)) matches = matches.filter(row => hasPhrase(row.title, "single row"));
    if (/\bdouble\s+row\b/.test(normalized)) matches = matches.filter(row => hasPhrase(row.title, "double row"));
  }

  if (/\bm\s*15\b/.test(normalized) && /\b(?:pcc|concrete)\b/.test(normalized)) {
    const contextTerms = ["well foundation", "foundation", "substructure", "approach slab", "levelling course"];
    const stated = contextTerms.filter(term => hasPhrase(normalized, term));
    const relevant = matches.filter(row => /\bm\s*15\b/i.test(`${row.title} ${row.description ?? ""}`));
    if (stated.length) {
      const contextual = relevant.filter(row => stated.every(term => hasPhrase(`${row.title} ${row.description ?? ""}`, term)));
      if (contextual.length) matches = contextual;
    } else if (relevant.length) {
      matches = relevant;
    }
  }

  return matches;
}

function genericRank(source: string, candidates: MorthRelinkCandidate[]): Array<{ candidate: MorthRelinkCandidate; score: number }> {
  const sourceTerms = workTerms(source);
  if (!sourceTerms.size) return [];
  return candidates.map(candidate => {
    const titleTerms = workTerms(candidate.title);
    const descriptionTerms = workTerms(candidate.description ?? "");
    const matchedTitleTerms = Array.from(sourceTerms).filter(term => titleTerms.has(term));
    const matchedDescriptionTerms = Array.from(sourceTerms).filter(term => descriptionTerms.has(term));
    const titleOverlap = matchedTitleTerms.length;
    const descriptionOverlap = matchedDescriptionTerms.length;
    const titleCoverage = titleOverlap / sourceTerms.size;
    const descriptionCoverage = descriptionOverlap / sourceTerms.size;
    const titlePrecision = titleTerms.size ? titleOverlap / titleTerms.size : 0;
    return {
      candidate,
      score: titleCoverage * 0.62 + descriptionCoverage * 0.23 + titlePrecision * 0.15,
      matchedTerms: new Set([...matchedTitleTerms, ...matchedDescriptionTerms]).size,
    };
  }).filter(entry =>
    entry.score >= 0.12 &&
    entry.matchedTerms >= Math.min(2, sourceTerms.size),
  )
    .sort((a, b) => b.score - a.score || a.candidate.code.localeCompare(b.candidate.code));
}

function explainSpecificity(source: string, matches: MorthRelinkCandidate[], rule: MatchRule | null): string | null {
  if (matches.length < 2) return null;
  if (rule?.ambiguousReason && !/\b(?:manual|mechanical|light jungle|thorny jungle|grading\s*(?:i|ii|1|2)|single row|double row|borrow pit|roadway cutting)\b/i.test(source)) {
    return rule.ambiguousReason;
  }
  if (/\bclear(?:ing)?\b/i.test(source) && /\bgrub(?:bing)?\b/i.test(source)) {
    return "The workbook separates manual and mechanical work in light and thorny jungle; choose the matching case.";
  }
  return `The BOQ wording matches ${matches.length} MoRTH workbook choices; no sub-item was guessed.`;
}

export function matchMorthRelinkCandidate(
  description: string,
  boqUnit: string,
  candidates: MorthRelinkCandidate[],
  projectSector?: string | null,
): MorthRelinkMatch | null {
  const matches = matchMorthRelinkCandidates(description, boqUnit, candidates, projectSector);
  return matches.length === 1 ? matches[0] : null;
}

export function matchMorthRelinkCandidates(
  description: string,
  boqUnit: string,
  candidates: MorthRelinkCandidate[],
  projectSector?: string | null,
): MorthRelinkCandidateMatch[] {
  const rule = resolveRule(description);
  const source = clean(description);
  const clause = extractClause(description);
  const clauseCandidates = clause
    ? candidates.filter(candidate => clauseMatches(candidate.specClause, clause))
    : [];
  const isPaverSand = /\bsand\b/i.test(description) && /\b(?:pavers?|paving|pavement|footpath)\b/i.test(description);
  if (isPaverSand) {
    const closest = candidates.filter(candidate => candidate.code === "7.3" || candidate.code === "14.18-iv");
    return closest.map(candidate => {
      const conversion = getMorthUnitConversion(boqUnit, candidate.unit);
      const blockedReason = !boqUnit.trim()
        ? "Unit missing in BOQ"
        : conversion ? null : `Unit differs: BOQ ${boqUnit}; MoRTH ${candidate.unit}.`;
      const reason = candidate.code === "7.3"
        ? "Closest paving-related title, but it is paving fabric beneath an overlay, not sand bedding. Foundation item 12.3 is excluded."
        : "Closest sand-related title, but it is coarse sand in a joint filler, not paver bedding. Foundation item 12.3 is excluded.";
      return {
        candidate,
        reason: `${reason}${conversion?.note ? ` Unit conversion: ${conversion.note}.` : ""}${blockedReason ? ` ${blockedReason}. Apply is disabled.` : ""}`,
        canApply: conversion !== null,
        blockedReason,
        normUnitsPerBoqUnit: conversion?.normUnitsPerBoqUnit ?? null,
      };
    });
  }
  const wordingCandidates = isPaverSand
    ? candidates.filter(candidate => !/^12\.3(?:-|$)/i.test(candidate.code) && !/\bfoundation\b/i.test(candidate.title))
    : candidates;
  const searchCandidates = clauseCandidates.length ? clauseCandidates : wordingCandidates;
  let matches = rule
    ? searchCandidates.filter(candidate =>
      rule.matches(candidate.title) &&
      (!rule.qualifier || rule.qualifier(source, candidate.title)),
    )
    : [];
  if (rule?.phrase === "M15 concrete" && matches.length === 0) {
    const statedContext = ["foundation", "substructure", "well foundation", "approach slab", "levelling course"]
      .some(term => hasPhrase(source, term));
    if (!statedContext) {
      const representativeCodes = new Set(["12.8-A", "12.11-I", "13.5-A"]);
      const representatives = searchCandidates.filter(candidate => representativeCodes.has(candidate.code));
      matches = representatives.length
        ? representatives
        : searchCandidates.filter(candidate =>
          /\bm\s*15\b/i.test(`${candidate.title} ${candidate.description ?? ""}`) &&
          /\b(?:pcc|concrete)\b/i.test(`${candidate.title} ${candidate.description ?? ""}`),
        );
    }
  }
  let genericCandidates: MorthRelinkCandidate[] = [];
  if (!matches.length) {
    let ranked = genericRank(description, searchCandidates);
    if (!ranked.length && clauseCandidates.length) {
      ranked = genericRank(description, wordingCandidates);
    }
    if (ranked.length) {
      const topScore = ranked[0].score;
      genericCandidates = ranked
        .filter(entry => entry.score >= Math.max(0.12, topScore * 0.55))
        .slice(0, 3)
        .map(entry => entry.candidate);
      matches = genericCandidates;
    }
  }
  if (!matches.length) return [];
  matches = specificityFilter(description, matches);
  if (!matches.length && clauseCandidates.length) {
    const ranked = genericRank(description, clauseCandidates);
    matches = ranked.slice(0, 3).map(entry => entry.candidate);
  }
  if (!matches.length) return [];
  if (matches.length > 1 && projectSector) {
    const sector = clean(projectSector);
    const sectorMatches = matches.filter(candidate => clean(candidate.sector ?? "") === sector);
    if (sectorMatches.length === 1) matches = sectorMatches;
  }
  const isUnspecifiedClearing = /\bclear(?:ing)?\b/i.test(description) &&
    /\bgrub(?:bing)?\b/i.test(description) &&
    !/\b(?:manual|mechanical|light jungle|thorny jungle)\b/i.test(description);
  if (matches.length > 3 && !isUnspecifiedClearing) {
    const rankedCodes = new Map(genericRank(description, matches).map(entry => [entry.candidate.code, entry.score]));
    matches = [...matches]
      .sort((a, b) => (rankedCodes.get(b.code) ?? 0) - (rankedCodes.get(a.code) ?? 0) || a.code.localeCompare(b.code))
      .slice(0, 3);
  }
  const specificityReason = explainSpecificity(description, matches, rule);
  return matches.map(candidate => {
    const conversion = getMorthUnitConversion(boqUnit, candidate.unit);
    const canApply = conversion !== null;
    const blockedReason = !boqUnit.trim()
      ? "Unit missing in BOQ"
      : canApply
        ? null
        : `Unit differs: BOQ ${boqUnit}; MoRTH ${candidate.unit}.`;
    const matchedWords = Array.from(workTerms(description)).filter(term =>
      workTerms(candidate.title).has(term),
    ).slice(0, 5);
    const matchReason = clause && clauseMatches(candidate.specClause, clause)
      ? `Spec clause ${clause} matches the MoRTH workbook reference${matchedWords.length ? `; BOQ words ${matchedWords.join(", ")} support the title` : ""}.`
      : `BOQ wording ${matchedWords.length ? `(${matchedWords.join(", ")}) ` : ""}matches the MoRTH workbook title.`;
    const reason = matchReason +
      (specificityReason ? ` ${specificityReason}` : "") +
      (conversion?.note ? ` Unit conversion: ${conversion.note}.` : "") +
      (blockedReason ? ` ${blockedReason}. Apply is disabled.` : "");
    return {
      candidate,
      reason,
      canApply,
      blockedReason,
      normUnitsPerBoqUnit: conversion?.normUnitsPerBoqUnit ?? null,
    };
  });
}

export function explainMorthRelinkNoMatch(description: string, candidates: MorthRelinkCandidate[]) {
  const rule = resolveRule(description);
  if (rule?.ambiguousReason) return rule.ambiguousReason;
  if (/\bsand\b/i.test(description) && /\b(?:pavers?|paving|pavement|footpath)\b/i.test(description)) {
    return "No paver-related sand item is a close match; the foundation sand item 12.3 is excluded.";
  }
  const related = genericRank(description, candidates).slice(0, 3).map(entry => entry.candidate.code);
  if (related.length) return `Closest MoRTH workbook choices: ${related.join(", ")}; no code was guessed.`;
  return "No related MoRTH workbook title matches the BOQ wording.";
}
