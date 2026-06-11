import { Star } from "lucide-react";
import { SectionHeading } from "@/components/SectionHeading";

const reviews = [
  {
    quote:
      "Seit der Betreuung läuft unser Objekt deutlich ruhiger. Mülltonnen, Treppenhaus und Außenflächen sind zuverlässig im Blick.",
    source: "WEG-Beirat, anonymisiert",
    label: "Laufende Objektbetreuung",
  },
  {
    quote:
      "Besonders gut ist, dass wir nicht für jede Kleinigkeit einen anderen Ansprechpartner suchen müssen.",
    source: "Privateigentümer, anonymisiert",
    label: "Alles aus einer Hand",
  },
  {
    quote:
      "Die Kombination aus Hausmeisterservice, Gartenpflege und Objektkontrolle spart uns intern viel Zeit.",
    source: "Gewerbekunde, anonymisiert",
    label: "Planbare Abläufe",
  },
];

function Stars() {
  return (
    <span className="inline-flex text-amber-500" aria-label="5 Sterne">
      {[0, 1, 2, 3, 4].map((item) => (
        <Star key={item} aria-hidden="true" className="h-4 w-4 fill-current" />
      ))}
    </span>
  );
}

export function ReviewSection() {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Kundenstimmen"
          title="Erfahrungen aus der Objektbetreuung"
          text="Anonymisierte Rückmeldungen zeigen, worauf es im Alltag ankommt: klare Zuständigkeit, gepflegte Flächen und regelmäßige Betreuung."
        />
        <div className="mt-9 grid gap-4 md:grid-cols-3">
          {reviews.map((review) => (
            <article key={review.source} className="rounded-lg border border-slate-200 bg-slate-50 p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <Stars />
                <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-brand">
                  {review.label}
                </span>
              </div>
              <blockquote className="mt-5 text-base font-semibold leading-7 text-slate-900">
                “{review.quote}”
              </blockquote>
              <p className="mt-5 text-sm font-bold text-slate-650">— {review.source}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
