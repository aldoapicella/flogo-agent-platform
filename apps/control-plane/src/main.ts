import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import cors from "@fastify/cors";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  await app.register(cors, { origin: true });
  app.setGlobalPrefix("v1", { exclude: ["health"] });

  const config = new DocumentBuilder()
    .setTitle("Flogo Agent Platform")
    .setDescription("Foundation-first control plane for Flogo workflows")
    .setVersion("0.1.0")
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document);

  await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3000) });
}

void bootstrap();

