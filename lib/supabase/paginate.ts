/**
 * Reading every row of a query, past the API's row cap.
 *
 * PostgREST answers at most `max_rows` rows per request — 1000, here and on
 * hosted Supabase — and says nothing when it cuts a result short. A race with
 * 3,000 runners would otherwise show its organizer a list of 1,000 and email
 * a cancellation to 1,000. Anything that reads "all of" a table that grows
 * with sign-ups goes through here.
 *
 * `page(from, to)` builds the query for one inclusive range. It must be
 * ordered by something unique (end with `.order("id")`), or rows can repeat
 * or go missing between pages.
 */

/** Rows per request: the API's cap, so each page is one full answer. */
export const PAGE_SIZE = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function selectAll<T>(
  page: (from: number, to: number) => Page<T>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { data: rows, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null };
  }
}

/** Split a list into runs of at most `size`, for `.in()` filters that would overflow a URL. */
export function chunk<T>(items: T[], size = 200): T[][] {
  const runs: T[][] = [];
  for (let i = 0; i < items.length; i += size) runs.push(items.slice(i, i + size));
  return runs;
}
