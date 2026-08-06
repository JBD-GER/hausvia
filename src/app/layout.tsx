import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { GoogleAdsTag } from "@/components/GoogleAdsTag";
import { SEOJsonLd } from "@/components/SEOJsonLd";
import { SiteChrome } from "@/components/SiteChrome";
import { cookieConsentStorageKey } from "@/lib/cookieConsent";
import { googleAdsId } from "@/lib/googleAds";
import { ASSETS, SITE } from "@/lib/site";
import { absoluteUrl, graph, localBusinessSchema, websiteSchema } from "@/lib/seo";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  applicationName: SITE.name,
  authors: [{ name: SITE.name, url: SITE.url }],
  creator: SITE.name,
  publisher: SITE.name,
  title: {
    default: "Hausmeisterservice Hannover | Hausvia",
    template: "%s",
  },
  description:
    "Hausvia bietet Hausmeisterservice, Objektbetreuung und Gebäudeservice in Hannover und Umgebung. Jetzt Bedarf online zusammenstellen und kostenlos anfragen.",
  alternates: {
    canonical: SITE.url,
    languages: {
      "de-DE": SITE.url,
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: [
      { url: ASSETS.favicon, type: "image/png", sizes: "64x64" },
      { url: ASSETS.mark, type: "image/png", sizes: "512x512" },
    ],
    shortcut: ASSETS.favicon,
    apple: [{ url: ASSETS.appleIcon, type: "image/png", sizes: "180x180" }],
  },
  openGraph: {
    title: "Hausmeisterservice Hannover | Hausvia",
    description:
      "Hausvia bietet Hausmeisterservice, Objektbetreuung und Gebäudeservice in Hannover und Umgebung.",
    url: SITE.url,
    siteName: SITE.name,
    locale: "de_DE",
    type: "website",
    images: [
      {
        url: absoluteUrl(ASSETS.hero),
        width: 1200,
        height: 630,
        alt: "Hausvia Hausmeisterservice in Hannover",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Hausmeisterservice Hannover | Hausvia",
    description:
      "Hausvia bietet Hausmeisterservice, Objektbetreuung und Gebäudeservice in Hannover und Umgebung.",
    images: [absoluteUrl(ASSETS.hero)],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b2f68",
  colorScheme: "light",
};

const safeGoogleAdsId = googleAdsId.replace(/[^A-Za-z0-9-]/g, "");
const googleAdsConsentBootstrap = `
  window.dataLayer = window.dataLayer || [];
  function gtag(){window.dataLayer.push(arguments);}
  window.gtag = window.gtag || gtag;
  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    wait_for_update: 500
  });
  window.gtag('set', 'ads_data_redaction', true);
  window.gtag('set', 'url_passthrough', true);
  try {
    var hausviaConsent = JSON.parse(window.localStorage.getItem(${JSON.stringify(cookieConsentStorageKey)}) || 'null');
    if (hausviaConsent && typeof hausviaConsent.marketing === 'boolean' && typeof hausviaConsent.analytics === 'boolean') {
      window.gtag('consent', 'update', {
        ad_storage: hausviaConsent.marketing ? 'granted' : 'denied',
        ad_user_data: hausviaConsent.marketing ? 'granted' : 'denied',
        ad_personalization: hausviaConsent.marketing ? 'granted' : 'denied',
        analytics_storage: hausviaConsent.analytics ? 'granted' : 'denied'
      });
    }
  } catch (error) {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className="h-full scroll-smooth" data-scroll-behavior="smooth">
      <body className="flex min-h-full flex-col bg-slate-50 text-slate-900 antialiased">
        <Script id="hausvia-google-consent-default" strategy="beforeInteractive">
          {googleAdsConsentBootstrap}
        </Script>
        <SiteChrome>{children}</SiteChrome>
        <GoogleAdsTag />
        <Script
          id="hausvia-google-ads-tag"
          src={`https://www.googletagmanager.com/gtag/js?id=${safeGoogleAdsId}`}
          strategy="afterInteractive"
        />
        <Script id="hausvia-google-ads-config" strategy="afterInteractive">
          {`window.gtag('js', new Date()); window.gtag('config', '${safeGoogleAdsId}');`}
        </Script>
        <Analytics />
        <SEOJsonLd data={graph([websiteSchema(), localBusinessSchema()])} />
      </body>
    </html>
  );
}
