import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import type { DocumentationModule, DocumentationTopic } from './admin-documentation.component';

@Component({
  selector: 'app-documentation-topic',
  templateUrl: './documentation-topic.component.html',
  styleUrls: ['./documentation-topic.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class DocumentationTopicComponent {
  @Input({ required: true }) module!: DocumentationModule;
  @Input({ required: true }) topic!: DocumentationTopic;
  @Output() topicSelected = new EventEmitter<DocumentationTopic>();

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }
}
