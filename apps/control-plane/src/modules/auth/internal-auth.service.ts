import { Injectable, UnauthorizedException } from "@nestjs/common";

@Injectable()
export class InternalAuthService {
  private readonly token = process.env.INTERNAL_SERVICE_TOKEN;

  assert(headers: Record<string, unknown>): void {
    if (!this.token) {
      return;
    }

    const candidate = headers["x-internal-service-token"];
    const value = Array.isArray(candidate) ? candidate[0] : candidate;

    if (typeof value !== "string" || value !== this.token) {
      throw new UnauthorizedException("Missing or invalid internal service token");
    }
  }
}
