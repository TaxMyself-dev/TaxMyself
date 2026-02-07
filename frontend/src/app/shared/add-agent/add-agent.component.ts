import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminPanelService } from 'src/app/services/admin-panel.service';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { ButtonSize, ButtonColor } from 'src/app/components/button/button.enum';
import { InputTextComponent } from 'src/app/components/input-text/input-text.component';
import { AgentCredentialsModalComponent } from 'src/app/components/agent-credentials-modal/agent-credentials-modal.component';
import { MessageService } from 'primeng/api';
import { catchError, EMPTY, finalize } from 'rxjs';

@Component({
  selector: 'app-add-agent',
  templateUrl: './add-agent.component.html',
  styleUrls: ['./add-agent.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonComponent,
    InputTextComponent,
    AgentCredentialsModalComponent
  ]
})
export class AddAgentComponent implements OnInit {
  formBuilder = inject(FormBuilder);
  adminPanelService = inject(AdminPanelService);
  messageService = inject(MessageService);

  agentForm: FormGroup;
  isLoading = signal<boolean>(false);
  showCredentialsModal = signal<boolean>(false);
  credentials = signal<{ apiKey: string; secret: string } | null>(null);

  buttonSize = ButtonSize;
  buttonColor = ButtonColor;

  constructor() {
    this.agentForm = this.formBuilder.group({
      name: new FormControl('', [Validators.required, Validators.minLength(1)])
    });
  }

  ngOnInit() {}

  onSubmit(): void {
    if (this.agentForm.invalid) {
      this.messageService.add({
        severity: 'error',
        summary: 'שגיאה',
        detail: 'אנא הזן שם סוכן',
        life: 3000,
        key: 'br'
      });
      return;
    }

    const name = this.agentForm.get('name')?.value?.trim();
    if (!name) {
      this.messageService.add({
        severity: 'error',
        summary: 'שגיאה',
        detail: 'אנא הזן שם סוכן תקין',
        life: 3000,
        key: 'br'
      });
      return;
    }

    this.isLoading.set(true);

    this.adminPanelService.addAgent(name)
      .pipe(
        finalize(() => this.isLoading.set(false)),
        catchError((err) => {
          console.error('Error adding agent:', err);
          this.messageService.add({
            severity: 'error',
            summary: 'שגיאה',
            detail: err.error?.message || 'לא הצלחנו להוסיף את הסוכן. אנא נסה שוב מאוחר יותר.',
            life: 5000,
            key: 'br'
          });
          return EMPTY;
        })
      )
      .subscribe({
        next: (response) => {
          if (response?.apiKey && response?.secret) {
            this.credentials.set({
              apiKey: response.apiKey,
              secret: response.secret
            });
            this.showCredentialsModal.set(true);
            this.agentForm.reset();
          } else {
            this.messageService.add({
              severity: 'error',
              summary: 'שגיאה',
              detail: 'התקבלה תגובה לא תקינה מהשרת',
              life: 5000,
              key: 'br'
            });
          }
        }
      });
  }

  onCredentialsModalClose(event: { visible: boolean }): void {
    this.showCredentialsModal.set(false);
    // Clear credentials after modal is closed
    this.credentials.set(null);
  }
}

