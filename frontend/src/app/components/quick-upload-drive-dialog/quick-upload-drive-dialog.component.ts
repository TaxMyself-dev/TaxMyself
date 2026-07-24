import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { DynamicDialogRef } from 'primeng/dynamicdialog';
import { finalize } from 'rxjs';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { appFileUploadGptComponent } from 'src/app/components/input-file/input-file.component';
import { InputSelectComponent } from 'src/app/components/input-select/input-select.component';
import { DriveDocsService } from 'src/app/services/drive-docs.service';
import { GenericService } from 'src/app/services/generic.service';
import { inputsSize } from 'src/app/shared/enums';

/**
 * Home "Quick Upload to Drive" dialog.
 * Reuses the shared file uploader + DriveDocsService.uploadFilesToInbox
 * (same pipeline as Settings → העלאת מסמכים ל-Drive).
 */
@Component({
  selector: 'app-quick-upload-drive-dialog',
  standalone: true,
  templateUrl: './quick-upload-drive-dialog.component.html',
  styleUrls: ['./quick-upload-drive-dialog.component.scss'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonComponent,
    InputSelectComponent,
    appFileUploadGptComponent,
  ],
})
export class QuickUploadDriveDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(DynamicDialogRef);
  private readonly driveDocsService = inject(DriveDocsService);
  private readonly messageService = inject(MessageService);
  readonly genericService = inject(GenericService);

  readonly buttonSize = ButtonSize;
  readonly buttonColor = ButtonColor;
  readonly inputSize = inputsSize;

  readonly selectedFiles = signal<File[]>([]);
  readonly isUploading = signal(false);

  readonly businessOptions = this.genericService.businessSelectItems;
  readonly showBusinessSelector = computed(() => this.businessOptions().length > 1);

  /** Tracked as a signal so Upload-button enablement reacts to selection. */
  readonly selectedBusinessNumber = signal<string | null>(
    this.businessOptions().length === 1
      ? String(this.businessOptions()[0].value)
      : null,
  );

  readonly form: FormGroup = this.fb.group({
    businessNumber: [
      this.selectedBusinessNumber(),
      Validators.required,
    ],
  });

  readonly canUpload = computed(() => {
    if (this.isUploading()) return false;
    if (this.selectedFiles().length === 0) return false;
    return !!this.selectedBusinessNumber();
  });

  onBusinessSelected(value: string | boolean): void {
    const bn = typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
    this.selectedBusinessNumber.set(bn);
  }

  onFilesSelected(files: File[]): void {
    this.selectedFiles.set(files ?? []);
  }

  upload(): void {
    if (!this.canUpload() || this.isUploading()) return;

    const businessNumber = this.selectedBusinessNumber();
    if (!businessNumber) return;

    const files = this.selectedFiles();
    this.isUploading.set(true);

    this.driveDocsService.uploadFilesToInbox(files, businessNumber).pipe(
      finalize(() => this.isUploading.set(false)),
    ).subscribe({
      next: (uploaded) => {
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: `${uploaded.length} קבצים הועלו ל-Drive בהצלחה`,
          life: 3000,
          key: 'br',
        });
        this.dialogRef.close({ uploaded: uploaded.length });
      },
      error: (err) => {
        this.messageService.add({
          severity: 'error',
          summary: 'שגיאה',
          detail: err?.error?.message
            ?? 'לא ניתן היה להעלות את הקבצים ל-Drive. נסה שוב מאוחר יותר.',
          life: 4000,
          key: 'br',
        });
      },
    });
  }

  cancel(): void {
    if (this.isUploading()) return;
    this.dialogRef.close();
  }
}
