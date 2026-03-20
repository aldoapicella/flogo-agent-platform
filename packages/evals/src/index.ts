import { EvalCaseSchema, type EvalCase } from "@flogo-agent/contracts";

type RuntimeEvidenceMetadata = NonNullable<EvalCase["runtimeEvidence"]>;
type RuntimeEvidenceMetadataInput = Omit<RuntimeEvidenceMetadata, "operations" | "artifacts" | "mirrors"> &
  Partial<Pick<RuntimeEvidenceMetadata, "operations" | "artifacts" | "mirrors">>;
type RuntimeEvidenceFamily = RuntimeEvidenceMetadata["family"];
type RuntimeEvidenceScenario = RuntimeEvidenceMetadata["scenario"];

function createCase(
  id: string,
  type: EvalCase["type"],
  title: string,
  prompt: string,
  expectedSignals: string[],
  extras?: Partial<Omit<EvalCase, "id" | "type" | "title" | "prompt" | "expectedSignals">>
): EvalCase {
  return EvalCaseSchema.parse({
    id,
    type,
    title,
    prompt,
    expectedSignals,
    ...extras
  });
}

function createRuntimeEvidenceCase(
  id: string,
  title: string,
  prompt: string,
  expectedSignals: string[],
  runtimeEvidence: RuntimeEvidenceMetadataInput
): EvalCase {
  const operations = runtimeEvidence.operations ?? [
    "trace",
    ...(runtimeEvidence.replay ? ["replay" as const] : []),
    ...(runtimeEvidence.comparison ? ["compare" as const] : [])
  ];
  const artifacts = runtimeEvidence.artifacts ?? [
    "run_trace",
    ...(runtimeEvidence.replay ? ["replay_report" as const] : []),
    ...(runtimeEvidence.comparison ? ["run_comparison" as const] : [])
  ];
  const mirrors = runtimeEvidence.mirrors ?? [
    "go-runtime/flogo-helper/main_test.go",
    "packages/flogo-graph/src/index.test.ts",
    "apps/control-plane/src/modules/flogo-apps/flogo-apps.service.test.ts",
    "apps/runner-worker/src/services/runner-executor.service.test.ts"
  ];

  return createCase(id, "debug", title, prompt, expectedSignals, {
    suite: "runtime_evidence",
    runtimeEvidence: {
      ...runtimeEvidence,
      operations,
      artifacts,
      mirrors
    }
  });
}

export const workflowEvalCases: EvalCase[] = [
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

export const runtimeEvidenceEvalCases: EvalCase[] = [
  createRuntimeEvidenceCase(
    "runtime-001",
    "Direct-flow runtime-backed round trip",
    "Capture a trace for a supported direct-flow same-flow #log scenario, replay it, and compare the two artifacts for normalized runtime evidence.",
    ["runtime_evidence", "direct_flow", "runtime_backed", "normalized_steps", "replay", "compare"],
    {
      family: "direct_flow",
      scenario: "supported",
      operations: ["trace", "replay", "compare"],
      artifacts: ["run_trace", "replay_report", "run_comparison"],
      trace: {
        evidenceKind: "runtime_backed",
        runtimeMode: "independent_action",
        normalizedStepsExpected: true,
        fallbackReasonExpected: false
      },
      replay: {
        implemented: true,
        evidenceKind: "runtime_backed",
        runtimeMode: "independent_action_replay",
        normalizedStepsExpected: true,
        fallbackReasonExpected: false
      },
      comparison: {
        basis: "normalized_runtime_evidence",
        runtimePreferred: true
      },
      mirrors: [
        "go-runtime/flogo-helper/main_test.go",
        "packages/flogo-graph/src/index.test.ts",
        "apps/control-plane/src/modules/flogo-apps/flogo-apps.service.test.ts",
        "apps/runner-worker/src/services/runner-executor.service.test.ts"
      ]
    }
  ),
  createRuntimeEvidenceCase(
    "runtime-002",
    "Direct-flow fallback on unsupported runtime shape",
    "Capture a trace for an unsupported direct-flow shape and assert simulated fallback plus comparison fallback metadata instead of runtime-backed evidence.",
    ["runtime_evidence", "direct_flow", "fallback", "simulated", "compare"],
    {
      family: "direct_flow",
      scenario: "fallback",
      operations: ["trace", "compare"],
      artifacts: ["run_trace", "run_comparison"],
      trace: {
        evidenceKind: "simulated_fallback",
        normalizedStepsExpected: false,
        fallbackReasonExpected: true,
        fallbackDiagnosticCode: "flogo.run_trace.runtime_fallback"
      },
      comparison: {
        basis: "simulated_fallback",
        runtimePreferred: false
      },
      mirrors: ["go-runtime/flogo-helper/main_test.go", "packages/flogo-graph/src/index.test.ts"]
    }
  ),
  createRuntimeEvidenceCase(
    "runtime-003",
    "REST runtime-backed request/response round trip",
    "Capture and replay a supported REST-triggered flow, then compare the artifacts on the REST request/reply envelope basis.",
    ["runtime_evidence", "rest", "runtime_backed", "request_reply", "replay", "compare"],
    {
      family: "rest",
      scenario: "supported",
      operations: ["trace", "replay", "compare"],
      artifacts: ["run_trace", "replay_report", "run_comparison"],
      trace: {
        evidenceKind: "runtime_backed",
        runtimeMode: "rest_trigger",
        normalizedStepsExpected: true,
        triggerEvidenceField: "restTriggerRuntime",
        fallbackReasonExpected: false
      },
      replay: {
        implemented: true,
        evidenceKind: "runtime_backed",
        runtimeMode: "rest_trigger_replay",
        normalizedStepsExpected: true,
        triggerEvidenceField: "restTriggerRuntime",
        fallbackReasonExpected: false
      },
      comparison: {
        basis: "rest_runtime_envelope",
        runtimePreferred: true
      },
      mirrors: [
        "go-runtime/flogo-helper/main_test.go",
        "packages/flogo-graph/src/index.test.ts",
        "apps/control-plane/src/modules/flogo-apps/flogo-apps.service.test.ts",
        "apps/runner-worker/src/services/runner-executor.service.test.ts"
      ]
    }
  ),
  createRuntimeEvidenceCase(
    "runtime-004",
    "REST fallback on unsupported handler shape",
    "Capture and replay an unsupported REST-trigger shape and assert that trace and replay both preserve simulated fallback evidence and reasons.",
    ["runtime_evidence", "rest", "fallback", "simulated", "replay"],
    {
      family: "rest",
      scenario: "fallback",
      operations: ["trace", "replay"],
      artifacts: ["run_trace", "replay_report"],
      trace: {
        evidenceKind: "simulated_fallback",
        normalizedStepsExpected: false,
        fallbackReasonExpected: true,
        fallbackDiagnosticCode: "flogo.run_trace.rest_trigger_runtime_fallback"
      },
      replay: {
        implemented: true,
        evidenceKind: "simulated_fallback",
        normalizedStepsExpected: false,
        fallbackReasonExpected: true
      },
      mirrors: ["go-runtime/flogo-helper/main_test.go", "apps/control-plane/src/modules/flogo-apps/flogo-apps.service.test.ts"]
    }
  ),
  createRuntimeEvidenceCase(
    "runtime-005",
    "Timer runtime-backed startup round trip",
    "Capture and replay a supported timer-trigger startup slice, then compare the artifacts on the timer startup basis.",
    ["runtime_evidence", "timer", "runtime_backed", "startup", "replay", "compare"],
    {
      family: "timer",
      scenario: "supported",
      operations: ["trace", "replay", "compare"],
      artifacts: ["run_trace", "replay_report", "run_comparison"],
      trace: {
        evidenceKind: "runtime_backed",
        runtimeMode: "timer_trigger",
        normalizedStepsExpected: true,
        triggerEvidenceField: "timerTriggerRuntime",
        fallbackReasonExpected: false
      },
      replay: {
        implemented: true,
        evidenceKind: "runtime_backed",
        runtimeMode: "timer_trigger_replay",
        normalizedStepsExpected: true,
        triggerEvidenceField: "timerTriggerRuntime",
        fallbackReasonExpected: false
      },
      comparison: {
        basis: "timer_runtime_startup",
        runtimePreferred: true
      },
      mirrors: [
        "go-runtime/flogo-helper/main_test.go",
        "packages/flogo-graph/src/index.test.ts",
        "apps/control-plane/src/modules/flogo-apps/flogo-apps.service.test.ts",
        "apps/runner-worker/src/services/runner-executor.service.test.ts"
      ]
    }
  ),
  createRuntimeEvidenceCase(
    "runtime-006",
    "Timer fallback on unsupported startup shape",
    "Capture a trace for an unsupported timer-trigger shape and assert simulated fallback metadata instead of timer runtime evidence.",
    ["runtime_evidence", "timer", "fallback", "simulated"],
    {
      family: "timer",
      scenario: "fallback",
      operations: ["trace"],
      artifacts: ["run_trace"],
      trace: {
        evidenceKind: "simulated_fallback",
        normalizedStepsExpected: false,
        fallbackReasonExpected: true,
        fallbackDiagnosticCode: "flogo.run_trace.timer_trigger_runtime_fallback"
      },
      mirrors: ["go-runtime/flogo-helper/main_test.go"]
    }
  ),
  createRuntimeEvidenceCase(
    "runtime-007",
    "CLI runtime-backed command round trip",
    "Capture and replay a supported CLI trigger command-entry slice and assert command identity, args/flags, mapped flow input, and reply evidence.",
    ["runtime_evidence", "cli", "runtime_backed", "args_flags", "replay"],
    {
      family: "cli",
      scenario: "supported",
      operations: ["trace", "replay"],
      artifacts: ["run_trace", "replay_report"],
      trace: {
        evidenceKind: "runtime_backed",
        runtimeMode: "cli_trigger",
        normalizedStepsExpected: true,
        triggerEvidenceField: "cliTriggerRuntime",
        fallbackReasonExpected: false
      },
      replay: {
        implemented: true,
        evidenceKind: "runtime_backed",
        runtimeMode: "cli_trigger_replay",
        normalizedStepsExpected: true,
        triggerEvidenceField: "cliTriggerRuntime",
        fallbackReasonExpected: false
      },
      mirrors: [
        "go-runtime/flogo-helper/main_test.go",
        "apps/control-plane/src/modules/flogo-apps/flogo-apps.service.test.ts",
        "apps/runner-worker/src/services/runner-executor.service.test.ts"
      ]
    }
  ),
  createRuntimeEvidenceCase(
    "runtime-008",
    "CLI fallback on unsupported command shape",
    "Capture and replay an unsupported CLI trigger shape and assert that both paths preserve simulated fallback metadata instead of claiming runtime backing.",
    ["runtime_evidence", "cli", "fallback", "simulated", "replay"],
    {
      family: "cli",
      scenario: "fallback",
      operations: ["trace", "replay"],
      artifacts: ["run_trace", "replay_report"],
      trace: {
        evidenceKind: "simulated_fallback",
        normalizedStepsExpected: false,
        fallbackReasonExpected: true,
        fallbackDiagnosticCode: "flogo.run_trace.cli_trigger_runtime_fallback"
      },
      replay: {
        implemented: true,
        evidenceKind: "simulated_fallback",
        normalizedStepsExpected: false,
        fallbackReasonExpected: true
      },
      mirrors: ["go-runtime/flogo-helper/main_test.go"]
    }
  ),
  createRuntimeEvidenceCase(
    "runtime-009",
    "Channel runtime-backed internal-event round trip",
    "Capture and replay a supported Channel trigger slice, then compare the artifacts on the channel runtime boundary basis.",
    ["runtime_evidence", "channel", "runtime_backed", "internal_event", "replay", "compare"],
    {
      family: "channel",
      scenario: "supported",
      operations: ["trace", "replay", "compare"],
      artifacts: ["run_trace", "replay_report", "run_comparison"],
      trace: {
        evidenceKind: "runtime_backed",
        runtimeMode: "channel_trigger",
        normalizedStepsExpected: true,
        triggerEvidenceField: "channelTriggerRuntime",
        fallbackReasonExpected: false
      },
      replay: {
        implemented: true,
        evidenceKind: "runtime_backed",
        runtimeMode: "channel_trigger_replay",
        normalizedStepsExpected: true,
        triggerEvidenceField: "channelTriggerRuntime",
        fallbackReasonExpected: false
      },
      comparison: {
        basis: "channel_runtime_boundary",
        runtimePreferred: true
      },
      mirrors: [
        "go-runtime/flogo-helper/main_test.go",
        "packages/flogo-graph/src/index.test.ts",
        "apps/control-plane/src/modules/flogo-apps/flogo-apps.service.test.ts",
        "apps/runner-worker/src/services/runner-executor.service.test.ts"
      ]
    }
  ),
  createRuntimeEvidenceCase(
    "runtime-010",
    "Channel fallback on unsupported topology",
    "Capture and replay an unsupported Channel trigger shape and assert that both paths fall back cleanly with preserved fallback reason metadata.",
    ["runtime_evidence", "channel", "fallback", "simulated", "replay"],
    {
      family: "channel",
      scenario: "fallback",
      operations: ["trace", "replay"],
      artifacts: ["run_trace", "replay_report"],
      trace: {
        evidenceKind: "simulated_fallback",
        normalizedStepsExpected: false,
        fallbackReasonExpected: true,
        fallbackDiagnosticCode: "flogo.run_trace.channel_trigger_runtime_fallback"
      },
      replay: {
        implemented: true,
        evidenceKind: "simulated_fallback",
        normalizedStepsExpected: false,
        fallbackReasonExpected: true
      },
      mirrors: ["go-runtime/flogo-helper/main_test.go"]
    }
  )
];

export const evalCases: EvalCase[] = [...workflowEvalCases, ...runtimeEvidenceEvalCases];

export function summarizeRuntimeEvidenceEvalCoverage(cases: EvalCase[] = runtimeEvidenceEvalCases): {
  total: number;
  runtimeCaseIds: string[];
  families: Record<RuntimeEvidenceFamily, { supported: number; fallback: number }>;
  comparisonBases: string[];
  traceRuntimeModes: string[];
  replayRuntimeModes: string[];
  fallbackCases: string[];
} {
  const families = {
    direct_flow: { supported: 0, fallback: 0 },
    rest: { supported: 0, fallback: 0 },
    timer: { supported: 0, fallback: 0 },
    cli: { supported: 0, fallback: 0 },
    channel: { supported: 0, fallback: 0 }
  } satisfies Record<RuntimeEvidenceFamily, Record<RuntimeEvidenceScenario, number>>;

  const comparisonBases = new Set<string>();
  const traceRuntimeModes = new Set<string>();
  const replayRuntimeModes = new Set<string>();
  const fallbackCases = new Set<string>();
  const runtimeCaseIds: string[] = [];

  for (const evalCase of cases) {
    const runtimeEvidence = evalCase.runtimeEvidence;
    if (!runtimeEvidence) {
      continue;
    }
    runtimeCaseIds.push(evalCase.id);
    families[runtimeEvidence.family][runtimeEvidence.scenario] += 1;
    if (runtimeEvidence.trace.runtimeMode) {
      traceRuntimeModes.add(runtimeEvidence.trace.runtimeMode);
    }
    if (runtimeEvidence.replay?.runtimeMode) {
      replayRuntimeModes.add(runtimeEvidence.replay.runtimeMode);
    }
    if (runtimeEvidence.comparison?.basis) {
      comparisonBases.add(runtimeEvidence.comparison.basis);
    }
    if (runtimeEvidence.trace.evidenceKind === "simulated_fallback") {
      fallbackCases.add(evalCase.id);
    }
  }

  return {
    total: runtimeCaseIds.length,
    runtimeCaseIds,
    families,
    comparisonBases: [...comparisonBases].sort(),
    traceRuntimeModes: [...traceRuntimeModes].sort(),
    replayRuntimeModes: [...replayRuntimeModes].sort(),
    fallbackCases: [...fallbackCases].sort()
  };
}

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
