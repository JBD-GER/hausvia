import type { BlogPost, LinkItem } from "@/lib/site";
import type { ServiceId } from "@/lib/pricing";

const conversionPaths = new Set(["/angebot-anfragen", "/kosten-einschaetzen"]);

type CurateInternalLinksOptions = {
  currentHref?: string;
  excludeConversionLinks?: boolean;
  maxLinks?: number;
};

function pathnameFromHref(href: string) {
  return href.split(/[?#]/, 1)[0] || "/";
}

export function curateInternalLinks(
  links: readonly LinkItem[],
  {
    currentHref,
    excludeConversionLinks = true,
    maxLinks = 3,
  }: CurateInternalLinksOptions = {},
) {
  const currentPath = currentHref ? pathnameFromHref(currentHref) : undefined;
  const seenPaths = new Set<string>();
  const curated: LinkItem[] = [];
  const safeMaximum = Math.max(0, Math.floor(maxLinks));

  if (safeMaximum === 0) return curated;

  for (const link of links) {
    const href = link.href.trim();
    const label = link.label.trim();

    if (!label || !href.startsWith("/") || href.startsWith("//")) continue;

    const path = pathnameFromHref(href);

    if (path === currentPath || seenPaths.has(path)) continue;
    if (excludeConversionLinks && conversionPaths.has(path)) continue;

    seenPaths.add(path);
    curated.push({ ...link, href, label });

    if (curated.length >= safeMaximum) break;
  }

  return curated;
}

export const marketingResourceLinks: Readonly<Record<string, LinkItem>> = {
  "hausmeisterservice-hannover": {
    label: "Leistungscheckliste für Hausmeisterservice",
    href: "/ratgeber/hausmeisterservice-hannover-leistungen-checkliste",
  },
  "objektbetreuung-hannover": {
    label: "Checkliste für die Objektkontrolle",
    href: "/ratgeber/objektkontrolle-mehrfamilienhaus-hannover-checkliste",
  },
  "gebaeudeservice-hannover": {
    label: "Gebäudereinigung und Hausmeisterservice kombinieren",
    href: "/ratgeber/gebaeudereinigung-hausmeisterservice-kombinieren-hannover",
  },
  "treppenhausreinigung-hannover": {
    label: "Reinigungsplan für Treppenhäuser",
    href: "/ratgeber/reinigungsplan-treppenhaus-wohnanlage-hannover",
  },
  "gartenpflege-hannover": {
    label: "Gartenpflege für Wohnanlagen planen",
    href: "/ratgeber/gartenpflege-wohnanlage-hannover-saison-planung",
  },
  "winterdienst-hannover": {
    label: "Winterdienst am Mehrfamilienhaus planen",
    href: "/ratgeber/winterdienst-mehrfamilienhaus-hannover-planung",
  },
  "kleinreparaturen-hannover": {
    label: "Kleinreparaturen im Mehrfamilienhaus",
    href: "/ratgeber/kleinreparaturen-mehrfamilienhaus-hannover",
  },
  "muelltonnenservice-hannover": {
    label: "Ordnung am Müllplatz organisieren",
    href: "/ratgeber/muellplatz-ordnung-mehrfamilienhaus-hannover",
  },
  "kontrollgaenge-hannover": {
    label: "Kontrollgänge nachvollziehbar dokumentieren",
    href: "/ratgeber/kontrollgaenge-dokumentation-objektbetreuung-hannover",
  },
  hausverwaltungen: {
    label: "Hausmeisterservice für Hausverwaltungen auswählen",
    href: "/ratgeber/hausmeisterservice-hausverwaltung-anbieter-auswaehlen-hannover",
  },
  "weg-betreuung": {
    label: "Hausmeisterservice-Kosten für WEGs einordnen",
    href: "/ratgeber/hausmeisterservice-weg-kosten-umlagefaehigkeit-hannover",
  },
  gewerbeobjekte: {
    label: "Hausmeisterservice für Gewerbeobjekte planen",
    href: "/ratgeber/gewerbeobjekte-hausmeisterservice-hannover",
  },
};

export const hausmeisterserviceHubLink: LinkItem = {
  label: "Hausmeisterservice in Hannover",
  href: "/hausmeisterservice-hannover",
};

export const blogCategoryPillarLinks: Readonly<Record<string, LinkItem>> = {
  hausmeisterservice: hausmeisterserviceHubLink,
  objektbetreuung: {
    label: "Objektbetreuung in Hannover",
    href: "/objektbetreuung-hannover",
  },
  "saisonale-services": {
    label: "Winterdienst in Hannover",
    href: "/winterdienst-hannover",
  },
  "reinigung-ordnung": {
    label: "Treppenhausreinigung in Hannover",
    href: "/treppenhausreinigung-hannover",
  },
  "hausverwaltungen-weg": {
    label: "Hausmeisterservice für Hausverwaltungen",
    href: "/hausverwaltungen",
  },
  aussenanlagen: {
    label: "Gartenpflege in Hannover",
    href: "/gartenpflege-hannover",
  },
};

export const serviceResourceLinks: Readonly<Record<ServiceId, LinkItem>> = {
  caretaker: marketingResourceLinks["hausmeisterservice-hannover"],
  interiorCleaning: marketingResourceLinks["treppenhausreinigung-hannover"],
  outdoorCleaning: {
    label: "Außenanlagenpflege für Wohnanlagen",
    href: "/ratgeber/aussenanlagenpflege-wohnanlage-hannover",
  },
  binService: marketingResourceLinks["muelltonnenservice-hannover"],
  gardenCare: marketingResourceLinks["gartenpflege-hannover"],
  lawnMowing: marketingResourceLinks["gartenpflege-hannover"],
  hedgeCutting: marketingResourceLinks["gartenpflege-hannover"],
  leafRemoval: {
    label: "Außenanlagen saisonal pflegen",
    href: "/ratgeber/aussenanlagenpflege-wohnanlage-hannover",
  },
  winterService: marketingResourceLinks["winterdienst-hannover"],
  technicalChecks: marketingResourceLinks["kontrollgaenge-hannover"],
  lightingChecks: marketingResourceLinks["kontrollgaenge-hannover"],
  technicalRooms: {
    label: "Checkliste für die Objektkontrolle",
    href: "/ratgeber/objektkontrolle-mehrfamilienhaus-hannover-checkliste",
  },
  contractorAccess: {
    label: "Dienstleisterzugänge sicher organisieren",
    href: "/ratgeber/dienstleisterzugang-hausmeisterservice-hannover",
  },
  meterReading: marketingResourceLinks["kontrollgaenge-hannover"],
  minorMaintenance: marketingResourceLinks["kleinreparaturen-hannover"],
};

export const regionalResourceLink: LinkItem = {
  label: "Hausmeisterservice nach Stadtteil und Objektbedarf",
  href: "/ratgeber/hausmeisterservice-hannover-stadtteile-objektbedarf",
};

export const staticPageInternalLinks = {
  about: [
    { label: "Objektbetreuung für Hausverwaltungen", href: "/hausverwaltungen" },
    { label: "Kontrollgänge in Hannover", href: "/kontrollgaenge-hannover" },
    { label: "Einsatzgebiete in Hannover und Umgebung", href: "/einsatzgebiete" },
  ],
  contact: [
    { label: "Hausmeisterservice in Hannover", href: "/hausmeisterservice-hannover" },
    { label: "Objektbetreuung in Hannover", href: "/objektbetreuung-hannover" },
    { label: "Einsatzgebiete in Hannover und Umgebung", href: "/einsatzgebiete" },
  ],
  offerRequest: [
    { label: "Leistungen im Hausmeisterservice", href: "/hausmeisterservice-hannover" },
    { label: "Objektbetreuung für WEGs", href: "/weg-betreuung" },
    { label: "Einsatzgebiete in Hannover und Umgebung", href: "/einsatzgebiete" },
  ],
  costEstimate: [
    { label: "Hausmeisterservice-Leistungen", href: "/hausmeisterservice-hannover" },
    { label: "Objektbetreuung in Hannover", href: "/objektbetreuung-hannover" },
    { label: "Gebäudeservice in Hannover", href: "/gebaeudeservice-hannover" },
  ],
} as const satisfies Record<string, readonly LinkItem[]>;

const relatedPostOverrides: Readonly<Record<string, string>> = {
  "winterdienst-mehrfamilienhaus-hannover-planung":
    "gartenpflege-wohnanlage-hannover-saison-planung",
  "aussenanlagenpflege-wohnanlage-hannover":
    "winterdienst-mehrfamilienhaus-hannover-planung",
};

export function relatedBlogPostLink(post: BlogPost, posts: readonly BlogPost[]) {
  const overrideSlug = relatedPostOverrides[post.slug];
  const overridePost = overrideSlug
    ? posts.find((candidate) => candidate.slug === overrideSlug)
    : undefined;

  if (overridePost) {
    return {
      label: overridePost.h1,
      href: `/ratgeber/${overridePost.slug}`,
    } satisfies LinkItem;
  }

  const relatedPosts = posts.filter(
    (candidate) => candidate.category === post.category && candidate.slug !== post.slug,
  );

  if (relatedPosts.length === 0) return null;

  const currentIndex = posts.findIndex((candidate) => candidate.slug === post.slug);
  const nextPost = relatedPosts.find(
    (candidate) => posts.findIndex((item) => item.slug === candidate.slug) > currentIndex,
  ) ?? relatedPosts[0];

  return {
    label: nextPost.h1,
    href: `/ratgeber/${nextPost.slug}`,
  } satisfies LinkItem;
}
