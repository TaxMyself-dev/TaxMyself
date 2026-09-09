import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { SelfEmployedGuideComponent } from './self-employed-guide.component';

@Component({
  selector: 'app-admin-content',
  templateUrl: './admin-content.component.html',
  styleUrls: ['./admin-content.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, SelfEmployedGuideComponent],
})
export class AdminContentComponent {
  guideOpen = false;

  openGuide(): void {
    this.guideOpen = true;
  }

  closeGuide(): void {
    this.guideOpen = false;
  }
}
