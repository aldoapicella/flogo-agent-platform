import { Injectable } from "@nestjs/common";
import { type ArtifactRef } from "@flogo-agent/contracts";

@Injectable()
export class ArtifactsService {
  private readonly artifacts = new Map<string, ArtifactRef[]>();

  add(taskId: string, artifact: ArtifactRef) {
    const current = this.artifacts.get(taskId) ?? [];
    this.artifacts.set(taskId, [...current, artifact]);
  }

  list(taskId: string): ArtifactRef[] {
    return this.artifacts.get(taskId) ?? [];
  }
}

