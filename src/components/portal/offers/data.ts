import type { BillingBucket, ConfigurablePricingRuleDto, WinterPricingModel } from "@/lib/offerPricing";
import type {
  OfferBillingType,
  OfferCalculationType,
  OfferCatalogItem,
  OfferCustomerOption,
  OfferEditorDiscount,
  OfferEditorItem,
  OfferFrequency,
  OfferPricingRule,
  OfferUnit,
} from "@/components/portal/offers/types";

type UnknownRow = Record<string, unknown>;

function row(value: unknown): UnknownRow {
  if (Array.isArray(value)) return row(value[0]);
  return value && typeof value === "object" ? value as UnknownRow : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value == null ? fallback : String(value);
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

export function offerCustomerOptions(rows: unknown[]): OfferCustomerOption[] {
  return rows.map((value) => {
    const customer = row(value);
    const contactName = text(customer.contact_name) || [text(customer.first_name), text(customer.last_name)].filter(Boolean).join(" ");
    const label = text(customer.company_name) || contactName || text(customer.email, "Unbenannter Kunde");
    const address = [text(customer.billing_street), text(customer.billing_house_number)].filter(Boolean).join(" ") || text(customer.billing_address);
    return {
      id: text(customer.id),
      label,
      contactName,
      snapshot: {
        company_name: text(customer.company_name),
        contact_name: contactName,
        first_name: text(customer.first_name),
        last_name: text(customer.last_name),
        email: text(customer.email),
        phone: text(customer.phone),
        recipient_name: label,
        address,
        postal_code: text(customer.billing_postal_code),
        city: text(customer.billing_city),
        country: text(customer.billing_country, "Deutschland"),
      },
    };
  });
}

export function pricingRuleFromRow(value: unknown): OfferPricingRule {
  const rule = row(value);
  return {
    id: text(rule.id) || undefined,
    calculationType: (text(rule.calculation_type, "base_plus_area") as OfferCalculationType),
    defaultBillingType: (text(rule.default_billing_type, "monthly") as OfferBillingType),
    baseCents: numberValue(rule.base_price_cents),
    perSquareMeterCents: numberValue(rule.price_per_sqm_cents),
    minimumCents: numberValue(rule.minimum_price_cents),
    perVisitCents: numberValue(rule.price_per_visit_cents),
    perHourCents: numberValue(rule.price_per_hour_cents),
    unitPriceCents: numberValue(rule.unit_price_cents),
    frequencyFactorBps: Math.round(numberValue(rule.frequency_factor, 1) * 10_000),
    seasonalSurchargeBps: numberValue(rule.seasonal_surcharge_bps),
    materialFeeCents: numberValue(rule.material_flat_fee_cents),
    winterModel: text(rule.winter_model) ? text(rule.winter_model) as WinterPricingModel : null,
    includedVisits: numberValue(rule.included_visits),
    additionalVisitPriceCents: numberValue(rule.additional_visit_price_cents),
    monthlyBaseFeeCents: numberValue(rule.monthly_base_fee_cents),
    seasonalFlatRateCents: numberValue(rule.seasonal_flat_rate_cents),
    customFormula: text(rule.custom_formula) || undefined,
    isActive: booleanValue(rule.is_active, true),
  };
}

export function offerCatalogItems(rows: unknown[]): OfferCatalogItem[] {
  return rows.map((value) => {
    const catalog = row(value);
    return {
      id: text(catalog.id),
      serviceKey: text(catalog.service_key),
      name: text(catalog.name),
      category: text(catalog.category, "Weitere Leistungen"),
      description: text(catalog.customer_description),
      defaultExecutionRule: text(catalog.default_execution_rule),
      defaultOccurrencesPerPeriod: numberValue(catalog.default_occurrences_per_period, 1),
      defaultSeasonal: booleanValue(catalog.default_seasonal),
      defaultSeasonStartMonth: catalog.default_season_start_month == null ? null : numberValue(catalog.default_season_start_month),
      defaultSeasonEndMonth: catalog.default_season_end_month == null ? null : numberValue(catalog.default_season_end_month),
      rule: pricingRuleFromRow(catalog.service_pricing_rules),
    };
  });
}

export function offerEditorItemFromCatalog(catalog: OfferCatalogItem, clientKey: string): OfferEditorItem {
  const winter = catalog.serviceKey === "winterdienst" || Boolean(catalog.rule.winterModel);
  const unit: OfferUnit = winter || catalog.rule.calculationType === "per_visit"
    ? "visit"
    : catalog.rule.calculationType === "per_hour"
      ? "hour"
      : catalog.rule.defaultBillingType === "per_sqm"
        ? "square_meter"
        : catalog.rule.calculationType === "per_unit"
          ? "piece"
          : catalog.rule.defaultBillingType === "monthly"
            ? "month"
            : "flat";
  const frequency: OfferFrequency = catalog.rule.defaultBillingType === "one_time"
    ? "once"
    : catalog.rule.defaultBillingType === "per_visit"
      ? "on_demand"
      : catalog.defaultOccurrencesPerPeriod > 1
        ? "multiple_weekly"
        : "monthly";
  return {
    clientKey,
    serviceCatalogId: catalog.id,
    itemKind: winter ? "winter" : "standard",
    title: catalog.name,
    description: catalog.description,
    areaSquareMeters: 0,
    quantity: 1,
    unit,
    frequency,
    frequencyOccurrences: Math.max(1, catalog.defaultOccurrencesPerPeriod),
    billingType: catalog.rule.defaultBillingType,
    calculationType: catalog.rule.calculationType,
    unitPriceCents: catalog.rule.unitPriceCents,
    minimumPriceCents: catalog.rule.minimumCents ?? 0,
    taxRateBps: 1900,
    permanent: !catalog.defaultSeasonal,
    seasonal: catalog.defaultSeasonal || winter,
    seasonStartMonth: catalog.defaultSeasonStartMonth ?? (winter ? 11 : null),
    seasonEndMonth: catalog.defaultSeasonEndMonth ?? (winter ? 3 : null),
    visibleNote: catalog.defaultExecutionRule,
    winterSurfaceType: winter ? "other" : null,
    winterModel: winter ? catalog.rule.winterModel ?? "monthly_plus_visit" : null,
    includedVisits: catalog.rule.includedVisits,
    additionalVisitPriceCents: catalog.rule.additionalVisitPriceCents,
    monthlyBaseFeeCents: catalog.rule.monthlyBaseFeeCents,
    seasonalFlatRateCents: catalog.rule.seasonalFlatRateCents,
    surchargeCents: 0,
    rule: {
      baseCents: catalog.rule.baseCents,
      perSquareMeterCents: catalog.rule.perSquareMeterCents,
      minimumCents: catalog.rule.minimumCents,
      perVisitCents: catalog.rule.perVisitCents,
      perHourCents: catalog.rule.perHourCents,
      frequencyFactorBps: catalog.rule.frequencyFactorBps,
      seasonalSurchargeBps: catalog.rule.seasonalSurchargeBps,
      materialFeeCents: catalog.rule.materialFeeCents,
      componentBuckets: catalog.rule.componentBuckets,
      minimumBucket: catalog.rule.minimumBucket,
    },
    manualAmountsCents: {},
    manualReason: "",
    discounts: [],
  };
}

function pricingSnapshotRule(value: unknown): ConfigurablePricingRuleDto {
  const snapshot = row(value);
  const rule = row(snapshot.rule);
  return {
    baseCents: numberValue(rule.baseCents ?? rule.base_cents ?? rule.base_price_cents),
    perSquareMeterCents: numberValue(rule.perSquareMeterCents ?? rule.per_square_meter_cents ?? rule.price_per_sqm_cents),
    minimumCents: numberValue(rule.minimumCents ?? rule.minimum_cents ?? rule.minimum_price_cents),
    perVisitCents: numberValue(rule.perVisitCents ?? rule.per_visit_cents ?? rule.price_per_visit_cents),
    perHourCents: numberValue(rule.perHourCents ?? rule.per_hour_cents ?? rule.price_per_hour_cents),
    frequencyFactorBps: rule.frequency_factor != null
      ? Math.round(numberValue(rule.frequency_factor, 1) * 10_000)
      : numberValue(rule.frequencyFactorBps ?? rule.frequency_factor_bps, 10_000),
    seasonalSurchargeBps: numberValue(rule.seasonalSurchargeBps ?? rule.seasonal_surcharge_bps),
    materialFeeCents: numberValue(rule.materialFeeCents ?? rule.material_fee_cents ?? rule.material_flat_fee_cents),
  };
}

function manualAmounts(value: unknown, fallbackBucket: BillingBucket, fallbackTotal: number) {
  const snapshot = row(value);
  const rawOverrides = Array.isArray(snapshot.manual_overrides)
    ? snapshot.manual_overrides
    : Array.isArray(snapshot.manualOverrides)
      ? snapshot.manualOverrides
      : [];
  const result: Partial<Record<BillingBucket, number>> = {};
  for (const rawOverride of rawOverrides) {
    const override = row(rawOverride);
    const bucket = text(override.billingBucket ?? override.billing_bucket) as BillingBucket;
    if (["one_time", "monthly", "seasonal", "per_visit"].includes(bucket)) {
      result[bucket] = numberValue(override.overriddenCents ?? override.overridden_cents);
    }
  }
  if (!Object.keys(result).length && fallbackTotal >= 0) result[fallbackBucket] = fallbackTotal;
  return result;
}

export function editorDiscountFromRow(value: unknown): OfferEditorDiscount {
  const discount = row(value);
  const type = text(discount.discount_type, "percent") === "fixed" ? "fixed" : "percent";
  return {
    clientKey: text(discount.id) || `discount-${Math.random().toString(36).slice(2)}`,
    type,
    value: type === "percent" ? numberValue(discount.percentage_bps) : numberValue(discount.amount_cents),
    reason: text(discount.reason),
  };
}

export function offerEditorItems(itemRows: unknown[], discountRows: unknown[]): OfferEditorItem[] {
  const discountsByItem = new Map<string, OfferEditorDiscount[]>();
  for (const value of discountRows) {
    const discount = row(value);
    const itemId = text(discount.offer_item_id);
    if (!itemId) continue;
    discountsByItem.set(itemId, [...(discountsByItem.get(itemId) ?? []), editorDiscountFromRow(discount)]);
  }

  return itemRows.map((value) => {
    const item = row(value);
    const billingType = text(item.billing_type, "one_time") as OfferBillingType;
    const seasonal = booleanValue(item.seasonal);
    const fallbackBucket: BillingBucket = billingType === "monthly"
      ? "monthly"
      : billingType === "per_visit"
        ? "per_visit"
        : seasonal && billingType === "custom_flat"
          ? "seasonal"
          : "one_time";
    const manual = booleanValue(item.manual_price);
    return {
      clientKey: text(item.client_key) || text(item.id),
      serviceCatalogId: text(item.service_catalog_id) || null,
      itemKind: (text(item.item_kind, "custom") as OfferEditorItem["itemKind"]),
      title: text(item.title),
      description: text(item.description),
      areaSquareMeters: numberValue(item.area_sqm),
      quantity: numberValue(item.quantity, 1),
      unit: (text(item.unit, "flat") as OfferUnit),
      frequency: (text(item.frequency, "once") as OfferFrequency),
      frequencyOccurrences: numberValue(item.frequency_occurrences, 1),
      billingType,
      calculationType: (text(item.calculation_type, "custom") as OfferCalculationType),
      unitPriceCents: numberValue(item.unit_price_cents),
      minimumPriceCents: numberValue(item.minimum_price_cents),
      taxRateBps: numberValue(item.tax_rate_bps, 1900),
      permanent: booleanValue(item.permanent, true),
      seasonal,
      seasonStartMonth: item.season_start_month == null ? null : numberValue(item.season_start_month),
      seasonEndMonth: item.season_end_month == null ? null : numberValue(item.season_end_month),
      visibleNote: text(item.visible_note),
      winterSurfaceType: text(item.winter_surface_type) || null,
      winterModel: text(item.winter_model) ? text(item.winter_model) as WinterPricingModel : null,
      includedVisits: numberValue(item.included_visits),
      additionalVisitPriceCents: numberValue(item.additional_visit_price_cents),
      monthlyBaseFeeCents: numberValue(item.monthly_base_fee_cents),
      seasonalFlatRateCents: numberValue(item.seasonal_flat_rate_cents),
      surchargeCents: numberValue(item.surcharge_cents),
      rule: pricingSnapshotRule(item.pricing_snapshot),
      manualAmountsCents: manual ? manualAmounts(item.pricing_snapshot, fallbackBucket, numberValue(item.total_net_cents)) : {},
      manualReason: manual
        ? text(row((Array.isArray(row(item.pricing_snapshot).manual_overrides) ? row(item.pricing_snapshot).manual_overrides as unknown[] : [])[0]).reason)
          || text(row(item.pricing_snapshot).manual_reason, "Individuell vereinbarter Preis")
        : "",
      discounts: discountsByItem.get(text(item.id)) ?? [],
    };
  });
}

export function overallEditorDiscounts(discountRows: unknown[]) {
  return discountRows.filter((value) => text(row(value).scope) === "overall").map(editorDiscountFromRow);
}
