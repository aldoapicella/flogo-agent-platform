import { EvalCaseSchema, type EvalCase } from "@flogo-agent/contracts";

function createCase(id: string, type: EvalCase["type"], title: string, prompt: string, expectedSignals: string[]): EvalCase {
  return EvalCaseSchema.parse({
    id,
    type,
    title,
    prompt,
    expectedSignals
  });
}

export const evalCases: EvalCase[] = [
  createCase("create-001", "create", "REST hello world", "Create a REST hello world app", ["rest", "build", "smoke"]),
  createCase("create-002", "create", "Timer flow", "Create a timer-triggered flow", ["timer", "build"]),
  createCase("create-003", "create", "Shared logic", "Create two flows with shared logic", ["flow", "validation"]),
  createCase("create-004", "create", "External REST proxy", "Create a GET proxy app", ["rest", "reply"]),
  createCase("create-005", "create", "Request logger", "Create an API that logs every request", ["log", "validation"]),
  createCase("create-006", "create", "Error reply path", "Create an app with success and error mappings", ["reply", "mapping"]),
  createCase("create-007", "create", "Custom activity scaffold", "Scaffold an app that references a custom activity", ["custom_code", "approval"]),
  createCase("update-001", "update", "Add endpoint", "Add a POST endpoint to an existing app", ["patch", "build"]),
  createCase("update-002", "update", "Change response mapping", "Change a response mapping to include headers", ["mapping", "smoke"]),
  createCase("update-003", "update", "Rename flow safely", "Rename flow and update all refs", ["diff", "validation"]),
  createCase("update-004", "update", "Install contrib", "Install a new contrib and wire it in", ["dependency", "approval"]),
  createCase("update-005", "update", "External endpoint change", "Retarget an external API host", ["approval", "smoke"]),
  createCase("update-006", "update", "Add logging activity", "Insert a logging activity before REST call", ["patch", "build"]),
  createCase("debug-001", "debug", "Missing alias", "Debug a missing import alias", ["semantic", "patch"]),
  createCase("debug-002", "debug", "Bad flow ref", "Debug a handler pointing to missing flow", ["flowURI", "patch"]),
  createCase("debug-003", "debug", "Illegal mapping scope", "Debug invalid $activity mapping scope", ["mapping", "evidence"]),
  createCase("debug-004", "debug", "Missing activity input", "Debug runtime failure due to missing input", ["activity", "smoke"]),
  createCase("debug-005", "debug", "Build break after update", "Debug build failure after contrib update", ["dependency", "rollback"]),
  createCase("debug-006", "debug", "Wrong runtime output", "Debug an app that returns the wrong payload", ["behavioral", "smoke"]),
  createCase("review-001", "review", "Unused imports", "Review an app for unused imports", ["review", "imports"]),
  createCase("review-002", "review", "Orphaned refs", "Review an app for orphaned refs", ["review", "references"]),
  createCase("review-003", "review", "Fragile mappings", "Review an app for fragile mappings", ["review", "mapping"]),
  createCase("review-004", "review", "Public contract drift", "Review an app for risky REST contract changes", ["approval", "contract"]),
  createCase("review-005", "review", "Missing tests", "Review an app for missing smoke coverage", ["review", "tests"]),
  createCase("review-006", "review", "Complex branching", "Review an app for over-complex flow branching", ["review", "maintainability"])
];

export function scoreEvalRun(results: Array<{ id: string; passed: boolean; durationMs: number; toolCalls: number }>): {
  total: number;
  passed: number;
  successRate: number;
  avgDurationMs: number;
  avgToolCalls: number;
} {
  const total = results.length;
  const passed = results.filter((result) => result.passed).length;
  const avgDurationMs = total === 0 ? 0 : Math.round(results.reduce((sum, result) => sum + result.durationMs, 0) / total);
  const avgToolCalls = total === 0 ? 0 : Number((results.reduce((sum, result) => sum + result.toolCalls, 0) / total).toFixed(2));

  return {
    total,
    passed,
    successRate: total === 0 ? 0 : Number((passed / total).toFixed(2)),
    avgDurationMs,
    avgToolCalls
  };
}

