import { signal } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MyAccountPage } from './my-account.page';

describe('cached dashboard owner-profile refresh', () => {
  function setup() {
    const page = Object.create(MyAccountPage.prototype) as MyAccountPage;
    const profile = new BehaviorSubject<any>(null);
    let represented: string | null = null;
    const auth = { ownerProfileUpdates$: profile.asObservable(), isViewingAsClient: () => represented !== null,
      getCurrentAuthUser: () => ({ uid: 'owner' }), getUserDataFromLocalStorage: () => ({ firebaseId: represented ?? 'owner', hasOpenBanking: false }) };
    Object.assign(page as any, { authService: auth, clientPanelService: { getSelectedClientId: () => represented },
      destroyRef: { onDestroy: () => () => {} }, hasOpenBanking: signal(true), userData: { firebaseId: 'owner', hasOpenBanking: true } });
    (page as any).observeOwnerProfile();
    return { page, profile, represent: (id: string) => represented = id };
  }
  it('shows the disconnected banner predicate when a delayed authoritative profile arrives without remounting', () => {
    const { page, profile } = setup();
    expect(page.hasOpenBanking()).toBeTrue();
    profile.next({ firebaseId: 'owner', hasOpenBanking: false });
    expect(page.hasOpenBanking()).toBeFalse(); expect(page.isDelegatedClientView()).toBeFalse();
    expect(page.userData.hasOpenBanking).toBeFalse();
  });
  it('does not copy the owner banking state into a represented dashboard', () => {
    const { page, profile, represent } = setup(); represent('client');
    profile.next({ firebaseId: 'owner', hasOpenBanking: false });
    expect(page.hasOpenBanking()).toBeTrue();
  });
  it('ignores another owner and rereads the effective tab profile on Ionic reentry', () => {
    const { page, profile } = setup();
    profile.next({ firebaseId: 'another-owner', hasOpenBanking: false });
    expect(page.hasOpenBanking()).toBeTrue();
    page.ionViewWillEnter(); expect(page.hasOpenBanking()).toBeFalse();
  });
});
