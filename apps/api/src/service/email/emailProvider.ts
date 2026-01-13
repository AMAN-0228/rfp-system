
import { Resend } from 'resend';
import { env } from '../../config/env';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}


export interface EmailResponse {
  id: string;
  success: boolean;
  error?: Error;
}

export class EmailProvider {
  private static instance: EmailProvider;
  
  private resend: Resend;

 
  private constructor() {
    if (!env.EMAIL_ENABLED) {
      throw new Error(
        'Email service is disabled. Set EMAIL_ENABLED=true in environment variables.'
      );
    }

    if (!env.RESEND_API_KEY) {
      throw new Error(
        'RESEND_API_KEY is required. Please set it in your environment variables.'
      );
    }

    this.resend = new Resend(env.RESEND_API_KEY);
  }


  public static getInstance(): EmailProvider {
    if (!EmailProvider.instance) {
      EmailProvider.instance = new EmailProvider();
    }
    return EmailProvider.instance;
  }

  async sendEmail(options: SendEmailOptions): Promise<EmailResponse> {
    try {
      const from = options.from || `${env.RESEND_FROM_NAME} <${env.RESEND_FROM_EMAIL}>`;

      const result = await this.resend.emails.send({
        from, 
        to: Array.isArray(options.to) ? options.to : [options.to], // Convert to array
        subject: options.subject, 
        html: options.html, 
        text: options.text, 
        replyTo: options.replyTo, 
        headers: options.headers, 
      });

      if (result.error) {
        return {
          id: '',
          success: false,
          error: new Error(result.error.message || 'Failed to send email'),
        };
      }

      return {
        id: result.data?.id || '',
        success: true,
      };
    } catch (error) {
      return {
        id: '',
        success: false,
        error: error instanceof Error ? error : new Error('Unknown error occurred'),
      };
    }
  }

  async sendEmailWithRetry(
    options: SendEmailOptions,
    maxRetries: number = 3,
    retryDelay: number = 1000
  ): Promise<EmailResponse> {
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await this.sendEmail(options);
      
      if (result.success) {
        return result;
      }

      lastError = result.error;
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
      }
    }

    return {
      id: '',
      success: false,
      error: lastError || new Error('Failed to send email after retries'),
    };
  }
}

export const emailProvider = EmailProvider.getInstance();
