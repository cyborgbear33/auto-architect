import type { ReactNode } from "react";

/**
 * Lightweight markdown renderer for Guide / curriculum pages.
 * Mirrors the API print converter’s subset (headings, lists, tables, code).
 */
export function MarkdownBody({ markdown }: { markdown: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-slate-700">{renderBlocks(markdown)}</div>
  );
}

function renderBlocks(markdown: string): ReactNode[] {
  const lines = markdown.split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (line.startsWith("```")) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        code.push(lines[i] ?? "");
        i += 1;
      }
      i += 1;
      out.push(
        <pre
          key={key++}
          className="overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800"
        >
          {code.join("\n")}
        </pre>,
      );
      continue;
    }

    if (line.startsWith("|") && lines[i + 1]?.match(/^\|?\s*[-:| ]+\s*\|/)) {
      const rows: string[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith("|")) {
        rows.push(lines[i] ?? "");
        i += 1;
      }
      out.push(<MdTable key={key++} rows={rows} />);
      continue;
    }

    if (line.startsWith("### ")) {
      out.push(
        <h4 key={key++} className="pt-2 text-sm font-semibold text-slate-900">
          {inline(line.slice(4))}
        </h4>,
      );
      i += 1;
      continue;
    }

    if (line === "---") {
      out.push(<hr key={key++} className="my-3 border-slate-200" />);
      i += 1;
      continue;
    }

    if (line.startsWith("> ")) {
      out.push(
        <blockquote
          key={key++}
          className="border-l-2 border-sky-300 bg-sky-50/60 px-3 py-2 text-slate-700"
        >
          {inline(line.slice(2))}
        </blockquote>,
      );
      i += 1;
      continue;
    }

    if (line.startsWith("- ") || /^\d+\.\s+/.test(line)) {
      const items: { id: string; ordered: boolean; text: string }[] = [];
      const ordered = /^\d+\.\s+/.test(line);
      while (i < lines.length) {
        const l = lines[i] ?? "";
        if (ordered && /^\d+\.\s+/.test(l)) {
          items.push({ id: `L${i}`, ordered: true, text: l.replace(/^\d+\.\s+/, "") });
          i += 1;
        } else if (!ordered && l.startsWith("- ")) {
          items.push({ id: `L${i}`, ordered: false, text: l.slice(2) });
          i += 1;
        } else if (!ordered && l.startsWith("  - ")) {
          items.push({ id: `L${i}`, ordered: false, text: l.slice(4) });
          i += 1;
        } else break;
      }
      const ListTag = ordered ? "ol" : "ul";
      out.push(
        <ListTag
          key={key++}
          className={`my-1 space-y-1 pl-5 ${ordered ? "list-decimal" : "list-disc"}`}
        >
          {items.map((item) => (
            <li key={item.id}>{inline(item.text)}</li>
          ))}
        </ListTag>,
      );
      continue;
    }

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    if (line.startsWith("_") && line.endsWith("_") && line.length > 2) {
      out.push(
        <p key={key++} className="text-xs italic text-slate-500">
          {inline(line.slice(1, -1))}
        </p>,
      );
      i += 1;
      continue;
    }

    out.push(
      <p key={key++} className="text-slate-700">
        {inline(line)}
      </p>,
    );
    i += 1;
  }

  return out;
}

function MdTable({ rows }: { rows: string[] }) {
  const cells = (row: string) =>
    row
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
  const body = rows.filter((r) => !/^\|?\s*[-:| ]+\s*\|/.test(r));
  const [header, ...rest] = body;
  if (!header) return null;
  return (
    <div className="my-2 overflow-x-auto rounded-md border border-slate-200">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            {cells(header).map((c) => (
              <th key={c} className="px-3 py-2 font-medium">
                {inline(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rest.map((r) => (
            <tr key={r} className="border-t border-slate-100">
              {cells(r).map((c, j) => {
                const col = cells(header)[j] ?? `col-${c}`;
                return (
                  <td key={`${col}:${c}`} className="px-3 py-2 text-slate-700">
                    {inline(c)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function inline(text: string): ReactNode {
  // Split on `code`, **bold**, in that order via a simple tokenizer.
  const parts: ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  let k = 0;
  let m = re.exec(text);
  while (m !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("`")) {
      parts.push(
        <code key={k++} className="rounded bg-slate-100 px-1 font-mono text-[12px] text-slate-800">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      parts.push(
        <strong key={k++} className="font-semibold text-slate-900">
          {token.slice(2, -2)}
        </strong>,
      );
    }
    last = m.index + token.length;
    m = re.exec(text);
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 ? parts[0] : parts;
}
