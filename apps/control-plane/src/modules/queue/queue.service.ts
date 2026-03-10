import { Injectable, Logger } from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { type RunnerJobSpec } from "@flogo-agent/contracts";

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  private readonly queueName = process.env.RUNNER_QUEUE_NAME ?? "runner-jobs";
  private readonly redisUrl = process.env.REDIS_URL;
  private readonly fallbackQueue: RunnerJobSpec[] = [];
  private readonly redis = this.redisUrl ? new IORedis(this.redisUrl, { maxRetriesPerRequest: null }) : undefined;
  private readonly queue = this.redis ? new Queue<RunnerJobSpec>(this.queueName, { connection: this.redis }) : undefined;

  async enqueueRunnerJob(spec: RunnerJobSpec): Promise<{ mode: "bullmq" | "memory"; jobId: string }> {
    if (this.queue) {
      await this.queue.add(spec.stepType, spec, { jobId: spec.jobId, removeOnComplete: 50, removeOnFail: 50 });
      this.logger.log(`Enqueued ${spec.stepType} job ${spec.jobId} into BullMQ.`);
      return { mode: "bullmq", jobId: spec.jobId };
    }

    this.fallbackQueue.push(spec);
    this.logger.warn(`REDIS_URL is not configured. Stored runner job ${spec.jobId} in memory.`);
    return { mode: "memory", jobId: spec.jobId };
  }

  getPendingJobs(): RunnerJobSpec[] {
    return [...this.fallbackQueue];
  }
}

