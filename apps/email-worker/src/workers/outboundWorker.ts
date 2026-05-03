import { Worker } from "bullmq";
import type { OutboundJob } from "@apps/email-contracts";
import { logger } from "../config/logger";
import { redisConnectionOptions } from "../config/redis";
import { env } from "../config/env";

export function createOutboundWorker(): Worker<OutboundJob> {
  return new Worker<OutboundJob>(
    env.EMAIL_OUTBOUND_QUEUE,
    async (job) => {
      logger.info({ jobId: job.id, type: job.data.type }, "outbound job (skeleton)");
    },
    { connection: redisConnectionOptions, concurrency: 5 }
  );
}
