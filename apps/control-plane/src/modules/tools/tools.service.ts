import { Injectable } from "@nestjs/common";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { TaskRequestSchema, type ArtifactRef, type TaskRequest, type ValidationReport } from "@flogo-agent/contracts";
import { ArtifactTools, FlogoTools, RepoTools, RunnerTools, TestTools } from "@flogo-agent/tools";

@Injectable()
export class ToolsService {
  private readonly repoTools = new RepoTools();
  private readonly flogoTools = new FlogoTools();
  private readonly runnerTools = new RunnerTools();
  private readonly testTools = new TestTools();
  private readonly artifactTools = new ArtifactTools();

  async loadAppContents(appPath: string): Promise<string | undefined> {
    try {
      return await fs.readFile(appPath, "utf8");
    } catch {
      return undefined;
    }
  }

  async parseGraph(appPath: string) {
    const contents = await this.loadAppContents(appPath);
    if (!contents) {
      return undefined;
    }
    return this.flogoTools.parseApp(contents).data.graph;
  }

  async validateApp(appPath: string): Promise<ValidationReport | undefined> {
    const contents = await this.loadAppContents(appPath);
    if (!contents) {
      return undefined;
    }
    return this.flogoTools.validateApp(contents).data.validationReport as ValidationReport;
  }

  generateBaseline(request: TaskRequest) {
    return this.flogoTools.generateApp(TaskRequestSchema.parse(request));
  }

  generateSmoke(request: TaskRequest) {
    return this.testTools.generateSmoke(TaskRequestSchema.parse(request)).data.smoke;
  }

  prepareBuildJob(taskId: string, request: TaskRequest) {
    const appId = request.appId ?? path.basename(request.appPath, path.extname(request.appPath));
    return this.runnerTools.buildApp({
      jobId: randomUUID(),
      taskId,
      stepType: "build",
      snapshotUri: request.repo?.root ?? path.dirname(request.appPath),
      appPath: request.appPath,
      env: { APP_ID: appId },
      timeoutSeconds: 600,
      artifactOutputUri: `artifacts/tasks/${taskId}/build`
    }).data.spec;
  }

  prepareSmokeJob(taskId: string, request: TaskRequest) {
    return {
      jobId: randomUUID(),
      taskId,
      stepType: "smoke" as const,
      snapshotUri: request.repo?.root ?? path.dirname(request.appPath),
      appPath: request.appPath,
      env: {},
      timeoutSeconds: 300,
      artifactOutputUri: `artifacts/tasks/${taskId}/smoke`,
      command: ["curl", "-sS", "http://localhost:8080/health"]
    };
  }

  publishArtifact(kind: ArtifactRef["kind"], label: string, uri: string, metadata?: Record<string, unknown>) {
    return this.artifactTools.publish(kind, label, uri, metadata).artifacts[0];
  }

  async readFile(filePath: string) {
    return this.repoTools.read(filePath);
  }
}

