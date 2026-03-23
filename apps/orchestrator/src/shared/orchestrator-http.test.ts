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

  it("routes validate_contrib mode to the shared contribution validation runner step", () => {
    const start: OrchestratorStartRequest = {
      taskId: "task-validate-contrib",
      request: {
        type: "review",
        projectId: "demo",
        requestedBy: "operator",
        summary: "Validate a scaffolded contribution bundle",
        inputs: {
          mode: "validate_contrib",
          bundleArtifactId: "artifact-1",
          bundleArtifact: {
            id: "artifact-1",
            type: "contrib_bundle",
            name: "action-bundle-flowaction",
            uri: "memory://task/action-bundle-flowaction.json",
            metadata: {
              result: {
                bundle: {
                  kind: "action",
                  packageName: "flowaction"
                }
              }
            }
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
      planSummary: "Validate contribution bundle",
      steps: []
    };

    expect(resolveWorkflowRunnerSteps(start)).toEqual(["validate_contrib"]);

    const spec = buildRunnerJobSpec(start, "validate_contrib");

    expect(spec.jobKind).toBe("contrib_validation");
    expect(spec.analysisKind).toBe("validate_contrib");
    expect(spec.analysisPayload).toMatchObject({
      bundleArtifactId: "artifact-1"
    });
    expect(spec.analysisPayload?.bundleArtifact).toMatchObject({
      id: "artifact-1",
      type: "contrib_bundle"
    });
  });

  it("routes package_contrib mode to the shared contribution packaging runner step", () => {
    const start: OrchestratorStartRequest = {
      taskId: "task-package-contrib",
      request: {
        type: "review",
        projectId: "demo",
        requestedBy: "operator",
        summary: "Package a scaffolded contribution bundle",
        inputs: {
          mode: "package_contrib",
          bundleArtifactId: "artifact-2",
          format: "zip"
        },
        constraints: {
          allowDependencyChanges: false,
          allowCustomCode: false,
          targetEnv: "dev",
          requireApproval: true
        }
      },
      requiredApprovals: [],
      planSummary: "Package contribution bundle",
      steps: []
    };

    expect(resolveWorkflowRunnerSteps(start)).toEqual(["package_contrib"]);

    const spec = buildRunnerJobSpec(start, "package_contrib");

    expect(spec.jobKind).toBe("contrib_package");
    expect(spec.analysisKind).toBe("package_contrib");
    expect(spec.analysisPayload).toMatchObject({
      bundleArtifactId: "artifact-2",
      format: "zip"
    });
  });

  it("routes install_contrib_plan mode to the shared contribution install-planning runner step", () => {
    const start: OrchestratorStartRequest = {
      taskId: "task-install-contrib-plan",
      request: {
        type: "review",
        projectId: "demo",
        appId: "hello-rest",
        appPath: "examples/hello-rest/flogo.json",
        requestedBy: "operator",
        summary: "Plan how to install a packaged contribution into the target app",
        inputs: {
          mode: "install_contrib_plan",
          packageArtifactId: "artifact-3",
          preferredAlias: "webhooktrigger",
          replaceExisting: false
        },
        constraints: {
          allowDependencyChanges: false,
          allowCustomCode: false,
          targetEnv: "dev",
          requireApproval: true
        }
      },
      requiredApprovals: [],
      planSummary: "Plan contribution install",
      steps: []
    };

    expect(resolveWorkflowRunnerSteps(start)).toEqual(["install_contrib_plan"]);

    const spec = buildRunnerJobSpec(start, "install_contrib_plan");

    expect(spec.jobKind).toBe("contrib_install_plan");
    expect(spec.analysisKind).toBe("install_contrib_plan");
    expect(spec.analysisPayload).toMatchObject({
      packageArtifactId: "artifact-3",
      preferredAlias: "webhooktrigger",
      replaceExisting: false,
      targetApp: {
        projectId: "demo",
        appId: "hello-rest",
        appPath: "examples/hello-rest/flogo.json"
      }
    });
  });

  it("routes install_contrib_diff_plan mode to the exact canonical diff-preview runner step", () => {
    const start: OrchestratorStartRequest = {
      taskId: "task-install-contrib-diff-plan",
      request: {
        type: "review",
        projectId: "demo",
        appId: "hello-rest",
        appPath: "examples/hello-rest/flogo.json",
        requestedBy: "operator",
        summary: "Preview the exact canonical install diff for a packaged contribution",
        inputs: {
          mode: "install_contrib_diff_plan",
          installPlanArtifactId: "artifact-install-plan-4"
        },
        constraints: {
          allowDependencyChanges: false,
          allowCustomCode: false,
          targetEnv: "dev",
          requireApproval: true
        }
      },
      requiredApprovals: [],
      planSummary: "Preview contribution install diff",
      steps: []
    };

    expect(resolveWorkflowRunnerSteps(start)).toEqual(["install_contrib_diff_plan"]);

    const spec = buildRunnerJobSpec(start, "install_contrib_diff_plan");

    expect(spec.jobKind).toBe("contrib_install_diff_plan");
    expect(spec.analysisKind).toBe("install_contrib_diff_plan");
    expect(spec.analysisPayload).toMatchObject({
      installPlanArtifactId: "artifact-install-plan-4",
      targetApp: {
        projectId: "demo",
        appId: "hello-rest",
        appPath: "examples/hello-rest/flogo.json"
      }
    });
  });

  it("routes install_contrib_apply mode to the approval-gated canonical apply runner step", () => {
    const start: OrchestratorStartRequest = {
      taskId: "task-install-contrib-apply",
      request: {
        type: "update",
        projectId: "demo",
        appId: "hello-rest",
        appPath: "examples/hello-rest/flogo.json",
        requestedBy: "operator",
        summary: "Apply the approved contribution install diff",
        inputs: {
          mode: "install_contrib_apply",
          installDiffArtifactId: "artifact-install-diff-5"
        },
        constraints: {
          allowDependencyChanges: false,
          allowCustomCode: false,
          targetEnv: "dev",
          requireApproval: true
        }
      },
      requiredApprovals: ["install_contribution"],
      planSummary: "Apply contribution install diff",
      steps: []
    };

    expect(resolveWorkflowRunnerSteps(start)).toEqual(["install_contrib_apply"]);

    const spec = buildRunnerJobSpec(start, "install_contrib_apply");

    expect(spec.jobKind).toBe("contrib_install_apply");
    expect(spec.analysisKind).toBe("install_contrib_apply");
    expect(spec.analysisPayload).toMatchObject({
      installDiffArtifactId: "artifact-install-diff-5",
      targetApp: {
        projectId: "demo",
        appId: "hello-rest",
        appPath: "examples/hello-rest/flogo.json"
      }
    });
  });

  it("routes update_contrib_apply mode to the approval-gated canonical update apply runner step", () => {
    const start: OrchestratorStartRequest = {
      taskId: "task-update-contrib-apply",
      request: {
        type: "update",
        projectId: "demo",
        appId: "hello-rest",
        appPath: "examples/hello-rest/flogo.json",
        requestedBy: "operator",
        summary: "Apply the approved contribution update diff",
        inputs: {
          mode: "update_contrib_apply",
          updateDiffPlanArtifactId: "artifact-update-diff-5"
        },
        constraints: {
          allowDependencyChanges: false,
          allowCustomCode: false,
          targetEnv: "dev",
          requireApproval: true
        }
      },
      requiredApprovals: ["update_contribution"],
      planSummary: "Apply contribution update diff",
      steps: []
    };

    expect(resolveWorkflowRunnerSteps(start)).toEqual(["update_contrib_apply"]);

    const spec = buildRunnerJobSpec(start, "update_contrib_apply");

    expect(spec.jobKind).toBe("contrib_update_apply");
    expect(spec.analysisKind).toBe("update_contrib_apply");
    expect(spec.analysisPayload).toMatchObject({
      updateDiffPlanArtifactId: "artifact-update-diff-5",
      targetApp: {
        projectId: "demo",
        appId: "hello-rest",
        appPath: "examples/hello-rest/flogo.json"
      }
    });
  });

  it("routes update_contrib_plan mode to the shared contribution update-planning runner step", () => {
    const start: OrchestratorStartRequest = {
      taskId: "task-update-contrib-plan",
      request: {
        type: "review",
        projectId: "demo",
        appId: "hello-rest",
        appPath: "examples/hello-rest/flogo.json",
        requestedBy: "operator",
        summary: "Plan how to update an installed contribution in the target app",
        inputs: {
          mode: "update_contrib_plan",
          packageArtifactId: "artifact-6",
          preferredAlias: "webhooktrigger",
          replaceExisting: true
        },
        constraints: {
          allowDependencyChanges: false,
          allowCustomCode: false,
          targetEnv: "dev",
          requireApproval: true
        }
      },
      requiredApprovals: [],
      planSummary: "Plan contribution update",
      steps: []
    };

    expect(resolveWorkflowRunnerSteps(start)).toEqual(["update_contrib_plan"]);

    const spec = buildRunnerJobSpec(start, "update_contrib_plan");

    expect(spec.jobKind).toBe("contrib_update_plan");
    expect(spec.analysisKind).toBe("update_contrib_plan");
    expect(spec.analysisPayload).toMatchObject({
      packageArtifactId: "artifact-6",
      preferredAlias: "webhooktrigger",
      replaceExisting: true,
      targetApp: {
        projectId: "demo",
        appId: "hello-rest",
        appPath: "examples/hello-rest/flogo.json"
      }
    });
  });

  it("routes uninstall_contrib_plan mode to the shared contribution uninstall-planning runner step", () => {
    const start: OrchestratorStartRequest = {
      taskId: "task-uninstall-contrib-plan",
      request: {
        type: "review",
        projectId: "demo",
        appId: "hello-rest",
        appPath: "examples/hello-rest/flogo.json",
        requestedBy: "operator",
        summary: "Plan how to uninstall an installed contribution from the target app",
        inputs: {
          mode: "uninstall_contrib_plan",
          selection: {
            alias: "webhooktrigger",
            ref: "example.com/acme/webhook"
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
      planSummary: "Plan contribution uninstall",
      steps: []
    };

    expect(resolveWorkflowRunnerSteps(start)).toEqual(["uninstall_contrib_plan"]);

    const spec = buildRunnerJobSpec(start, "uninstall_contrib_plan");

    expect(spec.jobKind).toBe("contrib_uninstall_plan");
    expect(spec.analysisKind).toBe("uninstall_contrib_plan");
    expect(spec.analysisPayload).toMatchObject({
      selection: {
        alias: "webhooktrigger",
        ref: "example.com/acme/webhook"
      },
      targetApp: {
        projectId: "demo",
        appId: "hello-rest",
        appPath: "examples/hello-rest/flogo.json"
      }
    });
  });

  it("routes update_contrib_diff_plan mode to the exact canonical update diff-preview runner step", () => {
    const start: OrchestratorStartRequest = {
      taskId: "task-update-contrib-diff-plan",
      request: {
        type: "review",
        projectId: "demo",
        appId: "hello-rest",
        appPath: "examples/hello-rest/flogo.json",
        requestedBy: "operator",
        summary: "Preview the exact canonical update diff for an installed contribution",
        inputs: {
          mode: "update_contrib_diff_plan",
          updatePlanArtifactId: "artifact-update-plan-7"
        },
        constraints: {
          allowDependencyChanges: false,
          allowCustomCode: false,
          targetEnv: "dev",
          requireApproval: true
        }
      },
      requiredApprovals: [],
      planSummary: "Preview contribution update diff",
      steps: []
    };

    expect(resolveWorkflowRunnerSteps(start)).toEqual(["update_contrib_diff_plan"]);

    const spec = buildRunnerJobSpec(start, "update_contrib_diff_plan");

    expect(spec.jobKind).toBe("contrib_update_diff_plan");
    expect(spec.analysisKind).toBe("update_contrib_diff_plan");
    expect(spec.analysisPayload).toMatchObject({
      updatePlanArtifactId: "artifact-update-plan-7",
      targetApp: {
        projectId: "demo",
        appId: "hello-rest",
        appPath: "examples/hello-rest/flogo.json"
      }
    });
  });
});
