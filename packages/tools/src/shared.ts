import { ToolResponseSchema, type ToolResponse } from "@flogo-agent/contracts";

export function toolResponse(partial: ToolResponse): ToolResponse {
  return ToolResponseSchema.parse(partial);
}
