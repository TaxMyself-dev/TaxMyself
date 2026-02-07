import * as dotenv from 'dotenv';
import * as path from 'path';
import axios from 'axios';
import { generateHmacHeaders } from './helpers/hmac.helper';

// Load .env file from backend directory (one level up from src)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

describe('Agent API - Ping (HMAC)', () => {
  const baseUrl = process.env.APP_URL;
  const apiKey = process.env.TEST_AGENT_API_KEY;
  const secret = process.env.TEST_AGENT_SECRET;

  beforeAll(() => {
    // Validate required environment variables
    if (!apiKey) {
      throw new Error('TEST_AGENT_API_KEY environment variable is required');
    }
    if (!secret) {
      throw new Error('TEST_AGENT_SECRET environment variable is required');
    }
  });

  describe('GET /agent/ping', () => {
    it('should return 200 with { ok: true } when authenticated with valid HMAC signature', async () => {
      const method = 'GET';
      const path = '/agent/ping';
      const body = ''; // Empty body for GET request

      // Generate HMAC headers
      const headers = generateHmacHeaders(method, path, body, apiKey, secret);

      // Make request
      const response = await axios.get(`${baseUrl}${path}`, {
        headers,
        validateStatus: () => true, // Don't throw on any status
      });

      // Assert response
      expect(response.status).toBe(200);
      expect(response.data).toEqual({ ok: true });
    });

    it('should return 401 when API key is missing', async () => {
      const method = 'GET';
      const path = '/agent/ping';
      const body = '';
      const headers = generateHmacHeaders(method, path, body, apiKey, secret);

      // Remove API key header
      delete headers['X-API-KEY'];

      const response = await axios.get(`${baseUrl}${path}`, {
        headers,
        validateStatus: () => true, // Don't throw on any status
      });

      expect(response.status).toBe(401);
    });

    it('should return 401 when timestamp is missing', async () => {
      const method = 'GET';
      const path = '/agent/ping';
      const body = '';
      const headers = generateHmacHeaders(method, path, body, apiKey, secret);

      // Remove timestamp header
      delete headers['X-TIMESTAMP'];

      const response = await axios.get(`${baseUrl}${path}`, {
        headers,
        validateStatus: () => true,
      });

      expect(response.status).toBe(401);
    });

    it('should return 401 when signature is missing', async () => {
      const method = 'GET';
      const path = '/agent/ping';
      const body = '';
      const headers = generateHmacHeaders(method, path, body, apiKey, secret);

      // Remove signature header
      delete headers['X-SIGNATURE'];

      const response = await axios.get(`${baseUrl}${path}`, {
        headers,
        validateStatus: () => true,
      });

      expect(response.status).toBe(401);
    });

    it('should return 401 when signature is invalid', async () => {
      const method = 'GET';
      const path = '/agent/ping';
      const body = '';
      const headers = generateHmacHeaders(method, path, body, apiKey, secret);

      // Use invalid signature
      headers['X-SIGNATURE'] = 'invalid_signature';

      const response = await axios.get(`${baseUrl}${path}`, {
        headers,
        validateStatus: () => true,
      });

      expect(response.status).toBe(401);
    });
  });
});

