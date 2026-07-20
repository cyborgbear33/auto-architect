/**
 * RFC 4180 CSV helpers for server-side export endpoints.
 * Mirrors garden-architect's web-ui csv.ts so quoting stays consistent.
 */

export interface CsvColumn<T> {
  key: keyof T | ((row: T) => string);
  header: string;
}

function escapeCsvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const cell = (row: T, col: CsvColumn<T>): string => {
    const raw = typeof col.key === "function" ? col.key(row) : (row[col.key] ?? "");
    return escapeCsvField(String(raw ?? ""));
  };
  const header = columns.map((c) => escapeCsvField(c.header)).join(",");
  if (rows.length === 0) return `${header}\n`;
  const body = rows.map((row) => columns.map((c) => cell(row, c)).join(",")).join("\n");
  return `${header}\n${body}\n`;
}
