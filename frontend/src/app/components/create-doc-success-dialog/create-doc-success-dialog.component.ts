import { Component } from '@angular/core';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { FilesService } from 'src/app/services/files.service';
import { ButtonComponent } from "../button/button.component";

@Component({
  selector: 'app-doc-success-dialog',
  templateUrl: './create-doc-success-dialog.component.html',
  styleUrls: ['./create-doc-success-dialog.component.scss'],
  imports: [ButtonComponent]
})
export class DocSuccessDialogComponent {
  docNumber: string;
  originalFile: string;
  copyFile: string;
  docType: string;

  constructor(
    public ref: DynamicDialogRef,
    public config: DynamicDialogConfig,
    private filesService: FilesService
  ) {
    
    this.docNumber = this.config.data?.docNumber;
    this.originalFile = this.config.data?.file;
    this.copyFile = this.config.data?.copyFile;
    this.docType = this.config.data?.docType;
  }

  async downloadOriginal() {
    if (this.originalFile) {
      await this.filesService.downloadFirebaseFile(this.originalFile);
    }
  }

  async downloadCopy() {
    if (this.copyFile) {
      await this.filesService.downloadFirebaseFile(this.copyFile);
    }
  }

  close() {
    this.ref.close();
  }
}