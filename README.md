# Hausvia Website

Professionelle Next.js-Website für Hausvia: Hausmeisterservice, Objektbetreuung und Gebäudeservice in Hannover und Umgebung.

## Entwicklung

```bash
npm run dev
```

## Prüfung

```bash
npm run lint
npm run build
```

## Hinweise

- Impressum, Datenschutz, AGB und Pflichtangaben müssen vor Veröffentlichung final rechtlich geprüft werden.
- `/api/lead` nimmt Funnel- und Kontaktanfragen entgegen, erstellt ein PDF und versendet es per Resend an den Kunden sowie intern an Hausvia.
- Für den Mailversand werden `RESEND_API_KEY`, `RESEND_FROM_EMAIL` und `HAUSVIA_INTERNAL_LEAD_EMAIL` benötigt. Siehe `.env.example`.
- Sitemap und Robots werden über `src/app/sitemap.ts` und `src/app/robots.ts` erzeugt.
