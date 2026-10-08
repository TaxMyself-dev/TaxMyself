import { Injectable } from '@angular/core';

import { Business, IUserData } from '../interface';

interface ScopedCacheValue<T> {
  ownerId: string;
  value: T;
}

const AUTH_OWNER_UID_KEY = 'tm.authOwnerUid';
const SELECTED_CLIENT_ID_KEY = 'tm.selectedClientId';
const USER_DATA_KEY = 'userData';
const BUSINESSES_KEY = 'businesses';

/**
 * Identity-scoped cache backed by one tab's sessionStorage.
 *
 * Firebase Auth also uses sessionStorage, so profile and business caches must
 * have the same lifetime and isolation boundary. localStorage is deliberately
 * forbidden here: it is shared by every tab on the origin and allowed a client
 * login in one tab to overwrite an administrator's UI identity in another.
 */
export class IdentitySessionStore {
  constructor(
    private readonly session: Storage,
    private readonly legacyLocal?: Storage,
  ) {}

  purgeLegacySharedCache(): void {
    this.legacyLocal?.removeItem(USER_DATA_KEY);
    this.legacyLocal?.removeItem(BUSINESSES_KEY);
  }

  setAuthenticatedUid(uid: string | null): void {
    const previousUid = this.session.getItem(AUTH_OWNER_UID_KEY);
    if (!uid) {
      this.clearIdentityCache();
      return;
    }

    if (previousUid && previousUid !== uid) {
      this.removeScopedValues();
      this.session.removeItem(SELECTED_CLIENT_ID_KEY);
      this.session.removeItem('tm.selectedClientName');
    }

    this.session.setItem(AUTH_OWNER_UID_KEY, uid);
  }

  getAuthenticatedUid(): string | null {
    return this.session.getItem(AUTH_OWNER_UID_KEY);
  }

  setUserData(userData: IUserData): boolean {
    const ownerUid = this.getAuthenticatedUid();
    if (!ownerUid || !userData || userData.firebaseId !== ownerUid) {
      this.session.removeItem(USER_DATA_KEY);
      return false;
    }

    this.write(USER_DATA_KEY, { ownerId: ownerUid, value: userData });
    return true;
  }

  getUserData(): IUserData | null {
    const ownerUid = this.getAuthenticatedUid();
    const cached = this.read<IUserData>(USER_DATA_KEY);
    if (!ownerUid || !cached || cached.ownerId !== ownerUid || cached.value?.firebaseId !== ownerUid) {
      this.session.removeItem(USER_DATA_KEY);
      return null;
    }
    return cached.value;
  }

  setBusinesses(businesses: Business[]): boolean {
    const contextId = this.getEffectiveContextId();
    if (!contextId) {
      this.session.removeItem(BUSINESSES_KEY);
      return false;
    }
    this.write(BUSINESSES_KEY, { ownerId: contextId, value: businesses });
    return true;
  }

  getBusinesses(): Business[] | null {
    const contextId = this.getEffectiveContextId();
    const cached = this.read<Business[]>(BUSINESSES_KEY);
    if (!contextId || !cached || cached.ownerId !== contextId || !Array.isArray(cached.value)) {
      this.session.removeItem(BUSINESSES_KEY);
      return null;
    }
    return cached.value;
  }

  clearBusinesses(): void {
    this.session.removeItem(BUSINESSES_KEY);
  }

  clearIdentityCache(): void {
    this.removeScopedValues();
    this.session.removeItem(AUTH_OWNER_UID_KEY);
    this.session.removeItem(SELECTED_CLIENT_ID_KEY);
    this.session.removeItem('tm.selectedClientName');
  }

  private getEffectiveContextId(): string | null {
    return this.session.getItem(SELECTED_CLIENT_ID_KEY) ?? this.getAuthenticatedUid();
  }

  private removeScopedValues(): void {
    this.session.removeItem(USER_DATA_KEY);
    this.session.removeItem(BUSINESSES_KEY);
  }

  private read<T>(key: string): ScopedCacheValue<T> | null {
    const raw = this.session.getItem(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as ScopedCacheValue<T>;
      if (!parsed || typeof parsed.ownerId !== 'string' || !('value' in parsed)) {
        throw new TypeError('Invalid identity cache envelope');
      }
      return parsed;
    } catch {
      this.session.removeItem(key);
      return null;
    }
  }

  private write<T>(key: string, value: ScopedCacheValue<T>): void {
    this.session.setItem(key, JSON.stringify(value));
  }
}

@Injectable({ providedIn: 'root' })
export class IdentitySessionStorageService extends IdentitySessionStore {
  constructor() {
    super(sessionStorage, localStorage);
    this.purgeLegacySharedCache();
  }
}
