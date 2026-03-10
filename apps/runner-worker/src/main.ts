import { RunnerQueueService } from "./services/runner-queue.service.js";

async function bootstrap() {
  const service = new RunnerQueueService();
  service.start();

  const shutdown = async () => {
    await service.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  console.log("[runner-worker] listening for BullMQ jobs");
}

void bootstrap();
