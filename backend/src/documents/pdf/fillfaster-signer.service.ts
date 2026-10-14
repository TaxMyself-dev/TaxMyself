import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';

export const FILLFASTER_SIGNING_TEMPLATE_ID = '3IfhJjgmAp';

// This validates the PDF signature envelope, not certificate trust. Independent
// cryptographic validation and account/template acceptance are release gates.
export function hasCompletePdfSignature(pdf: Buffer): boolean {
  if (pdf.subarray(0, 5).toString() !== '%PDF-') return false;
  const text = pdf.toString('latin1');
  const ranges = [
    ...text.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g),
  ];
  return ranges.some((match) => {
    const [start, firstLength, secondStart, secondLength] = match
      .slice(1)
      .map(Number);
    if (
      start !== 0 ||
      firstLength <= 0 ||
      secondStart <= firstLength ||
      secondLength <= 0 ||
      secondStart + secondLength > pdf.length
    )
      return false;
    if (text.slice(secondStart + secondLength).trim()) return false;
    const gap = text.slice(firstLength, secondStart);
    return /^<[0-9a-fA-F\s]+>$/.test(gap) && /[1-9a-fA-F]/.test(gap);
  });
}

@Injectable()
export class FillFasterSigner {
  async sign(pdf: Buffer): Promise<Buffer> {
    const token = process.env.FILLFASTER_API_TOKEN;
    if (!token)
      throw new ServiceUnavailableException(
        'FillFaster signing configuration is missing.',
      );
    try {
      const response = await axios.post(
        'https://api.fillfaster.com/v1/generatePDF',
        {
          fid: FILLFASTER_SIGNING_TEMPLATE_ID,
          prefill_data: {},
          basePdf: `data:application/pdf;base64,${pdf.toString('base64')}`,
          digitallySign: true,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
          timeout: 60000,
          maxContentLength: 25 * 1024 * 1024,
          maxBodyLength: 25 * 1024 * 1024,
        },
      );
      const signed = Buffer.from(response.data);
      if (!hasCompletePdfSignature(signed))
        throw new Error('Missing complete PDF signature envelope');
      return signed;
    } catch {
      // Never expose axios request config (Bearer token / document contents).
      throw new ServiceUnavailableException(
        'Document signing failed. No unsigned document was issued.',
      );
    }
  }
}
