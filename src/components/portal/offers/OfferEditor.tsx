"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown,
  ArrowUp,
  BadgeEuro,
  Check,
  GripVertical,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { saveOfferDraftAction } from "@/app/actions/offers";
import {
  BILLING_BUCKETS,
  billingBucketLabels,
  calculateOfferPricing,
  createOfferPricingBucketRows,
  formatCents,
  inclusiveSeasonMonthCount,
  monthlyFrequencyFactorBps,
  type BillingBucket,
  type ConfigurablePricingRuleDto,
  type OfferPricingItemDto,
  type OfferPricingItemResultDto,
} from "@/lib/offerPricing";
import { buttonClass, inputClass } from "@/components/portal/PortalUI";
import { offerEditorItemFromCatalog } from "@/components/portal/offers/data";
import {
  monthLabels,
  offerBillingTypeLabels,
  offerCalculationTypeLabels,
  offerFrequencyLabels,
  offerUnitLabels,
  type OfferBillingType,
  type OfferCatalogItem,
  type OfferCustomerOption,
  type OfferEditorDiscount,
  type OfferEditorInitial,
  type OfferEditorItem,
  type OfferFrequency,
  type OfferRecipientSnapshot,
  type OfferUnit,
} from "@/components/portal/offers/types";

const subtleButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-extrabold text-slate-750 transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45";

const dangerButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-extrabold text-red-700 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45";

const selectClass = inputClass;

function clientKey(prefix = "item") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function nonNegative(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function integer(value: string, fallback = 0) {
  return Math.round(nonNegative(value, fallback));
}

function euroToCents(value: string) {
  return Math.round(nonNegative(value) * 100);
}

function centsToInput(cents: number) {
  return (cents / 100).toFixed(2);
}

function bucketFromItem(item: OfferEditorItem): BillingBucket {
  if (item.itemKind === "winter") {
    if (item.winterModel === "per_visit") return "per_visit";
    if (item.winterModel === "monthly_plus_visit") return "monthly";
    return "seasonal";
  }
  if (item.billingType === "per_visit") return "per_visit";
  if (item.seasonal) return "seasonal";
  if (item.billingType === "monthly") return "monthly";
  return "one_time";
}

function commonRule(item: OfferEditorItem): ConfigurablePricingRuleDto {
  const monthlyScheduleBps = item.billingType === "monthly" && item.itemKind !== "winter"
    ? monthlyFrequencyFactorBps(item.frequency, item.frequencyOccurrences)
    : 10_000;
  const seasonFactor = item.billingType === "monthly" && item.seasonal && item.itemKind !== "winter"
    ? inclusiveSeasonMonthCount(item.seasonStartMonth ?? 1, item.seasonEndMonth ?? 12)
    : 1;
  const scheduleFactorBps = monthlyScheduleBps * seasonFactor;
  return {
    baseCents: (item.rule.baseCents ?? 0) + item.unitPriceCents,
    perSquareMeterCents: item.rule.perSquareMeterCents,
    minimumCents: Math.max(item.minimumPriceCents, item.rule.minimumCents ?? 0),
    perVisitCents: item.rule.perVisitCents,
    perHourCents: item.rule.perHourCents,
    frequencyFactorBps: Math.round(((item.rule.frequencyFactorBps ?? 10_000) * scheduleFactorBps) / 10_000),
    seasonalSurchargeBps: item.rule.seasonalSurchargeBps,
    materialFeeCents: (item.rule.materialFeeCents ?? 0) + item.surchargeCents,
  };
}

function pricingItem(item: OfferEditorItem): OfferPricingItemDto {
  const discounts = item.discounts.map((discount) =>
    discount.type === "percent"
      ? { id: discount.clientKey, type: "percent" as const, valueBps: discount.value, reason: discount.reason }
      : { id: discount.clientKey, type: "fixed" as const, valueCents: discount.value, reason: discount.reason },
  );
  const manualOverride = Object.keys(item.manualAmountsCents).length
    ? { amountsCents: item.manualAmountsCents, reason: item.manualReason }
    : undefined;

  if (item.itemKind === "custom") {
    const monthlySchedule = item.billingType === "monthly"
      ? monthlyFrequencyFactorBps(item.frequency, item.frequencyOccurrences) / 10_000
      : 1;
    const seasonFactor = item.billingType === "monthly" && item.seasonal
      ? inclusiveSeasonMonthCount(item.seasonStartMonth ?? 1, item.seasonEndMonth ?? 12)
      : 1;
    const scheduleFactor = monthlySchedule * seasonFactor;
    return {
      id: item.clientKey,
      kind: "custom",
      label: item.title,
      billingBucket: bucketFromItem(item),
      unitPriceCents: item.unitPriceCents,
      quantity: item.quantity * scheduleFactor,
      taxRateBps: item.taxRateBps,
      discounts,
      manualOverride,
    };
  }

  if (item.itemKind === "winter") {
    const model = item.winterModel ?? "per_visit";
    const billableVisits = model === "seasonal_flat" || model === "monthly_plus_visit"
      ? Math.max(0, item.quantity - item.includedVisits)
      : model === "per_visit"
        ? item.quantity
        : 0;
    const shared = commonRule(item);
    const commonBase = shared.baseCents ?? 0;
    const rule: ConfigurablePricingRuleDto = model === "seasonal_flat"
      ? {
          ...shared,
          baseCents: item.seasonalFlatRateCents || commonBase,
          perVisitCents: item.additionalVisitPriceCents || shared.perVisitCents,
          componentBuckets: { visits: "per_visit" },
          minimumBucket: "seasonal",
        }
      : model === "monthly_plus_visit"
        ? {
            ...shared,
            baseCents: item.monthlyBaseFeeCents || commonBase,
            perVisitCents: item.additionalVisitPriceCents || shared.perVisitCents,
            minimumBucket: "monthly",
          }
        : model === "per_visit"
          ? {
              ...shared,
              baseCents: 0,
              perVisitCents: item.additionalVisitPriceCents || item.unitPriceCents || shared.perVisitCents,
              minimumBucket: "per_visit",
            }
          : {
              ...shared,
              baseCents: item.seasonalFlatRateCents || item.unitPriceCents || commonBase,
              minimumBucket: "seasonal",
            };
    return {
      id: item.clientKey,
      kind: "winter",
      label: item.title,
      model,
      rule,
      drivers: {
        quantity: 1,
        areaSquareMeters: item.areaSquareMeters,
        visits: billableVisits,
      },
      customFlatCents: model === "custom_flat" ? item.seasonalFlatRateCents || item.unitPriceCents : undefined,
      customFlatBucket: item.seasonal ? "seasonal" : "one_time",
      taxRateBps: item.taxRateBps,
      discounts,
      manualOverride,
    };
  }

  return {
    id: item.clientKey,
    kind: "standard",
    label: item.title,
    billingBucket: bucketFromItem(item),
    rule: commonRule(item),
    drivers: {
      quantity: ["per_hour", "per_visit"].includes(item.calculationType) ? 1 : item.quantity,
      areaSquareMeters: item.areaSquareMeters,
      hours: item.calculationType === "per_hour" ? item.quantity : 0,
      visits: item.calculationType === "per_visit" ? item.quantity : 0,
    },
    taxRateBps: item.taxRateBps,
    discounts,
    manualOverride,
  };
}

function emptyRule(): ConfigurablePricingRuleDto {
  return {
    baseCents: 0,
    perSquareMeterCents: 0,
    minimumCents: 0,
    perVisitCents: 0,
    perHourCents: 0,
    frequencyFactorBps: 10_000,
    seasonalSurchargeBps: 0,
    materialFeeCents: 0,
  };
}

function createCustomItem(): OfferEditorItem {
  return {
    clientKey: clientKey(),
    serviceCatalogId: null,
    itemKind: "custom",
    title: "Freie Position",
    description: "",
    areaSquareMeters: 0,
    quantity: 1,
    unit: "flat",
    frequency: "once",
    frequencyOccurrences: 1,
    billingType: "one_time",
    calculationType: "custom",
    unitPriceCents: 0,
    minimumPriceCents: 0,
    taxRateBps: 1900,
    permanent: false,
    seasonal: false,
    seasonStartMonth: null,
    seasonEndMonth: null,
    visibleNote: "",
    winterSurfaceType: null,
    winterModel: null,
    includedVisits: 0,
    additionalVisitPriceCents: 0,
    monthlyBaseFeeCents: 0,
    seasonalFlatRateCents: 0,
    surchargeCents: 0,
    rule: emptyRule(),
    manualAmountsCents: {},
    manualReason: "",
    discounts: [],
  };
}

function itemFromCatalog(catalog: OfferCatalogItem): OfferEditorItem {
  return offerEditorItemFromCatalog(catalog, clientKey("catalog"));
}

function serializePayload(
  initial: OfferEditorInitial,
  metadata: Omit<OfferEditorInitial, "items" | "overallDiscounts">,
  items: OfferEditorItem[],
  overallDiscounts: OfferEditorDiscount[],
  pricing: ReturnType<typeof calculateOfferPricing>,
) {
  type SerializedDiscount = {
    client_key: string;
    scope: "item" | "overall";
    item_client_key: string | null;
    discount_type: "percent" | "fixed";
    percentage_bps: number | null;
    amount_cents: number | null;
    applied_amount_cents: number;
    reason: string;
    sort_order: number;
  };
  const discounts: SerializedDiscount[] = items.flatMap((item, itemIndex) => {
    const result = pricing.items[itemIndex];
    return item.discounts.map((discount, discountIndex) => {
      const application = result.discountApplications.find((candidate) => candidate.id === discount.clientKey);
      return {
        client_key: discount.clientKey,
        scope: "item" as const,
        item_client_key: item.clientKey,
        discount_type: discount.type,
        percentage_bps: discount.type === "percent" ? discount.value : null,
        amount_cents: discount.type === "fixed" ? discount.value : null,
        applied_amount_cents: application?.appliedCents ?? 0,
        reason: discount.reason,
        sort_order: itemIndex * 100 + discountIndex,
      };
    });
  });
  discounts.push(
    ...overallDiscounts.map((discount, discountIndex) => {
      const application = pricing.overallDiscountApplications.find((candidate) => candidate.id === discount.clientKey);
      return {
        client_key: discount.clientKey,
        scope: "overall" as const,
        item_client_key: null,
        discount_type: discount.type,
        percentage_bps: discount.type === "percent" ? discount.value : null,
        amount_cents: discount.type === "fixed" ? discount.value : null,
        applied_amount_cents: application?.appliedCents ?? 0,
        reason: discount.reason,
        sort_order: 10_000 + discountIndex,
      };
    }),
  );

  return JSON.stringify({
    customer_id: metadata.customerId,
    title: metadata.title,
    contact_name: metadata.contactName,
    recipient_snapshot: metadata.recipientSnapshot,
    object_label: metadata.objectLabel,
    object_address: metadata.objectAddress,
    offer_date: metadata.offerDate,
    valid_until: metadata.validUntil,
    planned_start_date: metadata.plannedStartDate || null,
    intro: metadata.intro,
    visible_note: metadata.visibleNote,
    internal_note: metadata.internalNote,
    payment_terms: metadata.paymentTerms,
    contract_terms: metadata.contractTerms,
    subtotal_cents: pricing.totals.subtotalCents,
    discount_total_cents: pricing.totals.discountCents,
    net_total_cents: pricing.totals.netCents,
    tax_total_cents: pricing.totals.taxCents,
    gross_total_cents: pricing.totals.grossCents,
    billing_totals: Object.fromEntries(
      BILLING_BUCKETS.map((bucket) => {
        const value = pricing.bucketTotals[bucket];
        return [bucket, {
          subtotal_cents: value.subtotalCents,
          discount_cents: value.discountCents,
          net_cents: value.netCents,
          tax_cents: value.taxCents,
          gross_cents: value.grossCents,
        }];
      }),
    ),
    calculation_snapshot: {
      engine: "offerPricing-v1",
      active_billing_buckets: pricing.activeBillingBuckets,
      has_mixed_billing_buckets: pricing.hasMixedBillingBuckets,
    },
    items: items.map((item, index) => {
      const result = pricing.items[index];
      return {
        client_key: item.clientKey,
        service_catalog_id: item.serviceCatalogId,
        item_kind: item.itemKind,
        title: item.title,
        description: item.description,
        area_sqm: item.areaSquareMeters,
        quantity: item.quantity,
        unit: item.unit,
        frequency: item.frequency,
        frequency_occurrences: item.frequencyOccurrences,
        billing_type: item.billingType,
        calculation_type: item.calculationType,
        unit_price_cents: item.unitPriceCents,
        minimum_price_cents: item.minimumPriceCents,
        manual_total_cents: result.manualOverrides.length
          ? Object.values(item.manualAmountsCents).reduce((sum, value) => sum + (value ?? 0), 0)
          : null,
        manual_bucket_amounts: result.manualOverrides.length ? item.manualAmountsCents : undefined,
        manual_price_reason: result.manualOverrides.length ? item.manualReason : null,
        automatic_total_cents: Object.values(result.automaticAmountsCents).reduce((sum, value) => sum + value, 0),
        total_net_cents: result.subtotalCents,
        tax_rate_bps: item.taxRateBps,
        manual_price: result.manualOverrides.length > 0,
        permanent: item.permanent,
        seasonal: item.seasonal,
        season_start_month: item.seasonal ? item.seasonStartMonth : null,
        season_end_month: item.seasonal ? item.seasonEndMonth : null,
        visible_note: item.visibleNote,
        winter_surface_type: item.itemKind === "winter" ? item.winterSurfaceType : null,
        winter_model: item.itemKind === "winter" ? item.winterModel : null,
        included_visits: item.includedVisits,
        additional_visit_price_cents: item.additionalVisitPriceCents,
        monthly_base_fee_cents: item.monthlyBaseFeeCents,
        seasonal_flat_rate_cents: item.seasonalFlatRateCents,
        surcharge_cents: item.surchargeCents,
        price_components: result.automaticComponents.map((component) => ({
          code: component.code,
          label: component.label,
          billing_bucket: component.billingBucket,
          amount_cents: component.amountCents,
        })),
        pricing_snapshot: {
          pricing_source: result.pricingSource,
          rule: item.rule,
          automatic_amounts_cents: result.automaticAmountsCents,
          manual_overrides: result.manualOverrides,
        },
        sort_order: index,
      };
    }),
    discounts,
    source_version_id: initial.versionId ?? null,
  });
}

function CatalogCard({ item, onAdd, disabled }: { item: OfferCatalogItem; onAdd: () => void; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({
    id: `catalog:${item.id}`,
    disabled,
    data: { type: "catalog", catalogId: item.id },
  });
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={`rounded-lg border bg-white p-3 shadow-sm transition ${isDragging ? "z-20 border-brand opacity-75 shadow-lg" : "border-slate-200 hover:border-brand/40"}`}
    >
      <div className="flex items-start gap-2">
        <button ref={setActivatorNodeRef} type="button" className="mt-0.5 hidden cursor-grab touch-none rounded p-1 text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand lg:block" aria-label={`${item.name} in das Angebot ziehen`} {...attributes} {...listeners}>
          <GripVertical size={18} aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-brand">{item.category}</p>
          <h3 className="mt-1 font-extrabold text-slate-950">{item.name}</h3>
          {item.description ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{item.description}</p> : null}
          <button type="button" disabled={disabled} onClick={onAdd} className={`${subtleButton} mt-3 w-full`}>
            <Plus size={16} aria-hidden="true" /> Zum Angebot hinzufügen
          </button>
        </div>
      </div>
    </article>
  );
}

function LabeledField({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-bold text-slate-800">{label}</span>
      {children}
    </label>
  );
}

function DiscountEditor({
  discounts,
  onChange,
  disabled,
  label,
}: {
  discounts: OfferEditorDiscount[];
  onChange: (discounts: OfferEditorDiscount[]) => void;
  disabled: boolean;
  label: string;
}) {
  function addDiscount() {
    onChange([...discounts, { clientKey: clientKey("discount"), type: "percent", value: 500, reason: "" }]);
  }
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-extrabold text-slate-900">{label}</p>
        {!disabled ? <button type="button" onClick={addDiscount} className={subtleButton}><Plus size={15} aria-hidden="true" /> Rabatt</button> : null}
      </div>
      {discounts.length ? (
        <div className="mt-3 grid gap-3">
          {discounts.map((discount, index) => (
            <div key={discount.clientKey} className="grid gap-2 rounded-md border border-slate-200 bg-white p-3 sm:grid-cols-[0.7fr_0.7fr_1.4fr_auto] sm:items-end">
              <LabeledField label="Art">
                <select
                  disabled={disabled}
                  value={discount.type}
                  onChange={(event) => onChange(discounts.map((entry, entryIndex) => entryIndex === index ? { ...entry, type: event.target.value as OfferEditorDiscount["type"], value: 0 } : entry))}
                  className={selectClass}
                >
                  <option value="percent">Prozent</option>
                  <option value="fixed">Fester Betrag</option>
                </select>
              </LabeledField>
              <LabeledField label={discount.type === "percent" ? "Rabatt in %" : "Rabatt in €"}>
                <input
                  disabled={disabled}
                  type="number"
                  min="0"
                  max={discount.type === "percent" ? "100" : undefined}
                  step="0.01"
                  value={(discount.value / 100).toString()}
                  onChange={(event) => onChange(discounts.map((entry, entryIndex) => entryIndex === index ? { ...entry, value: Math.round(nonNegative(event.target.value) * 100) } : entry))}
                  className={inputClass}
                />
              </LabeledField>
              <LabeledField label="Begründung">
                <input
                  disabled={disabled}
                  required
                  maxLength={240}
                  value={discount.reason}
                  onChange={(event) => onChange(discounts.map((entry, entryIndex) => entryIndex === index ? { ...entry, reason: event.target.value } : entry))}
                  placeholder="z. B. Einführungskondition"
                  className={inputClass}
                />
              </LabeledField>
              {!disabled ? <button type="button" onClick={() => onChange(discounts.filter((_, entryIndex) => entryIndex !== index))} className={dangerButton} aria-label="Rabatt entfernen"><Trash2 size={16} aria-hidden="true" /></button> : null}
            </div>
          ))}
        </div>
      ) : <p className="mt-2 text-xs text-slate-500">Kein Rabatt hinterlegt.</p>}
    </div>
  );
}

function SortableOfferItem({
  item,
  index,
  count,
  result,
  readOnly,
  update,
  remove,
  move,
}: {
  item: OfferEditorItem;
  index: number;
  count: number;
  result: OfferPricingItemResultDto;
  readOnly: boolean;
  update: (patch: Partial<OfferEditorItem>) => void;
  remove: () => void;
  move: (direction: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: `item:${item.clientKey}`, disabled: readOnly });
  const activeAutomaticBuckets = BILLING_BUCKETS.filter((bucket) => result.automaticAmountsCents[bucket] > 0);
  const manualBuckets = Object.keys(item.manualAmountsCents) as BillingBucket[];
  const priceBuckets = Array.from(new Set([...activeAutomaticBuckets, ...manualBuckets]));
  const effectiveBuckets = priceBuckets.length ? priceBuckets : [bucketFromItem(item)];
  const seasonMonths = item.seasonal
    ? inclusiveSeasonMonthCount(item.seasonStartMonth ?? 1, item.seasonEndMonth ?? 12)
    : 1;
  const billableWinterVisits = item.itemKind === "winter"
    ? ["seasonal_flat", "monthly_plus_visit"].includes(item.winterModel ?? "")
      ? Math.max(0, item.quantity - item.includedVisits)
      : item.winterModel === "per_visit"
        ? item.quantity
        : 0
    : 0;
  const effectiveVisitPriceCents = billableWinterVisits > 0
    ? Math.round(result.buckets.per_visit.netCents / billableWinterVisits)
    : item.additionalVisitPriceCents || item.unitPriceCents || item.rule.perVisitCents || 0;

  function enableManualPrice() {
    update({
      manualAmountsCents: Object.fromEntries(effectiveBuckets.map((bucket) => [bucket, result.automaticAmountsCents[bucket]])),
      manualReason: item.manualReason || "Individuell vereinbarter Preis",
    });
  }

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-xl border bg-white p-4 shadow-sm ${isDragging ? "z-20 border-brand shadow-xl" : "border-slate-200"}`}
    >
      <div className="flex flex-wrap items-start gap-3">
        {!readOnly ? (
          <button ref={setActivatorNodeRef} type="button" className="mt-1 cursor-grab touch-none rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" aria-label={`Position ${index + 1} verschieben`} {...attributes} {...listeners}>
            <GripVertical size={20} aria-hidden="true" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-brand-soft px-2 py-1 text-xs font-extrabold text-brand">Position {index + 1}</span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
              {item.itemKind === "winter" ? "Winterdienst" : item.itemKind === "custom" ? "Freie Position" : "Standardleistung"}
            </span>
            {result.manualOverrides.length ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-extrabold text-amber-900">Manueller Preis</span> : null}
          </div>
          <h3 className="mt-2 truncate text-lg font-extrabold text-slate-950">{item.title || "Unbenannte Position"}</h3>
          <p className="mt-1 text-sm font-bold text-slate-650">{formatCents(result.netCents)} netto</p>
        </div>
        {!readOnly ? (
          <div className="flex gap-1">
            <button type="button" onClick={() => move(-1)} disabled={index === 0} className={subtleButton} aria-label="Position nach oben"><ArrowUp size={16} aria-hidden="true" /></button>
            <button type="button" onClick={() => move(1)} disabled={index === count - 1} className={subtleButton} aria-label="Position nach unten"><ArrowDown size={16} aria-hidden="true" /></button>
            <button type="button" onClick={remove} className={dangerButton} aria-label="Position entfernen"><Trash2 size={16} aria-hidden="true" /></button>
          </div>
        ) : null}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <LabeledField label="Bezeichnung" className="sm:col-span-2">
          <input disabled={readOnly} required maxLength={240} value={item.title} onChange={(event) => update({ title: event.target.value })} className={inputClass} />
        </LabeledField>
        <LabeledField label="Art der Position">
          <select disabled={readOnly || Boolean(item.serviceCatalogId)} value={item.itemKind} onChange={(event) => update({ itemKind: event.target.value as OfferEditorItem["itemKind"], winterModel: event.target.value === "winter" ? "per_visit" : null, seasonal: event.target.value === "winter" ? true : item.seasonal, permanent: event.target.value === "winter" ? false : item.permanent, seasonStartMonth: event.target.value === "winter" ? item.seasonStartMonth ?? 11 : item.seasonStartMonth, seasonEndMonth: event.target.value === "winter" ? item.seasonEndMonth ?? 3 : item.seasonEndMonth })} className={selectClass}>
            <option value="standard">Standardleistung</option>
            <option value="winter">Winterdienst</option>
            <option value="custom">Freie Position</option>
          </select>
        </LabeledField>
        <LabeledField label="Beschreibung" className="sm:col-span-2 xl:col-span-3">
          <textarea disabled={readOnly} rows={3} value={item.description} onChange={(event) => update({ description: event.target.value })} className={inputClass} />
        </LabeledField>
        <LabeledField label="Fläche in m²">
          <input disabled={readOnly} type="number" min="0" step="0.01" value={item.areaSquareMeters} onChange={(event) => update({ areaSquareMeters: nonNegative(event.target.value) })} className={inputClass} />
        </LabeledField>
        <LabeledField label="Menge / Einsätze / Stunden">
          <input disabled={readOnly} required type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => update({ quantity: Math.max(0.01, nonNegative(event.target.value, 1)) })} className={inputClass} />
        </LabeledField>
        <LabeledField label="Einheit">
          <select disabled={readOnly} value={item.unit} onChange={(event) => update({ unit: event.target.value as OfferUnit })} className={selectClass}>
            {Object.entries(offerUnitLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </LabeledField>
        <LabeledField label="Häufigkeit">
          <select disabled={readOnly} value={item.frequency} onChange={(event) => update({ frequency: event.target.value as OfferFrequency })} className={selectClass}>
            {Object.entries(offerFrequencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </LabeledField>
        <LabeledField label="Ausführungen je Zeitraum">
          <input disabled={readOnly} type="number" min="1" max="31" step="1" value={item.frequencyOccurrences} onChange={(event) => update({ frequencyOccurrences: Math.min(31, Math.max(1, integer(event.target.value, 1))) })} className={inputClass} />
        </LabeledField>
        <LabeledField label="Abrechnungsart">
          <select disabled={readOnly} value={item.billingType} onChange={(event) => update({ billingType: event.target.value as OfferBillingType })} className={selectClass}>
            {Object.entries(offerBillingTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </LabeledField>

        {item.itemKind !== "winter" ? (
          <LabeledField label="Berechnungsmodell">
            <select disabled={readOnly || item.itemKind === "custom"} value={item.calculationType} onChange={(event) => update({ calculationType: event.target.value as OfferEditorItem["calculationType"] })} className={selectClass}>
              {Object.entries(offerCalculationTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </LabeledField>
        ) : null}

        {item.itemKind === "custom" || ["per_unit", "per_hour", "per_visit", "flat", "custom"].includes(item.calculationType) ? (
          <LabeledField label="Einzelpreis netto in €">
            <input disabled={readOnly || Boolean(item.serviceCatalogId)} type="number" min="0" step="0.01" value={centsToInput(item.unitPriceCents)} onChange={(event) => update({ unitPriceCents: euroToCents(event.target.value) })} className={inputClass} />
          </LabeledField>
        ) : null}

        <LabeledField label="Mindestpreis netto in €">
          <input disabled={readOnly} type="number" min="0" step="0.01" value={centsToInput(item.minimumPriceCents)} onChange={(event) => update({ minimumPriceCents: euroToCents(event.target.value) })} className={inputClass} />
        </LabeledField>
        <LabeledField label="Umsatzsteuer in %">
          <input disabled={readOnly} type="number" min="0" max="100" step="0.01" value={(item.taxRateBps / 100).toString()} onChange={(event) => update({ taxRateBps: Math.min(10_000, Math.round(nonNegative(event.target.value) * 100)) })} className={inputClass} />
        </LabeledField>

        {item.itemKind === "winter" ? (
          <>
            <LabeledField label="Winterdienst-Modell">
              <select disabled={readOnly} value={item.winterModel ?? "per_visit"} onChange={(event) => update({ winterModel: event.target.value as NonNullable<OfferEditorItem["winterModel"]> })} className={selectClass}>
                <option value="seasonal_flat">Saisonpauschale</option>
                <option value="monthly_plus_visit">Monatliche Grundgebühr + Einsatz</option>
                <option value="per_visit">Je Einsatz</option>
                <option value="custom_flat">Individuelle Pauschale</option>
              </select>
            </LabeledField>
            <LabeledField label="Flächentyp">
              <select disabled={readOnly} value={item.winterSurfaceType ?? "sidewalk"} onChange={(event) => update({ winterSurfaceType: event.target.value })} className={selectClass}>
                <option value="sidewalk">Gehweg</option><option value="entrance">Eingang</option><option value="driveway">Zufahrt</option><option value="parking">Parkfläche</option><option value="courtyard">Innenhof</option><option value="stairs">Treppen</option><option value="other">Sonstiges</option>
              </select>
            </LabeledField>
            <LabeledField label="Inklusive Einsätze">
              <input disabled={readOnly} type="number" min="0" step="1" value={item.includedVisits} onChange={(event) => update({ includedVisits: integer(event.target.value) })} className={inputClass} />
            </LabeledField>
            <LabeledField label="Preis je weiterem Einsatz in €">
              <input disabled={readOnly} type="number" min="0" step="0.01" value={centsToInput(item.additionalVisitPriceCents)} onChange={(event) => update({ additionalVisitPriceCents: euroToCents(event.target.value) })} className={inputClass} />
            </LabeledField>
            <LabeledField label="Monatliche Grundgebühr in €">
              <input disabled={readOnly} type="number" min="0" step="0.01" value={centsToInput(item.monthlyBaseFeeCents)} onChange={(event) => update({ monthlyBaseFeeCents: euroToCents(event.target.value) })} className={inputClass} />
            </LabeledField>
            <LabeledField label="Saison-/Individualpauschale in €">
              <input disabled={readOnly} type="number" min="0" step="0.01" value={centsToInput(item.seasonalFlatRateCents)} onChange={(event) => update({ seasonalFlatRateCents: euroToCents(event.target.value) })} className={inputClass} />
            </LabeledField>
            <LabeledField label="Material-/Einsatzzuschlag in €">
              <input disabled={readOnly} type="number" min="0" step="0.01" value={centsToInput(item.surchargeCents)} onChange={(event) => update({ surchargeCents: euroToCents(event.target.value) })} className={inputClass} />
            </LabeledField>
          </>
        ) : null}

        <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-750">
          <input disabled={readOnly} type="checkbox" checked={item.permanent} onChange={(event) => update({ permanent: event.target.checked })} className="h-5 w-5 rounded border-slate-300 text-brand focus:ring-brand" /> Dauerleistung
        </label>
        <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-750">
          <input disabled={readOnly || item.itemKind === "winter"} type="checkbox" checked={item.seasonal} onChange={(event) => update({ seasonal: event.target.checked, seasonStartMonth: event.target.checked ? item.seasonStartMonth ?? 11 : null, seasonEndMonth: event.target.checked ? item.seasonEndMonth ?? 3 : null })} className="h-5 w-5 rounded border-slate-300 text-brand focus:ring-brand" /> Saisonale Leistung
        </label>
        {item.seasonal ? (
          <>
            <LabeledField label="Saisonbeginn">
              <select disabled={readOnly} value={item.seasonStartMonth ?? 1} onChange={(event) => update({ seasonStartMonth: integer(event.target.value, 1) })} className={selectClass}>{monthLabels.map((label, month) => <option key={label} value={month + 1}>{label}</option>)}</select>
            </LabeledField>
            <LabeledField label="Saisonende">
              <select disabled={readOnly} value={item.seasonEndMonth ?? 12} onChange={(event) => update({ seasonEndMonth: integer(event.target.value, 12) })} className={selectClass}>{monthLabels.map((label, month) => <option key={label} value={month + 1}>{label}</option>)}</select>
            </LabeledField>
          </>
        ) : null}
        <LabeledField label="Hinweis im Angebot" className="sm:col-span-2 xl:col-span-3">
          <textarea disabled={readOnly} rows={2} value={item.visibleNote} onChange={(event) => update({ visibleNote: event.target.value })} className={inputClass} />
        </LabeledField>
      </div>

      {item.itemKind === "winter" ? (
        <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3">
          <p className="text-sm font-extrabold text-sky-950">Winterdienst-Konditionen</p>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
            {item.winterModel === "seasonal_flat" ? (
              <>
                <div><dt className="font-bold text-sky-800">Preis pro Saisonmonat</dt><dd className="mt-1 font-extrabold text-sky-950">{formatCents(Math.round(result.buckets.seasonal.netCents / Math.max(1, seasonMonths)))}</dd></div>
                <div><dt className="font-bold text-sky-800">Gesamtpreis Saison ({seasonMonths} Monate)</dt><dd className="mt-1 font-extrabold text-sky-950">{formatCents(result.buckets.seasonal.netCents)}</dd></div>
                <div><dt className="font-bold text-sky-800">Enthaltene Einsätze</dt><dd className="mt-1 font-extrabold text-sky-950">{item.includedVisits}</dd></div>
                <div><dt className="font-bold text-sky-800">{billableWinterVisits > 0 ? "Effektiv je geplantem weiteren Einsatz" : "Basispreis je weiterem Einsatz"}</dt><dd className="mt-1 font-extrabold text-sky-950">{formatCents(effectiveVisitPriceCents)}</dd></div>
              </>
            ) : item.winterModel === "monthly_plus_visit" ? (
              <>
                <div><dt className="font-bold text-sky-800">Monatliche Grundgebühr</dt><dd className="mt-1 font-extrabold text-sky-950">{formatCents(result.buckets.monthly.netCents)}</dd></div>
                <div><dt className="font-bold text-sky-800">Grundbetrag gesamte Saison ({seasonMonths} Monate)</dt><dd className="mt-1 font-extrabold text-sky-950">{formatCents(result.buckets.monthly.netCents * seasonMonths)}</dd></div>
                <div><dt className="font-bold text-sky-800">Enthaltene Einsätze</dt><dd className="mt-1 font-extrabold text-sky-950">{item.includedVisits}</dd></div>
                <div><dt className="font-bold text-sky-800">{billableWinterVisits > 0 ? "Effektiv je geplantem zusätzlichen Einsatz" : "Basispreis je zusätzlichem Einsatz"}</dt><dd className="mt-1 font-extrabold text-sky-950">{formatCents(effectiveVisitPriceCents)}</dd></div>
              </>
            ) : item.winterModel === "per_visit" ? (
              <div><dt className="font-bold text-sky-800">Effektiv je geplantem Einsatz</dt><dd className="mt-1 font-extrabold text-sky-950">{formatCents(effectiveVisitPriceCents)}</dd></div>
            ) : (
              <div><dt className="font-bold text-sky-800">Individuelle Saisonpauschale</dt><dd className="mt-1 font-extrabold text-sky-950">{formatCents(result.buckets.seasonal.netCents)}</dd></div>
            )}
          </dl>
          <p className="mt-2 text-xs leading-5 text-sky-800">Nettowerte; Faktoren, Zuschläge und gewährte Rabatte sind in den effektiven Monats-, Saison- und Einsatzwerten berücksichtigt. Ein Basispreis wird nur angezeigt, wenn noch kein zusätzlicher Einsatz kalkuliert ist.</p>
        </div>
      ) : null}

      <div className="mt-4 rounded-lg border border-brand/15 bg-brand-soft/50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-extrabold text-slate-950">Preisberechnung</p>
            <p className="mt-1 text-xs text-slate-600">Automatik: {formatCents(Object.values(result.automaticAmountsCents).reduce((sum, value) => sum + value, 0))} netto</p>
          </div>
          {!readOnly && !result.manualOverrides.length ? <button type="button" onClick={enableManualPrice} className={subtleButton}><BadgeEuro size={16} aria-hidden="true" /> Manuell überschreiben</button> : null}
          {!readOnly && result.manualOverrides.length ? <button type="button" onClick={() => update({ manualAmountsCents: {}, manualReason: "" })} className={subtleButton}><RotateCcw size={16} aria-hidden="true" /> Automatik wiederherstellen</button> : null}
        </div>
        {result.manualOverrides.length ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {effectiveBuckets.map((bucket) => (
              <LabeledField key={bucket} label={`${billingBucketLabels[bucket]} netto in €`}>
                <input disabled={readOnly} type="number" min="0" step="0.01" value={centsToInput(item.manualAmountsCents[bucket] ?? result.automaticAmountsCents[bucket])} onChange={(event) => update({ manualAmountsCents: { ...item.manualAmountsCents, [bucket]: euroToCents(event.target.value) } })} className={inputClass} />
              </LabeledField>
            ))}
            <LabeledField label="Grund der Abweichung" className="sm:col-span-2">
              <input disabled={readOnly} required value={item.manualReason} onChange={(event) => update({ manualReason: event.target.value })} className={inputClass} />
            </LabeledField>
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        <DiscountEditor discounts={item.discounts} onChange={(discounts) => update({ discounts })} disabled={readOnly} label="Rabatt auf diese Position" />
      </div>
    </article>
  );
}

export function OfferEditor({
  customers,
  catalog,
  initial,
  readOnly = false,
  allowRevision = false,
}: {
  customers: OfferCustomerOption[];
  catalog: OfferCatalogItem[];
  initial: OfferEditorInitial;
  readOnly?: boolean;
  allowRevision?: boolean;
}) {
  const [metadata, setMetadata] = useState<Omit<OfferEditorInitial, "items" | "overallDiscounts">>(() => {
    const { items: _items, overallDiscounts: _discounts, ...rest } = initial;
    void _items;
    void _discounts;
    return rest;
  });
  const [items, setItems] = useState(initial.items);
  const [overallDiscounts, setOverallDiscounts] = useState(initial.overallDiscounts);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogCategory, setCatalogCategory] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: "offer-dropzone", disabled: readOnly });

  const pricing = useMemo(() => calculateOfferPricing({
    items: items.map(pricingItem),
    overallDiscounts: overallDiscounts.map((discount) =>
      discount.type === "percent"
        ? { id: discount.clientKey, type: "percent" as const, valueBps: discount.value, reason: discount.reason }
        : { id: discount.clientKey, type: "fixed" as const, valueCents: discount.value, reason: discount.reason },
    ),
  }), [items, overallDiscounts]);
  const payload = useMemo(() => serializePayload(initial, metadata, items, overallDiscounts, pricing), [initial, metadata, items, overallDiscounts, pricing]);
  const bucketRows = createOfferPricingBucketRows(pricing, { includeEmpty: false });
  const categories = Array.from(new Set(catalog.map((item) => item.category))).sort((left, right) => left.localeCompare(right, "de"));
  const visibleCatalog = catalog.filter((item) => {
    const search = catalogSearch.trim().toLocaleLowerCase("de");
    return (!catalogCategory || item.category === catalogCategory) && (!search || `${item.name} ${item.category} ${item.description}`.toLocaleLowerCase("de").includes(search));
  });

  function addCatalogItem(catalogId: string) {
    const catalogItem = catalog.find((item) => item.id === catalogId);
    if (!catalogItem) return;
    setItems((current) => [...current, itemFromCatalog(catalogItem)]);
    setAnnouncement(`${catalogItem.name} wurde als Position ${items.length + 1} hinzugefügt.`);
  }

  function updateItem(itemKey: string, patch: Partial<OfferEditorItem>) {
    setItems((current) => current.map((item) => item.clientKey === itemKey ? { ...item, ...patch } : item));
  }

  function moveItem(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    setItems((current) => arrayMove(current, index, nextIndex));
    setAnnouncement(`Position ${index + 1} wurde auf Position ${nextIndex + 1} verschoben.`);
  }

  function onDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : "";
    if (activeId.startsWith("catalog:")) {
      if (overId === "offer-dropzone" || overId.startsWith("item:")) addCatalogItem(activeId.slice("catalog:".length));
      return;
    }
    if (!activeId.startsWith("item:") || !overId.startsWith("item:") || activeId === overId) return;
    const activeKey = activeId.slice("item:".length);
    const overKey = overId.slice("item:".length);
    const from = items.findIndex((item) => item.clientKey === activeKey);
    const to = items.findIndex((item) => item.clientKey === overKey);
    if (from < 0 || to < 0) return;
    setItems((current) => arrayMove(current, from, to));
    setAnnouncement(`Position ${from + 1} wurde auf Position ${to + 1} verschoben.`);
  }

  function selectCustomer(customerId: string) {
    const customer = customers.find((entry) => entry.id === customerId);
    setMetadata((current) => ({
      ...current,
      customerId,
      contactName: customer?.contactName ?? current.contactName,
      recipientSnapshot: customer?.snapshot ?? current.recipientSnapshot,
    }));
  }

  function updateRecipient(patch: Partial<OfferRecipientSnapshot>) {
    setMetadata((current) => ({ ...current, recipientSnapshot: { ...current.recipientSnapshot, ...patch } }));
  }

  return (
    <form action={saveOfferDraftAction} className="grid gap-5">
      {metadata.offerId ? <input type="hidden" name="offerId" value={metadata.offerId} /> : null}
      {metadata.expectedUpdatedAt ? <input type="hidden" name="expectedUpdatedAt" value={metadata.expectedUpdatedAt} /> : null}
      <input type="hidden" name="payload" value={payload} />
      <div aria-live="polite" className="sr-only">{announcement}</div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-brand">Stammdaten</p>
            <h2 className="mt-1 text-xl font-extrabold text-slate-950">Empfänger und Angebotsrahmen</h2>
          </div>
          {metadata.offerNumber ? <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-extrabold text-slate-800">{metadata.offerNumber}{metadata.versionNumber ? ` · Version ${metadata.versionNumber}` : ""}</span> : null}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <LabeledField label="Kunde" className="sm:col-span-2">
            <select disabled={readOnly || Boolean(initial.offerId)} required value={metadata.customerId} onChange={(event) => selectCustomer(event.target.value)} className={selectClass}>
              <option value="">Kunde auswählen</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.label}</option>)}
            </select>
          </LabeledField>
          <LabeledField label="Ansprechpartner">
            <input disabled={readOnly} value={metadata.contactName} onChange={(event) => setMetadata((current) => ({ ...current, contactName: event.target.value, recipientSnapshot: { ...current.recipientSnapshot, contact_name: event.target.value } }))} className={inputClass} />
          </LabeledField>
          <LabeledField label="Empfänger / Firma">
            <input disabled={readOnly} required value={metadata.recipientSnapshot.recipient_name ?? ""} onChange={(event) => updateRecipient({ recipient_name: event.target.value })} className={inputClass} />
          </LabeledField>
          <LabeledField label="Straße und Hausnummer" className="sm:col-span-2">
            <input disabled={readOnly} required value={metadata.recipientSnapshot.address ?? ""} onChange={(event) => updateRecipient({ address: event.target.value })} className={inputClass} />
          </LabeledField>
          <LabeledField label="Postleitzahl">
            <input disabled={readOnly} required value={metadata.recipientSnapshot.postal_code ?? ""} onChange={(event) => updateRecipient({ postal_code: event.target.value })} className={inputClass} />
          </LabeledField>
          <LabeledField label="Ort">
            <input disabled={readOnly} required value={metadata.recipientSnapshot.city ?? ""} onChange={(event) => updateRecipient({ city: event.target.value })} className={inputClass} />
          </LabeledField>
          <LabeledField label="E-Mail für den Versand" className="sm:col-span-2">
            <input disabled={readOnly} required type="email" value={metadata.recipientSnapshot.email ?? ""} onChange={(event) => updateRecipient({ email: event.target.value })} className={inputClass} />
          </LabeledField>
          <LabeledField label="Land" className="sm:col-span-2">
            <input disabled={readOnly} required value={metadata.recipientSnapshot.country ?? ""} onChange={(event) => updateRecipient({ country: event.target.value })} className={inputClass} />
          </LabeledField>
          <LabeledField label="Angebotstitel" className="sm:col-span-2 xl:col-span-4">
            <input disabled={readOnly} required maxLength={240} value={metadata.title} onChange={(event) => setMetadata((current) => ({ ...current, title: event.target.value }))} className={inputClass} />
          </LabeledField>
          <LabeledField label="Objektbezeichnung" className="sm:col-span-2">
            <input disabled={readOnly} value={metadata.objectLabel} onChange={(event) => setMetadata((current) => ({ ...current, objectLabel: event.target.value }))} placeholder="Optional, z. B. Wohnanlage Mitte" className={inputClass} />
          </LabeledField>
          <LabeledField label="Objektadresse" className="sm:col-span-2">
            <input disabled={readOnly} value={metadata.objectAddress} onChange={(event) => setMetadata((current) => ({ ...current, objectAddress: event.target.value }))} placeholder="Freie Adresse, noch keine Immobilie" className={inputClass} />
          </LabeledField>
          <LabeledField label="Angebotsdatum">
            <input disabled={readOnly} required type="date" value={metadata.offerDate} onChange={(event) => setMetadata((current) => ({ ...current, offerDate: event.target.value }))} className={inputClass} />
          </LabeledField>
          <LabeledField label="Gültig bis">
            <input disabled={readOnly} required type="date" min={metadata.offerDate} value={metadata.validUntil} onChange={(event) => setMetadata((current) => ({ ...current, validUntil: event.target.value }))} className={inputClass} />
          </LabeledField>
          <LabeledField label="Geplanter Leistungsbeginn" className="sm:col-span-2">
            <input disabled={readOnly} type="date" value={metadata.plannedStartDate} onChange={(event) => setMetadata((current) => ({ ...current, plannedStartDate: event.target.value }))} className={inputClass} />
          </LabeledField>
          <LabeledField label="Einleitung" className="sm:col-span-2 xl:col-span-4">
            <textarea disabled={readOnly} rows={3} value={metadata.intro} onChange={(event) => setMetadata((current) => ({ ...current, intro: event.target.value }))} className={inputClass} />
          </LabeledField>
          <LabeledField label="Sichtbare Hinweise" className="sm:col-span-2">
            <textarea disabled={readOnly} rows={3} value={metadata.visibleNote} onChange={(event) => setMetadata((current) => ({ ...current, visibleNote: event.target.value }))} className={inputClass} />
          </LabeledField>
          <LabeledField label="Interne Hinweise" className="sm:col-span-2">
            <textarea disabled={readOnly} rows={3} value={metadata.internalNote} onChange={(event) => setMetadata((current) => ({ ...current, internalNote: event.target.value }))} className={inputClass} />
          </LabeledField>
          <LabeledField label="Zahlungsbedingungen" className="sm:col-span-2">
            <textarea disabled={readOnly} rows={3} value={metadata.paymentTerms} onChange={(event) => setMetadata((current) => ({ ...current, paymentTerms: event.target.value }))} className={inputClass} />
          </LabeledField>
          <LabeledField label="Vertragsbedingungen" className="sm:col-span-2">
            <textarea disabled={readOnly} rows={3} value={metadata.contractTerms} onChange={(event) => setMetadata((current) => ({ ...current, contractTerms: event.target.value }))} className={inputClass} />
          </LabeledField>
        </div>
      </section>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className={`grid gap-5 ${readOnly ? "" : "xl:grid-cols-[0.72fr_1.28fr]"}`}>
          {!readOnly ? (
            <aside className="self-start rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-24">
              <p className="text-xs font-extrabold uppercase tracking-wide text-brand">Leistungskatalog</p>
              <h2 className="mt-1 text-xl font-extrabold text-slate-950">Leistungen hinzufügen</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">Am Desktop in die Positionsliste ziehen oder am Handy per Schaltfläche hinzufügen.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <label className="relative block">
                  <span className="sr-only">Katalog durchsuchen</span>
                  <Search aria-hidden="true" size={17} className="pointer-events-none absolute left-3 top-1/2 mt-1 -translate-y-1/2 text-slate-400" />
                  <input value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Leistung suchen …" className={`${inputClass} pl-10`} />
                </label>
                <LabeledField label="Kategorie">
                  <select value={catalogCategory} onChange={(event) => setCatalogCategory(event.target.value)} className={selectClass}><option value="">Alle Kategorien</option>{categories.map((category) => <option key={category}>{category}</option>)}</select>
                </LabeledField>
              </div>
              <div className="mt-4 grid max-h-[58vh] gap-3 overflow-y-auto pr-1">
                {visibleCatalog.map((item) => <CatalogCard key={item.id} item={item} disabled={readOnly} onAdd={() => addCatalogItem(item.id)} />)}
                {!visibleCatalog.length ? <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-600">Keine passende Leistung gefunden.</p> : null}
              </div>
              <button type="button" onClick={() => { setItems((current) => [...current, createCustomItem()]); setAnnouncement("Eine freie Position wurde hinzugefügt."); }} className={`${subtleButton} mt-4 w-full`}><Plus size={17} aria-hidden="true" /> Freie Position</button>
            </aside>
          ) : null}

          <section ref={setDropRef} className={`min-w-0 rounded-xl border p-4 shadow-sm sm:p-5 ${isOver ? "border-brand bg-brand-soft/40" : "border-slate-200 bg-slate-50"}`}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wide text-brand">Angebotspositionen</p>
                <h2 className="mt-1 text-xl font-extrabold text-slate-950">Leistungsumfang ({items.length})</h2>
              </div>
              {readOnly ? <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-extrabold text-emerald-800"><Check size={15} aria-hidden="true" /> Version unveränderlich</span> : <p className="text-xs font-semibold text-slate-500">Ziehen oder mit Pfeilen sortieren</p>}
            </div>
            {items.length ? (
              <SortableContext items={items.map((item) => `item:${item.clientKey}`)} strategy={verticalListSortingStrategy}>
                <div className="mt-5 grid gap-4">
                  {items.map((item, index) => <SortableOfferItem key={item.clientKey} item={item} index={index} count={items.length} result={pricing.items[index]} readOnly={readOnly} update={(patch) => updateItem(item.clientKey, patch)} remove={() => { setItems((current) => current.filter((entry) => entry.clientKey !== item.clientKey)); setAnnouncement(`Position ${index + 1} wurde entfernt.`); }} move={(direction) => moveItem(index, direction)} />)}
                </div>
              </SortableContext>
            ) : (
              <div className={`mt-5 rounded-xl border-2 border-dashed p-8 text-center ${isOver ? "border-brand bg-white" : "border-slate-300 bg-white"}`}>
                <p className="font-extrabold text-slate-950">Noch keine Position</p>
                <p className="mt-2 text-sm text-slate-600">Fügen Sie mindestens eine Katalogleistung oder freie Position hinzu.</p>
              </div>
            )}
          </section>
        </div>
      </DndContext>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <DiscountEditor discounts={overallDiscounts} onChange={setOverallDiscounts} disabled={readOnly} label="Rabatt auf das Gesamtangebot" />
        <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <h2 className="font-extrabold text-slate-950">Getrennte Abrechnungssummen</h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">Einmalige, monatliche, saisonale und einsatzbezogene Beträge werden nicht irreführend zu einem Zahlungsbetrag vermischt.</p>
          </div>
          {bucketRows.length ? (
            <div className="divide-y divide-slate-200">
              {bucketRows.map((row) => (
                <div key={row.billingBucket} className="grid gap-3 px-4 py-4 sm:grid-cols-[1.2fr_repeat(3,1fr)] sm:items-center">
                  <p className="font-extrabold text-slate-950">{row.label}</p>
                  <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Netto</p><p className="mt-1 font-extrabold text-slate-900">{row.formattedNet}</p></div>
                  <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Steuer</p><p className="mt-1 font-extrabold text-slate-900">{row.formattedTax}</p></div>
                  <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Brutto</p><p className="mt-1 text-lg font-extrabold text-brand">{row.formattedGross}</p></div>
                </div>
              ))}
            </div>
          ) : <p className="p-5 text-sm text-slate-600">Sobald Positionen bepreist sind, erscheinen hier die Abrechnungssummen.</p>}
        </div>
        <dl className="mt-5 grid gap-3 rounded-xl bg-slate-950 p-4 text-white sm:grid-cols-4">
          <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-300">Zwischensumme</dt><dd className="mt-1 text-lg font-extrabold">{formatCents(pricing.totals.subtotalCents)}</dd></div>
          <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-300">Rabatte</dt><dd className="mt-1 text-lg font-extrabold">− {formatCents(pricing.totals.discountCents)}</dd></div>
          <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-300">Netto</dt><dd className="mt-1 text-lg font-extrabold">{formatCents(pricing.totals.netCents)}</dd></div>
          <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-300">Rechnerische Bruttosumme</dt><dd className="mt-1 text-xl font-extrabold text-accent">{formatCents(pricing.totals.grossCents)}</dd></div>
        </dl>
        {pricing.hasMixedBillingBuckets ? <p className="mt-3 text-xs leading-5 text-slate-500">Die rechnerische Gesamtsumme dient nur der Dokumentübersicht. Verbindlich sind die getrennten Abrechnungsbasen oben.</p> : null}
      </section>

      {!readOnly ? (
        <div className="sticky bottom-[5.6rem] z-20 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur sm:flex-row sm:items-center sm:justify-between lg:bottom-4">
          <p className="text-sm font-semibold text-slate-650">Der Entwurf bleibt bearbeitbar. Erst der Versand versiegelt eine unveränderliche Version.</p>
          <button disabled={!items.length || !metadata.customerId || !metadata.title.trim()} className={`${buttonClass} shrink-0 sm:w-auto`}>Angebot als Entwurf speichern</button>
        </div>
      ) : allowRevision ? (
        <div className="sticky bottom-[5.6rem] z-20 flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50/95 p-3 shadow-xl backdrop-blur sm:flex-row sm:items-center sm:justify-between lg:bottom-4">
          <p className="text-sm font-semibold text-blue-950">Die versendete Version bleibt unverändert. Der neue Entwurf nutzt die aktuellen zentralen Basis-, Flächen- und Faktorregeln; positionsspezifische Winterkonditionen werden übernommen und können anschließend bewusst angepasst werden.</p>
          <button className={`${buttonClass} shrink-0 sm:w-auto`}>Neue Version als Entwurf anlegen</button>
        </div>
      ) : null}
    </form>
  );
}
