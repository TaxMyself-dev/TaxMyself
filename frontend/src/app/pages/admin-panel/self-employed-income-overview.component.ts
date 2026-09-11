import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { GuideSlide } from './self-employed-guide.content';

@Component({
  selector: 'app-self-employed-income-overview',
  templateUrl: './self-employed-income-overview.component.html',
  styleUrls: ['./self-employed-income-overview.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class SelfEmployedIncomeOverviewComponent {
  @Input({ required: true }) slide!: GuideSlide;
}
