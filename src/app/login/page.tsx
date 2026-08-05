import type { Metadata } from "next";
import Link from "next/link";
import { Building2, ShieldCheck, Users } from "lucide-react";
import { redirectAuthenticatedUser } from "@/lib/supabase/auth";
import { loginAction } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Login | Hausvia Portal",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  await redirectAuthenticatedUser();
  const params = await searchParams;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#e8f0fb,transparent_34%),#f7f9fc] px-4 py-8 sm:px-6">
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl lg:grid lg:grid-cols-[0.95fr_1.05fr]">
          <aside className="bg-brand p-6 text-white sm:p-8 lg:p-10">
            <div className="inline-flex rounded-md bg-white p-2">
              <Logo />
            </div>
            <p className="mt-10 text-sm font-bold uppercase tracking-[0.18em] text-accent">Hausvia Portal</p>
            <p className="mt-4 max-w-sm text-3xl font-extrabold leading-tight sm:text-4xl">
              Ein zentraler Zugang für Kunden, Mitarbeiter und Admin.
            </p>
            <div className="mt-8 grid gap-3 text-sm text-white/90">
              {[
                { icon: Building2, text: "Kunden sehen Angebote, Betreuung und Rechnungen." },
                { icon: Users, text: "Mitarbeiter verwalten Einsätze, Zeiten und Material." },
                { icon: ShieldCheck, text: "Admins steuern Leads, Projekte und Freigaben." },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.text} className="flex gap-3 rounded-lg border border-white/15 bg-white/10 p-3">
                    <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                    <span className="leading-6">{item.text}</span>
                  </div>
                );
              })}
            </div>
          </aside>

          <div className="p-6 sm:p-8 lg:p-10">
            <p className="text-sm font-bold uppercase tracking-wide text-brand">Login</p>
            <h1 className="mt-2 text-3xl font-extrabold text-slate-950 sm:text-4xl">Willkommen zurück</h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-650">
              Zugang erhalten nur eingeladene Admins, Mitarbeiter und Kunden.
            </p>
            {params.error ? (
              <p className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
                Login nicht möglich. Bitte prüfen Sie E-Mail und Passwort.
              </p>
            ) : null}
            {params.status === "disabled" ? (
              <p className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
                Dieser Zugang ist deaktiviert.
              </p>
            ) : null}
            {params.status === "inactive" ? (
              <p className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                Dieser Zugang wurde noch nicht über eine gültige Einladung aktiviert.
              </p>
            ) : null}
            {params.status === "password-updated" ? (
              <p className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
                Das Passwort wurde aktualisiert. Sie können sich jetzt mit dem neuen Passwort einloggen.
              </p>
            ) : null}
            <form action={loginAction} className="mt-7 grid max-w-md gap-4">
              <label className="block">
                <span className="text-sm font-bold text-slate-800">E-Mail</span>
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="mt-2 min-h-12 w-full rounded-md border border-slate-300 bg-white px-4 py-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </label>
              <label className="block">
                <span className="flex items-center justify-between gap-4">
                  <span className="text-sm font-bold text-slate-800">Passwort</span>
                  <Link href="/forgot-password" className="text-xs font-bold text-brand hover:text-brand-dark">
                    Passwort vergessen?
                  </Link>
                </span>
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="mt-2 min-h-12 w-full rounded-md border border-slate-300 bg-white px-4 py-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </label>
              <button className="mt-2 min-h-12 rounded-md bg-brand px-5 py-3 text-sm font-extrabold text-white transition hover:bg-brand-dark">
                Einloggen
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
