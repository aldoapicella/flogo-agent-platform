import type { SmokeTestSpec, ToolResponse } from "@flogo-agent/contracts";
import { SmokeTestSpecSchema } from "@flogo-agent/contracts";

import { toolResponse } from "./shared.js";

export class TestTools {
  generateSmoke(appUrl: string): ToolResponse {
    const smokeTest = SmokeTestSpecSchema.parse({
      name: "default-smoke",
      url: appUrl,
      assertions: [
        {
          field: "status",
          operator: "equals",
          expected: 200
        }
      ]
    });

    return toolResponse({
      ok: true,
      summary: `Generated smoke test for ${appUrl}`,
      data: { smoke: smokeTest },
      diagnostics: [],
      artifacts: [],
      retryable: false
    });
  }

  runSmoke(spec: SmokeTestSpec): ToolResponse {
    const smoke = SmokeTestSpecSchema.parse(spec);
    return toolResponse({
      ok: true,
      summary: `Prepared smoke test ${smoke.name}`,
      data: { smoke },
      diagnostics: [],
      artifacts: [],
      retryable: false
    });
  }
}
