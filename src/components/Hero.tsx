import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, CheckCircle2, Star } from "lucide-react";

export function Hero({
  eyebrow,
  title,
  text,
  image,
  imageAlt,
  primaryHref = "/angebot-anfragen",
  primaryLabel = "Kostenlose Anfrage starten",
  secondaryHref,
  secondaryLabel,
  bullets = [],
  trustText,
  aside,
  showActions = true,
}: {
  eyebrow?: string;
  title: string;
  text: string;
  image?: string;
  imageAlt?: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  bullets?: string[];
  trustText?: string;
  aside?: ReactNode;
  showActions?: boolean;
}) {
  return (
    <section className="relative overflow-hidden bg-slate-50">
      <div
        className={`mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-18 lg:px-8 lg:py-20 ${
          aside ? "lg:grid-cols-[0.7fr_1.3fr]" : "lg:grid-cols-[1fr_0.92fr]"
        }`}
      >
        <div>
          {eyebrow ? (
            <p className="mb-4 text-sm font-bold uppercase tracking-wide text-brand">{eyebrow}</p>
          ) : null}
          {trustText ? (
            <div className="mb-4 inline-flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-white px-3 py-2 text-sm font-bold text-slate-750 shadow-sm">
              <span className="inline-flex text-amber-500" aria-label="5 Sterne">
                {[0, 1, 2, 3, 4].map((item) => (
                  <Star key={item} aria-hidden="true" className="h-4 w-4 fill-current" />
                ))}
              </span>
              <span>{trustText}</span>
            </div>
          ) : null}
          <h1 className="max-w-4xl text-[2rem] font-extrabold leading-[1.08] text-slate-950 sm:text-[2.5rem] md:text-[2.75rem] lg:text-[3.25rem]">
            {title}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-700">{text}</p>

          {bullets.length ? (
            <ul className="mt-7 grid gap-3 text-sm font-semibold text-slate-700 sm:grid-cols-2">
              {bullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-2">
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none text-green-700" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {showActions ? (
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={primaryHref}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-brand px-6 py-3 text-base font-bold text-white shadow-sm transition hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
              >
                {primaryLabel}
                <ArrowRight aria-hidden="true" size={18} />
              </Link>
              {secondaryHref && secondaryLabel ? (
                <Link
                  href={secondaryHref}
                  className="inline-flex min-h-12 items-center justify-center rounded-md border border-slate-300 bg-white px-6 py-3 text-base font-bold text-slate-900 transition hover:border-brand hover:text-brand"
                >
                  {secondaryLabel}
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>

        {aside ? (
          <div className="min-w-0">{aside}</div>
        ) : image ? (
          <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <Image
              src={image}
              alt={imageAlt ?? ""}
              width={1200}
              height={800}
              priority
              sizes="(min-width: 1024px) 46vw, 100vw"
              className="aspect-[4/3] h-full w-full object-cover lg:aspect-[5/4]"
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
