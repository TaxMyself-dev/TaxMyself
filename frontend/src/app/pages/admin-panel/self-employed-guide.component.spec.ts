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
    expect(component.currentSlideIndex).toBe(3);
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
      'obligations-map',
    ]);
    expect(component.slides[1].items?.map(item => item.label)).toEqual([
      'בעל עסק זעיר',
      'עוסק פטור',
      'עוסק מורשה',
      'חברה',
    ]);
  });
});
