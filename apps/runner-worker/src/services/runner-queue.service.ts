import { QueueEvents, Worker } from "bullmq";
import IORedis from "ioredis";
import { type RunnerJobSpec, RunnerJobSpecSchema } from "@flogo-agent/contracts";
import { RunnerExecutorService } from "./runner-executor.service.js";

export class RunnerQueueService {
  private readonly queueName = process.env.RUNNER_QUEUE_NAME ?? "runner-jobs";
  private readonly redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null
  });
  private readonly worker: Worker<RunnerJobSpec>;
  private readonly events: QueueEvents;

  constructor(private readonly executor = new RunnerExecutorService()) {
    this.worker = new Worker<RunnerJobSpec>(
      this.queueName,
      async (job) => this.executor.execute(RunnerJobSpecSchema.parse(job.data)),
      { connection: this.redis, concurrency: Number(process.env.RUNNER_CONCURRENCY ?? 2) }
    );
    this.events = new QueueEvents(this.queueName, { connection: this.redis });
  }

  start() {
    this.worker.on("completed", (job) => {
      console.log(`[runner-worker] completed job ${job.id}`);
    });
    this.worker.on("failed", (job, error) => {
      console.error(`[runner-worker] failed job ${job?.id}: ${error.message}`);
    });
    this.events.on("waiting", ({ jobId }) => {
      console.log(`[runner-worker] waiting job ${jobId}`);
    });
  }

  async close() {
    await this.worker.close();
    await this.events.close();
    await this.redis.quit();
  }
}
