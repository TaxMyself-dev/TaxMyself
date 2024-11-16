import { Component, Input, OnInit, OnChanges, SimpleChanges, inject, Output, EventEmitter } from '@angular/core';
import { ButtonClass, ButtonSize } from 'src/app/shared/button/button.enum';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { TransactionsService } from 'src/app/pages/transactions/transactions.page.service';
import { catchError, EMPTY, finalize, Subject, takeUntil } from 'rxjs';
import { GenericService } from 'src/app/services/generic.service';
import { FilesService } from 'src/app/services/files.service';




@Component({
  selector: 'app-load-file',
  templateUrl: './load-file.component.html',
  styleUrls: ['./load-file.component.scss']
})
export class LoadFileComponent implements OnInit, OnChanges {

  // @Input() blocksData: any[] = [];
  // @Input() updateFunction: (data: any) => void;  // Accept a generic update function
  // @Input() fieldMapping: { [key: string]: any };  // Field mapping input

  @Input() relativeUrl: string;
  @Output() onSend = new EventEmitter<{ status: boolean, message: string }>();

  // readonly buttonClass = ButtonClass;
  // readonly buttonSize = ButtonSize;
  selectedFile: File = null;
  isLoading: boolean = false;
  faildUpload: boolean = false;
  destroy$ = new Subject<void>();
  messageToast: string = "";
  isToastOpen: boolean = false;
  readonly buttonSize = ButtonSize;
  readonly buttonClass = ButtonClass;


  constructor(private filesService: FilesService, private genericService: GenericService) { }

  ngOnInit() {
  }
  null

  ngOnChanges(changes: SimpleChanges): void {
  }


  onFileSelected(event: any): void {
    console.log("in file");
    this.selectedFile = event.target.files[0];
    event.target.value = "";
    console.log(this.selectedFile);
  }

  onUpload(): void {
    
    this.isLoading = true;
    //this.genericService.getLoader().subscribe();
    this.filesService.uploadExcelFile(this.selectedFile, `transactions/${this.relativeUrl}`)
      .pipe(
        finalize(() => {
          this.genericService.dismissLoader();
          this.isLoading = false;
        }),
        catchError((err) => {
          console.log("in error load file", err);
          this.faildUpload = true;
          return EMPTY;
        })
      )
      .subscribe((res) => {
        console.log(res);
        this.selectedFile = null
        this.isToastOpen = true;
        this.messageToast = res.message;
      })

  }

  cancelError(): void {
    this.faildUpload = false;
  }

  deleteSelectedFile(): void {
    console.log("in del");
    
    this.selectedFile = null
  }

  setCloseToast(): void {
    this.isToastOpen = false;
  }

}
