/**
 * Building CSV files that are safe to open in a spreadsheet.
 *
 * Excel, Sheets and Numbers treat a cell that starts with `=`, `+`, `-` or
 * `@` (or a tab or carriage return before one) as a formula, quoted or not.
 * Runners type their own name, club and address, so a sign-up as
 * `=HYPERLINK("http://evil.example","Click")` would run on the organizer's
 * machine when they open the export. Such cells get a leading `'`, which
 * spreadsheets read as "this is text".
 *
 * Plain numbers and phone numbers (`-5`, `+1 (787) 555-0103`) cannot form a
 * formula and are left as they are, so they don't show a stray apostrophe.
 */

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?[\d\s().-]+$/;

/** One cell, quoted, with a would-be formula neutralised. */
export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (FORMULA_START.test(text) && !PLAIN_NUMBER.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Rows of cells as CSV text, one line per row. */
export function toCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}
