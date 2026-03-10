import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "./modules/app.module.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  const configService = app.get(ConfigService);

  app.setGlobalPrefix("v1");

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Flogo Agent Control Plane")
    .setDescription("Foundation-first control plane for Flogo application tasks")
    .setVersion("0.1.0")
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, document);

  await app.listen(configService.get<number>("port", 3001), "0.0.0.0");
  Logger.log("Control plane is listening", "bootstrap");
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger("bootstrap");
  logger.error(error);
  process.exitCode = 1;
});

