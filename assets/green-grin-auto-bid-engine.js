(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GreenGrinAutoBid = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const DEFAULT_CONFIG = Object.freeze({
    targetGrossMargin: 0.42,
    floorGrossMargin: 0.3,
    premiumGrossMargin: 0.5,
    overheadPercent: 12,
    defaultRiskPercent: 5,
    minimumProjectPrice: 350,
    defaultCrewSize: 2,
    setupCrewHours: 0.75,
    cleanupCrewHours: 1,
    difficulty: { easy: 1.15, normal: 1, difficult: 0.8, extreme: 0.6 },
    crewEfficiency: { 1: 1, 2: 1.75, 3: 2.35, 4: 2.85 },
    productionRates: {
      rock: { unit: "cubic yard", perCrewHour: 2.5, confidence: "starter" },
      mulch: { unit: "cubic yard", perCrewHour: 4, confidence: "starter" },
      fabric: { unit: "sq ft", perCrewHour: 900, confidence: "starter" },
      sod: { unit: "sq ft", perCrewHour: 450, confidence: "starter" },
      edging: { unit: "linear ft", perCrewHour: 100, confidence: "starter" },
      irrigation: { unit: "linear ft", perCrewHour: 35, confidence: "starter" },
      retaining: { unit: "wall sq ft", perCrewHour: 12, confidence: "starter" },
      demo: { unit: "sq ft", perCrewHour: 250, confidence: "starter" },
      cleanup: { unit: "acre", perCrewHour: 0.12, confidence: "starter" },
      drainage: { unit: "linear ft", perCrewHour: 12, confidence: "starter" },
      grading: { unit: "sq ft", perCrewHour: 500, confidence: "starter" }
    },
    equipmentModifiers: { mini_ex: 1.45, skid_steer: 1.4, tractor: 1.25, trencher: 1.5 }
  });

  const JOB_RULES = [
    ["drainage", /french\s*drain|drainage|drain\s+(?:pipe|install)/],
    ["retaining", /retaining\s*wall|wall\s*block/],
    ["irrigation", /irrigation|sprinkler|valves?|heads?|zones?/],
    ["sod", /\bsod\b|new\s*lawn/],
    ["mulch", /\bmulch\b|bark\s*dust/],
    ["rock", /decorative\s*rock|landscape\s*rock|gravel|\brock\b/],
    ["fabric", /weed\s*(?:mat|barrier|fabric)|landscape\s*fabric/],
    ["edging", /\bedg(?:e|ing)\b|border/],
    ["cleanup", /leaf\s*cleanup|brush\s*removal|landscape\s*cleanup|clean\s*out/],
    ["grading", /\bgrading\b|\bgrade\b|\bswale\b/],
    ["demo", /\bdemo\b|remove\s+(?:old\s+)?(?:rock|sod|landscape|material)|tear\s*out/],
    ["mowing", /\bmow(?:ing)?\b|lawn\s*maintenance/],
    ["aeration", /\baerat(?:e|ion)\b/],
    ["planting", /plant(?:ing)?\s+(?:trees?|shrubs?|plants?)/],
    ["snow", /\bsnow\b|plow(?:ing)?/]
  ];

  const EQUIPMENT_RULES = [
    ["mini_ex", /mini\s*(?:ex|excavator)|\bkx\d*\b/],
    ["skid_steer", /skid\s*steer|compact\s*track\s*loader|\bsvl\d*\b|\bscl\d*\b/],
    ["tractor", /\btractor\b|loader\s*tractor/],
    ["trencher", /\btrencher\b/],
    ["dump_trailer", /dump\s*trailer/],
    ["plate_compactor", /plate\s*compactor/]
  ];

  function num(value) {
    const parsed = Number(String(value || "").replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function firstNumber(text, expressions) {
    for (const expression of expressions) {
      const match = text.match(expression);
      if (match) return num(match[1]);
    }
    return 0;
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function parseJob(text) {
    const source = String(text || "").trim();
    const lower = source.toLowerCase().replace(/[–—]/g, "-");
    const acres = firstNumber(lower, [/([\d,.]+)\s*acres?\b/]);
    const squareFeet = firstNumber(lower, [/([\d,.]+)\s*(?:sq(?:uare)?\s*(?:feet|foot|ft)|sqft|sf)\b/]) || (acres ? acres * 43560 : 0);
    const cubicYards = firstNumber(lower, [/([\d,.]+)\s*(?:cubic\s*yards?|cu\.?\s*yds?|cys?|yards?)\b/]);
    const linearFeet = firstNumber(lower, [/([\d,.]+)\s*(?:linear\s*(?:feet|foot|ft)|lin(?:ear)?\.?\s*ft|lf)\b/]);
    let crewSize = firstNumber(lower, [/(\d+)\s*(?:person|people|worker|workers|guy|guys|man)\b/, /(\d+)\s*(?:person|man)[ -]?crew\b/]);
    if (!crewSize && /(?:me|myself)\s*(?:\+|and|with)\s*(?:one|1)\s*(?:other|guy|person|helper)/.test(lower)) crewSize = 2;
    if (!crewSize && /(?:me|myself)\s*(?:\+|and|with)\s*(?:two|2)\s*(?:others|guys|people|helpers)/.test(lower)) crewSize = 3;

    const jobTypes = unique(JOB_RULES.filter(([, pattern]) => pattern.test(lower)).map(([type]) => type));
    const equipment = unique(EQUIPMENT_RULES.filter(([, pattern]) => pattern.test(lower)).map(([type]) => type));
    const difficulty = /extreme|very\s*(?:tight|steep)|excessive\s*hand/.test(lower) ? "extreme"
      : /difficult|tight\s*access|steep|long\s*carry|through\s+(?:a\s+)?swale|push.*swale/.test(lower) ? "difficult"
        : /easy|wide\s*open|flat\s*access/.test(lower) ? "easy" : "normal";
    const includeFabric = /weed\s*(?:mat|barrier|fabric)|landscape\s*fabric/.test(lower);
    const removal = /\bdemo\b|remove|tear\s*out|haul\s*(?:off|away)|existing/.test(lower);
    const disposalLoads = firstNumber(lower, [/(\d+)\s*(?:dump\s*)?loads?\b/, /(\d+)\s*(?:dump\s*)?trips?\b/]);
    const travelMiles = firstNumber(lower, [/([\d,.]+)\s*(?:mi|miles?)\b/]);
    const primaryService = jobTypes.find((type) => ["rock", "mulch", "sod", "irrigation", "retaining", "cleanup", "grading", "demo", "edging", "fabric"].includes(type)) || "";
    const warnings = [];
    const assumptions = [];
    if (!primaryService) warnings.push("Job type was not confidently recognized.");
    if (!["cleanup"].includes(primaryService) && !squareFeet && !linearFeet && !cubicYards) warnings.push("No usable project quantity was found.");
    if (["rock", "mulch"].includes(primaryService) && !cubicYards && squareFeet) assumptions.push("Material volume will be calculated from area and installation depth.");
    if (["rock", "mulch", "sod", "fabric", "retaining"].includes(primaryService)) warnings.push("Confirm today's supplier material cost before sending the bid.");
    if (!crewSize) assumptions.push(`Using the default ${DEFAULT_CONFIG.defaultCrewSize}-person crew.`);
    if (!/easy|normal|difficult|extreme|tight|steep|swale|flat/.test(lower)) assumptions.push("Normal site access assumed.");
    if (!travelMiles) assumptions.push("Travel and mobilization distance not provided.");
    if (removal && !disposalLoads) warnings.push("Removal was detected, but dump trips or disposal volume are unknown.");
    if (equipment.length > 1) assumptions.push("Multiple equipment pieces detected; verify rental duration for each.");

    const knownSignals = [primaryService, squareFeet || cubicYards || linearFeet || acres, crewSize, difficulty !== "normal", equipment.length, includeFabric || removal].filter(Boolean).length;
    const confidence = Math.max(25, Math.min(95, 42 + knownSignals * 9 - warnings.length * 6));
    return {
      source,
      primaryService,
      jobTypes,
      squareFeet,
      acres,
      cubicYards,
      linearFeet,
      crewSize: crewSize || DEFAULT_CONFIG.defaultCrewSize,
      equipment,
      difficulty,
      includeFabric,
      removal,
      disposalLoads,
      travelMiles,
      assumptions,
      warnings,
      confidence
    };
  }

  function mergeConfig(config = {}) {
    return {
      ...DEFAULT_CONFIG,
      ...config,
      difficulty: { ...DEFAULT_CONFIG.difficulty, ...(config.difficulty || {}) },
      crewEfficiency: { ...DEFAULT_CONFIG.crewEfficiency, ...(config.crewEfficiency || {}) },
      productionRates: { ...DEFAULT_CONFIG.productionRates, ...(config.productionRates || {}) },
      equipmentModifiers: { ...DEFAULT_CONFIG.equipmentModifiers, ...(config.equipmentModifiers || {}) }
    };
  }

  function productionQuantity(parsed) {
    if (["rock", "mulch"].includes(parsed.primaryService)) return parsed.cubicYards || parsed.squareFeet;
    if (["edging", "irrigation", "drainage"].includes(parsed.primaryService)) return parsed.linearFeet;
    if (parsed.primaryService === "cleanup") return parsed.acres || (parsed.squareFeet / 43560);
    return parsed.squareFeet;
  }

  function estimateLabor(parsed, config = {}) {
    const settings = mergeConfig(config);
    const rate = settings.productionRates[parsed.primaryService];
    const warnings = [];
    if (!rate) return { manHours: 0, crewHours: 0, productionRate: 0, warnings: ["No production rate is configured for this job type."] };
    let quantity = productionQuantity(parsed);
    if (!quantity) return { manHours: 0, crewHours: 0, productionRate: rate.perCrewHour, warnings: ["A quantity is required before labor can be calculated."] };
    if (["rock", "mulch"].includes(parsed.primaryService) && !parsed.cubicYards) {
      const depth = parsed.primaryService === "rock" ? 3 : 2;
      quantity = parsed.squareFeet * (depth / 12) / 27;
      warnings.push(`${depth}-inch depth assumed for preliminary labor.`);
    }
    const crew = Math.max(1, parsed.crewSize || settings.defaultCrewSize);
    const crewFactor = Number(settings.crewEfficiency[crew] || (1 + (crew - 1) * 0.6));
    const difficultyFactor = Number(settings.difficulty[parsed.difficulty] || 1);
    const equipmentFactor = parsed.equipment.reduce((factor, id) => Math.max(factor, Number(settings.equipmentModifiers[id] || 1)), 1);
    const effectiveRate = Math.max(0.01, Number(rate.perCrewHour) * crewFactor * difficultyFactor * equipmentFactor);
    const productionHours = quantity / effectiveRate;
    const crewHours = productionHours + Number(settings.setupCrewHours) + Number(settings.cleanupCrewHours);
    return {
      quantity: Math.round(quantity * 100) / 100,
      unit: rate.unit,
      productionRate: rate.perCrewHour,
      effectiveRate: Math.round(effectiveRate * 100) / 100,
      crewHours: Math.round(crewHours * 4) / 4,
      manHours: Math.round(crewHours * crew * 4) / 4,
      crewSize: crew,
      difficultyFactor,
      equipmentFactor,
      warnings
    };
  }

  function priceBands(directCost, riskPercent, config = {}) {
    const settings = mergeConfig(config);
    const cost = Math.max(0, Number(directCost) || 0);
    const overhead = cost * Number(settings.overheadPercent) / 100;
    const risk = (cost + overhead) * Math.max(0, Number(riskPercent ?? settings.defaultRiskPercent)) / 100;
    const protectedCost = cost + overhead + risk;
    const priceAtMargin = (margin) => Math.max(Number(settings.minimumProjectPrice), protectedCost / Math.max(0.01, 1 - margin));
    return {
      directCost: Math.round(cost * 100) / 100,
      overhead: Math.round(overhead * 100) / 100,
      risk: Math.round(risk * 100) / 100,
      costFloor: Math.round(priceAtMargin(settings.floorGrossMargin) / 5) * 5,
      recommended: Math.round(priceAtMargin(settings.targetGrossMargin) / 5) * 5,
      premium: Math.round(priceAtMargin(settings.premiumGrossMargin) / 5) * 5
    };
  }

  function historicalRecommendation(records = [], service, config = {}) {
    const settings = mergeConfig(config);
    const usable = records.filter((record) => record.service === service && Number(record.quantity) > 0 && Number(record.actual_man_hours) > 0).map((record) => {
      const crew = Math.max(1, Number(record.crew_size) || settings.defaultCrewSize);
      const crewFactor = Number(settings.crewEfficiency[crew] || (1 + (crew - 1) * 0.6));
      const difficultyFactor = Number(settings.difficulty[record.difficulty] || 1);
      const equipmentFactor = (record.equipment || []).reduce((factor, id) => Math.max(factor, Number(settings.equipmentModifiers[id] || 1)), 1);
      const observedPerManHour = Number(record.quantity) / Number(record.actual_man_hours);
      const normalizedBaseRate = observedPerManHour * crew / Math.max(0.01, crewFactor * difficultyFactor * equipmentFactor);
      return { ...record, normalizedBaseRate };
    }).filter((record) => Number.isFinite(record.normalizedBaseRate) && record.normalizedBaseRate > 0);
    if (!usable.length) return { sampleSize: 0, recommendedRate: 0, currentRate: Number(settings.productionRates[service]?.perCrewHour) || 0 };
    const sorted = usable.map((record) => record.normalizedBaseRate).sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    const average = sorted.reduce((sum, rate) => sum + rate, 0) / sorted.length;
    const recommended = sorted.length >= 3 ? median : average;
    const variance = sorted.reduce((sum, rate) => sum + (rate - average) ** 2, 0) / sorted.length;
    return {
      sampleSize: sorted.length,
      currentRate: Number(settings.productionRates[service]?.perCrewHour) || 0,
      recommendedRate: Math.round(recommended * 100) / 100,
      averageRate: Math.round(average * 100) / 100,
      bestRate: Math.round(Math.max(...sorted) * 100) / 100,
      worstRate: Math.round(Math.min(...sorted) * 100) / 100,
      standardDeviation: Math.round(Math.sqrt(variance) * 100) / 100
    };
  }

  return { DEFAULT_CONFIG, parseJob, estimateLabor, priceBands, historicalRecommendation, mergeConfig };
});
