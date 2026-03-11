import { Module } from "@nestjs/common";

import { AppAnalysisStorageService } from "./app-analysis-storage.service.js";
import { FlogoAppsController } from "./flogo-apps.controller.js";
import { FlogoAppsService } from "./flogo-apps.service.js";

@Module({
  controllers: [FlogoAppsController],
  providers: [AppAnalysisStorageService, FlogoAppsService]
})
export class FlogoAppsModule {}
