import { registerOutboundHandler } from './registry';
import { render } from '../templates/otp';

registerOutboundHandler('send_otp', async (job) => {
  const t = render({
    otp: (job as any).otp,
  });
  return {
    subject: t.subject,
    html: t.html,
    text: t.text,
  };
});
