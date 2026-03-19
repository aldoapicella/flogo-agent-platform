import { describe, expect, it } from "vitest";

import { buildRunnerJobSpec } from "./orchestrator-http.js";

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
});
