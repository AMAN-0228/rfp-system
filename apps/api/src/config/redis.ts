import Redis from 'ioredis';
import { env } from './env';

let redis: Redis | null = null;

export const getRedisClient = (): Redis => {
  if (!redis) {
    // Support both connection string (cloud) and individual config (local)
    const redisConfig = process.env.REDIS_URL
      ? {
          // Cloud Redis: Use connection string
          // Format: redis://:password@host:port or rediss://:password@host:port (SSL)
          connectionName: 'rfp-system-api',
          retryStrategy: (times: number) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          lazyConnect: false,
          // Cloud Redis often uses TLS
          ...(process.env.REDIS_URL.startsWith('rediss://') && {
            tls: {},
          }),
        }
      : {
          // Local Redis: Use individual config
          host: env.REDIS_HOST,
          port: env.REDIS_PORT,
          password: env.REDIS_PASSWORD || undefined,
          db: env.REDIS_DB,
          retryStrategy: (times: number) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          lazyConnect: false,
        };

    redis = process.env.REDIS_URL
      ? new Redis(process.env.REDIS_URL, redisConfig)
      : new Redis(redisConfig);

    redis.on('connect', () => {
      const source = process.env.REDIS_URL ? 'cloud' : 'local';
      console.log(`✅ Redis connected successfully (${source})`);
    });

    redis.on('error', (err) => {
      console.error('❌ Redis connection error:', err);
    });

    redis.on('close', () => {
      console.log('⚠️ Redis connection closed');
    });

    redis.on('reconnecting', () => {
      console.log('🔄 Redis reconnecting...');
    });
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
