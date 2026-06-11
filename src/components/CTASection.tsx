import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function CTASection({
  title = "Betreuung für Ihr Objekt prüfen",
  text = "Stellen Sie in wenigen Schritten zusammen, welche Leistungen Sie benötigen. Hausvia meldet sich mit einer passenden Einschätzung für Ihr Objekt.",
  href = "/angebot-anfragen",
  label = "Jetzt Bedarf ermitteln",
}: {
  title?: string;
  text?: string;
  href?: string;
  label?: string;
}) {
  return (
    <section className="bg-brand">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 text-white sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center lg:px-8">
        <div>
          <h2 className="text-3xl font-extrabold leading-tight">{title}</h2>
          <p className="mt-3 max-w-3xl text-base leading-7 text-blue-50">{text}</p>
        </div>
        <Link
          href={href}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-accent px-6 py-3 text-base font-bold text-slate-950 transition hover:bg-accent-dark"
        >
          {label}
          <ArrowRight aria-hidden="true" size={18} />
        </Link>
      </div>
    </section>
  );
}
