import { registerOutboundHandler } from './registry';
import { render } from '../templates/rfpInvitation';

registerOutboundHandler('send_rfp_invitation', async (job) => {
  const t = render({
    rfpCode: (job as any).rfpCode,
    rfpSubject: (job as any).rfpSubject,
    replyToken: (job as any).replyToken,
    senderUserName: (job as any).senderUserName,
  });
  return {
    subject: t.subject,
    html: t.html,
    text: t.text,
    replyTo: t.replyTo,
    headers: { 'X-RFP-Id': String((job as any).rfpId), 'X-Supplier-Id': String((job as any).supplierId) },
  };
});
