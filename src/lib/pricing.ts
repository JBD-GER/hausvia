export type ObjectTypeId = "weg" | "private" | "commercial" | "other";
export type FrequencyId = "oneTime" | "monthly" | "weekly" | "multiWeekly" | "daily" | "customHigh";
export type ComplexityId = "simple" | "normal" | "elevated" | "complex";
export type ServiceId =
  | "caretaker"
  | "interiorCleaning"
  | "outdoorCleaning"
  | "binService"
  | "gardenCare"
  | "lawnMowing"
  | "hedgeCutting"
  | "leafRemoval"
  | "winterService"
  | "technicalChecks"
  | "lightingChecks"
  | "technicalRooms"
  | "contractorAccess"
  | "meterReading"
  | "minorMaintenance";

export type EstimateInput = {
  objectType: ObjectTypeId;
  usableArea: number;
  outdoorArea: number;
  gardenArea?: number;
  services: ServiceId[];
  frequency: FrequencyId;
  complexity: ComplexityId;
};

export type EstimateResult = {
  lower: number;
  upper: number;
  estimatedMonthlyPrice: number;
  estimateLabel: string;
  billingPeriodLabel: string;
  isOneTime: boolean;
  basePrice: number;
  objectTypeLabel: string;
  frequencyLabel: string;
  complexityLabel: string;
  outdoorRate: number;
  serviceFactor: number;
  hasGardenCare: boolean;
  gardenArea: number;
  pavedOutdoorArea: number;
  requiresManualReview: boolean;
  manualReviewReason?: string;
  gardenNote?: string;
};

export const pricingConfig = {
  areaRates: {
    usableAreaPerSqm: 0.5,
    simpleOutdoorPerSqm: 0.35,
  },
  roundingStep: 10,
  manualReviewAreaThreshold: 5_000,
  oneTimeSurchargeMultiplier: 1.35,
  objectTypes: [
    {
      id: "weg",
      label: "WEG / Mehrfamilienhaus",
      factor: 1,
      minimumMonthly: 299,
      description:
        "Für WEGs zählen vor allem regelmäßige Pflege, Kontrollgänge, Mülldienst, Treppenhaus, Außenflächen und klare Umlagefähigkeit.",
    },
    {
      id: "private",
      label: "Privathaushalt / Einfamilienhaus",
      factor: 0.9,
      minimumMonthly: 149,
      description:
        "Für Privathaushalte geht es meist um Gartenpflege, Außenanlagen, Reinigung, Winterdienst und regelmäßige Entlastung.",
    },
    {
      id: "commercial",
      label: "Gewerbeobjekt / Gewerbekomplex",
      factor: 1.15,
      minimumMonthly: 399,
      description:
        "Bei Gewerbeobjekten stehen Zuverlässigkeit, gepflegte Außenwirkung, Kontrollgänge, Reinigung und planbare Abläufe im Vordergrund.",
    },
    {
      id: "other",
      label: "Sonstiges Objekt",
      factor: 1,
      minimumMonthly: 249,
      description:
        "Für besondere Objekte wird der Bedarf individuell eingeordnet und mit einer realistischen monatlichen Einschätzung vorbereitet.",
    },
  ],
  frequencies: [
    { id: "oneTime", label: "einmalig", factor: 1 },
    { id: "monthly", label: "monatlich / selten", factor: 0.75 },
    { id: "weekly", label: "1x pro Woche", factor: 0.9 },
    { id: "multiWeekly", label: "2–3x pro Woche", factor: 1.1 },
    { id: "daily", label: "täglich / werktäglich", factor: 1.35 },
    { id: "customHigh", label: "individuell / hoher Bedarf", factor: 1.5 },
  ],
  complexity: [
    { id: "simple", label: "einfach", factor: 0.9 },
    { id: "normal", label: "normal", factor: 1 },
    { id: "elevated", label: "erhöht", factor: 1.2 },
    { id: "complex", label: "komplex", factor: 1.4 },
  ],
  services: [
    {
      id: "caretaker",
      label: "Hausmeisterservice / Objektbetreuung",
      surcharge: 0,
      description: "Laufende Betreuung, Sichtkontrollen und klare Zuständigkeit am Objekt.",
    },
    {
      id: "interiorCleaning",
      label: "Treppenhausreinigung / Innenreinigung",
      surcharge: 0.15,
      description: "Treppenhaus, Flure und gemeinschaftliche Innenbereiche regelmäßig pflegen.",
    },
    {
      id: "outdoorCleaning",
      label: "Außenreinigung / Hof / Müllplatz",
      surcharge: 0.1,
      description: "Hof, Eingangswege und Müllplatz sichtbar ordentlich halten.",
    },
    {
      id: "binService",
      label: "Mülldienst",
      surcharge: 0.1,
      description: "Tonnen bereitstellen, zurückstellen und den Müllbereich im Blick behalten.",
    },
    {
      id: "gardenCare",
      label: "Gartenpflege",
      surcharge: 0.25,
      description: "Grünflächen und Außenanlagen saisonal oder regelmäßig pflegen.",
    },
    {
      id: "lawnMowing",
      label: "Rasenmähen",
      surcharge: 0.1,
      description: "Rasenflächen in einem passenden Turnus mähen.",
    },
    {
      id: "hedgeCutting",
      label: "Hecken- und Strauchschnitt",
      surcharge: 0.1,
      description: "Hecken und Sträucher nach Saison und Vereinbarung schneiden.",
    },
    {
      id: "leafRemoval",
      label: "Laubentfernung",
      surcharge: 0.08,
      description: "Laub auf Wegen, Eingängen und Außenflächen entfernen.",
    },
    {
      id: "winterService",
      label: "Winterdienst",
      surcharge: 0.2,
      description: "Saisonale Unterstützung beim Räumen und Streuen nach Vereinbarung.",
    },
    {
      id: "technicalChecks",
      label: "Technische Kontrollgänge",
      surcharge: 0.12,
      description: "Technische und gemeinschaftliche Bereiche regelmäßig per Sichtkontrolle prüfen.",
    },
    {
      id: "lightingChecks",
      label: "Beleuchtung kontrollieren",
      surcharge: 0.05,
      description: "Beleuchtung prüfen und Auffälligkeiten melden.",
    },
    {
      id: "technicalRooms",
      label: "Heizungs-/Technikräume kontrollieren",
      surcharge: 0.12,
      description: "Technikräume im vereinbarten Umfang kontrollieren.",
    },
    {
      id: "contractorAccess",
      label: "Zugang für Dienstleister organisieren",
      surcharge: 0.08,
      description: "Termine vor Ort erleichtern und Zugang nach Absprache ermöglichen.",
    },
    {
      id: "meterReading",
      label: "Zähler ablesen",
      surcharge: 0.05,
      description: "Einfache Ablese- und Kontrollaufgaben übernehmen.",
    },
    {
      id: "minorMaintenance",
      label: "Kleinere Wartungs- und Kontrollaufgaben",
      surcharge: 0.05,
      description: "Einfache Kontroll- oder Bedienungsaufgaben ohne größere Handwerksleistungen.",
    },
  ],
  servicePackageIds: [
    "caretaker",
    "interiorCleaning",
    "outdoorCleaning",
    "binService",
    "gardenCare",
    "lawnMowing",
    "hedgeCutting",
    "leafRemoval",
    "winterService",
    "technicalChecks",
    "lightingChecks",
    "technicalRooms",
    "contractorAccess",
    "meterReading",
    "minorMaintenance",
  ] as ServiceId[],
  gardenServiceIds: ["gardenCare", "lawnMowing", "hedgeCutting", "leafRemoval"] as ServiceId[],
  usableAreaServiceIds: [
    "caretaker",
    "interiorCleaning",
    "technicalChecks",
    "lightingChecks",
    "technicalRooms",
    "contractorAccess",
    "meterReading",
    "minorMaintenance",
  ] as ServiceId[],
  simpleOutdoorServiceIds: ["outdoorCleaning"] as ServiceId[],
};

function roundDown(value: number, step: number) {
  return Math.floor(value / step) * step;
}

function roundUp(value: number, step: number) {
  return Math.ceil(value / step) * step;
}

function getGardenGuidance(outdoorArea: number) {
  if (outdoorArea <= 0) {
    return {
      lower: 110,
      upper: 220,
      note:
        "Die Gartenpflege ist in der Einschätzung bereits berücksichtigt. Für eine genauere Spanne hilft eine grobe Angabe der aktiv zu betreuenden Außenfläche.",
    };
  }

  if (outdoorArea <= 500) {
    return {
      lower: 110,
      upper: 220,
      note:
        "Die Gartenpflege ist in der Einschätzung bereits berücksichtigt. Je nach Wachstum, Saison, Pflegezustand und gewünschter Häufigkeit kann dieser Anteil deutlich variieren.",
    };
  }

  if (outdoorArea <= 1000) {
    return {
      lower: 220,
      upper: 440,
      note:
        "Die Gartenpflege ist in der Einschätzung bereits berücksichtigt. Bei mittleren Außenflächen beeinflussen Saison, Pflegezustand und Häufigkeit die Spanne spürbar.",
    };
  }

  return {
    lower: Math.max(550, outdoorArea * 0.45),
    upper: Math.max(850, outdoorArea * 0.75),
    note:
      "Große Außenflächen werden bewusst höher angesetzt. Für Gartenpflege über 1.000 m² ist eine individuelle Kalkulation besonders sinnvoll.",
  };
}

export function getServiceLabels(serviceIds: ServiceId[]) {
  return serviceIds
    .map((serviceId) => pricingConfig.services.find((service) => (service.id as ServiceId) === serviceId)?.label)
    .filter(Boolean) as string[];
}

export function calculateEstimate(input: EstimateInput): EstimateResult {
  const objectType =
    pricingConfig.objectTypes.find((item) => item.id === input.objectType) ?? pricingConfig.objectTypes[0];
  const frequency =
    pricingConfig.frequencies.find((item) => item.id === input.frequency) ?? pricingConfig.frequencies[1];
  const complexity =
    pricingConfig.complexity.find((item) => item.id === input.complexity) ?? pricingConfig.complexity[1];

  const usableArea = Math.max(0, Number(input.usableArea) || 0);
  const outdoorArea = Math.max(0, Number(input.outdoorArea) || 0);
  const selectedServices = pricingConfig.services.filter((service) =>
    input.services.includes(service.id as ServiceId),
  );

  const hasGardenCare = input.services.some((serviceId) => pricingConfig.gardenServiceIds.includes(serviceId));
  const hasUsableAreaService = input.services.some((serviceId) =>
    pricingConfig.usableAreaServiceIds.includes(serviceId),
  );
  const hasSimpleOutdoor = input.services.some((serviceId) =>
    pricingConfig.simpleOutdoorServiceIds.includes(serviceId),
  );

  // `outdoorArea` is the total actively serviced outdoor area. It must be split
  // before pricing so that the same square metres cannot be billed once as a
  // paved/cleaned area and a second time as garden. Older callers do not yet
  // provide `gardenArea`; for garden requests, treating the full outdoor area
  // as garden is the conservative, non-duplicating fallback.
  const requestedGardenArea =
    input.gardenArea === undefined
      ? hasGardenCare
        ? outdoorArea
        : 0
      : Math.max(0, Number(input.gardenArea) || 0);
  const gardenArea = Math.min(outdoorArea, requestedGardenArea);
  const pavedOutdoorArea = Math.max(0, outdoorArea - gardenArea);

  const usableAreaServices = selectedServices.filter((service) =>
    pricingConfig.usableAreaServiceIds.includes(service.id as ServiceId),
  );
  const simpleOutdoorServices = selectedServices.filter((service) =>
    pricingConfig.simpleOutdoorServiceIds.includes(service.id as ServiceId),
  );
  const fixedServices = selectedServices.filter((service) => {
    const serviceId = service.id as ServiceId;

    return (
      !pricingConfig.gardenServiceIds.includes(serviceId) &&
      !pricingConfig.usableAreaServiceIds.includes(serviceId) &&
      !pricingConfig.simpleOutdoorServiceIds.includes(serviceId)
    );
  });

  const usableAreaServiceFactor =
    1 + usableAreaServices.reduce((sum, service) => sum + service.surcharge, 0);
  const simpleOutdoorServiceFactor =
    1 + simpleOutdoorServices.reduce((sum, service) => sum + service.surcharge, 0);
  const fixedServiceShare = fixedServices.reduce((sum, service) => sum + service.surcharge, 0);
  const rawUsableAreaBase = hasUsableAreaService
    ? usableArea * pricingConfig.areaRates.usableAreaPerSqm
    : 0;
  const rawSimpleOutdoorBase = hasSimpleOutdoor
    ? pavedOutdoorArea * pricingConfig.areaRates.simpleOutdoorPerSqm
    : 0;
  const usableAreaBase = rawUsableAreaBase * usableAreaServiceFactor;
  const simpleOutdoorBase = rawSimpleOutdoorBase * simpleOutdoorServiceFactor;
  // Mülldienst and Winterdienst have no reliable area basis. A share of the
  // object minimum keeps them priced without making large, unrelated areas
  // inflate their cost.
  const fixedServiceBase = objectType.minimumMonthly * fixedServiceShare;
  const nonGardenBasePrice = usableAreaBase + simpleOutdoorBase + fixedServiceBase;
  const rawAreaBase = rawUsableAreaBase + rawSimpleOutdoorBase;
  const serviceFactor = rawAreaBase
    ? (usableAreaBase + simpleOutdoorBase) / rawAreaBase
    : 1 + fixedServiceShare;
  const isOneTime = input.frequency === "oneTime";
  const oneTimeMultiplier = isOneTime ? pricingConfig.oneTimeSurchargeMultiplier : 1;
  const workloadFactor =
    objectType.factor * frequency.factor * complexity.factor * oneTimeMultiplier;
  const minimumPrice = objectType.minimumMonthly * oneTimeMultiplier;
  const nonGardenEstimate = nonGardenBasePrice * workloadFactor;
  const gardenGuidance = hasGardenCare ? getGardenGuidance(gardenArea) : undefined;
  const gardenLower = (gardenGuidance?.lower ?? 0) * workloadFactor;
  const gardenUpper = (gardenGuidance?.upper ?? 0) * workloadFactor;
  const gardenMidpoint = (gardenLower + gardenUpper) / 2;
  const minimumAdjustedEstimate = Math.max(nonGardenEstimate + gardenMidpoint, minimumPrice);

  const lower = Math.max(
    minimumPrice,
    gardenGuidance ? nonGardenEstimate * 0.85 + gardenLower : minimumAdjustedEstimate * 0.85,
  );
  const upper = Math.max(
    minimumPrice,
    gardenGuidance ? nonGardenEstimate * 1.25 + gardenUpper : minimumAdjustedEstimate * 1.25,
  );
  let gardenNote: string | undefined;

  if (gardenGuidance) {
    gardenNote = gardenGuidance.note;
  }

  const basePrice =
    nonGardenBasePrice +
    (gardenGuidance ? (gardenGuidance.lower + gardenGuidance.upper) / 2 : 0);
  const outdoorRate = hasGardenCare
    ? gardenArea > 0
      ? gardenMidpoint / gardenArea
      : 0
    : hasSimpleOutdoor
      ? pricingConfig.areaRates.simpleOutdoorPerSqm
      : 0;
  const oversizedAreas: string[] = [];

  if (usableArea > pricingConfig.manualReviewAreaThreshold) {
    oversizedAreas.push("Innenfläche");
  }

  if (outdoorArea > pricingConfig.manualReviewAreaThreshold) {
    oversizedAreas.push("Außenfläche");
  }

  const requiresManualReview = oversizedAreas.length > 0;
  const manualReviewReason = requiresManualReview
    ? `${oversizedAreas.join(" und ")} über ${pricingConfig.manualReviewAreaThreshold.toLocaleString("de-DE")} m² ${oversizedAreas.length === 1 ? "erfordert" : "erfordern"} eine individuelle Kalkulation.`
    : undefined;

  return {
    lower: Math.max(minimumPrice, roundDown(lower, pricingConfig.roundingStep)),
    upper: Math.max(minimumPrice, roundUp(upper, pricingConfig.roundingStep)),
    estimatedMonthlyPrice: Math.max(minimumPrice, Math.round(minimumAdjustedEstimate)),
    estimateLabel: isOneTime ? "Einmalige Ersteinschätzung" : "Monatliche Ersteinschätzung",
    billingPeriodLabel: isOneTime ? "einmalig" : "pro Monat",
    isOneTime,
    basePrice,
    objectTypeLabel: objectType.label,
    frequencyLabel: frequency.label,
    complexityLabel: complexity.label,
    outdoorRate,
    serviceFactor,
    hasGardenCare,
    gardenArea,
    pavedOutdoorArea,
    requiresManualReview,
    manualReviewReason,
    gardenNote,
  };
}
