import { describe, expect, it } from "vitest";
import { chunk, PAGE_SIZE, selectAll } from "./paginate";

/** A table of `count` rows behind a range query, as PostgREST pages it. */
function table(count: number) {
  const rows = Array.from({ length: count }, (_, i) => ({ id: i }));
  const calls: [number, number][] = [];
  const page = (from: number, to: number) => {
    calls.push([from, to]);
    return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
  };
  return { page, calls };
}

describe("selectAll", () => {
  it("reads past the row cap", async () => {
    const { page, calls } = table(2 * PAGE_SIZE + 37);
    const { data, error } = await selectAll(page);
    expect(error).toBeNull();
    expect(data).toHaveLength(2 * PAGE_SIZE + 37);
    expect(calls).toEqual([
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, 2 * PAGE_SIZE - 1],
      [2 * PAGE_SIZE, 3 * PAGE_SIZE - 1],
    ]);
  });

  it("asks once more when the last page is exactly full", async () => {
    const { page, calls } = table(PAGE_SIZE);
    const { data } = await selectAll(page);
    expect(data).toHaveLength(PAGE_SIZE);
    expect(calls).toHaveLength(2);
  });

  it("stops at the first error and reports it", async () => {
    let n = 0;
    const { data, error } = await selectAll(() =>
      Promise.resolve(
        n++ === 0
          ? { data: Array.from({ length: PAGE_SIZE }, (_, i) => i), error: null }
          : { data: null, error: { message: "boom" } },
      ),
    );
    expect(error).toEqual({ message: "boom" });
    expect(data).toHaveLength(PAGE_SIZE);
  });
});

describe("chunk", () => {
  it("splits into runs of the given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });
});
