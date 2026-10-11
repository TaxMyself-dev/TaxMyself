import { FormBuilder, FormControl, Validators } from '@angular/forms';
import { DocCreateBuilderService } from '../pages/doc-create/doc-create-builder.service';
import { FieldsCreateDocValue } from './enums';
import { ISRAELI_PHONE_ERROR, ISRAELI_PHONE_PATTERN, isValidIsraeliPhone, israeliPhoneValidator } from './israeli-phone';
import { SettingsPage } from '../pages/settings/settings.page';
import { ClientPanelPage } from '../pages/clients-panel/clients-panel.page';

const GOOD = ['021234567', '031234567', '041234567', '081234567', '091234567', '0501234567', '0521234567',
  '0551234567', '0721234567', '0768053548'];
const BAD = ['05012345', '050123456', '05012345678', '0212345678', '01234567', '061234567', '050-1234567',
  '050 1234567', '050123456a', '+972501234567', ' 0501234567', '0501234567 ', '1800123456', '*2345'];

function expectControl(make: () => FormControl, label: string, required = false) {
  for (const p of GOOD) expect(setValue(make(), p).valid).withContext(`${label} ${p}`).toBeTrue();
  for (const p of BAD) expect(setValue(make(), p).invalid).withContext(`${label} ${p}`).toBeTrue();
  expect(setValue(make(), '').valid).withContext(`${label} empty`).toBe(!required);
}
function setValue(c: FormControl, v: string) { c.setValue(v); return c; }

describe('Israeli phone validation (all routes)', () => {
  it('shared pattern/predicate', () => {
    for (const p of GOOD) expect(ISRAELI_PHONE_PATTERN.test(p)).withContext(p).toBeTrue();
    for (const p of BAD) expect(isValidIsraeliPhone(p)).withContext(p).toBeFalse();
    expect(isValidIsraeliPhone('')).toBeTrue();
    expect(isValidIsraeliPhone(null)).toBeTrue();
  });

  it('shared validator via a FormControl', () => {
    expectControl(() => new FormControl('', israeliPhoneValidator()), 'validator');
    expectControl(() => new FormControl('', [Validators.required, israeliPhoneValidator()]), 'required', true);
  });

  it('doc-create recipientPhone: optional, shared validator and message', () => {
    const field = new DocCreateBuilderService().getBaseFieldsBySection('UserDetails')
      .find(f => f.value === FieldsCreateDocValue.RECIPIENT_PHONE)!;
    expect(field.errorText).toBe(ISRAELI_PHONE_ERROR);
    expectControl(() => new FormControl('', field.validators), 'recipientPhone');
  });

  describe('settings page forms', () => {
    const page = Object.create(SettingsPage.prototype) as any;
    page.fb = new FormBuilder();
    it('personal phone and spouse phone are optional and validated', () => {
      expectControl(() => page.buildPersonalForm().get('phone'), 'personal phone');
      expectControl(() => page.buildSpouseForm().get('spousePhone'), 'spouse phone');
    });
    it('business phone: required on add-business, optional on existing business', () => {
      expectControl(() => page.buildAddBusinessForm().get('businessPhone'), 'add business', true);
      expectControl(() => page.buildBusinessForm({}).get('businessPhone'), 'business');
    });
  });

  describe('clients-panel create client (accountant)', () => {
    const validate = (phone: string) => {
      const page = Object.create(ClientPanelPage.prototype) as any;
      page.createClientFormData = { email: 'a@b.co', phone };
      page.createClientErrors = { set: (e: any) => (page.errors = e) };
      page.validateCreateClientForm();
      return page.errors?.['phone'] as string | undefined;
    };
    it('phone stays required and uses the shared rule/message', () => {
      expect(validate('')).toBe('פלאפון חובה');
      for (const p of GOOD) expect(validate(p)).withContext(p).toBeUndefined();
      for (const p of BAD) expect(validate(p)).withContext(p).toBe(ISRAELI_PHONE_ERROR);
    });
  });
});
