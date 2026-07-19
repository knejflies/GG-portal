(function attachGreenGrinCalculator(root, factory) {
  const calculator = factory();
  if (typeof module === "object" && module.exports) module.exports = calculator;
  if (root) root.GreenGrinCalculator = calculator;
})(typeof globalThis !== "undefined" ? globalThis : this, function createGreenGrinCalculator() {
  const money = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

  const roundUpTo = (value, increment) => {
    if (!increment || increment <= 0) return money(value);
    return Math.ceil(value / increment) * increment;
  };

  const positiveNumber = (value, name, allowZero = false) => {
    const number = Number(value);
    const minimum = allowZero ? 0 : Number.EPSILON;
    if (!Number.isFinite(number) || number < minimum) {
      throw new Error(`${name} must be ${allowZero ? "zero or greater" : "greater than zero"}.`);
    }
    return number;
  };

  function calculateGreenGrinEstimate(input, pricing) {
    const lawnSqFt = positiveNumber(input.lawnSqFt, "Lawn square footage");
    const flowerbedSqFt = positiveNumber(input.flowerbedSqFt ?? 0, "Flowerbed square footage", true);
    const difficultyMultiplier = positiveNumber(input.difficultyMultiplier ?? 1, "Property complexity multiplier");
    const propertyType = String(input.propertyType || "residential").toLowerCase();
    const plan = pricing.plans[input.plan];

    if (!plan) throw new Error("Please choose a valid Green Grin plan.");
    if (!["residential", "hoa_commercial"].includes(propertyType)) {
      throw new Error("Please choose a valid property type.");
    }

    const manualReviewRequired =
      propertyType === "hoa_commercial" ||
      lawnSqFt > pricing.manualReviewAboveLawnSqFt;
    const manualReviewReason = propertyType === "hoa_commercial"
      ? "HOA and commercial properties require a custom site review."
      : manualReviewRequired
        ? `Properties above ${Number(pricing.manualReviewAboveLawnSqFt).toLocaleString()} lawn sq ft require a custom site review.`
        : "";

    const rawWeekly = Math.max(
      plan.minimumWeekly,
      lawnSqFt * plan.weeklyRatePerLawnSqFt
    ) * difficultyMultiplier;

    const weeklyService = money(roundUpTo(rawWeekly, pricing.roundWeeklyTo));
    const seasonalService = money(weeklyService * pricing.mowingVisitsPerYear);

    let lawnFertilizationAnnual = 0;
    if (input.lawnFertilization) {
      const addOn = pricing.addOns.lawnFertilization;
      const perApplication = roundUpTo(
        Math.max(addOn.minimumPerApplication, lawnSqFt * addOn.ratePerLawnSqFtPerApplication),
        pricing.roundWeeklyTo
      );
      lawnFertilizationAnnual = money(perApplication * addOn.applicationsPerYear);
    }

    let bedPlantFertilizationAnnual = 0;
    if (input.bedPlantFertilization) {
      const addOn = pricing.addOns.bedPlantFertilization;
      const perVisit = roundUpTo(
        Math.max(addOn.minimumPerVisit, flowerbedSqFt * addOn.ratePerBedSqFtPerVisit),
        pricing.roundWeeklyTo
      );
      bedPlantFertilizationAnnual = money(perVisit * addOn.visitsPerYear);
    }

    const annualSubtotal = money(
      seasonalService + lawnFertilizationAnnual + bedPlantFertilizationAnnual
    );
    const annualSavings = input.annualAgreement === false
      ? 0
      : money(annualSubtotal * pricing.annualAgreementDiscount);
    const annualTotal = money(annualSubtotal - annualSavings);
    const monthlyPayment = money(annualTotal / pricing.monthlyPaymentsPerYear);

    return {
      planId: input.plan,
      planName: plan.name,
      propertyType,
      lawnSqFt,
      flowerbedSqFt,
      difficultyMultiplier,
      weeklyService,
      seasonalService,
      lawnFertilizationAnnual,
      bedPlantFertilizationAnnual,
      annualSubtotal,
      annualSavings,
      annualTotal,
      monthlyPayment,
      includes: [...plan.includes],
      manualReviewRequired,
      displayPriceAllowed: !manualReviewRequired,
      manualReviewReason,
      disclaimer: "Estimate only. Final pricing depends on property condition, access, obstacles, travel and an on-site review."
    };
  }

  function calculateAllGreenGrinPlans(input, pricing) {
    return Object.keys(pricing.plans).map((plan) =>
      calculateGreenGrinEstimate({ ...input, plan }, pricing)
    );
  }

  const nitrogenFraction = (product) => {
    const analysisNitrogen = Number(String(product.analysis || "").split("-")[0]);
    const percent = Number.isFinite(Number(product.nitrogenPercent))
      ? Number(product.nitrogenPercent)
      : analysisNitrogen / 100;
    if (!Number.isFinite(percent) || percent <= 0 || percent > 1) {
      throw new Error(`${product.name || "Product"} needs a valid fertilizer analysis.`);
    }
    return percent;
  };

  function calculateFertilizerBid(input, settings) {
    const lawnSqFt = positiveNumber(input.lawnSqFt, "Turf square footage");
    const productionRate = positiveNumber(settings.applicationProductionSqFtPerHour, "Application production rate");
    const fixedSetupHours = positiveNumber(settings.fixedSetupHours, "Fixed setup time", true);
    const minimumBillableHours = positiveNumber(settings.minimumBillableHours, "Minimum billable time", true);
    const loadedLaborRate = positiveNumber(settings.loadedLaborRatePerHour, "Loaded labor rate", true);
    const vehicleEquipment = positiveNumber(settings.vehicleEquipmentPerVisit, "Vehicle and equipment cost", true);
    const adminOverhead = positiveNumber(settings.adminOverheadPerVisit, "Admin overhead", true);
    const costReserve = positiveNumber(settings.costReservePerVisit, "Cost reserve", true);
    const targetGrossMargin = positiveNumber(settings.targetGrossMargin, "Target gross margin", true);
    const minimumApplicationCharge = positiveNumber(settings.minimumApplicationCharge, "Minimum application charge", true);
    const chargeIncrement = positiveNumber(settings.roundChargeTo, "Charge rounding increment");
    const segwayPurchaseCost = positiveNumber(settings.segwayPurchaseCost, "Segway purchase cost", true);
    const recoveryPeriodSeasons = positiveNumber(settings.recoveryPeriodSeasons, "Recovery period");
    const fertilizerVisitsPerSeason = positiveNumber(settings.fertilizerVisitsPerSeason, "Fertilizer visits per season");
    const mowingVisitsPerSeason = positiveNumber(settings.mowingVisitsPerSeason, "Mowing visits per season", true);
    const paymentsPerYear = positiveNumber(settings.paymentsPerYear ?? 12, "Payments per year");

    if (targetGrossMargin >= 1) throw new Error("Target gross margin must be less than 100%.");
    if (!Array.isArray(settings.applications) || !settings.applications.length) {
      throw new Error("Add at least one fertilizer application.");
    }

    const products = Object.entries(settings.products || {}).reduce((map, [id, product]) => {
      const bagSizeLb = positiveNumber(product.bagSizeLb, `${product.name || id} bag size`);
      const bagCost = positiveNumber(product.bagCost, `${product.name || id} bag cost`, true);
      map[id] = {
        id,
        name: String(product.name || id),
        analysis: String(product.analysis || ""),
        nitrogenFraction: nitrogenFraction(product),
        bagSizeLb,
        bagCost
      };
      return map;
    }, {});

    const annualizedSegwayCost = segwayPurchaseCost / recoveryPeriodSeasons;
    const fertilizerCostAllocation = fertilizerVisitsPerSeason + mowingVisitsPerSeason > 0
      ? annualizedSegwayCost * fertilizerVisitsPerSeason / (fertilizerVisitsPerSeason + mowingVisitsPerSeason)
      : 0;
    const segwayCostPerFertilizerVisit = fertilizerVisitsPerSeason > 0
      ? fertilizerCostAllocation / fertilizerVisitsPerSeason
      : 0;
    const laborHoursPerApplication = Math.max(
      minimumBillableHours,
      fixedSetupHours + lawnSqFt / productionRate
    );

    const applications = settings.applications.map((application, index) => {
      const product = products[application.productId];
      if (!product) throw new Error(`Application ${index + 1} needs a valid product.`);
      const nitrogenRateLbPer1000 = positiveNumber(
        application.nitrogenRateLbPer1000,
        `${application.stage || `Application ${index + 1}`} nitrogen rate`
      );
      const productRateLbPer1000 = nitrogenRateLbPer1000 / product.nitrogenFraction;
      const productNeededLb = lawnSqFt / 1000 * productRateLbPer1000;
      const bagsUsed = productNeededLb / product.bagSizeLb;
      const materialCost = bagsUsed * product.bagCost;
      const laborCost = laborHoursPerApplication * loadedLaborRate;
      const vehicleOverheadSegway = vehicleEquipment + adminOverhead + segwayCostPerFertilizerVisit;
      const totalCost = materialCost + laborCost + vehicleOverheadSegway + costReserve;
      const chargeBeforeRounding = Math.max(
        minimumApplicationCharge,
        totalCost / (1 - targetGrossMargin)
      );
      const quotedCharge = roundUpTo(chargeBeforeRounding, chargeIncrement);
      const grossProfit = quotedCharge - totalCost;

      return {
        stage: String(application.stage || `Application ${index + 1}`),
        timing: String(application.timing || ""),
        productId: product.id,
        productName: product.name,
        analysis: product.analysis,
        nitrogenRateLbPer1000,
        productRateLbPer1000,
        productNeededLb,
        bagSizeLb: product.bagSizeLb,
        bagsUsed,
        bagCost: product.bagCost,
        materialCost,
        laborHours: laborHoursPerApplication,
        laborCost,
        vehicleOverheadSegway,
        totalCost,
        quotedCharge,
        grossProfit,
        margin: quotedCharge > 0 ? grossProfit / quotedCharge : 0
      };
    });

    const purchasePlan = Object.values(products).map((product) => {
      const annualProductNeededLb = applications
        .filter((application) => application.productId === product.id)
        .reduce((sum, application) => sum + application.productNeededLb, 0);
      const bagsToPurchase = annualProductNeededLb > 0
        ? Math.ceil(annualProductNeededLb / product.bagSizeLb)
        : 0;
      return {
        productId: product.id,
        productName: product.name,
        bagSizeLb: product.bagSizeLb,
        bagCost: product.bagCost,
        annualProductNeededLb,
        bagsToPurchase,
        cashPurchase: bagsToPurchase * product.bagCost
      };
    });

    const sum = (field) => applications.reduce((total, application) => total + application[field], 0);
    const annualPrice = sum("quotedCharge");
    const operatingCost = sum("totalCost");
    const grossProfit = annualPrice - operatingCost;
    const cashProductPurchase = purchasePlan.reduce((total, product) => total + product.cashPurchase, 0);
    const totalLaborCost = sum("laborCost");
    const totalVehicleOverheadSegway = sum("vehicleOverheadSegway");

    return {
      customer: String(input.customer || "").trim(),
      lawnSqFt,
      applications,
      purchasePlan,
      annualPrice,
      averageApplicationCharge: annualPrice / fertilizerVisitsPerSeason,
      monthlyPayment: annualPrice / paymentsPerYear,
      operatingCost,
      grossProfit,
      grossMargin: annualPrice > 0 ? grossProfit / annualPrice : 0,
      totalProductAppliedLb: sum("productNeededLb"),
      totalLaborHours: sum("laborHours"),
      totalLaborCost,
      totalVehicleOverheadSegway,
      annualizedSegwayCost,
      fertilizerCostAllocation,
      segwayCostPerFertilizerVisit,
      cashProductPurchase,
      firstJobCashProfit: annualPrice - cashProductPurchase - totalLaborCost - totalVehicleOverheadSegway,
      pricePer1000SqFtPerVisit: annualPrice / (lawnSqFt / 1000 * fertilizerVisitsPerSeason),
      fertilizerVisitsPerSeason,
      mowingVisitsPerSeason,
      visitCountAligned: applications.length === fertilizerVisitsPerSeason,
      costReservePerVisit: costReserve
    };
  }

  return { calculateGreenGrinEstimate, calculateAllGreenGrinPlans, calculateFertilizerBid };
});
