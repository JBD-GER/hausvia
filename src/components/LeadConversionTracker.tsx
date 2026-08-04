"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { getCookieConsentRaw, parseCookieConsent, subscribeCookieConsentChange } from "@/lib/cookieConsent";
import { getGoogleAdsConfig, initializeGtag } from "@/components/GoogleAdsTag";

const pendingConversionKey = "hausvia-pending-lead-conversion";
const winterdienstConversionStoragePrefix = "hausvia-google-ads-winterdienst:";

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
  const firedSubmissionRef = useRef("");

  useEffect(() => {
    const normalizedSubmissionId = submissionId.trim();
    if (!normalizedSubmissionId || consent?.marketing !== true) return;
    if (firedSubmissionRef.current === normalizedSubmissionId) return;

    const storageKey = `${winterdienstConversionStoragePrefix}${normalizedSubmissionId}`;
    try {
      if (window.sessionStorage.getItem(storageKey) === "sent") {
        firedSubmissionRef.current = normalizedSubmissionId;
        return;
      }
    } catch {
      // Das Ref verhindert weiterhin doppelte Events, falls Session Storage blockiert ist.
    }

    const { googleAdsId, winterdienstConversionLabel } = getGoogleAdsConfig();
    if (!googleAdsId || !winterdienstConversionLabel) return;

    initializeGtag();
    window.gtag?.("config", googleAdsId);
    window.gtag?.("event", "conversion", {
      send_to: `${googleAdsId}/${winterdienstConversionLabel}`,
      transaction_id: normalizedSubmissionId,
    });

    firedSubmissionRef.current = normalizedSubmissionId;
    try {
      window.sessionStorage.setItem(storageKey, "sent");
    } catch {
      // Tracking bleibt auch ohne Session Storage funktionsfähig.
    }
  }, [consent?.marketing, submissionId]);

  return null;
}
