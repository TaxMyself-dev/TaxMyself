import { TestBed } from '@angular/core/testing';
import { SelfEmployedGuideComponent } from './self-employed-guide.component';

describe('National Insurance guide interaction', () => {
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
