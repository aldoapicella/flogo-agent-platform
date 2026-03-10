import type { TaskType } from "@flogo-agent/contracts";

export interface GoldenCase {
  id: string;
  type: TaskType;
  prompt: string;
  expected: string[];
}

function createCase(id: string, type: TaskType, prompt: string, expected: string[]): GoldenCase {
  return { id, type, prompt, expected };
}

export const goldenCases: GoldenCase[] = [
  createCase("create-01", "create", "Create a REST hello world service.", ["build", "smoke"]),
  createCase("create-02", "create", "Create a timer-triggered logging app.", ["build"]),
  createCase("create-03", "create", "Create GET /customer/:id with external REST lookup.", ["build", "smoke"]),
  createCase("create-04", "create", "Create POST /orders with validation flow.", ["build", "smoke"]),
  createCase("create-05", "create", "Create a two-flow app with shared error handling.", ["build"]),
  createCase("create-06", "create", "Create a custom activity scaffold plan.", ["approval"]),
  createCase("update-01", "update", "Add GET /health endpoint to existing app.", ["patch", "smoke"]),
  createCase("update-02", "update", "Change response mapping to include headers.", ["patch", "smoke"]),
  createCase("update-03", "update", "Refactor flow name and fix refs.", ["patch"]),
  createCase("update-04", "update", "Add timer trigger to nightly sync.", ["patch", "build"]),
  createCase("update-05", "update", "Update REST contrib version.", ["approval"]),
  createCase("update-06", "update", "Remove obsolete flow resource.", ["approval"]),
  createCase("debug-01", "debug", "Fix missing alias reference in app.", ["root_cause", "patch"]),
  createCase("debug-02", "debug", "Fix wrong flowURI on handler.", ["root_cause", "patch"]),
  createCase("debug-03", "debug", "Fix bad mapping scope for $activity.", ["root_cause", "patch"]),
  createCase("debug-04", "debug", "Debug build failure after contrib update.", ["root_cause", "build"]),
  createCase("debug-05", "debug", "Debug wrong runtime output on GET /customer.", ["root_cause", "smoke"]),
  createCase("debug-06", "debug", "Debug missing activity input.", ["root_cause", "patch"]),
  createCase("review-01", "review", "Review app for unused imports.", ["findings"]),
  createCase("review-02", "review", "Review app for orphaned refs.", ["findings"]),
  createCase("review-03", "review", "Review app for risky contract changes.", ["findings"]),
  createCase("review-04", "review", "Review app for maintainability.", ["findings"]),
  createCase("review-05", "review", "Review app for missing tests and runbook.", ["findings"]),
  createCase("review-06", "review", "Review app for unnecessary contribs.", ["findings"]),
  createCase("review-07", "review", "Review app for insecure external endpoints.", ["findings"])
];

