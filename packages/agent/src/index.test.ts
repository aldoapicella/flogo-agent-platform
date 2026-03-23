import { describe, expect, it } from "vitest";

import { TaskPlanner } from "./index.js";

describe("TaskPlanner diagnosis mode", () => {
  it("treats explicit diagnosis mode as analysis-only", () => {
    const planner = new TaskPlanner();
    const plan = planner.plan({
      type: "debug",
      projectId: "demo",
      requestedBy: "operator",
      summary: "Diagnose why the REST response is wrong",
      inputs: {
        mode: "diagnosis",
        symptom: "wrong_response",
        triggerFamily: "rest",
        flowId: "hello"
      },
      constraints: {
        allowDependencyChanges: false,
        allowCustomCode: false,
        targetEnv: "dev",
        requireApproval: true
      }
    });

    expect(plan.steps.map((step) => step.tool)).toEqual([
      "flogo.parseApp",
      "flogo.validateApp",
      "runner.diagnoseApp"
    ]);
  });

  it("routes plain-English debugging prompts to diagnosis instead of a mutation tail", () => {
    const planner = new TaskPlanner();
    const plan = planner.plan({
      type: "debug",
      projectId: "demo",
      requestedBy: "operator",
      summary: "Why is this CLI command returning the wrong output?",
      inputs: {},
      constraints: {
        allowDependencyChanges: false,
        allowCustomCode: false,
        targetEnv: "dev",
        requireApproval: true
      }
    });

    expect(plan.steps.some((step) => step.tool === "runner.diagnoseApp")).toBe(true);
    expect(plan.steps.some((step) => step.tool === "flogo.patchApp")).toBe(false);
    expect(plan.steps.some((step) => step.tool === "runner.buildApp")).toBe(false);
  });

  it("keeps timer and channel diagnosis prompts on the analysis-only diagnosis path", () => {
    const planner = new TaskPlanner();
    const timerPlan = planner.plan({
      type: "debug",
      projectId: "demo",
      requestedBy: "operator",
      summary: "Why is this scheduled timer flow not firing on time?",
      inputs: {},
      constraints: {
        allowDependencyChanges: false,
        allowCustomCode: false,
        targetEnv: "dev",
        requireApproval: true
      }
    });
    const channelPlan = planner.plan({
      type: "debug",
      projectId: "demo",
      requestedBy: "operator",
      summary: "Diagnose why the channel event payload is wrong",
      inputs: {},
      constraints: {
        allowDependencyChanges: false,
        allowCustomCode: false,
        targetEnv: "dev",
        requireApproval: true
      }
    });

    expect(timerPlan.steps.map((step) => step.tool)).toContain("runner.diagnoseApp");
    expect(timerPlan.steps.some((step) => step.tool === "runner.buildApp")).toBe(false);
    expect(channelPlan.steps.map((step) => step.tool)).toContain("runner.diagnoseApp");
    expect(channelPlan.steps.some((step) => step.tool === "flogo.patchApp")).toBe(false);
  });
});

describe("TaskPlanner activity scaffold mode", () => {
  it("treats explicit activity scaffold mode as analysis-only authoring work", () => {
    const planner = new TaskPlanner();
    const plan = planner.plan({
      type: "create",
      projectId: "demo",
      requestedBy: "operator",
      summary: "Scaffold a custom Flogo activity bundle",
      inputs: {
        mode: "activity_scaffold",
        activityName: "Echo Message",
        modulePath: "example.com/acme/echo"
      },
      constraints: {
        allowDependencyChanges: false,
        allowCustomCode: false,
        targetEnv: "dev",
        requireApproval: true
      }
    });

    expect(plan.steps.map((step) => step.tool)).toEqual([
      "flogo.parseApp",
      "flogo.validateApp",
      "runner.scaffoldActivity"
    ]);
  });

  it("routes plain-English activity authoring prompts to the scaffold path without a mutation tail", () => {
    const planner = new TaskPlanner();
    const plan = planner.plan({
      type: "create",
      projectId: "demo",
      requestedBy: "operator",
      summary: "Generate a new Flogo activity bundle for a greeting formatter",
      inputs: {},
      constraints: {
        allowDependencyChanges: false,
        allowCustomCode: false,
        targetEnv: "dev",
        requireApproval: true
      }
    });

    expect(plan.steps.map((step) => step.tool)).toContain("runner.scaffoldActivity");
    expect(plan.steps.some((step) => step.tool === "flogo.patchApp")).toBe(false);
    expect(plan.steps.some((step) => step.tool === "runner.buildApp")).toBe(false);
  });
});

describe("TaskPlanner trigger scaffold mode", () => {
  it("treats explicit trigger scaffold mode as analysis-only authoring work", () => {
    const planner = new TaskPlanner();
    const plan = planner.plan({
      type: "create",
      projectId: "demo",
      requestedBy: "operator",
      summary: "Scaffold a custom Flogo trigger bundle",
      inputs: {
        mode: "trigger_scaffold",
        triggerName: "Webhook Trigger",
        modulePath: "example.com/acme/webhook"
      },
      constraints: {
        allowDependencyChanges: false,
        allowCustomCode: false,
        targetEnv: "dev",
        requireApproval: true
      }
    });

    expect(plan.steps.map((step) => step.tool)).toEqual([
      "flogo.parseApp",
      "flogo.validateApp",
      "runner.scaffoldTrigger"
    ]);
  });

  it("routes plain-English trigger authoring prompts to the scaffold path without a mutation tail", () => {
    const planner = new TaskPlanner();
    const plan = planner.plan({
      type: "create",
      projectId: "demo",
      requestedBy: "operator",
      summary: "Generate a new custom trigger bundle for an internal webhook source",
      inputs: {},
      constraints: {
        allowDependencyChanges: false,
        allowCustomCode: false,
        targetEnv: "dev",
        requireApproval: true
      }
    });

    expect(plan.steps.map((step) => step.tool)).toContain("runner.scaffoldTrigger");
    expect(plan.steps.some((step) => step.tool === "flogo.patchApp")).toBe(false);
    expect(plan.steps.some((step) => step.tool === "runner.buildApp")).toBe(false);
  });
});

describe("TaskPlanner action scaffold mode", () => {
  it("treats explicit action scaffold mode as analysis-only authoring work", () => {
    const planner = new TaskPlanner();
    const plan = planner.plan({
      type: "create",
      projectId: "demo",
      requestedBy: "operator",
      summary: "Scaffold a custom Flogo action bundle",
      inputs: {
        mode: "action_scaffold",
        actionName: "Flow Action",
        modulePath: "example.com/acme/flow-action"
      },
      constraints: {
        allowDependencyChanges: false,
        allowCustomCode: false,
        targetEnv: "dev",
        requireApproval: true
      }
    });

    expect(plan.steps.map((step) => step.tool)).toEqual([
      "flogo.parseApp",
      "flogo.validateApp",
      "runner.scaffoldAction"
    ]);
  });

  it("routes plain-English action authoring prompts to the scaffold path without a mutation tail", () => {
    const planner = new TaskPlanner();
    const plan = planner.plan({
      type: "create",
      projectId: "demo",
      requestedBy: "operator",
      summary: "Generate a new custom action bundle for reusable flow work",
      inputs: {},
      constraints: {
        allowDependencyChanges: false,
        allowCustomCode: false,
        targetEnv: "dev",
        requireApproval: true
      }
    });

    expect(plan.steps.map((step) => step.tool)).toContain("runner.scaffoldAction");
    expect(plan.steps.some((step) => step.tool === "flogo.patchApp")).toBe(false);
    expect(plan.steps.some((step) => step.tool === "runner.buildApp")).toBe(false);
  });
});

describe("TaskPlanner shared contribution lifecycle modes", () => {
  it("treats explicit contribution validation mode as analysis-only authoring work", () => {
    const planner = new TaskPlanner();
    const plan = planner.plan({
      type: "review",
      projectId: "demo",
      requestedBy: "operator",
      summary: "Validate a scaffolded Flogo contribution bundle",
      inputs: {
        mode: "validate_contrib",
        bundleArtifactId: "artifact-1"
      },
      constraints: {
        allowDependencyChanges: false,
        allowCustomCode: false,
        targetEnv: "dev",
        requireApproval: true
      }
    });

    expect(plan.steps.map((step) => step.tool)).toEqual([
      "flogo.parseApp",
      "flogo.validateApp",
      "runner.validateContrib"
    ]);
  });

  it("treats explicit contribution packaging mode as analysis-only authoring work", () => {
    const planner = new TaskPlanner();
    const plan = planner.plan({
      type: "review",
      projectId: "demo",
      requestedBy: "operator",
      summary: "Package a scaffolded Flogo contribution bundle",
      inputs: {
        mode: "package_contrib",
        bundleArtifactId: "artifact-1"
      },
      constraints: {
        allowDependencyChanges: false,
        allowCustomCode: false,
        targetEnv: "dev",
        requireApproval: true
      }
    });

    expect(plan.steps.map((step) => step.tool)).toEqual([
      "flogo.parseApp",
      "flogo.validateApp",
      "runner.packageContrib"
    ]);
  });

  it("treats explicit contribution install planning mode as analysis-only authoring work", () => {
    const planner = new TaskPlanner();
    const plan = planner.plan({
      type: "review",
      projectId: "demo",
      appId: "hello-rest",
      requestedBy: "operator",
      summary: "Plan how to install a packaged Flogo contribution into the target app",
      inputs: {
        mode: "install_contrib_plan",
        packageArtifactId: "artifact-1"
      },
      constraints: {
        allowDependencyChanges: false,
        allowCustomCode: false,
        targetEnv: "dev",
        requireApproval: true
      }
    });

    expect(plan.steps.map((step) => step.tool)).toEqual([
      "flogo.parseApp",
      "flogo.validateApp",
      "runner.installContribPlan"
    ]);
  });

  it("treats explicit contribution install diff planning mode as analysis-only authoring work", () => {
    const planner = new TaskPlanner();
    const plan = planner.plan({
      type: "review",
      projectId: "demo",
      appId: "hello-rest",
      requestedBy: "operator",
      summary: "Preview the exact canonical install diff for a packaged Flogo contribution",
      inputs: {
        mode: "install_contrib_diff_plan",
        installPlanArtifactId: "artifact-install-plan-1"
      },
      constraints: {
        allowDependencyChanges: false,
        allowCustomCode: false,
        targetEnv: "dev",
        requireApproval: true
      }
    });

    expect(plan.steps.map((step) => step.tool)).toEqual([
      "flogo.parseApp",
      "flogo.validateApp",
      "runner.installContribDiffPlan"
    ]);
  });

  it("routes install_contrib_apply through one approval-gated contribution install apply step", () => {
    const planner = new TaskPlanner();
    const plan = planner.plan({
      type: "update",
      projectId: "demo",
      appId: "hello-rest",
      requestedBy: "operator",
      summary: "Apply the approved contribution install diff to flogo.json",
      inputs: {
        mode: "install_contrib_apply",
        installDiffArtifactId: "artifact-install-diff-1"
      },
      constraints: {
        allowDependencyChanges: false,
        allowCustomCode: false,
        targetEnv: "dev",
        requireApproval: true
      }
    });

    expect(plan.requiredApprovals).toEqual(["install_contribution"]);
    expect(plan.steps.map((step) => step.tool)).toEqual([
      "flogo.parseApp",
      "flogo.validateApp",
      "runner.installContribApply"
    ]);
  });

  it("routes update_contrib_apply through one approval-gated contribution update apply step", () => {
    const planner = new TaskPlanner();
    const plan = planner.plan({
      type: "update",
      projectId: "demo",
      appId: "hello-rest",
      requestedBy: "operator",
      summary: "Apply the approved contribution update diff to flogo.json",
      inputs: {
        mode: "update_contrib_apply",
        updateDiffPlanArtifactId: "artifact-update-diff-1"
      },
      constraints: {
        allowDependencyChanges: false,
        allowCustomCode: false,
        targetEnv: "dev",
        requireApproval: true
      }
    });

    expect(plan.requiredApprovals).toEqual(["update_contribution"]);
    expect(plan.steps.map((step) => step.tool)).toEqual([
      "flogo.parseApp",
      "flogo.validateApp",
      "runner.updateContribApply"
    ]);
  });

  it("treats explicit contribution update planning mode as analysis-only authoring work", () => {
    const planner = new TaskPlanner();
    const plan = planner.plan({
      type: "review",
      projectId: "demo",
      appId: "hello-rest",
      requestedBy: "operator",
      summary: "Plan how to update an already installed contribution in the target app",
      inputs: {
        mode: "update_contrib_plan",
        packageArtifactId: "artifact-1"
      },
      constraints: {
        allowDependencyChanges: false,
        allowCustomCode: false,
        targetEnv: "dev",
        requireApproval: true
      }
    });

    expect(plan.requiredApprovals).toEqual([]);
    expect(plan.steps.map((step) => step.tool)).toEqual([
      "flogo.parseApp",
      "flogo.validateApp",
      "runner.updateContribPlan"
    ]);
  });

  it("treats explicit contribution uninstall planning mode as analysis-only authoring work", () => {
    const planner = new TaskPlanner();
    const plan = planner.plan({
      type: "review",
      projectId: "demo",
      appId: "hello-rest",
      requestedBy: "operator",
      summary: "Plan how to uninstall an installed contribution from the target app",
      inputs: {
        mode: "uninstall_contrib_plan",
        selection: {
          alias: "webhooktrigger"
        }
      },
      constraints: {
        allowDependencyChanges: false,
        allowCustomCode: false,
        targetEnv: "dev",
        requireApproval: true
      }
    });

    expect(plan.requiredApprovals).toEqual([]);
    expect(plan.steps.map((step) => step.tool)).toEqual([
      "flogo.parseApp",
      "flogo.validateApp",
      "runner.uninstallContribPlan"
    ]);
  });

  it("treats explicit contribution update diff planning mode as analysis-only authoring work", () => {
    const planner = new TaskPlanner();
    const plan = planner.plan({
      type: "review",
      projectId: "demo",
      appId: "hello-rest",
      requestedBy: "operator",
      summary: "Preview the exact canonical update diff for an installed contribution",
      inputs: {
        mode: "update_contrib_diff_plan",
        updatePlanArtifactId: "artifact-update-plan-1"
      },
      constraints: {
        allowDependencyChanges: false,
        allowCustomCode: false,
        targetEnv: "dev",
        requireApproval: true
      }
    });

    expect(plan.requiredApprovals).toEqual([]);
    expect(plan.steps.map((step) => step.tool)).toEqual([
      "flogo.parseApp",
      "flogo.validateApp",
      "runner.updateContribDiffPlan"
    ]);
  });
});
