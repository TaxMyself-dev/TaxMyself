import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Output, ViewChild } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { GuideSlide, SELF_EMPLOYED_GUIDE_SLIDES } from './self-employed-guide.content';
import { SelfEmployedTaxSimulatorComponent } from './self-employed-tax-simulator.component';
import { GuideNationalInsuranceComponent } from './guide-national-insurance.component';

@Component({
  selector: 'app-self-employed-guide',
  templateUrl: './self-employed-guide.component.html',
  styleUrls: ['./self-employed-guide.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, SelfEmployedTaxSimulatorComponent, GuideNationalInsuranceComponent],
})
export class SelfEmployedGuideComponent {
  @Output() closeGuide = new EventEmitter<void>();
  @ViewChild('presentationRoot') presentationRoot?: ElementRef<HTMLElement>;

  readonly slides = SELF_EMPLOYED_GUIDE_SLIDES;
  currentSlideIndex = 0;
  isFullscreen = false;

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

  goToSlide(slideId: string | undefined): void {
    if (!slideId) {
      return;
    }

    const slideIndex = this.slides.findIndex(slide => slide.id === slideId);
    if (slideIndex >= 0) {
      this.currentSlideIndex = slideIndex;
    }
  }

  async toggleFullscreen(): Promise<void> {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    const presentation = this.presentationRoot?.nativeElement;
    if (presentation?.requestFullscreen) {
      await presentation.requestFullscreen();
    }
  }

  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    this.isFullscreen = Boolean(document.fullscreenElement);
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) {
      return;
    }
    if (event.key === 'ArrowLeft') {
      this.nextSlide();
      event.preventDefault();
    } else if (event.key === 'ArrowRight') {
      this.previousSlide();
      event.preventDefault();
    } else if (event.key === 'Escape' && !document.fullscreenElement) {
      this.closeGuide.emit();
    }
  }
}
