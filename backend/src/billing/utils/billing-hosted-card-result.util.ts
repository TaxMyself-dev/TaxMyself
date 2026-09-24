// ── Swagger-verified field names from LowProfileResult / TransactionInfo / TokenInfo ─

export interface CardcomWebhookPayload {
  ResponseCode?: number;
  Description?: string;
  TerminalNumber?: number;
  LowProfileId?: string;
  TranzactionId?: number;
  ReturnValue?: string;
  Operation?: string;
  DocumentInfo?: {
    ResponseCode?: number;
    DocumentType?: string;
    DocumentNumber?: number;
    DocumentUrl?: string;
  };
  TokenInfo?: {
    Token?: string;
    TokenExDate?: string;
    CardYear?: number;
    CardMonth?: number;
    TokenApprovalNumber?: string;
    CardOwnerIdentityNumber?: string;
  };
  TranzactionInfo?: {
    ResponseCode?: number;
    Description?: string;
    TranzactionId?: number;
    Amount?: number;
    Last4CardDigits?: number;
    Last4CardDigitsString?: string;
    Token?: string;
    CardName?: string;
    Brand?: string;
    CardMonth?: number;
    CardYear?: number;
    DocumentNumber?: number;
    DocumentType?: string;
    DocumentUrl?: string;
  };
}

/** Card fields persisted onto payment_method after a verified CardCom result. */
export interface CardDetails {
  token: string | null;
  last4: string | null;
  brand: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
}

/** Single source of truth for reading the token/card fields of a LowProfile result. */
export function extractCardDetails(
  verified: CardcomWebhookPayload,
): CardDetails {
  const brand =
    verified.TranzactionInfo?.Brand ??
    verified.TranzactionInfo?.CardName ??
    null;
  return {
    token: verified.TokenInfo?.Token ?? verified.TranzactionInfo?.Token ?? null,
    last4:
      verified.TranzactionInfo?.Last4CardDigitsString ??
      (verified.TranzactionInfo?.Last4CardDigits != null
        ? String(verified.TranzactionInfo.Last4CardDigits).padStart(4, '0')
        : null),
    brand: typeof brand === 'string' ? brand : null,
    expiryMonth:
      verified.TokenInfo?.CardMonth ??
      verified.TranzactionInfo?.CardMonth ??
      null,
    expiryYear:
      verified.TokenInfo?.CardYear ??
      verified.TranzactionInfo?.CardYear ??
      null,
  };
}

/** Sanitized, token-free reasons a hosted-result token recovery was not accepted. */
export type HostedTokenRecoveryReason =
  | 'NO_LOW_PROFILE_ID'
  | 'NO_TRANSACTION_ID'
  | 'LOOKUP_UNAVAILABLE'
  | 'LOOKUP_FAILED'
  | 'MALFORMED_RESULT'
  | 'RESULT_NOT_SUCCESSFUL'
  | 'LOW_PROFILE_MISMATCH'
  | 'TERMINAL_MISMATCH'
  | 'TRANSACTION_MISMATCH'
  | 'RETURN_VALUE_MISMATCH'
  | 'AMOUNT_MISMATCH'
  | 'NO_TOKEN'
  | 'ENCRYPTION_FAILED'
  | 'PAYMENT_METHOD_NEWER'
  | 'PAYMENT_METHOD_UNAVAILABLE'
  | 'STORE_FAILED';

export interface HostedCaptureExpectation {
  lowProfileId: string;
  /** Known once the attempt is CAPTURED; absent while reconciling an UNKNOWN one. */
  transactionId?: string | null;
  amountAgorot: number;
  firebaseId: string;
  subscriptionId: number;
  planId: number;
  billingAttemptId: number;
  /** Configured CardCom terminal; compared only when the result reports one. */
  terminalNumber?: number | null;
}

// Encrypted tokens (IV + tag + ciphertext, base64) must fit varchar(512).
const MAX_TOKEN_LENGTH = 200;

function returnValueMatches(
  verified: CardcomWebhookPayload,
  expected: HostedCaptureExpectation,
): boolean {
  let returnValue: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(String(verified.ReturnValue));
    returnValue = parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    returnValue = null;
  }
  return (
    !!returnValue &&
    returnValue.intent === 'CHECKOUT' &&
    returnValue.firebaseId === expected.firebaseId &&
    returnValue.subscriptionId === expected.subscriptionId &&
    returnValue.planId === expected.planId &&
    returnValue.billingAttemptId === expected.billingAttemptId
  );
}

function terminalMatches(
  verified: CardcomWebhookPayload,
  expected: HostedCaptureExpectation,
): boolean {
  return (
    verified.TerminalNumber == null ||
    expected.terminalNumber == null ||
    Number(verified.TerminalNumber) === expected.terminalNumber
  );
}

/**
 * The single validation of a hosted LowProfile result as a SUCCESSFUL capture of
 * exactly this attempt: same LowProfileId (and terminal, when reported), same
 * provider transaction (when already known), the captured amount and a
 * ReturnValue that names this owner, subscription, plan and attempt. Anything
 * else — including a missing field — is rejected with a sanitized reason; the
 * result is never echoed. Card details are validated separately.
 */
export function validateHostedTransactionResult(
  result: unknown,
  expected: HostedCaptureExpectation,
):
  | { verified: CardcomWebhookPayload; transactionId: string }
  | { reason: HostedTokenRecoveryReason } {
  if (!result || typeof result !== 'object') {
    return { reason: 'MALFORMED_RESULT' };
  }
  const verified = result as CardcomWebhookPayload;
  if (
    verified.ResponseCode !== 0 ||
    (verified.TranzactionInfo != null &&
      verified.TranzactionInfo.ResponseCode !== 0)
  ) {
    return { reason: 'RESULT_NOT_SUCCESSFUL' };
  }
  if (verified.LowProfileId !== expected.lowProfileId) {
    return { reason: 'LOW_PROFILE_MISMATCH' };
  }
  if (!terminalMatches(verified, expected)) {
    return { reason: 'TERMINAL_MISMATCH' };
  }
  const transactionId =
    verified.TranzactionId ?? verified.TranzactionInfo?.TranzactionId;
  if (
    transactionId == null ||
    (expected.transactionId != null &&
      String(transactionId) !== expected.transactionId)
  ) {
    return { reason: 'TRANSACTION_MISMATCH' };
  }
  if (!returnValueMatches(verified, expected)) {
    return { reason: 'RETURN_VALUE_MISMATCH' };
  }
  const amountNis = verified.TranzactionInfo?.Amount;
  if (
    typeof amountNis !== 'number' ||
    !Number.isFinite(amountNis) ||
    Math.round(amountNis * 100) !== expected.amountAgorot
  ) {
    return { reason: 'AMOUNT_MISMATCH' };
  }
  return { verified, transactionId: String(transactionId) };
}

/**
 * True only for a result that definitively belongs to this attempt (same
 * LowProfileId, terminal and ReturnValue) AND reports a transaction that was
 * attempted and rejected (TranzactionInfo.ResponseCode is a non-zero number
 * other than the 700/701 J2/J5 successes). A result with no transaction (page
 * not yet completed), a foreign result or a malformed one is never a decline.
 */
export function isDefinitiveHostedDecline(
  result: unknown,
  expected: HostedCaptureExpectation,
): { responseCode: number } | null {
  if (!result || typeof result !== 'object') return null;
  const verified = result as CardcomWebhookPayload;
  if (
    verified.LowProfileId !== expected.lowProfileId ||
    !terminalMatches(verified, expected) ||
    !returnValueMatches(verified, expected)
  ) {
    return null;
  }
  const code = verified.TranzactionInfo?.ResponseCode;
  if (
    typeof code !== 'number' ||
    !Number.isFinite(code) ||
    code === 0 ||
    code === 700 ||
    code === 701
  ) {
    return null;
  }
  return { responseCode: code };
}

/**
 * Accepts card details from a LowProfile lookup ONLY for the exact captured
 * hosted attempt (see validateHostedTransactionResult).
 */
export function validateHostedCaptureResult(
  result: unknown,
  expected: HostedCaptureExpectation,
):
  | { card: CardDetails & { token: string } }
  | { reason: HostedTokenRecoveryReason } {
  const transaction = validateHostedTransactionResult(result, expected);
  if ('reason' in transaction) return transaction;

  const card = extractCardDetails(transaction.verified);
  if (card.token == null || card.token === '') return { reason: 'NO_TOKEN' };
  const validLast4 = card.last4 == null || /^\d{4}$/.test(card.last4);
  const validExpiry =
    (card.expiryMonth == null ||
      (Number.isInteger(card.expiryMonth) &&
        card.expiryMonth >= 1 &&
        card.expiryMonth <= 12)) &&
    (card.expiryYear == null ||
      (Number.isInteger(card.expiryYear) &&
        card.expiryYear >= 2000 &&
        card.expiryYear <= 2200));
  if (
    typeof card.token !== 'string' ||
    card.token.length > MAX_TOKEN_LENGTH ||
    !validLast4 ||
    !validExpiry ||
    (card.brand != null && card.brand.length > 50)
  ) {
    return { reason: 'MALFORMED_RESULT' };
  }
  return { card: { ...card, token: card.token } };
}
