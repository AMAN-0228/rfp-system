import { getResendClient } from './clients';
import { ResendPermanentError, ResendTransientError } from './errors';
import { env } from '../config/env';

export interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

export async function send(args: SendArgs): Promise<{ providerMessageId: string }> {
  const client = getResendClient();
  const result = await client.emails.send({
    from: `${env.RESEND_FROM_NAME} <${env.RESEND_FROM_EMAIL}>`,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
    replyTo: args.replyTo,
    headers: args.headers,
  });

  if (result.error) {
    const code = (result.error as any).statusCode ?? 500;
    if (code >= 400 && code < 500) {
      throw new ResendPermanentError(result.error.message, code);
    }
    throw new ResendTransientError(result.error.message, code);
  }

  if (!result.data?.id) {
    throw new ResendTransientError('Resend returned no message id');
  }
  return { providerMessageId: result.data.id };
}
