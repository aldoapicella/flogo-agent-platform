import { type RunnerJobSpec, type SmokeTestSpec } from "@flogo-agent/contracts";

export class SmokeTestService {
  generate(spec: RunnerJobSpec): SmokeTestSpec {
    return {
      name: `${spec.taskId}-${spec.stepType}`,
      method: "GET",
      url: "http://localhost:9999/health",
      headers: {},
      assertions: [
        {
          field: "status",
          operator: "equals",
          expected: 200
        }
      ]
    };
  }
}
