import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { EmptyVehicleState, PageHeader, useSelectedVehicleId } from "../components/Layout.tsx";
import { ApiError, api, queryKeys } from "../lib/api.ts";

const STATUS_STYLES: Record<string, string> = {
  open: "bg-slate-100 text-slate-700 border-slate-200",
  analyzing: "bg-sky-100 text-sky-800 border-sky-200",
  solved: "bg-green-100 text-green-800 border-green-200",
  escalated: "bg-orange-100 text-orange-800 border-orange-200",
  abandoned: "bg-slate-100 text-slate-400 border-slate-200",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? STATUS_STYLES.open}`}
    >
      {status}
    </span>
  );
}

export function Diagnosis() {
  const vehicleId = useSelectedVehicleId();
  if (!vehicleId) return <EmptyVehicleState />;
  return <VehicleDiagnosis vehicleId={vehicleId} />;
}

function VehicleDiagnosis({ vehicleId }: { vehicleId: string }) {
  const qc = useQueryClient();
  const [clearCodesResult, setClearCodesResult] = useState<
    | { kind: "allowed"; obligations: string[] }
    | { kind: "blocked"; message: string; details: unknown }
    | null
  >(null);

  const recognitionQ = useQuery({
    queryKey: queryKeys.recognition(vehicleId),
    queryFn: () => api.getRecognition(vehicleId),
  });
  const problemsQ = useQuery({
    queryKey: queryKeys.problems(vehicleId),
    queryFn: () => api.listProblems(vehicleId),
  });

  const draftedClasses = new Set(problemsQ.data?.map((p) => p.triggeredByClass).filter(Boolean));
  const undraftedClasses = (recognitionQ.data?.mostSpecific ?? []).filter(
    (c) => !draftedClasses.has(c),
  );

  const createProblem = useMutation({
    mutationFn: (triggeredByClass: string) =>
      api.createDiagnosticProblem({ vehicleId, triggeredByClass }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.problems(vehicleId) }),
  });

  const clearCodes = useMutation({
    mutationFn: () => api.requestClearCodesAndDrive(vehicleId),
    onSuccess: (result) =>
      setClearCodesResult({ kind: "allowed", obligations: result.obligations }),
    onError: (err) => {
      if (err instanceof ApiError) {
        setClearCodesResult({ kind: "blocked", message: err.message, details: err.details });
      }
    },
  });

  return (
    <div>
      <PageHeader
        title="Diagnosis"
        subtitle="LOGOS realize → proven fault classes → drafted DiagnosticProblems → solve-ranked next steps"
      />

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          Proven, not-yet-drafted fault classes
        </h2>
        {undraftedClasses.length === 0 ? (
          <p className="text-sm text-slate-400">
            Nothing new to draft — every proven class already has a diagnostic problem below.
          </p>
        ) : (
          <ul className="space-y-2">
            {undraftedClasses.map((cls) => (
              <li
                key={cls}
                className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="font-medium text-slate-800">{cls}</span>
                <button
                  type="button"
                  onClick={() => createProblem.mutate(cls)}
                  disabled={createProblem.isPending}
                  className="rounded-md bg-sky-600 px-3 py-1 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  Draft diagnostic problem
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Diagnostic problems</h2>
        </div>
        {problemsQ.data?.length === 0 && (
          <p className="text-sm text-slate-400">No diagnostic problems drafted yet.</p>
        )}
        <ul className="space-y-2">
          {problemsQ.data?.map((problem) => (
            <li key={problem.id}>
              <Link
                to="/problems/$problemId"
                params={{ problemId: problem.id }}
                className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm hover:bg-slate-100"
              >
                <span>
                  <span className="font-medium text-slate-800">
                    {problem.triggeredByClass ?? "manual"}
                  </span>
                  <span className="ml-2 text-slate-500">{problem.statement.currentState}</span>
                </span>
                <StatusPill status={problem.status} />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          Safety hold demo: clear codes &amp; drive
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          A real policy gate (LOGOS <code>reason</code>), not a UI suggestion — this <em>blocks</em>{" "}
          when a dangerous fault class is currently proven, e.g. <code>MisfireUnderLoad</code>.
        </p>
        <button
          type="button"
          onClick={() => clearCodes.mutate()}
          disabled={clearCodes.isPending}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Request: clear codes and drive
        </button>
        {clearCodesResult?.kind === "allowed" && (
          <p className="mt-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
            Allowed.{" "}
            {clearCodesResult.obligations.length > 0 &&
              `Obligations: ${clearCodesResult.obligations.join(", ")}`}
          </p>
        )}
        {clearCodesResult?.kind === "blocked" && (
          <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            Blocked: {clearCodesResult.message}
          </p>
        )}
      </section>
    </div>
  );
}
