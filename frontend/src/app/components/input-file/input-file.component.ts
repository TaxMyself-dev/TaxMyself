import { CommonModule } from '@angular/common';
import { Component, ViewChild, computed, input, output, signal } from '@angular/core';
import { FileUpload, FileUploadModule } from 'primeng/fileupload';
import { ButtonModule } from 'primeng/button';
import { RippleModule } from 'primeng/ripple';

// type SelectedFile = File & { objectURL?: string };
type UiFile = {
  id: string;
  file: File & { objectURL?: string };
};
@Component({
  selector: 'app-file-uploader-gpt',
  standalone: true,
  imports: [CommonModule, FileUploadModule, ButtonModule, RippleModule],
  templateUrl: './input-file.component.html',
  styleUrls: ['./input-file.component.scss'],
})


export class appFileUploadGptComponent {
  @ViewChild('fu') fu?: FileUpload;

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

  readonly hasFiles = computed(() => this.files().length > 0);

  // -----------------------
  // Events
  // -----------------------

  onSelect(event: { currentFiles?: (File & { objectURL?: string })[]; files?: (File & { objectURL?: string })[] }) {
    console.log("🚀 ~ appFileUploadGptComponent ~ onSelect ~ event:", event)
    const incoming = (event.currentFiles ?? event.files ?? []) as (File & { objectURL?: string })[];

    if (!this.multiple()) {
      const f = incoming[0];
      this.files.set(f ? [{ id: this.makeId(), file: f }] : []);
      return;
    }

    // Replace the list with a fresh mapped list to stay in sync with PrimeNG.
    this.files.set(incoming.map(f => ({ id: this.makeId(), file: f })));
    this.emitFiles();
  }

  emitFiles() {
    this.selectedFiles.emit(this.files().map(f => f.file));
  }

  onClearFromPrime() {
    // PrimeNG cleared its internal state
    // We must also clear our signal state
    this.files.set([]);
  }

  openPicker() {
    const inputEl = this.fu?.el?.nativeElement?.querySelector('input[type="file"]') as HTMLInputElement | null;
    inputEl?.click();
  }

  removeFile(event: Event, id: string) {
    event.stopPropagation();

    const item = this.files().find(x => x.id === id);
    if (!item) return;

    // Find the real index inside PrimeNG internal files list.
    const fuFiles = (this.fu?.files ?? []) as File[];
    const realIndex = fuFiles.findIndex(f => f === item.file);

    if (realIndex >= 0) {
      this.fu?.remove(event, realIndex);
    }

    // Remove from our UI list by id.
    this.files.update(prev => prev.filter(x => x.id !== id));
  }

  // clearAll(domEvent?: Event) {
  //   // Clear everything (useful if you add a "clear" action later).
  //   // Not shown in UI now by request.
  //   if (domEvent) domEvent.preventDefault();
  //   this.fu?.clear();
  //   this.files.set([]);
  // }

  // extOf(file: File): string {
  //   const parts = file.name.split('.');
  //   return parts.length > 1 ? (parts.at(-1) ?? '').toUpperCase() : 'FILE';
  // }

  private makeId(): string {
    // Use a stable unique id per file.
    return (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
  }
}
