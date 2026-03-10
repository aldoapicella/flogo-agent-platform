import { Injectable, Logger } from "@nestjs/common";
import { Queue } from "bullmq";

import { type RunnerJobSpec, RunnerJobSpecSchema } from "@flogo-agent/contracts";

function toRedisConnection(redisUrl: string) {
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || "6379"),
    password: parsed.password || undefined,
    maxRetriesPerRequest: null
  };
}

@Injectable()
export class RunnerQueueService {
  private readonly logger = new Logger(RunnerQueueService.name);
  private readonly fallbackJobs: RunnerJobSpec[] = [];
  private readonly queue?: Queue<RunnerJobSpec>;

  constructor() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      this.logger.warn("REDIS_URL not configured. Falling back to in-memory runner queue.");
      return;
    }

    try {
      this.queue = new Queue<RunnerJobSpec>("runner-jobs", {
        connection: toRedisConnection(redisUrl)
      });
    } catch (error) {
      this.logger.warn(`Failed to create BullMQ queue: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async enqueue(spec: RunnerJobSpec): Promise<{ mode: "bullmq" | "memory"; spec: RunnerJobSpec }> {
    const parsed = RunnerJobSpecSchema.parse(spec);

    if (this.queue) {
      await this.queue.add(parsed.stepType, parsed, {
        removeOnComplete: 200,
        removeOnFail: 200
      });
      return { mode: "bullmq", spec: parsed };
    }

    this.fallbackJobs.push(parsed);
    return { mode: "memory", spec: parsed };
  }

  listFallback(): RunnerJobSpec[] {
    return [...this.fallbackJobs];
  }
}

