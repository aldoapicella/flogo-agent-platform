import type { ApprovalRequest, TaskRequest } from "@flogo-agent/contracts";

const riskyPhrases = [
  "delete",
  "remove trigger",
  "change public rest contract",
  "upgrade dependency",
  "custom code",
  "deploy"
];

export class PolicyEngine {
  assess(task: TaskRequest): ApprovalRequest | undefined {
    const loweredPrompt = task.prompt.toLowerCase();

    if (task.constraints.allowDependencyChanges || task.constraints.allowCustomCode) {
      return {
        type: "policy.override",
        rationale: "Task allows higher-risk changes and requires approval.",
        requestedFrom: task.requestedBy
      };
    }

    const matchedPhrase = riskyPhrases.find((phrase) => loweredPrompt.includes(phrase));
    if (!matchedPhrase) {
      return undefined;
    }

    return {
      type: "high_risk_change",
      rationale: `Prompt contains "${matchedPhrase}" which requires review.`,
      requestedFrom: task.requestedBy
    };
  }
}

