import { Injectable } from "@nestjs/common";
import { promises as fs } from "node:fs";
import path from "node:path";

import { buildAppGraph } from "@flogo-agent/flogo-graph";

@Injectable()
export class FlogoAppsService {
  async getGraph(appId: string) {
    const candidatePaths = [path.join(process.cwd(), "examples", appId, "flogo.json")];

    for (const candidatePath of candidatePaths) {
      try {
        const content = await fs.readFile(candidatePath, "utf8");
        return buildAppGraph(content);
      } catch {
        continue;
      }
    }

    return undefined;
  }
}
