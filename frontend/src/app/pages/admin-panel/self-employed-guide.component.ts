import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Output } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { GuideSlide, SELF_EMPLOYED_GUIDE_SLIDES } from './self-employed-guide.content';

@Component({
  selector: 'app-self-employed-guide',
  templateUrl: './self-employed-guide.component.html',
  styleUrls: ['./self-employed-guide.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class SelfEmployedGuideComponent {
  @Output() closeGuide = new EventEmitter<void>();

  readonly slides = SELF_EMPLOYED_GUIDE_SLIDES;
  currentSlideIndex = 0;

  get currentSlide(): GuideSlide {
    return this.slides[this.currentSlideIndex];
  }

  get progressPercent(): number {
    return ((this.currentSlideIndex + 1) / this.slides.length) * 100;
  }

  nextSlide(): void {
    if (this.currentSlideIndex < this.slides.length - 1) {
      this.currentSlideIndex += 1;
    }
  }

  previousSlide(): void {
    if (this.currentSlideIndex > 0) {
      this.currentSlideIndex -= 1;
    }
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft') {
      this.nextSlide();
      event.preventDefault();
    } else if (event.key === 'ArrowRight') {
      this.previousSlide();
      event.preventDefault();
    } else if (event.key === 'Escape') {
      this.closeGuide.emit();
    }
  }
}
