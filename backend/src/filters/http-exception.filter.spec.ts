import { ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter security logging', () => {
  function setup(request: Record<string, unknown>) {
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as any;
    const filter = new HttpExceptionFilter();
    const warn = jest
      .spyOn((filter as any).logger, 'warn')
      .mockImplementation(() => undefined);
    const error = jest
      .spyOn((filter as any).logger, 'error')
      .mockImplementation(() => undefined);
    return { filter, host, response, warn, error };
  }

  afterEach(() => jest.restoreAllMocks());

  it('logs a bounded security event for 403 without query-string values', () => {
    const { filter, host, warn } = setup({
      method: 'POST',
      url: '/shaam/invoices/allocation?businessNumber=222222226&token=secret',
    });

    filter.catch(
      new ForbiddenException({ code: 'MFA_REQUIRED', message: 'denied' }),
      host,
    );

    const logged = warn.mock.calls[0][0] as string;
    expect(JSON.parse(logged)).toEqual({
      event: 'security_event',
      securityEvent: 'http_authorization_denied',
      severity: 'WARNING',
      statusCode: 403,
      path: '/shaam/invoices/allocation',
      method: 'POST',
      errorCode: 'MFA_REQUIRED',
    });
    expect(logged).not.toContain('222222226');
    expect(logged).not.toContain('secret');
  });

  it('strips the query string from 5xx error logs', () => {
    const { filter, host, error } = setup({
      method: 'POST',
      url: '/shaam/uniform-file/submissions/1/transfer?businessNumber=222222226',
    });

    filter.catch(new InternalServerErrorException('failure'), host);

    const logged = error.mock.calls[0][0] as string;
    expect(JSON.parse(logged)).toEqual(
      expect.objectContaining({
        statusCode: 500,
        path: '/shaam/uniform-file/submissions/1/transfer',
        method: 'POST',
      }),
    );
    expect(logged).not.toContain('222222226');
  });
});
