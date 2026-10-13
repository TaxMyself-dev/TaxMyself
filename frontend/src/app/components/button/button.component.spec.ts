import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule, FormControl, FormGroup, Validators } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { ButtonComponent } from './button.component';

@Component({
  standalone: true,
  imports: [ButtonComponent, ReactiveFormsModule],
  template: `<form [formGroup]="form" (ngSubmit)="submissions = submissions + 1">
    <input formControlName="email"><input formControlName="password" type="password">
    <app-p-button buttonText="Reset" (onButtonClicked)="resets = resets + 1" />
    <app-p-button type="submit" buttonText="Login" [disabled]="form.invalid" [isLoading]="loading" />
  </form>`,
})
class LoginFormHarness {
  form = new FormGroup({email: new FormControl('test@example.com', Validators.required), password: new FormControl('pass1234', Validators.required)});
  submissions = 0;
  resets = 0;
  loading = false;
}

describe('ButtonComponent form submission', () => {
  let fixture: ComponentFixture<LoginFormHarness>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({imports: [LoginFormHarness], providers: [provideRouter([])]}).compileComponents();
    fixture = TestBed.createComponent(LoginFormHarness);
    fixture.detectChanges();
  });
  it('defaults auxiliary buttons to button and exposes login as the only submit button', () => {
    const buttons = fixture.nativeElement.querySelectorAll('button');
    expect(buttons[0].type).toBe('button');
    expect(buttons[1].type).toBe('submit');
  });
  it('submits exactly once when login is clicked', () => {
    fixture.nativeElement.querySelector('button[type="submit"]').click();
    expect(fixture.componentInstance.submissions).toBe(1);
  });
  it('does not submit when password reset is clicked', () => {
    fixture.nativeElement.querySelector('button[type="button"]').click();
    expect(fixture.componentInstance.resets).toBe(1);
    expect(fixture.componentInstance.submissions).toBe(0);
  });
  it('does not submit invalid credentials', () => {
    fixture.componentInstance.form.controls.password.setValue('');
    fixture.detectChanges();
    fixture.nativeElement.querySelector('button[type="submit"]').click();
    expect(fixture.componentInstance.submissions).toBe(0);
  });
  it('does not submit while loading', () => {
    fixture.componentInstance.loading = true;
    fixture.detectChanges();
    fixture.nativeElement.querySelector('button[type="submit"]').click();
    expect(fixture.componentInstance.submissions).toBe(0);
  });
  it('forwards submit type for the custom icon variant', () => {
    const button = TestBed.createComponent(ButtonComponent);
    button.componentRef.setInput('customIcon', true);
    button.componentRef.setInput('type', 'submit');
    button.detectChanges();
    expect(button.nativeElement.querySelector('button').type).toBe('submit');
  });
});
