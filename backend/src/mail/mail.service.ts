import { Injectable } from '@nestjs/common';
import * as Brevo from 'sib-api-v3-sdk';

@Injectable()
export class MailService {
  private client: Brevo.TransactionalEmailsApi;

  constructor() {
    // TEMP DEBUG: verify BREVO_API_KEY is loaded without leaking the full secret
    const rawKey = process.env.BREVO_API_KEY;
    const defaultClient = Brevo.ApiClient.instance;
    const apiKey = defaultClient.authentications['api-key'];
    apiKey.apiKey = rawKey; // Store API key in .env file
    this.client = new Brevo.TransactionalEmailsApi();
  }

  async sendMail(to: string, subject: string, text: string, htmlContent?: string) {
    const email: {
      sender: { email: string; name: string };
      to: { email: string }[];
      subject: string;
      textContent: string;
      htmlContent?: string;
    } = {
      sender: { email: process.env.BREVO_SENDER, name: 'Keepintax' },
      to: [{ email: to }],
      subject: subject,
      textContent: text,
    };
    if (htmlContent) {
      email.htmlContent = htmlContent;
    }

    try {
      const response = await this.client.sendTransacEmail(email);
      console.log('Email sent:', response);
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  async sendMailWithAttachment(
    to: string,
    subject: string,
    text: string,
    attachmentBuffer: Buffer,
    attachmentName: string,
    attachmentContentType: string = 'application/pdf',
    options?: { timeoutMs?: number; sanitizedLogs?: boolean }
  ) {
    const log = (...args: any[]) => { if (!options?.sanitizedLogs) console.log(...args); };
    const logError = (...args: any[]) => { if (!options?.sanitizedLogs) console.error(...args); };
    log('📧 [MailService] Preparing email with attachment:');
    log('  To:', to);
    log('  Subject:', subject);
    log('  Attachment name:', attachmentName);
    log('  Attachment size:', attachmentBuffer.length, 'bytes');
    log('  Sender:', process.env.BREVO_SENDER);

    // Convert buffer to base64
    const attachmentContent = attachmentBuffer.toString('base64');
    log('  Attachment converted to base64, length:', attachmentContent.length);

    // Convert text to HTML with RTL support
    const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="he">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        <style>
          * {
            direction: rtl;
            text-align: right;
          }
          body {
            font-family: Arial, Helvetica, sans-serif;
            direction: rtl;
            text-align: right;
            margin: 0;
            padding: 20px;
            background-color: #ffffff;
          }
          p {
            direction: rtl;
            text-align: right;
            margin: 10px 0;
            unicode-bidi: embed;
          }
          div {
            direction: rtl;
            text-align: right;
            unicode-bidi: embed;
          }
        </style>
      </head>
      <body>
        <div dir="rtl" style="direction: rtl; text-align: right; unicode-bidi: embed;">
          ${text.split('\n').map(line => {
            const trimmed = line.trim();
            if (!trimmed) return '<br>';
            return `<p dir="rtl" style="direction: rtl; text-align: right; unicode-bidi: embed; margin: 10px 0;">${trimmed}</p>`;
          }).join('')}
        </div>
      </body>
      </html>
    `;

    const email = {
      sender: { email: process.env.BREVO_SENDER, name: 'KeepInTax' },
      to: [{ email: to }],
      subject: subject,
      textContent: text,
      htmlContent: htmlContent,
      attachment: [
        {
          name: attachmentName,
          content: attachmentContent,
        }
      ],
    };

    try {
      log('📧 [MailService] Sending email via BREVO API...');
      let client = this.client;
      if (options?.timeoutMs) {
        const apiClient = new Brevo.ApiClient();
        apiClient.authentications['api-key'].apiKey = process.env.BREVO_API_KEY;
        apiClient.timeout = options.timeoutMs;
        client = new Brevo.TransactionalEmailsApi(apiClient);
      }
      const response = await client.sendTransacEmail(email);
      log('✅ [MailService] Email sent successfully!');
      log('  Response message ID:', response.messageId);
      log('  Response:', JSON.stringify(response, null, 2));
      return response;
    } catch (error: any) {
      logError('❌ [MailService] Error sending email with attachment:');
      logError('  To:', to);
      logError('  Subject:', subject);
      
      // Check for BREVO specific errors
      if (error?.response?.body) {
        const brevoError = error.response.body;
        logError('  BREVO Error Code:', brevoError.code);
        logError('  BREVO Error Message:', brevoError.message);
        
        if (error.status === 401) {
          logError('  ⚠️  Unauthorized - Check BREVO API key and IP whitelist');
          if (brevoError.message?.includes('IP address')) {
            logError('  📝 Action required: Add your IP address to BREVO authorized IPs');
            logError('  🔗 Link: https://app.brevo.com/security/authorised_ips');
          }
        }
      }
      
      if (error instanceof Error) {
        logError('  Error message:', error.message);
        logError('  Error stack:', error.stack);
      } else if (error?.text) {
        logError('  Error response text:', error.text);
      } else {
        logError('  Error object:', JSON.stringify(error, null, 2));
      }
      throw error;
    }
  }
}
