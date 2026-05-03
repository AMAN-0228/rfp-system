import { Resend } from "resend";
import Mailgun from "mailgun.js";
import formData from "form-data";
import { env } from "../config/env";

let resend: Resend | null = null;
export function getResendClient(): Resend {
  if (!resend) resend = new Resend(env.RESEND_API_KEY);
  return resend;
}

let mailgun: ReturnType<InstanceType<typeof Mailgun>["client"]> | null = null;
export function getMailgunClient() {
  if (!mailgun) {
    const mg = new Mailgun(formData);
    mailgun = mg.client({ username: "api", key: env.MAILGUN_API_KEY });
  }
  return mailgun;
}
