import type { ClassEvidence } from "@auto/semantic-types";

/** Compact supporting DTCs / PIDs / freeze-frames nested under a proven class (A1). */
export function ClassEvidencePanel({ evidence }: { evidence: ClassEvidence | undefined }) {
  if (!evidence) return null;
  const empty =
    evidence.dtcs.length === 0 &&
    evidence.pids.length === 0 &&
    evidence.freezeFrames.length === 0;
  if (empty) {
    return (
      <p className="mt-1.5 text-xs text-slate-400">
        No supporting DTC / PID / freeze-frame observations on file for this class.
      </p>
    );
  }

  return (
    <div className="mt-1.5 space-y-1.5 border-l-2 border-slate-200 pl-2.5 text-xs text-slate-600">
      {evidence.dtcs.length > 0 && (
        <div>
          <span className="font-medium text-slate-500">DTCs </span>
          {evidence.dtcs.map((d, i) => (
            <span key={`${d.code}-${d.status}`}>
              {i > 0 ? ", " : ""}
              <span className="font-mono text-slate-800">{d.code}</span>
              <span className="text-slate-400"> ({d.status})</span>
            </span>
          ))}
        </div>
      )}
      {evidence.pids.length > 0 && (
        <ul className="space-y-0.5">
          {evidence.pids.map((p) => (
            <li key={p.pid}>
              <span className="font-mono text-slate-700">{p.pid}</span>
              {": "}
              {p.value}
              {p.unit ? ` ${p.unit}` : ""}
              {p.thresholdMet === true && (
                <span className="ml-1 text-amber-700">threshold met</span>
              )}
              {p.thresholdMet === false && (
                <span className="ml-1 text-slate-400">below threshold</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {evidence.freezeFrames.length > 0 && (
        <ul className="space-y-1">
          {evidence.freezeFrames.map((ff) => (
            <li key={ff.dtc}>
              <span className="font-medium text-slate-500">FF </span>
              <span className="font-mono text-slate-800">{ff.dtc}</span>
              <ul className="mt-0.5 space-y-0.5 text-slate-500">
                {ff.readings.map((r) => (
                  <li key={`${ff.dtc}-${r.pid}`}>
                    {r.pid}: {r.value}
                    {r.unit ? ` ${r.unit}` : ""}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
