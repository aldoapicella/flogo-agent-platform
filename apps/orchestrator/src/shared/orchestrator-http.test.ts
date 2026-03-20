import { describe, expect, it } from "vitest";

import { type OrchestratorStartRequest } from "@flogo-agent/contracts";

import { buildRunnerJobSpec, resolveWorkflowRunnerSteps } from "./orchestrator-http.js";

describe("orchestrator-http", () => {
  it("forces trigger binding analysis jobs to plan mode and omits triggerName", () => {
    const spec = buildRunnerJobSpec(
      {
        taskId: "task-1",
        request: {
          type: "review",
          projectId: "demo",
          requestedBy: "operator",
          summary: "Plan trigger binding",
          inputs: {
            mode: "trigger_binding_plan",
            flowId: "hello",
            validateOnly: false,
            replaceExisting: true,
            handlerName: "post_hello",
            triggerId: "flogo-rest-hello",
            triggerName: "deprecated-name",
            profile: {
              kind: "rest",
              method: "POST",
              path: "/hello",
              port: 8081,
              replyMode: "json",
              requestMappingMode: "auto",
              replyMappingMode: "auto"
            }
          },
          constraints: {
            allowDependencyChanges: false,
            allowCustomCode: false,
            targetEnv: "dev",
            requireApproval: true
          }
        },
        requiredApprovals: [],
        planSummary: "Plan trigger binding",
        steps: []
      },
      "bind_trigger"
    );

    expect(spec.analysisKind).toBe("trigger_binding_plan");
    expect(spec.analysisPayload?.validateOnly).toBe(true);
    expect(spec.analysisPayload?.handlerName).toBe("post_hello");
    expect(spec.analysisPayload?.triggerId).toBe("flogo-rest-hello");
    expect(Object.prototype.hasOwnProperty.call(spec.analysisPayload ?? {}, "triggerName")).toBe(false);
  });

  it("routes diagnosis mode to a single analysis-only diagnosis step with inferred symptom and trigger family", () => {
    const start: OrchestratorStartRequest = {
      taskId: "task-diagnosis",
      request: {
        type: "debug",
        projectId: "demo",
        requestedBy: "operator",
        summary: "Why is the HTTP response wrong for this REST flow?",
        inputs: {
          mode: "diagnosis",
          flowId: "hello",
          sampleInput: {
            payload: "hi"
          }
        },
        constraints: {
          allowDependencyChanges: false,
          allowCustomCode: false,
          targetEnv: "dev",
          requireApproval: true
        }
      },
      requiredApprovals: [],
      planSummary: "Diagnose runtime issue",
      steps: []
    };

    expect(resolveWorkflowRunnerSteps(start)).toEqual(["diagnose_app"]);

    const spec = buildRunnerJobSpec(start, "diagnose_app");

    expect(spec.jobKind).toBe("diagnosis");
    expect(spec.analysisKind).toBe("diagnosis");
    expect(spec.analysisPayload?.symptom).toBe("wrong_response");
    expect(spec.analysisPayload?.triggerFamily).toBe("rest");
    expect(spec.analysisPayload?.flowId).toBe("hello");
  });
});
