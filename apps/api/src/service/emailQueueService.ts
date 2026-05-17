import { OutboundJob } from '@apps/email-contracts';
import { outboundQueue } from '../config/queue';
import prisma from '../config/database';
import { env } from '../config/env';

export async function enqueueOutbound(payload: OutboundJob) {
  const parsed = OutboundJob.parse(payload);

  const emailMessage = await prisma.emailMessage.upsert({
    where: { idempotencyKey: parsed.idempotencyKey },
    create: {
      idempotencyKey: parsed.idempotencyKey,
      type: parsed.type,
      toEmail: (parsed as any).to,
      fromEmail: env.RESEND_FROM_EMAIL,
      subject: '(pending render)',
      status: env.EMAIL_ENABLED ? 'queued' : 'skipped',
      rfpId: 'rfpId' in parsed ? (parsed as any).rfpId : null,
      supplierId: 'supplierId' in parsed ? (parsed as any).supplierId : null,
      userId: 'userId' in parsed ? (parsed as any).userId : null,
    },
    update: {},
  });

  if (env.EMAIL_ENABLED && emailMessage.status === 'queued') {
    await outboundQueue.add(parsed.type, parsed, { jobId: parsed.idempotencyKey });
  }

  return emailMessage;
}
