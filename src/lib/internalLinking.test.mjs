import assert from "node:assert/strict";
import test from "node:test";
import {
  blogCategoryPillarLinks,
  curateInternalLinks,
  hausmeisterserviceHubLink,
  marketingResourceLinks,
  regionalResourceLink,
  relatedBlogPostLink,
  serviceResourceLinks,
  staticPageInternalLinks,
} from "./internalLinking.ts";
import {
  allSeoPaths,
  blogCategories,
  blogPosts,
  locationPages,
  marketingPages,
} from "./site.ts";

const knownSeoPaths = new Set(allSeoPaths);
const genericAnchorTexts = new Set([
  "mehr erfahren",
  "details ansehen",
  "beitrag lesen",
  "anfrage starten",
  "service konfigurieren",
]);

function assertContextualLinkSet(links, source) {
  for (const link of links) {
    assert.ok(!genericAnchorTexts.has(link.label.toLowerCase()), `${source}: ${link.label}`);
    assert.ok(link.label.trim().length >= 12, `${source}: ${link.label}`);
  }
}

test("curateInternalLinks enforces a small, crawlable and unique link set", () => {
  const links = curateInternalLinks(
    [
      { label: " Aktuelle Seite ", href: "/aktuell" },
      { label: "Hausmeisterservice", href: "/hausmeisterservice-hannover?quelle=test" },
      { label: "Doppelter Pfad", href: "/hausmeisterservice-hannover#details" },
      { label: "Anfrage", href: "/angebot-anfragen" },
      { label: "Extern", href: "https://example.com" },
      { label: "Objektbetreuung", href: "/objektbetreuung-hannover" },
      { label: "Gartenpflege", href: "/gartenpflege-hannover" },
      { label: "Winterdienst", href: "/winterdienst-hannover" },
    ],
    { currentHref: "/aktuell", maxLinks: 3 },
  );

  assert.deepEqual(
    links.map((link) => link.href),
    [
      "/hausmeisterservice-hannover?quelle=test",
      "/objektbetreuung-hannover",
      "/gartenpflege-hannover",
    ],
  );
  assert.deepEqual(curateInternalLinks([{ label: "Test", href: "/test" }], { maxLinks: 0 }), []);
});

test("all curated resource links point to known public SEO pages", () => {
  const links = [
    hausmeisterserviceHubLink,
    regionalResourceLink,
    ...Object.values(marketingResourceLinks),
    ...Object.values(serviceResourceLinks),
    ...Object.values(blogCategoryPillarLinks),
    ...Object.values(staticPageInternalLinks).flat(),
  ];

  for (const link of links) {
    assert.ok(link.href.startsWith("/"), `${link.href} must be an internal href`);
    assert.ok(knownSeoPaths.has(link.href), `${link.href} must be a known SEO page`);
    assert.ok(link.label.trim().length >= 12, `${link.href} needs a descriptive anchor text`);
  }
});

test("every marketing page and blog category has a matching content pillar", () => {
  assert.deepEqual(
    Object.keys(marketingResourceLinks).toSorted(),
    marketingPages.map((page) => page.slug).toSorted(),
  );
  assert.deepEqual(
    Object.keys(blogCategoryPillarLinks).toSorted(),
    blogCategories.map((category) => category.slug).toSorted(),
  );
});

test("marketing, location and blog templates stay within three contextual links", () => {
  for (const page of marketingPages) {
    const links = curateInternalLinks(
      [
        marketingResourceLinks[page.slug],
        ...(page.slug === "hausmeisterservice-hannover" ? [] : [hausmeisterserviceHubLink]),
        ...page.internalLinks,
      ],
      { currentHref: `/${page.slug}` },
    );

    assert.ok(links.length >= 2 && links.length <= 3, page.slug);
    assertContextualLinkSet(links, page.slug);
  }

  for (const page of locationPages) {
    const links = curateInternalLinks(
      [regionalResourceLink, hausmeisterserviceHubLink, ...page.internalLinks],
      { currentHref: `/einsatzgebiete/${page.slug}` },
    );

    assert.equal(links.length, 3, page.slug);
    assertContextualLinkSet(links, page.slug);
  }

  for (const post of blogPosts) {
    const relatedPost = relatedBlogPostLink(post, blogPosts);
    const links = curateInternalLinks(
      [
        ...(relatedPost ? [relatedPost] : []),
        blogCategoryPillarLinks[post.category],
        ...post.internalLinks,
      ],
      { currentHref: `/ratgeber/${post.slug}` },
    );

    assert.equal(links.length, 3, post.slug);
    assertContextualLinkSet(links, post.slug);
  }
});

test("every guide receives a contextual link from another guide in its cluster", () => {
  const inboundCounts = new Map(blogPosts.map((post) => [post.slug, 0]));

  for (const post of blogPosts) {
    const relatedLink = relatedBlogPostLink(post, blogPosts);
    assert.ok(relatedLink, `${post.slug} needs a related guide`);

    const targetSlug = relatedLink.href.replace("/ratgeber/", "");
    inboundCounts.set(targetSlug, (inboundCounts.get(targetSlug) ?? 0) + 1);
  }

  for (const [slug, count] of inboundCounts) {
    assert.ok(count >= 1, `${slug} needs an inbound guide link`);
  }
});
