import { Queue } from "bullmq";
import type { OutboundJob, ProcessInboundJob } from "@apps/email-contracts";
import { env } from "./env";

// Pass connection options; BullMQ manages its own ioredis connection internally.
const connection = env.REDIS_URL
  ? { url: env.REDIS_URL as string }
  : {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      ...(env.REDIS_PASSWORD && { password: env.REDIS_PASSWORD }),
      db: env.REDIS_DB,
    };

export const outboundQueue = new Queue<OutboundJob>(
  env.EMAIL_OUTBOUND_QUEUE,
  { connection }
);

export const inboundQueue = new Queue<ProcessInboundJob>(
  env.EMAIL_INBOUND_QUEUE,
  { connection }
);
