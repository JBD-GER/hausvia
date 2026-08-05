import { z } from "zod";
import {
  BILLING_BUCKETS,
  calculateOfferPricing,
  inclusiveSeasonMonthCount,
  monthlyFrequencyFactorBps,
  type BillingBucket,
  type ConfigurablePricingRuleDto,
  type OfferDiscountDto,
  type OfferPricingItemDto,
  type WinterPricingModel,
} from "./offerPricing.ts";

const nonNegativeCents = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const optionalCents = nonNegativeCents.optional().default(0);

const offerRecipientSnapshotSchema = z.object({
  recipient_name: z.string().trim().min(1, "Bitte geben Sie den Empfänger oder die Firma an.").max(300),
  address: z.string().trim().min(1, "Bitte geben Sie Straße und Hausnummer des Empfängers an.").max(1_000),
  postal_code: z.string().trim().min(1, "Bitte geben Sie die Postleitzahl des Empfängers an.").max(32),
  city: z.string().trim().min(1, "Bitte geben Sie den Ort des Empfängers an.").max(200),
  country: z.string().trim().min(1, "Bitte geben Sie das Land des Empfängers an.").max(120),
  email: z.string().trim().email("Für den Versand ist eine gültige Empfänger-E-Mail-Adresse erforderlich.").max(320),
  contact_name: z.string().trim().max(200).optional(),
  company_name: z.string().trim().max(300).optional(),
  first_name: z.string().trim().max(120).optional(),
  last_name: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(100).optional(),
}).passthrough();

const offerDiscountSchema = z.object({
  client_key: z.string().trim().min(1).max(120),
  scope: z.enum(["item", "overall"]),
  discount_type: z.enum(["percent", "fixed"]),
  percentage_bps: z.number().int().min(0).max(10_000).nullable().optional(),
  amount_cents: nonNegativeCents.nullable().optional(),
  reason: z.string().trim().min(1).max(240),
  item_client_key: z.string().trim().min(1).max(120).nullable().optional(),
  sort_order: z.number().int().min(0).max(100_000).optional().default(0),
});

const offerItemSchema = z.object({
  client_key: z.string().trim().min(1).max(120),
  service_catalog_id: z.string().uuid().nullable().optional(),
  item_kind: z.enum(["standard", "winter", "custom"]),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(8_000).nullable().optional(),
  area_sqm: z.number().min(0).max(10_000_000).optional().default(0),
  quantity: z.number().positive().max(10_000_000).optional().default(1),
  unit: z.enum(["square_meter", "piece", "hour", "visit", "month", "flat"]),
  frequency: z.enum([
    "once",
    "weekly",
    "multiple_weekly",
    "monthly",
    "quarterly",
    "yearly",
    "on_demand",
  ]),
  frequency_occurrences: z.number().int().min(1).max(31).optional().default(1),
  billing_type: z.enum([
    "one_time",
    "monthly",
    "per_visit",
    "per_hour",
    "per_sqm",
    "custom_flat",
  ]),
  calculation_type: z
    .enum(["base_plus_area", "per_unit", "per_hour", "per_visit", "flat", "custom"])
    .optional()
    .default("base_plus_area"),
  unit_price_cents: optionalCents,
  minimum_price_cents: optionalCents,
  manual_price: z.boolean().optional().default(false),
  manual_total_cents: nonNegativeCents.nullable().optional(),
  manual_bucket_amounts: z
    .object({
      one_time: nonNegativeCents.optional(),
      monthly: nonNegativeCents.optional(),
      seasonal: nonNegativeCents.optional(),
      per_visit: nonNegativeCents.optional(),
    })
    .optional(),
  manual_price_reason: z.string().trim().max(500).nullable().optional(),
  permanent: z.boolean().optional().default(true),
  seasonal: z.boolean().optional().default(false),
  season_start_month: z.number().int().min(1).max(12).nullable().optional(),
  season_end_month: z.number().int().min(1).max(12).nullable().optional(),
  visible_note: z.string().trim().max(4_000).nullable().optional(),
  winter_surface_type: z
    .enum(["sidewalk", "entrance", "driveway", "parking", "courtyard", "stairs", "other"])
    .nullable()
    .optional(),
  winter_model: z
    .enum(["seasonal_flat", "monthly_plus_visit", "per_visit", "custom_flat"])
    .nullable()
    .optional(),
  included_visits: z.number().int().min(0).max(10_000).optional().default(0),
  additional_visit_price_cents: optionalCents,
  monthly_base_fee_cents: optionalCents,
  seasonal_flat_rate_cents: optionalCents,
  surcharge_cents: optionalCents,
  tax_rate_bps: z.number().int().min(0).max(10_000).optional().default(1_900),
  sort_order: z.number().int().min(0).max(100_000).optional().default(0),
}).superRefine((item, context) => {
  if (item.item_kind === "winter" && !item.seasonal) {
    context.addIssue({
      code: "custom",
      path: ["seasonal"],
      message: "Winterdienst muss mit einem Saisonzeitraum angeboten werden.",
    });
  }
  if (item.seasonal && (!item.season_start_month || !item.season_end_month)) {
    context.addIssue({
      code: "custom",
      path: ["season_start_month"],
      message: "Für saisonale Leistungen müssen Saisonbeginn und Saisonende angegeben werden.",
    });
  }
  if (item.item_kind === "winter" && !item.winter_model) {
    context.addIssue({
      code: "custom",
      path: ["winter_model"],
      message: "Für Winterdienst muss ein Abrechnungsmodell ausgewählt werden.",
    });
  }
});

export const rawOfferDraftSchema = z.object({
  customer_id: z.string().uuid(),
  title: z.string().trim().min(1).max(240),
  contact_name: z.string().trim().max(200).nullable().optional(),
  recipient_snapshot: offerRecipientSnapshotSchema,
  object_label: z.string().trim().max(240).nullable().optional(),
  object_address: z.string().trim().max(1_000).nullable().optional(),
  offer_date: z.string().date(),
  valid_until: z.string().date(),
  planned_start_date: z.string().date().nullable().optional(),
  intro: z.string().trim().max(8_000).nullable().optional(),
  visible_note: z.string().trim().max(8_000).nullable().optional(),
  internal_note: z.string().trim().max(8_000).nullable().optional(),
  payment_terms: z.string().trim().max(8_000).nullable().optional(),
  contract_terms: z.string().trim().max(12_000).nullable().optional(),
  items: z.array(offerItemSchema).min(1).max(100),
  discounts: z.array(offerDiscountSchema).max(100).optional().default([]),
});

export type RawOfferDraft = z.infer<typeof rawOfferDraftSchema>;
export type RawOfferItem = z.infer<typeof offerItemSchema>;
export type RawOfferDiscount = z.infer<typeof offerDiscountSchema>;

export type ServicePricingRuleRow = {
  service_catalog_id: string;
  calculation_type: string;
  default_billing_type: string;
  base_price_cents: number;
  price_per_sqm_cents: number;
  minimum_price_cents: number;
  price_per_visit_cents: number;
  price_per_hour_cents: number;
  unit_price_cents: number;
  frequency_factor: number | string;
  seasonal_surcharge_bps: number;
  material_flat_fee_cents: number;
  winter_model: WinterPricingModel | null;
  included_visits: number;
  additional_visit_price_cents: number;
  monthly_base_fee_cents: number;
  seasonal_flat_rate_cents: number;
  custom_formula: string | null;
};

type UnknownRecord = Record<string, unknown>;

function unknownRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function copyNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function copiedManualOverride(item: UnknownRecord) {
  if (!item.manual_price) return { amounts: undefined, total: null, reason: null };
  const snapshot = unknownRecord(item.pricing_snapshot);
  const overrides = Array.isArray(snapshot.manual_overrides)
    ? snapshot.manual_overrides
    : Array.isArray(snapshot.manualOverrides)
      ? snapshot.manualOverrides
      : [];
  const amounts: Partial<Record<BillingBucket, number>> = {};
  let reason: string | null = null;
  for (const value of overrides) {
    const override = unknownRecord(value);
    const bucket = String(override.billingBucket ?? override.billing_bucket ?? "") as BillingBucket;
    if (!BILLING_BUCKETS.includes(bucket)) continue;
    const amount = copyNumber(override.overriddenCents ?? override.overridden_cents, Number.NaN);
    if (!Number.isSafeInteger(amount) || amount < 0) continue;
    amounts[bucket] = amount;
    if (!reason && typeof override.reason === "string" && override.reason.trim()) reason = override.reason.trim();
  }
  const snapshotReason = snapshot.manual_reason ?? snapshot.manualReason;
  if (!reason && typeof snapshotReason === "string" && snapshotReason.trim()) reason = snapshotReason.trim();
  return {
    amounts: Object.keys(amounts).length ? amounts : undefined,
    total: Object.keys(amounts).length ? null : copyNumber(item.total_net_cents),
    reason: reason || "Individuell vereinbarter Preis",
  };
}

export function copyOfferVersionToRawDraft(
  versionValue: unknown,
  itemValues: unknown[],
  discountValues: unknown[],
  today = new Date(),
) {
  const version = unknownRecord(versionValue);
  const items = itemValues.map(unknownRecord);
  const discounts = discountValues.map(unknownRecord);
  return {
    customer_id: version.customer_id,
    title: `${String(version.title || "Hausvia Angebot")} – Kopie`,
    contact_name: version.contact_name,
    recipient_snapshot: unknownRecord(version.recipient_snapshot),
    object_label: version.object_label,
    object_address: version.object_address,
    offer_date: today.toISOString().slice(0, 10),
    valid_until: new Date(today.getTime() + 30 * 86_400_000).toISOString().slice(0, 10),
    planned_start_date: version.planned_start_date,
    intro: version.intro,
    visible_note: version.visible_note,
    internal_note: version.internal_note,
    payment_terms: version.payment_terms,
    contract_terms: version.contract_terms,
    items: items.map((item, index) => {
      const manual = copiedManualOverride(item);
      return {
        client_key: `copy-${item.id}`,
        service_catalog_id: item.service_catalog_id,
        item_kind: item.item_kind,
        title: item.title,
        description: item.description,
        area_sqm: copyNumber(item.area_sqm),
        quantity: copyNumber(item.quantity, 1),
        unit: item.unit,
        frequency: item.frequency,
        frequency_occurrences: copyNumber(item.frequency_occurrences, 1),
        billing_type: item.billing_type,
        calculation_type: item.calculation_type,
        unit_price_cents: copyNumber(item.unit_price_cents),
        minimum_price_cents: copyNumber(item.minimum_price_cents),
        manual_price: Boolean(item.manual_price),
        manual_total_cents: manual.total,
        manual_bucket_amounts: manual.amounts,
        manual_price_reason: manual.reason,
        permanent: Boolean(item.permanent),
        seasonal: Boolean(item.seasonal),
        season_start_month: item.season_start_month,
        season_end_month: item.season_end_month,
        visible_note: item.visible_note,
        winter_surface_type: item.winter_surface_type,
        winter_model: item.winter_model,
        included_visits: copyNumber(item.included_visits),
        additional_visit_price_cents: copyNumber(item.additional_visit_price_cents),
        monthly_base_fee_cents: copyNumber(item.monthly_base_fee_cents),
        seasonal_flat_rate_cents: copyNumber(item.seasonal_flat_rate_cents),
        surcharge_cents: copyNumber(item.surcharge_cents),
        tax_rate_bps: copyNumber(item.tax_rate_bps ?? 1_900, 1_900),
        sort_order: index,
      };
    }),
    discounts: discounts.map((discount, index) => {
      const sourceItem = items.find((item) => item.id === discount.offer_item_id);
      return {
        client_key: `copy-discount-${discount.id}`,
        scope: discount.scope,
        discount_type: discount.discount_type,
        percentage_bps: discount.percentage_bps,
        amount_cents: discount.amount_cents,
        reason: discount.reason,
        item_client_key: sourceItem ? `copy-${sourceItem.id}` : null,
        sort_order: index,
      };
    }),
  };
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function billingBucketForItem(item: Pick<RawOfferItem, "billing_type" | "item_kind" | "winter_model" | "seasonal">): BillingBucket {
  if (item.item_kind === "winter") {
    if (item.winter_model === "per_visit") return "per_visit";
    if (item.winter_model === "monthly_plus_visit") return "monthly";
    return "seasonal";
  }
  if (item.billing_type === "per_visit") return "per_visit";
  if (item.seasonal) return "seasonal";
  if (item.billing_type === "monthly") return "monthly";
  return "one_time";
}

function discountForEngine(discount: RawOfferDiscount): OfferDiscountDto {
  return discount.discount_type === "percent"
    ? {
        id: discount.client_key,
        type: "percent",
        valueBps: discount.percentage_bps ?? 0,
        reason: discount.reason,
      }
    : {
        id: discount.client_key,
        type: "fixed",
        valueCents: discount.amount_cents ?? 0,
        reason: discount.reason,
      };
}

function ruleForItem(item: RawOfferItem, row?: ServicePricingRuleRow): ConfigurablePricingRuleDto {
  const configuredFactorBps = Math.max(0, Math.round(numberValue(row?.frequency_factor ?? 1) * 10_000));
  const monthlyScheduleBps = item.item_kind !== "winter" && item.billing_type === "monthly"
    ? monthlyFrequencyFactorBps(item.frequency, item.frequency_occurrences)
    : 10_000;
  const seasonFactor = item.item_kind !== "winter" && item.billing_type === "monthly" && item.seasonal
    ? inclusiveSeasonMonthCount(item.season_start_month ?? 1, item.season_end_month ?? 12)
    : 1;
  const scheduleFactorBps = monthlyScheduleBps * seasonFactor;
  const frequencyFactorBps = Math.round((configuredFactorBps * scheduleFactorBps) / 10_000);
  const common: ConfigurablePricingRuleDto = {
    baseCents: numberValue(row?.base_price_cents) + numberValue(row?.unit_price_cents),
    perSquareMeterCents: numberValue(row?.price_per_sqm_cents),
    minimumCents: Math.max(item.minimum_price_cents, numberValue(row?.minimum_price_cents)),
    perVisitCents: numberValue(row?.price_per_visit_cents),
    perHourCents: numberValue(row?.price_per_hour_cents),
    frequencyFactorBps,
    seasonalSurchargeBps: numberValue(row?.seasonal_surcharge_bps),
    materialFeeCents: numberValue(row?.material_flat_fee_cents) + item.surcharge_cents,
  };

  if (item.item_kind !== "winter") return common;
  const model = item.winter_model ?? row?.winter_model ?? "per_visit";
  if (model === "seasonal_flat") {
    return {
      ...common,
      baseCents: item.seasonal_flat_rate_cents || numberValue(row?.seasonal_flat_rate_cents) || common.baseCents,
      perVisitCents:
        item.additional_visit_price_cents ||
        numberValue(row?.additional_visit_price_cents) ||
        common.perVisitCents,
      componentBuckets: { visits: "per_visit" },
      minimumBucket: "seasonal",
    };
  }
  if (model === "monthly_plus_visit") {
    return {
      ...common,
      baseCents: item.monthly_base_fee_cents || numberValue(row?.monthly_base_fee_cents) || common.baseCents,
      perVisitCents:
        item.additional_visit_price_cents ||
        numberValue(row?.additional_visit_price_cents) ||
        common.perVisitCents,
      minimumBucket: "monthly",
    };
  }
  if (model === "per_visit") {
    return {
      ...common,
      baseCents: 0,
      perVisitCents:
        item.additional_visit_price_cents || item.unit_price_cents || common.perVisitCents,
      minimumBucket: "per_visit",
    };
  }
  return {
    ...common,
    baseCents: item.seasonal_flat_rate_cents || item.unit_price_cents || common.baseCents,
    minimumBucket: "seasonal",
  };
}

function manualOverrideForItem(item: RawOfferItem) {
  if (!item.manual_price) return undefined;
  const explicit = item.manual_bucket_amounts;
  const primary = billingBucketForItem(item);
  return {
    amountsCents:
      explicit && Object.values(explicit).some((value) => value !== undefined)
        ? explicit
        : { [primary]: item.manual_total_cents ?? item.unit_price_cents },
    reason: item.manual_price_reason || "Manuell im Angebotseditor überschrieben",
  };
}

function pricingInputForItem(
  item: RawOfferItem,
  itemDiscounts: RawOfferDiscount[],
  ruleRow?: ServicePricingRuleRow,
): OfferPricingItemDto {
  const common = {
    id: item.client_key,
    label: item.title,
    taxRateBps: item.tax_rate_bps,
    discounts: itemDiscounts.map(discountForEngine),
    manualOverride: manualOverrideForItem(item),
  };
  if (item.item_kind === "custom") {
    const monthlySchedule = item.billing_type === "monthly"
      ? monthlyFrequencyFactorBps(item.frequency, item.frequency_occurrences) / 10_000
      : 1;
    const seasonFactor = item.billing_type === "monthly" && item.seasonal
      ? inclusiveSeasonMonthCount(item.season_start_month ?? 1, item.season_end_month ?? 12)
      : 1;
    const scheduleFactor = monthlySchedule * seasonFactor;
    return {
      ...common,
      kind: "custom",
      billingBucket: billingBucketForItem(item),
      unitPriceCents: item.unit_price_cents,
      quantity: item.quantity * scheduleFactor,
    };
  }
  if (item.item_kind === "winter") {
    const model = item.winter_model ?? ruleRow?.winter_model ?? "per_visit";
    const billableVisits =
      model === "seasonal_flat" || model === "monthly_plus_visit"
        ? Math.max(0, item.quantity - item.included_visits)
        : model === "per_visit"
          ? item.quantity
          : 0;
    return {
      ...common,
      kind: "winter",
      model,
      rule: ruleForItem(item, ruleRow),
      drivers: {
        quantity: 1,
        areaSquareMeters: item.area_sqm,
        visits: billableVisits,
      },
      customFlatCents:
        model === "custom_flat"
          ? item.seasonal_flat_rate_cents || item.unit_price_cents
          : undefined,
      customFlatBucket: "seasonal",
    };
  }
  return {
    ...common,
    kind: "standard",
    billingBucket: billingBucketForItem(item),
    rule: ruleForItem(item, ruleRow),
    drivers: {
      quantity: ["per_hour", "per_visit"].includes(item.calculation_type) ? 1 : item.quantity,
      areaSquareMeters: item.area_sqm,
      hours: item.calculation_type === "per_hour" ? item.quantity : 0,
      visits: item.calculation_type === "per_visit" ? item.quantity : 0,
    },
  };
}

function snakeBucketTotals(result: ReturnType<typeof calculateOfferPricing>) {
  return Object.fromEntries(
    BILLING_BUCKETS.map((bucket) => {
      const value = result.bucketTotals[bucket];
      return [
        bucket,
        {
          subtotal_cents: value.subtotalCents,
          item_discount_cents: value.itemDiscountCents,
          overall_discount_cents: value.overallDiscountCents,
          discount_cents: value.discountCents,
          net_cents: value.netCents,
          tax_cents: value.taxCents,
          gross_cents: value.grossCents,
        },
      ];
    }),
  );
}

export function buildPersistableOfferPayload(
  draft: RawOfferDraft,
  pricingRules: readonly ServicePricingRuleRow[],
) {
  const rulesByCatalogId = new Map(pricingRules.map((rule) => [rule.service_catalog_id, rule]));
  const pricingItems = draft.items.map((item) => {
    const itemDiscounts = draft.discounts.filter(
      (discount) => discount.scope === "item" && discount.item_client_key === item.client_key,
    );
    return pricingInputForItem(
      item,
      itemDiscounts,
      item.service_catalog_id ? rulesByCatalogId.get(item.service_catalog_id) : undefined,
    );
  });
  const overallDiscounts = draft.discounts
    .filter((discount) => discount.scope === "overall")
    .map(discountForEngine);
  const pricing = calculateOfferPricing({ items: pricingItems, overallDiscounts });
  const pricingByItemId = new Map(pricing.items.map((item) => [item.id, item]));
  const applications = new Map(
    [
      ...pricing.items.flatMap((item) => item.discountApplications),
      ...pricing.overallDiscountApplications,
    ].map((application) => [application.id, application]),
  );

  const items = draft.items.map((item, index) => {
    const result = pricingByItemId.get(item.client_key);
    if (!result) throw new Error(`Preisberechnung für ${item.client_key} fehlt.`);
    const ruleRow = item.service_catalog_id ? rulesByCatalogId.get(item.service_catalog_id) : undefined;
    return {
      ...item,
      service_catalog_id: item.service_catalog_id || null,
      description: item.description || null,
      visible_note: item.visible_note || null,
      winter_surface_type: item.item_kind === "winter" ? item.winter_surface_type || "other" : null,
      winter_model: item.item_kind === "winter" ? item.winter_model || ruleRow?.winter_model || "per_visit" : null,
      season_start_month: item.seasonal ? item.season_start_month : null,
      season_end_month: item.seasonal ? item.season_end_month : null,
      automatic_total_cents: Object.values(result.automaticAmountsCents).reduce((sum, value) => sum + value, 0),
      total_net_cents: result.subtotalCents,
      price_components: BILLING_BUCKETS.filter(
        (bucket) => result.amountsBeforeDiscountCents[bucket] > 0,
      ).map((bucket) => ({
        bucket,
        label: item.title,
        net_cents: result.amountsBeforeDiscountCents[bucket],
        automatic_cents: result.automaticAmountsCents[bucket],
        manual: result.manualOverrides.some((override) => override.billingBucket === bucket),
      })),
      pricing_snapshot: {
        rule: ruleRow ?? null,
        automatic_components: result.automaticComponents,
        manual_overrides: result.manualOverrides,
        pricing_source: result.pricingSource,
        subtotal_cents: result.subtotalCents,
        discount_cents: result.discountCents,
        net_cents: result.netCents,
        tax_cents: result.taxCents,
        gross_cents: result.grossCents,
        billing_buckets: Object.fromEntries(
          BILLING_BUCKETS.map((bucket) => [
            bucket,
            {
              subtotal_cents: result.buckets[bucket].subtotalCents,
              discount_cents: result.buckets[bucket].discountCents,
              net_cents: result.buckets[bucket].netCents,
              tax_cents: result.buckets[bucket].taxCents,
              gross_cents: result.buckets[bucket].grossCents,
            },
          ]),
        ),
      },
      sort_order: item.sort_order ?? index,
    };
  });

  const discounts = draft.discounts.map((discount, index) => {
    const application = applications.get(discount.client_key);
    if (!application) throw new Error(`Rabattberechnung für ${discount.client_key} fehlt.`);
    return {
      scope: discount.scope,
      discount_type: discount.discount_type,
      percentage_bps: discount.discount_type === "percent" ? discount.percentage_bps ?? 0 : null,
      amount_cents: discount.discount_type === "fixed" ? discount.amount_cents ?? 0 : null,
      applied_amount_cents: application.appliedCents,
      reason: discount.reason,
      item_client_key: discount.scope === "item" ? discount.item_client_key : null,
      sort_order: discount.sort_order ?? index,
    };
  });

  return {
    ...draft,
    contact_name: draft.contact_name || null,
    object_label: draft.object_label || null,
    object_address: draft.object_address || null,
    planned_start_date: draft.planned_start_date || null,
    intro: draft.intro || null,
    visible_note: draft.visible_note || null,
    internal_note: draft.internal_note || null,
    payment_terms: draft.payment_terms || null,
    contract_terms: draft.contract_terms || null,
    items,
    discounts,
    subtotal_cents: pricing.totals.subtotalCents,
    discount_total_cents: pricing.totals.discountCents,
    net_total_cents: pricing.totals.netCents,
    tax_total_cents: pricing.totals.taxCents,
    gross_total_cents: pricing.totals.grossCents,
    billing_totals: snakeBucketTotals(pricing),
    calculation_snapshot: {
      calculator: "hausvia-offer-pricing-v1",
      active_billing_buckets: pricing.activeBillingBuckets,
      mixed_billing_buckets: pricing.hasMixedBillingBuckets,
      overall_discount_applications: pricing.overallDiscountApplications,
    },
  };
}
