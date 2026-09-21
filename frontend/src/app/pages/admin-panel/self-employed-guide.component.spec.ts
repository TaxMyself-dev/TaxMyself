import { SelfEmployedGuideComponent } from './self-employed-guide.component';
import { SELF_EMPLOYED_GUIDE_SLIDES } from './self-employed-guide.content';

describe('SelfEmployedGuideComponent', () => {
  let component: SelfEmployedGuideComponent;
  beforeEach(() => component = new SelfEmployedGuideComponent());
  it('orders the main sequence and stops at the authorities hub', () => {
    expect(component.slides[2].title).toBe('המעסיק מטפל בהכל');
    expect(component.slides.map(s => s.id)).toEqual(['cover', 'basic-concepts', 'employee-payroll', 'business-types', 'income-tax-overview', 'status-comparison', 'micro-blockers', 'tax-authorities']);
    component.previousSlide();
    expect(component.currentSlideIndex).toBe(0);
    for (let i = 0; i < 12; i++) component.nextSlide();
    expect(component.currentSlideIndex).toBe(7);
    expect(component.isLastMainSlide).toBeTrue();
  });
  for (const chapter of ['income', 'vat', 'ni'] as const) {
    it(`bounds ${chapter} navigation and returns after its last slide`, () => {
      component.openChapter(chapter);
      component.previousSlide();
      expect(component.currentSlideIndex).toBe(0);
      expect(component.currentSlide.id).toBe(component.chapterIds[chapter][0]);
      const count = component.slides.length;
      for (let i = 1; i < count; i++) component.nextSlide();
      expect(component.progressPercent).toBe(100);
      expect(component.isLastMainSlide).toBeFalse();
      component.nextSlide();
      expect(component.activeChapter).toBeNull();
      expect(component.currentSlide.id).toBe('tax-authorities');
      expect(component.currentSlideIndex).toBe(7);
    });
    it(`returns from every ${chapter} slide and restarts on reentry`, () => {
      for (const id of component.chapterIds[chapter]) {
        component.goToSlide(id);
        expect(component.activeChapter).toBe(chapter);
        component.returnToAuthorities();
        expect(component.currentSlideIndex).toBe(7);
        component.openChapter(chapter);
        expect(component.currentSlideIndex).toBe(0);
      }
    });
  }
  it('assigns all 21 slides exactly once and opens income at combined income', () => {
    const ids = [...component.mainIds, ...Object.values(component.chapterIds).flat()];
    expect(new Set(ids).size).toBe(21);
    expect([...ids].sort()).toEqual(SELF_EMPLOYED_GUIDE_SLIDES.map(s => s.id).sort());
    component.openChapter('income');
    expect(component.currentSlide.id).toBe('income-combination');
    component.nextSlide();
    component.previousSlide();
    expect(component.currentSlide.title).toBe('שכיר וגם עצמאי? בסוף שנה הכל נפגש');
  });
  it('ignores invalid targets and respects RTL keys and inputs', () => {
    component.goToSlide(undefined);
    component.goToSlide('unknown');
    expect(component.currentSlideIndex).toBe(0);
    component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(component.currentSlideIndex).toBe(1);
    component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(component.currentSlideIndex).toBe(0);
    const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true });
    Object.defineProperty(event, 'target', { value: document.createElement('input') });
    component.onKeydown(event);
    expect(component.currentSlideIndex).toBe(0);
    expect(event.defaultPrevented).toBeFalse();
  });
  it('returns on Escape inside a chapter without closing the guide', () => {
    spyOn(component.closeGuide, 'emit');
    component.openChapter('vat');
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.currentSlide.id).toBe('tax-authorities');
    expect(component.closeGuide.emit).not.toHaveBeenCalled();
  });
});
