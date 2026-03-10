import { Global, Module } from "@nestjs/common";

import { PromptCatalogService } from "./prompts.service.js";

@Global()
@Module({
  providers: [PromptCatalogService],
  exports: [PromptCatalogService]
})
export class PromptsModule {}

