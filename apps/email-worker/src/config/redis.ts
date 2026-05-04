import IORedis from "ioredis";
import { env } from "./env";

// BullMQ requires maxRetriesPerRequest: null for blocking commands.
// Each Worker should get its own connection — the connection passed to a Worker
// is shared internally for non-blocking job-state writes; sharing it across
// multiple Workers serialises those writes through a single socket.
export function createRedisConnection(): IORedis {
  const baseOpts = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  } as const;

  return env.REDIS_URL
    ? new IORedis(env.REDIS_URL, {
        ...baseOpts,
        ...(env.REDIS_URL.startsWith("rediss://") && { tls: {} }),
      })
    : new IORedis({
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD,
        db: env.REDIS_DB,
        ...baseOpts,
      });
}
