import { Global, Module } from "@nestjs/common";

import { InternalAuthService } from "./internal-auth.service.js";

@Global()
@Module({
  providers: [InternalAuthService],
  exports: [InternalAuthService]
})
export class AuthModule {}
