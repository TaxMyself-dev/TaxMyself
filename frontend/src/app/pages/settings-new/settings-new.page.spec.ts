import { signal } from '@angular/core';
import { of, Subject } from 'rxjs';
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
    page.persistAccountForm = jasmine.createSpy('save');
    page.savePersonal();
    expect(page.persistAccountForm).not.toHaveBeenCalled();
    page.personalFormGroup.get('email')!.setValue('valid@example.com');
    page.authService = { isViewingAsClient: () => true } as any;
    page.savePersonal();
    expect(page.persistAccountForm).not.toHaveBeenCalled();
    page.authService = { isViewingAsClient: () => false } as any;
    page.savePersonal();
    expect(page.persistAccountForm).toHaveBeenCalledTimes(1);
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

  for (const isSpouse of [false, true]) {
    it(`returns ${isSpouse ? 'spouse' : 'personal'} fields to read-only only after successful save`, () => {
      const page: any = Object.create(SettingsNewPage.prototype);
      const request = new Subject<unknown>();
      const form = new FormGroup({ email: new FormControl('valid@example.com') });
      page.personalFormGroup = form;
      page.spouseFormGroup = form;
      page.personalEditing = signal(true);
      page.spouseEditing = signal(true);
      page.savingPersonal = signal(false);
      page.savingSpouse = signal(false);
      page.messageService = { add: jasmine.createSpy('message') };
      page.authService = { isViewingAsClient: () => false, updateUser: () => request,
        restoreUserData: () => of({ fName: 'Saved', email: 'saved@example.com' }) };
      isSpouse ? page.saveSpouse() : page.savePersonal();
      const editing = isSpouse ? page.spouseEditing : page.personalEditing;
      const saving = isSpouse ? page.savingSpouse : page.savingPersonal;
      expect(editing()).toBeTrue();
      expect(saving()).toBeTrue();
      request.next({});
      expect(editing()).toBeFalse();
      expect(saving()).toBeFalse();
      expect(page.userData.fName).toBe('Saved');
      expect(form.get('email')!.value).toBe('saved@example.com');
    });
    it(`keeps ${isSpouse ? 'spouse' : 'personal'} form editable after a failed save`, () => {
      const page: any = Object.create(SettingsNewPage.prototype);
      const request = new Subject<unknown>();
      page.personalFormGroup = new FormGroup({ email: new FormControl('valid@example.com') });
      page.spouseFormGroup = page.personalFormGroup;
      page.personalEditing = signal(true);
      page.spouseEditing = signal(true);
      page.savingPersonal = signal(false);
      page.savingSpouse = signal(false);
      page.messageService = { add: jasmine.createSpy('message') };
      page.authService = { isViewingAsClient: () => false, updateUser: () => request };
      isSpouse ? page.saveSpouse() : page.savePersonal();
      request.error(new Error('failed'));
      expect((isSpouse ? page.spouseEditing : page.personalEditing)()).toBeTrue();
      expect((isSpouse ? page.savingSpouse : page.savingPersonal)()).toBeFalse();
      expect(page.personalFormGroup.get('email').value).toBe('valid@example.com');
    });
  }
  it('keeps children editable while saving or after failure, and locks them after success', () => {
    const page: any = Object.create(SettingsNewPage.prototype);
    let request = new Subject<any[]>();
    page.childEditing = signal<number | null>(0);
    page.savingChildren = signal(false);
    page.children = signal<any[]>([]);
    page.childrenFormArray = new FormArray([new FormGroup({ childFName: new FormControl('Child'),
      childLName: new FormControl('Family'), childDate: new FormControl(new Date(2016, 6, 5)) })]);
    page.messageService = { add: jasmine.createSpy('message') };
    page.authService = { isViewingAsClient: () => false, updateChildren: jasmine.createSpy('save').and.callFake(() => request) };
    page.buildChildForm = (child: any) => new FormGroup({ childFName: new FormControl(child.childFName) });
    page.saveFamilyChildren();
    expect(page.authService.updateChildren).toHaveBeenCalledWith([
      { childFName: 'Child', childLName: 'Family', childDate: '2016-07-05' },
    ]);
    expect(page.childEditing()).toBe(0);
    request.error(new Error('failed'));
    expect(page.childEditing()).toBe(0);
    expect(page.savingChildren()).toBeFalse();
    request = new Subject<any[]>();
    page.saveFamilyChildren();
    request.next([{ index: 1, childFName: 'Child' }]);
    expect(page.childEditing()).toBeNull();
    expect(page.savingChildren()).toBeFalse();
    expect(page.childrenFormArray.at(0).get('childFName').value).toBe('Child');
  });});


describe('cancel new personal settings edits', () => {
  it('restores values including dates after clear, resets validation, and exits without saving', () => {
    const page: any = Object.create(SettingsNewPage.prototype);
    page.personalFormGroup = new FormGroup({name: new FormControl('Saved'), dateOfBirth: new FormControl(new Date(1990, 2, 4))});
    page.personalEditing = signal(false);
    page.savingPersonal = signal(false);
    page.beginPersonal();
    page.personalFormGroup.reset();
    page.personalFormGroup.markAllAsTouched();
    page.cancelPersonal();
    expect(page.personalFormGroup.value.name).toBe('Saved');
    expect(page.personalFormGroup.value.dateOfBirth).toEqual(new Date(1990, 2, 4));
    expect(page.personalFormGroup.pristine).toBeTrue();
    expect(page.personalFormGroup.untouched).toBeTrue();
    expect(page.personalEditing()).toBeFalse();
  });
  it('does not cancel while a save is pending', () => {
    const page: any = Object.create(SettingsNewPage.prototype);
    page.savingPersonal = signal(true);
    page.personalEditing = signal(true);
    page.cancelPersonal();
    expect(page.personalEditing()).toBeTrue();
  });
});
