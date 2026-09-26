import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { api, queryKeys } from "../lib/api.ts";
import { loadFavoriteProcedureIds } from "../lib/favoriteProcedures.ts";

/** Dashboard shortcut for procedures the operator pinned on Functions. */
export function FavoriteProceduresStrip({ vehicleId }: { vehicleId: string }) {
  const proceduresQ = useQuery({
    queryKey: queryKeys.specialProcedures(vehicleId),
    queryFn: () => api.getSpecialProcedures(vehicleId),
  });
  const [favoriteIds] = useState(() => loadFavoriteProcedureIds());
  const pinned = (proceduresQ.data ?? []).filter((proc) => favoriteIds.includes(proc.id));
  if (pinned.length === 0) return null;

  return (
    <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">Favorites</h2>
      <p className="mt-1 text-xs text-slate-500">
        Procedures you pinned for quick access. A favorite is not a proven fault.
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {pinned.map((proc) => (
          <li key={proc.id}>
            <Link
              to="/functions"
              search={{ procedure: proc.id }}
              className="inline-block rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900 hover:bg-sky-100"
            >
              {proc.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
