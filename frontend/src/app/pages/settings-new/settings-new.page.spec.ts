import { signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { SettingsNewPage, activePersonalSection } from './settings-new.page';

describe('new personal settings', () => {
  it('tracks manual scrolling and the short final section', () => {
    expect(activePersonalSection(600, 60, false)).toBe('account');
    expect(activePersonalSection(170, 60, false)).toBe('businesses');
    expect(activePersonalSection(224, 0, false)).toBe('businesses');
    expect(activePersonalSection(280, 60, true)).toBe('businesses');
    expect(activePersonalSection(600, 60, false)).toBe('account');
  });
  it('scrolls within the content container rather than the document', () => {
    const page: any = Object.create(SettingsNewPage.prototype);
    const scrollTo = jasmine.createSpy('scrollTo');
    page.activeSection = signal<'account' | 'businesses'>('account');
    page.scroller = { nativeElement: { scrollTop: 80, getBoundingClientRect: () => ({ top: 60 }), scrollTo } } as any;
    page.businessSection = { nativeElement: { getBoundingClientRect: () => ({ top: 700 }) } } as any;
    page.goTo('businesses');
    expect(scrollTo).toHaveBeenCalledWith(jasmine.objectContaining({ top: 688 }));
    page.goTo('account');
    expect(scrollTo).toHaveBeenCalledWith(jasmine.objectContaining({ top: 0 }));
  });
  it('blocks invalid personal saves and represented-client mutations', () => {
    const page: any = Object.create(SettingsNewPage.prototype);
    page.personalFormGroup = new FormGroup({ email: new FormControl('invalid', Validators.email) }) as any;
    page.authService = { isViewingAsClient: () => false } as any;
    page.updatePersonalDetails = jasmine.createSpy('save');
    page.savePersonal();
    expect(page.updatePersonalDetails).not.toHaveBeenCalled();
    page.personalFormGroup.get('email')!.setValue('valid@example.com');
    page.authService = { isViewingAsClient: () => true } as any;
    page.savePersonal();
    expect(page.updatePersonalDetails).not.toHaveBeenCalled();
    page.authService = { isViewingAsClient: () => false } as any;
    page.savePersonal();
    expect(page.updatePersonalDetails).toHaveBeenCalledTimes(1);
  });
  it('cancels only business edits and preserves the last saved values', () => {
    const page: any = Object.create(SettingsNewPage.prototype);
    page.businessEditing = signal<number | null>(null);
    const group = new FormGroup({ businessName: new FormControl('Saved business') });
    page.businessesFormArray = new FormArray([group]) as any;
    page.beginBusiness(0);
    group.patchValue({ businessName: 'Unsaved edit' });
    page.cancelBusiness();
    expect(group.value.businessName).toBe('Saved business');
    expect(page.businessEditing()).toBeNull();
  });
  it('removes a draft child locally and confirms deletion of a saved child', () => {
    const page: any = Object.create(SettingsNewPage.prototype);
    page.children = signal<any[]>([{ index: 7 }, {}]);
    page.childrenFormArray = new FormArray([new FormGroup({}), new FormGroup({})]);
    page.childEditing = signal<number | null>(1);
    page.confirmDeleteChild = jasmine.createSpy('confirm');
    page.removeNewChild(1);
    expect(page.childrenFormArray.length).toBe(1);
    expect(page.confirmDeleteChild).not.toHaveBeenCalled();
    page.removeNewChild(0);
    expect(page.confirmDeleteChild).toHaveBeenCalledWith(jasmine.objectContaining({ index: 7 }));
  });
});
