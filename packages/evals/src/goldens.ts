import type { EvalCase } from "@flogo-agent/contracts";

const makeCases = (category: EvalCase["category"], prompts: string[]): EvalCase[] =>
  prompts.map((prompt, index) => ({
    id: `${category}-${index + 1}`,
    category,
    prompt,
    expectedOutcome: `${category} task completes with validation evidence`,
    tags: ["foundation-mvp"]
  }));

export const goldenCases: EvalCase[] = [
  ...makeCases("create", [
    "Create REST hello world app",
    "Create timer-triggered flow",
    "Create customer lookup endpoint",
    "Create app with shared flow",
    "Create outbound REST call flow",
    "Create logging-heavy debug app",
    "Create app with two endpoints"
  ]),
  ...makeCases("update", [
    "Add endpoint to existing app",
    "Change response mapping",
    "Rename flow safely",
    "Add log activity",
    "Update request mapping",
    "Add smoke test"
  ]),
  ...makeCases("debug", [
    "Fix broken alias ref",
    "Fix invalid flowURI",
    "Fix bad mapping scope",
    "Fix missing activity input",
    "Fix runtime output mismatch",
    "Fix build failure after contrib change"
  ]),
  ...makeCases("review", [
    "Detect unused imports",
    "Detect orphaned refs",
    "Flag risky contract change",
    "Recommend simpler flow",
    "Flag missing smoke tests",
    "Review contrib drift"
  ])
];
