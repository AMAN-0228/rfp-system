export function render(args: { rfpSubject: string }) {
  const subject = `Response received: ${args.rfpSubject}`;
  const html = `
    <p>Thank you for your response to the RFP: <strong>${args.rfpSubject}</strong></p>
    <p>We have received your submission and will review it promptly.</p>
  `;
  const text = `Thank you for your response to the RFP: ${args.rfpSubject}\nWe have received your submission and will review it promptly.`;
  return { subject, html, text };
}
