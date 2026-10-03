import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Output, ViewChild } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { GuideSlide, SELF_EMPLOYED_GUIDE_SLIDES } from './self-employed-guide.content';
import { SelfEmployedTaxSimulatorComponent } from './self-employed-tax-simulator.component';
import { GuideNationalInsuranceComponent } from './guide-national-insurance.component';
import { GuideExpenseSavingsComponent } from './guide-expense-savings.component';
import { GuideStudyComparisonComponent } from './guide-study-comparison.component';

@Component({
  selector: 'app-self-employed-guide',
  templateUrl: './self-employed-guide.component.html',
  styleUrls: ['./self-employed-guide.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, SelfEmployedTaxSimulatorComponent, GuideNationalInsuranceComponent, GuideExpenseSavingsComponent, GuideStudyComparisonComponent],
})
export class SelfEmployedGuideComponent {
  @Output() closeGuide = new EventEmitter<void>();
  @ViewChild('presentationRoot') presentationRoot?: ElementRef<HTMLElement>;

  readonly chapterIds = {
    income: ['income-combination', 'advances-introduction', 'advances-calculation', 'advances-payment', 'micro-reporting', 'tax-simulator'],
    vat: ['vat-introduction', 'vat-calculation'],
    ni: ['ni-status', 'ni-payment', 'ni-calculator'],
  };
  readonly mainIds = ['cover', 'basic-concepts', 'employee-payroll', 'business-types', 'income-tax-overview', 'status-comparison', 'micro-blockers', 'tax-authorities', 'study-fund', 'study-comparison', 'pension', 'pension-tax-benefits', 'expense-principle', 'expense-depreciation', 'expense-savings', 'product-pain', 'product-solution'];
  activeChapter: 'income' | 'vat' | 'ni' | null = null;

  get slides(): GuideSlide[] {
    const ids = this.activeChapter ? this.chapterIds[this.activeChapter] : this.mainIds;
    return ids.map(id => SELF_EMPLOYED_GUIDE_SLIDES.find(slide => slide.id === id)!);
  }

  get isLastMainSlide(): boolean {
    return !this.activeChapter && this.currentSlideIndex === this.slides.length - 1;
  }

  openChapter(chapter: 'income' | 'vat' | 'ni'): void {
    this.activeChapter = chapter;
    this.currentSlideIndex = 0;
  }

  returnToAuthorities(): void {
    this.activeChapter = null;
    this.currentSlideIndex = this.mainIds.indexOf('tax-authorities');
  }
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
    } else if (this.activeChapter) {
      this.returnToAuthorities();
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

    if (!SELF_EMPLOYED_GUIDE_SLIDES.some(slide => slide.id === slideId)) return;
    this.activeChapter = (Object.keys(this.chapterIds) as Array<'income' | 'vat' | 'ni'>)
      .find(chapter => this.chapterIds[chapter].includes(slideId)) ?? null;
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
      if (this.activeChapter) this.returnToAuthorities();
      else this.closeGuide.emit();
    }
  }
}
