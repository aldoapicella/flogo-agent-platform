import { Injectable } from "@nestjs/common";

import { createDefaultToolset } from "@flogo-agent/tools";

@Injectable()
export class ToolsetService {
  readonly toolset = createDefaultToolset(process.cwd());
}
