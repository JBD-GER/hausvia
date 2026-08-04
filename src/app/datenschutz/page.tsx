import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { SEOJsonLd } from "@/components/SEOJsonLd";
import { SITE } from "@/lib/site";
import { breadcrumbSchema, graph, metadataForPage, webPageSchema } from "@/lib/seo";

export const metadata: Metadata = metadataForPage({
  title: "Datenschutz | Hausvia",
  description:
    "Datenschutzhinweise von Hausvia. Platzhalterseite, die vor Veröffentlichung rechtlich geprüft und ergänzt werden muss.",
  path: "/datenschutz",
});

export default function DatenschutzPage() {
  return (
    <main>
      <Breadcrumbs
        items={[
          { label: "Startseite", href: "/" },
          { label: "Datenschutz", href: "/datenschutz" },
        ]}
      />
      <section className="bg-white">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <p className="text-sm font-bold uppercase tracking-wide text-brand">Rechtlicher Platzhalter</p>
          <h1 className="mt-3 text-4xl font-extrabold text-slate-950">Datenschutzerklärung</h1>
          <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">
            Diese Datenschutzseite ist ein neutraler Platzhalter und muss vor Veröffentlichung durch eine rechtlich
            geprüfte Datenschutzerklärung ersetzt oder ergänzt werden.
          </p>

          <div className="prose prose-slate mt-10 max-w-none">
            <h2>1. Verantwortliche Stelle</h2>
            <p>
              Verantwortlich für diese Website ist: Hausvia, {SITE.address}. Telefon: {SITE.phone}. E-Mail:
              {" "}
              {SITE.email}. Diese Angaben sollten vor Veröffentlichung final geprüft werden.
            </p>

            <h2>2. Verarbeitung von Anfragen</h2>
            <p>
              Wenn Sie den Anfrage-Funnel oder das Kontaktformular nutzen, werden die von Ihnen eingegebenen Angaben zur
              Bearbeitung Ihrer Anfrage verarbeitet. Dazu können Name, Firma, Telefonnummer, E-Mail-Adresse, Standort,
              Objektart, gewünschte Leistungen und Ihre Nachricht gehören.
            </p>
            <p>
              Bei Nutzung des Kostenchecks können Ihre Angaben serverseitig zu einer unverbindlichen Einschätzung als
              Dokument verarbeitet und per E-Mail versendet werden. Für den E-Mail-Versand ist eine technische
              Einbindung von Resend vorgesehen. Anbieter, Auftragsverarbeitung, Speicherfristen und Drittlandbezug
              müssen vor Veröffentlichung rechtlich geprüft und vollständig ergänzt werden.
            </p>

            <h2>3. Server- und Zugriffsdaten</h2>
            <p>
              Beim Aufruf der Website können technisch erforderliche Zugriffsdaten verarbeitet werden. Welche Daten,
              Speicherfristen und Anbieter konkret betroffen sind, muss anhand des finalen Hostings geprüft werden.
            </p>

            <h2>4. Cookies, Analyse und Drittanbieter</h2>
            <p>
              Die Website nutzt ein Cookie- beziehungsweise Consent-Banner, um Ihre Auswahl zu notwendigen und
              optionalen Diensten lokal im Browser zu speichern. Die Speicherung erfolgt derzeit über den lokalen
              Browserspeicher und dient nur dazu, die Auswahl beim nächsten Besuch zu berücksichtigen.
            </p>
            <p>
              Für Google Ads ist der Google Consent Mode v2 mit einer standardmäßig verweigerten Einwilligung
              eingerichtet. Das Google Tag kann dadurch technisch aufgerufen werden, ohne vor Ihrer Auswahl
              Werbe-Cookies zu setzen oder von Ihnen im Formular bereitgestellte Kontaktdaten für Werbung zu senden.
              Im verweigerten Zustand können eingeschränkte, cookielose Messsignale wie Einwilligungsstatus,
              Seitenaufruf und technische Geräteinformationen an Google übermittelt werden. Erst bei Zustimmung zu
              Marketingdiensten werden die Werbefunktionen freigegeben und erfolgreich abgesendete Anfragen als
              Conversion übermittelt. Für erweiterte Conversions können dabei die angegebene E-Mail-Adresse und
              Telefonnummer normalisiert und durch Google vor der Zuordnung gehasht werden. Die
              konkrete Anbieterbeschreibung, Rechtsgrundlage, Speicherdauer und mögliche Drittlandübermittlung müssen
              vor Veröffentlichung rechtlich geprüft und vollständig ergänzt werden.
            </p>
            <p>
              Im Winterdienst-Rechner können Sie den Google-Adressfinder und eine Google-Karte zur Flächenmessung
              ausdrücklich aktivieren. Erst nach diesem Klick werden Google Maps Platform und Places geladen und eine
              technische Verbindung zu Google hergestellt. Suchangaben und Karteninteraktionen können dabei durch
              Google verarbeitet werden. Die ausgewählte Objektadresse und markierten Eckpunkte werden von Hausvia erst
              übernommen, wenn Sie daraus eine Anfrage starten. Weitere Informationen finden Sie in den{" "}
              <a href="https://policies.google.com/privacy" rel="noreferrer" target="_blank">
                Datenschutzhinweisen von Google
              </a>
              . Anbieterbezeichnung, Rechtsgrundlage, Speicherdauer und mögliche Drittlandübermittlung müssen vor
              Veröffentlichung rechtlich geprüft und vollständig ergänzt werden.
            </p>

            <h2>5. Rechtsgrundlagen und Rechte betroffener Personen</h2>
            <p>
              Angaben zu Rechtsgrundlagen, Auskunft, Berichtigung, Löschung, Einschränkung, Widerspruch,
              Datenübertragbarkeit und Beschwerderecht müssen rechtlich geprüft und vollständig ergänzt werden.
            </p>

            <h2>6. Kontakt zum Datenschutz</h2>
            <p>
              Datenschutzanfragen können an {SITE.email} gerichtet werden.
            </p>
          </div>
        </div>
      </section>
      <SEOJsonLd
        data={graph([
          webPageSchema({
            name: "Datenschutzerklärung",
            description:
              "Datenschutzhinweise von Hausvia als rechtlich zu prüfender Platzhalter.",
            path: "/datenschutz",
          }),
          breadcrumbSchema([
            { name: "Startseite", href: "/" },
            { name: "Datenschutz", href: "/datenschutz" },
          ]),
        ])}
      />
    </main>
  );
}
