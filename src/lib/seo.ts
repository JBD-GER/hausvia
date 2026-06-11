import type { Metadata } from "next";
import { ASSETS, SITE, type FaqItem } from "@/lib/site";

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
}: {
  title: string;
  description: string;
  path: string;
  image?: string;
}): Metadata {
  const url = absoluteUrl(path);
  const imageUrl = absoluteUrl(image);

  return {
    title,
    description,
    alternates: {
      canonical: url,
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
      title,
      description,
      url,
      siteName: SITE.name,
      locale: "de_DE",
      type: "website",
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: `${SITE.name} Hausmeisterservice in Hannover`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
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
    url: SITE.url,
    logo: absoluteUrl(ASSETS.logo),
    image: absoluteUrl(ASSETS.hero),
    description: SITE.tagline,
    telephone: SITE.phone,
    email: SITE.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: SITE.streetAddress,
      postalCode: SITE.postalCode,
      addressLocality: SITE.addressLocality,
      addressRegion: "Niedersachsen",
      addressCountry: "DE",
    },
    areaServed: [
      {
        "@type": "City",
        name: "Hannover",
      },
      {
        "@type": "AdministrativeArea",
        name: "Region Hannover",
      },
    ],
    serviceType: ["Hausmeisterservice", "Objektbetreuung", "Gebäudeservice"],
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        description: SITE.openingHours,
      },
    ],
    sameAs: [],
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
}: {
  name: string;
  description: string;
  path: string;
  serviceType: string;
}) {
  return {
    "@type": "Service",
    name,
    serviceType,
    description,
    url: absoluteUrl(path),
    areaServed: {
      "@type": "AdministrativeArea",
      name: SITE.areaServed,
    },
    provider: {
      "@id": absoluteUrl("/#localbusiness"),
    },
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
  return {
    "@type": "Article",
    headline: title,
    description,
    image: absoluteUrl(image),
    datePublished: publishedAt,
    dateModified: updatedAt,
    author: {
      "@type": "Organization",
      name: SITE.name,
    },
    publisher: {
      "@id": absoluteUrl("/#localbusiness"),
    },
    mainEntityOfPage: absoluteUrl(path),
  };
}
