import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));
const requiredText = (max: number, message = "Dieses Feld ist erforderlich.") =>
  z.string().trim().min(1, message).max(max);
const phone = optionalText(40).refine(
  (value) => !value || /^[+\d][\d\s()/.-]{5,39}$/.test(value),
  "Bitte eine gültige Telefonnummer eingeben.",
);
const requiredPhone = requiredText(40, "Eine Telefonnummer ist erforderlich.").refine(
  (value) => /^[+\d][\d\s()/.-]{5,39}$/.test(value),
  "Bitte eine gültige Telefonnummer eingeben.",
);
const uuid = z.string().uuid("Ungültige Zuordnung.");
const euroInput = z
  .string()
  .trim()
  .regex(
    /^\d{1,9}(?:[.,]\d{1,2})?$/,
    "Bitte einen gültigen Euro-Betrag eingeben.",
  );

export const addressSchema = z.object({
  street: requiredText(160),
  houseNumber: requiredText(30),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "Bitte eine fünfstellige Postleitzahl eingeben."),
  city: requiredText(120),
  country: requiredText(80).default("Deutschland"),
});

export const customerSchema = z
  .object({
    category: z.enum([
      "private",
      "commercial",
      "property_management",
      "investor",
    ]),
    companyName: optionalText(180),
    firstName: optionalText(100),
    lastName: optionalText(100),
    contactFirstName: optionalText(100),
    contactLastName: optionalText(100),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Bitte eine gültige E-Mail-Adresse eingeben."),
    phone: requiredPhone,
    notes: optionalText(4_000),
    ...addressSchema.shape,
  })
  .superRefine((value, ctx) => {
    const person = Boolean(value.firstName && value.lastName);
    if (value.category === "private" && !person) {
      ctx.addIssue({
        code: "custom",
        path: ["firstName"],
        message: "Vor- und Nachname sind erforderlich.",
      });
    }
    if (
      ["commercial", "property_management"].includes(value.category) &&
      !value.companyName
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["companyName"],
        message: "Der Firmenname ist erforderlich.",
      });
    }
    if (
      ["commercial", "property_management"].includes(value.category) &&
      (!value.contactFirstName || !value.contactLastName)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["contactFirstName"],
        message: "Vor- und Nachname des Ansprechpartners sind erforderlich.",
      });
    }
    if (value.category === "investor" && !value.companyName && !person) {
      ctx.addIssue({
        code: "custom",
        path: ["companyName"],
        message: "Firma oder Vor- und Nachname angeben.",
      });
    }
  });

export const employeeSchema = z.object({
  firstName: requiredText(100),
  lastName: requiredText(100),
  category: z.enum(["minijob", "part_time", "full_time", "freelancer"]),
  companyName: optionalText(180),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Bitte eine gültige E-Mail-Adresse eingeben."),
  phone: requiredPhone,
  notes: optionalText(4_000),
  ...addressSchema.shape,
});

export const propertySchema = z.object({
  customerId: uuid,
  name: requiredText(180),
  objectKey: optionalText(80),
  propertyType: z.enum([
    "single_family",
    "multi_family",
    "residential_complex",
    "weg",
    "commercial",
    "office_practice",
    "mixed",
    "other",
  ]),
  ownershipName: optionalText(180),
  status: z.enum(["planning", "active", "paused"]),
  monthlyFee: euroInput.default("0"),
  taxRate: z.coerce.number().min(0).max(100).default(19),
  maxVisitMinutes: z.coerce.number().int().min(1).max(1_440),
  internalBriefing: optionalText(12_000),
  careStartDate: z.string().date(),
  buildingLabel: optionalText(120),
  accessNotes: optionalText(4_000),
  ...addressSchema.shape,
});

export const buildingSchema = z.object({
  propertyId: uuid,
  label: optionalText(120),
  accessNotes: optionalText(4_000),
  ...addressSchema.shape,
});

export const propertyServiceSchema = z
  .object({
    propertyId: uuid,
    catalogId: z.string().uuid().optional().or(z.literal("")),
    name: requiredText(180),
    serviceKey: requiredText(100),
    category: requiredText(120),
    customerDescription: optionalText(4_000),
    internalInstruction: optionalText(8_000),
    executionRule: z.enum([
      "every_visit",
      "once_weekly",
      "multiple_weekly",
      "once_monthly",
      "multiple_monthly",
      "once_quarterly",
      "once_yearly",
      "once_season",
      "on_demand",
      "manual",
    ]),
    occurrencesPerPeriod: z.coerce.number().int().min(1).max(31).default(1),
    seasonal: z.boolean().default(false),
    seasonStartMonth: z.coerce.number().int().min(1).max(12).optional(),
    seasonEndMonth: z.coerce.number().int().min(1).max(12).optional(),
    startDate: z.string().date(),
    endDate: z.string().date().optional().or(z.literal("")),
    estimatedMinutes: z.coerce.number().int().min(1).max(1_440).optional(),
    sortOrder: z.coerce.number().int().min(0).max(100_000).default(0),
    customerVisible: z.boolean().default(true),
    photoRequired: z.boolean().default(false),
    buildingIds: z.array(uuid).default([]),
  })
  .superRefine((value, context) => {
    if (value.endDate && value.endDate < value.startDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Das Enddatum darf nicht vor dem Startdatum liegen.",
      });
    }
    if (value.seasonal && (!value.seasonStartMonth || !value.seasonEndMonth)) {
      context.addIssue({
        code: "custom",
        path: ["seasonStartMonth"],
        message: "Für saisonale Leistungen müssen Start- und Endmonat gewählt werden.",
      });
    }
  });

export const visitPlanSchema = z
  .object({
    propertyId: uuid,
    label: requiredText(180),
    frequency: z.enum(["weekly", "monthly", "quarterly", "individual"]),
    visitsPerPeriod: z.coerce.number().int().min(1).max(31),
    weekdays: z.array(z.coerce.number().int().min(1).max(7)).default([]),
    monthDays: z.array(z.coerce.number().int().min(1).max(31)).default([]),
    desiredTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional()
      .or(z.literal("")),
    windowStart: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional()
      .or(z.literal("")),
    windowEnd: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional()
      .or(z.literal("")),
    startDate: z.string().date(),
    endDate: z.string().date().optional().or(z.literal("")),
    primaryEmployeeId: uuid,
    maxVisitMinutes: z.coerce.number().int().min(1).max(1_440),
    buildingIds: z.array(uuid).default([]),
    additionalEmployeeIds: z.array(uuid).default([]),
  })
  .superRefine((value, context) => {
    if (value.endDate && value.endDate < value.startDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Das Enddatum darf nicht vor dem Startdatum liegen.",
      });
    }
    if (value.windowStart && value.windowEnd && value.windowEnd <= value.windowStart) {
      context.addIssue({
        code: "custom",
        path: ["windowEnd"],
        message: "Das Ende des Zeitfensters muss nach dessen Beginn liegen.",
      });
    }
    if (Boolean(value.windowStart) !== Boolean(value.windowEnd)) {
      context.addIssue({
        code: "custom",
        path: value.windowStart ? ["windowEnd"] : ["windowStart"],
        message: "Ein Zeitfenster benötigt eine Start- und eine Endzeit.",
      });
    }
    if (!value.desiredTime && !value.windowStart) {
      context.addIssue({
        code: "custom",
        path: ["desiredTime"],
        message: "Bitte eine gewünschte Uhrzeit oder ein vollständiges Zeitfenster angeben.",
      });
    }
    if (value.desiredTime && (value.windowStart || value.windowEnd)) {
      context.addIssue({
        code: "custom",
        path: ["desiredTime"],
        message: "Bitte entweder eine feste Uhrzeit oder ein Zeitfenster verwenden.",
      });
    }
    const selectedDays =
      value.frequency === "weekly"
        ? new Set(value.weekdays).size
        : value.frequency === "monthly" || value.frequency === "quarterly"
          ? new Set(value.monthDays).size
          : 0;
    const expectedVisits = value.frequency === "individual" ? 1 : selectedDays || 1;
    if (value.visitsPerPeriod !== expectedVisits) {
      context.addIssue({
        code: "custom",
        path: ["visitsPerPeriod"],
        message:
          value.frequency === "individual"
            ? "Ein individueller Plan muss genau einen Termin enthalten."
            : `Die Anzahl der Besuche muss den ausgewählten Tagen entsprechen (${expectedVisits}).`,
      });
    }
  });

const visitTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Bitte eine gültige Uhrzeit eingeben.");

export const visitPlanStatusSchema = z.object({
  propertyId: uuid,
  visitPlanId: uuid,
  status: z.enum(["active", "paused", "archived"]),
});

export const rescheduleVisitSchema = z
  .object({
    propertyId: uuid,
    visitId: uuid,
    scheduledDate: z.string().date(),
    plannedStartTime: visitTime,
    windowStart: visitTime.optional().or(z.literal("")),
    windowEnd: visitTime.optional().or(z.literal("")),
    reason: requiredText(1_000, "Bitte geben Sie einen Änderungsgrund an.").refine(
      (value) => value.length >= 5,
      "Der Änderungsgrund muss mindestens fünf Zeichen enthalten.",
    ),
  })
  .refine(
    (value) =>
      !value.windowStart ||
      !value.windowEnd ||
      value.windowEnd > value.windowStart,
    {
      path: ["windowEnd"],
      message: "Das Ende des Zeitfensters muss nach dessen Beginn liegen.",
    },
  );

export const cancelVisitSchema = z.object({
  propertyId: uuid,
  visitId: uuid,
  reason: requiredText(1_000, "Bitte geben Sie einen Absagegrund an.").refine(
    (value) => value.length >= 5,
    "Der Absagegrund muss mindestens fünf Zeichen enthalten.",
  ),
});

export const manualVisitSchema = z
  .object({
    propertyId: uuid,
    scheduledDate: z.string().date(),
    plannedStartTime: visitTime,
    windowStart: visitTime.optional().or(z.literal("")),
    windowEnd: visitTime.optional().or(z.literal("")),
    primaryEmployeeId: uuid,
    maxVisitMinutes: z.coerce.number().int().min(1).max(1_440),
    buildingIds: z
      .array(uuid)
      .min(1, "Bitte wählen Sie mindestens ein Gebäude aus."),
    serviceIds: z
      .array(uuid)
      .min(1, "Bitte wählen Sie mindestens eine Bedarfsleistung aus."),
  })
  .refine(
    (value) =>
      !value.windowStart ||
      !value.windowEnd ||
      value.windowEnd > value.windowStart,
    {
      path: ["windowEnd"],
      message: "Das Ende des Zeitfensters muss nach dessen Beginn liegen.",
    },
  );

export const damageSchema = z.object({
  buildingId: uuid,
  title: requiredText(180),
  description: requiredText(5_000),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
});

export const operationalReportSchema = z.object({
  propertyId: uuid,
  buildingId: z.string().uuid().optional().or(z.literal("")),
  equipmentId: z.string().uuid().optional().or(z.literal("")),
  visitId: z.string().uuid().optional().or(z.literal("")),
  category: z.enum([
    "equipment_broken",
    "cleaning_supply_empty",
    "consumable_low",
    "tool_missing",
    "access_impossible",
    "key_problem",
    "other",
  ]),
  urgency: z.enum(["normal", "high", "urgent"]).default("normal"),
  title: requiredText(180),
  description: requiredText(5_000),
});

export const messageSchema = z.object({
  propertyId: uuid,
  body: requiredText(4_000),
});

export const complaintSchema = z.object({
  propertyId: uuid,
  visitId: z.string().uuid().optional().or(z.literal("")),
  title: requiredText(180),
  description: requiredText(5_000),
});

export const companySettingsSchema = z.object({
  legalName: requiredText(180),
  brandName: requiredText(120),
  street: optionalText(160),
  houseNumber: optionalText(30),
  postalCode: optionalText(20),
  city: optionalText(120),
  country: requiredText(80),
  taxNumber: optionalText(80),
  vatId: optionalText(80),
  commercialRegister: optionalText(180),
  management: optionalText(180),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Bitte eine gültige E-Mail-Adresse eingeben."),
  phone,
  bankName: optionalText(180),
  iban: optionalText(50),
  bic: optionalText(20),
  paymentDueDays: z.coerce.number().int().min(0).max(365),
  invoicePrefix: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .regex(
      /^[A-Za-z0-9-]+$/,
      "Bitte nur Buchstaben, Zahlen und Bindestriche verwenden.",
    ),
  defaultTaxRate: z.coerce.number().min(0).max(100),
  defaultHourlyRate: euroInput,
  invoiceEmailFrom: z
    .string()
    .trim()
    .toLowerCase()
    .email("Bitte eine gültige Absenderadresse eingeben."),
  invoiceEmailReplyTo: z
    .string()
    .trim()
    .toLowerCase()
    .email("Bitte eine gültige Antwortadresse eingeben."),
});

export const propertyAdminSettingsSchema = z
  .object({
    propertyId: uuid,
    monthlyFee: euroInput,
    taxRate: z.coerce.number().min(0).max(100),
    maxVisitMinutes: z.coerce.number().int().min(1).max(1_440),
    validFrom: z.string().date(),
    validUntil: z.string().date().optional().or(z.literal("")),
    internalNotes: optionalText(8_000),
    internalBriefing: optionalText(12_000),
  })
  .refine(
    (value) => !value.validUntil || value.validUntil >= value.validFrom,
    {
      path: ["validUntil"],
      message: "Das Gültigkeitsende darf nicht vor dem Beginn liegen.",
    },
  );

export const propertyBillingProfileSchema = z.object({
  propertyId: uuid,
  recipientName: requiredText(180),
  addressAddition: optionalText(180),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Bitte eine gültige Rechnungs-E-Mail eingeben."),
  ...addressSchema.shape,
});

export const extraChargeSchema = z.object({
  propertyId: uuid,
  visitId: z.string().uuid().optional().or(z.literal("")),
  description: requiredText(1_000),
  serviceDate: z.string().date(),
  durationMinutes: z.coerce.number().int().min(0).max(100_000),
  hourlyRate: euroInput.optional().or(z.literal("")),
  manualNetAmount: euroInput.optional().or(z.literal("")),
  materialCost: euroInput.optional().or(z.literal("")),
  taxRate: z.coerce.number().min(0).max(100),
  internalNote: optionalText(8_000),
  billable: z.boolean().default(true),
});

export function formValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export function formValues(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((value) => String(value).trim())
    .filter(Boolean);
}

export function checkbox(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

export function firstZodError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Bitte prüfen Sie Ihre Eingaben.";
}
