import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ConfirmationService, MessageService } from 'primeng/api';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';

import { AddClientComponent } from './add-client.component';

describe('AddClientComponent', () => {
  function create(data: any) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AddClientComponent, HttpClientTestingModule],
      providers: [
        MessageService,
        ConfirmationService,
        { provide: DynamicDialogRef, useValue: { close: () => {} } },
        { provide: DynamicDialogConfig, useValue: { data } },
      ],
    });
    return TestBed.createComponent(AddClientComponent).componentInstance;
  }

  const edit = (client: any) => create({ editMode: true, client, businessNumber: '1' });

  it('creates a new client form that is invalid until a name is entered', () => {
    const c = create({ businessNumber: '1' });
    expect(c.addClientForm.invalid).toBeTrue();
    c.addClientForm.patchValue({ name: 'Dana' });
    expect(c.addClientForm.valid).toBeTrue();
  });

  it('edit: client with a name only is saveable and keeps clientRowId', () => {
    const c = edit({ clientRowId: 7, name: 'Dana', id: null, phone: null, email: null, address: null });
    expect(c.addClientForm.valid).toBeTrue();
    expect(c.addClientForm.value.phone).toBe('');
    expect(c.clientRowId).toBe(7);
  });

  it('edit: client with some fields missing is saveable', () => {
    const c = edit({ clientRowId: 8, name: 'Dana', phone: '0501234567', email: undefined });
    expect(c.addClientForm.valid).toBeTrue();
    expect(c.addClientForm.value.email).toBe('');
  });

  it('edit: invalid phone, email and id values are still rejected', () => {
    for (const bad of [{ phone: '123' }, { email: 'nope' }, { id: '12' }]) {
      const c = edit({ clientRowId: 9, name: 'Dana', ...bad });
      expect(c.addClientForm.invalid).withContext(JSON.stringify(bad)).toBeTrue();
    }
  });

  describe('edit-mode save button (canSave)', () => {
    const loaded = { clientRowId: 5, name: 'Dana', phone: '0501234567', email: null, id: null, address: null };

    it('is blocked when nothing changed', () => {
      expect(edit(loaded).canSave).toBeFalse();
    });

    it('is enabled after a real change on a valid form', () => {
      const c = edit(loaded);
      c.addClientForm.patchValue({ address: 'Haifa' });
      expect(c.canSave).toBeTrue();
    });

    it('is blocked again after reverting to the original values', () => {
      const c = edit(loaded);
      c.addClientForm.patchValue({ name: 'Other' });
      expect(c.canSave).toBeTrue();
      c.addClientForm.patchValue({ name: 'Dana' });
      expect(c.canSave).toBeFalse();
    });

    it('treats whitespace and empty values as unchanged', () => {
      const c = edit(loaded);
      c.addClientForm.patchValue({ name: '  Dana ', email: '   ' });
      expect(c.canSave).toBeFalse();
    });

    it('is blocked for an invalid value even though something changed', () => {
      const c = edit(loaded);
      c.addClientForm.patchValue({ phone: '123' });
      expect(c.hasChanges).toBeTrue();
      expect(c.canSave).toBeFalse();
    });

    it('saveClient does not call update when nothing changed', () => {
      const c = edit(loaded);
      const confirm = spyOn(c.confirmationService, 'confirm');
      c.saveClient();
      expect(confirm).not.toHaveBeenCalled();
    });

    it('saveClient asks for confirmation after a real change', () => {
      const c = edit(loaded);
      const confirm = spyOn(c.confirmationService, 'confirm');
      c.addClientForm.patchValue({ email: 'a@b.com' });
      c.saveClient();
      expect(confirm).toHaveBeenCalled();
    });

    it('create mode only requires a valid form', () => {
      const c = create({ businessNumber: '1' });
      expect(c.canSave).toBeFalse();
      c.addClientForm.patchValue({ name: 'New' });
      expect(c.canSave).toBeTrue();
    });
  });
});
