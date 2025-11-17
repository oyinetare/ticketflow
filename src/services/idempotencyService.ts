import Redis from "ioredis";
import { Request } from "express";
import { createHash } from "crypto";

export class IdempotencyService {
  private redis: Redis;
  private ttl = 86400; // 24 hrs

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
    });
  }

  async storeIdempotentResponse(key: string, response: any): Promise<void> {
    await this.redis.setex(
      `idempotent:${key}`,
      this.ttl,
      JSON.stringify(response)
    );
  }

  async getIdempotentResponse(key: string): Promise<any | null> {
    const cached = await this.redis.get(`idempotent:${key}`);
    return cached ? JSON.parse(cached) : null;
  }

  generateIdempotencyKey(req: Request): string {
    // Generate key based on user, endpoint, and request body
    const userId = req.body.userId || "anonymous";
    const path = req.path;
    const bodyHash = createHash("sha256")
      .update(JSON.stringify(req.body))
      .digest("hex");

    return `${userId}:${path}:${bodyHash}`;
  }
}
