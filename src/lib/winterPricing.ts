export type WinterObjectType = "private" | "residential" | "commercial";
export type WinterSurfaceProfile = "manual" | "mixed" | "machine";
export type WinterAccess = "standard" | "difficult";

export type WinterPricingInput = {
  objectType: WinterObjectType;
  area: number;
  surfaceProfile: WinterSurfaceProfile;
  access: WinterAccess;
};

export type WinterDeploymentBreakdown = {
  areaSquareMeters: number;
  appliedSurfaceProfile: WinterSurfaceProfile;
  manualShare: number;
  machineShare: number;
  clearingRateGrossPerSquareMeter: number;
  gritReferenceRateGrossPerSquareMeter: number;
  gritRateGrossPerSquareMeter: number;
  totalRateGrossPerSquareMeter: number;
  clearingGross: number;
  gritGross: number;
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
  pricingOptions: {
    flex: {
      monthlyBaseGross: number;
      seasonBaseGross: number;
      deploymentGross: number;
    };
    plan: {
      includedDeployments: number;
      monthlyGross: number;
      seasonGross: number;
      additionalDeploymentGross: number;
    };
  };
  deploymentBreakdown: WinterDeploymentBreakdown;
};

const referencePosition = 0.8;
const sourceRanges = {
  manualClearing: { low: 1, high: 2.5 },
  machineClearing: { low: 1, high: 1.5 },
  grit: { low: 0.2, high: 0.5 },
} as const;

function rateAtReferencePosition({ low, high }: { low: number; high: number }) {
  return Math.round((low + referencePosition * (high - low)) * 100) / 100;
}

function roundToCents(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundUpToFiveCents(value: number) {
  return Math.ceil((value - Number.EPSILON) * 20) / 20;
}

function roundToFourDecimals(value: number) {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function roundToIncrement(value: number, increment: number) {
  return Math.round((value + Number.EPSILON) / increment) * increment;
}

const manualClearingRateGross = rateAtReferencePosition(sourceRanges.manualClearing);
const machineClearingRateGross = rateAtReferencePosition(sourceRanges.machineClearing);
const gritReferenceRateGross = rateAtReferencePosition(sourceRanges.grit);
const gritRateGross = roundUpToFiveCents(gritReferenceRateGross);

export const winterPricingConfig = {
  minimumArea: 10,
  maximumArea: 1_000,
  minimumMachineArea: 150,
  automaticMachineArea: 400,
  seasonMonths: 5,
  vatRate: 0.19,
  monthlyBase: {
    minimumGross: 70,
    includedArea: 100,
    grossPerAdditionalSquareMeter: 0.1,
    roundingIncrement: 5,
  },
  flatRateIncludedDeployments: 10,
  referenceSource: "MyHammer",
  referenceUpdatedAt: "2026-02-05",
  referencePosition,
  sourceRanges,
  appliedRates: {
    manualClearingGrossPerSquareMeter: manualClearingRateGross,
    machineClearingGrossPerSquareMeter: machineClearingRateGross,
    gritReferenceGrossPerSquareMeter: gritReferenceRateGross,
    gritGrossPerSquareMeter: gritRateGross,
  },
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
  return !(
    input.surfaceProfile === "machine" &&
    (input.area < winterPricingConfig.minimumMachineArea || input.access !== "standard")
  );
}

export function parseWinterPricingInput(values: Record<string, unknown>): WinterPricingInput | null {
  const objectType = singleString(values.objectType);
  const surfaceProfile = singleString(values.surfaceProfile);
  const access = singleString(values.access);
  const areaValue = parseWinterArea(values.area);

  if (
    !isWinterObjectType(objectType) ||
    !isWinterSurfaceProfile(surfaceProfile) ||
    !isWinterAccess(access) ||
    areaValue === null ||
    areaValue < winterPricingConfig.minimumArea ||
    areaValue > winterPricingConfig.maximumArea
  ) {
    return null;
  }

  if (
    surfaceProfile === "machine" &&
    (areaValue < winterPricingConfig.minimumMachineArea || access !== "standard")
  ) {
    return null;
  }

  const input: WinterPricingInput = {
    objectType,
    area: Math.round(areaValue),
    surfaceProfile,
    access,
  };

  return isAllowedWinterCombination(input) ? input : null;
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

  if (!objectType || !surfaceProfileIsValid || !access) {
    throw new TypeError("Die Winterdienstangaben sind ungültig.");
  }

  const normalizedInput = { ...input, area };
  if (!isAllowedWinterCombination(normalizedInput)) {
    throw new RangeError(
      `Maschinelle Bearbeitung ist online erst ab ${winterPricingConfig.minimumMachineArea} m² und bei normaler Zugänglichkeit kalkulierbar.`,
    );
  }

  const appliedSurfaceProfile = input.access === "difficult" ? "manual" : input.surfaceProfile;
  // Im Mischbereich wächst der Maschinenanteil gleichmäßig von 0 auf 100 Prozent.
  // So bleiben die Referenzsätze nachvollziehbar und der Einsatzpreis fällt an
  // den automatischen Profilgrenzen nicht plötzlich ab.
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
  const clearingRateGrossPerSquareMeter = roundToFourDecimals(
    manualClearingRateGross * manualShare + machineClearingRateGross * machineShare,
  );
  const clearingGross = roundToCents(area * clearingRateGrossPerSquareMeter);
  const gritGross = roundToCents(area * gritRateGross);
  const deploymentGross = roundToCents(clearingGross + gritGross);
  const additionalBaseArea = Math.max(0, area - winterPricingConfig.monthlyBase.includedArea);
  const monthlyBaseGross = roundToIncrement(
    winterPricingConfig.monthlyBase.minimumGross +
      additionalBaseArea * winterPricingConfig.monthlyBase.grossPerAdditionalSquareMeter,
    winterPricingConfig.monthlyBase.roundingIncrement,
  );
  const seasonBaseGross = monthlyBaseGross * winterPricingConfig.seasonMonths;
  const monthlyBaseNet = grossToNet(monthlyBaseGross);
  const flatRateSeasonGross = roundToCents(
    seasonBaseGross + deploymentGross * winterPricingConfig.flatRateIncludedDeployments,
  );
  const flatRateMonthlyGross = roundToCents(flatRateSeasonGross / winterPricingConfig.seasonMonths);

  return {
    monthlyBaseGross,
    seasonBaseGross,
    deploymentGross,
    monthlyBaseNet,
    seasonBaseNet: Math.round(monthlyBaseNet * winterPricingConfig.seasonMonths * 100) / 100,
    deploymentNet: grossToNet(deploymentGross),
    seasonMonths: 5,
    contractPeriod: "1. November bis 31. März",
    vatRate: 19,
    pricingOptions: {
      flex: {
        monthlyBaseGross,
        seasonBaseGross,
        deploymentGross,
      },
      plan: {
        includedDeployments: winterPricingConfig.flatRateIncludedDeployments,
        monthlyGross: flatRateMonthlyGross,
        seasonGross: flatRateSeasonGross,
        additionalDeploymentGross: deploymentGross,
      },
    },
    deploymentBreakdown: {
      areaSquareMeters: area,
      appliedSurfaceProfile,
      manualShare,
      machineShare,
      clearingRateGrossPerSquareMeter,
      gritReferenceRateGrossPerSquareMeter: gritReferenceRateGross,
      gritRateGrossPerSquareMeter: gritRateGross,
      totalRateGrossPerSquareMeter: roundToFourDecimals(clearingRateGrossPerSquareMeter + gritRateGross),
      clearingGross,
      gritGross,
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
  return {
    objectType:
      winterPricingConfig.objectTypes.find((item) => item.id === input.objectType)?.label ?? input.objectType,
    surfaceProfile:
      winterPricingConfig.surfaceProfiles.find((item) => item.id === input.surfaceProfile)?.label ?? input.surfaceProfile,
    access: winterPricingConfig.accessOptions.find((item) => item.id === input.access)?.label ?? input.access,
  };
}
