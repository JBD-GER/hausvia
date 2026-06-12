import type { Metadata } from "next";
import Link from "next/link";
import { requestPasswordResetAction } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Passwort vergessen | Hausvia Portal",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <section className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <Logo />
        <p className="mt-8 text-sm font-bold uppercase tracking-wide text-brand">Hausvia Portal</p>
        <h1 className="mt-2 text-3xl font-extrabold text-slate-950">Passwort zurücksetzen</h1>
        <p className="mt-3 text-sm leading-6 text-slate-650">
          Geben Sie die E-Mail-Adresse Ihres Portal-Zugangs ein. Wenn der Zugang vorhanden ist, erhalten Sie einen
          Link zum Festlegen eines neuen Passworts.
        </p>

        {params.status === "sent" ? (
          <p className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
            Die E-Mail wurde vorbereitet. Bitte prüfen Sie Ihr Postfach und bei Bedarf auch den Spam-Ordner.
          </p>
        ) : null}

        {params.error ? (
          <p className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
            Der Reset-Link konnte gerade nicht angefordert werden. Bitte prüfen Sie die E-Mail-Adresse oder versuchen
            Sie es später erneut.
          </p>
        ) : null}

        <form action={requestPasswordResetAction} className="mt-6 grid gap-4">
          <label className="block">
            <span className="text-sm font-bold text-slate-800">E-Mail</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-2 min-h-12 w-full rounded-md border border-slate-300 px-4 py-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </label>
          <button className="mt-2 min-h-12 rounded-md bg-brand px-5 py-3 text-sm font-extrabold text-white transition hover:bg-brand-dark">
            Reset-Link anfordern
          </button>
        </form>

        <Link href="/login" className="mt-6 inline-flex text-sm font-bold text-brand hover:text-brand-dark">
          Zurück zum Login
        </Link>
      </section>
    </main>
  );
}
