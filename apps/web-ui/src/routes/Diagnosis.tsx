import type { DiagnosticProblem, ProblemStatus } from "@auto/semantic-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AemfAspectChips } from "../components/AemfAspectChips.tsx";
import { AemfPlaybookProse } from "../components/AemfPlaybookProse.tsx";
import { CausalBriefPanel } from "../components/CausalBriefPanel.tsx";
import { CascadePrognosisPanel } from "../components/CascadePrognosisPanel.tsx";
import { CaseTimelinePanel } from "../components/CaseTimelinePanel.tsx";
import { ClassEvidencePanel } from "../components/ClassEvidencePanel.tsx";
import { EvidenceSourceBadge } from "../components/EvidenceSourceBadge.tsx";
import { KnowledgeGapPanel } from "../components/KnowledgeGapPanel.tsx";
import { EmptyVehicleState, PageHeader, useSelectedVehicleId } from "../components/Layout.tsx";
import { LearningCyclePanel } from "../components/LearningCyclePanel.tsx";
import { fluentForClass } from "../components/NextActionConsole.tsx";
import { WhatWorkedPanel } from "../components/WhatWorkedPanel.tsx";
import { ApiError, api, queryKeys } from "../lib/api.ts";

const STATUS_STYLES: Record<string, string> = {
  open: "bg-slate-100 text-slate-700 border-slate-200",
  analyzing: "bg-sky-100 text-sky-800 border-sky-200",
  verifying: "bg-amber-100 text-amber-900 border-amber-200",
  solved: "bg-green-100 text-green-800 border-green-200",
  escalated: "bg-orange-100 text-orange-800 border-orange-200",
  abandoned: "bg-slate-100 text-slate-400 border-slate-200",
};

const ACTIVE: ReadonlySet<ProblemStatus> = new Set(["open", "analyzing", "verifying"]);

type CaseboardFilter = "active" | "verifying" | "solved" | "escalated" | "abandoned" | "all";

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? STATUS_STYLES.open}`}
    >
      {status}
    </span>
  );
}

function matchesFilter(problem: DiagnosticProblem, filter: CaseboardFilter): boolean {
  if (filter === "all") return true;
  if (filter === "active") return ACTIVE.has(problem.status);
  return problem.status === filter;
}

export function Diagnosis() {
  const vehicleId = useSelectedVehicleId();
  if (!vehicleId) return <EmptyVehicleState />;
  return <VehicleDiagnosis vehicleId={vehicleId} />;
}

function VehicleDiagnosis({ vehicleId }: { vehicleId: string }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<CaseboardFilter>("active");
  const [clearCodesResult, setClearCodesResult] = useState<
    | { kind: "allowed"; obligations: string[] }
    | { kind: "blocked"; message: string; details: unknown }
    | null
  >(null);

  const recognitionQ = useQuery({
    queryKey: queryKeys.recognition(vehicleId),
    queryFn: () => api.getRecognition(vehicleId),
  });
  const provenanceQ = useQuery({
    queryKey: queryKeys.evidenceProvenance(vehicleId),
    queryFn: () => api.getEvidenceProvenance(vehicleId),
  });
  const problemsQ = useQuery({
    queryKey: queryKeys.problems(vehicleId),
    queryFn: () => api.listProblems(vehicleId),
  });

  // P3: only treat a class as "drafted" while an active case exists for it.
  const activeClasses = new Set(
    problemsQ.data
      ?.filter((p) => p.triggeredByClass && ACTIVE.has(p.status))
      .map((p) => p.triggeredByClass as string),
  );
  const undraftedClasses = (recognitionQ.data?.mostSpecific ?? []).filter(
    (c) => !activeClasses.has(c),
  );

  const filteredProblems = useMemo(() => {
    const list = (problemsQ.data ?? []).filter((p) => matchesFilter(p, filter));
    return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [problemsQ.data, filter]);

  const invalidateProblems = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.problems(vehicleId) });
    void qc.invalidateQueries({ queryKey: queryKeys.caseTimeline(vehicleId) });
  };

  const createProblem = useMutation({
    mutationFn: (triggeredByClass: string) =>
      api.createDiagnosticProblem({ vehicleId, triggeredByClass }),
    onSuccess: invalidateProblems,
  });

  const abandon = useMutation({
    mutationFn: (problemId: string) => api.abandonDiagnosticProblem(problemId),
    onSuccess: invalidateProblems,
  });
  const escalate = useMutation({
    mutationFn: (problemId: string) => api.escalateDiagnosticProblem(problemId),
    onSuccess: invalidateProblems,
  });
  const verify = useMutation({
    mutationFn: (problemId: string) => api.verifyDiagnosticProblem(problemId),
    onSuccess: invalidateProblems,
  });
  const reopen = useMutation({
    mutationFn: (problemId: string) => api.reopenDiagnosticProblem(problemId),
    onSuccess: invalidateProblems,
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

  const filters: Array<{ id: CaseboardFilter; label: string }> = [
    { id: "active", label: "Active" },
    { id: "verifying", label: "Verifying" },
    { id: "solved", label: "Solved" },
    { id: "escalated", label: "Escalated" },
    { id: "abandoned", label: "Abandoned" },
    { id: "all", label: "All" },
  ];

  return (
    <div>
      <PageHeader
        title="Diagnosis"
        subtitle="Caseboard: draft → solve → repair → verify → close (or abandon / escalate / reopen)"
      />

      <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <EvidenceSourceBadge provenance={provenanceQ.data} />
      </div>

      <div className="mb-4">
        <WhatWorkedPanel vehicleId={vehicleId} />
      </div>

      <div className="mb-4">
        <LearningCyclePanel vehicleId={vehicleId} limit={6} />
      </div>

      <div className="mb-4">
        <KnowledgeGapPanel vehicleId={vehicleId} />
      </div>

      <div className="mb-4">
        <CaseTimelinePanel vehicleId={vehicleId} limit={8} title="Recent case activity" />
      </div>

      <div className="mb-4">
        <CascadePrognosisPanel vehicleId={vehicleId} />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          Proven, not-yet-drafted
        </h2>
        <p className="mb-2 text-xs text-slate-400">
          Plain-English first (I7) — LOGOS class ids stay secondary for apprentices.
        </p>
        {undraftedClasses.length === 0 ? (
          <p className="text-sm text-slate-400">
            Nothing new to draft — every proven class already has an active case below (or nothing
            is proven).
          </p>
        ) : (
          <ul className="space-y-2">
            {undraftedClasses.map((cls) => {
              const fluent = fluentForClass(cls, recognitionQ.data?.narration);
              const evidence = recognitionQ.data?.classEvidence?.find((e) => e.className === cls);
              return (
                <li
                  key={cls}
                  className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800">{fluent}</p>
                    {fluent !== cls && (
                      <p className="mt-0.5 font-mono text-[11px] text-slate-400">{cls}</p>
                    )}
                    <AemfAspectChips className={cls} />
                    <AemfPlaybookProse className={cls} />
                    <ClassEvidencePanel evidence={evidence} />
                    <CausalBriefPanel vehicleId={vehicleId} faultClass={cls} />
                  </div>
                  <button
                    type="button"
                    onClick={() => createProblem.mutate(cls)}
                    disabled={createProblem.isPending}
                    className="flex-shrink-0 rounded-md bg-sky-600 px-3 py-1 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                  >
                    Draft diagnostic problem
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700">Problem caseboard</h2>
          <div className="flex flex-wrap gap-1">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                  filter === f.id
                    ? "border-sky-300 bg-sky-50 text-sky-800"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filteredProblems.length === 0 && (
          <p className="text-sm text-slate-400">No problems in this filter.</p>
        )}
        <ul className="space-y-2">
          {filteredProblems.map((problem) => {
            const classFluent = problem.triggeredByClass
              ? fluentForClass(problem.triggeredByClass, recognitionQ.data?.narration)
              : null;
            return (
            <li key={problem.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Link
                  to="/problems/$problemId"
                  params={{ problemId: problem.id }}
                  className="min-w-0 flex-1 hover:underline"
                >
                  {problem.triggeredByClass && classFluent ? (
                    <>
                      <span className="font-medium text-slate-800">{classFluent}</span>
                      {classFluent !== problem.triggeredByClass && (
                        <span className="ml-2 font-mono text-[11px] text-slate-400">
                          {problem.triggeredByClass}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="font-medium text-slate-800">manual</span>
                  )}
                  <span className="mt-0.5 block text-slate-500">{problem.statement.currentState}</span>
                  {problem.triggeredByClass && (
                    <AemfAspectChips className={problem.triggeredByClass} />
                  )}
                  {problem.verification?.result && (
                    <span className="mt-0.5 block text-xs text-slate-500">
                      verify: {problem.verification.result}
                      {problem.verification.note ? ` — ${problem.verification.note}` : ""}
                    </span>
                  )}
                </Link>
                <StatusPill status={problem.status} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(problem.status === "open" || problem.status === "analyzing") && (
                  <>
                    <CaseAction
                      label="Escalate"
                      onClick={() => escalate.mutate(problem.id)}
                      disabled={escalate.isPending}
                    />
                    <CaseAction
                      label="Abandon"
                      onClick={() => abandon.mutate(problem.id)}
                      disabled={abandon.isPending}
                      tone="muted"
                    />
                  </>
                )}
                {problem.status === "verifying" && (
                  <>
                    <CaseAction
                      label="Run verify"
                      onClick={() => verify.mutate(problem.id)}
                      disabled={verify.isPending}
                      tone="primary"
                    />
                    <CaseAction
                      label="Abandon"
                      onClick={() => abandon.mutate(problem.id)}
                      disabled={abandon.isPending}
                      tone="muted"
                    />
                  </>
                )}
                {(problem.status === "solved" ||
                  problem.status === "abandoned" ||
                  problem.status === "escalated") && (
                  <CaseAction
                    label="Reopen"
                    onClick={() => reopen.mutate(problem.id)}
                    disabled={reopen.isPending}
                  />
                )}
              </div>
            </li>
            );
          })}
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

function CaseAction({
  label,
  onClick,
  disabled,
  tone = "default",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "primary" | "muted";
}) {
  const styles =
    tone === "primary"
      ? "bg-sky-600 text-white hover:bg-sky-700 border-sky-600"
      : tone === "muted"
        ? "bg-white text-slate-500 hover:bg-slate-100 border-slate-200"
        : "bg-white text-slate-700 hover:bg-slate-100 border-slate-300";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50 ${styles}`}
    >
      {label}
    </button>
  );
}
