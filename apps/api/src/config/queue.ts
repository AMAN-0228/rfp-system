import { Queue } from "bullmq";
import { getBullmqRedisClient } from "./redis";
import type { OutboundJob, ProcessInboundJob } from "@apps/email-contracts";
import { env } from "./env";

const connection = getBullmqRedisClient();

export const outboundQueue = new Queue<OutboundJob>(
  env.EMAIL_OUTBOUND_QUEUE,
  { connection }
);

export const inboundQueue = new Queue<ProcessInboundJob>(
  env.EMAIL_INBOUND_QUEUE,
  { connection }
);
