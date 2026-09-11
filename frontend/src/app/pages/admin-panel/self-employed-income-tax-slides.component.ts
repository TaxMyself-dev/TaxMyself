import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { GuideSlide } from './self-employed-guide.content';
import { SelfEmployedIncomeFlowComponent } from './self-employed-income-flow.component';
import { SelfEmployedIncomeOverviewComponent } from './self-employed-income-overview.component';

@Component({
  selector: 'app-self-employed-income-tax-slide',
  templateUrl: './self-employed-income-tax-slides.component.html',
  styleUrls: ['./self-employed-income-tax-slides.component.scss'],
  standalone: true,
  imports: [CommonModule, SelfEmployedIncomeOverviewComponent, SelfEmployedIncomeFlowComponent],
})
export class SelfEmployedIncomeTaxSlidesComponent {
  @Input({ required: true }) slide!: GuideSlide;
}
