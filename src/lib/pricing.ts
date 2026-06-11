export type ObjectTypeId = "weg" | "private" | "commercial" | "other";
export type FrequencyId = "monthly" | "weekly" | "multiWeekly" | "daily" | "customHigh";
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
  services: ServiceId[];
  frequency: FrequencyId;
  complexity: ComplexityId;
};

export type EstimateResult = {
  lower: number;
  upper: number;
  estimatedMonthlyPrice: number;
  basePrice: number;
  objectTypeLabel: string;
  frequencyLabel: string;
  complexityLabel: string;
  outdoorRate: number;
  serviceFactor: number;
  hasGardenCare: boolean;
  gardenNote?: string;
};

export const pricingConfig = {
  areaRates: {
    usableAreaPerSqm: 0.5,
    outdoorCarePerSqm: 1.25,
    simpleOutdoorPerSqm: 0.35,
  },
  roundingStep: 10,
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
    "technicalChecks",
    "lightingChecks",
    "contractorAccess",
    "minorMaintenance",
  ] as ServiceId[],
  gardenServiceIds: ["gardenCare", "lawnMowing", "hedgeCutting", "leafRemoval"] as ServiceId[],
  simpleOutdoorServiceIds: ["outdoorCleaning", "binService"] as ServiceId[],
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
  const selectedServices = pricingConfig.services.filter((service) => input.services.includes(service.id as ServiceId));

  const hasGardenCare = input.services.some((serviceId) => pricingConfig.gardenServiceIds.includes(serviceId));
  const hasSimpleOutdoor = input.services.some((serviceId) =>
    pricingConfig.simpleOutdoorServiceIds.includes(serviceId),
  );
  const outdoorRate = hasGardenCare
    ? pricingConfig.areaRates.outdoorCarePerSqm
    : hasSimpleOutdoor
      ? pricingConfig.areaRates.simpleOutdoorPerSqm
      : 0;

  const basePrice = usableArea * pricingConfig.areaRates.usableAreaPerSqm + outdoorArea * outdoorRate;
  const serviceFactor = 1 + selectedServices.reduce((sum, service) => sum + service.surcharge, 0);
  const rawEstimate = basePrice * objectType.factor * frequency.factor * serviceFactor * complexity.factor;
  const minimumAdjustedEstimate = Math.max(rawEstimate, objectType.minimumMonthly);

  let lower = Math.max(objectType.minimumMonthly, minimumAdjustedEstimate * 0.85);
  let upper = Math.max(objectType.minimumMonthly, minimumAdjustedEstimate * 1.25);
  let gardenNote: string | undefined;

  if (hasGardenCare) {
    const gardenGuidance = getGardenGuidance(outdoorArea);
    lower = Math.max(lower, gardenGuidance.lower);
    upper = Math.max(upper, gardenGuidance.upper);
    gardenNote = gardenGuidance.note;
  }

  return {
    lower: roundDown(lower, pricingConfig.roundingStep),
    upper: roundUp(upper, pricingConfig.roundingStep),
    estimatedMonthlyPrice: Math.round(minimumAdjustedEstimate),
    basePrice,
    objectTypeLabel: objectType.label,
    frequencyLabel: frequency.label,
    complexityLabel: complexity.label,
    outdoorRate,
    serviceFactor,
    hasGardenCare,
    gardenNote,
  };
}
