import { PageHeader, Panel } from "@/components/portal/PortalUI";

export default function AdminSettingsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Portal-Einstellungen"
        text="Technische Hinweise für Supabase Auth, Redirect URLs, Storage und Einladungen."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Supabase Redirect URLs">
          <ul className="space-y-2 text-sm font-semibold leading-6 text-slate-700">
            <li>https://hausvia.de/auth/callback</li>
            <li>https://hausvia.de/login</li>
            <li>http://localhost:3000/auth/callback</li>
            <li>http://localhost:3000/login</li>
          </ul>
        </Panel>
        <Panel title="Storage Buckets">
          <ul className="space-y-2 text-sm font-semibold leading-6 text-slate-700">
            <li>offer-pdfs</li>
            <li>invoice-pdfs</li>
            <li>customer-documents</li>
            <li>project-documents</li>
            <li>shift-photos</li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
