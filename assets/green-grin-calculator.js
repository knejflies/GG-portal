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

  return { calculateGreenGrinEstimate, calculateAllGreenGrinPlans };
});
