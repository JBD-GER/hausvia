import Link from "next/link";

function hrefFor(
  pathname: string,
  query: Record<string, string>,
  page: number,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value && key !== "page") params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return suffix ? `${pathname}?${suffix}` : pathname;
}

export function PaginationNav({
  pathname,
  query,
  page,
  totalPages,
  totalItems,
}: {
  pathname: string;
  query: Record<string, string>;
  page: number;
  totalPages: number;
  totalItems: number;
}) {
  if (totalPages <= 1) return null;
  const linkClass =
    "inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-extrabold text-slate-800 hover:border-brand hover:text-brand";
  return (
    <nav
      className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4"
      aria-label="Seitennavigation"
    >
      <p className="text-sm font-semibold text-slate-600">
        Seite {page} von {totalPages} · {totalItems} Einträge
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={hrefFor(pathname, query, page - 1)} className={linkClass}>
            Zurück
          </Link>
        ) : null}
        {page < totalPages ? (
          <Link href={hrefFor(pathname, query, page + 1)} className={linkClass}>
            Weiter
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
