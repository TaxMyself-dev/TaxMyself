import { createHash } from 'crypto';
import { parse } from 'parse5';
import {
  EmailMessage,
  EmailPart,
} from '../../integrations/providers/email-provider';
import { matchesAccountingDocumentKeyword } from '../../integrations/utils/accounting-document-keywords.util';

export const LINK_MAX_BYTES = 10 * 1024 * 1024;
export const LINK_TIMEOUT_MS = 45_000;
export const LINK_MODEL_BUDGET_USD = 0.01;
export type LinkReason =
  | 'LINK_ACCESS_REQUIRED'
  | 'LINK_EXPIRED'
  | 'LINK_INVALID_FILE'
  | 'LINK_UNSAFE_DESTINATION'
  | 'LINK_DOWNLOAD_UNAVAILABLE'
  | 'LINK_BUDGET_EXHAUSTED'
  | 'LINK_BROWSER_UNAVAILABLE'
  | 'LINK_MANUAL_REQUIRED'
  | 'LINK_ATTEMPT_INTERRUPTED';
export class LinkDownloadError extends Error {
  constructor(readonly code: LinkReason) {
    super(code);
  }
}
export interface LinkCandidate {
  id: string;
  text: string;
  url?: string;
  tag: string;
}
export const unsafeAction = (text: string) =>
  /delete|remove|unsubscribe|\bpay(?:ment)?\b|checkout|purchase|מחיק|תשלום|הסרה|רכישה/i.test(
    text,
  );
export const documentAction = (text: string) =>
  /download|original|invoice|receipt|document|\bpdf\b|הורד|הורדה|הורדת|מקור|חשבונית|קבלה|מסמך|לצפייה/i.test(
    text,
  );
export const unrelatedAction = (text: string) =>
  /catalog|newsletter|privacy|terms of use|download (?:our )?app|קטלוג|אפליקציה|מדיניות|תנאי שימוש|sign in|log in/i.test(
    text,
  );
export function publicLink(value: string): URL {
  try {
    const u = new URL(value);
    if (
      value.length > 4096 ||
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      (u.port && u.port !== '443') ||
      !u.hostname.includes('.') ||
      /(?:^|\.)(localhost|local|internal|test|invalid)$/i.test(u.hostname)
    )
      throw Error();
    u.hash = '';
    return u;
  } catch {
    throw new LinkDownloadError('LINK_UNSAFE_DESTINATION');
  }
}
const text = (n: any, depth = 0): string =>
  depth > 100
    ? ''
    : n.nodeName === '#text'
    ? n.value
    : (n.childNodes || []).map((child) => text(child, depth + 1)).join(' ');
export function extractDocumentLinks(message: EmailMessage) {
  const found = new Map<string, { path: string; url: string; label: string }>();
  const subject =
    message.payload.headers?.find((h) => h.name?.toLowerCase() === 'subject')
      ?.value || '';
  const add = (value: string, label: string, context: string) => {
    if (unsafeAction(label) || unrelatedAction(label)) return;
    if (
      !documentAction(label) &&
      !matchesAccountingDocumentKeyword(value) &&
      !/\.pdf(?:\?|$)/i.test(value) &&
      !(
        /click|view|open|לחצ|לחץ|כאן|צפייה|צפה|פתח/i.test(label) &&
        matchesAccountingDocumentKeyword(context)
      )
    )
      return;
    try {
      const url = publicLink(value).href;
      if (!found.has(url) && found.size < 10)
        found.set(url, {
          path: 'link:' + createHash('sha256').update(url).digest('hex'),
          url,
          label: label.slice(0, 160),
        });
    } catch {
      /* Unsupported schemes are never queued or opened. */
    }
  };
  let remaining = 256 * 1024;
  const walk = (part: EmailPart, depth: number) => {
    if (depth > 20 || remaining <= 0) return;
    if (
      !part.filename &&
      part.body?.data &&
      ['text/html', 'text/plain'].includes(part.mimeType?.toLowerCase())
    ) {
      const bytes = Buffer.from(part.body.data.slice(0, 350000), 'base64url');
      const body = bytes.subarray(0, remaining).toString('utf8');
      remaining -= bytes.length;
      if (part.mimeType.toLowerCase() === 'text/html') {
        const root = parse(body);
        const visit = (n: any, depth = 0) => {
          if (depth > 100) return;
          if (['script', 'style', 'noscript'].includes(n.tagName)) return;
          if (n.tagName === 'a') {
            const href = n.attrs?.find((a) => a.name === 'href')?.value;
            if (href) add(href, text(n), subject);
          }
          for (const child of n.childNodes || []) visit(child, depth + 1);
        };
        visit(root);
      } else
        for (const match of body.matchAll(/https:\/\/[^\s<>"']+/g)) {
          const index = match.index || 0;
          add(
            match[0].replace(/[).,;]+$/, ''),
            body.slice(Math.max(0, index - 80), index).trim(),
            subject,
          );
        }
    }
    for (const child of part.parts || []) walk(child, depth + 1);
  };
  walk(message.payload, 0);
  return [...found.values()];
}
export function chooseDeterministically(
  candidates: LinkCandidate[],
): string | null {
  const safe = candidates.filter(
    (c) =>
      !unsafeAction(c.text) &&
      !unrelatedAction(c.text) &&
      isDocumentCandidate(c),
  );
  const original = safe.filter(
    (c) => /original|מקור/i.test(c.text) && !/copy|העתק/i.test(c.text),
  );
  if (original.length === 1) return original[0].id;
  return safe.length === 1 ? safe[0].id : null;
}

export function isDocumentCandidate(candidate: LinkCandidate): boolean {
  if (documentAction(candidate.text)) return true;
  // Hostnames and signed query tokens are not evidence that a link is a document.
  // In particular a "back to all scenarios" link on an invoice-named host must
  // never take precedence over a JavaScript download button.
  try {
    const pathname = decodeURIComponent(
      new URL(candidate.url, 'https://relative.example').pathname,
    );
    return (
      matchesAccountingDocumentKeyword(pathname) || /\.pdf$/i.test(pathname)
    );
  } catch {
    return false;
  }
}
