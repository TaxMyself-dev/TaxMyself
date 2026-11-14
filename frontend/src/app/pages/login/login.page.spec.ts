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
