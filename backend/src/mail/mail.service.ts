import { Injectable } from '@nestjs/common';
import * as Brevo from 'sib-api-v3-sdk';

@Injectable()
export class MailService {
  private client: Brevo.TransactionalEmailsApi;

  constructor() {
    const defaultClient = Brevo.ApiClient.instance;
    const apiKey = defaultClient.authentications['api-key'];
    apiKey.apiKey = process.env.BREVO_API_KEY; // Store API key in .env file
    this.client = new Brevo.TransactionalEmailsApi();
  }

  async sendMail(to: string, subject: string, text: string) {
    const email = {
      sender: { email: process.env.BREVO_SENDER, name: 'Keepintax' },
      to: [{ email: to }],
      subject: subject,
      textContent: text,
    };

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
    attachmentContentType: string = 'application/pdf'
  ) {
    console.log('📧 [MailService] Preparing email with attachment:');
    console.log('  To:', to);
    console.log('  Subject:', subject);
    console.log('  Attachment name:', attachmentName);
    console.log('  Attachment size:', attachmentBuffer.length, 'bytes');
    console.log('  Sender:', process.env.BREVO_SENDER);

    // Convert buffer to base64
    const attachmentContent = attachmentBuffer.toString('base64');
    console.log('  Attachment converted to base64, length:', attachmentContent.length);

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
      sender: { email: process.env.BREVO_SENDER, name: 'Taxmyself' },
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
      console.log('📧 [MailService] Sending email via BREVO API...');
      const response = await this.client.sendTransacEmail(email);
      console.log('✅ [MailService] Email sent successfully!');
      console.log('  Response message ID:', response.messageId);
      console.log('  Response:', JSON.stringify(response, null, 2));
      return response;
    } catch (error: any) {
      console.error('❌ [MailService] Error sending email with attachment:');
      console.error('  To:', to);
      console.error('  Subject:', subject);
      
      // Check for BREVO specific errors
      if (error?.response?.body) {
        const brevoError = error.response.body;
        console.error('  BREVO Error Code:', brevoError.code);
        console.error('  BREVO Error Message:', brevoError.message);
        
        if (error.status === 401) {
          console.error('  ⚠️  Unauthorized - Check BREVO API key and IP whitelist');
          if (brevoError.message?.includes('IP address')) {
            console.error('  📝 Action required: Add your IP address to BREVO authorized IPs');
            console.error('  🔗 Link: https://app.brevo.com/security/authorised_ips');
          }
        }
      }
      
      if (error instanceof Error) {
        console.error('  Error message:', error.message);
        console.error('  Error stack:', error.stack);
      } else if (error?.text) {
        console.error('  Error response text:', error.text);
      } else {
        console.error('  Error object:', JSON.stringify(error, null, 2));
      }
      throw error;
    }
  }
}
