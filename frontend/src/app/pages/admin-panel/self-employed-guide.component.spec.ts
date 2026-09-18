import { SelfEmployedGuideComponent } from './self-employed-guide.component';

describe('SelfEmployedGuideComponent', () => {
  let component: SelfEmployedGuideComponent;

  beforeEach(() => {
    component = new SelfEmployedGuideComponent();
  });

  it('keeps previous and next navigation within the slide range', () => {
    component.previousSlide();
    expect(component.currentSlideIndex).toBe(0);

    component.nextSlide();
    component.nextSlide();
    component.nextSlide();
    component.nextSlide();
    component.nextSlide();
    component.nextSlide();
    component.nextSlide();
    component.nextSlide();
    for (let index = 0; index < component.slides.length; index++) component.nextSlide();
    expect(component.currentSlideIndex).toBe(component.slides.length - 1);
  });

  it('uses RTL keyboard navigation', () => {
    component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(component.currentSlideIndex).toBe(1);

    component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(component.currentSlideIndex).toBe(0);
  });

  it('presents the requested introductory sequence', () => {
    expect(component.slides.map(slide => slide.id)).toEqual([
      'cover',
      'business-types',
      'tax-authorities',
      'income-tax-overview',
      'status-comparison',
      'micro-blockers',
      'income-combination',
      'tax-simulator',
      'advances-introduction',
      'advances-calculation',
      'advances-adjustment',
      'advances-payment',
      'micro-reporting',
      'income-tax-summary',
      'vat-introduction',
      'vat-calculation',
      'ni-status',
      'ni-payment',
      'ni-calculator',
    ]);
    expect(component.slides[1].items?.map(item => item.label)).toEqual([
      'בעל עסק זעיר',
      'עוסק פטור',
      'עוסק מורשה',
      'חברה',
    ]);
  });

  it('opens the Income Tax chapter from the authorities slide', () => {
    component.goToSlide('income-tax-overview');
    expect(component.currentSlide.id).toBe('income-tax-overview');

    component.goToSlide(undefined);
    expect(component.currentSlide.id).toBe('income-tax-overview');
  });

  it('does not navigate when a simulator input uses arrow keys', () => {
    const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true });
    Object.defineProperty(event, 'target', { value: document.createElement('input') });
    component.onKeydown(event);
    expect(component.currentSlideIndex).toBe(0);
    expect(event.defaultPrevented).toBeFalse();
  });

  it('ends with the existing simulator and includes five approved new artworks', () => {
    expect(component.slides.filter(slide => slide.layout === 'approved-artwork').length).toBe(9);
    expect(component.slides.every(slide => slide.layout !== 'approved-artwork' || (slide.artwork && slide.artworkAlt))).toBeTrue();
    component.goToSlide('income-tax-summary');
    expect(component.currentSlide.layout).toBe('tax-simulator');
    expect(component.progressPercent).toBeLessThan(100);
    component.goToSlide('ni-calculator');
    expect(component.progressPercent).toBe(100);
  });

  it('keeps the approved slide wording without added cover copy', () => {
    expect(component.slides[0].title).toBe('אפשר גם אחרת');
    expect(component.slides[0].subtitle).toBeUndefined();
    expect(component.slides[1].title).toBe('כל השבילים מובילים למס הכנסה');
    expect(component.slides[2].title).toBe('על שלושה גופים העולם עומד');
    expect(component.slides[5].title).toBe('לא כל עסק קטן נכנס למסלול הזעיר');
    expect(component.slides[6].title).toBe('שכיר וגם עצמאי? בסוף הכל נפגש');
  });
});
