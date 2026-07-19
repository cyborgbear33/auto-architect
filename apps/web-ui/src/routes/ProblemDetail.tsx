import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "../components/Layout.tsx";
import { api, queryKeys } from "../lib/api.ts";
import { useAppSelector } from "../store/index.ts";

const KIND_EXPLANATIONS: Record<string, string> = {
  act: "the top-ranked action is clearly best — go ahead.",
  "measure-first":
    "the system is poorly understood — run the cheapest informative test before committing to a repair.",
  "stabilize-first": "something is actively getting worse — stabilize before diagnosing further.",
  "clarify-values":
    "success criteria are unclear — LOGOS refuses to rank actions against an undefined goal.",
  escalate: "this needs a human decision LOGOS can't make safely on its own.",
  none: "no viable action was found.",
};

export function ProblemDetail() {
  const { problemId } = useParams({ from: "/problems/$problemId" });
  const qc = useQueryClient();
  const debugMode = useAppSelector((s) => s.ui.debugMode);
  const [logForm, setLogForm] = useState<{
    actionId: string;
    rationale: string;
    outcome: string;
  } | null>(null);

  const problemQ = useQuery({
    queryKey: queryKeys.problem(problemId),
    queryFn: () => api.getProblem(problemId),
  });

  const solve = useMutation({
    mutationFn: () => api.solveDiagnosticProblem(problemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.problem(problemId) }),
  });

  const logRepair = useMutation({
    mutationFn: (input: { actionId: string; rationale: string; outcome: string }) =>
      api.logRepair({
        vehicleId: problem!.vehicleId,
        problemId,
        actionId: input.actionId,
        rationale: input.rationale,
        decidedBy: "owner",
        outcomeStatus: input.outcome as "worked" | "partial" | "failed" | "inconclusive",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.problem(problemId) });
      if (problem?.vehicleId) {
        qc.invalidateQueries({ queryKey: queryKeys.decisions(problem.vehicleId) });
      }
      setLogForm(null);
    },
  });

  if (problemQ.isLoading) return <p className="text-sm text-slate-400">Loading…</p>;
  const problem = problemQ.data;
  if (!problem) return <p className="text-sm text-red-600">Problem not found.</p>;

  const solution = problem.solution;

  return (
    <div>
      <PageHeader title={problem.triggeredByClass ?? "Diagnostic problem"} subtitle={problem.id} />

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-400">Current state</dt>
            <dd className="text-slate-700">{problem.statement.currentState}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-400">Desired state</dt>
            <dd className="text-slate-700">{problem.statement.desiredState}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-400">Gap</dt>
            <dd className="text-slate-700">{problem.statement.gap}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-400">Why it matters</dt>
            <dd className="text-slate-700">{problem.statement.whyItMatters ?? "—"}</dd>
          </div>
        </dl>
        {problem.desiredState?.successCriteria && (
          <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <span className="font-semibold">Success criteria:</span>{" "}
            {problem.desiredState.successCriteria}
          </p>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Solution (LOGOS solve)</h2>
          {!solution && (
            <button
              type="button"
              onClick={() => solve.mutate()}
              disabled={solve.isPending}
              className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
            >
              Solve
            </button>
          )}
        </div>

        {!solution && <p className="text-sm text-slate-400">Not solved yet.</p>}

        {solution && (
          <div>
            <div className="mb-3 rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900">
              <span className="font-semibold">{solution.kind}</span> —{" "}
              {KIND_EXPLANATIONS[solution.kind] ?? solution.rationale}
              <p className="mt-1 text-xs text-sky-700">{solution.rationale}</p>
              {solution.certainty && (
                <p className="mt-1 text-xs text-sky-700">Certainty: {solution.certainty}</p>
              )}
            </div>

            <ol className="space-y-2">
              {solution.ranked.map((r, i) => (
                <li key={r.action.id} className="rounded-md border border-slate-200 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800">
                      {i + 1}. {r.action.id}
                      {solution.recommended === r.action.id && (
                        <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">
                          recommended
                        </span>
                      )}
                    </span>
                    {debugMode && (
                      <span className="text-xs text-slate-400">score: {r.score.toFixed(1)}</span>
                    )}
                  </div>
                  <p className="mt-1 text-slate-600">{r.action.description}</p>
                  <button
                    type="button"
                    onClick={() =>
                      setLogForm({ actionId: r.action.id, rationale: "", outcome: "worked" })
                    }
                    className="mt-2 text-xs font-medium text-sky-700 hover:underline"
                  >
                    Log this as the repair taken
                  </button>
                </li>
              ))}
            </ol>

            {solution.disqualified.length > 0 && (
              <p className="mt-3 text-xs text-slate-400">
                Disqualified: {solution.disqualified.map((d) => d.actionId).join(", ")} (violated a
                non-negotiable constraint)
              </p>
            )}
          </div>
        )}
      </section>

      {logForm && (
        <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">
            Log repair: {logForm.actionId}
          </h2>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              logRepair.mutate(logForm);
            }}
          >
            <div>
              <label className="block text-xs font-medium text-slate-500">
                Rationale
                <textarea
                  required
                  value={logForm.rationale}
                  onChange={(e) => setLogForm({ ...logForm, rationale: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                  rows={2}
                />
              </label>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">
                Outcome
                <select
                  value={logForm.outcome}
                  onChange={(e) => setLogForm({ ...logForm, outcome: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                >
                  <option value="worked">Worked</option>
                  <option value="partial">Partial</option>
                  <option value="failed">Failed</option>
                  <option value="inconclusive">Inconclusive</option>
                </select>
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
              >
                Save decision
              </button>
              <button
                type="button"
                onClick={() => setLogForm(null)}
                className="text-sm text-slate-400"
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {problem.outcome && (
        <p className="mt-4 text-sm text-slate-500">
          Outcome: <span className="font-medium text-slate-700">{problem.outcome.status}</span>{" "}
          (recorded {problem.outcome.recordedAt})
        </p>
      )}
    </div>
  );
}
