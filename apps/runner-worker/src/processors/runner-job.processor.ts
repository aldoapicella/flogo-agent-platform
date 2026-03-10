import { Worker } from "bullmq";
import IORedis from "ioredis";

import { RunnerJobSpecSchema } from "@flogo-agent/contracts";

import { createRunnerExecutor } from "../services/runner-executor.service.js";
import { SmokeTestService } from "../services/smoke-test.service.js";

export function createRunnerWorker() {
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null
  });
  const runnerExecutor = createRunnerExecutor();
  const smokeTestService = new SmokeTestService();

  return new Worker(
    "runner-jobs",
    async (job) => {
      const spec = RunnerJobSpecSchema.parse(job.data);

      if (spec.stepType === "generate_smoke") {
        return {
          smokeTest: smokeTestService.generate(spec)
        };
      }

      return runnerExecutor.execute(spec);
    },
    {
      connection,
      concurrency: Number(process.env.RUNNER_WORKER_CONCURRENCY ?? 2)
    }
  );
}

