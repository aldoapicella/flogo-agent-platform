import {
  EvalCaseSchema,
  type DiagnosisConfidenceLevel,
  type DiagnosisEvidenceQuality,
  type DiagnosisProblemCategory,
  type DiagnosisSubtype,
  type EvalCase
} from "@flogo-agent/contracts";

type RuntimeEvidenceMetadata = NonNullable<EvalCase["runtimeEvidence"]>;
type RuntimeEvidenceMetadataInput = Omit<RuntimeEvidenceMetadata, "operations" | "artifacts" | "mirrors"> &
  Partial<Pick<RuntimeEvidenceMetadata, "operations" | "artifacts" | "mirrors">>;
type RuntimeEvidenceFamily = RuntimeEvidenceMetadata["family"];
type RuntimeEvidenceScenario = RuntimeEvidenceMetadata["scenario"];
type DiagnosisCaseFamily = RuntimeEvidenceFamily;
type DiagnosisCaseScenario = RuntimeEvidenceScenario;

type DiagnosisEvalCase = {
  case: EvalCase;
  diagnosis: {
    family: DiagnosisCaseFamily;
    scenario: DiagnosisCaseScenario;
    category: DiagnosisProblemCategory;
    subtype: DiagnosisSubtype;
    evidenceQuality: DiagnosisEvidenceQuality;
    confidenceBand: DiagnosisConfidenceLevel;
    recommendationShape: "minimal_patch" | "minimal_probe" | "fallback_only";
  };
};

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

function createDiagnosisCase(
  id: string,
  title: string,
  prompt: string,
  expectedSignals: string[],
  diagnosis: DiagnosisEvalCase["diagnosis"],
  runtimeEvidence: RuntimeEvidenceMetadataInput
): DiagnosisEvalCase {
  const runtimeCase = createRuntimeEvidenceCase(id, title, prompt, expectedSignals, runtimeEvidence);
  return {
    case: EvalCaseSchema.parse({
      ...runtimeCase,
      suite: "diagnosis"
    }),
    diagnosis
  };
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

export const diagnosisEvalCases: DiagnosisEvalCase[] = [
  createDiagnosisCase(
    "diagnosis-001",
    "Direct-flow runtime diagnosis",
    "Diagnose a failing direct-flow task using runtime-backed trace and compare evidence, then recommend the smallest patch that fixes the failing step.",
    [
      "diagnosis",
      "family:direct_flow",
      "category:activity",
      "subtype:step_failure",
      "confidence:high",
      "evidence:runtime_backed"
    ],
    {
      family: "direct_flow",
      scenario: "supported",
      category: "activity",
      subtype: "step_failure",
      evidenceQuality: "runtime_backed",
      confidenceBand: "high",
      recommendationShape: "minimal_patch"
    },
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
        "packages/flogo-graph/src/index.test.ts",
        "apps/runner-worker/src/services/runner-executor.service.test.ts",
        "apps/web-console/lib/diagnosis.test.ts"
      ]
    }
  ),
  createDiagnosisCase(
    "diagnosis-002",
    "Direct-flow fallback diagnosis",
    "Diagnose an unsupported direct-flow shape and make the diagnosis explicitly low confidence because the runtime proof path fell back to simulation.",
    [
      "diagnosis",
      "family:direct_flow",
      "category:runtime",
      "subtype:unsupported_shape",
      "confidence:low",
      "evidence:simulated_fallback"
    ],
    {
      family: "direct_flow",
      scenario: "fallback",
      category: "runtime",
      subtype: "unsupported_shape",
      evidenceQuality: "simulated_fallback",
      confidenceBand: "low",
      recommendationShape: "fallback_only"
    },
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
      mirrors: ["packages/flogo-graph/src/index.test.ts", "apps/web-console/lib/diagnosis.test.ts"]
    }
  ),
  createDiagnosisCase(
    "diagnosis-003",
    "REST mapping diagnosis",
    "Diagnose a wrong REST response by checking trigger-to-flow mapping, then recommend the minimal mapping correction and a supporting compare.",
    [
      "diagnosis",
      "family:rest",
      "category:mapping",
      "subtype:reply_mapping_mismatch",
      "confidence:high",
      "evidence:runtime_backed"
    ],
    {
      family: "rest",
      scenario: "supported",
      category: "mapping",
      subtype: "reply_mapping_mismatch",
      evidenceQuality: "runtime_backed",
      confidenceBand: "high",
      recommendationShape: "minimal_patch"
    },
    {
      family: "rest",
      scenario: "supported",
      operations: ["trace", "replay", "compare"],
      artifacts: ["run_trace", "run_comparison"],
      trace: {
        evidenceKind: "runtime_backed",
        runtimeMode: "rest_trigger",
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
        "apps/web-console/components/diagnosis-panel.test.tsx"
      ]
    }
  ),
  createDiagnosisCase(
    "diagnosis-004",
    "REST fallback diagnosis",
    "Diagnose an unsupported REST shape and keep the diagnosis low confidence because the evidence path fell back to simulation.",
    [
      "diagnosis",
      "family:rest",
      "category:runtime",
      "subtype:fallback_to_simulation",
      "confidence:low",
      "evidence:simulated_fallback"
    ],
    {
      family: "rest",
      scenario: "fallback",
      category: "runtime",
      subtype: "fallback_to_simulation",
      evidenceQuality: "simulated_fallback",
      confidenceBand: "low",
      recommendationShape: "fallback_only"
    },
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
      mirrors: ["go-runtime/flogo-helper/main_test.go", "apps/web-console/lib/diagnosis.test.ts"]
    }
  ),
  createDiagnosisCase(
    "diagnosis-005",
    "Timer startup diagnosis",
    "Diagnose a scheduled-flow problem by checking timer startup evidence and recommend the smallest schedule correction.",
    [
      "diagnosis",
      "family:timer",
      "category:trigger",
      "subtype:timer_startup_mismatch",
      "confidence:high",
      "evidence:runtime_backed"
    ],
    {
      family: "timer",
      scenario: "supported",
      category: "trigger",
      subtype: "timer_startup_mismatch",
      evidenceQuality: "runtime_backed",
      confidenceBand: "high",
      recommendationShape: "minimal_patch"
    },
    {
      family: "timer",
      scenario: "supported",
      operations: ["trace", "replay", "compare"],
      artifacts: ["run_trace", "replay_report"],
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
      mirrors: [
        "go-runtime/flogo-helper/main_test.go",
        "packages/flogo-graph/src/index.test.ts",
        "apps/runner-worker/src/services/runner-executor.service.test.ts"
      ]
    }
  ),
  createDiagnosisCase(
    "diagnosis-006",
    "Timer fallback diagnosis",
    "Diagnose an unsupported timer shape and explicitly lower confidence because the evidence path was simulated.",
    [
      "diagnosis",
      "family:timer",
      "category:runtime",
      "subtype:unsupported_shape",
      "confidence:low",
      "evidence:simulated_fallback"
    ],
    {
      family: "timer",
      scenario: "fallback",
      category: "runtime",
      subtype: "unsupported_shape",
      evidenceQuality: "simulated_fallback",
      confidenceBand: "low",
      recommendationShape: "fallback_only"
    },
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
  createDiagnosisCase(
    "diagnosis-007",
    "CLI entrypoint diagnosis",
    "Diagnose a command-entry issue by checking CLI args and flags, then recommend the minimal handler correction.",
    [
      "diagnosis",
      "family:cli",
      "category:trigger",
      "subtype:cli_boundary_mismatch",
      "confidence:high",
      "evidence:runtime_backed"
    ],
    {
      family: "cli",
      scenario: "supported",
      category: "trigger",
      subtype: "cli_boundary_mismatch",
      evidenceQuality: "runtime_backed",
      confidenceBand: "high",
      recommendationShape: "minimal_patch"
    },
    {
      family: "cli",
      scenario: "supported",
      operations: ["trace", "replay", "compare"],
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
  createDiagnosisCase(
    "diagnosis-008",
    "CLI fallback diagnosis",
    "Diagnose an unsupported CLI shape and keep the confidence low because the trace path had to simulate the runtime boundary.",
    [
      "diagnosis",
      "family:cli",
      "category:runtime",
      "subtype:unsupported_shape",
      "confidence:low",
      "evidence:simulated_fallback"
    ],
    {
      family: "cli",
      scenario: "fallback",
      category: "runtime",
      subtype: "unsupported_shape",
      evidenceQuality: "simulated_fallback",
      confidenceBand: "low",
      recommendationShape: "fallback_only"
    },
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
  createDiagnosisCase(
    "diagnosis-009",
    "Channel boundary diagnosis",
    "Diagnose an internal-event channel problem by checking the channel boundary and recommend the smallest wiring correction.",
    [
      "diagnosis",
      "family:channel",
      "category:trigger",
      "subtype:channel_boundary_mismatch",
      "confidence:high",
      "evidence:runtime_backed"
    ],
    {
      family: "channel",
      scenario: "supported",
      category: "trigger",
      subtype: "channel_boundary_mismatch",
      evidenceQuality: "runtime_backed",
      confidenceBand: "high",
      recommendationShape: "minimal_patch"
    },
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
        "apps/web-console/components/diagnosis-panel.test.tsx"
      ]
    }
  ),
  createDiagnosisCase(
    "diagnosis-010",
    "Channel fallback diagnosis",
    "Diagnose an unsupported channel topology and keep the confidence low because the runtime evidence was simulated.",
    [
      "diagnosis",
      "family:channel",
      "category:runtime",
      "subtype:fallback_to_simulation",
      "confidence:low",
      "evidence:simulated_fallback"
    ],
    {
      family: "channel",
      scenario: "fallback",
      category: "runtime",
      subtype: "fallback_to_simulation",
      evidenceQuality: "simulated_fallback",
      confidenceBand: "low",
      recommendationShape: "fallback_only"
    },
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

export const evalCases: EvalCase[] = [...workflowEvalCases, ...runtimeEvidenceEvalCases, ...diagnosisEvalCases.map((entry) => entry.case)];

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

export function summarizeDiagnosisEvalCoverage(cases: DiagnosisEvalCase[] = diagnosisEvalCases): {
  total: number;
  caseIds: string[];
  families: Record<DiagnosisCaseFamily, { supported: number; fallback: number }>;
  confidenceBands: Record<DiagnosisConfidenceLevel, number>;
  evidenceQualities: Record<DiagnosisEvidenceQuality, number>;
  categories: Record<DiagnosisProblemCategory, number>;
  subtypes: Record<DiagnosisSubtype, number>;
  fallbackCases: string[];
  recommendationShapes: Record<DiagnosisEvalCase["diagnosis"]["recommendationShape"], number>;
} {
  const families = {
    direct_flow: { supported: 0, fallback: 0 },
    rest: { supported: 0, fallback: 0 },
    timer: { supported: 0, fallback: 0 },
    cli: { supported: 0, fallback: 0 },
    channel: { supported: 0, fallback: 0 }
  } satisfies Record<DiagnosisCaseFamily, Record<DiagnosisCaseScenario, number>>;
  const confidenceBands: Record<DiagnosisConfidenceLevel, number> = {
    certain: 0,
    high: 0,
    medium: 0,
    low: 0
  };
  const evidenceQualities: Record<DiagnosisEvidenceQuality, number> = {
    runtime_backed: 0,
    simulated_fallback: 0,
    artifact_backed: 0,
    mixed: 0
  };
  const categories: Record<DiagnosisProblemCategory, number> = {
    model: 0,
    reference: 0,
    mapping: 0,
    trigger: 0,
    activity: 0,
    runtime: 0,
    behavioral: 0
  };
  const subtypes: Record<DiagnosisSubtype, number> = {
    contract_validation_failure: 0,
    parse_or_resolution_failure: 0,
    input_resolution_mismatch: 0,
    reply_mapping_mismatch: 0,
    rest_envelope_mismatch: 0,
    timer_startup_mismatch: 0,
    cli_boundary_mismatch: 0,
    channel_boundary_mismatch: 0,
    step_failure: 0,
    behavioral_regression: 0,
    fallback_to_simulation: 0,
    unsupported_shape: 0,
    insufficient_evidence: 0
  };
  const recommendationShapes: Record<DiagnosisEvalCase["diagnosis"]["recommendationShape"], number> = {
    minimal_patch: 0,
    minimal_probe: 0,
    fallback_only: 0
  };
  const fallbackCases = new Set<string>();
  const caseIds: string[] = [];

  for (const diagnosisCase of cases) {
    caseIds.push(diagnosisCase.case.id);
    families[diagnosisCase.diagnosis.family][diagnosisCase.diagnosis.scenario] += 1;
    confidenceBands[diagnosisCase.diagnosis.confidenceBand] += 1;
    evidenceQualities[diagnosisCase.diagnosis.evidenceQuality] += 1;
    categories[diagnosisCase.diagnosis.category] += 1;
    subtypes[diagnosisCase.diagnosis.subtype] += 1;
    recommendationShapes[diagnosisCase.diagnosis.recommendationShape] += 1;
    if (diagnosisCase.diagnosis.scenario === "fallback") {
      fallbackCases.add(diagnosisCase.case.id);
    }
  }

  return {
    total: cases.length,
    caseIds,
    families,
    confidenceBands,
    evidenceQualities,
    categories,
    subtypes,
    fallbackCases: [...fallbackCases].sort(),
    recommendationShapes
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
