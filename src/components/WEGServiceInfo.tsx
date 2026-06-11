import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { SectionHeading } from "@/components/SectionHeading";

const wegServices = [
  {
    title: "Reinigung",
    text: "Treppenhaus, Flure, Keller, Hof und Müllplatz sauber halten.",
  },
  {
    title: "Mülldienst",
    text: "Tonnen raus- und reinstellen sowie den Müllbereich ordentlich halten.",
  },
  {
    title: "Garten- und Außenpflege",
    text: "Rasen mähen, Hecken schneiden, Laub entfernen sowie Wege und Parkplätze pflegen.",
  },
  {
    title: "Winterdienst",
    text: "Schnee räumen und streuen – je nach Vereinbarung separat oder im Betreuungspaket.",
  },
  {
    title: "Technische Kontrollen",
    text: "Heizung, Beleuchtung, Schließanlagen, Wasseranlagen und andere technische Bereiche kontrollieren und bedienen.",
  },
  {
    title: "Kontrolle der Hausordnung",
    text: "Freie Fluchtwege, keine Gefahrenquellen, geschlossene Türen und ordentliche Allgemeinflächen.",
  },
  {
    title: "Kleinere Aufgaben",
    text: "Zähler ablesen, Zugang für Dienstleister organisieren und einfache Kontroll- oder Wartungsaufgaben übernehmen.",
  },
];

export function WEGServiceInfo() {
  return (
    <section className="bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="WEG und Umlagefähigkeit"
          title="Typische Leistungen eines Hausmeisters in der WEG"
          text="Nicht alle Arbeiten sind gleich umlagefähig. Reparaturen und Instandsetzungen zählen häufig nicht zu den reinen Hausmeisterkosten. Typische umlagefähige Tätigkeiten sind vor allem Kontroll-, Pflege- und Bedienungsarbeiten."
        />
        <div className="mt-9 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {wegServices.map((item) => (
            <article key={item.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex gap-3">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none text-green-700" />
                <div>
                  <h3 className="text-base font-extrabold text-slate-950">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-650">{item.text}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
        <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <div className="flex gap-3">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none" />
            <p className="text-sm font-semibold leading-7">
              Nicht oder nur teilweise umlagefähig sind häufig Instandsetzungs- und Reparaturarbeiten, größere
              Handwerksleistungen, Verwaltungsaufgaben oder Tätigkeiten, die über reine Pflege, Kontrolle und Bedienung
              hinausgehen. Diese werden in der Regel separat beauftragt oder über andere Kostenstellen abgerechnet.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
