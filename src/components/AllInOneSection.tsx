import {
  ClipboardCheck,
  Leaf,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { SectionHeading } from "@/components/SectionHeading";

const services = [
  { title: "Hausmeisterservice & Objektbetreuung", Icon: ShieldCheck },
  { title: "Reinigung, Ordnung & Mülldienst", Icon: Sparkles },
  { title: "Gartenpflege & Außenanlagen", Icon: Leaf },
  { title: "Kontrollgänge & Organisation", Icon: ClipboardCheck },
];

export function AllInOneSection() {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Alles aus einer Hand"
          title="Alles aus einer Hand für gepflegte Immobilien"
          text="Ob WEG, Privathaushalt oder Gewerbeobjekt: Hausvia kombiniert klassische Hausmeisterdienste mit Gartenpflege, Außenanlagenpflege, Kontrollgängen und organisatorischen Aufgaben rund ums Objekt. So entsteht eine Betreuung, die nicht nur sauber aussieht, sondern im Alltag wirklich entlastet."
        />
        <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {services.map(({ title, Icon }) => (
            <article key={title} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-md bg-brand-soft text-brand">
                <Icon aria-hidden="true" className="h-5 w-5" />
              </span>
              <h3 className="text-sm font-extrabold leading-6 text-slate-950">{title}</h3>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
