import { TestBed, ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FormControl, FormGroup } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Select } from 'primeng/select';
import { InputSelectComponent } from '../../components/input-select/input-select.component';
import { SettingsNewFieldComponent } from './settings-new-field.component';

describe('new settings shared select', () => {
  let fixture: ComponentFixture<SettingsNewFieldComponent>;
  let group: FormGroup;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SettingsNewFieldComponent, NoopAnimationsModule] }).compileComponents();
    group = new FormGroup({ choice: new FormControl('first') });
    fixture = TestBed.createComponent(SettingsNewFieldComponent);
    fixture.componentRef.setInput('group', group);
    fixture.componentRef.setInput('field', { key: 'choice', label: 'תעסוקה', options: [
      { name: 'אפשרות ראשונה', value: 'first' }, { name: 'אפשרות שנייה', value: 'second' },
    ] });
    fixture.detectChanges();
    await fixture.whenStable();
  });
  afterEach(() => fixture.destroy());

  it('uses the existing searchable select and filters its real overlay', async () => {
    const shared = fixture.debugElement.query(By.directive(InputSelectComponent)).componentInstance as InputSelectComponent;
    expect(shared.filter()).toBeTrue();
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
    const select = fixture.debugElement.query(By.directive(Select)).componentInstance as Select;
    select.show();
    fixture.detectChanges();
    await fixture.whenStable();
    const filter = document.body.querySelector('.p-select-filter') as HTMLInputElement;
    expect(filter).not.toBeNull();
    filter.value = 'שנייה';
    filter.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    const options = Array.from(document.body.querySelectorAll('.p-select-option'));
    expect(options.length).toBe(1);
    expect(options[0].textContent).toContain('שנייה');
    const changed = spyOn(fixture.componentInstance.valueChanged, 'emit');
    (options[0] as HTMLElement).click();
    fixture.detectChanges();
    expect(group.get('choice')!.value).toBe('second');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('preserves boolean option values rather than converting false to a string', async () => {
    fixture.componentRef.setInput('field', { key: 'choice', label: 'ביטוח לאומי', options: [
      { name: 'חייב', value: true }, { name: 'לא חייב', value: false },
    ] });
    group.get('choice')!.setValue(true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.debugElement.query(By.directive(Select)).componentInstance.show();
    fixture.detectChanges();
    await fixture.whenStable();
    const options = document.body.querySelectorAll('.p-select-option');
    (options[1] as HTMLElement).click();
    fixture.detectChanges();
    expect(group.get('choice')!.value).toBeFalse();
  });

  it('propagates disabled state and shows plain text in read-only mode', async () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(group.get('choice')!.disabled).toBeTrue();
    fixture.componentRef.setInput('readonly', true);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.directive(InputSelectComponent))).toBeNull();
    expect(fixture.nativeElement.querySelector('.value').textContent).toContain('אפשרות ראשונה');
  });
});