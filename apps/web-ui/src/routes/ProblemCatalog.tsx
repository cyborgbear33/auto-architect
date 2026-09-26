import {
  listProblemCatalog,
  type ProblemCatalogLink,
  type ProblemCatalogRow,
  problemCatalogCategories,
  problemLookupPrefill,
} from "@auto/ontology";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, useSelectedVehicleId } from "../components/Layout.tsx";
import { api, queryKeys } from "../lib/api.ts";
import { useAppSelector } from "../store/index.ts";

const FAMILY_LABELS: Record<string, string> = {
  "fca-tigershark-2.4": "FCA Tigershark 2.4",
  "gm-vortec-6.0": "GM Vortec 6.0",
};

function linkText(link: ProblemCatalogLink): string {
  return link.band ? `${link.label} (${link.band})` : link.label;
}

type SortKey = "name" | "category" | "kind";

function codeText(codes: string[]): string {
  if (codes.length === 0) return "—";
  if (codes.length <= 8) return codes.join(", ");
  return `${codes.slice(0, 8).join(", ")} +${codes.length - 8}`;
}

export function ProblemCatalog() {
  const vehicleId = useSelectedVehicleId();
  const debugMode = useAppSelector((s) => s.ui.debugMode);
  const vehicleQ = useQuery({
    queryKey: queryKeys.vehicle(vehicleId),
    queryFn: () => api.getVehicle(vehicleId),
    enabled: Boolean(vehicleId),
  });
  const { problem: problemFromDiagnosis } = useSearch({ strict: false });
  const focusId = typeof problemFromDiagnosis === "string" ? problemFromDiagnosis : "";
  const prefill = focusId ? problemLookupPrefill(focusId) : null;
  const family = vehicleQ.data?.engineFamily;
  const rows = useMemo(() => listProblemCatalog(family), [family]);
  const categories = useMemo(() => problemCatalogCategories(rows), [rows]);
  const [category, setCategory] = useState(prefill?.category ?? "all");
  const [search, setSearch] = useState(prefill?.search ?? "");
  const [sort, setSort] = useState<SortKey>("name");

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (category !== "all" && !row.categories.some((item) => item.id === category)) return false;
      if (!q) return true;
      const haystack = [
        row.label,
        row.id,
        row.definition,
        row.approach ?? "",
        ...row.codes,
        ...row.bulletins,
        ...row.followsFrom.map((link) => link.label),
        ...row.leadsTo.map((link) => link.label),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
    return filtered.sort((a, b) => {
      if (sort === "category") {
        const left = a.categories[0]?.label ?? "";
        const right = b.categories[0]?.label ?? "";
        return left.localeCompare(right) || a.label.localeCompare(b.label);
      }
      if (sort === "kind") return a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label);
      return a.label.localeCompare(b.label);
    });
  }, [rows, category, search, sort]);

  const scope = family
    ? `Showing ${FAMILY_LABELS[family] ?? family} fault classes, plus inspection items a scan cannot see.`
    : "No vehicle selected, so every engine family is included, including Jeep-only rows.";

  return (
    <div>
      <PageHeader
        title="Problems"
        subtitle="A lookup of named problems. Categories are the media (air, electricity, mechanical, fluid — oil and coolant are fluid) or the inspection system (brakes, chassis). One problem can point at another. A row is a definition, not a fault proved on the truck outside."
      />
      <p className="mb-4 text-sm text-slate-600">{scope}</p>
      {prefill && (
        <p className="mb-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
          Opened from diagnosis. Search and category are set for {prefill.search}.
        </p>
      )}

      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block min-w-0 flex-1 text-sm font-medium text-slate-700">
            Search problems, codes, or related problems
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="misfire, P0300, or pads"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Sort
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm sm:w-48"
            >
              <option value="name">Name</option>
              <option value="category">Category</option>
              <option value="kind">Fault class or inspection</option>
            </select>
          </label>
        </div>
        <fieldset className="m-0 flex min-w-0 flex-wrap gap-1 border-0 p-0">
          <legend className="sr-only">Filter by category</legend>
          <CategoryChip
            active={category === "all"}
            onClick={() => setCategory("all")}
            label="All"
          />
          {categories.map((item) => (
            <CategoryChip
              key={item.id}
              active={category === item.id}
              onClick={() => setCategory(item.id)}
              label={item.label}
            />
          ))}
        </fieldset>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
          No problems match. That means this catalog has no row for the search — not that the truck
          is clear.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-[64rem] w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Problem</th>
                <th className="px-3 py-2 font-semibold">Category</th>
                <th className="px-3 py-2 font-semibold">What names it</th>
                <th className="px-3 py-2 font-semibold">Codes</th>
                <th className="px-3 py-2 font-semibold">Can follow from</th>
                <th className="px-3 py-2 font-semibold">Can lead to</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <ProblemRow
                  key={`${row.kind}:${row.id}`}
                  row={row}
                  debugMode={debugMode}
                  focused={row.id === focusId}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">{shown.length} shown</p>
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
        active
          ? "border-sky-300 bg-sky-50 text-sky-900"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}

function ProblemRow({
  row,
  debugMode,
  focused,
}: {
  row: ProblemCatalogRow;
  debugMode: boolean;
  focused: boolean;
}) {
  return (
    <tr className={`border-b border-slate-100 align-top ${focused ? "bg-sky-50" : ""}`}>
      <th scope="row" className="px-3 py-3 font-medium text-slate-900">
        {row.label}
        <div className="mt-1 text-[11px] font-normal text-slate-500">
          {row.kind === "inspection" ? "Inspection — not from a scan" : "Fault class"}
        </div>
        {debugMode && (
          <div className="mt-1 font-mono text-[11px] font-normal text-slate-400">{row.id}</div>
        )}
        {row.approach && <p className="mt-1 text-xs font-normal text-slate-600">{row.approach}</p>}
        {row.bulletins.length > 0 && (
          <p className="mt-1 font-mono text-[11px] font-normal text-slate-500">
            {row.bulletins.join(", ")}
          </p>
        )}
      </th>
      <td className="px-3 py-3 text-slate-700">
        {row.categories.map((c) => c.label).join(", ") || "—"}
      </td>
      <td className="px-3 py-3 text-slate-600">{row.definition || "—"}</td>
      <td className="px-3 py-3 font-mono text-xs text-slate-700">{codeText(row.codes)}</td>
      <td className="px-3 py-3 text-slate-600">
        {row.followsFrom.length === 0 ? "—" : row.followsFrom.map(linkText).join("; ")}
      </td>
      <td className="px-3 py-3 text-slate-600">
        {row.leadsTo.length === 0 ? "—" : row.leadsTo.map(linkText).join("; ")}
      </td>
    </tr>
  );
}
