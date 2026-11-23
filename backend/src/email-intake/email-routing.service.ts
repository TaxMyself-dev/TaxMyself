import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Business } from '../business/business.entity';
import { UserIntegration } from '../integrations/entities/user-integration.entity';
import {
  EmailRoutingDecision,
  EmailRoutingSettings,
  EmailRuleBlockedError,
  evaluateSender,
  routingSettings,
  senderAddress,
} from './email-routing.policy';

@Injectable()
export class EmailRoutingService {
  constructor(readonly db: DataSource) {}

  async configuration(owner: string, integrationId: number) {
    const account = await this.db
      .getRepository(UserIntegration)
      .findOneBy({ id: integrationId, firebaseId: owner });
    if (
      !account ||
      account.provider !== 'GOOGLE' ||
      account.status === 'REVOKED'
    )
      throw new NotFoundException('Mailbox not found');
    return { account, settings: routingSettings(account.emailRouting) };
  }
  async ownedBusinesses(owner: string) {
    return this.db
      .getRepository(Business)
      .find({ where: { firebaseId: owner }, order: { id: 'ASC' } });
  }
  async get(owner: string, id: number) {
    const { settings } = await this.configuration(owner, id);
    const businesses = await this.ownedBusinesses(owner);
    return {
      settings,
      businesses: businesses.map((b) => ({
        businessNumber: b.businessNumber,
        businessName: b.businessName,
      })),
    };
  }
  async connectionBusiness(owner:string, selected?:string|null):Promise<string>{
    const businesses=await this.ownedBusinesses(owner);
    const target=selected?.trim()||(businesses.length===1?businesses[0].businessNumber:null);
    if(!target||!businesses.some(b=>b.businessNumber===target))throw new BadRequestException('יש לבחור עסק בבעלות החשבון לפני חיבור תיבת המייל');
    return target;
  }
  async save(owner: string, id: number, input: unknown) {
    await this.configuration(owner, id);
    let settings: EmailRoutingSettings;
    try {
      settings = routingSettings(input);
    } catch {
      throw new BadRequestException(
        'Invalid or conflicting email routing rules',
      );
    }
    const businesses = await this.ownedBusinesses(owner);
    const owned = new Set(businesses.map((b) => b.businessNumber));
    if (businesses.length > 1 && !settings.businessNumber)
      throw new BadRequestException(
        'יש לבחור עסק ברירת מחדל לתיבת המייל בהגדרות הקליטה',
      );
    if (
      (settings.businessNumber && !owned.has(settings.businessNumber)) ||
      settings.rules.some(
        (r) => r.action === 'BUSINESS' && !owned.has(r.businessNumber),
      )
    )
      throw new BadRequestException(
        'Routing business does not belong to this account',
      );
    await this.db
      .getRepository(UserIntegration)
      .update({ id, firebaseId: owner }, { emailRouting: settings });
    return { settings };
  }
  async initial(
    owner: string,
    id: number,
    sender?: string,
  ): Promise<EmailRoutingDecision> {
    const { settings } = await this.configuration(owner, id);
    const match = evaluateSender(settings, sender);
    if (match.blocked) throw new EmailRuleBlockedError();
    const businesses = await this.ownedBusinesses(owner);
    const target =
      businesses.length === 1
        ? businesses[0].businessNumber
        : match.businessNumber || settings.businessNumber;
    if (!target || !businesses.some((b) => b.businessNumber === target))
      throw new BadRequestException(
        'יש לבחור עסק ברירת מחדל תקף לתיבת המייל בהגדרות הקליטה',
      );
    return {
      version: 'recipient-v1',
      initialBusiness: target,
      finalBusiness: target,
      source:
        businesses.length === 1
          ? 'SINGLE_BUSINESS'
          : match.businessNumber
          ? 'SENDER_RULE'
          : 'MAILBOX',
      ...(match.businessNumber ? { ruleSender: match.sender } : {}),
      decidedAt: new Date().toISOString(),
    };
  }
  async assertAllowed(owner: string, integrationId: number, sender: string) {
    const { settings } = await this.configuration(owner, integrationId);
    if (
      settings.rules.some((rule) => rule.action === 'BLOCK') &&
      !senderAddress(sender)
    )
      throw new Error('EMAIL_SENDER_UNAVAILABLE');
    if (evaluateSender(settings, sender).blocked)
      throw new EmailRuleBlockedError();
  }
  async assertImportedAllowed(
    owner: string,
    importId: number,
    manager?: EntityManager,
  ) {
    const rows = await (manager || this.db).query(
      'SELECT r.integration_id,d.gmail_from FROM imported_documents d JOIN email_import_runs r ON r.id=d.email_run_id AND r.firebase_id=d.firebase_id WHERE d.id=? AND d.firebase_id=?',
      [importId, owner],
    );
    if (!rows[0]) throw new NotFoundException('Email origin unavailable');
    await this.assertAllowed(owner, rows[0].integration_id, rows[0].gmail_from);
  }
}
