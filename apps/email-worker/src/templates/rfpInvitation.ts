import { env } from '../config/env';

export function render(args: {
  rfpCode: string;
  rfpSubject: string;
  replyToken: string;
  senderUserName?: string;
}) {
  const replyAddress = `${env.REPLY_ADDRESS_LOCAL_PART}+${args.replyToken}@${env.REPLY_ADDRESS_DOMAIN}`;
  const portalUrl = `${env.FRONTEND_URL}/rfp/respond/${args.replyToken}`;

  const subject = `New RFP: ${args.rfpSubject} (${args.rfpCode})`;

  const html = `
    <p>Hello,</p>
    <p>${args.senderUserName ?? 'A buyer'} has invited you to respond to RFP <strong>${args.rfpCode}</strong>:</p>
    <p><strong>${args.rfpSubject}</strong></p>
    <p>You can reply directly to this email with your quote, or use our portal:</p>
    <p><a href="${portalUrl}">Open response portal</a></p>
    <hr/>
    <p style="color:#666;font-size:12px">Replies should be sent to ${replyAddress} so we can match them to this RFP.</p>
  `;

  const text = [
    `Hello,`,
    `${args.senderUserName ?? 'A buyer'} has invited you to respond to RFP ${args.rfpCode}: ${args.rfpSubject}.`,
    ``,
    `Reply to this email with your quote, or open: ${portalUrl}`,
    ``,
    `Replies should be sent to ${replyAddress}.`,
  ].join('\n');

  return { subject, html, text, replyTo: replyAddress };
}
