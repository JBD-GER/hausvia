export type WinterObjectType = "private" | "residential" | "commercial";
export type WinterSurfaceProfile = "manual" | "mixed" | "machine";
export type WinterAccess = "standard" | "difficult";
export type WinterReadiness = "standard" | "commercial24h";

export type WinterPricingInput = {
  objectType: WinterObjectType;
  area: number;
  surfaceProfile: WinterSurfaceProfile;
  access: WinterAccess;
  readiness: WinterReadiness;
};

export type WinterDeploymentBreakdown = {
  areaSquareMeters: number;
  appliedSurfaceProfile: WinterSurfaceProfile;
  manualShare: number;
  machineShare: number;
  mobilizationGross: number;
  areaServiceGross: number;
  minimumAdjustmentGross: number;
  areaServiceRateGrossPerSquareMeter: number;
  standardDeploymentGross: number;
  readinessMultiplier: number;
  readinessSurchargePercent: number;
  readinessSurchargeGross: number;
  effectiveDeploymentRateGrossPerSquareMeter: number;
};

export type WinterPricingEstimate = {
  monthlyBaseGross: number;
  seasonBaseGross: number;
  deploymentGross: number;
  monthlyBaseNet: number;
  seasonBaseNet: number;
  deploymentNet: number;
  seasonMonths: 5;
  contractPeriod: "1. November bis 31. März";
  vatRate: 19;
  readiness: WinterReadiness;
  readinessSurchargePercent: number;
  baseBreakdown: {
    standardMonthlyBaseGross: number;
    readinessSurchargeGross: number;
  };
  pricingOptions: {
    flex: {
      monthlyBaseGross: number;
      seasonBaseGross: number;
      deploymentGross: number;
    };
    plan: {
      includedDeployments: number;
      deploymentDiscountPercent: number;
      discountedDeploymentGross: number;
      monthlyGross: number;
      seasonGross: number;
      additionalDeploymentGross: number;
    };
  };
  additionalServices: {
    sundayHoliday: {
      surchargePercent: 50;
      flexSurchargeGrossPerDeployment: number;
      planSurchargeGrossPerDeployment: number;
      included: false;
    };
    springCleaning: {
      grossPerSquareMeter: 1.5;
      estimatedGross: number;
      included: false;
    };
  };
  deploymentBreakdown: WinterDeploymentBreakdown;
};

type WinterAreaRateBand = {
  upTo: number;
  manualGrossPerSquareMeter: number;
  machineGrossPerSquareMeter: number;
};

const areaRateBands = [
  { upTo: 100, manualGrossPerSquareMeter: 0.5, machineGrossPerSquareMeter: 0.4 },
  { upTo: 250, manualGrossPerSquareMeter: 0.38, machineGrossPerSquareMeter: 0.3 },
  { upTo: 500, manualGrossPerSquareMeter: 0.28, machineGrossPerSquareMeter: 0.22 },
  { upTo: 1_000, manualGrossPerSquareMeter: 0.2, machineGrossPerSquareMeter: 0.15 },
] as const satisfies readonly WinterAreaRateBand[];

function roundToCents(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundToFourDecimals(value: number) {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function roundToIncrement(value: number, increment: number) {
  return Math.round((value + Number.EPSILON) / increment) * increment;
}

export const winterPricingConfig = {
  minimumArea: 10,
  maximumArea: 1_000,
  minimumMachineArea: 150,
  automaticMachineArea: 400,
  seasonMonths: 5,
  vatRate: 0.19,
  modelVersion: "2026-08-hannover-degressive-v3",
  referenceSource: "Regionaler Marktvergleich Hannover",
  referenceUpdatedAt: "2026-08-04",
  generalPriceAdjustmentPercent: 10,
  monthlyBase: {
    minimumGross: 70,
    includedArea: 100,
    grossPerAdditionalSquareMeter: 0.1,
    roundingIncrement: 5,
  },
  deployment: {
    mobilizationGross: 29,
    minimumGross: 49,
    areaRateBands,
    standardGritIncluded: true,
  },
  flatRateIncludedDeployments: 10,
  flatRateDeploymentDiscountPercent: 10,
  objectTypes: [
    {
      id: "private",
      label: "Privathaus",
      description: "Ein Hauseingang mit zugehörigem Gehweg oder kleiner Zufahrt.",
    },
    {
      id: "residential",
      label: "Mehrfamilienhaus / WEG",
      description: "Gemeinschaftliche Wege und Zugänge eines Wohnobjekts.",
    },
    {
      id: "commercial",
      label: "Gewerbeobjekt",
      description: "Besucher- oder Mitarbeiterzugänge mit erhöhtem Abstimmungsbedarf.",
    },
  ],
  surfaceProfiles: [
    {
      id: "manual",
      label: "Überwiegend Handarbeit",
      description: "Schmale Wege, Eingänge oder Bereiche, die nicht maschinell befahrbar sind.",
    },
    {
      id: "mixed",
      label: "Gemischte Flächen",
      description: "Teilweise offen, teilweise schmal oder nur von Hand erreichbar.",
    },
    {
      id: "machine",
      label: "Maschinell gut befahrbar",
      description: "Weitgehend zusammenhängende, ausreichend breite und ebene Flächen.",
    },
  ],
  accessOptions: [
    {
      id: "standard",
      label: "Normal zugänglich",
      description: "Kurze Wege, keine besonderen Höhenunterschiede oder Hindernisse.",
    },
    {
      id: "difficult",
      label: "Erschwerte Ausführung",
      description: "Treppen, Rampen, Gefälle oder mehrere getrennte Teilflächen.",
    },
  ],
  readinessOptions: [
    {
      id: "standard",
      label: "Standard",
      schedule: "Mo–Sa 7:00–20:00 Uhr · So/Feiertag 8:00–20:00 Uhr",
      description: "Einsatzplanung im regulären Hausvia-Zeitfenster.",
      surchargePercent: 0,
      multiplier: 1,
      commercialOnly: false,
    },
    {
      id: "commercial24h",
      label: "24/7 Gewerbe-Service",
      schedule: "Rund um die Uhr",
      description: "+35 % auf Grundgebühr und jeden Einsatz.",
      surchargePercent: 35,
      multiplier: 1.35,
      commercialOnly: true,
    },
  ],
  additionalServices: {
    sundayHoliday: {
      label: "Sonn- & Feiertagseinsatz",
      description: "Nur bei einem tatsächlich an Sonn- oder Feiertagen ausgeführten Einsatz.",
      surchargePercent: 50,
      included: false,
    },
    springCleaning: {
      label: "Frühjahrskehrung (Streugutentfernung)",
      description: "Einmalige Entfernung des ausgebrachten Streuguts nach der Wintersaison.",
      grossPerSquareMeter: 1.5,
      included: false,
    },
  },
  standardCoverageNotice:
    "Hinweis für öffentliche Gehwege in Hannover: Die örtliche Räum- und Streupflicht reicht grundsätzlich bis 22:00 Uhr. Die Absicherung nach 20:00 Uhr wird beim Standard-Zeitfenster vor Vertragsschluss separat festgelegt.",
} as const;

function grossToNet(gross: number) {
  return roundToCents(gross / (1 + winterPricingConfig.vatRate));
}

export function isWinterObjectType(value: unknown): value is WinterObjectType {
  return winterPricingConfig.objectTypes.some((item) => item.id === value);
}

export function isWinterSurfaceProfile(value: unknown): value is WinterSurfaceProfile {
  return winterPricingConfig.surfaceProfiles.some((item) => item.id === value);
}

export function isWinterAccess(value: unknown): value is WinterAccess {
  return winterPricingConfig.accessOptions.some((item) => item.id === value);
}

export function isWinterReadiness(value: unknown): value is WinterReadiness {
  return winterPricingConfig.readinessOptions.some((item) => item.id === value);
}

export function deriveWinterSurfaceProfile(area: number, access: WinterAccess): WinterSurfaceProfile {
  if (access === "difficult" || area < winterPricingConfig.minimumMachineArea) return "manual";
  if (area >= winterPricingConfig.automaticMachineArea) return "machine";
  return "mixed";
}

function singleString(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

export function parseWinterArea(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const compact = value.trim().replace(/[\s\u00a0]/g, "");
  if (!compact || !/^[\d.,]+$/.test(compact)) return null;

  let normalized = compact;
  if (compact.includes(",")) {
    normalized = compact.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(compact)) {
    normalized = compact.replace(/\./g, "");
  }

  const area = Number(normalized);
  return Number.isFinite(area) ? area : null;
}

export function isAllowedWinterCombination(input: WinterPricingInput) {
  if (input.readiness === "commercial24h" && input.objectType !== "commercial") return false;
  return !(
    input.surfaceProfile === "machine" &&
    (input.area < winterPricingConfig.minimumMachineArea || input.access !== "standard")
  );
}

export function parseWinterPricingInput(values: Record<string, unknown>): WinterPricingInput | null {
  const objectType = singleString(values.objectType);
  const surfaceProfile = singleString(values.surfaceProfile);
  const access = singleString(values.access);
  const readiness = singleString(values.readiness);
  const areaValue = parseWinterArea(values.area);

  if (
    !isWinterObjectType(objectType) ||
    !isWinterSurfaceProfile(surfaceProfile) ||
    !isWinterAccess(access) ||
    !isWinterReadiness(readiness) ||
    areaValue === null ||
    areaValue < winterPricingConfig.minimumArea ||
    areaValue > winterPricingConfig.maximumArea
  ) {
    return null;
  }

  if (
    (surfaceProfile === "machine" &&
      (areaValue < winterPricingConfig.minimumMachineArea || access !== "standard")) ||
    (readiness === "commercial24h" && objectType !== "commercial")
  ) {
    return null;
  }

  const input: WinterPricingInput = {
    objectType,
    area: Math.round(areaValue),
    surfaceProfile,
    access,
    readiness,
  };

  return isAllowedWinterCombination(input) ? input : null;
}

function tieredAreaCost(area: number, profile: "manual" | "machine") {
  let previousLimit = 0;
  let cost = 0;

  for (const band of winterPricingConfig.deployment.areaRateBands) {
    const squareMetersInBand = Math.max(0, Math.min(area, band.upTo) - previousLimit);
    if (squareMetersInBand > 0) {
      const rate =
        profile === "manual" ? band.manualGrossPerSquareMeter : band.machineGrossPerSquareMeter;
      cost += squareMetersInBand * rate;
    }
    previousLimit = band.upTo;
    if (area <= band.upTo) break;
  }

  return roundToCents(cost);
}

export function calculateWinterPrice(input: WinterPricingInput): WinterPricingEstimate {
  if (
    !Number.isFinite(input.area) ||
    input.area < winterPricingConfig.minimumArea ||
    input.area > winterPricingConfig.maximumArea
  ) {
    throw new RangeError(
      `Die Winterdienstfläche muss zwischen ${winterPricingConfig.minimumArea} und ${winterPricingConfig.maximumArea} m² liegen.`,
    );
  }

  const area = Math.round(input.area);
  const objectType = winterPricingConfig.objectTypes.find((item) => item.id === input.objectType);
  const surfaceProfileIsValid = isWinterSurfaceProfile(input.surfaceProfile);
  const access = winterPricingConfig.accessOptions.find((item) => item.id === input.access);
  const readiness = winterPricingConfig.readinessOptions.find((item) => item.id === input.readiness);

  if (!objectType || !surfaceProfileIsValid || !access || !readiness) {
    throw new TypeError("Die Winterdienstangaben sind ungültig.");
  }

  const normalizedInput = { ...input, area };
  if (!isAllowedWinterCombination(normalizedInput)) {
    if (input.readiness === "commercial24h" && input.objectType !== "commercial") {
      throw new RangeError("Der 24/7 Gewerbe-Service ist online nur für Gewerbeobjekte kalkulierbar.");
    }
    throw new RangeError(
      `Maschinelle Bearbeitung ist online erst ab ${winterPricingConfig.minimumMachineArea} m² und bei normaler Zugänglichkeit kalkulierbar.`,
    );
  }

  const appliedSurfaceProfile = input.access === "difficult" ? "manual" : input.surfaceProfile;
  const machineShare = roundToFourDecimals(
    appliedSurfaceProfile === "machine"
      ? 1
      : appliedSurfaceProfile === "manual"
        ? 0
        : Math.min(
            1,
            Math.max(
              0,
              (area - winterPricingConfig.minimumMachineArea) /
                (winterPricingConfig.automaticMachineArea - winterPricingConfig.minimumMachineArea),
            ),
          ),
  );
  const manualShare = roundToFourDecimals(1 - machineShare);

  const manualAreaServiceGross = tieredAreaCost(area, "manual");
  const machineAreaServiceGross = tieredAreaCost(area, "machine");
  const generalPriceMultiplier = 1 + winterPricingConfig.generalPriceAdjustmentPercent / 100;
  const standardAreaServiceGross = roundToCents(
    (manualAreaServiceGross * manualShare + machineAreaServiceGross * machineShare) *
      generalPriceMultiplier,
  );
  const standardMobilizationGross = roundToCents(
    winterPricingConfig.deployment.mobilizationGross * generalPriceMultiplier,
  );
  const adjustedMinimumGross = roundToCents(
    winterPricingConfig.deployment.minimumGross * generalPriceMultiplier,
  );
  const standardDeploymentSubtotalGross = roundToCents(
    standardMobilizationGross + standardAreaServiceGross,
  );
  const standardMinimumAdjustmentGross = roundToCents(
    Math.max(0, adjustedMinimumGross - standardDeploymentSubtotalGross),
  );
  const standardDeploymentGross = roundToCents(
    standardDeploymentSubtotalGross + standardMinimumAdjustmentGross,
  );
  const deploymentGross = roundToCents(standardDeploymentGross * readiness.multiplier);
  const mobilizationGross = roundToCents(standardMobilizationGross * readiness.multiplier);
  const minimumAdjustmentGross = roundToCents(
    standardMinimumAdjustmentGross * readiness.multiplier,
  );
  const areaServiceGross = roundToCents(
    deploymentGross - mobilizationGross - minimumAdjustmentGross,
  );

  const additionalBaseArea = Math.max(0, area - winterPricingConfig.monthlyBase.includedArea);
  const monthlyBaseBeforeAdjustmentGross = roundToIncrement(
    winterPricingConfig.monthlyBase.minimumGross +
      additionalBaseArea * winterPricingConfig.monthlyBase.grossPerAdditionalSquareMeter,
    winterPricingConfig.monthlyBase.roundingIncrement,
  );
  const standardMonthlyBaseGross = roundToCents(
    monthlyBaseBeforeAdjustmentGross * generalPriceMultiplier,
  );
  const monthlyBaseGross = roundToCents(standardMonthlyBaseGross * readiness.multiplier);
  const seasonBaseGross = roundToCents(monthlyBaseGross * winterPricingConfig.seasonMonths);
  const monthlyBaseNet = grossToNet(monthlyBaseGross);
  const discountedDeploymentGross = roundToCents(
    deploymentGross * (1 - winterPricingConfig.flatRateDeploymentDiscountPercent / 100),
  );
  const flatRateSeasonGross = roundToCents(
    seasonBaseGross + discountedDeploymentGross * winterPricingConfig.flatRateIncludedDeployments,
  );
  const flatRateMonthlyGross = roundToCents(flatRateSeasonGross / winterPricingConfig.seasonMonths);
  const sundayHolidaySurchargePercent =
    winterPricingConfig.additionalServices.sundayHoliday.surchargePercent;
  const springCleaningGrossPerSquareMeter =
    winterPricingConfig.additionalServices.springCleaning.grossPerSquareMeter;

  return {
    monthlyBaseGross,
    seasonBaseGross,
    deploymentGross,
    monthlyBaseNet,
    seasonBaseNet: roundToCents(monthlyBaseNet * winterPricingConfig.seasonMonths),
    deploymentNet: grossToNet(deploymentGross),
    seasonMonths: 5,
    contractPeriod: "1. November bis 31. März",
    vatRate: 19,
    readiness: input.readiness,
    readinessSurchargePercent: readiness.surchargePercent,
    baseBreakdown: {
      standardMonthlyBaseGross,
      readinessSurchargeGross: roundToCents(monthlyBaseGross - standardMonthlyBaseGross),
    },
    pricingOptions: {
      flex: {
        monthlyBaseGross,
        seasonBaseGross,
        deploymentGross,
      },
      plan: {
        includedDeployments: winterPricingConfig.flatRateIncludedDeployments,
        deploymentDiscountPercent: winterPricingConfig.flatRateDeploymentDiscountPercent,
        discountedDeploymentGross,
        monthlyGross: flatRateMonthlyGross,
        seasonGross: flatRateSeasonGross,
        additionalDeploymentGross: discountedDeploymentGross,
      },
    },
    additionalServices: {
      sundayHoliday: {
        surchargePercent: sundayHolidaySurchargePercent,
        flexSurchargeGrossPerDeployment: roundToCents(
          deploymentGross * (sundayHolidaySurchargePercent / 100),
        ),
        planSurchargeGrossPerDeployment: roundToCents(
          discountedDeploymentGross * (sundayHolidaySurchargePercent / 100),
        ),
        included: false,
      },
      springCleaning: {
        grossPerSquareMeter: springCleaningGrossPerSquareMeter,
        estimatedGross: roundToCents(area * springCleaningGrossPerSquareMeter),
        included: false,
      },
    },
    deploymentBreakdown: {
      areaSquareMeters: area,
      appliedSurfaceProfile,
      manualShare,
      machineShare,
      mobilizationGross,
      areaServiceGross,
      minimumAdjustmentGross,
      areaServiceRateGrossPerSquareMeter: roundToFourDecimals(areaServiceGross / area),
      standardDeploymentGross,
      readinessMultiplier: readiness.multiplier,
      readinessSurchargePercent: readiness.surchargePercent,
      readinessSurchargeGross: roundToCents(deploymentGross - standardDeploymentGross),
      effectiveDeploymentRateGrossPerSquareMeter: roundToFourDecimals(deploymentGross / area),
    },
  };
}

export function winterSeasonTotal(
  estimate: WinterPricingEstimate,
  deployments: number,
  pricingModel: "flex" | "plan" = "flex",
) {
  if (!Number.isInteger(deployments) || deployments < 0) {
    throw new RangeError("Die Anzahl der Einsätze muss eine nichtnegative ganze Zahl sein.");
  }

  if (pricingModel === "plan") {
    const plan = estimate.pricingOptions.plan;
    const additionalDeployments = Math.max(0, deployments - plan.includedDeployments);
    return roundToCents(plan.seasonGross + additionalDeployments * plan.additionalDeploymentGross);
  }

  return roundToCents(estimate.seasonBaseGross + estimate.deploymentGross * deployments);
}

export function winterPricingLabels(input: WinterPricingInput) {
  const readiness = winterPricingConfig.readinessOptions.find((item) => item.id === input.readiness);
  return {
    objectType:
      winterPricingConfig.objectTypes.find((item) => item.id === input.objectType)?.label ?? input.objectType,
    surfaceProfile:
      winterPricingConfig.surfaceProfiles.find((item) => item.id === input.surfaceProfile)?.label ?? input.surfaceProfile,
    access: winterPricingConfig.accessOptions.find((item) => item.id === input.access)?.label ?? input.access,
    readiness: readiness ? `${readiness.label} · ${readiness.schedule}` : input.readiness,
  };
}
