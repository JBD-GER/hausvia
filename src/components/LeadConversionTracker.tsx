"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import {
  getCookieConsentRaw,
  parseCookieConsent,
  readCookieConsent,
  subscribeCookieConsentChange,
} from "@/lib/cookieConsent";
import {
  flushPendingWinterdienstConversions,
  getGoogleAdsConfig,
  initializeGtag,
  markWinterdienstConversionPending,
} from "@/components/GoogleAdsTag";
import {
  normalizeGoogleAdsUserData,
  type GoogleAdsUserData,
  type GoogleAdsUserDataInput,
} from "@/lib/googleAds";

const pendingConversionKey = "hausvia-pending-lead-conversion-v2";
const pendingConversionUserDataKey = "hausvia-pending-lead-conversion-user-data-v2";

type PendingLeadConversion = {
  source: string;
  transactionId: string;
};

function useMarketingConsent() {
  const rawConsent = useSyncExternalStore(subscribeCookieConsentChange, getCookieConsentRaw, () => "");
  return useMemo(() => parseCookieConsent(rawConsent), [rawConsent]);
}

function readPendingUserData(): GoogleAdsUserData | null {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(pendingConversionUserDataKey) || "null") as
      | Partial<GoogleAdsUserData>
      | null;
    if (!parsed || typeof parsed.email !== "string") return null;

    return normalizeGoogleAdsUserData({
      email: parsed.email,
      phone: typeof parsed.phone_number === "string" ? parsed.phone_number : undefined,
    });
  } catch {
    return null;
  }
}

function normalizeTransactionId(value: string) {
  const normalized = value.trim();
  return normalized.length >= 8 && normalized.length <= 100 && /^[A-Za-z0-9._:-]+$/.test(normalized)
    ? normalized
    : "";
}

function readPendingConversion(): PendingLeadConversion | null {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(pendingConversionKey) || "null") as
      | Partial<PendingLeadConversion>
      | null;
    const source = typeof parsed?.source === "string" ? parsed.source.trim().slice(0, 80) : "";
    const transactionId = normalizeTransactionId(
      typeof parsed?.transactionId === "string" ? parsed.transactionId : "",
    );
    return source && transactionId ? { source, transactionId } : null;
  } catch {
    return null;
  }
}

export function markLeadConversionPending(
  source: string,
  submissionId: string,
  userDataInput?: GoogleAdsUserDataInput,
) {
  if (typeof window === "undefined") return;

  const transactionId = normalizeTransactionId(submissionId);
  if (!transactionId) return;

  window.sessionStorage.setItem(
    pendingConversionKey,
    JSON.stringify({ source: source.trim().slice(0, 80), transactionId } satisfies PendingLeadConversion),
  );

  const userData = userDataInput ? normalizeGoogleAdsUserData(userDataInput) : null;
  if (readCookieConsent()?.marketing === true && userData) {
    window.sessionStorage.setItem(pendingConversionUserDataKey, JSON.stringify(userData));
  } else {
    window.sessionStorage.removeItem(pendingConversionUserDataKey);
  }
}

export function LeadConversionTracker() {
  const consent = useMarketingConsent();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (consent?.marketing !== true) return;

    const pendingConversion = readPendingConversion();
    if (!pendingConversion) return;

    const { googleAdsId, leadConversionLabel } = getGoogleAdsConfig();
    if (!googleAdsId || !leadConversionLabel) return;

    initializeGtag();
    window.gtag?.("config", googleAdsId);

    const userData = readPendingUserData();
    if (userData) window.gtag?.("set", "user_data", userData);

    window.dataLayer?.push({
      event: "angebot_anfordern_conversion",
      conversion_name: "Angebot anfordern",
      conversion_id: googleAdsId,
      conversion_label: leadConversionLabel,
      send_to: `${googleAdsId}/${leadConversionLabel}`,
      lead_source: pendingConversion.source,
      transaction_id: pendingConversion.transactionId,
    });

    window.gtag?.("event", "conversion", {
      send_to: `${googleAdsId}/${leadConversionLabel}`,
      transaction_id: pendingConversion.transactionId,
      event_category: "lead",
      event_label: "Angebot anfordern",
      conversion_name: "Angebot anfordern",
    });
    if (userData) window.gtag?.("set", "user_data", {});

    firedRef.current = true;
    window.sessionStorage.removeItem(pendingConversionKey);
    window.sessionStorage.removeItem(pendingConversionUserDataKey);
  }, [consent]);

  return null;
}

export function WinterdienstConversionTracker({
  submissionId,
  email,
  phone,
}: {
  submissionId: string;
  email: string;
  phone: string;
}) {
  const consent = useMarketingConsent();

  useEffect(() => {
    const normalizedSubmissionId = submissionId.trim();
    if (!normalizedSubmissionId) return;

    markWinterdienstConversionPending(normalizedSubmissionId, { email, phone });
    if (consent?.marketing === true) flushPendingWinterdienstConversions();
  }, [consent?.marketing, email, phone, submissionId]);

  return null;
}
