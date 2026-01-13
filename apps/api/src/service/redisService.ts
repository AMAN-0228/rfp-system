import { redisClient } from "../config/redis";

export const redisService = {
    get: async (key: string) => {
        return await redisClient.get(key);
    },
    set: async (key: string, value: string, ttl: number) => {
        return await redisClient.set(key, value, 'EX', ttl);
    },
    delete: async (key: string) => {
        return await redisClient.del(key);
    },
    checkBlocked: async (key: string) => {
        return await redisClient.get(`${key}_block`);
    },
    checkAttempts: async (key: string) => {
        return Number(await redisClient.get(`${key}_attempts`)) || 0;
    },
    block: async (key: string, ttl: number) => {
        return await redisClient.set(`${key}_block`, '1', 'EX', ttl);
    },
};