import { Worker } from 'bullmq';
import { OutboundJob } from '@apps/email-contracts';
import { createRedisConnection } from '../config/redis';
import { env } from '../config/env';
import prisma from '../config/database';
import { logger } from '../config/logger';
import { getOutboundHandler } from '../handlers/registry';
import { send } from '../providers/resendProvider';
import { ResendPermanentError } from '../providers/errors';

export function createOutboundWorker(): Worker<OutboundJob> {
  return new Worker<OutboundJob>(
    env.EMAIL_OUTBOUND_QUEUE,
    async (job) => {
      const data = OutboundJob.parse(job.data);

      const row = await prisma.emailMessage.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
      });
      if (!row) throw new Error(`EmailMessage not found for ${data.idempotencyKey}`);
      if (row.status === 'sent' || row.status === 'delivered') {
        logger.info({ id: row.id }, 'idempotent skip');
        return;
      }

      const handler = getOutboundHandler(data.type);
      if (!handler) throw new Error(`No handler for type ${data.type}`);
      const payload = await handler(data as any);

      await prisma.emailMessage.update({
        where: { id: row.id },
        data: { subject: payload.subject, attemptCount: { increment: 1 } },
      });

      try {
        const { providerMessageId } = await send({
          to: (data as any).to,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
          replyTo: payload.replyTo,
          headers: payload.headers,
        });

        await prisma.emailMessage.update({
          where: { id: row.id },
          data: { status: 'sent', sentAt: new Date(), providerMessageId },
        });
      } catch (err) {
        if (err instanceof ResendPermanentError) {
          await prisma.emailMessage.update({
            where: { id: row.id },
            data: { status: 'failed', failedAt: new Date(), errorMessage: err.message },
          });
          return;
        }
        throw err;
      }
    },
    { connection: createRedisConnection(), concurrency: 5 }
  );
}
