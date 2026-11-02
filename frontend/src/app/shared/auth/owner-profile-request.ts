import { HttpContextToken } from '@angular/common/http';

/** Only the signed-in owner's profile refresh may omit represented-client context. */
export const OWNER_PROFILE_REQUEST = new HttpContextToken<boolean>(() => false);
