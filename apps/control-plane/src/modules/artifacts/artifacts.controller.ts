import { Controller, Get, Param } from "@nestjs/common";
import { ArtifactsService } from "./artifacts.service";

@Controller("tasks/:taskId/artifacts")
export class ArtifactsController {
  constructor(private readonly artifactsService: ArtifactsService) {}

  @Get()
  list(@Param("taskId") taskId: string) {
    return this.artifactsService.list(taskId);
  }
}

