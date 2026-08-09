import { IsOptional, IsString } from 'class-validator';

/**
 * Top-level shape of POST /auth/signup. The nested personal/spouse/children/
 * business/validation objects are deliberately typed `any`, not a nested
 * class — they're normalized/validated inside UsersService.signup (which
 * relies on TS treating them as `any` for its many `...spread` /
 * dynamic-property-assignment steps), and giving them a strict nested DTO is
 * out of scope for this change. Declaring exactly the top-level keys already
 * in use (see frontend RegisterFormModules) keeps them safe from the app's
 * global ValidationPipe({ whitelist: true }), which silently strips any
 * undeclared property — @IsOptional() treats both `undefined` and `null` as
 * "not provided" so the existing `spouse: null` payload shape still passes.
 */
export class SignupDto {
  @IsOptional() personal?: any;
  @IsOptional() spouse?: any;
  @IsOptional() children?: any;
  @IsOptional() business?: any;
  @IsOptional() validation?: any;

  /** Accountant referral code from ?ref=<code> on the signup link, if any. */
  @IsOptional() @IsString() referralCode?: string;
}
