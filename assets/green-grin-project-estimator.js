(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GreenGrinProjectEstimator = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const DEFAULT_SETTINGS = Object.freeze({
    laborSellRate: 65,
    loadedLaborCost: 35,
    targetGrossMargin: 0.4,
    marginWarning: 0.35,
    equipmentMarkup: 20,
    defaultContingency: 5,
    highRiskContingency: 10,
    mulchDepthInches: 2,
    waste: {
      rock: 10,
      mulch: 10,
      fabric: 10,
      sod: 5,
      edging: 5,
      irrigation: 10,
      retaining: 7
    }
  });

  const DEFAULT_EQUIPMENT = Object.freeze([
    { id: "none", name: "No rental equipment", day: 0, week: 0, month: 0 },
    { id: "scl1000", name: "SCL1000 compact track loader", day: 250, week: 875, month: 2640 },
    { id: "svl65", name: "SVL65 compact track loader", day: 250, week: 960, month: 2700 },
    { id: "svl75", name: "SVL75-2 compact track loader", day: 250, week: 960, month: 2700 },
    { id: "k008", name: "K-008 mini excavator", day: 175, week: 700, month: 1980 },
    { id: "kx018", name: "KX018-4 mini excavator", day: 190, week: 760, month: 2178 },
    { id: "u27", name: "U27-4 excavator with thumb", day: 190, week: 760, month: 2178 },
    { id: "kx033", name: "KX033 excavator", day: 200, week: 800, month: 2310 },
    { id: "kx040", name: "KX040 excavator with thumb", day: 225, week: 900, month: 2475 },
    { id: "trencher3", name: "TL60 3-foot trencher with trailer", day: 150, week: 525, month: 1650 },
    { id: "trencher4", name: "460 4-foot trencher", day: 250, week: 875, month: 2640 },
    { id: "plate", name: "Plate compactor", day: 75, week: 262, month: 786 },
    { id: "dump12", name: "6.5 x 12 dump trailer", day: 120, week: 420, month: 1260 },
    { id: "dump14", name: "6.5 x 14 dump trailer", day: 130, week: 455, month: 1365 },
    { id: "stump", name: "Stump grinder", day: 100, week: 350, month: 1050 }
  ]);

  const MATERIAL_DEFAULTS = Object.freeze([
    { id: "decorative-rock", name: "Decorative landscape rock", category: "Material", unit: "ton", unitCost: 0, markupPercent: 30, defaultRate: 0, purchaseIncrement: 0.5, tonsPerCubicYard: 1.4 },
    { id: "mulch", name: "Landscape mulch", category: "Material", unit: "yard", unitCost: 0, markupPercent: 30, defaultRate: 0, purchaseIncrement: 0.5 },
    { id: "weed-fabric", name: "Commercial weed fabric", category: "Material", unit: "sq ft", unitCost: 0, markupPercent: 30, defaultRate: 0, purchaseIncrement: 300 },
    { id: "fabric-staples", name: "Landscape fabric staples", category: "Material", unit: "each", unitCost: 0, markupPercent: 50, defaultRate: 0, purchaseIncrement: 50 },
    { id: "landscape-edging", name: "Landscape edging", category: "Material", unit: "linear ft", unitCost: 0, markupPercent: 40, defaultRate: 0, purchaseIncrement: 1 },
    { id: "sod", name: "Fresh sod", category: "Material", unit: "sq ft", unitCost: 0, markupPercent: 30, defaultRate: 0, purchaseIncrement: 10 },
    { id: "irrigation-pipe", name: "Irrigation pipe", category: "Material", unit: "linear ft", unitCost: 0, markupPercent: 40, defaultRate: 0, purchaseIncrement: 20 },
    { id: "sprinkler-head", name: "Sprinkler head", category: "Material", unit: "each", unitCost: 0, markupPercent: 40, defaultRate: 0, purchaseIncrement: 1 },
    { id: "irrigation-valve", name: "Irrigation valve assembly", category: "Material", unit: "each", unitCost: 0, markupPercent: 40, defaultRate: 0, purchaseIncrement: 1 },
    { id: "retaining-material", name: "Decorative retaining wall material", category: "Material", unit: "wall sq ft", unitCost: 0, markupPercent: 40, defaultRate: 0, purchaseIncrement: 1 },
    { id: "firepit-material", name: "Firepit material package", category: "Material", unit: "each", unitCost: 0, markupPercent: 40, defaultRate: 0, purchaseIncrement: 1 },
    { id: "disposal-load", name: "Disposal and dump fees", category: "Disposal", unit: "load", unitCost: 0, markupPercent: 20, defaultRate: 0, purchaseIncrement: 1 }
  ]);

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function money(value) {
    return Math.round(number(value) * 100) / 100;
  }

  function quantity(value, precision = 2) {
    const scale = 10 ** precision;
    return Math.round(Math.max(0, number(value)) * scale) / scale;
  }

  function roundPurchase(value, increment = 1) {
    const safeIncrement = Math.max(0.0001, number(increment, 1));
    return quantity(Math.ceil(Math.max(0, number(value)) / safeIncrement) * safeIncrement, 4);
  }

  function rockDepthForSize(size, installType = "new") {
    if (installType === "topoff") return 1;
    if (size === "small") return 2;
    if (size === "medium") return 3;
    if (size === "large") return 4;
    return 3;
  }

  function mergedSettings(settings = {}) {
    return {
      ...DEFAULT_SETTINGS,
      ...settings,
      waste: { ...DEFAULT_SETTINGS.waste, ...(settings.waste || {}) }
    };
  }

  function catalogMap(items = []) {
    const defaults = MATERIAL_DEFAULTS.map((item) => ({ ...item }));
    const map = new Map(defaults.map((item) => [item.id, item]));
    for (const item of items || []) {
      if (!item?.id) continue;
      map.set(item.id, { ...(map.get(item.id) || {}), ...item });
    }
    return map;
  }

  function sellRate(item) {
    const explicit = number(item.defaultRate ?? item.rate);
    if (explicit > 0) return explicit;
    return money(number(item.unitCost) * (1 + number(item.markupPercent) / 100));
  }

  function makeLine(item, amount, overrides = {}) {
    const count = quantity(amount, 4);
    const unitCost = money(overrides.unitCost ?? item.unitCost);
    const markupPercent = quantity(overrides.markupPercent ?? item.markupPercent, 2);
    const rate = money(overrides.rate ?? sellRate({ ...item, unitCost, markupPercent }));
    return {
      catalog_id: item.id || "",
      description: overrides.description || item.name,
      category: overrides.category || item.category || "Material",
      quantity: count,
      unit: overrides.unit || item.unit || "each",
      unit_cost: unitCost,
      markup_percent: markupPercent,
      rate,
      cost_total: money(count * unitCost),
      amount: money(count * rate),
      deposit_eligible: overrides.depositEligible ?? ["Material", "Equipment"].includes(overrides.category || item.category)
    };
  }

  function materialLine(catalog, id, rawQuantity, wastePercent) {
    const item = catalog.get(id);
    if (!item) throw new Error(`Missing saved cost item: ${id}.`);
    const withWaste = number(rawQuantity) * (1 + number(wastePercent) / 100);
    const ordered = roundPurchase(withWaste, item.purchaseIncrement || 1);
    return makeLine(item, ordered);
  }

  function laborHours(input, measurement) {
    const mode = input.laborMode || "crew";
    if (mode === "manual") return quantity(input.manualManHours, 2);
    if (mode === "production") {
      const rate = Math.max(0.0001, number(input.productionRate));
      return quantity(number(measurement) / rate, 2);
    }
    return quantity(number(input.crewSize, 1) * number(input.crewHours), 2);
  }

  function equipmentLine(input, equipment, settings) {
    const rental = (equipment || DEFAULT_EQUIPMENT).find((item) => item.id === input.equipmentId);
    if (!rental || rental.id === "none") return null;
    const period = ["day", "week", "month"].includes(input.rentalPeriod) ? input.rentalPeriod : "day";
    const count = Math.max(1, Math.ceil(number(input.rentalCount, 1)));
    const cost = number(rental[period]) * count;
    return makeLine({
      id: `rental-${rental.id}`,
      name: `${rental.name} rental`,
      category: "Equipment",
      unit: period,
      unitCost: number(rental[period]),
      markupPercent: number(settings.equipmentMarkup),
      defaultRate: number(rental[period]) * (1 + number(settings.equipmentMarkup) / 100)
    }, count, { depositEligible: true });
  }

  function groupedTotals(lines = []) {
    const groups = {
      Materials: 0,
      "Installation & Labor": 0,
      "Equipment & Hauling": 0,
      "Site Preparation & Disposal": 0
    };
    for (const line of lines) {
      const category = String(line.category || "");
      if (category === "Material") groups.Materials += number(line.amount);
      else if (category === "Labor" || category === "Service") groups["Installation & Labor"] += number(line.amount);
      else if (category === "Equipment") groups["Equipment & Hauling"] += number(line.amount);
      else groups["Site Preparation & Disposal"] += number(line.amount);
    }
    return Object.fromEntries(Object.entries(groups).map(([key, value]) => [key, money(value)]).filter(([, value]) => value > 0));
  }

  function defaultScope(service, input, details) {
    const area = number(input.areaSqFt).toLocaleString();
    if (service === "rock") return `Prepare approximately ${area} sq. ft. and install decorative landscape rock at ${details.depth}" depth${input.includeFabric ? " over commercial landscape fabric" : ""}. Final grading and cleanup included.`;
    if (service === "mulch") return `Prepare approximately ${area} sq. ft. and install landscape mulch at ${details.depth}" depth. Final raking and cleanup included.`;
    if (service === "fabric") return `Prepare approximately ${area} sq. ft. and install commercial landscape fabric with secured overlaps and staples.`;
    if (service === "edging") return `Install approximately ${number(input.linearFeet).toLocaleString()} linear ft. of landscape edging, including layout and cleanup.`;
    if (service === "sod") return `Prepare and install approximately ${area} sq. ft. of fresh sod, including final grading and cleanup.`;
    if (service === "irrigation") return `Install or modify irrigation for ${number(input.zones)} zone(s), including approximately ${number(input.pipeFeet)} linear ft. of pipe and ${number(input.heads)} sprinkler heads. Final testing and adjustment included.`;
    if (service === "retaining") return `Construct approximately ${details.wallSquareFeet.toLocaleString()} face sq. ft. of decorative retaining wall, including base preparation, installation, and cleanup.`;
    if (service === "firepit") return `Construct ${number(input.itemQuantity, 1)} decorative firepit area(s), including preparation, material installation, and cleanup.`;
    if (service === "demo") return `Remove and dispose of approximately ${area} sq. ft. of existing landscape material and leave the work area ready for the next phase.`;
    return "Complete the described landscape work, including preparation, installation, and final cleanup.";
  }

  function phaseHours(service, hours) {
    const total = number(hours);
    const splits = service === "demo"
      ? { "Travel / Mobilization": 0.1, Demo: 0.7, Cleanup: 0.2 }
      : { "Travel / Mobilization": 0.1, Preparation: 0.25, Installation: 0.55, Cleanup: 0.1 };
    return Object.fromEntries(Object.entries(splits).map(([phase, share]) => [phase, quantity(total * share, 2)]));
  }

  function calculateProject(input = {}, options = {}) {
    const settings = mergedSettings(options.settings);
    const catalog = catalogMap(options.catalog);
    const service = input.service || "rock";
    const lines = [];
    const details = {};
    let measurement = number(input.areaSqFt);

    if (service === "rock") {
      const depth = number(input.depthInches, rockDepthForSize(input.rockSize, input.installType));
      const cubicYards = number(input.areaSqFt) * (depth / 12) / 27;
      const rock = catalog.get("decorative-rock");
      const rockQuantity = rock?.unit === "yard" ? cubicYards : cubicYards * number(rock?.tonsPerCubicYard, 1.4);
      details.depth = depth;
      details.rawCubicYards = quantity(cubicYards, 2);
      lines.push(materialLine(catalog, "decorative-rock", rockQuantity, settings.waste.rock));
      if (input.includeFabric !== false) {
        lines.push(materialLine(catalog, "weed-fabric", input.areaSqFt, settings.waste.fabric));
        lines.push(materialLine(catalog, "fabric-staples", number(input.areaSqFt) / 25, settings.waste.fabric));
      }
    } else if (service === "mulch") {
      const depth = number(input.depthInches, settings.mulchDepthInches);
      const cubicYards = number(input.areaSqFt) * (depth / 12) / 27;
      details.depth = depth;
      details.rawCubicYards = quantity(cubicYards, 2);
      lines.push(materialLine(catalog, "mulch", cubicYards, settings.waste.mulch));
    } else if (service === "fabric") {
      lines.push(materialLine(catalog, "weed-fabric", input.areaSqFt, settings.waste.fabric));
      lines.push(materialLine(catalog, "fabric-staples", number(input.areaSqFt) / 25, settings.waste.fabric));
    } else if (service === "edging") {
      measurement = number(input.linearFeet);
      lines.push(materialLine(catalog, "landscape-edging", input.linearFeet, settings.waste.edging));
    } else if (service === "sod") {
      lines.push(materialLine(catalog, "sod", input.areaSqFt, settings.waste.sod));
    } else if (service === "irrigation") {
      measurement = number(input.pipeFeet) || number(input.heads);
      lines.push(materialLine(catalog, "irrigation-pipe", input.pipeFeet, settings.waste.irrigation));
      lines.push(materialLine(catalog, "sprinkler-head", input.heads, settings.waste.irrigation));
      lines.push(materialLine(catalog, "irrigation-valve", input.zones, settings.waste.irrigation));
    } else if (service === "retaining") {
      const wallSquareFeet = number(input.wallLength) * number(input.wallHeight);
      measurement = wallSquareFeet;
      details.wallSquareFeet = quantity(wallSquareFeet, 2);
      lines.push(materialLine(catalog, "retaining-material", wallSquareFeet, settings.waste.retaining));
    } else if (service === "firepit") {
      measurement = Math.max(1, number(input.itemQuantity, 1));
      lines.push(materialLine(catalog, "firepit-material", measurement, 0));
    } else if (service === "demo") {
      if (number(input.disposalLoads) > 0) lines.push(materialLine(catalog, "disposal-load", input.disposalLoads, 0));
    }

    if (["rock", "mulch"].includes(service) && number(input.linearFeet) > 0) {
      lines.push(materialLine(catalog, "landscape-edging", input.linearFeet, settings.waste.edging));
    }

    if (service !== "demo" && number(input.disposalLoads) > 0) {
      lines.push(materialLine(catalog, "disposal-load", input.disposalLoads, 0));
    }

    const hours = laborHours(input, measurement);
    if (hours > 0) {
      lines.push(makeLine({
        id: "installation-labor",
        name: "Landscape installation labor",
        category: "Labor",
        unit: "man-hour",
        unitCost: settings.loadedLaborCost,
        markupPercent: 0,
        defaultRate: settings.laborSellRate
      }, hours, { depositEligible: false }));
    }

    const rentalLine = equipmentLine(input, options.equipment, settings);
    if (rentalLine) lines.push(rentalLine);

    const directSubtotal = money(lines.reduce((sum, line) => sum + line.amount, 0));
    const internalCost = money(lines.reduce((sum, line) => sum + line.cost_total, 0));
    const contingencyPercent = number(input.contingencyPercent,
      ["demo", "irrigation"].includes(service) ? settings.highRiskContingency : settings.defaultContingency);
    const contingencyAmount = money(directSubtotal * contingencyPercent / 100);
    if (contingencyAmount > 0) {
      lines.push(makeLine({ id: "project-contingency", name: "Project contingency", category: "Other", unit: "each", unitCost: 0, markupPercent: 0, defaultRate: contingencyAmount }, 1, { rate: contingencyAmount, depositEligible: false }));
    }
    const subtotal = money(directSubtotal + contingencyAmount);
    const cost = money(lines.reduce((sum, line) => sum + line.cost_total, 0));
    const grossProfit = money(subtotal - cost);
    const grossMargin = subtotal > 0 ? grossProfit / subtotal : 0;
    const depositAmount = money(lines.filter((line) => line.deposit_eligible).reduce((sum, line) => sum + line.amount, 0));
    const missingCosts = lines.filter((line) => line.category === "Material" && line.unit_cost <= 0).map((line) => line.description);

    return {
      service,
      lines,
      details,
      internalCost: cost,
      subtotal,
      grossProfit,
      grossMargin,
      marginWarning: grossMargin < settings.marginWarning,
      depositAmount,
      groupedTotals: groupedTotals(lines),
      missingCosts: [...new Set(missingCosts)],
      phaseHours: phaseHours(service, hours),
      scope: defaultScope(service, input, details),
      settings
    };
  }

  return {
    DEFAULT_SETTINGS,
    DEFAULT_EQUIPMENT,
    MATERIAL_DEFAULTS,
    rockDepthForSize,
    roundPurchase,
    groupedTotals,
    phaseHours,
    calculateProject
  };
});
