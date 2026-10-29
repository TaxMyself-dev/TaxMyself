export function requiredSmokeEnv(
  name: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const plain = environment[name];
  const encoded = environment[`${name}_B64`];
  if (plain !== undefined && encoded !== undefined) {
    throw new Error(`${name} and ${name}_B64 cannot both be set`);
  }
  if (encoded !== undefined) {
    const normalized = encoded.trim();
    if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
      throw new Error(`${name}_B64 is not valid base64`);
    }
    const decoded = Buffer.from(normalized, 'base64').toString('utf8');
    const canonical = Buffer.from(decoded, 'utf8').toString('base64');
    if (canonical !== normalized) {
      throw new Error(`${name}_B64 is not canonical base64`);
    }
    if (!decoded.trim())
      throw new Error(`${name}_B64 decoded to an empty value`);
    return decoded;
  }
  const value = plain?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
