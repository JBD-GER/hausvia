export const googleAdsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID || "AW-18131829931";
export const googleAdsLeadConversionLabel =
  process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_CONVERSION_LABEL || "p6rgCLT7yr0cEKuJ98VD";
export const googleAdsWinterdienstConversionLabel =
  process.env.NEXT_PUBLIC_GOOGLE_ADS_WINTERDIENST_CONVERSION_LABEL || "VMaTCOa13tscEKuJ98VD";

export type GoogleAdsUserDataInput = {
  email?: string;
  phone?: string;
};

export type GoogleAdsUserData = {
  email: string;
  phone_number?: string;
};

function normalizeEmail(value: string | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : "";
}

function normalizeGermanPhoneNumber(value: string | undefined) {
  const compact = value?.trim().replace(/[^\d+]/g, "") ?? "";
  if (!compact || (compact.match(/\+/g)?.length ?? 0) > 1) return "";

  let normalized = compact;
  if (normalized.startsWith("00")) normalized = `+${normalized.slice(2)}`;
  else if (normalized.startsWith("0")) normalized = `+49${normalized.slice(1)}`;
  else if (normalized.startsWith("49")) normalized = `+${normalized}`;

  return /^\+[1-9]\d{10,14}$/.test(normalized) ? normalized : "";
}

export function normalizeGoogleAdsUserData(input: GoogleAdsUserDataInput): GoogleAdsUserData | null {
  const email = normalizeEmail(input.email);
  if (!email) return null;

  const phoneNumber = normalizeGermanPhoneNumber(input.phone);
  return {
    email,
    ...(phoneNumber ? { phone_number: phoneNumber } : {}),
  };
}
