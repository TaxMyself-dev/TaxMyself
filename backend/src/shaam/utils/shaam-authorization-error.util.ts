import { HttpException } from '@nestjs/common';

const SHAAM_AUTHORIZATION_REJECTION = Symbol(
  'shaamAuthorizationRejection',
);

type MarkedShaamAuthorizationError = HttpException & {
  [SHAAM_AUTHORIZATION_REJECTION]?: true;
};

export function markShaamAuthorizationRejection<T extends HttpException>(
  error: T,
): T {
  Object.defineProperty(error, SHAAM_AUTHORIZATION_REJECTION, {
    value: true,
    enumerable: false,
  });
  return error;
}

export function isShaamAuthorizationRejection(
  error: unknown,
): error is HttpException {
  return (
    error instanceof HttpException &&
    (error as MarkedShaamAuthorizationError)[
      SHAAM_AUTHORIZATION_REJECTION
    ] === true
  );
}
