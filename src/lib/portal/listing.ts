export const PORTAL_LIST_PAGE_SIZE = 12;

export function parseListPage(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function paginateItems<T>(
  items: T[],
  requestedPage: unknown,
  pageSize = PORTAL_LIST_PAGE_SIZE,
) {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(items.length / safePageSize));
  const page = Math.min(parseListPage(requestedPage), totalPages);
  const start = (page - 1) * safePageSize;
  return {
    items: items.slice(start, start + safePageSize),
    page,
    totalPages,
    totalItems: items.length,
  };
}
