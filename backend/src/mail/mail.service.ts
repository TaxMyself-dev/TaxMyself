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
      //sender: { email: 'info@taxmyself.co.il', name: 'Taxmyself' },
      sender: { email: process.env.BREVO_SENDER, name: 'Taxmyself' },
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
}
