import type { SpecialProcedureDto } from "@auto/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { EmptyVehicleState, PageHeader, useSelectedVehicleId } from "../components/Layout.tsx";
import { api, queryKeys } from "../lib/api.ts";
import { loadFavoriteProcedureIds, setFavoriteProcedure } from "../lib/favoriteProcedures.ts";
import { useAppSelector } from "../store/index.ts";

export function Functions() {
  const vehicleId = useSelectedVehicleId();
  if (!vehicleId) return <EmptyVehicleState />;
  return <VehicleFunctions vehicleId={vehicleId} />;
}

function VehicleFunctions({ vehicleId }: { vehicleId: string }) {
  const debugMode = useAppSelector((s) => s.ui.debugMode);
  const qc = useQueryClient();
  const { procedure: procedureFromSearch } = useSearch({ strict: false });
  const proceduresQ = useQuery({
    queryKey: queryKeys.specialProcedures(vehicleId),
    queryFn: () => api.getSpecialProcedures(vehicleId),
  });
  const [selectedId, setSelectedId] = useState<string | null>(
    typeof procedureFromSearch === "string" ? procedureFromSearch : null,
  );
  const [favoriteIds, setFavoriteIds] = useState(() => loadFavoriteProcedureIds());
  const [activeProblemId, setActiveProblemId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");

  const selected = useMemo(() => {
    const list = proceduresQ.data ?? [];
    return list.find((proc) => proc.id === selectedId) ?? list[0];
  }, [proceduresQ.data, selectedId]);
  const ordered = useMemo(() => {
    const list = proceduresQ.data ?? [];
    return [...list].sort(
      (a, b) => Number(favoriteIds.includes(b.id)) - Number(favoriteIds.includes(a.id)),
    );
  }, [proceduresQ.data, favoriteIds]);

  function toggleFavorite(id: string) {
    const nextFavorite = !favoriteIds.includes(id);
    setFavoriteIds(setFavoriteProcedure(id, nextFavorite));
  }

  const startMut = useMutation({
    mutationFn: (procedureId: string) =>
      api.startSpecialProcedure({ vehicleId, procedureId, note: note || undefined }),
    onSuccess: (result) => {
      setActiveProblemId(result.problem.id);
      setChecked({});
      void qc.invalidateQueries({ queryKey: queryKeys.problems(vehicleId) });
      void qc.invalidateQueries({ queryKey: queryKeys.decisions(vehicleId) });
    },
  });

  const completeMut = useMutation({
    mutationFn: (status: "completed" | "failed") => {
      if (!selected || !activeProblemId) throw new Error("No active guided run");
      return api.completeSpecialProcedure({
        vehicleId,
        problemId: activeProblemId,
        procedureId: selected.id,
        status,
        note: note || undefined,
      });
    },
    onSuccess: () => {
      setActiveProblemId(null);
      setNote("");
      void qc.invalidateQueries({ queryKey: queryKeys.problems(vehicleId) });
      void qc.invalidateQueries({ queryKey: queryKeys.decisions(vehicleId) });
    },
  });

  return (
    <div>
      <PageHeader
        title="Functions"
        subtitle="Checklists for special procedures. Star one you repeat — it stays at the top and on the Dashboard. The module tool stays outside this app."
      />

      {proceduresQ.isLoading && <p className="text-sm text-slate-400">Loading procedures…</p>}
      {proceduresQ.data?.length === 0 && (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
          No curated special procedures for this engine family yet. The Jeep Tigershark family
          includes Proxi alignment.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="space-y-2 lg:col-span-1">
          {ordered.map((proc) => {
            const favorited = favoriteIds.includes(proc.id);
            return (
              <div
                key={proc.id}
                className={`flex items-stretch rounded-lg border text-sm transition ${
                  selected?.id === proc.id
                    ? "border-sky-300 bg-sky-50"
                    : "border-slate-200 bg-white"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(proc.id);
                    setActiveProblemId(null);
                    setChecked({});
                  }}
                  className="min-w-0 flex-1 px-3 py-3 text-left hover:bg-slate-50"
                >
                  <div className="font-semibold text-slate-800">{proc.title}</div>
                  {favorited && (
                    <div className="mt-1 text-[11px] font-medium text-sky-800">Favorite</div>
                  )}
                  {debugMode && (
                    <div className="mt-1 font-mono text-[11px] text-slate-400">{proc.id}</div>
                  )}
                </button>
                <button
                  type="button"
                  aria-pressed={favorited}
                  aria-label={
                    favorited ? `Remove favorite ${proc.title}` : `Favorite ${proc.title}`
                  }
                  onClick={() => toggleFavorite(proc.id)}
                  className="shrink-0 border-l border-slate-200 px-3 text-xs font-medium text-sky-800 hover:bg-sky-50"
                >
                  {favorited ? "Starred" : "Star"}
                </button>
              </div>
            );
          })}
        </section>

        {selected && (
          <ProcedureDetail
            procedure={selected}
            activeProblemId={activeProblemId}
            checked={checked}
            setChecked={setChecked}
            note={note}
            setNote={setNote}
            onStart={() => startMut.mutate(selected.id)}
            onComplete={(status) => completeMut.mutate(status)}
            busy={startMut.isPending || completeMut.isPending}
            startError={startMut.error?.message}
            completeError={completeMut.error?.message}
            debugMode={debugMode}
          />
        )}
      </div>
    </div>
  );
}

function ProcedureDetail({
  procedure,
  activeProblemId,
  checked,
  setChecked,
  note,
  setNote,
  onStart,
  onComplete,
  busy,
  startError,
  completeError,
  debugMode,
}: {
  procedure: SpecialProcedureDto;
  activeProblemId: string | null;
  checked: Record<string, boolean>;
  setChecked: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  note: string;
  setNote: (v: string) => void;
  onStart: () => void;
  onComplete: (status: "completed" | "failed") => void;
  busy: boolean;
  startError?: string;
  completeError?: string;
  debugMode: boolean;
}) {
  const guiding = Boolean(activeProblemId);
  const [showContext, setShowContext] = useState(false);
  const [showLater, setShowLater] = useState(false);
  const [showDone, setShowDone] = useState(false);

  function toggle(key: string) {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <section className="space-y-4 lg:col-span-2">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <strong className="font-semibold">External tool required.</strong> Execution uses AlfaOBD
        (or dealer wiTECH) with OBDLink MX+. Auto-architect does <em>not</em> send Proxi over the
        standard OBD gateway. Use <strong>Start guided run</strong> to open a case and checklist;
        perform the alignment in AlfaOBD, then mark completed or failed here.
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-800">{procedure.title}</h2>
        <p className="mt-2 text-sm text-slate-600">{procedure.summary}</p>
        <button
          type="button"
          aria-expanded={showContext}
          onClick={() => setShowContext((open) => !open)}
          className="mt-3 text-sm font-medium text-sky-800 hover:underline"
        >
          {showContext ? "Hide why this procedure" : "Why this procedure"}
        </button>
        {showContext && (
          <div className="mt-3 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">When to use</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-600">
                {procedure.triggers.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-700">Modules involved</h3>
              <ul className="mt-1 space-y-1.5 text-sm text-slate-600">
                {procedure.modulesInvolved.map((m) => (
                  <li key={m.id}>
                    <span className="font-medium text-slate-800">{m.id}</span> — {m.role}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-700">Hardware</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-600">
                {procedure.hardware.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-700">References</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-500">
                {procedure.references.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      <ProcedureSteps
        procedure={procedure}
        guiding={guiding}
        checked={checked}
        onToggle={toggle}
        showLater={showLater}
        showDone={showDone}
        onShowLater={() => setShowLater(true)}
        onShowDone={() => setShowDone(true)}
      />

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <label className="block text-sm font-semibold text-slate-700" htmlFor="proc-note">
          Operator notes
        </label>
        <textarea
          id="proc-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="e.g. after battery replace; AlfaOBD finished OK"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {!guiding ? (
            <button
              type="button"
              disabled={busy}
              onClick={onStart}
              className="rounded-md bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50"
            >
              Start guided run
            </button>
          ) : (
            <>
              <span className="self-center text-xs text-slate-500">
                Guided run is open
                {debugMode && activeProblemId ? (
                  <span className="ml-1 font-mono">{activeProblemId}</span>
                ) : null}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => onComplete("completed")}
                className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                Mark completed
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onComplete("failed")}
                className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Mark failed
              </button>
            </>
          )}
        </div>
        {(startError || completeError) && (
          <p className="mt-2 text-sm text-red-600">{startError ?? completeError}</p>
        )}
      </div>
    </section>
  );
}

function procedurePhases(procedure: SpecialProcedureDto) {
  return [
    { key: "detect", title: "1. Detect — are modules out of sync?", steps: procedure.detectSteps },
    { key: "align", title: "2. Align — Proxi realignment procedure", steps: procedure.alignSteps },
    { key: "verify", title: "3. Verify", steps: procedure.verifySteps },
  ];
}

function phaseComplete(key: string, steps: string[], checked: Record<string, boolean>): boolean {
  return steps.every((_, index) => checked[`${key}-${index}`]);
}

function finishLine(title: string): string {
  const aside = title.split("—")[1]?.trim();
  return aside || title;
}

function ProcedureSteps({
  procedure,
  guiding,
  checked,
  onToggle,
  showLater,
  showDone,
  onShowLater,
  onShowDone,
}: {
  procedure: SpecialProcedureDto;
  guiding: boolean;
  checked: Record<string, boolean>;
  onToggle: (key: string) => void;
  showLater: boolean;
  showDone: boolean;
  onShowLater: () => void;
  onShowDone: () => void;
}) {
  const phases = procedurePhases(procedure);
  const openIndex = phases.findIndex((phase) => !phaseComplete(phase.key, phase.steps, checked));
  const current = openIndex === -1 ? phases.length - 1 : openIndex;
  const currentPhase = phases[current];
  if (!currentPhase) return null;

  return (
    <div className="space-y-3">
      {showDone &&
        phases
          .slice(0, current)
          .map((phase) => (
            <StepSection
              key={phase.key}
              title={phase.title}
              prefix={phase.key}
              steps={phase.steps}
              guiding={guiding}
              checked={checked}
              onToggle={onToggle}
            />
          ))}
      {current > 0 && !showDone && (
        <button
          type="button"
          onClick={onShowDone}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Show finished steps
        </button>
      )}
      <div className="rounded-lg border border-slate-800 bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-800">This step</p>
        <StepSection
          title={currentPhase.title}
          prefix={currentPhase.key}
          steps={currentPhase.steps}
          guiding={guiding}
          checked={checked}
          onToggle={onToggle}
          bare
        />
        <p className="mt-3 text-sm text-slate-700">
          Finishing this tells you: {finishLine(currentPhase.title)}
        </p>
        {procedure.risks.length > 0 && (
          <p className="mt-2 text-sm text-amber-950">Do not skip: {procedure.risks.join("; ")}</p>
        )}
      </div>
      {current < phases.length - 1 && !showLater && (
        <button
          type="button"
          onClick={onShowLater}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Later steps
        </button>
      )}
      {showLater &&
        phases
          .slice(current + 1)
          .map((phase) => (
            <StepSection
              key={phase.key}
              title={phase.title}
              prefix={phase.key}
              steps={phase.steps}
              guiding={guiding}
              checked={checked}
              onToggle={onToggle}
            />
          ))}
    </div>
  );
}

function StepSection({
  title,
  prefix,
  steps,
  guiding,
  checked,
  onToggle,
  bare = false,
}: {
  title: string;
  prefix: string;
  steps: string[];
  guiding: boolean;
  checked: Record<string, boolean>;
  onToggle: (key: string) => void;
  bare?: boolean;
}) {
  return (
    <div className={bare ? "" : "rounded-lg border border-slate-200 bg-white p-4"}>
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      <ol className="mt-2 space-y-2">
        {steps.map((step, i) => {
          const key = `${prefix}-${i}`;
          return (
            <li key={key} className="flex gap-2 text-sm text-slate-600">
              {guiding ? (
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={Boolean(checked[key])}
                  onChange={() => onToggle(key)}
                  aria-label={`Step ${i + 1}`}
                />
              ) : (
                <span className="mt-0.5 w-5 shrink-0 font-mono text-xs text-slate-400">
                  {i + 1}.
                </span>
              )}
              <span>{step}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
