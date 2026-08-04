"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { getCookieConsentRaw, parseCookieConsent, subscribeCookieConsentChange } from "@/lib/cookieConsent";
import {
  flushPendingWinterdienstConversions,
  getGoogleAdsConfig,
  initializeGtag,
  markWinterdienstConversionPending,
} from "@/components/GoogleAdsTag";

const pendingConversionKey = "hausvia-pending-lead-conversion";

function useMarketingConsent() {
  const rawConsent = useSyncExternalStore(subscribeCookieConsentChange, getCookieConsentRaw, () => "");
  return useMemo(() => parseCookieConsent(rawConsent), [rawConsent]);
}

export function markLeadConversionPending(source: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(pendingConversionKey, source);
}

export function LeadConversionTracker() {
  const consent = useMarketingConsent();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (consent?.marketing !== true) return;

    const source = window.sessionStorage.getItem(pendingConversionKey) || "danke-page";

    const { googleAdsId, leadConversionLabel } = getGoogleAdsConfig();
    if (!googleAdsId || !leadConversionLabel) return;

    initializeGtag();
    window.gtag?.("config", googleAdsId);

    window.gtag?.("event", "conversion", {
      send_to: `${googleAdsId}/${leadConversionLabel}`,
      event_category: "lead",
      event_label: "Angebot anfordern",
      conversion_name: "Angebot anfordern",
    });

    window.gtag?.("event", "generate_lead", {
      send_to: googleAdsId,
      event_category: "lead",
      event_label: source,
      lead_source: source,
    });

    firedRef.current = true;
    window.sessionStorage.removeItem(pendingConversionKey);
  }, [consent]);

  return null;
}

export function WinterdienstConversionTracker({ submissionId }: { submissionId: string }) {
  const consent = useMarketingConsent();

  useEffect(() => {
    const normalizedSubmissionId = submissionId.trim();
    if (!normalizedSubmissionId) return;

    markWinterdienstConversionPending(normalizedSubmissionId);
    if (consent?.marketing === true) flushPendingWinterdienstConversions();
  }, [consent?.marketing, submissionId]);

  return null;
}
