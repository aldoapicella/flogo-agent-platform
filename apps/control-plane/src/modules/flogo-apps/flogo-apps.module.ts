import { Global, Module } from "@nestjs/common";
import { FlogoAppsController } from "./flogo-apps.controller";
import { FlogoAppsService } from "./flogo-apps.service";

@Global()
@Module({
  controllers: [FlogoAppsController],
  providers: [FlogoAppsService],
  exports: [FlogoAppsService]
})
export class FlogoAppsModule {}

