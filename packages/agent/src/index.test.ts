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
