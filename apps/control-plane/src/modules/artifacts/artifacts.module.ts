import { Module } from "@nestjs/common";

import { ArtifactsController } from "./artifacts.controller.js";

@Module({
  controllers: [ArtifactsController]
})
export class ArtifactsModule {}

