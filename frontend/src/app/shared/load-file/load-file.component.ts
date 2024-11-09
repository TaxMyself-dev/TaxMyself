import { Component, Input, OnInit, OnChanges, SimpleChanges, inject } from '@angular/core';
import { ButtonClass, ButtonSize } from 'src/app/shared/button/button.enum';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { TransactionsService } from 'src/app/pages/transactions/transactions.page.service';
import { finalize, Subject, takeUntil } from 'rxjs';




@Component({
  selector: 'app-load-file',
  templateUrl: './load-file.component.html',
  styleUrls: ['./load-file.component.scss']
})
export class LoadFileComponent implements OnInit, OnChanges {

  // @Input() blocksData: any[] = [];
  // @Input() updateFunction: (data: any) => void;  // Accept a generic update function
  // @Input() fieldMapping: { [key: string]: any };  // Field mapping input

  selectedFile: File = null;
  destroy$ = new Subject<void>();
  messageToast: string = "";
  isToastOpen: boolean = false;
  readonly buttonSize = ButtonSize;
  readonly ButtonClass = ButtonClass;
  expenseDataService = inject(ExpenseDataService);
  transactionsService = inject(TransactionsService);


  constructor() {}

  ngOnInit() {
  }


  ngOnChanges(changes: SimpleChanges): void {
  }


  onFileSelected(event: any): void {
    console.log("in file");
    this.selectedFile = event.target.files[0];
    console.log(this.selectedFile);
  }


  onUpload(): void {
    if (this.selectedFile) {
      this.expenseDataService.getLoader().subscribe()
      const reader = new FileReader();

      reader.onload = (e) => {
        const arrayBuffer = reader.result;
        console.log("array buffer: ", arrayBuffer);

        this.transactionsService.uploadFile(arrayBuffer as ArrayBuffer)
          .pipe(
            finalize(() => this.expenseDataService.dismissLoader()),
            takeUntil(this.destroy$))
          .subscribe(
            (response) => {
              this.messageToast = `הקובץ ${this.selectedFile.name} הועלה בהצלחה`;
              this.isToastOpen = true;
              console.log(response.message);
              // Handle successful response
            },
            error => {
              console.error('Error uploading file', error);
              // Handle error response
              alert("העלאת קובץ נכשלה. אנא בחר קובץ תקין או נסה מאוחר יותר")
            }
            );
      };

      reader.readAsArrayBuffer(this.selectedFile);
    } else {
      console.error('No file selected.');
      alert("אנא בחר קובץ")
    }
  }
  









 










}
