import { Component, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonComponent } from '../button/button.component';
import { ButtonSize, ButtonColor } from '../button/button.enum';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-agent-credentials-modal',
  templateUrl: './agent-credentials-modal.component.html',
  styleUrls: ['./agent-credentials-modal.component.scss'],
  standalone: true,
  imports: [CommonModule, ButtonComponent]
})
export class AgentCredentialsModalComponent {
  messageService = inject(MessageService);
  
  isVisible = input<boolean>(false);
  apiKey = input<string>('');
  secret = input<string>('');
  
  visibleChange = output<{ visible: boolean }>();

  buttonSize = ButtonSize;
  buttonColor = ButtonColor;

  onClose(): void {
    this.visibleChange.emit({ visible: false });
  }

  onDialogContentClick(event: Event): void {
    event.stopPropagation();
  }

  copyToClipboard(text: string, label: string): void {
    if (!text) return;
    
    navigator.clipboard.writeText(text).then(() => {
      this.messageService.add({
        severity: 'success',
        summary: 'הועתק',
        detail: `${label} הועתק ללוח`,
        life: 2000,
        key: 'br'
      });
    }).catch((err) => {
      console.error('Failed to copy:', err);
      this.messageService.add({
        severity: 'error',
        summary: 'שגיאה',
        detail: 'לא הצלחנו להעתיק ללוח',
        life: 3000,
        key: 'br'
      });
    });
  }
}

