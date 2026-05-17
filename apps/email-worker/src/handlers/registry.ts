import type { OutboundJob } from '@apps/email-contracts';

export interface OutboundEmailPayload {
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

export type OutboundHandler<T extends OutboundJob = OutboundJob> = (
  job: T
) => Promise<OutboundEmailPayload>;

const handlers = new Map<string, OutboundHandler>();

export function registerOutboundHandler<T extends OutboundJob['type']>(
  type: T,
  handler: OutboundHandler<Extract<OutboundJob, { type: T }>>
): void {
  handlers.set(type, handler as OutboundHandler);
}

export function getOutboundHandler(type: string): OutboundHandler | undefined {
  return handlers.get(type);
}
