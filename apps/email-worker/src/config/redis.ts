import IORedis from "ioredis";
import { env } from "./env";

// Connection options passed to BullMQ (avoids ioredis version type mismatch)
export const redisConnectionOptions = env.REDIS_URL
  ? { url: env.REDIS_URL as string }
  : {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      ...(env.REDIS_PASSWORD && { password: env.REDIS_PASSWORD }),
      db: env.REDIS_DB,
    };

// Raw ioredis client for non-BullMQ use (health checks, etc.)
const bullmqBase = {
  maxRetriesPerRequest: null as null,
  enableReadyCheck: false,
};

export const redisConnection = env.REDIS_URL
  ? new IORedis(env.REDIS_URL, {
      ...bullmqBase,
      ...(env.REDIS_URL.startsWith("rediss://") && { tls: {} }),
    })
  : new IORedis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
      db: env.REDIS_DB,
      ...bullmqBase,
    });
