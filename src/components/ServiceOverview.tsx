import Link from "next/link";
import {
  ClipboardCheck,
  Hammer,
  KeyRound,
  Leaf,
  Lightbulb,
  ListChecks,
  Recycle,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Wrench,
} from "lucide-react";
import { SectionHeading } from "@/components/SectionHeading";
import { pricingConfig, type ServiceId } from "@/lib/pricing";
import { getServiceLandingPageById } from "@/lib/serviceLandingPages";

const serviceMeta: Record<
  ServiceId,
  {
    icon: typeof ShieldCheck;
  }
> = {
  caretaker: { icon: ShieldCheck },
  interiorCleaning: { icon: Sparkles },
  outdoorCleaning: { icon: Sparkles },
  binService: { icon: Recycle },
  gardenCare: { icon: Leaf },
  lawnMowing: { icon: Leaf },
  hedgeCutting: { icon: Leaf },
  leafRemoval: { icon: Leaf },
  winterService: { icon: Snowflake },
  technicalChecks: { icon: ClipboardCheck },
  lightingChecks: { icon: Lightbulb },
  technicalRooms: { icon: Wrench },
  contractorAccess: { icon: KeyRound },
  meterReading: { icon: ListChecks },
  minorMaintenance: { icon: Hammer },
};

const categories: Array<{
  title: string;
  text: string;
  services: ServiceId[];
}> = [
  {
    title: "Betreuung & Kontrolle",
    text: "Regelmäßige Präsenz, klare Zuständigkeit und nachvollziehbare Rückmeldungen am Objekt.",
    services: ["caretaker", "technicalChecks", "lightingChecks", "technicalRooms"],
  },
  {
    title: "Reinigung & Ordnung",
    text: "Saubere gemeinschaftliche Bereiche, ordentliche Müllplätze und gepflegte Eingänge.",
    services: ["interiorCleaning", "outdoorCleaning", "binService"],
  },
  {
    title: "Außenflächen & Saison",
    text: "Außenanlagenpflege, Grünflächen und saisonale Aufgaben nach vereinbartem Turnus.",
    services: ["gardenCare", "lawnMowing", "hedgeCutting", "leafRemoval", "winterService"],
  },
  {
    title: "Organisation & kleine Aufgaben",
    text: "Praktische Unterstützung rund um Dienstleistertermine, Zähler und kleinere Kontrollaufgaben.",
    services: ["contractorAccess", "meterReading", "minorMaintenance"],
  },
];

function getService(serviceId: ServiceId) {
  return pricingConfig.services.find((service) => service.id === serviceId);
}

export function ServiceOverview({
  eyebrow = "Leistungsübersicht",
  title = "Alle Leistungen, die Hausvia für Ihr Objekt kombinieren kann",
  text = "Hausvia arbeitet nicht mit starren Paketen. Die Betreuung wird aus einzelnen Leistungsbausteinen zusammengestellt und passend zu Objektart, Fläche, Turnus und Alltag abgestimmt.",
  background = "slate",
}: {
  eyebrow?: string;
  title?: string;
  text?: string;
  background?: "white" | "slate";
}) {
  return (
    <section className={background === "white" ? "bg-white" : "bg-slate-50"}>
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeading eyebrow={eyebrow} title={title} text={text} />

        <div className="mt-10 grid gap-10">
          {categories.map((category) => (
            <div key={category.title}>
              <div className="max-w-3xl">
                <h3 className="text-xl font-extrabold text-slate-950">{category.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-650">{category.text}</p>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {category.services.map((serviceId) => {
                  const service = getService(serviceId);
                  const meta = serviceMeta[serviceId];
                  const landingPage = getServiceLandingPageById(serviceId);
                  const Icon = meta.icon;

                  if (!service || !landingPage) return null;

                  return (
                    <article
                      key={serviceId}
                      className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-md bg-brand-soft text-brand">
                          <Icon aria-hidden="true" className="h-5 w-5" />
                        </span>
                        <div>
                          <h4 className="text-base font-extrabold leading-6 text-slate-950">{service.label}</h4>
                          <p className="mt-2 text-sm font-semibold leading-6 text-slate-650">
                            {service.description}
                          </p>
                        </div>
                      </div>
                      <Link
                        href={
                          serviceId === "winterService"
                            ? "/winterdienst-hannover"
                            : `/leistungen/${landingPage.slug}`
                        }
                        className="mt-5 inline-flex text-sm font-bold text-brand hover:text-brand-dark"
                      >
                        Details ansehen
                      </Link>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-lg border border-brand/15 bg-brand-soft p-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div>
            <h3 className="text-lg font-extrabold text-slate-950">Leistungen lieber direkt zusammenstellen?</h3>
            <p className="mt-2 text-sm leading-6 text-slate-650">
              Im Kostencheck wählen Sie genau die Bausteine aus, die für Ihr Objekt relevant sind.
            </p>
          </div>
          <Link
            href="/kosten-einschaetzen"
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-5 py-2.5 text-sm font-bold text-white sm:mt-0"
          >
            Service konfigurieren
          </Link>
        </div>
      </div>
    </section>
  );
}
