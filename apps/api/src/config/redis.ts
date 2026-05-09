import Redis from 'ioredis';
import { env } from './env';

let redis: Redis | null = null;

export const getRedisClient = (): Redis => {
  if (!redis) {
    redis = env.REDIS_URL
      ? new Redis(env.REDIS_URL, {
          connectionName: 'rfp-system-api',
          retryStrategy: (times) => Math.min(times * 50, 2000),
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          lazyConnect: false,
          ...(env.REDIS_URL.startsWith('rediss://') && { tls: {} }),
        })
      : new Redis({
          host: env.REDIS_HOST,
          port: env.REDIS_PORT,
          password: env.REDIS_PASSWORD || undefined,
          db: env.REDIS_DB,
          retryStrategy: (times) => Math.min(times * 50, 2000),
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          lazyConnect: false,
        });

    redis.on('connect', () => {
      console.log(`✅ Redis connected successfully (${env.REDIS_URL ? 'cloud' : 'local'})`);
    });
    redis.on('error', (err) => console.error('❌ Redis connection error:', err));
    redis.on('close', () => console.log('⚠️ Redis connection closed'));
    redis.on('reconnecting', () => console.log('🔄 Redis reconnecting...'));
  }

  return redis;
};

export const closeRedisConnection = async (): Promise<void> => {
  if (redis) {
    await redis.quit();
    redis = null;
    console.log('✅ Redis connection closed');
  }
};

// Export singleton instance
export const redisClient = getRedisClient();

// BullMQ requires maxRetriesPerRequest: null for blocking commands
let bullmqRedis: Redis | null = null;
export const getBullmqRedisClient = (): Redis => {
  if (bullmqRedis) return bullmqRedis;

  bullmqRedis = env.REDIS_URL
    ? new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        ...(env.REDIS_URL.startsWith('rediss://') && { tls: {} }),
      })
    : new Redis({
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD || undefined,
        db: env.REDIS_DB,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      });

  return bullmqRedis;
};
