import * as bodyParser from 'body-parser';

/**
 * Keeps the exact bytes Meta signed and deliberately leaves parsing to the
 * controller after HMAC verification.
 */
export function whatsappRawBodyMiddleware() {
  return bodyParser.raw({
    type: 'application/json',
    limit: '1mb',
    verify: (request: any, _response, buffer) => {
      request.rawBody = Buffer.from(buffer);
    },
  });
}
