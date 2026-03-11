import Fastify from "fastify";

import { RunnerJobService } from "./services/runner-job.service.js";

async function bootstrap(): Promise<void> {
  const app = Fastify({
    logger: true
  });
  const jobs = new RunnerJobService();

  app.get("/health", async () => ({
    ok: true,
    service: "runner-worker"
  }));

  app.post("/internal/jobs/start", async (request) => jobs.start(request.body));

  app.get<{ Params: { jobRunId: string } }>("/internal/jobs/:jobRunId", async (request, reply) => {
    const job = jobs.get(request.params.jobRunId);
    if (!job) {
      return reply.code(404).send({
        message: `Unknown job run ${request.params.jobRunId}`
      });
    }

    return reply.send(job);
  });

  const port = Number(process.env.RUNNER_WORKER_PORT ?? 3010);
  await app.listen({
    port,
    host: "0.0.0.0"
  });
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
