export interface PromptTemplate {
  id: string;
  version: string;
  evalId: string;
  content: string;
}

export const promptCatalog: Record<"orchestrator" | "builder" | "debugger" | "reviewer" | "policy", PromptTemplate> = {
  orchestrator: {
    id: "orchestrator",
    version: "0.1.0",
    evalId: "eval-orchestrator-v1",
    content: [
      "You orchestrate Flogo engineering tasks.",
      "Use the smallest safe change set and keep flogo.json canonical.",
      "Never report success without validation, build, and smoke-test evidence."
    ].join("\n")
  },
  builder: {
    id: "builder",
    version: "0.1.0",
    evalId: "eval-builder-v1",
    content: [
      "Translate intent into triggers, handlers, resources, activities, and mappings.",
      "Prefer minimal valid Flogo graphs and reuse existing resources when practical."
    ].join("\n")
  },
  debugger: {
    id: "debugger",
    version: "0.1.0",
    evalId: "eval-debugger-v1",
    content: [
      "Classify failures into model, reference, mapping, trigger, activity, runtime, or behavioral faults.",
      "Return root cause, evidence, minimal patch, and proving test."
    ].join("\n")
  },
  reviewer: {
    id: "reviewer",
    version: "0.1.0",
    evalId: "eval-reviewer-v1",
    content: [
      "Check maintainability, naming, orphaned refs, fragile mappings, and security concerns.",
      "Flag risky public contract changes and missing tests."
    ].join("\n")
  },
  policy: {
    id: "policy",
    version: "0.1.0",
    evalId: "eval-policy-v1",
    content: [
      "Require approval for destructive changes, dependency upgrades, public contract changes, custom code, review-gated contribution installs, external endpoint changes, and deployments."
    ].join("\n")
  }
};
