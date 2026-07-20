import type { SpecialProcedureDto } from "@auto/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { EmptyVehicleState, PageHeader, useSelectedVehicleId } from "../components/Layout.tsx";
import { api, queryKeys } from "../lib/api.ts";

export function Functions() {
  const vehicleId = useSelectedVehicleId();
  if (!vehicleId) return <EmptyVehicleState />;
  return <VehicleFunctions vehicleId={vehicleId} />;
}

function VehicleFunctions({ vehicleId }: { vehicleId: string }) {
  const qc = useQueryClient();
  const proceduresQ = useQuery({
    queryKey: queryKeys.specialProcedures(vehicleId),
    queryFn: () => api.getSpecialProcedures(vehicleId),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeProblemId, setActiveProblemId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");

  const selected = useMemo(
    () => proceduresQ.data?.find((p) => p.id === (selectedId ?? proceduresQ.data?.[0]?.id)),
    [proceduresQ.data, selectedId],
  );

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
        subtitle="Guided OEM special procedures — Proxi and related ops for this vehicle"
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
          {proceduresQ.data?.map((proc) => (
            <button
              key={proc.id}
              type="button"
              onClick={() => {
                setSelectedId(proc.id);
                setActiveProblemId(null);
                setChecked({});
              }}
              className={`w-full rounded-lg border px-3 py-3 text-left text-sm transition ${
                selected?.id === proc.id
                  ? "border-sky-300 bg-sky-50"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <div className="font-semibold text-slate-800">{proc.title}</div>
              <div className="mt-1 font-mono text-[11px] text-slate-400">{proc.id}</div>
            </button>
          ))}
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
}) {
  const guiding = Boolean(activeProblemId);

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

        <h3 className="mt-4 text-sm font-semibold text-slate-700">When to use</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-600">
          {procedure.triggers.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>

        <h3 className="mt-4 text-sm font-semibold text-slate-700">Modules involved</h3>
        <ul className="mt-1 space-y-1.5 text-sm text-slate-600">
          {procedure.modulesInvolved.map((m) => (
            <li key={m.id}>
              <span className="font-mono font-medium text-slate-800">{m.id}</span> — {m.role}
            </li>
          ))}
        </ul>

        <h3 className="mt-4 text-sm font-semibold text-slate-700">Hardware</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-600">
          {procedure.hardware.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      </div>

      <StepSection
        title="1. Detect — are modules out of sync?"
        prefix="detect"
        steps={procedure.detectSteps}
        guiding={guiding}
        checked={checked}
        onToggle={toggle}
      />
      <StepSection
        title="2. Align — Proxi realignment procedure"
        prefix="align"
        steps={procedure.alignSteps}
        guiding={guiding}
        checked={checked}
        onToggle={toggle}
      />
      <StepSection
        title="3. Verify"
        prefix="verify"
        steps={procedure.verifySteps}
        guiding={guiding}
        checked={checked}
        onToggle={toggle}
      />

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-700">Risks</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-600">
          {procedure.risks.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <h3 className="mt-3 text-sm font-semibold text-slate-700">References</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-500">
          {procedure.references.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>

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
                Active case: <span className="font-mono">{activeProblemId}</span>
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

function StepSection({
  title,
  prefix,
  steps,
  guiding,
  checked,
  onToggle,
}: {
  title: string;
  prefix: string;
  steps: string[];
  guiding: boolean;
  checked: Record<string, boolean>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
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
