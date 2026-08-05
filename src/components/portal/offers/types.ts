import type {
  BillingBucket,
  ConfigurablePricingRuleDto,
  WinterPricingModel,
} from "@/lib/offerPricing";

export type OfferLifecycleStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "accepted"
  | "rejected"
  | "expired"
  | "withdrawn"
  | "superseded"
  | "linked";

export type OfferUnit =
  | "square_meter"
  | "piece"
  | "hour"
  | "visit"
  | "month"
  | "flat";

export type OfferFrequency =
  | "once"
  | "weekly"
  | "multiple_weekly"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "on_demand";

export type OfferBillingType =
  | "one_time"
  | "monthly"
  | "per_visit"
  | "per_hour"
  | "per_sqm"
  | "custom_flat";

export type OfferCalculationType =
  | "base_plus_area"
  | "per_unit"
  | "per_hour"
  | "per_visit"
  | "flat"
  | "custom";

export type OfferRecipientSnapshot = {
  company_name?: string;
  contact_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  recipient_name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  country?: string;
};

export type OfferCustomerOption = {
  id: string;
  label: string;
  contactName: string;
  snapshot: OfferRecipientSnapshot;
};

export type OfferPricingRule = ConfigurablePricingRuleDto & {
  id?: string;
  calculationType: OfferCalculationType;
  defaultBillingType: OfferBillingType;
  unitPriceCents: number;
  winterModel: WinterPricingModel | null;
  includedVisits: number;
  additionalVisitPriceCents: number;
  monthlyBaseFeeCents: number;
  seasonalFlatRateCents: number;
  customFormula?: string;
  isActive: boolean;
};

export type OfferCatalogItem = {
  id: string;
  serviceKey: string;
  name: string;
  category: string;
  description: string;
  defaultExecutionRule: string;
  defaultOccurrencesPerPeriod: number;
  defaultSeasonal: boolean;
  defaultSeasonStartMonth: number | null;
  defaultSeasonEndMonth: number | null;
  rule: OfferPricingRule;
};

export type OfferEditorDiscount = {
  clientKey: string;
  type: "percent" | "fixed";
  value: number;
  reason: string;
};

export type OfferEditorItem = {
  clientKey: string;
  serviceCatalogId: string | null;
  itemKind: "standard" | "winter" | "custom";
  title: string;
  description: string;
  areaSquareMeters: number;
  quantity: number;
  unit: OfferUnit;
  frequency: OfferFrequency;
  frequencyOccurrences: number;
  billingType: OfferBillingType;
  calculationType: OfferCalculationType;
  unitPriceCents: number;
  minimumPriceCents: number;
  taxRateBps: number;
  permanent: boolean;
  seasonal: boolean;
  seasonStartMonth: number | null;
  seasonEndMonth: number | null;
  visibleNote: string;
  winterSurfaceType: string | null;
  winterModel: WinterPricingModel | null;
  includedVisits: number;
  additionalVisitPriceCents: number;
  monthlyBaseFeeCents: number;
  seasonalFlatRateCents: number;
  surchargeCents: number;
  rule: ConfigurablePricingRuleDto;
  manualAmountsCents: Partial<Record<BillingBucket, number>>;
  manualReason: string;
  discounts: OfferEditorDiscount[];
};

export type OfferEditorInitial = {
  offerId?: string;
  versionId?: string;
  expectedUpdatedAt?: string;
  offerNumber?: string;
  versionNumber?: number;
  customerId: string;
  title: string;
  contactName: string;
  recipientSnapshot: OfferRecipientSnapshot;
  objectLabel: string;
  objectAddress: string;
  offerDate: string;
  validUntil: string;
  plannedStartDate: string;
  intro: string;
  visibleNote: string;
  internalNote: string;
  paymentTerms: string;
  contractTerms: string;
  items: OfferEditorItem[];
  overallDiscounts: OfferEditorDiscount[];
};

export type OfferPropertyOption = {
  id: string;
  name: string;
  address: string;
  buildings: Array<{ id: string; name: string }>;
};

export const offerStatusLabels: Record<OfferLifecycleStatus, string> = {
  draft: "Entwurf",
  sent: "Versendet",
  viewed: "Angesehen",
  accepted: "Angenommen",
  rejected: "Abgelehnt",
  expired: "Abgelaufen",
  withdrawn: "Zurückgezogen",
  superseded: "Ersetzt",
  linked: "Mit Immobilie verknüpft",
};

export const offerUnitLabels: Record<OfferUnit, string> = {
  square_meter: "m²",
  piece: "Stück",
  hour: "Stunde",
  visit: "Einsatz",
  month: "Monat",
  flat: "Pauschale",
};

export const offerFrequencyLabels: Record<OfferFrequency, string> = {
  once: "Einmalig",
  weekly: "Wöchentlich",
  multiple_weekly: "Mehrmals wöchentlich",
  monthly: "Monatlich",
  quarterly: "Vierteljährlich",
  yearly: "Jährlich",
  on_demand: "Nach Bedarf",
};

export const offerBillingTypeLabels: Record<OfferBillingType, string> = {
  one_time: "Einmalig",
  monthly: "Monatlich",
  per_visit: "Je Einsatz",
  per_hour: "Je Stunde",
  per_sqm: "Je m²",
  custom_flat: "Individuelle Pauschale",
};

export const offerCalculationTypeLabels: Record<OfferCalculationType, string> = {
  base_plus_area: "Grundpreis + Fläche",
  per_unit: "Preis je Einheit",
  per_hour: "Preis je Stunde",
  per_visit: "Preis je Einsatz",
  flat: "Pauschale",
  custom: "Individuell",
};

export const monthLabels = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];
