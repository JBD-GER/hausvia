/**
 * Pure pricing engine for offer drafts and immutable offer-version snapshots.
 *
 * All monetary values are integer euro cents. Percentages and tax rates use
 * basis points (10_000 bps = 100%). Quantity drivers may contain decimals and
 * are rounded half-up at component level to a full cent.
 */

export const BILLING_BUCKETS = ["one_time", "monthly", "seasonal", "per_visit"] as const;

export type BillingBucket = (typeof BILLING_BUCKETS)[number];
export type OfferPricingItemKind = "standard" | "winter" | "custom";
export type OfferFrequency =
  | "once"
  | "weekly"
  | "multiple_weekly"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "on_demand";
export type WinterPricingModel =
  | "seasonal_flat"
  | "monthly_plus_visit"
  | "per_visit"
  | "custom_flat";

export type BillingBucketAmountsDto = Record<BillingBucket, number>;

export type OfferDiscountDto =
  | {
      id?: string;
      type: "percent";
      /** 1_000 bps = 10%. Values above 10_000 are allowed and safely capped. */
      valueBps: number;
      reason?: string;
    }
  | {
      id?: string;
      type: "fixed";
      valueCents: number;
      reason?: string;
    };

export type OfferDiscountInputDto = OfferDiscountDto | null | undefined;

export type OfferPricingDriversDto = {
  /** Number of identical service packages. Defaults to 1. */
  quantity?: number;
  areaSquareMeters?: number;
  hours?: number;
  visits?: number;
};

export type RuleBaseComponent = "base" | "area" | "hours" | "visits" | "material";

export type ConfigurablePricingRuleDto = {
  baseCents?: number;
  perSquareMeterCents?: number;
  minimumCents?: number;
  perVisitCents?: number;
  perHourCents?: number;
  /** Multiplies every configured component. Defaults to 10_000 bps (100%). */
  frequencyFactorBps?: number;
  /** Added after the frequency factor. */
  seasonalSurchargeBps?: number;
  materialFeeCents?: number;
  /** Optional advanced routing for individual pricing components. */
  componentBuckets?: Partial<Record<RuleBaseComponent, BillingBucket>>;
  /** Bucket to which the minimum price applies. */
  minimumBucket?: BillingBucket;
};

export type OfferManualPriceOverrideDto = {
  /** Only supplied buckets are overridden; all other automatic prices remain. */
  amountsCents: Partial<Record<BillingBucket, number>>;
  reason?: string;
};

type OfferPricingItemBaseDto = {
  id?: string;
  label: string;
  taxRateBps: number;
  discounts?: readonly OfferDiscountInputDto[];
  manualOverride?: OfferManualPriceOverrideDto | null;
};

export type StandardOfferPricingItemDto = OfferPricingItemBaseDto & {
  kind: "standard";
  billingBucket: BillingBucket;
  rule: ConfigurablePricingRuleDto;
  drivers?: OfferPricingDriversDto;
};

export type WinterOfferPricingItemDto = OfferPricingItemBaseDto & {
  kind: "winter";
  model: WinterPricingModel;
  rule: ConfigurablePricingRuleDto;
  drivers?: OfferPricingDriversDto;
  /** Explicit flat amount for custom_flat; falls back to rule.baseCents. */
  customFlatCents?: number;
  /** Defaults to seasonal for custom_flat. */
  customFlatBucket?: BillingBucket;
};

export type CustomOfferPricingItemDto = OfferPricingItemBaseDto & {
  kind: "custom";
  billingBucket: BillingBucket;
  unitPriceCents: number;
  quantity?: number;
};

export type OfferPricingItemDto =
  | StandardOfferPricingItemDto
  | WinterOfferPricingItemDto
  | CustomOfferPricingItemDto;

export type OfferPricingInputDto = {
  items: readonly OfferPricingItemDto[];
  overallDiscounts?: readonly OfferDiscountInputDto[];
};

export type PricingComponentCode =
  | RuleBaseComponent
  | "custom_unit"
  | "frequency_adjustment"
  | "seasonal_surcharge"
  | "minimum_adjustment";

export type PricingComponentResultDto = {
  code: PricingComponentCode;
  label: string;
  billingBucket: BillingBucket;
  /** May be negative for a frequency factor below 100%. */
  amountCents: number;
};

export type ManualOverrideResultDto = {
  billingBucket: BillingBucket;
  automaticCents: number;
  overriddenCents: number;
  differenceCents: number;
  reason: string | null;
};

export type DiscountAllocationDto = {
  itemId: string;
  billingBucket: BillingBucket;
  amountCents: number;
};

export type DiscountApplicationDto = {
  id: string;
  type: OfferDiscountDto["type"];
  reason: string | null;
  baseCents: number;
  requestedCents: number;
  appliedCents: number;
  capped: boolean;
  allocations: DiscountAllocationDto[];
};

export type OfferItemBucketResultDto = {
  subtotalCents: number;
  itemDiscountCents: number;
  overallDiscountCents: number;
  discountCents: number;
  netCents: number;
  taxCents: number;
  grossCents: number;
};

export type OfferPricingItemResultDto = {
  id: string;
  label: string;
  kind: OfferPricingItemKind;
  winterModel: WinterPricingModel | null;
  taxRateBps: number;
  pricingSource: "automatic" | "manual" | "mixed";
  automaticComponents: PricingComponentResultDto[];
  automaticAmountsCents: BillingBucketAmountsDto;
  amountsBeforeDiscountCents: BillingBucketAmountsDto;
  manualOverrides: ManualOverrideResultDto[];
  discountApplications: DiscountApplicationDto[];
  subtotalCents: number;
  itemDiscountCents: number;
  overallDiscountCents: number;
  discountCents: number;
  netCents: number;
  taxCents: number;
  grossCents: number;
  buckets: Record<BillingBucket, OfferItemBucketResultDto>;
};

export type OfferBillingBucketTotalDto = OfferItemBucketResultDto & {
  billingBucket: BillingBucket;
  label: string;
};

export type OfferPricingTotalsDto = {
  subtotalCents: number;
  itemDiscountCents: number;
  overallDiscountCents: number;
  discountCents: number;
  netCents: number;
  taxCents: number;
  grossCents: number;
};

export type OfferPricingResultDto = {
  items: OfferPricingItemResultDto[];
  overallDiscountApplications: DiscountApplicationDto[];
  bucketTotals: Record<BillingBucket, OfferBillingBucketTotalDto>;
  activeBillingBuckets: BillingBucket[];
  hasMixedBillingBuckets: boolean;
  /** An arithmetic summary for documents; bucketTotals remain the canonical commercial view. */
  totals: OfferPricingTotalsDto;
};

export type OfferPricingBucketRowDto = OfferBillingBucketTotalDto & {
  formattedNet: string;
  formattedTax: string;
  formattedGross: string;
};

export const billingBucketLabels: Record<BillingBucket, string> = {
  one_time: "Einmalig",
  monthly: "Monatlich",
  seasonal: "Saisonal",
  per_visit: "Einsatzbezogene Prognose",
};

export const billingBucketSuffixes: Record<BillingBucket, string> = {
  one_time: "",
  monthly: " / Monat",
  seasonal: " / Saison",
  per_visit: " für geplante Einsätze",
};

export const offerPricingItemKindLabels: Record<OfferPricingItemKind, string> = {
  standard: "Standardleistung",
  winter: "Winterdienst",
  custom: "Freie Position",
};

export const winterPricingModelLabels: Record<WinterPricingModel, string> = {
  seasonal_flat: "Saisonpauschale",
  monthly_plus_visit: "Monatliche Grundgebühr + Einsatz",
  per_visit: "Je Einsatz",
  custom_flat: "Individuelle Pauschale",
};

export const pricingComponentLabels: Record<PricingComponentCode, string> = {
  base: "Grundpreis",
  area: "Flächenpreis",
  hours: "Stundenpreis",
  visits: "Einsatzpreis",
  material: "Materialpauschale",
  custom_unit: "Freier Positionspreis",
  frequency_adjustment: "Frequenzfaktor",
  seasonal_surcharge: "Saisonzuschlag",
  minimum_adjustment: "Mindestpreis-Anpassung",
};

const DRIVER_SCALE = 1_000_000;
const BASIS_POINTS = 10_000;

/** Monthly equivalent used only for monthly recurring price buckets. */
export function monthlyFrequencyFactorBps(frequency: OfferFrequency, occurrences = 1) {
  if (!Number.isInteger(occurrences) || occurrences < 1 || occurrences > 31) {
    throw new RangeError("frequencyOccurrences muss zwischen 1 und 31 liegen.");
  }
  switch (frequency) {
    case "weekly":
      return 43_333;
    case "multiple_weekly":
      return 43_333 * occurrences;
    case "monthly":
      return BASIS_POINTS * occurrences;
    case "quarterly":
      return Math.round((BASIS_POINTS * occurrences) / 3);
    case "yearly":
      return Math.round((BASIS_POINTS * occurrences) / 12);
    case "once":
    case "on_demand":
      return BASIS_POINTS;
  }
}

export function inclusiveSeasonMonthCount(startMonth: number, endMonth: number) {
  if (![startMonth, endMonth].every((value) => Number.isInteger(value) && value >= 1 && value <= 12)) {
    throw new RangeError("Saisonmonate müssen zwischen 1 und 12 liegen.");
  }
  return startMonth <= endMonth ? endMonth - startMonth + 1 : 12 - startMonth + endMonth + 1;
}

type MutablePriceAtom = {
  itemIndex: number;
  itemId: string;
  billingBucket: BillingBucket;
  subtotalCents: number;
  afterItemDiscountCents: number;
  afterOverallDiscountCents: number;
  taxCents: number;
};

type PreparedItem = {
  input: OfferPricingItemDto;
  id: string;
  label: string;
  taxRateBps: number;
  automaticComponents: PricingComponentResultDto[];
  automaticAmounts: BillingBucketAmountsDto;
  finalAmounts: BillingBucketAmountsDto;
  manualOverrides: ManualOverrideResultDto[];
  pricingSource: OfferPricingItemResultDto["pricingSource"];
  discountApplications: DiscountApplicationDto[];
};

function toSafeNonNegativeInteger(value: number | undefined, name: string, fallback = 0) {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw new RangeError(`${name} muss eine nicht-negative, sichere Ganzzahl sein.`);
  }
  return resolved;
}

function toDriver(value: number | undefined, name: string, fallback: number) {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < 0) {
    throw new RangeError(`${name} muss eine nicht-negative Zahl sein.`);
  }
  const scaled = Math.round(resolved * DRIVER_SCALE);
  if (!Number.isSafeInteger(scaled)) {
    throw new RangeError(`${name} ist zu groß.`);
  }
  return scaled;
}

function bigintToSafeNumber(value: bigint, name: string) {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new RangeError(`${name} überschreitet den Zahlenbereich.`);
  return result;
}

/** Rounds a non-negative rational number half-up. */
function roundRatio(numerator: bigint, denominator: bigint, name: string) {
  if (numerator < BigInt(0) || denominator <= BigInt(0)) {
    throw new RangeError(`${name} ist ungültig.`);
  }
  return bigintToSafeNumber(
    (numerator + denominator / BigInt(2)) / denominator,
    name,
  );
}

function scaleCents(cents: number, scaledDriver: number, name: string) {
  return roundRatio(BigInt(cents) * BigInt(scaledDriver), BigInt(DRIVER_SCALE), name);
}

function multiplyBasisPoints(cents: number, bps: number, name: string) {
  return roundRatio(BigInt(cents) * BigInt(bps), BigInt(BASIS_POINTS), name);
}

export function createEmptyBillingBucketAmounts(): BillingBucketAmountsDto {
  return { one_time: 0, monthly: 0, seasonal: 0, per_visit: 0 };
}

function sumNumbers(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0);
}

function bucketForBaseComponent(
  item: StandardOfferPricingItemDto | WinterOfferPricingItemDto,
  component: RuleBaseComponent,
) {
  const explicit = item.rule.componentBuckets?.[component];
  if (explicit) return explicit;
  if (item.kind === "standard") return item.billingBucket;

  if (item.model === "monthly_plus_visit") {
    return component === "base" || component === "area" ? "monthly" : "per_visit";
  }
  if (item.model === "per_visit") return "per_visit";
  if (item.model === "custom_flat") return item.customFlatBucket ?? "seasonal";
  return "seasonal";
}

function defaultMinimumBucket(item: StandardOfferPricingItemDto | WinterOfferPricingItemDto) {
  if (item.rule.minimumBucket) return item.rule.minimumBucket;
  if (item.kind === "standard") return item.billingBucket;
  if (item.model === "monthly_plus_visit") return "monthly";
  if (item.model === "per_visit") return "per_visit";
  if (item.model === "custom_flat") return item.customFlatBucket ?? "seasonal";
  return "seasonal";
}

function calculateRuleComponents(
  item: StandardOfferPricingItemDto | WinterOfferPricingItemDto,
): PricingComponentResultDto[] {
  const rule = item.rule;
  const quantity = toDriver(item.drivers?.quantity, "quantity", 1);
  const area = toDriver(item.drivers?.areaSquareMeters, "areaSquareMeters", 0);
  const hours = toDriver(item.drivers?.hours, "hours", 0);
  const visits = toDriver(item.drivers?.visits, "visits", 1);
  const components: PricingComponentResultDto[] = [];

  const configuredBase =
    item.kind === "winter" && item.model === "custom_flat" && item.customFlatCents !== undefined
      ? item.customFlatCents
      : rule.baseCents;
  const baseCents = toSafeNonNegativeInteger(configuredBase, "baseCents");
  const areaRateCents = toSafeNonNegativeInteger(rule.perSquareMeterCents, "perSquareMeterCents");
  const hourRateCents = toSafeNonNegativeInteger(rule.perHourCents, "perHourCents");
  const visitRateCents = toSafeNonNegativeInteger(rule.perVisitCents, "perVisitCents");
  const materialFeeCents = toSafeNonNegativeInteger(rule.materialFeeCents, "materialFeeCents");

  const direct = [
    {
      code: "base" as const,
      amountCents: scaleCents(baseCents, quantity, "Grundpreis"),
    },
    {
      code: "area" as const,
      amountCents: scaleCents(
        scaleCents(areaRateCents, area, "Flächenpreis"),
        quantity,
        "Flächenpreis",
      ),
    },
    {
      code: "hours" as const,
      amountCents: scaleCents(
        scaleCents(hourRateCents, hours, "Stundenpreis"),
        quantity,
        "Stundenpreis",
      ),
    },
    {
      code: "visits" as const,
      amountCents: scaleCents(
        scaleCents(visitRateCents, visits, "Einsatzpreis"),
        quantity,
        "Einsatzpreis",
      ),
    },
    {
      code: "material" as const,
      amountCents: scaleCents(materialFeeCents, quantity, "Materialpauschale"),
    },
  ];

  for (const component of direct) {
    if (component.amountCents === 0) continue;
    components.push({
      code: component.code,
      label: pricingComponentLabels[component.code],
      billingBucket: bucketForBaseComponent(item, component.code),
      amountCents: component.amountCents,
    });
  }

  const frequencyFactorBps = toSafeNonNegativeInteger(
    rule.frequencyFactorBps,
    "frequencyFactorBps",
    BASIS_POINTS,
  );
  const seasonalSurchargeBps = toSafeNonNegativeInteger(
    rule.seasonalSurchargeBps,
    "seasonalSurchargeBps",
  );

  for (const bucket of BILLING_BUCKETS) {
    const directSubtotal = components
      .filter((component) => component.billingBucket === bucket)
      .reduce((sum, component) => sum + component.amountCents, 0);
    if (directSubtotal === 0) continue;

    const factoredSubtotal = multiplyBasisPoints(
      directSubtotal,
      frequencyFactorBps,
      "Frequenzfaktor",
    );
    const frequencyAdjustment = factoredSubtotal - directSubtotal;
    if (frequencyAdjustment !== 0) {
      components.push({
        code: "frequency_adjustment",
        label: pricingComponentLabels.frequency_adjustment,
        billingBucket: bucket,
        amountCents: frequencyAdjustment,
      });
    }

    const surcharge = multiplyBasisPoints(
      factoredSubtotal,
      seasonalSurchargeBps,
      "Saisonzuschlag",
    );
    if (surcharge !== 0) {
      components.push({
        code: "seasonal_surcharge",
        label: pricingComponentLabels.seasonal_surcharge,
        billingBucket: bucket,
        amountCents: surcharge,
      });
    }
  }

  const minimumCents = toSafeNonNegativeInteger(rule.minimumCents, "minimumCents");
  const minimumBucket = defaultMinimumBucket(item);
  const minimumBucketSubtotal = components
    .filter((component) => component.billingBucket === minimumBucket)
    .reduce((sum, component) => sum + component.amountCents, 0);
  if (minimumCents > minimumBucketSubtotal) {
    components.push({
      code: "minimum_adjustment",
      label: pricingComponentLabels.minimum_adjustment,
      billingBucket: minimumBucket,
      amountCents: minimumCents - minimumBucketSubtotal,
    });
  }

  return components;
}

function calculateCustomComponents(item: CustomOfferPricingItemDto): PricingComponentResultDto[] {
  const unitPriceCents = toSafeNonNegativeInteger(item.unitPriceCents, "unitPriceCents");
  const quantity = toDriver(item.quantity, "quantity", 1);
  const amountCents = scaleCents(unitPriceCents, quantity, "Freier Positionspreis");
  if (amountCents === 0) return [];
  return [
    {
      code: "custom_unit",
      label: pricingComponentLabels.custom_unit,
      billingBucket: item.billingBucket,
      amountCents,
    },
  ];
}

function amountsFromComponents(components: readonly PricingComponentResultDto[]) {
  const result = createEmptyBillingBucketAmounts();
  for (const component of components) result[component.billingBucket] += component.amountCents;
  for (const bucket of BILLING_BUCKETS) {
    if (result[bucket] < 0) throw new RangeError(`Der Preis-Bucket ${bucket} wurde negativ.`);
  }
  return result;
}

function prepareItem(item: OfferPricingItemDto, itemIndex: number): PreparedItem {
  const id = item.id?.trim() || `item-${itemIndex + 1}`;
  const label = item.label.trim() || `Position ${itemIndex + 1}`;
  const taxRateBps = toSafeNonNegativeInteger(item.taxRateBps, "taxRateBps");
  const automaticComponents =
    item.kind === "custom" ? calculateCustomComponents(item) : calculateRuleComponents(item);
  const automaticAmounts = amountsFromComponents(automaticComponents);
  const finalAmounts = { ...automaticAmounts };
  const manualOverrides: ManualOverrideResultDto[] = [];

  for (const bucket of BILLING_BUCKETS) {
    const override = item.manualOverride?.amountsCents[bucket];
    if (override === undefined) continue;
    const overriddenCents = toSafeNonNegativeInteger(override, `manualOverride.${bucket}`);
    manualOverrides.push({
      billingBucket: bucket,
      automaticCents: automaticAmounts[bucket],
      overriddenCents,
      differenceCents: overriddenCents - automaticAmounts[bucket],
      reason: item.manualOverride?.reason?.trim() || null,
    });
    finalAmounts[bucket] = overriddenCents;
  }

  const automaticActiveBuckets = BILLING_BUCKETS.filter((bucket) => automaticAmounts[bucket] > 0);
  const overrideBuckets = new Set(manualOverrides.map((override) => override.billingBucket));
  const leavesAutomaticPrice = automaticActiveBuckets.some((bucket) => !overrideBuckets.has(bucket));
  const pricingSource =
    manualOverrides.length === 0 ? "automatic" : leavesAutomaticPrice ? "mixed" : "manual";

  return {
    input: item,
    id,
    label,
    taxRateBps,
    automaticComponents,
    automaticAmounts,
    finalAmounts,
    manualOverrides,
    pricingSource,
    discountApplications: [],
  };
}

/** Largest-remainder allocation, stable by input order and exact to the cent. */
function allocateProportionally(totalCents: number, weights: readonly number[]) {
  if (totalCents === 0 || weights.length === 0) return weights.map(() => 0);
  const weightTotal = sumNumbers(weights);
  if (weightTotal <= 0) return weights.map(() => 0);

  const denominator = BigInt(weightTotal);
  const parts = weights.map((weight, index) => {
    const numerator = BigInt(totalCents) * BigInt(weight);
    return {
      index,
      value: bigintToSafeNumber(numerator / denominator, "Rabattverteilung"),
      remainder: numerator % denominator,
    };
  });
  const remaining = totalCents - sumNumbers(parts.map((part) => part.value));
  const ranked = [...parts].sort((left, right) => {
    if (left.remainder === right.remainder) return left.index - right.index;
    return left.remainder > right.remainder ? -1 : 1;
  });
  for (let index = 0; index < remaining; index += 1) ranked[index].value += 1;
  return parts.map((part) => part.value);
}

function requestedDiscountCents(discount: OfferDiscountDto, baseCents: number) {
  if (discount.type === "fixed") {
    return toSafeNonNegativeInteger(discount.valueCents, "discount.valueCents");
  }
  const rateBps = toSafeNonNegativeInteger(discount.valueBps, "discount.valueBps");
  return multiplyBasisPoints(baseCents, rateBps, "Prozentualer Rabatt");
}

function applyDiscountSequence(
  rawDiscounts: readonly OfferDiscountInputDto[] | undefined,
  atoms: MutablePriceAtom[],
  currentValue: (atom: MutablePriceAtom) => number,
  updateValue: (atom: MutablePriceAtom, discountCents: number) => void,
  idPrefix: string,
) {
  const applications: DiscountApplicationDto[] = [];
  const discounts = (rawDiscounts ?? []).filter(
    (discount): discount is OfferDiscountDto => discount !== null && discount !== undefined,
  );

  discounts.forEach((discount, discountIndex) => {
    const weights = atoms.map(currentValue);
    const baseCents = sumNumbers(weights);
    const requestedCents = requestedDiscountCents(discount, baseCents);
    const appliedCents = Math.min(baseCents, requestedCents);
    const allocated = allocateProportionally(appliedCents, weights);
    atoms.forEach((atom, atomIndex) => updateValue(atom, allocated[atomIndex]));
    applications.push({
      id: discount.id?.trim() || `${idPrefix}-${discountIndex + 1}`,
      type: discount.type,
      reason: discount.reason?.trim() || null,
      baseCents,
      requestedCents,
      appliedCents,
      capped: requestedCents > appliedCents,
      allocations: atoms
        .map((atom, atomIndex) => ({
          itemId: atom.itemId,
          billingBucket: atom.billingBucket,
          amountCents: allocated[atomIndex],
        }))
        .filter((allocation) => allocation.amountCents > 0),
    });
  });
  return applications;
}

function emptyItemBucketResult(): OfferItemBucketResultDto {
  return {
    subtotalCents: 0,
    itemDiscountCents: 0,
    overallDiscountCents: 0,
    discountCents: 0,
    netCents: 0,
    taxCents: 0,
    grossCents: 0,
  };
}

function sumItemBuckets(
  buckets: Record<BillingBucket, OfferItemBucketResultDto>,
): OfferPricingTotalsDto {
  const result: OfferPricingTotalsDto = {
    subtotalCents: 0,
    itemDiscountCents: 0,
    overallDiscountCents: 0,
    discountCents: 0,
    netCents: 0,
    taxCents: 0,
    grossCents: 0,
  };
  for (const bucket of BILLING_BUCKETS) {
    const values = buckets[bucket];
    result.subtotalCents += values.subtotalCents;
    result.itemDiscountCents += values.itemDiscountCents;
    result.overallDiscountCents += values.overallDiscountCents;
    result.discountCents += values.discountCents;
    result.netCents += values.netCents;
    result.taxCents += values.taxCents;
    result.grossCents += values.grossCents;
  }
  return result;
}

export function calculateOfferPricing(input: OfferPricingInputDto): OfferPricingResultDto {
  const preparedItems = input.items.map(prepareItem);
  const atoms = preparedItems.flatMap((item, itemIndex) =>
    BILLING_BUCKETS.map((billingBucket) => {
      const subtotalCents = item.finalAmounts[billingBucket];
      return {
        itemIndex,
        itemId: item.id,
        billingBucket,
        subtotalCents,
        afterItemDiscountCents: subtotalCents,
        afterOverallDiscountCents: subtotalCents,
        taxCents: 0,
      } satisfies MutablePriceAtom;
    }),
  );

  for (const [itemIndex, item] of preparedItems.entries()) {
    const itemAtoms = atoms.filter((atom) => atom.itemIndex === itemIndex);
    item.discountApplications = applyDiscountSequence(
      item.input.discounts,
      itemAtoms,
      (atom) => atom.afterItemDiscountCents,
      (atom, discountCents) => {
        atom.afterItemDiscountCents -= discountCents;
        atom.afterOverallDiscountCents = atom.afterItemDiscountCents;
      },
      `${item.id}-discount`,
    );
  }

  const overallDiscountApplications = applyDiscountSequence(
    input.overallDiscounts,
    atoms,
    (atom) => atom.afterOverallDiscountCents,
    (atom, discountCents) => {
      atom.afterOverallDiscountCents -= discountCents;
    },
    "overall-discount",
  );

  for (const [itemIndex, item] of preparedItems.entries()) {
    const itemAtoms = atoms.filter((atom) => atom.itemIndex === itemIndex);
    const itemNetCents = sumNumbers(itemAtoms.map((atom) => atom.afterOverallDiscountCents));
    const itemTaxCents = multiplyBasisPoints(itemNetCents, item.taxRateBps, "Umsatzsteuer");
    const allocatedTax = allocateProportionally(
      itemTaxCents,
      itemAtoms.map((atom) => atom.afterOverallDiscountCents),
    );
    itemAtoms.forEach((atom, atomIndex) => {
      atom.taxCents = allocatedTax[atomIndex];
    });
  }

  const items: OfferPricingItemResultDto[] = preparedItems.map((item, itemIndex) => {
    const buckets = Object.fromEntries(
      BILLING_BUCKETS.map((billingBucket) => {
        const atom = atoms.find(
          (candidate) =>
            candidate.itemIndex === itemIndex && candidate.billingBucket === billingBucket,
        );
        if (!atom) return [billingBucket, emptyItemBucketResult()];
        const itemDiscountCents = atom.subtotalCents - atom.afterItemDiscountCents;
        const overallDiscountCents =
          atom.afterItemDiscountCents - atom.afterOverallDiscountCents;
        return [
          billingBucket,
          {
            subtotalCents: atom.subtotalCents,
            itemDiscountCents,
            overallDiscountCents,
            discountCents: itemDiscountCents + overallDiscountCents,
            netCents: atom.afterOverallDiscountCents,
            taxCents: atom.taxCents,
            grossCents: atom.afterOverallDiscountCents + atom.taxCents,
          } satisfies OfferItemBucketResultDto,
        ];
      }),
    ) as Record<BillingBucket, OfferItemBucketResultDto>;
    const totals = sumItemBuckets(buckets);

    return {
      id: item.id,
      label: item.label,
      kind: item.input.kind,
      winterModel: item.input.kind === "winter" ? item.input.model : null,
      taxRateBps: item.taxRateBps,
      pricingSource: item.pricingSource,
      automaticComponents: item.automaticComponents,
      automaticAmountsCents: item.automaticAmounts,
      amountsBeforeDiscountCents: item.finalAmounts,
      manualOverrides: item.manualOverrides,
      discountApplications: item.discountApplications,
      ...totals,
      buckets,
    };
  });

  const bucketTotals = Object.fromEntries(
    BILLING_BUCKETS.map((billingBucket) => {
      const totals = items.reduce(
        (result, item) => {
          const bucket = item.buckets[billingBucket];
          result.subtotalCents += bucket.subtotalCents;
          result.itemDiscountCents += bucket.itemDiscountCents;
          result.overallDiscountCents += bucket.overallDiscountCents;
          result.discountCents += bucket.discountCents;
          result.netCents += bucket.netCents;
          result.taxCents += bucket.taxCents;
          result.grossCents += bucket.grossCents;
          return result;
        },
        emptyItemBucketResult(),
      );
      return [
        billingBucket,
        {
          billingBucket,
          label: billingBucketLabels[billingBucket],
          ...totals,
        } satisfies OfferBillingBucketTotalDto,
      ];
    }),
  ) as Record<BillingBucket, OfferBillingBucketTotalDto>;

  const activeBillingBuckets = BILLING_BUCKETS.filter(
    (bucket) => bucketTotals[bucket].subtotalCents > 0 || bucketTotals[bucket].grossCents > 0,
  );
  const totals = sumItemBuckets(bucketTotals);

  return {
    items,
    overallDiscountApplications,
    bucketTotals,
    activeBillingBuckets,
    hasMixedBillingBuckets: activeBillingBuckets.length > 1,
    totals,
  };
}

export function formatCents(
  cents: number,
  options: { locale?: string; currency?: string } = {},
) {
  if (!Number.isSafeInteger(cents)) throw new RangeError("cents muss eine sichere Ganzzahl sein.");
  return new Intl.NumberFormat(options.locale ?? "de-DE", {
    style: "currency",
    currency: options.currency ?? "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatBasisPoints(bps: number, locale = "de-DE") {
  if (!Number.isSafeInteger(bps)) throw new RangeError("bps muss eine sichere Ganzzahl sein.");
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(bps / BASIS_POINTS);
}

export function formatBillingBucketAmount(
  cents: number,
  billingBucket: BillingBucket,
  options: { locale?: string; currency?: string } = {},
) {
  return `${formatCents(cents, options)}${billingBucketSuffixes[billingBucket]}`;
}

export function createOfferPricingBucketRows(
  result: OfferPricingResultDto,
  options: { locale?: string; currency?: string; includeEmpty?: boolean } = {},
): OfferPricingBucketRowDto[] {
  return BILLING_BUCKETS.filter(
    (bucket) => options.includeEmpty || result.activeBillingBuckets.includes(bucket),
  ).map((bucket) => {
    const total = result.bucketTotals[bucket];
    return {
      ...total,
      formattedNet: formatBillingBucketAmount(total.netCents, bucket, options),
      formattedTax: formatBillingBucketAmount(total.taxCents, bucket, options),
      formattedGross: formatBillingBucketAmount(total.grossCents, bucket, options),
    };
  });
}
