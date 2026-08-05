import Link from "next/link";
import { Logo } from "@/components/Logo";
import { overviewLocations, serviceCards, SITE } from "@/lib/site";

const footerLocations = overviewLocations.slice(0, 12);

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-950 text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.2fr_2fr] lg:px-8">
        <div>
          <div className="mb-5 inline-flex rounded-md bg-white p-2">
            <Logo />
          </div>
          <p className="mb-3 text-sm font-extrabold tracking-wide text-cyan-300">
            {SITE.slogan}
          </p>
          <p className="max-w-md text-sm leading-7 text-slate-300">
            Hausvia ist der zuverlässige Partner für Hausmeisterservice,
            Objektbetreuung und laufende Immobilienpflege in Hannover und Umgebung.
          </p>
          <div className="mt-6 space-y-2 text-sm text-slate-300">
            <p>
              <strong className="text-white">Adresse:</strong> {SITE.address}
            </p>
            <p>
              <strong className="text-white">Telefon:</strong> {SITE.phone}
            </p>
            <p>
              <strong className="text-white">E-Mail:</strong> {SITE.email}
            </p>
            <p>
              <strong className="text-white">Öffnungszeiten:</strong> {SITE.openingHours}
            </p>
            <p>
              <strong className="text-white">Einsatzgebiet:</strong> {SITE.areaServed}
            </p>
          </div>
          <Link
            href="/angebot-anfragen"
            className="mt-7 inline-flex min-h-11 items-center rounded-md bg-accent px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-accent-dark"
          >
            Kostenlose Anfrage starten
          </Link>
          <div className="mt-4">
            <Link
              href="/login"
              className="inline-flex text-sm font-extrabold text-white underline decoration-accent decoration-2 underline-offset-4 transition hover:text-accent"
            >
              Zum Kundenportal / Login
            </Link>
            <p className="mt-2 max-w-sm text-xs leading-5 text-slate-400">
              Angebote, Betreuung und Rechnungen im Hausvia Portal einsehen.
            </p>
          </div>
        </div>

        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-white">Leistungen</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-300">
              {serviceCards.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="hover:text-white">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-white">Einsatzgebiete</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-300">
              {footerLocations.map((item) => (
                <li key={`${item.label}-${item.href}`}>
                  <Link href={item.href} className="hover:text-white">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-white">Kontakt</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-300">
              <li>
                <Link href="/kontakt" className="hover:text-white">
                  Kontakt aufnehmen
                </Link>
              </li>
              <li>
                <Link href="/angebot-anfragen" className="hover:text-white">
                  Angebot anfragen
                </Link>
              </li>
              <li>
                <Link href="/kosten-einschaetzen" className="hover:text-white">
                  Kosten einschätzen
                </Link>
              </li>
              <li>
                <Link href="/ueber-uns" className="hover:text-white">
                  Über Hausvia
                </Link>
              </li>
              <li>
                <Link href="/ratgeber" className="hover:text-white">
                  Ratgeber
                </Link>
              </li>
              <li>
                <Link href="/agb" className="hover:text-white">
                  AGB
                </Link>
              </li>
              <li>
                <Link href="/datenschutz" className="hover:text-white">
                  Datenschutz
                </Link>
              </li>
              <li>
                <Link href="/impressum" className="hover:text-white">
                  Impressum
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10 px-4 py-5 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} Hausvia. Rechtliche Angaben vor Veröffentlichung prüfen.
      </div>
    </footer>
  );
}
