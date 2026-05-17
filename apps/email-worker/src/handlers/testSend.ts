import { registerOutboundHandler } from './registry';

registerOutboundHandler('test_send', async (job) => ({
  subject: job.subject,
  html: `<p>${job.body}</p>`,
  text: job.body,
}));
