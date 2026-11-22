/** Pure routing policy. Never infer a recipient from the seller's tax identity. */
export interface EmailSenderRule {
  sender: string;
  action: 'BLOCK' | 'BUSINESS';
  businessNumber?: string;
}
export interface EmailRoutingSettings {
  businessNumber: string | null;
  rules: EmailSenderRule[];
}
export interface EmailRoutingDecision {
  version: 'recipient-v1';
  initialBusiness: string;
  finalBusiness: string;
  source: 'SINGLE_BUSINESS' | 'MAILBOX' | 'SENDER_RULE' | 'AI';
  ruleSender?: string;
  recipient?: {
    name: string | null;
    taxId: string;
    evidence: string | null;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  decidedAt: string;
  movedAt?: string;
}

export class EmailRuleBlockedError extends Error {
  constructor() {
    super('EMAIL_SENDER_BLOCKED');
  }
}
export class EmailRulesChangedError extends Error {
  constructor(readonly query: string) {
    super('EMAIL_RULES_CHANGED');
  }
}
export function senderAddress(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 1024) return null;
  const value = (raw.match(/<([^<>]+)>\s*$/)?.[1] || raw).trim().toLowerCase();
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(
    value,
  )
    ? value
    : null;
}
export function routingSettings(value: unknown): EmailRoutingSettings {
  const data = typeof value === 'string' ? JSON.parse(value) : value;
  if (data == null) return { businessNumber: null, rules: [] };
  if (typeof data !== 'object' || Array.isArray(data))
    throw new Error('INVALID_EMAIL_ROUTING');
  const input = data as any;
  if (!Array.isArray(input.rules) || input.rules.length > 100)
    throw new Error('INVALID_EMAIL_RULES');
  const assignments = new Map<string, string>();
  const rules = input.rules.map((rule: any): EmailSenderRule => {
    const sender = senderAddress(rule?.sender);
    if (
      !sender ||
      sender !== String(rule.sender).trim().toLowerCase() ||
      !['BLOCK', 'BUSINESS'].includes(rule.action)
    )
      throw new Error('INVALID_EMAIL_RULE');
    if (rule.action === 'BLOCK') return { sender, action: 'BLOCK' };
    if (
      typeof rule.businessNumber !== 'string' ||
      !rule.businessNumber.trim() ||
      rule.businessNumber.length > 32
    )
      throw new Error('INVALID_RULE_BUSINESS');
    const businessNumber = rule.businessNumber.trim();
    if (assignments.has(sender) && assignments.get(sender) !== businessNumber)
      throw new Error('CONFLICTING_SENDER_RULES');
    assignments.set(sender, businessNumber);
    return { sender, action: 'BUSINESS', businessNumber };
  });
  if (
    input.businessNumber != null &&
    (typeof input.businessNumber !== 'string' ||
      !input.businessNumber.trim() ||
      input.businessNumber.length > 32)
  )
    throw new Error('INVALID_MAILBOX_BUSINESS');
  return { businessNumber: input.businessNumber?.trim() || null, rules };
}
/** Evaluate the complete set; a matching block wins regardless of ordering. */
export function evaluateSender(settings: EmailRoutingSettings, raw: unknown) {
  const sender = senderAddress(raw);
  const matches = settings.rules.filter((rule) => rule.sender === sender);
  return {
    blocked: matches.some((rule) => rule.action === 'BLOCK'),
    businessNumber: matches.find((rule) => rule.action === 'BUSINESS')
      ?.businessNumber,
    sender,
  };
}
export function applySenderExclusions(
  query: string,
  settings: EmailRoutingSettings,
): string {
  return (
    query +
    [
      ...new Set(
        settings.rules
          .filter((rule) => rule.action === 'BLOCK')
          .map((rule) => rule.sender),
      ),
    ]
      .sort()
      .map((sender) => ` -from:(${sender})`)
      .join('')
  );
}
function taxIdentity(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 64) return null;
  const normalized = value.replace(/[\s.-]/g, '');
  return /^\d{9}$/.test(normalized) ? normalized : null;
}
export function resolveAiBusiness(
  invoices: any[] | null,
  businesses: { businessNumber: string }[],
) {
  const identities = new Map<string, any>();
  for (const invoice of invoices || []) {
    const id = taxIdentity(invoice?.recipient_tax_id);
    if (id) identities.set(id, invoice);
  }
  if (identities.size !== 1) return null;
  const [taxId, invoice] = [...identities.entries()][0];
  const matches = businesses.filter(
    (business) => taxIdentity(business.businessNumber) === taxId,
  );
  if (matches.length !== 1) return null;
  return {
    businessNumber: matches[0].businessNumber,
    recipient: {
      name:
        typeof invoice.recipient_name === 'string'
          ? invoice.recipient_name.slice(0, 255)
          : null,
      taxId,
      evidence:
        typeof invoice.recipient_identity_evidence === 'string'
          ? invoice.recipient_identity_evidence.slice(0, 500)
          : null,
      address:
        typeof invoice.recipient_address === 'string'
          ? invoice.recipient_address.slice(0, 500)
          : null,
      email:
        typeof invoice.recipient_email === 'string'
          ? invoice.recipient_email.slice(0, 320)
          : null,
      phone:
        typeof invoice.recipient_phone === 'string'
          ? invoice.recipient_phone.slice(0, 64)
          : null,
    },
  };
}

/** Minimal display provenance; do not expose raw model responses or contact details. */
export function emailRoutingNote(value: unknown): string | null {
  const plan = typeof value === 'string' ? JSON.parse(value) : (value as any);
  return plan?.source === 'AI' && plan.initialBusiness !== plan.finalBusiness
    ? `שויך לפי AI — מזהה הלקוח במסמך תואם לעסק ${plan.finalBusiness}`
    : null;
}
