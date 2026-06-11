import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, MailCheck, SearchCheck, ShieldCheck } from "lucide-react";
import { LeadConversionTracker } from "@/components/LeadConversionTracker";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Vielen Dank | Hausvia",
  description:
    "Vielen Dank für Ihre Hausvia Anfrage. Das PDF-Dokument zur unverbindlichen Einschätzung wurde per E-Mail versendet.",
  alternates: {
    canonical: absoluteUrl("/danke"),
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

const nextSteps = [
  {
    title: "Postfach prüfen",
    text: "Das Hausvia PDF mit Ihrer unverbindlichen Einschätzung wurde an die angegebene E-Mail-Adresse gesendet.",
    icon: MailCheck,
  },
  {
    title: "Spam-Ordner ansehen",
    text: "Falls die E-Mail nicht direkt sichtbar ist, prüfen Sie bitte auch Spam, Werbung oder Junk-Mail.",
    icon: SearchCheck,
  },
  {
    title: "Dokument bereithalten",
    text: "Im PDF stehen Ihre Objektangaben, Leistungen und die vorbereitete monatliche Kostenspanne zusammengefasst.",
    icon: ShieldCheck,
  },
];

export default function DankePage() {
  return (
    <main className="overflow-hidden bg-white">
      <LeadConversionTracker />
      <section className="relative border-b border-slate-200 bg-slate-50">
        <div className="absolute inset-x-0 top-0 h-2 bg-accent" aria-hidden="true" />
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.22em] text-brand">Anfrage erfolgreich versendet</p>
            <h1 className="mt-4 max-w-3xl text-[2.35rem] font-extrabold leading-[1.05] text-slate-950 sm:text-[3.15rem] lg:text-[3.55rem]">
              Vielen Dank, Ihre Hausvia Einschätzung ist unterwegs.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-700">
              Das offizielle PDF-Dokument wurde per E-Mail verschickt. Bitte prüfen Sie Ihr Postfach und schauen Sie
              vorsichtshalber auch im Spam- oder Junk-Ordner nach.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-brand px-6 py-3 text-sm font-extrabold text-white transition hover:bg-brand-dark"
              >
                Zur Startseite
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              <Link
                href="/kontakt"
                className="inline-flex min-h-12 items-center justify-center rounded-md border border-slate-300 bg-white px-6 py-3 text-sm font-extrabold text-slate-900 transition hover:border-brand hover:text-brand"
              >
                Kontakt aufnehmen
              </Link>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-md">
            <div
              className="absolute -left-4 top-10 h-24 w-24 rounded-2xl bg-brand-soft animate-hausvia-float"
              aria-hidden="true"
            />
            <div
              className="absolute -right-3 bottom-12 h-28 w-28 rounded-2xl bg-accent/25 animate-hausvia-float-delayed"
              aria-hidden="true"
            />
            <div className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-950/10">
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-green-50 text-green-700 animate-hausvia-pop">
                <CheckCircle2 aria-hidden="true" className="h-14 w-14" />
              </div>
              <div className="mt-7 rounded-xl border border-brand/15 bg-brand-soft p-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 flex-none items-center justify-center rounded-lg bg-brand text-white">
                    <MailCheck aria-hidden="true" className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-extrabold uppercase tracking-wide text-brand">PDF per E-Mail</p>
                    <p className="mt-1 text-xl font-extrabold leading-tight text-slate-950">Einschätzung liegt im Postfach</p>
                    <p className="mt-2 text-sm leading-6 text-slate-650">
                      Der Versand kann je nach Mailanbieter einen Moment dauern. Bitte auch Spam/Junk prüfen.
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs font-bold text-slate-650">
                <span className="rounded-md bg-slate-50 px-2 py-3">PDF</span>
                <span className="rounded-md bg-slate-50 px-2 py-3">E-Mail</span>
                <span className="rounded-md bg-slate-50 px-2 py-3">Hausvia</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid gap-4 md:grid-cols-3">
            {nextSteps.map((item) => {
              const Icon = item.icon;

              return (
                <article key={item.title} className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand text-white">
                    <Icon aria-hidden="true" className="h-6 w-6" />
                  </div>
                  <h2 className="mt-5 text-xl font-extrabold text-slate-950">{item.title}</h2>
                  <p className="mt-2 text-sm leading-7 text-slate-650">{item.text}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
