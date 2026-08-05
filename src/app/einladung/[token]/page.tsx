import type { Metadata } from "next";
import Link from "next/link";
import { acceptInvitationAction } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";
import { getInvitationPreview } from "@/lib/invitations";
import {
  CUSTOMER_CATEGORY_LABELS,
  EMPLOYEE_CATEGORY_LABELS,
  formatGermanDate,
} from "@/lib/portal/core";

export const metadata: Metadata = {
  title: "Einladung annehmen | Hausvia Portal",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type InvitationPageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
};

function categoryLabel(role: "customer" | "employee", category: string | null) {
  if (!category) return role === "customer" ? "Kunde" : "Mitarbeiter";
  if (role === "customer") {
    return CUSTOMER_CATEGORY_LABELS[category as keyof typeof CUSTOMER_CATEGORY_LABELS] ?? category;
  }
  return EMPLOYEE_CATEGORY_LABELS[category as keyof typeof EMPLOYEE_CATEGORY_LABELS] ?? category;
}

function messageForState(state: "expired" | "accepted" | "revoked" | "invalid") {
  if (state === "expired") {
    return {
      title: "Einladung abgelaufen",
      text: "Diese Einladung ist nicht mehr gültig. Bitte wenden Sie sich an Hausvia, damit eine neue Einladung versendet wird.",
    };
  }
  if (state === "accepted") {
    return {
      title: "Einladung bereits angenommen",
      text: "Dieser Einladungslink wurde bereits verwendet. Sie können sich mit Ihren Zugangsdaten im Portal anmelden.",
    };
  }
  if (state === "revoked") {
    return {
      title: "Einladung widerrufen",
      text: "Diese Einladung wurde widerrufen. Bitte wenden Sie sich bei Rückfragen direkt an Hausvia.",
    };
  }
  return {
    title: "Einladung nicht gültig",
    text: "Der Link ist unvollständig oder wurde durch eine neuere Einladung ersetzt. Bitte prüfen Sie die zuletzt erhaltene E-Mail.",
  };
}

export default async function InvitationPage({ params, searchParams }: InvitationPageProps) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const preview = await getInvitationPreview(token);

  if (preview.state !== "ready") {
    const message = messageForState(preview.state);
    return (
      <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,#e7eef9,transparent_34%),#f7f9fc] px-4 py-10 sm:px-6">
        <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-9">
          <Logo href="/login" />
          <p className="mt-9 text-sm font-bold uppercase tracking-[0.14em] text-brand">Hausvia Portal</p>
          <h1 className="mt-2 text-3xl font-extrabold text-slate-950">{message.title}</h1>
          <p className="mt-4 text-sm leading-6 text-slate-650">{message.text}</p>
          <Link
            href="/login"
            className="mt-7 inline-flex min-h-12 items-center justify-center rounded-md bg-brand px-5 py-3 text-sm font-extrabold text-white transition hover:bg-brand-dark"
          >
            Zum Portal-Login
          </Link>
        </section>
      </main>
    );
  }

  const errorMessage =
    query.error === "password"
      ? "Bitte verwenden Sie 8 bis 128 Zeichen und geben Sie das Passwort zweimal identisch ein."
      : query.error
        ? "Die Einladung konnte nicht aktiviert werden. Bitte laden Sie die Seite neu oder fordern Sie eine neue Einladung an."
        : null;

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,#e7eef9,transparent_34%),#f7f9fc] px-4 py-8 sm:px-6">
      <section className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-200 bg-slate-50 p-6 sm:p-8">
          <Logo href="/login" />
          <p className="mt-8 text-sm font-bold uppercase tracking-[0.14em] text-brand">Persönliche Einladung</p>
          <h1 className="mt-2 text-3xl font-extrabold text-slate-950 sm:text-4xl">Willkommen bei Hausvia</h1>
          <p className="mt-3 max-w-lg text-sm leading-6 text-slate-650">
            Legen Sie jetzt Ihr persönliches Passwort fest. Damit nehmen Sie die Einladung an und öffnen direkt Ihren Portalbereich.
          </p>
        </div>

        <div className="p-6 sm:p-8">
          <dl className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="font-bold text-slate-500">E-Mail-Adresse</dt>
              <dd className="mt-1 break-all font-extrabold text-slate-950">{preview.email}</dd>
            </div>
            <div>
              <dt className="font-bold text-slate-500">Zugang</dt>
              <dd className="mt-1 font-extrabold text-slate-950">{preview.role === "customer" ? "Kundenportal" : "Mitarbeiterportal"}</dd>
            </div>
            <div>
              <dt className="font-bold text-slate-500">Kategorie</dt>
              <dd className="mt-1 font-extrabold text-slate-950">{categoryLabel(preview.role, preview.category)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-bold text-slate-500">Gültig bis</dt>
              <dd className="mt-1 font-semibold text-slate-800">{formatGermanDate(preview.expiresAt, { hour: "2-digit", minute: "2-digit" })}</dd>
            </div>
          </dl>

          {errorMessage ? (
            <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-800" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <form action={acceptInvitationAction} className="mt-6 grid gap-4">
            <input type="hidden" name="token" value={token} />
            <label className="block">
              <span className="text-sm font-bold text-slate-800">Passwort</span>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                className="mt-2 min-h-12 w-full rounded-md border border-slate-300 bg-white px-4 py-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-slate-800">Passwort wiederholen</span>
              <input
                name="confirmPassword"
                type="password"
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                className="mt-2 min-h-12 w-full rounded-md border border-slate-300 bg-white px-4 py-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </label>
            <button className="mt-2 min-h-12 rounded-md bg-brand px-5 py-3 text-sm font-extrabold text-white transition hover:bg-brand-dark">
              Einladung annehmen und Portal öffnen
            </button>
          </form>
          <p className="mt-5 text-xs leading-5 text-slate-500">
            Der Link kann nur einmal verwendet werden. Mit der Annahme wird Ihr persönlicher Portalzugang aktiviert.
          </p>
        </div>
      </section>
    </main>
  );
}
