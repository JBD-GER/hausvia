# Hausvia Website und Portal

Next.js App-Router-Projekt für Hausvia: öffentliche SEO-Website, Kostencheck-Funnel, Adminbereich, Mitarbeiterportal und Kundenportal.

## Entwicklung

```bash
npm install
npm run dev
```

## Prüfung

```bash
npm run lint
npm run build
```

## Env Vars

```env
RESEND_API_KEY=
RESEND_FROM_EMAIL=Hausvia <info@hausvia.de>
HAUSVIA_INTERNAL_LEAD_EMAIL=c.pfad@flaaq.com

NEXT_PUBLIC_SITE_URL=https://hausvia.de
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=

NEXT_PUBLIC_GOOGLE_ADS_ID=AW-18131829931
NEXT_PUBLIC_GOOGLE_ADS_LEAD_CONVERSION_LABEL=p6rgCLT7yr0cEKuJ98VD
```

Wichtig: `SUPABASE_SERVICE_ROLE_KEY` darf niemals im Browser landen. Er wird nur in Server Actions, API Routes und serverseitiger Funnel-Persistenz genutzt.

`CRON_SECRET` schützt die automatische Rechnungserstellung unter `/api/billing/run-cycles`. In Vercel als Environment Variable setzen; Vercel Cron sendet den Wert als Bearer Token an die Route.

## Supabase Setup

1. Neues Supabase-Projekt erstellen.
2. Migration `supabase/migrations/20260612090000_core_portal.sql` ausführen.
3. Storage Buckets werden durch die Migration vorbereitet:
   `offer-pdfs`, `invoice-pdfs`, `customer-documents`, `project-documents`, `shift-photos`.
4. Auth Provider `Email` aktivieren.
5. Site URL setzen: `https://hausvia.de`.
6. Redirect URLs hinterlegen:
   `https://hausvia.de/auth/callback`
   `https://hausvia.de/auth/callback?next=/reset-password`
   `https://hausvia.de/login`
   `https://hausvia.de/forgot-password`
   `https://hausvia.de/reset-password`
   `http://localhost:3000/auth/callback`
   `http://localhost:3000/auth/callback?next=/reset-password`
   `http://localhost:3000/login`
   `http://localhost:3000/forgot-password`
   `http://localhost:3000/reset-password`

## Ersten Admin anlegen

1. In Supabase unter **Authentication > Users** einen User für `info@hausvia.de` anlegen.
2. Entweder direkt im Supabase-Dashboard ein temporäres Passwort setzen oder später über `/forgot-password` einen Reset-Link anfordern.
3. Die echte User-ID aus Supabase kopieren. Wichtig: `AUTH_USER_UUID` ist nur ein Platzhalter und muss durch die UUID aus `auth.users` ersetzt werden.

Die echte User-ID kann auch per SQL geprüft werden:

```sql
select id, email
from auth.users
where email = 'info@hausvia.de';
```

Danach den Admin-Profil-Datensatz mit der echten UUID anlegen:

```sql
insert into public.user_profiles (id, role, email, full_name, status, onboarding_completed)
values ('00000000-0000-0000-0000-000000000000', 'admin', 'info@hausvia.de', 'Hausvia Admin', 'active', true)
on conflict (id) do update set
  role = 'admin',
  email = excluded.email,
  full_name = excluded.full_name,
  status = 'active',
  onboarding_completed = true,
  updated_at = now();
```

`00000000-0000-0000-0000-000000000000` muss dabei durch die echte Supabase-Auth-UUID ersetzt werden.

Danach kann sich der Admin unter `/login` anmelden. Falls kein Passwort bekannt ist: `/forgot-password` öffnen, `info@hausvia.de` eintragen, Reset-Mail nutzen und ein neues Passwort setzen.

## Passwort vergessen / Recovery

Die Website enthält einen Passwort-vergessen-Flow:

- `/forgot-password`: Reset-Link per E-Mail anfordern.
- `/auth/callback?next=/reset-password`: Supabase bestätigt den Recovery-Link und baut die Session auf.
- `/reset-password`: neues Passwort festlegen.
- Danach erfolgt die Weiterleitung je nach Rolle nach `/admin`, `/app` oder `/portal`.

Für Supabase Recovery sollte als Redirect URL verwendet werden:

```txt
https://hausvia.de/auth/callback?next=/reset-password
```

Lokal:

```txt
http://localhost:3000/auth/callback?next=/reset-password
```

## Supabase Invite-Mail-Template

Betreff:

```txt
Ihre Einladung zum Hausvia Portal
```

HTML:

```html
<div style="font-family:Arial,sans-serif;background:#f7f9fc;padding:24px;color:#172033">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dfe7f2;border-radius:12px;overflow:hidden">
    <div style="background:#082b61;color:#ffffff;padding:24px 28px">
      <div style="font-size:24px;font-weight:800">Hausvia</div>
      <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#d8e4f5">Hausmeisterservice</div>
    </div>
    <div style="border-top:6px solid #f5c542;padding:28px">
      <h1 style="font-size:24px;line-height:1.25;margin:0 0 14px">Ihre Einladung zum Hausvia Portal</h1>
      <p style="font-size:15px;line-height:1.65;margin:0 0 18px">
        Sie wurden zum Hausvia Portal eingeladen. Über den folgenden Button aktivieren Sie Ihr Konto und legen ein eigenes Passwort fest.
      </p>
      <p style="margin:26px 0">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#082b61;color:#ffffff;text-decoration:none;font-weight:800;border-radius:8px;padding:14px 20px">
          Konto aktivieren
        </a>
      </p>
      <p style="font-size:14px;line-height:1.6;color:#526071;margin:0">
        Falls Sie diese Einladung nicht erwartet haben, ignorieren Sie diese E-Mail bitte.
      </p>
    </div>
  </div>
</div>
```

## Supabase Passwort-Reset-Mail-Template

Betreff:

```txt
Passwort für Ihr Hausvia Portal zurücksetzen
```

HTML:

```html
<div style="font-family:Arial,sans-serif;background:#f7f9fc;padding:24px;color:#172033">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dfe7f2;border-radius:12px;overflow:hidden">
    <div style="background:#082b61;color:#ffffff;padding:24px 28px">
      <div style="font-size:24px;font-weight:800">Hausvia</div>
      <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#d8e4f5">Hausmeisterservice</div>
    </div>
    <div style="border-top:6px solid #f5c542;padding:28px">
      <h1 style="font-size:24px;line-height:1.25;margin:0 0 14px">Passwort zurücksetzen</h1>
      <p style="font-size:15px;line-height:1.65;margin:0 0 18px">
        Sie haben eine Zurücksetzung Ihres Passworts für das Hausvia Portal angefordert. Über den folgenden Button legen Sie ein neues Passwort fest.
      </p>
      <p style="margin:26px 0">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#082b61;color:#ffffff;text-decoration:none;font-weight:800;border-radius:8px;padding:14px 20px">
          Neues Passwort festlegen
        </a>
      </p>
      <p style="font-size:14px;line-height:1.6;color:#526071;margin:0">
        Falls Sie diese Anfrage nicht gestellt haben, ignorieren Sie diese E-Mail bitte.
      </p>
    </div>
  </div>
</div>
```

## Portal-Rollen

- Admin: Zugriff auf Leads, Kunden, Mitarbeiter, Projekte, Tätigkeiten, Angebote, Rechnungen, Schichten, Material und Dokumente.
- Mitarbeiter: sieht nur zugewiesene Kunden/Projekte, Tätigkeiten, eigene Schichten und eigene Materialanforderungen. Keine Preise, Angebote oder Rechnungen.
- Kunde: sieht nur eigene Anfrage, freigegebene Angebote, eigene Betreuung, freigegebene Einsätze und eigene Rechnungen.

## RLS-Hinweise

Die Migration aktiviert RLS auf allen Portal-Tabellen. Admin-Zugriffe laufen über Profilrolle `admin`. Mitarbeiterzugriffe werden über `project_assignments` begrenzt. Kundenzugriffe laufen über `customers.portal_user_id`.

Public Funnel Submits werden serverseitig über den Service Role Client gespeichert. Der Browser erhält keinen Service Role Key.

## Angebote, Rechnungen und Rechnungszyklen

- Funnel-Anfragen erzeugen automatisch Kunde, Lead und einen Angebotsentwurf.
- Der Angebotsentwurf übernimmt die ausgewählten Funnel-Leistungen als einzelne editierbare Positionen.
- Admins können im Bereich `/admin/offers` Positionen ändern, weitere Positionen hinzufügen und Netto-Preise pflegen.
- 19% Umsatzsteuer werden automatisch auf die Netto-Summe berechnet.
- Ein Angebot bleibt zunächst `draft` und ist nicht im Kundenportal sichtbar.
- Über „An Kunden senden“ wird ein PDF erzeugt, per Resend an den Kunden geschickt und im Kundenportal sichtbar gemacht.
- Aus einem Angebot kann ein Rechnungsentwurf erstellt werden.
- Für regelmäßige Betreuung kann ein Rechnungszyklus angelegt werden. Die Route `/api/billing/run-cycles` prüft täglich fällige Zyklen.
- Die Cron-Konfiguration liegt in `vercel.json` und ruft die Route täglich um 06:00 UTC auf.
- Bei aktivierter Vorabzahlung wird die Rechnung für den kommenden Leistungsmonat mit Hinweistext erstellt.
- Freigegebene/gesendete Rechnungen erscheinen im Kundenportal mit dem Status „Erstellt“ und sind als PDF abrufbar.

Empfohlener operativer Ablauf:

1. Funnel-Anfrage kommt rein und erzeugt einen Angebotsentwurf.
2. Admin prüft und bearbeitet Positionen, Preise und Abschlusspassage.
3. Admin sendet das Angebot an den Kunden.
4. Kunde nimmt das Angebot im Portal digital an.
5. Das zugehörige Projekt wird aktiviert. Falls noch kein Projekt am Angebot hängt, wird automatisch ein aktives Projekt aus Kunde, Lead und Angebotspositionen angelegt.
6. Admin weist anschließend den passenden Mitarbeiter zu.
7. Zeittracking, Tätigkeiten, Materialanforderungen und Abrechnung laufen über das Projekt.

## Testplan

1. Admin kann sich einloggen.
2. Admin kann Mitarbeiter anlegen.
3. Mitarbeiter bekommt Einladung.
4. Mitarbeiter setzt Passwort.
5. Mitarbeiter landet in `/app`.
6. Mitarbeiter sieht keine Preise, Angebote oder Rechnungen.
7. Funnel erstellt Lead, Kunde, Projekt und Tätigkeiten.
8. Kunde bekommt Einladung.
9. Kunde setzt Passwort.
10. Kunde landet in `/portal`.
11. Kunde sieht Anfrage.
12. Admin erstellt Angebot.
13. Kunde sieht Angebot.
14. Kunde nimmt Angebot mit Unterschrift an.
15. Admin sieht angenommene Angebote.
16. Kunde sieht Betreuung.
17. Mitarbeiter wird Projekt zugewiesen.
18. Mitarbeiter sieht Kunde und Projekt.
19. Mitarbeiter erfasst Schicht.
20. Pause wird automatisch berechnet: über 6 Stunden 30 Minuten, über 9 Stunden 45 Minuten.
21. Admin gibt Schicht frei.
22. Kunde sieht freigegebenen Einsatz.
23. Mitarbeiter erstellt Materialanforderung.
24. Admin bearbeitet Materialanforderung.
25. Admin erstellt Rechnung.
26. Kunde sieht Rechnung.

## Hinweise

- Impressum, Datenschutz, AGB und Pflichtangaben müssen vor Veröffentlichung final rechtlich geprüft werden.
- `/api/lead` erstellt weiterhin das PDF und versendet es per Resend; zusätzlich wird die Anfrage in Supabase gespeichert, wenn Supabase Env Vars gesetzt sind.
- Sitemap und Robots werden über `src/app/sitemap.ts` und `src/app/robots.ts` erzeugt.
