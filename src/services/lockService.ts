import Redis from "ioredis";

export class LockService {
  private redis: Redis;
  private lockTTL: number = 30000; // 30 seconds

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.redis.on("connect", () => {
      console.log("Connected to Redis for locking");
    });

    this.redis.on("error", (err) => {
      console.error("Redis connection error:", err);
    });
  }

  async acquireLock(key: string, identifier: string): Promise<boolean> {
    try {
      // Use SET with NX (only set if not exists) and PX (expire time in ms)
      const result = await this.redis.set(
        `lock:${key}`,
        identifier,
        "PX",
        this.lockTTL,
        "NX"
      );
      return result === "OK";
    } catch (error) {
      console.error("Error acquiring lock:", error);
      return false;
    }
  }

  async releaseLock(key: string, identifier: string): Promise<boolean> {
    // Lua script to ensure we only delete our own lock
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    try {
      const result = await this.redis.eval(
        script,
        1,
        `lock:${key}`,
        identifier
      );
      return result === 1;
    } catch (error) {
      console.error("Error releasing lock:", error);
      return false;
    }
  }

  async waitForLock(
    key: string,
    identifier: string,
    maxWaitTime: number = 5000
  ): Promise<boolean> {
    const startTime = Date.now();
    const retryInterval = 100; // 100ms

    while (Date.now() - startTime < maxWaitTime) {
      if (await this.acquireLock(key, identifier)) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, retryInterval));
    }

    return false;
  }

  async disconnect(): Promise<void> {
    await this.redis.disconnect();
  }
}
