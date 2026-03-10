import { Module } from "@nestjs/common";

import { FlogoAppsController } from "./flogo-apps.controller.js";
import { FlogoAppsService } from "./flogo-apps.service.js";

@Module({
  controllers: [FlogoAppsController],
  providers: [FlogoAppsService]
})
export class FlogoAppsModule {}

