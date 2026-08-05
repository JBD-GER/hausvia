import type { Metadata } from "next";
import { ASSETS, SEO_KEYWORDS, SEO_SERVICE_AREAS, SEO_SERVICES, SITE, type FaqItem } from "@/lib/site";

export function absoluteUrl(path = "/") {
  if (path.startsWith("http")) {
    return path;
  }

  return `${SITE.url}${path.startsWith("/") ? path : `/${path}`}`;
}

export function metadataForPage({
  title,
  description,
  path,
  image = ASSETS.hero,
  imageAlt,
  keywords = [],
  ogTitle,
  ogDescription,
}: {
  title: string;
  description: string;
  path: string;
  image?: string;
  imageAlt?: string;
  keywords?: string[];
  ogTitle?: string;
  ogDescription?: string;
}): Metadata {
  const url = absoluteUrl(path);
  const imageUrl = absoluteUrl(image);
  const pageKeywords = Array.from(new Set([...keywords, ...SEO_KEYWORDS]));

  return {
    title,
    description,
    applicationName: SITE.name,
    authors: [{ name: SITE.name, url: SITE.url }],
    creator: SITE.name,
    publisher: SITE.name,
    category: "Hausmeisterservice, Objektbetreuung und Gebäudeservice",
    keywords: pageKeywords,
    alternates: {
      canonical: url,
      languages: {
        "de-DE": url,
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
    openGraph: {
      title: ogTitle ?? title,
      description: ogDescription ?? description,
      url,
      siteName: SITE.name,
      locale: "de_DE",
      type: "website",
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: imageAlt ?? `${SITE.name} Hausmeisterservice in Hannover`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle ?? title,
      description: ogDescription ?? description,
      images: [imageUrl],
    },
    other: {
      "geo.region": "DE-NI",
      "geo.placename": "Hannover",
      "business:contact_data:locality": "Hannover",
      "business:contact_data:region": "Niedersachsen",
      "business:contact_data:country_name": "Deutschland",
    },
  };
}

export function graph(items: unknown[]) {
  return {
    "@context": "https://schema.org",
    "@graph": items,
  };
}

export function localBusinessSchema() {
  return {
    "@type": ["LocalBusiness", "ProfessionalService"],
    "@id": absoluteUrl("/#localbusiness"),
    name: SITE.name,
    legalName: SITE.legalName,
    alternateName: "Hausvia Hausmeisterservice",
    url: SITE.url,
    logo: absoluteUrl(ASSETS.logo),
    image: [absoluteUrl(ASSETS.hero), absoluteUrl(ASSETS.garden), absoluteUrl(ASSETS.repair)],
    description: SITE.tagline,
    slogan: SITE.slogan,
    telephone: SITE.phone,
    email: SITE.email,
    priceRange: "$$",
    currenciesAccepted: "EUR",
    paymentAccepted: "Überweisung",
    address: {
      "@type": "PostalAddress",
      streetAddress: SITE.streetAddress,
      postalCode: SITE.postalCode,
      addressLocality: SITE.addressLocality,
      addressRegion: "Niedersachsen",
      addressCountry: "DE",
    },
    areaServed: SEO_SERVICE_AREAS.map((area) => ({
      "@type": area === "Hannover" ? "City" : "Place",
      name: area,
    })),
    serviceType: SEO_SERVICES,
    openingHours: SITE.openingHours,
    contactPoint: {
      "@type": "ContactPoint",
      telephone: SITE.phone,
      email: SITE.email,
      contactType: "customer service",
      areaServed: "DE-NI",
      availableLanguage: ["de"],
    },
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Hausvia Leistungen",
      itemListElement: SEO_SERVICES.map((service) => ({
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: service,
          areaServed: SITE.areaServed,
        },
      })),
    },
    knowsAbout: SEO_SERVICES,
    sameAs: [],
  };
}

export function websiteSchema() {
  return {
    "@type": "WebSite",
    "@id": absoluteUrl("/#website"),
    url: SITE.url,
    name: SITE.name,
    alternateName: "Hausvia Hausmeisterservice",
    slogan: SITE.slogan,
    description: SITE.tagline,
    inLanguage: "de-DE",
    publisher: {
      "@id": absoluteUrl("/#localbusiness"),
    },
    about: SEO_SERVICES.map((service) => ({
      "@type": "Thing",
      name: service,
    })),
  };
}

export function webPageSchema({
  name,
  description,
  path,
  image = ASSETS.hero,
  type = "WebPage",
}: {
  name: string;
  description: string;
  path: string;
  image?: string;
  type?: "WebPage" | "AboutPage" | "ContactPage" | "CollectionPage" | "Article";
}) {
  const url = absoluteUrl(path);

  return {
    "@type": type,
    "@id": `${url}#webpage`,
    url,
    name,
    description,
    inLanguage: "de-DE",
    isPartOf: {
      "@id": absoluteUrl("/#website"),
    },
    publisher: {
      "@id": absoluteUrl("/#localbusiness"),
    },
    primaryImageOfPage: {
      "@type": "ImageObject",
      url: absoluteUrl(image),
      width: 1200,
      height: 630,
    },
    about: SEO_SERVICES.slice(0, 6).map((service) => ({
      "@type": "Thing",
      name: service,
    })),
  };
}

export function breadcrumbSchema(items: { name: string; href: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.href),
    })),
  };
}

export function faqSchema(faq: FaqItem[]) {
  return {
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function serviceSchema({
  name,
  description,
  path,
  serviceType,
  areaServed = SEO_SERVICE_AREAS,
}: {
  name: string;
  description: string;
  path: string;
  serviceType: string;
  areaServed?: readonly string[];
}) {
  const url = absoluteUrl(path);

  return {
    "@type": "Service",
    "@id": `${url}#service`,
    name,
    serviceType,
    description,
    url,
    inLanguage: "de-DE",
    areaServed: areaServed.map((area) => ({
      "@type": area === "Hannover" ? "City" : "Place",
      name: area,
    })),
    provider: {
      "@id": absoluteUrl("/#localbusiness"),
    },
    audience: [
      {
        "@type": "Audience",
        audienceType: "Hausverwaltungen",
      },
      {
        "@type": "Audience",
        audienceType: "WEG und Eigentümer",
      },
      {
        "@type": "Audience",
        audienceType: "Gewerbeobjekte",
      },
    ],
  };
}

export function articleSchema({
  title,
  description,
  path,
  image,
  publishedAt,
  updatedAt,
}: {
  title: string;
  description: string;
  path: string;
  image: string;
  publishedAt: string;
  updatedAt: string;
}) {
  const url = absoluteUrl(path);

  return {
    "@type": "Article",
    "@id": `${url}#article`,
    headline: title,
    description,
    image: {
      "@type": "ImageObject",
      url: absoluteUrl(image),
      width: 1400,
      height: 788,
    },
    datePublished: publishedAt,
    dateModified: updatedAt,
    inLanguage: "de-DE",
    author: {
      "@type": "Organization",
      name: SITE.name,
      url: SITE.url,
    },
    publisher: {
      "@id": absoluteUrl("/#localbusiness"),
    },
    mainEntityOfPage: {
      "@id": `${url}#webpage`,
    },
  };
}

export function itemListSchema({
  name,
  path,
  items,
}: {
  name: string;
  path: string;
  items: { name: string; href: string }[];
}) {
  return {
    "@type": "ItemList",
    "@id": `${absoluteUrl(path)}#itemlist`,
    name,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: absoluteUrl(item.href),
    })),
  };
}
