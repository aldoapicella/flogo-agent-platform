import { Injectable } from "@nestjs/common";
import { getPromptTemplate, listPromptTemplates, renderPrompt } from "@flogo-agent/prompts";

@Injectable()
export class PromptsService {
  list() {
    return listPromptTemplates();
  }

  get(id: "orchestrator" | "builder" | "debugger" | "reviewer" | "policy") {
    return getPromptTemplate(id);
  }

  render(id: "orchestrator" | "builder" | "debugger" | "reviewer" | "policy", variables: Record<string, string>) {
    return renderPrompt(id, variables);
  }
}

