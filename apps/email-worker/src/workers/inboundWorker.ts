import { Worker } from "bullmq";
import type { ProcessInboundJob } from "@apps/email-contracts";
import { logger } from "../config/logger";
import { redisConnection } from "../config/redis";
import { env } from "../config/env";

export function createInboundWorker(): Worker<ProcessInboundJob> {
  return new Worker<ProcessInboundJob>(
    env.EMAIL_INBOUND_QUEUE,
    async (job) => {
      logger.info({ jobId: job.id, type: job.data.type }, "inbound job (skeleton)");
    },
    { connection: redisConnection, concurrency: 3 }
  );
}
