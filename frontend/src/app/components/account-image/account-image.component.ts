import { CommonModule } from "@angular/common";
import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  inject,
} from "@angular/core";
import { Subscription } from "rxjs";
import {
  AccountImagesService,
  accountImageError,
} from "src/app/services/account-images.service";

@Component({
  selector: "app-account-image",
  standalone: true,
  imports: [CommonModule],
  template: ` <div class="image-editor" [attr.aria-busy]="busy">
    <img
      *ngIf="url"
      [src]="url"
      [alt]="label"
      [class.profile]="businessId == null"
    />
    <span *ngIf="!url" class="placeholder" aria-hidden="true">{{
      editable ? label : fallback
    }}</span>
    <div *ngIf="editable">
      <input
        #picker
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        (change)="select(picker)"
      />
      <button
        type="button"
        [disabled]="busy || disabled"
        (click)="picker.click()"
      >
        {{ url ? "החלפת תמונה" : "בחירת תמונה" }}
      </button>
      <button
        *ngIf="pending"
        type="button"
        [disabled]="busy || disabled"
        (click)="save()"
      >
        שמירת תמונה
      </button>
      <button
        *ngIf="pending"
        type="button"
        [disabled]="busy"
        (click)="cancel()"
      >
        ביטול
      </button>
      <button
        *ngIf="imagePath && !pending"
        type="button"
        [disabled]="busy || disabled"
        (click)="remove()"
      >
        הסרת תמונה
      </button>
      <p>
        PNG, JPEG או WebP, עד 5MB{{
          businessId == null ? " · התמונה תיחתך לריבוע במרכז" : ""
        }}
      </p>
    </div>
    <span *ngIf="busy && editable" role="status">טוען…</span>
    <p *ngIf="error && editable" role="alert">{{ error }}</p>
  </div>`,
  styles: [
    `
      :host {
        display: inline-block;
      }
      .image-editor {
        display: flex;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
        margin: 12px 0;
      }
      .image-editor img {
        width: 96px;
        height: 96px;
        object-fit: cover;
        object-position: center;
        border-radius: 50%;
      }
      .image-editor img.profile {
        border-radius: 50%;
        object-fit: cover;
      }
      .placeholder {
        display: grid;
        place-items: center;
        width: 64px;
        height: 64px;
        flex: 0 0 64px;
        box-sizing: border-box;
        padding: 8px;
        text-align: center;
        white-space: normal;
        overflow-wrap: anywhere;
        font-size: 14px;
        line-height: 1.25;
        background: #edf2f0;
        border-radius: 50%;
        color: #526660;
      }
      button {
        margin: 4px;
        padding: 7px 12px;
        border: 1px solid #a8bcb3;
        border-radius: 6px;
        background: white;
      }
      p {
        font-size: 12px;
        margin: 5px 0;
      }
      :host-context(.my-account-avatar) .image-editor {
        margin: 0;
      }
      :host-context(.my-account-avatar) .placeholder {
        font-size: 24px;
      }
      :host-context(.my-account-avatar) img {
        width: 64px;
        height: 64px;
      }
    `,
  ],
})
export class AccountImageComponent implements OnChanges, OnDestroy {
  @Input() businessId?: number;
  @Input() imagePath?: string | null;
  @Input() contextKey = "";
  @Input() label = "תמונת פרופיל";
  @Input() fallback = "●";
  @Input() editable = false;
  @Input() disabled = false;
  @Output() imageChanged = new EventEmitter<string | null>();
  private readonly images = inject(AccountImagesService);
  private request?: Subscription;
  private generation = 0;
  url = "";
  busy = false;
  error = "";
  pending?: File;
  ngOnChanges(changes: SimpleChanges): void {
    if (changes["imagePath"] || changes["businessId"] || changes["contextKey"])
      this.reload();
  }
  private replaceUrl(blob?: Blob): void {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = blob ? URL.createObjectURL(blob) : "";
  }
  private reload(): void {
    this.generation++;
    this.request?.unsubscribe();
    this.pending = undefined;
    this.error = "";
    this.busy = false;
    this.replaceUrl();
    if (!this.imagePath) return;
    this.busy = true;
    this.request = this.images.load(this.businessId).subscribe({
      next: (blob) => {
        this.replaceUrl(blob);
        this.busy = false;
      },
      error: (err) => {
        this.busy = false;
        if (err.status !== 404)
          this.error = "לא ניתן לטעון את התמונה. נסה שוב.";
      },
    });
  }
  async select(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = "";
    if (!file || this.busy || this.disabled) return;
    this.error = accountImageError(file) || "";
    if (this.error) return;
    const generation = this.generation;
    this.busy = true;
    try {
      const bitmap = await createImageBitmap(file);
      try {
        if (
          !bitmap.width ||
          !bitmap.height ||
          bitmap.width * bitmap.height > 16_000_000
        )
          throw new Error("dimensions");
        let selected = file;
        if (this.businessId == null) {
          const side = Math.min(bitmap.width, bitmap.height);
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = Math.min(side, 1024);
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("canvas");
          ctx.drawImage(
            bitmap,
            (bitmap.width - side) / 2,
            (bitmap.height - side) / 2,
            side,
            side,
            0,
            0,
            canvas.width,
            canvas.height
          );
          const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error("image"))),
              "image/png"
            )
          );
          selected = new File([blob], "profile.png", { type: "image/png" });
          const error = accountImageError(selected);
          if (error) throw new Error(error);
        }
        if (generation !== this.generation) return;
        this.pending = selected;
        this.replaceUrl(selected);
      } finally {
        bitmap.close();
      }
    } catch {
      if (generation === this.generation)
        this.error =
          "לא ניתן לפתוח את התמונה. בחר תמונה אחרת (עד 16 מיליון פיקסלים).";
    } finally {
      if (generation === this.generation) this.busy = false;
    }
  }
  cancel(): void {
    this.reload();
  }
  save(): void {
    if (!this.pending || this.busy || this.disabled) return;
    this.mutate(this.images.upload(this.pending, this.businessId));
  }
  remove(): void {
    if (!this.imagePath || this.busy || this.disabled) return;
    this.mutate(this.images.remove(this.businessId));
  }
  private mutate(result: ReturnType<AccountImagesService["remove"]>): void {
    this.busy = true;
    this.error = "";
    this.request = result.subscribe({
      next: (response) => {
        this.busy = false;
        this.pending = undefined;
        this.imagePath = response.imagePath;
        if (!response.imagePath) this.replaceUrl();
        this.imageChanged.emit(response.imagePath);
      },
      error: () => {
        this.busy = false;
        this.error = "לא ניתן לשמור את התמונה. נסה שוב.";
      },
    });
  }
  ngOnDestroy(): void {
    this.generation++;
    this.request?.unsubscribe();
    this.replaceUrl();
  }
}
