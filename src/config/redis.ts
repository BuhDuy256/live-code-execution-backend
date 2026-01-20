import Redis from "ioredis";
import type { RedisOptions } from "ioredis";

export const redisOptions: RedisOptions = {
  host: process.env['REDIS_HOST'] || "localhost",
  port: Number(process.env['REDIS_PORT'] || 6379),
  maxRetriesPerRequest: null,
  // Don't let Redis retry requests automatically; let BullMQ handle retries in the correct job context.
  enableReadyCheck: false,
  lazyConnect: true,
  retryStrategy: (times) => Math.min(times * 50, 2000),
};

export const createRedisConnection = () => {
  const redis = new Redis(redisOptions);

  redis.on("connect", () => {
    console.log("Redis connected");
  });

  redis.on("reconnecting", () => {
    console.warn("Redis reconnecting...");
  });

  redis.on("close", () => {
    console.warn("Redis connection closed");
  });

  redis.on("error", (err) => {
    console.error("Redis connection error:", err);
  });

  return redis;
};

export const redisConnection = createRedisConnection();
