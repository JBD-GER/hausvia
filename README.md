# Hausvia Website und Portal

Next.js-App-Router-Projekt für Hausvia mit öffentlicher SEO-Website, Kostencheck-Funnel und drei geschützten Portalbereichen:

- `/admin` für Administration und Disposition
- `/app` für Mitarbeitende
- `/portal` für Kundinnen und Kunden

Das Portal nutzt Supabase für Auth, Postgres, Row Level Security (RLS), Storage und Realtime, Resend für transaktionale E-Mails sowie Vercel Cron für zeitgesteuerte Abläufe.

## Entwicklung und Prüfung

```bash
npm install
npm run dev
```

Vor einem Deployment mindestens ausführen:

```bash
npm run lint
npm test
npm run build
```

## Umgebungsvariablen

Lokale Werte gehören in `.env.local`, Produktionswerte in die Vercel-Projektkonfiguration. Keine Secret-Werte committen. Alle Namen mit `NEXT_PUBLIC_` werden in den Browser-Build übernommen und dürfen deshalb keine Geheimnisse enthalten.

| Name | Sichtbarkeit und Zweck |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Öffentlich. Kanonischer Ursprung für Links, Redirects und Einladungs-URLs. |
| `NEXT_PUBLIC_SUPABASE_URL` | Öffentlich. URL des Supabase-Projekts. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Öffentlich. Bevorzugter Publishable Key für Browser- und SSR-Clients; die Sicherheit muss über Grants und RLS kommen. |
| `SUPABASE_SECRET_KEY` | Nur Server. Bevorzugter Supabase Secret Key für ausdrücklich autorisierte administrative und öffentliche Serverabläufe. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Öffentlich. Nur noch unterstützter Legacy-Fallback für den Publishable Key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Nur Server. Nur noch unterstützter Legacy-Fallback für den Secret Key; umgeht RLS und darf nie im Browser landen. |
| `RESEND_API_KEY` | Nur Server. API-Schlüssel für Einladungen, Leads, Angebote und Rechnungen per E-Mail. |
| `RESEND_FROM_EMAIL` | Nur Server. Verifizierte Absenderidentität für transaktionale E-Mails. |
| `HAUSVIA_INTERNAL_LEAD_EMAIL` | Nur Server. Interne Empfängeradresse für neue Funnel-Anfragen. |
| `CRON_SECRET` | Nur Server. Bearer Secret für alle in `vercel.json` registrierten Cron-Routen. |
| `QR_TOKEN_SECRET` | Nur Server. Signiert und prüft Gebäude-QR-Tokens. |
| `PUBLIC_FORM_RATE_LIMIT_SECRET` | Nur Server. Separates Hash-Secret für das Rate-Limit öffentlicher Formulare. |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Nur Server. Stabiler, Base64-kodierter AES-Schlüssel mit 16, 24 oder bevorzugt 32 Byte für verschlüsselte Next.js-Server-Action-Daten über Deployments und Instanzen hinweg. |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Öffentlich. Google-Maps-Key für Adress-/Kartenfunktionen; per API- und HTTP-Referrer-Restriktion absichern. |
| `NEXT_PUBLIC_GOOGLE_ADS_ID` | Öffentlich und optional. Google-Ads-Konto-ID für Conversion Tracking. |
| `NEXT_PUBLIC_GOOGLE_ADS_LEAD_CONVERSION_LABEL` | Öffentlich und optional. Conversion-Label für allgemeine Leads. |
| `NEXT_PUBLIC_GOOGLE_ADS_WINTERDIENST_CONVERSION_LABEL` | Öffentlich und optional. Conversion-Label für Winterdienst-Leads. |

Für neue Installationen ausschließlich die bevorzugten Supabase-Schlüsselnamen verwenden. Die beiden Legacy-Namen bleiben nur für bestehende Deployments als Fallback erhalten.

## Supabase einrichten und migrieren

Die Migrationen müssen in Zeitstempelreihenfolge über den normalen Supabase-Migrationsworkflow ausgeführt werden:

1. `supabase/migrations/20260612090000_core_portal.sql`
2. `supabase/migrations/20260612113000_offer_invoice_workflow.sql`
3. `supabase/migrations/20260612120000_offer_closing_text.sql`
4. `supabase/migrations/20260805112124_hausvia_portal_v2.sql`
5. `supabase/migrations/20260805112409_portal_security_hardening.sql`
6. `supabase/migrations/20260805114046_portal_acceptance_hardening.sql`
7. `supabase/migrations/20260805120141_customer_status_access_hardening.sql`
8. `supabase/migrations/20260805120546_account_lifecycle_hardening.sql`
9. `supabase/migrations/20260805120707_atomic_account_status.sql`
10. `supabase/migrations/20260805122016_operational_report_visit_scope.sql`
11. `supabase/migrations/20260805122249_portal_foreign_key_indexes.sql`
12. `supabase/migrations/20260805124648_atomic_equipment_assignments.sql`
13. `supabase/migrations/20260805130428_atomic_property_lifecycle.sql`
14. `supabase/migrations/20260805130433_atomic_property_service_configuration.sql`
15. `supabase/migrations/20260805130735_atomic_visit_plan_status.sql`
16. `supabase/migrations/20260805131539_active_operational_parent_guards.sql`
17. `supabase/migrations/20260805131545_chat_message_cleanup.sql`
18. `supabase/migrations/20260805134740_property_employee_work_guards.sql`
19. `supabase/migrations/20260805134911_atomic_visit_plan_configuration.sql`
20. `supabase/migrations/20260805135127_visit_plan_generation_security_hardening.sql`
21. `supabase/migrations/20260805140121_preserve_past_visit_plan_visits.sql`
22. `supabase/migrations/20260805140558_preserve_past_property_visits.sql`

Die V2-Migration erweitert das bestehende Portal additiv um Immobilien und Gebäude, Leistungen und Checklisten, Einsatzplanung, Aufgaben-Snapshots, Equipment, Schadenmeldungen, Einsatzberichte, Objektchat, Beschwerden, Benachrichtigungen und die neue Monatsabrechnung. Sie setzt die drei älteren Migrationen voraus und ersetzt sie nicht.

Die nachgelagerten Hardening-Migrationen begrenzen administrative RPCs und interne Plan-/Zeitdaten zusätzlich, verschieben Erweiterungen in das vorgesehene Schema, frieren betriebliche Meldungen beim Einsatzabschluss in einem getrennten, ausschließlich administrativen Snapshot ein, machen Kunden-, Mitarbeiter-, Immobilien- und Gebäudestatus zu unmittelbaren Autorisierungs- und Lebenszyklusgrenzen, widerrufen offene Einladungen bei einer Deaktivierung atomar und erzwingen korrekte Gebäude-/Einsatzbezüge. Equipmentzuordnungen, vollständige Leistungskonfigurationen und Besuchspläne einschließlich Gebäude-/Mitarbeiterbezügen, Terminbildung und Audit-Log werden transaktional geändert. Planänderung, Termin-Cron und Immobilienarchivierung verwenden einen gemeinsamen Transaktions-Lock, damit weder alte Termine nach einer parallelen Änderung neu entstehen noch gegensätzliche Mehrzeilen-Sperren kollidieren. Pausierung und Archivierung wirken ausschließlich prospektiv; vergangene geplante und manuell angepasste Termine bleiben als Betriebsnachweis unverändert. Datenbank-Guards verhindern aktive Mitarbeiterzuordnungen und Besuchspläne unter bereits archivierten Immobilien sowie das Beenden oder Löschen einer Teamzuordnung, solange sie noch von einem aktiven Plan oder offenen Einsatz benötigt wird. Kompensierte Chat-Nachrichten entfernen zugehörige Anhänge, Benachrichtigungen und Zustellstatus vollständig. Ergänzende Fremdschlüsselindizes halten administrative Profiländerungen auch bei wachsendem Datenbestand performant.

Vor der V2-Migration:

1. Datenbank sichern und die Migration zuerst in einer Staging-Umgebung prüfen.
2. Historische Datenfehler beheben, die der Preflight meldet, insbesondere doppelte Rechnungsnummern.
3. Alle Migrationen vollständig ausführen, beispielsweise nach Verknüpfung mit dem richtigen Projekt über `supabase db push`.
4. Anschließend RLS, Grants, Storage Policies, private Buckets und Auth-Redirects in der Zielumgebung prüfen.

Für Supabase Auth gilt:

- E-Mail/Passwort aktivieren.
- Öffentliche Registrierung deaktiviert lassen. Benutzer werden ausschließlich serverseitig durch den Admin-/Einladungsprozess bereitgestellt.
- Mindestens acht Passwortzeichen und den Schutz gegen bekannte geleakte Passwörter aktivieren.
- Site URL auf den produktiven Ursprung setzen.
- Den Callback-Pfad `/auth/callback` sowie `/auth/callback?next=/reset-password` für Produktion und lokale Entwicklung als Redirects erlauben.

`supabase/config.toml` bildet diese Regeln für die lokale Supabase-Umgebung reproduzierbar ab: Self-Sign-up und anonyme Registrierung sind deaktiviert, Passwörter benötigen mindestens acht Zeichen und Recovery-/E-Mail-OTP-Links laufen nach 60 Minuten ab. Die Datei konfiguriert nicht automatisch das gehostete Projekt; dessen Auth-Einstellungen müssen beim Deployment weiterhin abgeglichen werden.

## Rollen, Anmeldung und Einladungen

Die sichtbare Navigation ist nur Komfort. Die eigentliche Berechtigung wird serverseitig und durch RLS durchgesetzt.

- `admin`: vollständige Verwaltung von Kunden, Mitarbeitenden, Immobilien, Gebäuden, Leistungen, Checklisten, Einsatzplänen und Einsätzen, Equipment, QR-/Schadenprozessen, Berichten, Chat/Beschwerden, Benachrichtigungen, Unternehmensdaten und Abrechnung.
- `employee`: ausschließlich zugewiesene Immobilien, Pläne und Einsätze sowie die dafür freigegebenen Aufgaben, Timer, Berichte und Equipment-Daten. Keine Rechnungen, Preise oder fremden Kundendaten.
- `customer`: ausschließlich verknüpfte Kundenkonten und Immobilien sowie kundensichtbare Einsätze/Berichte, eigene Nachrichten, Beschwerden, Schäden und Rechnungen.

Es gibt keine öffentliche Registrierungsseite und keinen freien Sign-up. Der Ablauf für Kunden und Mitarbeitende ist:

1. Ein Admin legt zuerst den konkreten Kunden- oder Mitarbeiterdatensatz an. Dabei entsteht eine Einladung im Status `draft`.
2. Beim Senden wird eine individuelle E-Mail über Resend erzeugt. Die Einladung wechselt auf `sent` und ist 30 Tage gültig.
3. Der Link führt nach `/einladung/[token]`. Das Token besteht aus 32 zufälligen Bytes; in Postgres wird ausschließlich dessen SHA-256-Hash gespeichert.
4. Erst die einmalige, noch gültige Annahme setzt das Passwort, bestätigt den Auth-Benutzer, verknüpft ihn mit dem konkreten Ziel und aktiviert das Rollenprofil.
5. Einladungen können erneut gesendet oder widerrufen werden. Erneutes Senden rotiert das Token. Zulässige Zustände sind `draft`, `sent`, `accepted`, `expired` und `revoked`.

Pro normalisierter E-Mail-Adresse ist höchstens eine offene Einladung (`draft` oder `sent`) zulässig. Eine Kunden-Einladung muss genau auf einen Kunden, eine Mitarbeiter-Einladung genau auf ein Mitarbeiterprofil zeigen. Das frühere Supabase-Invite-Mail-Template ist nicht Teil dieses Ablaufs; Einladungsversand und Inhalt liegen in der Anwendung und bei Resend.

### Ersten Admin anlegen

Der einzige Bootstrap-Sonderfall ist die fest hinterlegte Admin-Adresse `info@hausvia.de`:

1. In Supabase unter **Authentication > Users** einen Auth-Benutzer mit dieser Adresse anlegen.
2. Ein temporäres Passwort setzen oder über `/forgot-password` den Recovery-Ablauf nutzen.
3. Beim ersten erfolgreichen Login beziehungsweise Auth-Callback legt die Anwendung automatisch das aktive Adminprofil für Christoph Pfad an und leitet nach `/admin` weiter.

Für alle anderen Adressen ist ein vorhandenes, aktives Rollenprofil beziehungsweise eine gültige Einladung erforderlich. Ein manuelles SQL-Profil mit frei gewählter Rolle ist nicht der reguläre Onboarding-Weg.

### Passwort-Recovery

- `/forgot-password` fordert neutral einen Reset-Link an, ohne das Vorhandensein eines Kontos offenzulegen.
- `/auth/callback?next=/reset-password` bestätigt den Supabase-Recovery-Link und baut die Session auf.
- `/reset-password` setzt das neue Passwort.
- Anschließend erfolgt die rollenabhängige Weiterleitung nach `/admin`, `/app` oder `/portal`.

Der Recovery-Versand ist nur für aktive, vollständig eingerichtete Profile sowie den Admin-Bootstrap vorgesehen.

## RLS und privater Storage

Die V2-Migration aktiviert RLS für alle neu exponierten Portal-Tabellen, reduziert pauschale Grants und ergänzt rollen- und beziehungsbasierte Policies. Maßgebliche Beziehungen sind unter anderem Kundenmitgliedschaften, Immobilienzuweisungen, Einsatzplan-/Einsatzzuweisungen sowie die jeweilige Elternressource eines Anhangs.

Wichtige Sicherheitsregeln:

- Browserzugriffe verwenden nur den Publishable Key und bleiben durch Grants plus RLS begrenzt.
- Der Secret-/Service-Role-Key umgeht RLS. Er ist ausschließlich in Server Actions und Route Handlers zulässig, nachdem der jeweilige Admin-, Cron-, Einladungs- oder öffentliche Sicherheits-Guard erfüllt wurde.
- Ein angemeldeter Benutzer erhält keinen Zugriff allein aufgrund einer bekannten UUID oder eines erratenen Storage-Pfads.
- Private Dateien werden nach serverseitiger Berechtigungsprüfung beziehungsweise über kurzlebige signierte Downloads ausgeliefert.
- Der öffentliche QR-Schadeneinstieg macht weder Tabellen noch Storage Buckets öffentlich.

Alle Portal-Buckets sind privat (`public = false`):

- Dokumente: `offer-pdfs`, `invoice-pdfs`, `customer-documents`, `project-documents`
- Einsatzbilder: `shift-photos`, `visit-task-attachments`, `operational-report-attachments`
- Schäden und Beschwerden: `damage-attachments`, `complaint-attachments`
- Kommunikation und Equipment: `property-message-attachments`, `equipment-images`

Die Migration setzt Bucket-spezifische Größen-/MIME-Grenzen und pfadbewusste Storage-RLS. Admins haben den vorgesehenen Gesamtzugriff; Kunden und Mitarbeitende erhalten nur den für ihre verknüpften Datensätze erlaubten Lese-/Uploadzugriff. Original-PDFs freigegebener Rechnungen im Bucket `invoice-pdfs` können zusätzlich durch einen Datenbank-Trigger weder überschrieben noch gelöscht werden.

Dateien, die derzeit über Server Actions hochgeladen werden, sind anwendungsseitig auf 4 MB begrenzt, damit sie einschließlich Multipart-Overhead unter dem Request-Limit des vorgesehenen Vercel-Hostings bleiben. Größere Chatvideos benötigen künftig einen separat autorisierten Direktupload in den privaten Storage; die aktuellen unterstützten Bild-, Video- und PDF-Typen funktionieren bis 4 MB.

## Vercel Cron

Vercel interpretiert alle Ausdrücke in `vercel.json` in UTC. Jede aktuelle Route akzeptiert den von Vercel verwendeten GET-Aufruf und zusätzlich POST für einen kontrollierten manuellen Wiederholungslauf. Beide Methoden verlangen exakt `Authorization: Bearer <CRON_SECRET>`.

| Route | Ausdruck | UTC | Verhalten in `Europe/Berlin` |
| --- | --- | --- | --- |
| `/api/cron/generate-visits` | `0 3 * * *` | täglich 03:00 | 04:00 MEZ beziehungsweise 05:00 MESZ. Ergänzt duplikatfrei geplante Einsätze für einen rollierenden 90-Tage-Horizont. |
| `/api/cron/equipment-reminders` | `0 * * * *` | stündlich zur vollen Stunde | Arbeitet stündlich; Datum und Anzeige werden in `Europe/Berlin` berechnet. Ordnet für die kommenden 90 Tage objekt-, gebäude- und saisonabhängiges Equipment zu und benachrichtigt aktive Admins sowie zugewiesene Mitarbeitende gemäß Vorlaufzeit. Bei der Zeitumstellung gilt die übliche ausgelassene beziehungsweise doppelte lokale Stunde des UTC-Plans. |
| `/api/billing/run-monthly` | `15 5 * * *` | täglich 05:15 | 06:15 MEZ beziehungsweise 07:15 MESZ. Verarbeitet idempotent den unmittelbar vorherigen Berliner Kalendermonat und wiederholt fehlgeschlagene/unvollständige Läufe innerhalb des Folgemonats sicher. |

`/api/billing/run-cycles` ist dauerhaft stillgelegt, steht nicht mehr in `vercel.json` und liefert für GET sowie POST immer HTTP `410 Gone` mit dem Code `billing_cycle_route_retired`. Die Route nicht erneut als Cron konfigurieren und nicht als Fallback verwenden.

## Monatliche, unveränderliche Rechnungen

Die reguläre Monatsabrechnung ist objektbezogen und auf Wiederholbarkeit ausgelegt:

- Pro Immobilie und Abrechnungsmonat kann die Datenbank nur eine reguläre Rechnung anlegen. Rechnungsnummer und Verarbeitungs-Claim werden atomar vergeben; parallele oder wiederholte Cron-Aufrufe erzeugen keine zweite Monatsrechnung.
- Abgerechnet wird der vorherige Kalendermonat in `Europe/Berlin`. Eine in diesem Zeitraum gültige Grundvergütung und noch offene, abrechenbare Zusatzleistungen werden als strukturierte Positionen übernommen. Eine Zusatzleistung kann nur einmal an eine Rechnungsposition gebunden werden.
- Geldbeträge werden intern als ganzzahlige Centwerte gespeichert. Aussteller-, Empfänger- und Bankdaten werden beim Erstellen als Snapshots an der Rechnung festgehalten.
- Beim Freigeben werden das private Original-PDF, dessen SHA-256-Prüfsumme und eine Prüfsumme der strukturierten Rechnungsdaten gespeichert.
- Nach der Freigabe sind Rechnungskopf, Snapshots, Beträge und Positionen unveränderlich. Zulässig bleiben nur Status-/Versandfelder wie offen, bezahlt, überfällig oder storniert. Eine Stornierung erfordert einen Grund und wird protokolliert; sie verändert das Original nicht.
- Download und erneuter Versand verwenden das gespeicherte, verifizierte Original-PDF. Es wird keine neue Datei aus aktuellen Stammdaten erzeugt.
- Fehlercode und verständliche Fehlermeldung bleiben für Admins sichtbar. Fehlende Pflichtdaten blockieren den Versand und erzeugen eine Admin-Benachrichtigung, statt eine unvollständige Rechnung zu versenden.
- Für die E-Rechnungsweiterverarbeitung steht Admins `GET /api/invoices/[id]/structured` zur Verfügung. Die versionierte JSON-Schnittstelle `hausvia.invoice.v1` liefert Aussteller, Empfänger, Zahlungsdaten, Leistungszeitraum, Positionen, Steuersummen und Gesamtbeträge in Cent sowie Integritäts-Hashes. Sie ist die dokumentierte Übergabe für einen späteren ZUGFeRD-/XRechnung-Konverter; die Anwendung erzeugt derzeit bewusst noch kein normvalidiertes XML.

Historische manuelle Entwürfe können weiterhin bearbeitet werden, solange sie nicht freigegeben und damit unveränderlich geworden sind.

### Pflichtdaten im Adminbereich

Unter `/admin/settings` müssen vor dem automatischen Rechnungslauf echte, rechtlich geprüfte Daten gepflegt werden. Für die technische Freigabe verlangt die Anwendung:

- Rechtlicher Firmenname
- vollständige Anschrift mit Straße, Hausnummer, Postleitzahl, Ort und Land
- Handelsregister und Geschäftsführung
- gültige Unternehmens-E-Mail
- Steuernummer oder Umsatzsteuer-ID
- Bankname, IBAN und BIC
- Zahlungsziel, Rechnungspräfix und Standard-Umsatzsteuersatz

Zusätzlich im Adminformular pflegen: Markenname, Telefon, Standard-Stundensatz netto sowie Absender- und Antwortadresse für Rechnungs-E-Mails. Vorbelegte Werte aus einer Migration sind keine Bestätigung ihrer rechtlichen Richtigkeit und müssen vor Produktivbetrieb geprüft werden.

Für jede abrechenbare Immobilie werden außerdem benötigt:

- Rechnungsempfänger mit Name, vollständiger Anschrift, Land und gültiger Rechnungs-E-Mail; ein Adresszusatz ist optional.
- Eine für den Leistungsmonat gültige Grundvergütung mit Netto-Betrag, Steuersatz und Gültigkeitszeitraum, sofern die Betreuung den Monat berührt.
- Korrekte Betreuungszeiträume sowie fachlich geprüfte, abrechenbare Zusatzleistungen.

## Angebote und öffentlicher Funnel

Der bestehende Angebotsprozess bleibt erhalten: Funnel-Anfragen können Kunden, Leads und Angebotsentwürfe erzeugen; Admins bearbeiten Positionen und versenden das freigegebene PDF, Kunden können Angebote im Portal digital annehmen. `/api/lead` erzeugt weiterhin das Lead-PDF, versendet es per Resend und persistiert die Anfrage bei konfiguriertem Supabase serverseitig. Dieser Angebotsprozess ist von der neuen objektbezogenen Monatsabrechnung und deren Cron-Route getrennt.

## Operative Abnahme

Nach Migration oder Deployment mindestens prüfen:

1. Admin-Bootstrap, Login, Recovery und rollenabhängige Weiterleitungen.
2. Einladung senden, erneut senden, widerrufen, ablaufen lassen und genau einmal annehmen; öffentliche Registrierung muss geschlossen bleiben.
3. Mit Kunden- und Mitarbeiterkonten versuchen, fremde Tabellenzeilen und Storage-Pfade zu lesen oder zu verändern; RLS muss den Zugriff verweigern.
4. Einsatzgenerierung, Timer/Aufgaben, Equipment-Erinnerung, Schadenmeldung, Einsatzbericht, Chat und Beschwerde jeweils mit den erlaubten Rollen testen.
5. Alle drei Cron-Routen ohne beziehungsweise mit falschem Bearer Header auf `401` prüfen; `/api/billing/run-cycles` muss `410` liefern.
6. Monatslauf zweimal für denselben Zeitraum auslösen und bestätigen, dass nur eine Rechnung existiert und Zusatzleistungen nicht doppelt abgerechnet werden.
7. Originalrechnung herunterladen, erneut senden, als bezahlt markieren und mit Begründung stornieren. Direkte Inhalts-/Positionsänderung sowie Überschreiben/Löschen des Original-PDFs müssen scheitern.

## Hinweise

- Impressum, Datenschutz, AGB, Rechnungsangaben und weitere Pflichtinformationen müssen vor Veröffentlichung abschließend rechtlich und steuerlich geprüft werden.
- Sitemap und Robots werden über `src/app/sitemap.ts` und `src/app/robots.ts` erzeugt.
- Weiterführende Referenzen: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase Storage-Zugriff](https://supabase.com/docs/guides/storage/security/access-control) und [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs).
