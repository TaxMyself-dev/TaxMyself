import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { GuideSlide } from './self-employed-guide.content';

@Component({
  selector: 'app-self-employed-income-tax-slide',
  templateUrl: './self-employed-income-tax-slides.component.html',
  styleUrls: ['./self-employed-income-tax-slides.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class SelfEmployedIncomeTaxSlidesComponent {
  @Input({ required: true }) slide!: GuideSlide;
}
