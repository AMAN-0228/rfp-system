

import { render } from '@react-email/render';
import { emailProvider, EmailResponse } from './emailProvider';
import { OtpTemplate } from '../../templates/otpTemplate';


export interface SendOtpEmailOptions {
  email: string;
  otp: string;
}

export interface SendRfpEmailOptions {
  to: string | string[];
  rfpId: string;
  rfpTitle: string;
  rfpDescription: string;
  userName?: string;
  replyTo?: string;
}

export interface SendSupplierResponseEmailOptions {
  to: string;
  supplierName: string;
  rfpTitle: string;
  responseId: string;
}

export interface SendResponseConfirmedEmailOptions {
  to: string;
  supplierName: string;
  rfpTitle: string;
  responseId: string;
}

export class EmailService {
  private static instance: EmailService;

  private constructor() {}

  public static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }


  async sendOtp(options: SendOtpEmailOptions): Promise<EmailResponse> {
    const { email, otp } = options;

    const html = render(OtpTemplate({ otp, email }));

    const text = `Your OTP code is: ${otp}\n\nThis code will expire in 60 seconds. Please do not share this code with anyone.`;

    return await emailProvider.sendEmail({
      to: email,
      subject: 'Your OTP Code - RFP System',
      html,
      text,
    });
  }

  async resendOtp(options: SendOtpEmailOptions): Promise<EmailResponse> {
    return this.sendOtp(options);
  }

  async sendRfpToSuppliers(options: SendRfpEmailOptions): Promise<EmailResponse> {
    const html = `
      <h1>New RFP: ${options.rfpTitle}</h1>
      <p>${options.rfpDescription}</p>
      <p>Please reply to this email with your proposal.</p>
    `;

    return await emailProvider.sendEmail({
      to: options.to,
      subject: `New RFP: ${options.rfpTitle}`,
      html,
      replyTo: options.replyTo, 
      headers: {
        'X-RFP-ID': options.rfpId, 
      },
    });
  }

  async sendSupplierResponseNotification(
    options: SendSupplierResponseEmailOptions
  ): Promise<EmailResponse> {
    // TODO: Create notification template
    const html = `
      <h1>New Response Received</h1>
      <p>Supplier ${options.supplierName} has responded to RFP: ${options.rfpTitle}</p>
    `;

    return await emailProvider.sendEmail({
      to: options.to,
      subject: `New Response: ${options.rfpTitle}`,
      html,
    });
  }

  async sendResponseConfirmed(
    options: SendResponseConfirmedEmailOptions
  ): Promise<EmailResponse> {
    // TODO: Create confirmation template
    const html = `
      <h1>Response Received</h1>
      <p>Your response to RFP: ${options.rfpTitle} has been received and processed.</p>
    `;

    return await emailProvider.sendEmail({
      to: options.to,
      subject: `Response Confirmed: ${options.rfpTitle}`,
      html,
    });
  }
}

export const emailService = EmailService.getInstance();
