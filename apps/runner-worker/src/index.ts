import { createRunnerWorker } from "./processors/runner-job.processor.js";

async function bootstrap(): Promise<void> {
  const worker = createRunnerWorker();
  worker.on("completed", (job) => {
    console.log(`runner-worker completed ${job.id}`);
  });
  worker.on("failed", (job, error) => {
    console.error(`runner-worker failed ${job?.id}:`, error);
  });
  console.log("runner-worker listening for runner-jobs");
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
