import { registerOutboundHandler } from './registry';
import { render } from '../templates/responseConfirmed';

registerOutboundHandler('send_response_confirmed', async (job) => {
  const t = render({
    rfpSubject: (job as any).rfpSubject,
  });
  return {
    subject: t.subject,
    html: t.html,
    text: t.text,
  };
});
