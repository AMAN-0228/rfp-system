export function render(args: { otp: string }) {
  const subject = `Your verification code: ${args.otp}`;
  const html = `
    <p>Your verification code is:</p>
    <p style="font-size:28px;font-weight:bold;letter-spacing:4px">${args.otp}</p>
    <p>It expires in 60 seconds.</p>
  `;
  const text = `Your verification code is ${args.otp}. It expires in 60 seconds.`;
  return { subject, html, text };
}
