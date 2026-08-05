import type { Metadata } from "next";
import { AlertTriangle, Camera, CheckCircle2, LockKeyhole } from "lucide-react";
import { submitPublicDamageAction } from "@/app/actions/portalPublic";
import { Logo } from "@/components/Logo";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sha256 } from "@/lib/portal/security";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Schaden melden | Hausvia",
  description: "Sichere Schadensmeldung für ein von Hausvia betreutes Gebäude.",
  robots: { index: false, follow: false, nocache: true },
};

export default async function PublicDamagePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const admin = createSupabaseAdminClient();
  const { data: building } = await admin
    .from("buildings")
    .select("id,label,formatted_address,status,properties(name,status)")
    .eq("qr_token_hash", sha256(token))
    .eq("status", "active")
    .maybeSingle();
  const property = Array.isArray(building?.properties) ? building.properties[0] : building?.properties;

  if (!building || !property || property.status !== "active") {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-xl shadow-slate-900/5">
          <AlertTriangle className="mx-auto text-amber-600" size={42} aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-black text-slate-950">Dieser Meldelink ist nicht gültig</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">Bitte scannen Sie den aktuellen QR-Code am Gebäude oder wenden Sie sich an Hausvia.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#e8f0fb,transparent_52%)] px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-5 flex justify-center"><Logo href="/" /></div>
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10">
          <div className="bg-brand px-6 py-7 text-white sm:px-8">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Gebäudemeldung</p>
            <h1 className="mt-2 text-3xl font-black">Schaden sicher melden</h1>
            <p className="mt-3 text-sm leading-6 text-blue-100">{building.label ? `${building.label} · ` : ""}{building.formatted_address}</p>
          </div>
          <form action={submitPublicDamageAction} className="grid gap-5 p-6 sm:p-8" encType="multipart/form-data">
            <input type="hidden" name="token" value={token} />
            {query.error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{query.error}</p> : null}
            <label className="grid gap-2 text-sm font-extrabold text-slate-800">
              Titel <span className="font-normal text-slate-500">Was ist passiert?</span>
              <input name="title" required maxLength={180} autoComplete="off" className="min-h-12 rounded-xl border border-slate-300 px-4 outline-none focus:border-brand focus:ring-4 focus:ring-brand/10" placeholder="z. B. Lampe im Treppenhaus defekt" />
            </label>
            <label className="grid gap-2 text-sm font-extrabold text-slate-800">
              Beschreibung
              <textarea name="description" required maxLength={5000} rows={6} className="rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-brand focus:ring-4 focus:ring-brand/10" placeholder="Bitte beschreiben Sie den Schaden und den genauen Ort." />
            </label>
            <label className="grid cursor-pointer gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-extrabold text-slate-800">
              <span className="flex items-center gap-2"><Camera size={20} aria-hidden="true" /> Foto hinzufügen <span className="font-normal text-slate-500">(optional)</span></span>
              <input name="image" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="text-sm font-normal file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-2 file:font-bold file:text-white" />
              <span className="text-xs font-normal text-slate-500">JPG, PNG, WebP oder HEIC · maximal 4 MB</span>
            </label>
            <button className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-brand px-5 font-black text-white shadow-lg shadow-brand/20 transition hover:bg-brand-dark focus:outline-none focus:ring-4 focus:ring-brand/25">
              <CheckCircle2 size={20} aria-hidden="true" /> Schadensmeldung absenden
            </button>
            <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><LockKeyhole className="mt-0.5 shrink-0" size={15} aria-hidden="true" /> Ihre Meldung wird verschlüsselt übertragen. Über diesen Link sind keine anderen Meldungen oder internen Gebäudedaten abrufbar.</p>
          </form>
        </section>
      </div>
    </main>
  );
}
