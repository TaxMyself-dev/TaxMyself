import { TestBed } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { LoginPage } from './login.page';
import { NetworkStatusService } from 'src/app/services/pwa/network-status.service';

describe('Login email validation', () => {
  let page: LoginPage;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: NetworkStatusService, useValue: {} }] });
    page = TestBed.runInInjectionContext(() => new LoginPage(
      null, null, null, null, null, null, new FormBuilder(), null, null, null,
    ));
  });

  it('allows the actual Direct-demo credentials through the login form', () => {
    page.loginForm.setValue({ userName: 'demo+direct-card@taxmyself.local', password: 'test1234' });
    expect(page.loginForm.valid).toBeTrue();
  });

  for (const email of ['person+tag@example.com', 'person@example.technology', 'person@example.co.il']) {
    it(`accepts ${email} for login and password reset`, () => {
      for (const form of [page.loginForm, page.resetForm]) {
        form.get('userName')!.setValue(email);
        expect(form.get('userName')!.valid).toBeTrue();
      }
    });
  }

  for (const email of ['', 'person', 'person@@example.com', 'person name@example.com', 'person@']) {
    it(`rejects malformed or empty address ${JSON.stringify(email)}`, () => {
      for (const form of [page.loginForm, page.resetForm]) {
        form.get('userName')!.setValue(email);
        expect(form.get('userName')!.invalid).toBeTrue();
      }
    });
  }
});
