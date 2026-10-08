import { IdentitySessionStore } from './identity-session-storage.service';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe('IdentitySessionStore', () => {
  it('keeps administrator and client caches isolated across tab stores', () => {
    const sharedLegacyLocal = new MemoryStorage();
    const adminTab = new IdentitySessionStore(new MemoryStorage(), sharedLegacyLocal);
    const clientTab = new IdentitySessionStore(new MemoryStorage(), sharedLegacyLocal);

    adminTab.setAuthenticatedUid('admin-1');
    expect(adminTab.setUserData({ firebaseId: 'admin-1', role: ['ADMIN'] } as any)).toBeTrue();
    adminTab.setBusinesses([{ businessNumber: '111' }] as any);

    clientTab.setAuthenticatedUid('client-1');
    expect(clientTab.setUserData({ firebaseId: 'client-1', role: ['USER'] } as any)).toBeTrue();
    clientTab.setBusinesses([{ businessNumber: '222' }] as any);

    expect(adminTab.getUserData()?.firebaseId).toBe('admin-1');
    expect(adminTab.getBusinesses()?.[0]?.businessNumber).toBe('111');
    expect(clientTab.getUserData()?.firebaseId).toBe('client-1');
    expect(clientTab.getBusinesses()?.[0]?.businessNumber).toBe('222');
  });

  it('clears cached identity and represented-client context when the Firebase UID changes', () => {
    const storage = new MemoryStorage();
    const store = new IdentitySessionStore(storage);
    store.setAuthenticatedUid('admin-1');
    store.setUserData({ firebaseId: 'admin-1' } as any);
    storage.setItem('tm.selectedClientId', 'represented-client');
    storage.setItem('tm.selectedClientName', 'Client');
    store.setBusinesses([{ businessNumber: '333' }] as any);

    store.setAuthenticatedUid('client-1');

    expect(store.getUserData()).toBeNull();
    expect(store.getBusinesses()).toBeNull();
    expect(storage.getItem('tm.selectedClientId')).toBeNull();
    expect(storage.getItem('tm.selectedClientName')).toBeNull();
  });

  it('rejects a profile whose firebaseId does not match the tab owner', () => {
    const store = new IdentitySessionStore(new MemoryStorage());
    store.setAuthenticatedUid('admin-1');

    expect(store.setUserData({ firebaseId: 'client-1' } as any)).toBeFalse();
    expect(store.getUserData()).toBeNull();
  });

  it('does not reuse a business cache after the effective client context changes', () => {
    const storage = new MemoryStorage();
    const store = new IdentitySessionStore(storage);
    store.setAuthenticatedUid('admin-1');
    storage.setItem('tm.selectedClientId', 'client-a');
    store.setBusinesses([{ businessNumber: '444' }] as any);

    storage.setItem('tm.selectedClientId', 'client-b');

    expect(store.getBusinesses()).toBeNull();
  });

  it('removes legacy shared localStorage identity values', () => {
    const legacyLocal = new MemoryStorage();
    legacyLocal.setItem('userData', '{"firebaseId":"old"}');
    legacyLocal.setItem('businesses', '[]');
    const store = new IdentitySessionStore(new MemoryStorage(), legacyLocal);

    store.purgeLegacySharedCache();

    expect(legacyLocal.getItem('userData')).toBeNull();
    expect(legacyLocal.getItem('businesses')).toBeNull();
  });
});
