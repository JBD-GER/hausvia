import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarRange,
  Check,
  CheckCircle2,
  ClipboardCheck,
  CloudSnow,
  Euro,
  FileCheck2,
  MapPin,
  Route,
  ShieldCheck,
  Snowflake,
} from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FAQAccordion } from "@/components/FAQAccordion";
import { SEOJsonLd } from "@/components/SEOJsonLd";
import { SectionHeading } from "@/components/SectionHeading";
import { WinterdienstCalculator } from "@/components/WinterdienstCalculator";
import { ASSETS, type FaqItem } from "@/lib/site";
import {
  breadcrumbSchema,
  faqSchema,
  graph,
  metadataForPage,
  serviceSchema,
  webPageSchema,
} from "@/lib/seo";

const pagePath = "/winterdienst-hannover";
const winterServiceImage = "/images/hausvia-winterdienst-hannover-schneeraeumung.jpg";

const heroSnowflakes = [
  { id: "snow-1", left: "4%", delay: "-2s", duration: "13s", size: "h-3 w-3" },
  { id: "snow-2", left: "12%", delay: "-8s", duration: "17s", size: "h-5 w-5" },
  { id: "snow-3", left: "21%", delay: "-4s", duration: "15s", size: "h-4 w-4" },
  { id: "snow-4", left: "31%", delay: "-12s", duration: "19s", size: "h-3 w-3" },
  { id: "snow-5", left: "42%", delay: "-6s", duration: "16s", size: "h-5 w-5" },
  { id: "snow-6", left: "53%", delay: "-14s", duration: "20s", size: "h-3 w-3" },
  { id: "snow-7", left: "64%", delay: "-3s", duration: "14s", size: "h-4 w-4" },
  { id: "snow-8", left: "73%", delay: "-10s", duration: "18s", size: "h-5 w-5" },
  { id: "snow-9", left: "82%", delay: "-5s", duration: "15s", size: "h-3 w-3" },
  { id: "snow-10", left: "91%", delay: "-13s", duration: "19s", size: "h-4 w-4" },
  { id: "snow-11", left: "26%", delay: "-16s", duration: "22s", size: "hidden h-6 w-6 sm:block" },
  { id: "snow-12", left: "78%", delay: "-18s", duration: "23s", size: "hidden h-6 w-6 sm:block" },
  { id: "snow-13", left: "7%", delay: "-11s", duration: "21s", size: "h-4 w-4" },
  { id: "snow-14", left: "17%", delay: "-15s", duration: "18s", size: "h-3 w-3" },
  { id: "snow-15", left: "24%", delay: "-7s", duration: "20s", size: "h-5 w-5" },
  { id: "snow-16", left: "36%", delay: "-19s", duration: "24s", size: "hidden h-4 w-4 sm:block" },
  { id: "snow-17", left: "47%", delay: "-9s", duration: "22s", size: "h-3 w-3" },
  { id: "snow-18", left: "58%", delay: "-21s", duration: "25s", size: "hidden h-6 w-6 sm:block" },
  { id: "snow-19", left: "68%", delay: "-17s", duration: "21s", size: "h-4 w-4" },
  { id: "snow-20", left: "76%", delay: "-1s", duration: "17s", size: "h-3 w-3" },
  { id: "snow-21", left: "87%", delay: "-16s", duration: "22s", size: "h-5 w-5" },
  { id: "snow-22", left: "96%", delay: "-9s", duration: "19s", size: "hidden h-4 w-4 sm:block" },
  { id: "snow-23", left: "14%", delay: "-23s", duration: "27s", size: "hidden h-6 w-6 sm:block" },
  { id: "snow-24", left: "39%", delay: "-13s", duration: "23s", size: "h-4 w-4" },
  { id: "snow-25", left: "61%", delay: "-25s", duration: "28s", size: "hidden h-5 w-5 sm:block" },
  { id: "snow-26", left: "89%", delay: "-4s", duration: "20s", size: "h-3 w-3" },
] as const;

const faqs: FaqItem[] = [
  {
    question: "Wie lange läuft der Winterdienstvertrag?",
    answer:
      "Der Saisonvertrag läuft ausschließlich vom 1. November bis zum 31. März. Welche Flächen und Leistungen während dieser Zeit betreut werden, halten wir vor Vertragsbeginn objektbezogen fest.",
  },
  {
    question: "Was ist im monatlichen Grundbetrag enthalten?",
    answer:
      "Der Grundbetrag startet bei 70 Euro inklusive Mehrwertsteuer pro Monat für bis zu 100 m² Winterdienstfläche. Für größere Flächen steigt er anteilig um 10 Euro je weitere 100 m² und wird auf 5 Euro gerundet. Er reserviert die passende Einsatzkapazität und wird ausschließlich von November bis März berechnet.",
  },
  {
    question: "Wann wird ein tatsächlicher Einsatz berechnet?",
    answer:
      "Ein Einsatz wird berechnet, wenn Hausvia am Objekt tatsächlich einen vereinbarten Winterdienstdurchgang ausführt. Statt jeden Quadratmeter mit demselben Satz hochzurechnen, kombiniert der Rechner einen Einsatzstart für Tour, Anfahrt und Disposition mit einer degressiven Flächenstaffel inklusive Standard-Streugut. Dadurch werden größere zusammenhängende Flächen je zusätzlichem Quadratmeter günstiger.",
  },
  {
    question: "Welche Abrechnungsmodelle kann ich wählen?",
    answer:
      "Bei der variablen Abrechnung zahlen Sie den flächenabhängigen Grundbetrag und zusätzlich nur tatsächlich ausgeführte Einsätze. Das Pauschalpaket verteilt Grundbetrag und zehn Einsätze auf fünf Vertragsmonate. Jeder dieser zehn Einsätze ist gegenüber Variabel um 10 Prozent reduziert – und derselbe Rabatt gilt auch für jeden weiteren Einsatz. Beide Varianten erscheinen online und im PDF.",
  },
  {
    question: "Welche Einsatzbereitschaft kann ich auswählen?",
    answer:
      "Standard umfasst die Hausvia-Einsatzplanung montags bis samstags von 7:00 bis 20:00 Uhr sowie sonn- und feiertags von 8:00 bis 20:00 Uhr. Für Gewerbeobjekte ist ein 24/7-Service mit 20 Prozent Aufschlag auf Grundgebühr und Einsätze kalkulierbar. Wichtig: Für öffentliche Gehwege reicht die örtliche Räum- und Streupflicht in Hannover grundsätzlich bis 22:00 Uhr; die Absicherung nach 20:00 Uhr wird beim Standardmodell im finalen Angebot separat festgelegt.",
  },
  {
    question: "Zählt ein weiterer Durchgang am selben Tag als neuer Einsatz?",
    answer:
      "Wenn erneuter Schneefall oder neue Glätte einen weiteren Räum- und/oder Streudurchgang erforderlich macht und dieser tatsächlich ausgeführt wird, gilt er als weiterer Einsatz. Die genaue Einsatzlogik wird im Angebot transparent festgelegt.",
  },
  {
    question: "Ist der Preis aus dem Rechner verbindlich?",
    answer:
      "Nein. Die Preiseinschätzung stellt kein Angebot dar. Vor einem finalen Angebot prüft Hausvia die Adresse, die angegebenen Flächen, die Zugänglichkeit und die verfügbare Tourenkapazität. Falls erforderlich, vereinbaren wir zuvor einen Vor-Ort-Termin.",
  },
  {
    question: "Welche Flächen kann Hausvia betreuen?",
    answer:
      "Je nach Objekt können Gehwege, Hauseingänge, Zuwege, Treppen, Rampen, Mülltonnenwege sowie vereinbarte Zufahrten oder Parkflächen einbezogen werden. Maßgeblich ist immer die Flächenliste im konkreten Angebot.",
  },
  {
    question: "Womit wird in Hannover gestreut?",
    answer:
      "Auf Gehwegen werden grundsätzlich abstumpfende Mittel wie Sand oder Splitt eingesetzt. Auftauende Mittel sind in Hannover nur eingeschränkt zulässig. Welches Streumittel für die vereinbarte Fläche verwendet wird, richtet sich nach den örtlichen Vorgaben und der konkreten Situation.",
  },
  {
    question: "Übernimmt Hausvia automatisch alle rechtlichen Pflichten des Eigentümers?",
    answer:
      "Hausvia führt die vertraglich vereinbarten Leistungen auf den festgelegten Flächen aus. Welche rechtlichen Pflichten im Einzelfall bestehen und wie sie wirksam organisiert werden, sollten Eigentümer oder Verwaltung objektbezogen prüfen. Die Informationen auf dieser Seite sind keine Rechtsberatung.",
  },
];

const trustItems = [
  { icon: CalendarRange, text: "Saisonvertrag November bis März" },
  { icon: Euro, text: "Grundbetrag ab 70 € pro Monat" },
  { icon: ClipboardCheck, text: "10 % Einsatzvorteil im Pauschalpaket" },
  { icon: MapPin, text: "Für Objekte im Tourengebiet Hannover" },
];

const services = [
  {
    title: "Gehwege und Zuwege",
    text: "Vereinbarte Wege rund um das Objekt werden im abgestimmten Umfang geräumt und gestreut.",
  },
  {
    title: "Hauseingänge",
    text: "Regelmäßig genutzte Zugänge lassen sich als priorisierte Flächen eindeutig im Angebot festhalten.",
  },
  {
    title: "Treppen und Rampen",
    text: "Flächen mit Gefälle oder Stufen werden bei der Planung und Preiseinschätzung gesondert berücksichtigt.",
  },
  {
    title: "Mülltonnenwege",
    text: "Zuwege zu Abfallbehältern können aufgenommen werden, damit vereinbarte Bereiche erreichbar bleiben.",
  },
  {
    title: "Zufahrten und Parkflächen",
    text: "Ausreichend zugängliche Flächen können je nach Größe und Bearbeitungsart individuell eingeplant werden.",
  },
  {
    title: "Räumen und Streuen",
    text: "Ein Einsatz umfasst eine wetterbedingte Anfahrt und einen vereinbarten Winterdienstdurchgang. Ausführung und kalkuliertes Streugut werden im Angebot festgehalten.",
  },
];

const planningSteps = [
  {
    title: "Fläche digital erfassen",
    text: "Adresse suchen und alle zu räumenden Teilflächen direkt auf der Karte markieren.",
  },
  {
    title: "Preis und PDF erhalten",
    text: "Kontaktdaten eintragen, Preis direkt öffnen und die Einschätzung per E-Mail bekommen.",
  },
  {
    title: "Objekt und Route prüfen",
    text: "Hausvia prüft Adresse, Flächen, Besonderheiten und verfügbare Kapazität im Tourengebiet.",
  },
  {
    title: "Saison verbindlich planen",
    text: "Flächen, Einsatzlogik und Preise werden für den Zeitraum 1. November bis 31. März festgehalten.",
  },
];

export const metadata: Metadata = metadataForPage({
  title: "Winterdienst Hannover | Preis direkt berechnen | Hausvia",
  description:
    "Winterdienst in Hannover für Wohn- und Gewerbeobjekte: variable Abrechnung oder 10er-Saisonpaket, degressive Flächenpreise und direkte Preiseinschätzung.",
  path: pagePath,
  image: ASSETS.blogWinter,
  imageAlt: "Winterdienst an einem Mehrfamilienhaus mit Schneeschieber und Streuwagen",
  keywords: [
    "Winterdienst Hannover",
    "Winterdienst Kosten Hannover",
    "Schneeräumdienst Hannover",
    "Winterdienst Mehrfamilienhaus Hannover",
  ],
  ogTitle: "Winterdienst Hannover: Grundbetrag plus tatsächliche Einsätze",
  ogDescription:
    "Fläche digital markieren, Variabel und Pauschal vergleichen und die Preiseinschätzung inklusive PDF erhalten.",
});

export default function WinterdienstHannoverPage() {
  return (
    <main className="overflow-hidden bg-white">
      <Breadcrumbs
        items={[
          { label: "Startseite", href: "/" },
          { label: "Winterdienst Hannover", href: pagePath },
        ]}
      />

      <section className="relative isolate overflow-hidden bg-brand-dark text-white">
        <div
          className="absolute inset-0 -z-10 opacity-40"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(circle at 10% 20%, rgba(255,255,255,0.12), transparent 30%), radial-gradient(circle at 92% 82%, rgba(245,197,66,0.12), transparent 34%)",
          }}
        />
        <div className="absolute -left-16 top-24 -z-10 h-64 w-64 rounded-full border border-white/10" aria-hidden="true" />
        <div className="absolute -right-24 -top-28 -z-10 h-96 w-96 rounded-full border border-white/10" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
          {heroSnowflakes.map((flake) => (
            <span
              key={flake.id}
              className="animate-hausvia-snowfall absolute -top-10 text-white/70"
              style={{
                left: flake.left,
                animationDelay: flake.delay,
                animationDuration: flake.duration,
              }}
            >
              <Snowflake className={flake.size} />
            </span>
          ))}
        </div>

        <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 sm:py-18 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-20">
          <div>
            <h1 className="max-w-3xl text-[2.55rem] font-extrabold leading-[1.04] tracking-tight sm:text-5xl lg:text-6xl">
              Winterdienst Hannover
            </h1>
            <div className="winter-ice-slogan mt-5" aria-label="Aus Hannover für Hannover">
              <span className="relative z-10 flex items-center gap-2">
                <MapPin aria-hidden="true" className="h-4 w-4" />
                Aus Hannover für Hannover
              </span>
            </div>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-200 sm:text-xl">
              Variabel nur tatsächliche Einsätze zahlen oder zehn Einsätze pauschal mit 10 % Preisvorteil sichern. Die degressive Flächenkalkulation macht große Flächen automatisch günstiger.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="#winterdienst-preis"
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-base font-extrabold text-brand-dark shadow-lg shadow-black/20 transition hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-brand-dark"
              >
                Preis berechnen
                <Euro aria-hidden="true" className="h-5 w-5" />
              </Link>
              <Link
                href="/angebot-anfragen?leistung=winterdienst"
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-6 py-3.5 text-base font-extrabold text-white backdrop-blur transition hover:border-white/60 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-brand-dark"
              >
                Winterdienst anfragen
                <ArrowRight aria-hidden="true" className="h-5 w-5" />
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-bold text-blue-100">
              <span className="flex items-center gap-2">
                <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-accent" />
                Preiseinschätzung inklusive PDF
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-accent" />
                Alle Rechnerpreise inklusive MwSt.
              </span>
            </div>
          </div>

          <div className="relative">
            <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-slate-900 shadow-2xl shadow-black/30">
              <Image
                src={ASSETS.blogWinter}
                alt="Mitarbeiter beim Winterdienst vor einem Mehrfamilienhaus"
                width={1672}
                height={941}
                priority
                sizes="(min-width: 1024px) 48vw, 100vw"
                className="aspect-[16/11] w-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent px-5 pb-5 pt-20 sm:px-6 sm:pb-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur-md">
                    <p className="text-xs font-bold uppercase tracking-wide text-blue-100">Feste Saison</p>
                    <p className="mt-1 text-lg font-extrabold">01.11.–31.03.</p>
                  </div>
                  <div className="rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur-md">
                    <p className="text-xs font-bold uppercase tracking-wide text-blue-100">Erfahrung</p>
                    <p className="mt-1 text-lg font-extrabold">500+ Einsätze</p>
                  </div>
                </div>
              </div>
            </div>
            <span className="absolute -right-4 -top-4 grid h-14 w-14 place-items-center rounded-2xl bg-white text-brand shadow-xl sm:-right-6 sm:-top-6 sm:h-16 sm:w-16">
              <Snowflake aria-hidden="true" className="h-7 w-7 sm:h-8 sm:w-8" />
            </span>
          </div>
        </div>
      </section>

      <section className="border-b border-brand/10 bg-brand-soft/60">
        <div className="mx-auto grid max-w-7xl gap-3 px-4 py-5 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
          {trustItems.map((item) => {
            const Icon = item.icon;

            return (
              <div key={item.text} className="flex items-center gap-3 rounded-xl border border-brand/15 bg-white px-4 py-3.5 shadow-sm">
                <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-brand-soft text-brand">
                  <Icon aria-hidden="true" className="h-4.5 w-4.5" />
                </span>
                <p className="text-sm font-extrabold leading-5 text-slate-800">{item.text}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-gradient-to-b from-white to-slate-50 px-4 py-14 sm:px-6 sm:py-18 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 max-w-3xl">
            <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-brand">Direkte Preiseinschätzung</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
              Was kostet Winterdienst für Ihr Objekt?
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-700 sm:text-lg">
              In fünf kurzen Schritten markieren Sie die Flächen und wählen Objektart, Zugänglichkeit sowie Einsatzzeiten. Danach vergleichen Sie variable Abrechnung und 10er-Saisonpaket direkt online; beide Varianten erhalten Sie zusätzlich als PDF per E-Mail.
            </p>
          </div>
          <WinterdienstCalculator googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ""} />
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <SectionHeading
            eyebrow="Transparente Kosten"
            title="Ein fairer Preis mit echtem Mengenvorteil"
            text="Die Grundgebühr reserviert Kapazität für Ihr Objekt. Der Einsatzpreis wird in günstiger werdenden Flächenblöcken berechnet – und im Pauschalpaket sind alle Einsätze nochmals 10 % reduziert."
          />

          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            <article className="relative overflow-hidden rounded-2xl border border-brand/15 bg-brand-soft p-6 sm:p-8">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand text-white">
                <CalendarRange aria-hidden="true" className="h-6 w-6" />
              </span>
              <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.16em] text-brand">01. November bis 31. März</p>
              <h3 className="mt-2 text-2xl font-extrabold text-slate-950">Der monatliche Grundbetrag</h3>
              <p className="mt-4 text-base leading-7 text-slate-700">
                Er startet bei 70 € inklusive Mehrwertsteuer für bis zu 100 m². Oberhalb davon steigt er anteilig um 10 € je weitere 100 m² und wird auf 5 € gerundet. So wächst die reservierte Einsatzkapazität nachvollziehbar mit Ihrer Fläche; berechnet wird sie nur von November bis März.
              </p>
            </article>

            <article className="relative overflow-hidden rounded-2xl border border-brand bg-brand p-6 text-white shadow-xl shadow-brand/15 sm:p-8">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/15 text-white">
                <CloudSnow aria-hidden="true" className="h-6 w-6" />
              </span>
              <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.16em] text-blue-100">Wetterabhängig und nachvollziehbar</p>
              <h3 className="mt-2 text-2xl font-extrabold">Der Preis je tatsächlichem Einsatz</h3>
              <p className="mt-4 text-base leading-7 text-blue-50">
                Der Einsatzstart deckt Tour, Anfahrt und Disposition. Die Fläche inklusive Standard-Streugut wird degressiv gestaffelt: Mit wachsender Fläche sinkt der Preis für jeden zusätzlichen Flächenblock. Im Pauschalpaket kostet jeder enthaltene und zusätzliche Einsatz nochmals 10 % weniger.
              </p>
            </article>
          </div>

          <div className="mt-6 flex flex-col gap-5 rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <p className="text-sm font-extrabold text-slate-950">Erst rechnen, dann entscheiden.</p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Der Rechner zeigt Grundgebühr, Einsatzstart, degressive Flächenleistung, Einsatzzeiten und den konkreten Pauschalrabatt getrennt an.
              </p>
            </div>
            <Link
              href="#winterdienst-preis"
              className="inline-flex min-h-12 flex-none items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-extrabold text-white transition hover:bg-brand-dark"
            >
              Preis berechnen <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <SectionHeading
            eyebrow="Leistungsumfang"
            title="Diese Flächen betreuen wir nach Vereinbarung"
            text="Winterdienst wird nicht pauschal über das gesamte Grundstück versprochen. Im Angebot halten wir konkret fest, welche Flächen in welcher Form berücksichtigt werden."
          />

          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <article key={service.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-950/5">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand">
                  <Check aria-hidden="true" className="h-5 w-5" />
                </span>
                <h3 className="mt-5 text-lg font-extrabold text-slate-950">{service.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-650">{service.text}</p>
              </article>
            ))}
          </div>

          <div className="mt-8 grid overflow-hidden rounded-2xl border border-slate-200 bg-white lg:grid-cols-[0.9fr_1.1fr]">
            <div className="relative min-h-72 lg:min-h-full">
              <Image
                src={winterServiceImage}
                alt="Mitarbeiter bei der Schneeräumung vor einem Wohnobjekt"
                fill
                sizes="(min-width: 1024px) 42vw, 100vw"
                className="object-cover"
              />
            </div>
            <div className="p-6 sm:p-8 lg:p-10">
              <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-brand">Klare Leistungsgrenzen</p>
              <h3 className="mt-3 text-2xl font-extrabold text-slate-950 sm:text-3xl">Was ein Einsatz umfasst</h3>
              <ul className="mt-6 grid gap-3 text-sm font-semibold leading-6 text-slate-700">
                {[
                  "Eine wetterbedingte Anfahrt zum vereinbarten Objekt",
                  "Einen witterungsbedingt erforderlichen Räum- und/oder Streudurchgang auf den festgelegten Flächen",
                  "Das im Angebot für diesen Durchgang kalkulierte abstumpfende Streugut",
                  "Eine nachvollziehbare Zuordnung zum ausgeführten Einsatz",
                ].map((item) => (
                  <li key={item} className="flex gap-3">
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none text-emerald-600" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                Schneeabtransport, Dachflächen, außergewöhnliche Eislagen und die Streugutentfernung nach Saisonende sind nicht automatisch enthalten und werden bei Bedarf separat vereinbart.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-brand-dark text-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-3xl">
            <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-accent">Einfacher Start</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">So kommt Ihr Objekt in die Winterdienstplanung</h2>
            <p className="mt-4 text-base leading-7 text-slate-300 sm:text-lg">
              Von der ersten Zahl bis zum eindeutigen Saisonvertrag bleiben Flächen, Kosten und nächster Schritt nachvollziehbar.
            </p>
          </div>

          <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {planningSteps.map((step, index) => (
              <li key={step.title} className="relative rounded-2xl border border-white/10 bg-white/5 p-6">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-sm font-extrabold text-brand-dark">
                  {index + 1}
                </span>
                <h3 className="mt-5 text-lg font-extrabold">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:px-8 lg:py-20">
          <div className="rounded-2xl border border-brand/15 bg-brand-soft p-6 sm:p-8">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand text-white">
              <Route aria-hidden="true" className="h-6 w-6" />
            </span>
            <p className="mt-6 text-sm font-extrabold uppercase tracking-[0.16em] text-brand">Lokale Einsatzplanung</p>
            <p className="mt-3 text-2xl font-extrabold leading-tight text-slate-950">Hannover und passende Objekte im Tourengebiet</p>
            <p className="mt-4 text-sm leading-7 text-slate-700">
              Eine Online-Einschätzung ist noch keine Kapazitätszusage. Vor Vertragsabschluss prüfen wir, ob Adresse, Flächenumfang und gewünschte Betreuung sinnvoll in die Winterdiensttour passen.
            </p>
          </div>

          <div>
            <SectionHeading
              eyebrow="Winterdienst in Hannover"
              title="Örtliche Vorgaben von Anfang an mitdenken"
              text="Nach Angaben von aha müssen Eigentümer grundstückseigene und angrenzende öffentliche Gehwege grundsätzlich von Schnee und Eis befreien. Für Gehwege sind in Hannover in der Regel abstumpfende Mittel wie Sand oder Splitt vorgesehen; auftauende Mittel sind nur eingeschränkt zulässig."
            />
            <div className="mt-7 flex gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <ShieldCheck aria-hidden="true" className="mt-0.5 h-6 w-6 flex-none text-brand" />
              <div>
                <p className="font-extrabold text-slate-950">Flächen und Zuständigkeiten eindeutig festhalten</p>
                <p className="mt-2 text-sm leading-6 text-slate-650">
                  Welche Pflichten im konkreten Fall bestehen, ist objektbezogen zu prüfen. Hausvia führt die vertraglich vereinbarten Leistungen aus; diese Seite ersetzt keine Rechtsberatung.
                </p>
                <Link
                  href="https://www.aha-region.de/stadtreinigung/winterdienst/ihr-job"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-2 text-sm font-extrabold text-brand underline decoration-brand/30 underline-offset-4 hover:text-brand-dark"
                >
                  Hinweise von aha ansehen <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-sm font-extrabold">
              <Link
                href="/ratgeber/winterdienst-mehrfamilienhaus-hannover-planung"
                className="text-brand underline decoration-slate-300 underline-offset-4 hover:text-brand-dark"
              >
                Ratgeber: Winterdienst am Mehrfamilienhaus
              </Link>
              <Link
                href="/objektbetreuung-hannover"
                className="text-brand underline decoration-slate-300 underline-offset-4 hover:text-brand-dark"
              >
                Objektbetreuung in Hannover
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <SectionHeading
            eyebrow="Häufige Fragen"
            title="Antworten zum Winterdienst Hannover"
            text="Die wichtigsten Punkte zu Vertragslaufzeit, Abrechnung, Flächen und Einsätzen auf einen Blick."
          />
          <div className="mt-9">
            <FAQAccordion items={faqs} />
          </div>
        </div>
      </section>

      <section className="bg-brand text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center lg:px-8 lg:py-14">
          <div>
            <div className="flex items-center gap-3 text-accent">
              <FileCheck2 aria-hidden="true" className="h-6 w-6" />
              <p className="text-sm font-extrabold uppercase tracking-[0.16em]">Saison rechtzeitig planen</p>
            </div>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Winterdienst für Ihr Objekt prüfen</h2>
            <p className="mt-4 max-w-3xl text-base leading-7 text-blue-100">
              Berechnen Sie zuerst den Preis oder senden Sie Ihre Winterdienstanfrage direkt. Eine verbindliche Zusage erfolgt nach Prüfung von Objekt und Tourenkapazität.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <Link
              href="#winterdienst-preis"
              className="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-extrabold text-brand transition hover:bg-brand-soft"
            >
              Preis berechnen <Euro aria-hidden="true" className="h-4 w-4" />
            </Link>
            <Link
              href="/angebot-anfragen?leistung=winterdienst"
              className="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-6 py-3 text-sm font-extrabold text-white transition hover:bg-white/15"
            >
              Winterdienst anfragen <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <SEOJsonLd
        data={graph([
          webPageSchema({
            name: "Winterdienst Hannover",
            description:
              "Winterdienst in Hannover mit direkter Preiseinschätzung, saisonalem Grundbetrag und Abrechnung tatsächlicher Einsätze.",
            path: pagePath,
            image: ASSETS.blogWinter,
          }),
          breadcrumbSchema([
            { name: "Startseite", href: "/" },
            { name: "Winterdienst Hannover", href: pagePath },
          ]),
          serviceSchema({
            name: "Winterdienst Hannover",
            description:
              "Saisonaler Winterdienst für vereinbarte Wege, Zugänge und Außenflächen in Hannover vom 1. November bis 31. März.",
            path: pagePath,
            serviceType: "Winterdienst und Schneeräumdienst",
            areaServed: ["Hannover"],
          }),
          faqSchema(faqs),
        ])}
      />
    </main>
  );
}
