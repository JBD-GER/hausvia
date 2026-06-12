"use client";

import Script from "next/script";
import { getGoogleAdsConfig } from "@/components/GoogleAdsTag";

function escapeScriptValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function GoogleAdsLeadConversion() {
  const { googleAdsId, leadConversionLabel } = getGoogleAdsConfig();

  if (!googleAdsId || !leadConversionLabel) return null;

  const escapedGoogleAdsId = escapeScriptValue(googleAdsId);
  const escapedSendTo = escapeScriptValue(`${googleAdsId}/${leadConversionLabel}`);

  return (
    <>
      <Script
        id="hausvia-google-ads-danke-tag"
        src={`https://www.googletagmanager.com/gtag/js?id=${googleAdsId}`}
        strategy="afterInteractive"
      />
      <Script id="hausvia-google-ads-danke-conversion" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${escapedGoogleAdsId}');
          gtag('event', 'conversion', {
            'send_to': '${escapedSendTo}'
          });
        `}
      </Script>
    </>
  );
}
