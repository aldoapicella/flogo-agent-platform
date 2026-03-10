import { Global, Module } from "@nestjs/common";

import { ToolsetService } from "./toolset.service.js";

@Global()
@Module({
  providers: [ToolsetService],
  exports: [ToolsetService]
})
export class ToolsModule {}
