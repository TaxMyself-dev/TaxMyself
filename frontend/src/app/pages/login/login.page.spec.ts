import { signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { LoginPage } from './login.page';

describe('LoginPage submission guards', () => {
  let page: LoginPage;
  let offlineCheck: jasmine.Spy;
  beforeEach(() => {
    page = Object.create(LoginPage.prototype);
    page.loginForm = new FormGroup({userName: new FormControl('', Validators.required), password: new FormControl('', Validators.required)});
    page.isLoading = signal(false);
    offlineCheck = jasmine.createSpy('blockIfOffline').and.returnValue(true);
    (page as any).blockIfOffline = offlineCheck;
  });
  it('rejects an invalid form before attempting authentication', () => {
    page.login();
    expect(offlineCheck).not.toHaveBeenCalled();
    expect(page.isLoading()).toBeFalse();
  });
  it('rejects another submission while login is running', () => {
    page.loginForm.setValue({userName: 'test@example.com', password: 'pass1234'});
    page.isLoading.set(true);
    page.login();
    expect(offlineCheck).not.toHaveBeenCalled();
  });
  it('allows valid credentials to reach the existing login flow', () => {
    page.loginForm.setValue({userName: 'test@example.com', password: 'pass1234'});
    page.login();
    expect(offlineCheck).toHaveBeenCalledTimes(1);
  });
});

describe('LoginPage background Enter shortcut', () => {
  let page: LoginPage;
  let login: jasmine.Spy;
  let surface: HTMLDivElement;
  let wasHydrated: boolean;

  beforeEach(() => {
    // Ionic hides body until hydration; these DOM tests need the real visible layout.
    wasHydrated = document.documentElement.classList.contains('hydrated');
    document.documentElement.classList.add('hydrated');
    page = Object.create(LoginPage.prototype);
    page.loginForm = new FormGroup({
      userName: new FormControl('test@example.com', [Validators.required, Validators.email]),
      password: new FormControl('pass1234', Validators.required),
    });
    page.isLoading = signal(false);
    page.isLoadingStateResetPassword = signal(false);
    page.showModal = signal(false);
    page.mfaChallenge = signal(false);
    page.isVisibleDialogRegisterMessage = false;
    page.resetMode = false;
    (page as any).router = { url: '/login' };
    login = spyOn(page, 'login').and.resolveTo();
    surface = document.createElement('div');
    document.body.appendChild(surface);
    surface.addEventListener('keydown', event => page.onPageEnter(event));
  });

  afterEach(() => {
    surface.remove();
    if (!wasHydrated) document.documentElement.classList.remove('hydrated');
  });

  function enter(target: HTMLElement = surface, options: KeyboardEventInit = {}) {
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...options });
    target.dispatchEvent(event);
    return event;
  }

  it('submits valid credentials exactly once from a noninteractive area', () => {
    expect(enter().defaultPrevented).toBeTrue();
    expect(login).toHaveBeenCalledTimes(1);
  });

  it('allows referral query parameters on the login route', () => {
    (page as any).router.url = '/login?ref=example#top';
    enter();
    expect(login).toHaveBeenCalledTimes(1);
  });

  for (const markup of [
    '<input type="email">', '<input type="password">', '<textarea></textarea>', '<select></select>',
    '<button type="submit">Login</button>', '<button type="button">Google</button>',
    '<button type="button">Reset password</button>', '<a href="#">Link</a>',
    '<div contenteditable="true"><span>Editor</span></div>',
    '<div role="button"><span>Action</span></div>', '<div tabindex="0">Focusable action</div>',
  ]) {
    it(`preserves native Enter without a second login for ${markup}`, () => {
      surface.innerHTML = markup;
      const target = (surface.querySelector('span') || surface.firstElementChild) as HTMLElement;
      expect(enter(target).defaultPrevented).toBeFalse();
      expect(login).not.toHaveBeenCalled();
    });
  }

  it('does not submit invalid or pending credentials', () => {
    page.loginForm.controls['password'].setValue('');
    enter();
    page.loginForm.controls['password'].setValue('pass1234');
    page.loginForm.markAsPending();
    enter();
    expect(login).not.toHaveBeenCalled();
  });

  it('does not submit while login or password-reset delivery is running', () => {
    page.isLoading.set(true);
    enter();
    page.isLoading.set(false);
    page.isLoadingStateResetPassword.set(true);
    enter();
    expect(login).not.toHaveBeenCalled();
  });

  it('does not submit behind email verification, MFA, registration or reset flows', () => {
    page.showModal.set(true); enter(); page.showModal.set(false);
    page.mfaChallenge.set(true); enter(); page.mfaChallenge.set(false);
    page.isVisibleDialogRegisterMessage = true; enter(); page.isVisibleDialogRegisterMessage = false;
    page.resetMode = true; enter();
    expect(login).not.toHaveBeenCalled();
  });

  it('does not submit behind another visible dialog, but ignores hidden dialogs', () => {
    const dialog = document.createElement('dialog');
    dialog.textContent = 'Open dialog';
    surface.appendChild(dialog);
    dialog.showModal();
    expect(dialog.getClientRects().length).toBeGreaterThan(0);
    enter();
    expect(login).not.toHaveBeenCalled();
    dialog.close();
    enter();
    expect(login).toHaveBeenCalledTimes(1);
  });

  it('does not act on a cached login component while another route is active', () => {
    (page as any).router.url = '/my-account';
    enter();
    expect(login).not.toHaveBeenCalled();
  });

  it('ignores held keys, input composition and modified Enter shortcuts', () => {
    for (const options of [{ repeat: true }, { isComposing: true }, { ctrlKey: true },
      { altKey: true }, { metaKey: true }, { shiftKey: true }]) {
      expect(enter(surface, options).defaultPrevented).toBeFalse();
    }
    expect(login).not.toHaveBeenCalled();
  });

  it('respects a previously handled event', () => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    event.preventDefault();
    surface.dispatchEvent(event);
    expect(login).not.toHaveBeenCalled();
  });
});
