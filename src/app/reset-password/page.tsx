import type { Metadata } from "next";
import Link from "next/link";
import { completePasswordResetAction } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Neues Passwort festlegen | Hausvia Portal",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <section className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <Logo />
        <p className="mt-8 text-sm font-bold uppercase tracking-wide text-brand">Hausvia Portal</p>
        <h1 className="mt-2 text-3xl font-extrabold text-slate-950">Neues Passwort festlegen</h1>

        {!user ? (
          <>
            <p className="mt-3 text-sm leading-6 text-slate-650">
              Der Passwort-Link ist abgelaufen oder konnte nicht bestätigt werden. Fordern Sie bitte einen neuen
              Reset-Link an.
            </p>
            <Link
              href="/forgot-password"
              className="mt-6 inline-flex min-h-12 items-center justify-center rounded-md bg-brand px-5 py-3 text-sm font-extrabold text-white transition hover:bg-brand-dark"
            >
              Neuen Reset-Link anfordern
            </Link>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm leading-6 text-slate-650">
              Legen Sie jetzt ein neues Passwort für Ihren Portal-Zugang fest. Danach werden Sie automatisch in den
              passenden Bereich weitergeleitet.
            </p>

            {params.error ? (
              <p className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
                Das Passwort konnte nicht gespeichert werden. Bitte verwenden Sie mindestens 8 Zeichen und geben Sie
                beide Felder identisch ein.
              </p>
            ) : null}

            <form action={completePasswordResetAction} className="mt-6 grid gap-4">
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
                Passwort speichern
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
