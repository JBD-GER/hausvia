import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingPageView } from "@/components/MarketingPageView";
import { SEOJsonLd } from "@/components/SEOJsonLd";
import { findMarketingPage, marketingPages } from "@/lib/site";
import { breadcrumbSchema, faqSchema, graph, metadataForPage, serviceSchema, webPageSchema } from "@/lib/seo";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return marketingPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = findMarketingPage(slug);

  if (!page) {
    return {};
  }

  return metadataForPage({
    title: page.title,
    description: page.description,
    path: `/${page.slug}`,
    image: page.image,
    imageAlt: page.imageAlt,
    keywords: [page.eyebrow, page.serviceType ?? page.eyebrow],
    ogTitle: page.ogTitle,
    ogDescription: page.ogDescription,
  });
}

export default async function MarketingPage({ params }: PageProps) {
  const { slug } = await params;
  const page = findMarketingPage(slug);

  if (!page) {
    notFound();
  }

  return (
    <>
      <MarketingPageView page={page} />
      <SEOJsonLd
        data={graph([
          webPageSchema({
            name: page.h1,
            description: page.description,
            path: `/${page.slug}`,
            image: page.image,
          }),
          breadcrumbSchema([
            { name: "Startseite", href: "/" },
            { name: page.eyebrow, href: `/${page.slug}` },
          ]),
          faqSchema(page.faq),
          serviceSchema({
            name: page.h1,
            description: page.description,
            path: `/${page.slug}`,
            serviceType: page.serviceType ?? page.eyebrow,
          }),
        ])}
      />
    </>
  );
}
