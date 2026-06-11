import type { Metadata } from "next";
import { CookieBanner } from "@/components/CookieBanner";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { MobileStickyCTA } from "@/components/MobileStickyCTA";
import { SEOJsonLd } from "@/components/SEOJsonLd";
import { ASSETS, SITE } from "@/lib/site";
import { absoluteUrl, graph, localBusinessSchema } from "@/lib/seo";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: "Hausmeisterservice Hannover | Objektbetreuung mit Hausvia",
    template: "%s",
  },
  description:
    "Hausvia bietet Hausmeisterservice, Objektbetreuung und Gebäudeservice in Hannover und Umgebung. Jetzt Bedarf online zusammenstellen und kostenlos anfragen.",
  alternates: {
    canonical: SITE.url,
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
    icon: ASSETS.favicon,
    shortcut: ASSETS.favicon,
    apple: ASSETS.mark,
  },
  openGraph: {
    title: "Hausmeisterservice Hannover | Objektbetreuung mit Hausvia",
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
    title: "Hausmeisterservice Hannover | Objektbetreuung mit Hausvia",
    description:
      "Hausvia bietet Hausmeisterservice, Objektbetreuung und Gebäudeservice in Hannover und Umgebung.",
    images: [absoluteUrl(ASSETS.hero)],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className="h-full scroll-smooth">
      <body className="flex min-h-full flex-col bg-slate-50 pb-16 text-slate-900 antialiased md:pb-0">
        <Header />
        <div className="flex-1">{children}</div>
        <Footer />
        <MobileStickyCTA />
        <CookieBanner />
        <SEOJsonLd data={graph([localBusinessSchema()])} />
      </body>
    </html>
  );
}
