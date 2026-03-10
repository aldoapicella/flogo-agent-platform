export interface PromptTemplate {
  id: string;
  version: string;
  purpose: string;
  template: string;
}

export const promptCatalog: Record<string, PromptTemplate> = {
  orchestrator: {
    id: "orchestrator",
    version: "2026-03-10",
    purpose: "Select workflow, tools, validation gates, and evidence requirements.",
    template:
      "Treat flogo.json as canonical. Choose the smallest safe workflow, validate after every mutation, and require evidence before success."
  },
  builder: {
    id: "builder",
    version: "2026-03-10",
    purpose: "Generate triggers, flows, activities, and mappings.",
    template:
      "Produce minimal Flogo graphs that satisfy the request, reuse existing resources, and avoid unnecessary contribs."
  },
  debugger: {
    id: "debugger",
    version: "2026-03-10",
    purpose: "Classify failures and propose minimal fixes.",
    template:
      "Return root cause, evidence, patch, risk, and a proving smoke test."
  },
  reviewer: {
    id: "reviewer",
    version: "2026-03-10",
    purpose: "Review maintainability, security, and contract drift.",
    template:
      "Flag unused imports, orphaned refs, brittle mappings, risky contract changes, and missing tests."
  },
  policy: {
    id: "policy",
    version: "2026-03-10",
    purpose: "Decide when human approval is required.",
    template:
      "Require approval for deletes, public REST contract changes, dependency upgrades, custom Go code, endpoint target changes, and deploy actions."
  }
};
