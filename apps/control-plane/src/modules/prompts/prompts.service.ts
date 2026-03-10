import { Injectable } from "@nestjs/common";

import { promptCatalog } from "@flogo-agent/prompts";

@Injectable()
export class PromptCatalogService {
  getAll() {
    return promptCatalog;
  }
}

