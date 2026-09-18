import { TestBed } from '@angular/core/testing';
import { SelfEmployedGuideComponent } from './self-employed-guide.component';

describe('National Insurance guide interaction', () => {
  it('allows money changes only through bounded 1000–50000 sliders', async () => {
    await TestBed.configureTestingModule({ imports: [SelfEmployedGuideComponent] }).compileComponents();
    const fixture = TestBed.createComponent(SelfEmployedGuideComponent);
    fixture.componentInstance.goToSlide('ni-calculator');
    fixture.detectChanges();
    for (const id of ['ni-profit', 'ni-salary']) {
      const slider: HTMLInputElement = fixture.nativeElement.querySelector('#' + id);
      expect(slider.type).toBe('range');
      expect(slider.min).toBe('1000');
      expect(slider.max).toBe('50000');
      for (const value of ['1000', '50000']) {
        slider.value = value;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        fixture.detectChanges();
        const output = fixture.nativeElement.querySelector('output[for="' + id + '"]');
        expect(output.textContent).toContain(value === '1000' ? '1,000' : '50,000');
      }
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      expect(fixture.componentInstance.currentSlide.id).toBe('ni-calculator');
    }
    expect(fixture.nativeElement.querySelectorAll('.ni-slide input[type="number"]').length).toBe(1);
    expect(fixture.nativeElement.querySelector('#ni-hours').type).toBe('number');
    fixture.destroy();
  });
  it('updates the live result, retains values across navigation and protects input arrows', async () => {
    await TestBed.configureTestingModule({ imports: [SelfEmployedGuideComponent] }).compileComponents();
    const fixture = TestBed.createComponent(SelfEmployedGuideComponent);
    const guide = fixture.componentInstance;
    guide.goToSlide('ni-calculator');
    fixture.detectChanges();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('#ni-hours');
    expect(fixture.nativeElement.querySelector('.status').textContent).toContain('אינו עונה');
    input.value = '20';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.status').textContent).toContain('עצמאי שעונה');
    const arrow = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true });
    input.dispatchEvent(arrow);
    expect(guide.currentSlide.id).toBe('ni-calculator');
    guide.previousSlide();
    fixture.detectChanges();
    guide.nextSlide();
    fixture.detectChanges();
    expect(input.value).toBe('20');
    expect(fixture.nativeElement.querySelector('.amount b').textContent.trim()).not.toBe('0');
    fixture.destroy();
  });
});
