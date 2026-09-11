import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { GuideSlide } from './self-employed-guide.content';

@Component({
  selector: 'app-self-employed-opening-slide',
  templateUrl: './self-employed-opening-slide.component.html',
  styleUrls: ['./self-employed-opening-slide.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class SelfEmployedOpeningSlideComponent {
  @Input({ required: true }) slide!: GuideSlide;
  @Output() navigate = new EventEmitter<string | undefined>();
}
