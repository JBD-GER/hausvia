export type WinterObjectType = "private" | "residential" | "commercial";
export type WinterSurfaceProfile = "manual" | "mixed" | "machine";
export type WinterAccess = "standard" | "difficult";

export type WinterPricingInput = {
  objectType: WinterObjectType;
  area: number;
  surfaceProfile: WinterSurfaceProfile;
  access: WinterAccess;
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
};

export const winterPricingConfig = {
  minimumArea: 10,
  maximumArea: 1_000,
  minimumMachineArea: 150,
  automaticMachineArea: 400,
  seasonMonths: 5,
  vatRate: 0.19,
  objectTypes: [
    {
      id: "private",
      label: "Privathaus",
      description: "Ein Hauseingang mit zugehörigem Gehweg oder kleiner Zufahrt.",
      factor: 0.95,
      minimumMonthlyBase: 69,
      minimumDeployment: 89,
    },
    {
      id: "residential",
      label: "Mehrfamilienhaus / WEG",
      description: "Gemeinschaftliche Wege und Zugänge eines Wohnobjekts.",
      factor: 1.05,
      minimumMonthlyBase: 89,
      minimumDeployment: 99,
    },
    {
      id: "commercial",
      label: "Gewerbeobjekt",
      description: "Besucher- oder Mitarbeiterzugänge mit erhöhtem Abstimmungsbedarf.",
      factor: 1.15,
      minimumMonthlyBase: 109,
      minimumDeployment: 119,
    },
  ],
  surfaceProfiles: [
    {
      id: "manual",
      label: "Überwiegend Handarbeit",
      description: "Schmale Wege, Eingänge oder Bereiche, die nicht maschinell befahrbar sind.",
      deploymentFactor: 1.15,
      baseFactor: 1.05,
    },
    {
      id: "mixed",
      label: "Gemischte Flächen",
      description: "Teilweise offen, teilweise schmal oder nur von Hand erreichbar.",
      deploymentFactor: 1,
      baseFactor: 1,
    },
    {
      id: "machine",
      label: "Maschinell gut befahrbar",
      description: "Weitgehend zusammenhängende, ausreichend breite und ebene Flächen.",
      deploymentFactor: 0.9,
      baseFactor: 0.95,
    },
  ],
  accessOptions: [
    {
      id: "standard",
      label: "Normal zugänglich",
      description: "Kurze Wege, keine besonderen Höhenunterschiede oder Hindernisse.",
      deploymentFactor: 1,
      baseFactor: 1,
    },
    {
      id: "difficult",
      label: "Erschwerte Ausführung",
      description: "Treppen, Rampen, Gefälle oder mehrere getrennte Teilflächen.",
      deploymentFactor: 1.18,
      baseFactor: 1.12,
    },
  ],
} as const;

function roundUpToFive(value: number) {
  return Math.ceil(value / 5) * 5;
}

function grossToNet(gross: number) {
  return Math.round((gross / (1 + winterPricingConfig.vatRate)) * 100) / 100;
}

function areaPrice(area: number) {
  return (
    Math.min(area, 50) * 1.1 +
    Math.min(Math.max(area - 50, 0), 100) * 0.85 +
    Math.min(Math.max(area - 150, 0), 250) * 0.6 +
    Math.max(area - 400, 0) * 0.4
  );
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
  const surfaceProfile = winterPricingConfig.surfaceProfiles.find((item) => item.id === input.surfaceProfile);
  const access = winterPricingConfig.accessOptions.find((item) => item.id === input.access);

  if (!objectType || !surfaceProfile || !access) {
    throw new TypeError("Die Winterdienstangaben sind ungültig.");
  }
  const selectedObjectType = objectType;
  const selectedAccess = access;

  const normalizedInput = { ...input, area };
  if (!isAllowedWinterCombination(normalizedInput)) {
    throw new RangeError(
      `Maschinelle Bearbeitung ist online erst ab ${winterPricingConfig.minimumMachineArea} m² und bei normaler Zugänglichkeit kalkulierbar.`,
    );
  }

  function grossForProfile(
    profile: (typeof winterPricingConfig.surfaceProfiles)[number],
    profileArea: number,
  ) {
    return {
      monthlyBaseGross: roundUpToFive(
        Math.max(
          selectedObjectType.minimumMonthlyBase,
          (49 + profileArea * 0.18) * selectedObjectType.factor * profile.baseFactor * selectedAccess.baseFactor,
        ),
      ),
      deploymentGross: roundUpToFive(
        Math.max(
          selectedObjectType.minimumDeployment,
          (29 + areaPrice(profileArea)) *
            selectedObjectType.factor *
            profile.deploymentFactor *
            selectedAccess.deploymentFactor,
        ),
      ),
    };
  }

  const gross = grossForProfile(surfaceProfile, area);
  let monthlyBaseGross = gross.monthlyBaseGross;
  let deploymentGross = gross.deploymentGross;

  const previousProfileFloor =
    input.surfaceProfile === "mixed" && area >= winterPricingConfig.minimumMachineArea
      ? {
          profileId: "manual",
          area: winterPricingConfig.minimumMachineArea - 1,
        }
      : input.surfaceProfile === "machine" && area >= winterPricingConfig.automaticMachineArea
        ? {
            profileId: "mixed",
            area: winterPricingConfig.automaticMachineArea - 1,
          }
        : null;

  if (previousProfileFloor) {
    const previousProfile = winterPricingConfig.surfaceProfiles.find(
      (profile) => profile.id === previousProfileFloor.profileId,
    );
    if (previousProfile) {
      const floor = grossForProfile(previousProfile, previousProfileFloor.area);
      monthlyBaseGross = Math.max(monthlyBaseGross, floor.monthlyBaseGross);
      deploymentGross = Math.max(deploymentGross, floor.deploymentGross);
    }
  }
  const seasonBaseGross = monthlyBaseGross * winterPricingConfig.seasonMonths;
  const monthlyBaseNet = grossToNet(monthlyBaseGross);

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
  };
}

export function winterSeasonTotal(estimate: WinterPricingEstimate, deployments: number) {
  if (!Number.isInteger(deployments) || deployments < 0) {
    throw new RangeError("Die Anzahl der Einsätze muss eine nichtnegative ganze Zahl sein.");
  }

  return estimate.seasonBaseGross + estimate.deploymentGross * deployments;
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
