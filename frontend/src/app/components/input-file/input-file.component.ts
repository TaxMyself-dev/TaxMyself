import { CommonModule } from '@angular/common';
import { Component, ViewChild, computed, inject, input, output, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { FileUpload, FileUploadModule } from 'primeng/fileupload';
import { ButtonModule } from 'primeng/button';
import { RippleModule } from 'primeng/ripple';

type UiFile = {
  id: string;
  file: File & { objectURL?: string };
};

/** Allowed inbox / expense attachment types — MIME + extension must both match. */
const ALLOWED_BY_EXT: Record<string, readonly string[]> = {
  '.pdf': ['application/pdf'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
};

export function isAllowedUploadFile(file: File): boolean {
  const name = file?.name ?? '';
  const dot = name.lastIndexOf('.');
  if (dot < 0) return false;
  const ext = name.slice(dot).toLowerCase();
  const allowedMimes = ALLOWED_BY_EXT[ext];
  if (!allowedMimes) return false;
  const mime = (file.type || '').toLowerCase().trim();
  if (!mime) return false;
  return allowedMimes.includes(mime);
}

@Component({
  selector: 'app-file-uploader-gpt',
  standalone: true,
  imports: [CommonModule, FileUploadModule, ButtonModule, RippleModule],
  templateUrl: './input-file.component.html',
  styleUrls: ['./input-file.component.scss'],
})
export class appFileUploadGptComponent {
  @ViewChild('fu') fu?: FileUpload;

  private readonly messageService = inject(MessageService);

  /** Allow multiple files */
  multiple = input<boolean>(true);

  /** Native accept string */
  accept = input<string>('.pdf,.jpg,.jpeg,.png');

  /** Text label of supported file types (UI only) */
  supportedText = input<string>('PDF, JPG, PNG');

  /** Max file size per file (PrimeNG validation) */
  maxFileSize = input<number>(10 * 1024 * 1024); // 10MB

  /** Optional label text */
  label = input<string>('גרור קובץ לכאן או ');

  selectedFiles = output<File[]>();
  /** Clickable text for picker */
  browseLabel = input<string>('העלה');

  readonly files = signal<UiFile[]>([]);
  readonly isDragging = signal(false);

  readonly hasFiles = computed(() => this.files().length > 0);

  onSelect(event: { currentFiles?: (File & { objectURL?: string })[]; files?: (File & { objectURL?: string })[] }) {
    const incoming = (event.currentFiles ?? event.files ?? []) as (File & { objectURL?: string })[];
    this.applyIncoming(incoming, /* replace */ true);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.isDragging()) this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
    const dropped = Array.from(event.dataTransfer?.files ?? []) as File[];
    if (!dropped.length) return;
    this.applyIncoming(dropped, /* replace */ false);
  }

  emitFiles() {
    this.selectedFiles.emit(this.files().map(f => f.file));
  }

  onClearFromPrime() {
    this.files.set([]);
    this.emitFiles();
  }

  openPicker() {
    const inputEl = this.fu?.el?.nativeElement?.querySelector('input[type="file"]') as HTMLInputElement | null;
    inputEl?.click();
  }

  removeFile(event: Event, id: string) {
    event.stopPropagation();

    const item = this.files().find(x => x.id === id);
    if (!item) return;

    const fuFiles = (this.fu?.files ?? []) as File[];
    const realIndex = fuFiles.findIndex(f => f === item.file);

    if (realIndex >= 0) {
      this.fu?.remove(event, realIndex);
    }

    this.files.update(prev => prev.filter(x => x.id !== id));
    this.emitFiles();
  }

  private applyIncoming(incoming: File[], replace: boolean): void {
    const valid: File[] = [];
    const rejected: string[] = [];

    for (const file of incoming) {
      if (isAllowedUploadFile(file)) {
        valid.push(file);
      } else {
        rejected.push(file.name);
      }
    }

    if (rejected.length) {
      this.messageService.add({
        severity: 'warn',
        summary: 'סוג קובץ לא נתמך',
        detail: rejected.length === 1
          ? `הקובץ "${rejected[0]}" נדחה. מותרים רק PDF, JPG, JPEG, PNG.`
          : `${rejected.length} קבצים נדחו. מותרים רק PDF, JPG, JPEG, PNG.`,
        life: 4000,
        key: 'br',
      });
    }

    if (!this.multiple()) {
      const f = valid[0];
      this.files.set(f ? [{ id: this.makeId(), file: f as File & { objectURL?: string } }] : []);
      this.syncPrimeFiles();
      this.emitFiles();
      return;
    }

    const next = replace
      ? valid
      : this.mergeUnique(this.files().map(x => x.file), valid);

    this.files.set(next.map(f => ({ id: this.makeId(), file: f as File & { objectURL?: string } })));
    this.syncPrimeFiles();
    this.emitFiles();
  }

  private mergeUnique(existing: File[], incoming: File[]): File[] {
    const key = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;
    const seen = new Set(existing.map(key));
    const merged = [...existing];
    for (const f of incoming) {
      const k = key(f);
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(f);
    }
    return merged;
  }

  private syncPrimeFiles(): void {
    if (!this.fu) return;
    this.fu.files = this.files().map(x => x.file) as File[];
  }

  private makeId(): string {
    return (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
  }
}
