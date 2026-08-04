"use client";

import Script from "next/script";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  getCookieConsentRaw,
  parseCookieConsent,
  readCookieConsent,
  subscribeCookieConsentChange,
} from "@/lib/cookieConsent";

const googleAdsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID || "AW-18131829931";
const leadConversionLabel =
  process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_CONVERSION_LABEL || "p6rgCLT7yr0cEKuJ98VD";
const winterdienstConversionLabel =
  process.env.NEXT_PUBLIC_GOOGLE_ADS_WINTERDIENST_CONVERSION_LABEL || "VMaTCOa13tscEKuJ98VD";

declare global {
  interface Window {
    dataLayer?: Array<unknown[] | Record<string, unknown>>;
    gtag?: (...args: unknown[]) => void;
  }
}

const winterdienstConversionStoragePrefix = "hausvia-google-ads-winterdienst:";
const pendingWinterdienstConversions = new Set<string>();
const inFlightWinterdienstConversions = new Set<string>();
const pushedWinterdienstCustomEvents = new Set<string>();
const winterdienstConversionAttempts = new Map<string, number>();
const winterdienstConversionTimers = new Map<string, number>();
const maximumWinterdienstConversionAttempts = 3;
const winterdienstConversionCallbackTimeoutMs = 4_000;

function normalizeSubmissionId(value: string) {
  const normalized = value.trim();
  return normalized.length >= 8 && normalized.length <= 100 && /^[A-Za-z0-9._:-]+$/.test(normalized)
    ? normalized
    : "";
}

function hasMarketingConsent() {
  return readCookieConsent()?.marketing === true;
}

function winterdienstConversionStorageKey(submissionId: string) {
  return `${winterdienstConversionStoragePrefix}${submissionId}`;
}

function readWinterdienstConversionStatus(submissionId: string) {
  try {
    return window.sessionStorage.getItem(winterdienstConversionStorageKey(submissionId));
  } catch {
    return null;
  }
}

function persistWinterdienstConversionStatus(submissionId: string, status: "pending" | "sent") {
  if (!hasMarketingConsent()) return;

  try {
    window.sessionStorage.setItem(winterdienstConversionStorageKey(submissionId), status);
  } catch {
    // In-Memory-Deduplizierung und Retry funktionieren auch ohne Session Storage.
  }
}

function collectPendingWinterdienstConversions() {
  const submissionIds = new Set(pendingWinterdienstConversions);

  if (!hasMarketingConsent()) return submissionIds;

  try {
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (!key?.startsWith(winterdienstConversionStoragePrefix)) continue;
      if (window.sessionStorage.getItem(key) !== "pending") continue;

      const submissionId = normalizeSubmissionId(key.slice(winterdienstConversionStoragePrefix.length));
      if (submissionId) submissionIds.add(submissionId);
    }
  } catch {
    // Die aktuelle In-Memory-Liste bleibt weiterhin verwendbar.
  }

  return submissionIds;
}

function completeWinterdienstConversion(submissionId: string) {
  const timer = winterdienstConversionTimers.get(submissionId);
  if (timer) window.clearTimeout(timer);

  winterdienstConversionTimers.delete(submissionId);
  winterdienstConversionAttempts.delete(submissionId);
  inFlightWinterdienstConversions.delete(submissionId);
  pendingWinterdienstConversions.delete(submissionId);
  persistWinterdienstConversionStatus(submissionId, "sent");
}

function dispatchWinterdienstConversion(submissionId: string) {
  if (!hasMarketingConsent()) return;
  if (readWinterdienstConversionStatus(submissionId) === "sent") {
    pendingWinterdienstConversions.delete(submissionId);
    return;
  }
  if (inFlightWinterdienstConversions.has(submissionId)) return;

  const attempts = winterdienstConversionAttempts.get(submissionId) ?? 0;
  if (attempts >= maximumWinterdienstConversionAttempts) return;

  const nextAttempt = attempts + 1;
  const sendTo = `${googleAdsId}/${winterdienstConversionLabel}`;
  winterdienstConversionAttempts.set(submissionId, nextAttempt);
  inFlightWinterdienstConversions.add(submissionId);
  persistWinterdienstConversionStatus(submissionId, "pending");

  initializeGtag();
  window.gtag?.("config", googleAdsId);

  if (!pushedWinterdienstCustomEvents.has(submissionId)) {
    window.dataLayer?.push({
      event: "winterdienst_conversion",
      event_id: submissionId,
      conversion_name: "Winterdienst",
      conversion_id: googleAdsId,
      conversion_label: winterdienstConversionLabel,
      send_to: sendTo,
      submission_id: submissionId,
      transaction_id: submissionId,
    });
    pushedWinterdienstCustomEvents.add(submissionId);
  }

  window.gtag?.("event", "conversion", {
    send_to: sendTo,
    transaction_id: submissionId,
    event_callback: () => completeWinterdienstConversion(submissionId),
  });

  if (!inFlightWinterdienstConversions.has(submissionId)) return;

  const timer = window.setTimeout(() => {
    winterdienstConversionTimers.delete(submissionId);
    inFlightWinterdienstConversions.delete(submissionId);

    if (!hasMarketingConsent()) return;
    dispatchWinterdienstConversion(submissionId);
  }, winterdienstConversionCallbackTimeoutMs);
  winterdienstConversionTimers.set(submissionId, timer);
}

export function initializeGtag() {
  window.dataLayer = window.dataLayer ?? [];
  window.gtag =
    window.gtag ??
    function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };
}

export function markWinterdienstConversionPending(value: string) {
  if (typeof window === "undefined") return;

  const submissionId = normalizeSubmissionId(value);
  if (!submissionId) return;
  if (hasMarketingConsent() && readWinterdienstConversionStatus(submissionId) === "sent") return;

  pendingWinterdienstConversions.add(submissionId);
  if (hasMarketingConsent()) persistWinterdienstConversionStatus(submissionId, "pending");
}

export function flushPendingWinterdienstConversions() {
  if (typeof window === "undefined" || !hasMarketingConsent()) return;

  for (const submissionId of collectPendingWinterdienstConversions()) {
    dispatchWinterdienstConversion(submissionId);
  }
}

export function GoogleAdsTag() {
  const rawConsent = useSyncExternalStore(subscribeCookieConsentChange, getCookieConsentRaw, () => "");
  const consent = useMemo(() => parseCookieConsent(rawConsent), [rawConsent]);
  const canLoadMarketing = consent?.marketing === true && Boolean(googleAdsId);

  useEffect(() => {
    if (!canLoadMarketing) return;

    initializeGtag();
    window.gtag?.("js", new Date());
    window.gtag?.("config", googleAdsId);
    flushPendingWinterdienstConversions();
  }, [canLoadMarketing]);

  if (!canLoadMarketing) return null;

  return (
    <Script
      id="hausvia-google-ads-tag"
      src={`https://www.googletagmanager.com/gtag/js?id=${googleAdsId}`}
      strategy="afterInteractive"
      onReady={flushPendingWinterdienstConversions}
    />
  );
}

export function getGoogleAdsConfig() {
  return {
    googleAdsId,
    leadConversionLabel,
    winterdienstConversionLabel,
  };
}
