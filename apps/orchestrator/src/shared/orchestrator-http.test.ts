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
    expect(spec.analysisPayload?.symptom).toBe("unexpected_output");
    expect(spec.analysisPayload?.triggerFamily).toBe("rest");
    expect(spec.analysisPayload?.flowId).toBe("hello");
  });

  it("routes activity scaffold mode to the custom contribution runner step", () => {
    const start: OrchestratorStartRequest = {
      taskId: "task-activity-scaffold",
      request: {
        type: "create",
        projectId: "demo",
        requestedBy: "operator",
        summary: "Scaffold an activity bundle",
        inputs: {
          mode: "activity_scaffold",
          activityName: "Echo Message",
          modulePath: "example.com/acme/echo",
          packageName: "echoactivity",
          title: "Echo Message",
          description: "Formats a greeting",
          version: "0.1.0",
          homepage: "https://example.com/echo",
          usage: "Use this activity to format greetings.",
          settings: [{ name: "prefix", type: "string", required: true }],
          inputs: [{ name: "message", type: "string", required: true }],
          outputs: [{ name: "message", type: "string" }]
        },
        constraints: {
          allowDependencyChanges: false,
          allowCustomCode: false,
          targetEnv: "dev",
          requireApproval: true
        }
      },
      requiredApprovals: [],
      planSummary: "Scaffold activity bundle",
      steps: []
    };

    expect(resolveWorkflowRunnerSteps(start)).toEqual(["scaffold_activity"]);

    const spec = buildRunnerJobSpec(start, "scaffold_activity");

    expect(spec.jobKind).toBe("custom_contrib");
    expect(spec.analysisKind).toBe("activity_scaffold");
    expect(spec.analysisPayload).toMatchObject({
      activityName: "Echo Message",
      modulePath: "example.com/acme/echo",
      packageName: "echoactivity",
      title: "Echo Message",
      description: "Formats a greeting",
      version: "0.1.0",
      homepage: "https://example.com/echo",
      usage: "Use this activity to format greetings."
    });
    expect(spec.analysisPayload?.settings).toEqual([{ name: "prefix", type: "string", required: true }]);
    expect(spec.analysisPayload?.inputs).toEqual([{ name: "message", type: "string", required: true }]);
    expect(spec.analysisPayload?.outputs).toEqual([{ name: "message", type: "string" }]);
  });

  it("routes trigger scaffold mode to the custom contribution runner step", () => {
    const start: OrchestratorStartRequest = {
      taskId: "task-trigger-scaffold",
      request: {
        type: "create",
        projectId: "demo",
        requestedBy: "operator",
        summary: "Scaffold a trigger bundle",
        inputs: {
          mode: "trigger_scaffold",
          triggerName: "Webhook Trigger",
          modulePath: "example.com/acme/webhook",
          packageName: "webhooktrigger",
          title: "Webhook Trigger",
          description: "Dispatches an internal webhook event",
          version: "0.1.0",
          homepage: "https://example.com/webhook",
          usage: "Bind this trigger to one flow handler.",
          settings: [{ name: "basePath", type: "string", required: true }],
          handlerSettings: [{ name: "route", type: "string", required: true }],
          outputs: [{ name: "payload", type: "object" }],
          replies: [{ name: "status", type: "integer" }]
        },
        constraints: {
          allowDependencyChanges: false,
          allowCustomCode: false,
          targetEnv: "dev",
          requireApproval: true
        }
      },
      requiredApprovals: [],
      planSummary: "Scaffold trigger bundle",
      steps: []
    };

    expect(resolveWorkflowRunnerSteps(start)).toEqual(["scaffold_trigger"]);

    const spec = buildRunnerJobSpec(start, "scaffold_trigger");

    expect(spec.jobKind).toBe("custom_contrib");
    expect(spec.analysisKind).toBe("trigger_scaffold");
    expect(spec.analysisPayload).toMatchObject({
      triggerName: "Webhook Trigger",
      modulePath: "example.com/acme/webhook",
      packageName: "webhooktrigger",
      title: "Webhook Trigger",
      description: "Dispatches an internal webhook event",
      version: "0.1.0",
      homepage: "https://example.com/webhook",
      usage: "Bind this trigger to one flow handler."
    });
    expect(spec.analysisPayload?.settings).toEqual([{ name: "basePath", type: "string", required: true }]);
    expect(spec.analysisPayload?.handlerSettings).toEqual([{ name: "route", type: "string", required: true }]);
    expect(spec.analysisPayload?.outputs).toEqual([{ name: "payload", type: "object" }]);
    expect(spec.analysisPayload?.replies).toEqual([{ name: "status", type: "integer" }]);
  });

  it("routes action scaffold mode to the custom contribution runner step", () => {
    const start: OrchestratorStartRequest = {
      taskId: "task-action-scaffold",
      request: {
        type: "create",
        projectId: "demo",
        requestedBy: "operator",
        summary: "Scaffold an action bundle",
        inputs: {
          mode: "action_scaffold",
          actionName: "Flow Action",
          modulePath: "example.com/acme/flow-action",
          packageName: "flowaction",
          title: "Flow Action",
          description: "Executes reusable flow work",
          version: "0.1.0",
          homepage: "https://example.com/flow-action",
          usage: "Reference this action from a trigger handler.",
          settings: [{ name: "mode", type: "string", required: true }],
          inputs: [{ name: "payload", type: "object", required: true }],
          outputs: [{ name: "result", type: "object" }]
        },
        constraints: {
          allowDependencyChanges: false,
          allowCustomCode: false,
          targetEnv: "dev",
          requireApproval: true
        }
      },
      requiredApprovals: [],
      planSummary: "Scaffold action bundle",
      steps: []
    };

    expect(resolveWorkflowRunnerSteps(start)).toEqual(["scaffold_action"]);

    const spec = buildRunnerJobSpec(start, "scaffold_action");

    expect(spec.jobKind).toBe("custom_contrib");
    expect(spec.analysisKind).toBe("action_scaffold");
    expect(spec.analysisPayload).toMatchObject({
      actionName: "Flow Action",
      modulePath: "example.com/acme/flow-action",
      packageName: "flowaction",
      title: "Flow Action",
      description: "Executes reusable flow work",
      version: "0.1.0",
      homepage: "https://example.com/flow-action",
      usage: "Reference this action from a trigger handler."
    });
    expect(spec.analysisPayload?.settings).toEqual([{ name: "mode", type: "string", required: true }]);
    expect(spec.analysisPayload?.inputs).toEqual([{ name: "payload", type: "object", required: true }]);
    expect(spec.analysisPayload?.outputs).toEqual([{ name: "result", type: "object" }]);
  });
});
