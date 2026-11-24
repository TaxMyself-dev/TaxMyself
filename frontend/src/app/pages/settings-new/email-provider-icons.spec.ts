import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ButtonComponent } from '../../components/button/button.component';
import { ButtonColor } from '../../components/button/button.enum';

describe('Provider icons inside the new Settings cascade', () => {
  let style: HTMLStyleElement;
  let host: HTMLDivElement;
  let fixture: ComponentFixture<ButtonComponent>;
  beforeAll(async () => {
    const response=await fetch('/base/src/app/pages/settings-new/settings-new-connections.scss');
    if(!response.ok)throw Error('Actual Settings stylesheet was not served');
    style=document.createElement('style');
    style.textContent=(await response.text()).replace(/:host ::ng-deep/g,'.settings-new-icon-test');
    document.head.appendChild(style);
  });
  afterAll(()=>style.remove());
  beforeEach(async()=>{
    await TestBed.configureTestingModule({imports:[ButtonComponent],providers:[provideRouter([]),provideNoopAnimations()]}).compileComponents();
    fixture=TestBed.createComponent(ButtonComponent);
    fixture.componentRef.setInput('buttonColor',ButtonColor.BLACK);
    host=document.createElement('div');host.className='settings-new-icon-test';
    host.innerHTML='<div class="integration-area"><div class="gmail-actions"></div></div>';
    document.body.appendChild(host);host.querySelector('.gmail-actions')!.appendChild(fixture.nativeElement);
  });
  afterEach(()=>{fixture.destroy();host.remove();});
  it('shows the Outlook icon without a Gmail pseudo-element or Google image',()=>{
    fixture.componentRef.setInput('buttonText','חבר חשבון Outlook');
    fixture.componentRef.setInput('icon','outlook-brand-icon');fixture.detectChanges();
    const button=fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.querySelectorAll('.outlook-brand-icon').length).toBe(1);
    expect(button.querySelector('img[src*="google"],img[src*="gmail"]')).toBeNull();
    expect(getComputedStyle(button,'::after').content).toBe('none');
  });
  it('keeps the Gmail badge on the explicitly marked Gmail connect button',()=>{
    fixture.componentRef.setInput('buttonText','חבר חשבון Gmail');
    fixture.componentRef.setInput('class','gmail-connect-button');fixture.detectChanges();
    const button=fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(getComputedStyle(button,'::after').backgroundImage).toContain('/assets/settings-new/gmail.png');
    expect(getComputedStyle(button,'::after').content).toBe('""');
  });
  it('does not add Gmail branding to a generic black import button',()=>{
    fixture.componentRef.setInput('buttonText','התחל ייבוא מהמייל');fixture.detectChanges();
    expect(getComputedStyle(fixture.nativeElement.querySelector('button'),'::after').content).toBe('none');
  });
});
