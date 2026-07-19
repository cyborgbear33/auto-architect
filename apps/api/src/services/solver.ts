import type { LogosBridge, LogosProblemInput } from "@auto/logos-bridge";
import type { DiagnosticProblem, DiagnosticSolution } from "@auto/semantic-types";
import { mapBridgeError } from "../lib/bridge-errors.ts";

/**
 * Wraps `LogosBridge.solve`: given a drafted DiagnosticProblem (statement +
 * candidate actions from a cartridge's playbook), asks LOGOS which action to
 * rank first — never the cartridge's own ordering taken at face value. This
 * is the "dispose" half of propose/dispose: the cartridge/agent proposes
 * candidate actions; only `solve` decides the ranking and any escalation.
 */
export class SolverService {
  constructor(private bridge: LogosBridge) {}

  async solve(problem: DiagnosticProblem): Promise<DiagnosticSolution> {
    const input: LogosProblemInput = {
      id: problem.id,
      statement: problem.statement,
      problemType: problem.problemType ?? "Diagnostic",
      gapType: problem.gapType,
      desiredState: problem.desiredState,
      causalModel: problem.causalModel,
      actions: problem.actions,
    };
    try {
      return await this.bridge.solve(input);
    } catch (err) {
      throw mapBridgeError(err);
    }
  }
}
