import Fastify, { type FastifyReply } from "fastify";

import { RunnerJobService } from "./services/runner-job.service.js";

function assertInternalAccess(headers: Record<string, unknown>, reply: FastifyReply): boolean {
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  if (!token) {
    return true;
  }

  const candidate = headers["x-internal-service-token"];
  const value = Array.isArray(candidate) ? candidate[0] : candidate;
  if (typeof value !== "string" || value !== token) {
    void reply.code(401).send({
      message: "Missing or invalid internal service token"
    });
    return false;
  }

  return true;
}

async function bootstrap(): Promise<void> {
  const app = Fastify({
    logger: true
  });
  const jobs = new RunnerJobService();

  app.get("/health", async () => ({
    ok: true,
    service: "runner-worker"
  }));

  app.post("/internal/jobs/start", async (request, reply) => {
    if (!assertInternalAccess(request.headers as Record<string, unknown>, reply)) {
      return reply;
    }
    return jobs.start(request.body);
  });

  app.get<{ Params: { jobRunId: string } }>("/internal/jobs/:jobRunId", async (request, reply) => {
    if (!assertInternalAccess(request.headers as Record<string, unknown>, reply)) {
      return reply;
    }
    const job = await jobs.get(request.params.jobRunId);
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
