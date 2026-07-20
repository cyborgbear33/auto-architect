/** Browser blob download helpers for JSON / CSV exports. */

export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(filename: string, data: unknown): void {
  downloadText(filename, `${JSON.stringify(data, null, 2)}\n`, "application/json;charset=utf-8");
}

export function downloadCsv(filename: string, csvText: string): void {
  downloadText(filename, csvText, "text/csv;charset=utf-8");
}

export function safeFilename(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]+/g, "_");
}
