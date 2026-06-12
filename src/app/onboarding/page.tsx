import type { Metadata } from "next";
import { completeOnboardingAction } from "@/app/actions/auth";
import { getCurrentProfile, portalPathForRole } from "@/lib/supabase/auth";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Passwort festlegen | Hausvia Portal",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.onboarding_completed) redirect(portalPathForRole(profile.role));
  const params = await searchParams;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <section className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <Logo />
        <p className="mt-8 text-sm font-bold uppercase tracking-wide text-brand">Einladung aktivieren</p>
        <h1 className="mt-2 text-3xl font-extrabold text-slate-950">Passwort festlegen</h1>
        <p className="mt-3 text-sm leading-6 text-slate-650">
          Willkommen, {profile.full_name || profile.email}. Legen Sie jetzt ein Passwort für Ihr Hausvia Portal fest.
        </p>
        {params.error ? (
          <p className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
            Bitte verwenden Sie mindestens 8 Zeichen und wiederholen Sie das Passwort korrekt.
          </p>
        ) : null}
        <form action={completeOnboardingAction} className="mt-6 grid gap-4">
          <label className="block">
            <span className="text-sm font-bold text-slate-800">Neues Passwort</span>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-2 min-h-12 w-full rounded-md border border-slate-300 px-4 py-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-800">Passwort wiederholen</span>
            <input
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-2 min-h-12 w-full rounded-md border border-slate-300 px-4 py-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </label>
          <button className="mt-2 min-h-12 rounded-md bg-brand px-5 py-3 text-sm font-extrabold text-white transition hover:bg-brand-dark">
            Passwort speichern und Portal öffnen
          </button>
        </form>
      </section>
    </main>
  );
}
